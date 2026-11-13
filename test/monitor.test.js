import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createTrust, publishRepository } from '../src/repository.js';
import { rootFingerprint } from '../src/release-gates.js';
import { probeRegistry, assessSoak, deliverAlert } from '../src/monitor.js';

const hour = 3600000, now = 2000000000000;
function observations() {
  return Array.from({ length: 193 }, (_, i) => ({ schemaVersion: 1, observedAt: now - 48 * hour + i * 15 * 60000, authority: 'a'.repeat(64), kind: 'healthy', metadataVersion: 1 + Math.floor(i / 24), validUntil: now + 24 * hour, historyCommit: Math.floor(i / 24).toString(16).padStart(40, '0'), timestampSha256: Math.floor(i / 24).toString(16).padStart(64, '0'), catalogSha256: Math.floor(i / 24).toString(16).padStart(64, '0') }));
}

test('soak requires 48 elapsed hours, fresh uninterrupted signed observations and actual renewals', () => {
  const samples = observations();
  assert.equal(assessSoak(samples, { now }).passed, true);
  assert.equal(assessSoak(samples.slice(1), { now }).passed, false);
  assert.equal(assessSoak(samples, { now: now + hour }).passed, false);
  const gaps = samples.filter((_, i) => i !== 99 && i !== 100); assert.equal(assessSoak(gaps, { now }).passed, false);
  const failed = structuredClone(samples); failed[100].kind = 'error'; assert.equal(assessSoak(failed, { now }).passed, false);
  const warning = structuredClone(samples); warning[100].kind = 'warning'; assert.equal(assessSoak(warning, { now }).passed, false);
  const frozen = samples.map(s => ({ ...s, metadataVersion: 1 })); assert.equal(assessSoak(frozen, { now }).passed, false);
  assert.equal(assessSoak([], { now }).passed, false);
});

test('soak rejects identity mixing, rollback, changed same-version bytes and future/invalid timestamps', () => {
  for (const mutate of [
    s => { s[100].authority = 'b'.repeat(64); },
    s => { s[100].metadataVersion = 1; },
    s => { s[100].catalogSha256 = 'f'.repeat(64); },
    s => { s.at(-1).observedAt = now + hour; },
    s => { s[100].observedAt = 'invalid'; },
    s => { s.at(-1).validUntil = now; },
  ]) { const samples = observations(); mutate(samples); assert.equal(assessSoak(samples, { now }).passed, false); }
});

