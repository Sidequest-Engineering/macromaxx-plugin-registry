import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Updater, BaseFetcher } from 'tuf-js';
import { DownloadHTTPError } from 'tuf-js/dist/error.js';
import { validateCatalog } from '@macromaxx/plugin-sdk/contracts';
import { canonicalize } from '@tufjs/canonical-json';
import { sha256, verifyPublicationHistory } from './repository.js';
import { assertLivePublication } from './release-gates.js';
import { rootFingerprint } from './release-gates.js';
import { isDeepStrictEqual } from 'node:util';

export function assessPublishedHealth({ live, publication, now }) {
  try { assertLivePublication(live, publication); return assessHealth({ configured: true, validUntil: live.validUntil, now }); }
  catch (error) { return assessHealth({ configured: true, error: error.message, now }); }
}

export async function publicationIdentity(directory, root) {
  const state = await verifyPublicationHistory(directory, root);
  const timestamp = JSON.parse(await fs.readFile(path.join(directory, 'metadata/timestamp.json')));
  const targets = JSON.parse(await fs.readFile(path.join(directory, `metadata/${state.version}.targets.json`)));
  const catalog = targets.signed.targets['catalog.json'];
  if (!catalog?.hashes?.sha256) throw new Error('Publication has no authenticated catalog identity.');
  return { metadataVersion: state.version, timestampSha256: sha256(Buffer.from(canonicalize(timestamp))), catalogSha256: catalog.hashes.sha256 };
}

export function assessHealth({ configured, validUntil, error, now = Date.now() }) {
  if (!configured) return { kind: 'pending', message: 'Production activation is pending operator key custody/deployment.' };
  if (error) return { kind: 'error', message: String(error).slice(0, 500) };
  if (!Number.isFinite(validUntil) || validUntil <= now) return { kind: 'error', message: 'Registry trust is expired or has invalid expiry.' };
  if (validUntil - now <= 6 * 3600000) return { kind: 'warning', message: 'Signed registry trust expires within six hours: ' + new Date(validUntil).toISOString() };
  return { kind: 'healthy', message: 'Signed registry verified; expires ' + new Date(validUntil).toISOString() };
}

export function incidentActions(health, issues) {
  const open = issues.filter(issue => issue.state === 'open');
  if (health.kind === 'pending') return [];
  if (health.kind === 'healthy') return open.map(issue => ({ action: 'close', number: issue.number }));
  if (!open.length) return [{ action: 'create', message: health.message }];
  return [
    ...(open[0].message === health.message ? [] : [{ action: 'update', number: open[0].number, message: health.message }]),
    ...open.slice(1).map(issue => ({ action: 'close', number: issue.number })),
  ];
}

export async function verifyLiveRegistry({ root, baseUrl, allowLoopback = false, directory: retainedDirectory }) {
  const base = new URL(baseUrl);
  if (base.username || base.password || base.search || base.hash || !base.pathname.endsWith('/') || (base.protocol !== 'https:' && !(allowLoopback && base.protocol === 'http:' && base.hostname === '127.0.0.1')))
    throw new Error('Health endpoint requires an HTTPS directory.');
  const metadata = new URL('metadata/', base), targets = new URL('targets/', base);
  class Fetcher extends BaseFetcher {
    async fetch(value) {
      const url = new URL(value);
      if (![metadata, targets].some(prefix => prefix.origin === url.origin && url.pathname.startsWith(prefix.pathname))) throw new Error('Unexpected registry health URL.');
      const deadline = Date.now() + 30000;
      for (let attempt = 0; attempt < 3; attempt++) {
        const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(Math.max(1, Math.min(15000, deadline - Date.now()))) });
        if (response.ok && response.body) return response.body;
        await response.body?.cancel();
        const error = new DownloadHTTPError(`Registry HTTP ${response.status} at ${url.pathname}`, response.status);
        const retryAfter = response.headers.get('retry-after');
        let delay = 100 * (attempt + 1);
        if (retryAfter !== null) {
          const numeric = /^\d+$/.test(retryAfter);
          const seconds = numeric ? Number(retryAfter) : (Date.parse(retryAfter) - Date.now()) / 1000;
          if (numeric && !Number.isFinite(seconds)) throw error;
          if (Number.isFinite(seconds)) delay = Math.max(0, seconds * 1000);
        }
        // Match the app's bounded transport policy. 503 is never missing-root
        // evidence; only tuf-js's expected 404 ends next-root discovery.
        if (![429, 502, 503, 504].includes(response.status) || attempt === 2 || delay > 2000 || Date.now() + delay >= deadline) throw error;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  const directory = retainedDirectory || await fs.mkdtemp(path.join(os.tmpdir(), 'mmx-health-client-'));
  try {
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    if (retainedDirectory) {
      const identity = { rootSha256: rootFingerprint(root), baseUrl: base.href };
      const file = path.join(directory, 'client-identity.json');
      try {
        const stat = await fs.lstat(file);
        if (!stat.isFile() || stat.size > 4096 || !isDeepStrictEqual(JSON.parse(await fs.readFile(file)), identity)) throw new Error('Persistent health client pinned authority/endpoint identity changed.');
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        if ((await fs.readdir(directory)).length) throw new Error('Persistent health client has no independently pinned identity; do not reset existing trust.');
        await fs.writeFile(file, JSON.stringify(identity), { flag: 'wx', mode: 0o600 });
      }
    }
    await fs.writeFile(path.join(directory, 'root.json'), JSON.stringify(root), { flag: 'wx', mode: 0o600 }).catch(error => { if (error.code !== 'EEXIST') throw error; });
    const updater = new Updater({ metadataDir: directory, metadataBaseUrl: metadata.href, targetBaseUrl: targets.href, fetcher: new Fetcher(), config: { maxDelegations: 0, maxRootRotations: 32, rootMaxLength: 512 * 1024, timestampMaxLength: 64 * 1024, snapshotMaxLength: 512 * 1024, targetsMaxLength: 5 * 1024 * 1024 } });
    await updater.refresh();
    const info = await updater.getTargetInfo('catalog.json');
    if (!info || info.length > 5 * 1024 * 1024) throw new Error('Missing/oversized authenticated catalog.');
    const file = await updater.downloadTarget(info, path.join(directory, 'catalog.json'));
    const catalog = validateCatalog(JSON.parse(await fs.readFile(file)));
    const expirations = await Promise.all(['root', 'timestamp', 'snapshot', 'targets'].map(async role => Date.parse(JSON.parse(await fs.readFile(path.join(directory, role + '.json'))).signed.expires)));
    const validUntil = Math.min(Date.parse(catalog.expires), ...expirations);
    if (!Number.isFinite(validUntil) || validUntil <= Date.now()) throw new Error('Live registry trust expired.');
    const timestamp = JSON.parse(await fs.readFile(path.join(directory, 'timestamp.json')));
    return { validUntil, releases: catalog.releases.length, metadataVersion: timestamp.signed.version, timestampSha256: sha256(Buffer.from(canonicalize(timestamp))), catalogSha256: info.hashes.sha256 };
  } finally { if (!retainedDirectory) await fs.rm(directory, { recursive: true, force: true }); }
}
