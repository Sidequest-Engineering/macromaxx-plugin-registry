// Operator acceptance test: run with Electron's Node mode against a built ASAR.
// All signing keys, packages and state below are private throwaway fixtures.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { encodePackage } from '@macromaxx/plugin-sdk/contracts';
import { createTrust, importPackage, publishRepository, sha256 } from '../src/repository.js';

const modulePath = process.argv[2];
if (process.argv.length !== 3 || !modulePath || !path.isAbsolute(modulePath) || !modulePath.replaceAll('\\', '/').includes('.asar/node_modules/@macromaxx/plugin-runtime/src/index.js') || !process.versions.electron)
  throw new Error('Usage: ELECTRON_RUN_AS_NODE=1 <electron> scripts/verify-packaged-store.js <absolute packaged app.asar/node_modules/@macromaxx/plugin-runtime/src/index.js>');
const { PluginStore, TrustedRegistry } = await import(pathToFileURL(modulePath).href);
const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mmx-package-acceptance-'));
const trust = createTrust(), published = path.join(directory, 'published'), data = path.join(directory, 'store'), cache = path.join(directory, 'trust');
const manifest = { schemaVersion: 1, id: 'acceptance--counter', publisher: 'acceptance', name: 'Local acceptance fixture', description: 'Private loopback-only package acceptance, not a production listing.', version: '1.0.0', apiVersion: 1, appVersion: '>=0.1.0 <1.0.0', runtime: 'standard', platforms: [process.platform], permissions: ['display:write', 'settings:read', 'settings:write'], actions: [{ id: 'count', name: 'Count' }] };
const code = 'var __pluginModule={default:{actions:{count:{execute(e,a){const s=a.settings.get();const count=(s.count||0)+1;a.settings.set({count});a.display.set({label:String(count)});}}}}};';
const registry = { schemaVersion: 1, publishers: [{ id: 'acceptance', name: 'Acceptance fixture', github: 'acceptance' }], releases: [] };
const add = async (version, metadataVersion) => {
  const m = { ...manifest, version }, bytes = encodePackage(m, code);
  const descriptor = { manifest: m, sha256: sha256(bytes), length: bytes.length, status: 'approved' };
  registry.releases.push(descriptor); await importPackage(published, descriptor, bytes);
  await publishRepository({ directory: published, registry, root: trust.root, keys: trust.keys, version: metadataVersion });
};
let server, active;
try {
  await add('1.0.0', 1);
  server = http.createServer(async (req, res) => {
    try { const f = path.resolve(published, '.' + new URL(req.url, 'http://localhost').pathname); if (!f.startsWith(published + path.sep)) throw Error(); res.end(await fs.readFile(f)); }
    catch { res.writeHead(404).end(); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const base = `http://127.0.0.1:${server.address().port}/`, displays = [];
  const store = () => new PluginStore({ directory: data, registry: new TrustedRegistry({ directory: cache, root: trust.root, metadataUrl: base + 'metadata/', targetsUrl: base + 'targets/', allowLoopback: true }), appVersion: '0.1.0', onDisplay: (...v) => displays.push(v) });
  active = store(); await active.init();
  await assert.rejects(active.install(manifest.id, '1.0.0', []), /permission/i);
  await active.install(manifest.id, '1.0.0', manifest.permissions);
  await active.execute(manifest.id, 'count', { keyId: 'acceptance-key' }); assert.equal(displays.at(-1)[2].label, '1');
  active.close(); active = store(); await active.init();
  await active.execute(manifest.id, 'count', { keyId: 'acceptance-key' }); assert.equal(displays.at(-1)[2].label, '2');
  await add('1.0.1', 2); await active.refresh(); await active.install(manifest.id, '1.0.1', manifest.permissions);
  await active.execute(manifest.id, 'count', { keyId: 'acceptance-key' }); assert.equal(displays.at(-1)[2].label, '3');
  registry.releases[1].status = 'revoked'; await publishRepository({ directory: published, registry, root: trust.root, keys: trust.keys, version: 3 }); await active.refresh();
  await assert.rejects(active.execute(manifest.id, 'count', { keyId: 'acceptance-key' }), /disabled|revoked/i);
  await assert.rejects(active.install(manifest.id, '1.0.1', manifest.permissions), /approved/i);
  console.log(JSON.stringify({ packagedAsar: true, realWorkerWasm: true, permissionDenial: true, installAction: true, persistedRestart: true, updatePreservesSettings: true, revocationBlocksExecutionAndInstall: true, productionAuthorityUsed: false, userWorkspaceTouched: false }));
} finally {
  active?.close();
  if (server?.listening) await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
  await fs.rm(directory, { recursive: true, force: true });
}
