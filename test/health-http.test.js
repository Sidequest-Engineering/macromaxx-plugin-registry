import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createTrust, publishRepository } from '../src/repository.js';
import { verifyLiveRegistry } from '../src/health.js';

async function fixture(t, respond) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mmx-health-http-')); t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const trust = createTrust();
  await publishRepository({ directory, registry: { schemaVersion: 1, publishers: [], releases: [] }, root: trust.root, keys: trust.keys, version: 1 });
  const server = http.createServer(async (req, res) => {
    if (respond(req, res)) return;
    try { const file = path.resolve(directory, '.' + new URL(req.url, 'http://localhost').pathname); if (!file.startsWith(directory + path.sep)) throw Error(); res.end(await fs.readFile(file)); }
    catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return { directory, options: { root: trust.root, baseUrl: `http://127.0.0.1:${server.address().port}/`, allowLoopback: true } };
}

test('signed health recovers from Pages503 during next-root discovery before the expected404', async t => {
  let roots = 0;
  const f = await fixture(t, (req, res) => { if (req.url === '/metadata/2.root.json' && ++roots < 3) { res.writeHead(503).end(); return true; } return false; });
  assert.equal((await verifyLiveRegistry(f.options)).metadataVersion, 1);
  assert.equal(roots, 3);
});

test('signed health bounds permanent503 and preserves the real HTTP error rather than treating it as missing root', async t => {
  let roots = 0;
  const f = await fixture(t, (req, res) => { if (req.url === '/metadata/2.root.json') { roots++; res.writeHead(503).end(); return true; } return false; });
  await assert.rejects(verifyLiveRegistry(f.options), error => error.statusCode === 503 && /HTTP 503.*2\.root\.json/.test(error.message));
  assert.equal(roots, 3);
});

test('signed health respects long and overflowing Retry-After deferrals without hammering Pages', async t => {
  for (const retryAfter of ['3600', '9'.repeat(400)]) {
    let requests = 0;
    const f = await fixture(t, (_req, res) => { requests++; res.writeHead(429, { 'Retry-After': retryAfter }).end(); return true; });
    await assert.rejects(verifyLiveRegistry(f.options), error => error.statusCode === 429);
    assert.equal(requests, 1);
  }
});

test('signed health never retries expected root404 or an invalid timestamp signature', async t => {
  let roots = 0, timestamps = 0;
  const f = await fixture(t, req => { if (req.url === '/metadata/2.root.json') roots++; if (req.url === '/metadata/timestamp.json') timestamps++; return false; });
  await verifyLiveRegistry(f.options); assert.equal(roots, 1); assert.equal(timestamps, 1);
  const file = path.join(f.directory, 'metadata/timestamp.json'), timestamp = JSON.parse(await fs.readFile(file)); timestamp.signed.version++;
  await fs.writeFile(file, JSON.stringify(timestamp));
  await assert.rejects(verifyLiveRegistry(f.options), /sign|verify|threshold/i);
  assert.equal(roots, 2); assert.equal(timestamps, 2);
});
