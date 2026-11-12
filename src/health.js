import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Updater, BaseFetcher } from 'tuf-js';
import { DownloadHTTPError } from 'tuf-js/dist/error.js';
import { validateCatalog } from '@macromaxx/plugin-sdk/contracts';

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

export async function verifyLiveRegistry({ root, baseUrl, allowLoopback = false }) {
  const base = new URL(baseUrl);
  if (base.username || base.password || base.search || base.hash || !base.pathname.endsWith('/') || (base.protocol !== 'https:' && !(allowLoopback && base.protocol === 'http:' && base.hostname === '127.0.0.1')))
    throw new Error('Health endpoint requires an HTTPS directory.');
  const metadata = new URL('metadata/', base), targets = new URL('targets/', base);
  class Fetcher extends BaseFetcher {
    async fetch(value) {
      const url = new URL(value);
      if (![metadata, targets].some(prefix => prefix.origin === url.origin && url.pathname.startsWith(prefix.pathname))) throw new Error('Unexpected registry health URL.');
      const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(15000) });
      if (!response.ok || !response.body) { await response.body?.cancel(); throw new DownloadHTTPError(`Registry HTTP ${response.status} at ${url.pathname}`, response.status); }
      return response.body;
    }
  }
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mmx-health-client-'));
  try {
    await fs.writeFile(path.join(directory, 'root.json'), JSON.stringify(root), { mode: 0o600 });
    const updater = new Updater({ metadataDir: directory, metadataBaseUrl: metadata.href, targetBaseUrl: targets.href, fetcher: new Fetcher(), config: { maxDelegations: 0, maxRootRotations: 32, rootMaxLength: 512 * 1024, timestampMaxLength: 64 * 1024, snapshotMaxLength: 512 * 1024, targetsMaxLength: 5 * 1024 * 1024 } });
    await updater.refresh();
    const info = await updater.getTargetInfo('catalog.json');
    if (!info || info.length > 5 * 1024 * 1024) throw new Error('Missing/oversized authenticated catalog.');
    const file = await updater.downloadTarget(info, path.join(directory, 'catalog.json'));
    const catalog = validateCatalog(JSON.parse(await fs.readFile(file)));
    const expirations = await Promise.all(['root', 'timestamp', 'snapshot', 'targets'].map(async role => Date.parse(JSON.parse(await fs.readFile(path.join(directory, role + '.json'))).signed.expires)));
    const validUntil = Math.min(Date.parse(catalog.expires), ...expirations);
    if (!Number.isFinite(validUntil) || validUntil <= Date.now()) throw new Error('Live registry trust expired.');
    return { validUntil, releases: catalog.releases.length };
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
}
