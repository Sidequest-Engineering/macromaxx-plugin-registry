import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { encodePackage } from '@macromaxx/plugin-sdk/contracts';
import { createTrust, sha256, verifyPublicationHistory } from '../src/repository.js';
import { preparePagesSite } from '../src/pages.js';
import { exportHistory, publishHistory } from '../src/pages-history.js';

async function setup(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mmx-pages-')); t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const trust = createTrust();
  const manifest = { schemaVersion: 1, id: 'macromaxx--counter', publisher: 'macromaxx', name: 'Counter (test)', description: 'Test store counter', version: '1.0.0', apiVersion: 1, appVersion: '>=0.1.0 <1.0.0', runtime: 'standard', platforms: ['linux', 'win32', 'darwin'], permissions: ['display:write'], actions: [{ id: 'count', name: 'Count' }] };
  const bytes = encodePackage(manifest, 'var __pluginModule={default:{actions:{count:{execute(e,a){a.display.set({label:"Test"})}}}}};');
  const release = { manifest, status: 'approved', sha256: sha256(bytes), length: bytes.length };
  const registry = { schemaVersion: 1, publishers: [{ id: 'macromaxx', name: 'MacroMaxx test', github: 'Sidequest-Engineering' }], releases: [release] };
  const inputs = path.join(directory, 'inputs'); await fs.mkdir(path.join(inputs, 'packages'), { recursive: true });
  await fs.writeFile(path.join(inputs, 'root.json'), JSON.stringify(trust.root));
  await fs.writeFile(path.join(inputs, 'registry.json'), JSON.stringify(registry));
  await fs.writeFile(path.join(inputs, 'packages', release.sha256 + '.mmxp'), bytes);
  const options = { inputDirectory: inputs, outputDirectory: path.join(directory, 'site'), keys: { targets: trust.keys.targets, snapshot: trust.keys.snapshot, timestamp: trust.keys.timestamp }, baseUrl: 'https://example.github.io/registry/', allowBootstrap: true };
  return { directory, trust, release, bytes, inputs, options };
}

test('builds a signed test site with no private keys/source/quarantine and fails closed without bootstrap', async t => {
  const f = await setup(t);
  await assert.rejects(preparePagesSite({ ...f.options, allowBootstrap: false }), /bootstrap|history/i);
  const result = await preparePagesSite(f.options);
  assert.equal(result.version, 1);
  const state = await verifyPublicationHistory(path.join(f.options.outputDirectory, 'test'), f.trust.root);
  assert.equal(state.registry.releases[0].sha256, f.release.sha256);
  assert.equal(await fs.stat(path.join(f.options.outputDirectory, 'test/quarantine')).then(() => true, () => false), false);
  const config = JSON.parse(await fs.readFile(path.join(f.options.outputDirectory, 'test/client-config.json')));
  assert.equal(config.channel, 'test'); assert.equal(config.metadataUrl, 'https://example.github.io/registry/test/metadata/');
  assert.deepEqual(config.root, f.trust.root);
});

test('renewal preserves immutable files and signed history while incrementing version', async t => {
  const f = await setup(t); await preparePagesSite(f.options);
  const next = path.join(f.directory, 'renewed');
  const result = await preparePagesSite({ ...f.options, outputDirectory: next, previousSiteDirectory: f.options.outputDirectory, allowBootstrap: false });
  assert.equal(result.version, 2);
  assert.deepEqual(await fs.readFile(path.join(next, 'test/metadata/1.targets.json')), await fs.readFile(path.join(f.options.outputDirectory, 'test/metadata/1.targets.json')));
  assert.equal((await verifyPublicationHistory(path.join(next, 'test'), f.trust.root)).version, 2);
  await fs.writeFile(path.join(f.options.outputDirectory, 'test/registry-state.json'), '{}');
  await assert.rejects(preparePagesSite({ ...f.options, outputDirectory: path.join(f.directory, 'bad'), previousSiteDirectory: f.options.outputDirectory }), /history|version|hash|length/i);
});

