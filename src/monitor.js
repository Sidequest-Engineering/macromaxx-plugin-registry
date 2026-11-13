import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { rootFingerprint } from './release-gates.js';
import { publicationIdentity, verifyLiveRegistry, assessPublishedHealth } from './health.js';

export const monitorAuthority = (root, baseUrl) => createHash('sha256').update(JSON.stringify([rootFingerprint(root), new URL(baseUrl).href])).digest('hex');

export async function probeRegistry({ root, baseUrl, historyDirectory, directory, historyCommit, allowLoopback = false, beforeRecord }) {
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const sample = { schemaVersion: 1, observedAt: Date.now(), authority: monitorAuthority(root, baseUrl), kind: 'error' };
  try {
    const publication = await publicationIdentity(historyDirectory, root);
    // Both a fresh client and retained client must accept the deployed authority.
    const fresh = await verifyLiveRegistry({ root, baseUrl, allowLoopback });
    const live = await verifyLiveRegistry({ root, baseUrl, allowLoopback, directory: path.join(directory, 'client') });
    const health = assessPublishedHealth({ live, publication });
    const freshHealth = assessPublishedHealth({ live: fresh, publication });
    if (freshHealth.kind !== 'healthy' && health.kind === 'healthy') throw new Error('Fresh client did not verify the published registry.');
    Object.assign(sample, live, health, { historyCommit });
  } catch { sample.message = 'Registry history/deployment unavailable, expired, changed authority or failed signature/rollback verification.'; }
  sample.observedAt = Date.now();
  try { await beforeRecord?.(sample); }
  catch { sample.kind = 'error'; sample.message = 'External alert or heartbeat delivery failed; inspect the external receiver without exposing credentials.'; }
  const log = path.join(directory, 'samples.jsonl');
  const existing = await fs.lstat(log).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  if (existing && (!existing.isFile() || existing.size > 16 * 1024 * 1024)) throw new Error('Monitoring evidence file invalid or full; archive it explicitly before continuing.');
  await fs.appendFile(log, JSON.stringify(sample) + '\n', { mode: 0o600 });
  return sample;
}

export function assessSoak(samples, { now = Date.now(), authority } = {}) {
  const fail = reason => ({ passed: false, reason, scope: 'registry-only; not app/plugin/platform delivery approval' });
  if (!Array.isArray(samples) || !samples.length) return fail('No real monitoring observations recorded.');
  const last = samples.at(-1);
  if (!Number.isSafeInteger(now) || !Number.isSafeInteger(last.observedAt) || last.observedAt > now || now - last.observedAt > 30 * 60000) return fail('Latest observation missing, future-dated or older than 30 minutes.');
  // Only the latest continuous healthy run counts: an incident resets the soak.
  let start = samples.length - 1;
  while (start >= 0 && samples[start].kind === 'healthy') start--;
  const run = samples.slice(start + 1);
  if (!run.length) return fail('Latest probe is not healthy.');
  const expectedAuthority = authority || last.authority;
  let previous;
  const versions = new Set();
  for (const sample of run) {
    if (sample.schemaVersion !== 1 || !/^[a-f0-9]{64}$/.test(sample.authority) || sample.authority !== expectedAuthority || !Number.isSafeInteger(sample.observedAt) || sample.observedAt > now || !Number.isSafeInteger(sample.metadataVersion) || sample.metadataVersion < 1 || !Number.isFinite(sample.validUntil) || sample.validUntil <= sample.observedAt + 6 * 3600000 || !/^[a-f0-9]{40}$/.test(sample.historyCommit || '') || !/^[a-f0-9]{64}$/.test(sample.timestampSha256 || '') || !/^[a-f0-9]{64}$/.test(sample.catalogSha256 || '')) return fail('Invalid or mixed-authority observation; not a healthy signed monitoring run.');
    if (previous) {
      const gap = sample.observedAt - previous.observedAt;
      if (gap <= 0 || gap > 30 * 60000 || sample.metadataVersion < previous.metadataVersion) return fail('Missing observations, clock reversal or metadata rollback.');
      if (sample.metadataVersion === previous.metadataVersion && ['timestampSha256', 'catalogSha256', 'historyCommit'].some(field => sample[field] !== previous[field])) return fail('Same-version publication identity changed.');
    }
    versions.add(sample.metadataVersion); previous = sample;
  }
  const elapsedHours = (last.observedAt - run[0].observedAt) / 3600000;
  if (elapsedHours < 48 || versions.size < 2) return fail('Need at least 48 real hours of healthy continuous observations and signed renewal.');
  return { passed: true, elapsedHours, observations: run.length, metadataVersions: versions.size, scope: 'registry-only; not app/plugin/platform delivery approval' };
}

export async function deliverAlert({ url, token, payload, allowLoopback = false }) {
  let target;
  try { target = new URL(url); } catch { throw new Error('Alert delivery requires a valid HTTPS receiver.'); }
  if (target.username || target.password || target.hash || (target.protocol !== 'https:' && !(allowLoopback && target.protocol === 'http:' && target.hostname === '127.0.0.1'))) throw new Error('Alert delivery requires HTTPS without URL credentials.');
  const body = JSON.stringify(payload);
  if (Buffer.byteLength(body) > 32768) throw new Error('Alert delivery payload exceeds quota.');
  try {
    const response = await fetch(target, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body, redirect: 'error', signal: AbortSignal.timeout(10000) });
    await response.body?.cancel();
    if (!response.ok) throw new Error();
  } catch { throw new Error('External notification delivery failed. Endpoint and credentials redacted.'); }
}