test('external probe treats missing publication as unhealthy and writes private, honest evidence', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mmx-monitor-')); t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const { root } = createTrust();
  const result = await probeRegistry({ root, baseUrl: 'https://example.org/', historyDirectory: path.join(dir, 'missing'), directory: path.join(dir, 'state') });
  assert.equal(result.kind, 'error');
  const samples = (await fs.readFile(path.join(dir, 'state/samples.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(samples.length, 1); assert.equal(samples[0].kind, 'error');
  assert.equal((await fs.stat(path.join(dir, 'state/samples.jsonl'))).mode & 0o777, 0o600);
  assert.equal(assessSoak(samples).passed, false);
});

test('external probe authenticates real deployed bytes against current history before writing healthy evidence', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mmx-monitor-live-')); t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const trust = createTrust(), repository = path.join(dir, 'published'), registry = { schemaVersion: 1, publishers: [], releases: [] };
  await publishRepository({ directory: repository, registry, root: trust.root, keys: trust.keys, version: 1 });
  const old = path.join(dir, 'old'); await fs.cp(repository, old, { recursive: true });
  let served = repository;
  const server = http.createServer(async (req, res) => { try { res.end(await fs.readFile(path.join(served, new URL(req.url, 'http://localhost').pathname))); } catch { res.writeHead(404).end(); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const options = { root: trust.root, baseUrl: `http://127.0.0.1:${server.address().port}/`, allowLoopback: true, historyDirectory: repository, directory: path.join(dir, 'state'), historyCommit: 'a'.repeat(40) };
  assert.equal((await probeRegistry(options)).kind, 'healthy');
  await publishRepository({ directory: repository, registry, root: trust.root, keys: trust.keys, version: 2 });
  served = old;
  assert.equal((await probeRegistry(options)).kind, 'error');
  served = repository;
  assert.equal((await probeRegistry(options)).metadataVersion, 2);
  assert.equal((await probeRegistry({ ...options, afterRecord() { throw new Error('receiver unavailable'); } })).kind, 'error');
  // A dead evidence sink must be detected before any callback can send a healthy heartbeat.
  await fs.truncate(path.join(options.directory, 'samples.jsonl'), 16 * 1024 * 1024 + 1);
  let callbackHealthy = false, persistenceFailure;
  await assert.rejects(probeRegistry({ ...options, afterRecord(sample) { callbackHealthy ||= sample.kind === 'healthy'; }, onFailure(sample) { persistenceFailure = sample; } }), /evidence|quota|record/i);
  assert.equal(callbackHealthy, false); assert.equal(persistenceFailure.kind, 'error');
  await fs.truncate(path.join(options.directory, 'samples.jsonl'), 0); await fs.chmod(path.join(options.directory, 'samples.jsonl'), 0o400);
  if (process.getuid?.() !== 0) await assert.rejects(probeRegistry({ ...options, afterRecord(sample) { callbackHealthy ||= sample.kind === 'healthy'; }, onFailure(sample) { persistenceFailure = sample; } }), /evidence|quota|record/i);
  assert.equal(callbackHealthy, false);
  await fs.chmod(path.join(options.directory, 'samples.jsonl'), 0o600);
  await fs.unlink(path.join(options.directory, 'samples.jsonl')); await fs.mkdir(path.join(options.directory, 'samples.jsonl'));
  persistenceFailure = undefined;
  await assert.rejects(probeRegistry({ ...options, afterRecord(sample) { callbackHealthy ||= sample.kind === 'healthy'; }, onFailure(sample) { persistenceFailure = sample; } }), /evidence|quota|record/i);
  assert.equal(callbackHealthy, false); assert.equal(persistenceFailure.kind, 'error');
});

test('alerts send bounded JSON, never follow redirects and sanitize secrets on failure', async t => {
  const requests = [];
  const server = http.createServer(async (req, res) => { let body = ''; for await (const chunk of req) body += chunk; requests.push({ path: req.url, body, token: req.headers.authorization }); if (req.url === '/ok') res.writeHead(204).end(); else if (req.url === '/redirect') res.writeHead(302, { location: '/ok' }).end(); else res.writeHead(503).end(); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  await deliverAlert({ url: base + '/ok', token: 'private-token', payload: { kind: 'test' }, allowLoopback: true });
  assert.deepEqual(JSON.parse(requests[0].body), { kind: 'test' }); assert.equal(requests[0].token, 'Bearer private-token');
  await assert.rejects(deliverAlert({ url: base + '/redirect', payload: {}, allowLoopback: true }), /delivery/i);
  assert.equal(requests.length, 2);
  await assert.rejects(deliverAlert({ url: base + '/secret-path', token: 'private-token', payload: {}, allowLoopback: true }), error => !/secret-path|private-token|127\.0\.0\.1/.test(error.message));
  await assert.rejects(deliverAlert({ url: base + '/ok', payload: {} }), /HTTPS/);
});

test('operator soak CLI fails with no observations and never treats a report as full release approval', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mmx-soak-cli-')); t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const { root } = createTrust(); const rootFile = path.join(dir, 'root.json'); await fs.writeFile(rootFile, JSON.stringify(root));
  const script = fileURLToPath(new URL('../src/monitor-cli.js', import.meta.url));
  const result = spawnSync(process.execPath, [script, 'soak'], { encoding: 'utf8', env: { ...process.env, MONITOR_STATE_DIRECTORY: dir, MONITOR_ROOT_FILE: rootFile, MONITOR_ROOT_SHA256: 'a'.repeat(64) } });
  assert.equal(result.status, 1); assert.doesNotMatch(result.stdout, /"passed":true/);
  assert.match(result.stdout + result.stderr, /pinned|fingerprint|observations/i);
  const empty = spawnSync(process.execPath, [script, 'soak'], { encoding: 'utf8', env: { ...process.env, MONITOR_STATE_DIRECTORY: dir, MONITOR_ROOT_FILE: rootFile, MONITOR_ROOT_SHA256: rootFingerprint(root) } });
  assert.equal(empty.status, 1); const report = JSON.parse(empty.stdout); assert.equal(report.passed, false); assert.match(report.scope, /not app\/plugin\/platform/);
});