test('rejects links/unexpected files in retained site and altered reviewed packages', async t => {
  const f = await setup(t); await preparePagesSite(f.options);
  await fs.writeFile(path.join(f.options.outputDirectory, 'test/private.pem'), 'not-a-real-key');
  await assert.rejects(preparePagesSite({ ...f.options, outputDirectory: path.join(f.directory, 'bad'), previousSiteDirectory: f.options.outputDirectory }), /unexpected|allow|file/i);
  await fs.unlink(path.join(f.options.outputDirectory, 'test/private.pem'));
  await fs.symlink('/etc/passwd', path.join(f.options.outputDirectory, 'test/targets/link'));
  await assert.rejects(preparePagesSite({ ...f.options, outputDirectory: path.join(f.directory, 'linked'), previousSiteDirectory: f.options.outputDirectory }), /link|file/i);
  await fs.writeFile(path.join(f.inputs, 'packages', f.release.sha256 + '.mmxp'), '{}');
  await assert.rejects(preparePagesSite({ ...f.options, outputDirectory: path.join(f.directory, 'tampered') }), /hash|length/i);
});

test('history publication is fast-forward only and rejects stale bootstrap/renewal and linked git blobs', async t => {
  const f = await setup(t); await preparePagesSite(f.options);
  const remote = path.join(f.directory, 'remote.git');
  const git = (args, cwd = f.directory) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  git(['init', '--bare', remote]);
  const first = await publishHistory({ siteDirectory: f.options.outputDirectory, remote, previousCommit: null });
  assert.match(first, /^[a-f0-9]{40}$/);
  await assert.rejects(publishHistory({ siteDirectory: f.options.outputDirectory, remote, previousCommit: null }), /history|changed|race/i);
  const checkout = path.join(f.directory, 'checkout'); git(['clone', '--branch', 'gh-pages', remote, checkout]);
  const exported = path.join(f.directory, 'exported'); await exportHistory({ repositoryDirectory: checkout, commit: first, outputDirectory: exported });
  assert.deepEqual(await fs.readFile(path.join(exported, 'test/metadata/1.targets.json')), await fs.readFile(path.join(f.options.outputDirectory, 'test/metadata/1.targets.json')));
  const next = path.join(f.directory, 'next'); await preparePagesSite({ ...f.options, previousSiteDirectory: exported, outputDirectory: next });
  const second = await publishHistory({ siteDirectory: next, remote, previousCommit: first });
  assert.notEqual(first, second);
  await assert.rejects(publishHistory({ siteDirectory: next, remote, previousCommit: first }), /history|changed|race/i);
  await fs.symlink('/etc/passwd', path.join(checkout, 'test/private.pem')); git(['add', '.'], checkout);
  git(['-c', 'user.name=Test', '-c', 'user.email=test@example.org', 'commit', '-m', 'Bad link'], checkout);
  await assert.rejects(exportHistory({ repositoryDirectory: checkout, commit: 'HEAD', outputDirectory: path.join(f.directory, 'bad-export') }), /link|mode|unexpected/i);
});

test('rejects damaged historical metadata even when the latest publication is authenticated', async t => {
  const f = await setup(t); await preparePagesSite(f.options);
  const next = path.join(f.directory, 'next');
  await preparePagesSite({ ...f.options, previousSiteDirectory: f.options.outputDirectory, outputDirectory: next });
  const file = path.join(next, 'test/metadata/1.targets.json');
  const metadata = JSON.parse(await fs.readFile(file)); metadata.signed.expires = '2099-01-01T00:00:00Z';
  await fs.writeFile(file, JSON.stringify(metadata));
  await assert.rejects(preparePagesSite({ ...f.options, previousSiteDirectory: next, outputDirectory: path.join(f.directory, 'bad-old') }), /signature|verify|threshold|length|hash/i);
});
