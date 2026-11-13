import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createTrust, publishRepository } from '../src/repository.js';
import { assessHealth, assessPublishedHealth, incidentActions, verifyLiveRegistry, publicationIdentity } from '../src/health.js';

test('reports pending, unavailable, near-expiry and healthy trust without accepting malformed validity', () => {
  const now = Date.now();
  assert.equal(assessHealth({ configured: false, now }).kind, 'pending');
  assert.equal(assessHealth({ configured: true, validUntil: NaN, now }).kind, 'error');
  assert.equal(assessHealth({ configured: true, validUntil: now - 1, now }).kind, 'error');
  assert.equal(assessHealth({ configured: true, validUntil: now + 3600000, now }).kind, 'warning');
  assert.equal(assessHealth({ configured: true, validUntil: now + 24 * 3600000, now }).kind, 'healthy');
});

test('health incident actions deduplicate repeated alerts and close resolved incidents', () => {
  const health = { kind: 'error', message: 'HTTP 503 at /metadata/timestamp.json' };
  assert.deepEqual(incidentActions(health, []), [{ action: 'create', message: health.message }]);
  const existing = [{ number: 7, state: 'open', message: health.message }];
  assert.deepEqual(incidentActions(health, existing), []);
  assert.deepEqual(incidentActions({ kind: 'healthy' }, existing), [{ action: 'close', number: 7 }]);
  assert.deepEqual(incidentActions({ kind: 'pending' }, []), []);
});

test('live health uses the real pinned-root TUF client and rejects tampered metadata', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mmx-health-')); t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const trust = createTrust();
  await publishRepository({ directory, registry: { schemaVersion: 1, publishers: [], releases: [] }, root: trust.root, keys: trust.keys, version: 1 });
  let served = directory;
  const server = http.createServer(async (req, res) => {
    try { const file = path.resolve(served, '.' + new URL(req.url, 'http://localhost').pathname); if (!file.startsWith(served + path.sep)) throw Error(); res.end(await fs.readFile(file)); }
    catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const options = { root: trust.root, baseUrl: `http://127.0.0.1:${server.address().port}/`, allowLoopback: true };
  const result = await verifyLiveRegistry(options);
  assert.equal(result.releases, 0); assert.ok(result.validUntil > Date.now());
  const stale = directory + '-v1'; await fs.cp(directory, stale, { recursive: true }); t.after(() => fs.rm(stale, { recursive: true, force: true }));
  await publishRepository({ directory, registry: { schemaVersion: 1, publishers: [], releases: [] }, root: trust.root, keys: trust.keys, version: 2 });
  const published = await publicationIdentity(directory, trust.root);
  served = stale;
  const health = assessPublishedHealth({ live: await verifyLiveRegistry(options), publication: published });
  assert.equal(health.kind, 'error');
  const actions = incidentActions(health, [{ number: 7, state: 'open', message: 'Deployment failed' }]);
  assert.equal(actions[0].action, 'update'); assert.ok(actions.every(action => action.action !== 'close'));
  served = directory;
  assert.equal(assessPublishedHealth({ live: await verifyLiveRegistry(options), publication: published }).kind, 'healthy');
  const file = path.join(directory, 'metadata/timestamp.json'), timestamp = JSON.parse(await fs.readFile(file)); timestamp.signed.version++;
  await fs.writeFile(file, JSON.stringify(timestamp));
  await assert.rejects(verifyLiveRegistry(options), /sign|verif|threshold/i);
});

test('external health cache rejects a valid signed rollback and cannot silently change its pinned authority', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mmx-persistent-health-')); t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const trust = createTrust(), repository = path.join(directory, 'published');
  const registry = { schemaVersion: 1, publishers: [], releases: [] };
  await publishRepository({ directory: repository, registry, root: trust.root, keys: trust.keys, version: 1 });
  const old = path.join(directory, 'old'); await fs.cp(repository, old, { recursive: true });
  let served = repository;
  const server = http.createServer(async (req, res) => { try { const p = new URL(req.url, 'http://localhost').pathname; if (p.includes('..')) throw Error(); res.end(await fs.readFile(path.join(served, p))); } catch { res.writeHead(404).end(); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const options = { root: trust.root, baseUrl: `http://127.0.0.1:${server.address().port}/`, allowLoopback: true, directory: path.join(directory, 'client') };
  assert.equal((await verifyLiveRegistry(options)).metadataVersion, 1);
  await publishRepository({ directory: repository, registry, root: trust.root, keys: trust.keys, version: 2 });
  assert.equal((await verifyLiveRegistry(options)).metadataVersion, 2);
  served = old;
  await assert.rejects(verifyLiveRegistry(options), /version|rollback/i);
  await assert.rejects(verifyLiveRegistry({ ...options, root: createTrust().root }), /authority|pinned|identity/i);
  await assert.rejects(verifyLiveRegistry({ ...options, baseUrl: options.baseUrl + 'changed/' }), /authority|pinned|identity/i);
});
