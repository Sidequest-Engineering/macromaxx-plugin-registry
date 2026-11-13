import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { encodePackage } from '@macromaxx/plugin-sdk/contracts';
import { createTrust, sha256, verifyPublicationHistory } from '../src/repository.js';
import { preparePagesSite, staticFiles } from '../src/pages.js';
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

test('builds a production site with no test channel/private inputs and requires explicit bootstrap', async t => {
  const f = await setup(t);
  await assert.rejects(preparePagesSite({ ...f.options, allowBootstrap: false }), /bootstrap|history/i);
  const result = await preparePagesSite(f.options);
  assert.equal(result.version, 1);
  const state = await verifyPublicationHistory(f.options.outputDirectory, f.trust.root);
  assert.equal(state.registry.releases[0].sha256, f.release.sha256);
  for (const name of ['test', 'quarantine', 'packages', 'root.pem']) assert.equal(await fs.stat(path.join(f.options.outputDirectory, name)).then(() => true, () => false), false);
  const config = JSON.parse(await fs.readFile(path.join(f.options.outputDirectory, 'client-config.json')));
  assert.equal(config.channel, 'production'); assert.equal(config.metadataUrl, 'https://example.github.io/registry/metadata/');
  assert.deepEqual(config.root, f.trust.root);
});

test('renewal preserves immutable files and signed history while incrementing version', async t => {
  const f = await setup(t); await preparePagesSite(f.options);
  const next = path.join(f.directory, 'renewed');
  const result = await preparePagesSite({ ...f.options, outputDirectory: next, previousSiteDirectory: f.options.outputDirectory, allowBootstrap: false });
  assert.equal(result.version, 2);
  assert.deepEqual(await fs.readFile(path.join(next, 'metadata/1.targets.json')), await fs.readFile(path.join(f.options.outputDirectory, 'metadata/1.targets.json')));
  assert.equal((await verifyPublicationHistory(next, f.trust.root)).version, 2);
  await fs.writeFile(path.join(f.options.outputDirectory, 'registry-state.json'), '{}');
  await assert.rejects(preparePagesSite({ ...f.options, outputDirectory: path.join(f.directory, 'bad'), previousSiteDirectory: f.options.outputDirectory }), /history|version|hash|length/i);
});

test('rejects links/unexpected files in retained site and altered reviewed packages', async t => {
  const f = await setup(t); await preparePagesSite(f.options);
  await fs.writeFile(path.join(f.options.outputDirectory, 'private.pem'), 'not-a-real-key');
  await assert.rejects(preparePagesSite({ ...f.options, outputDirectory: path.join(f.directory, 'bad'), previousSiteDirectory: f.options.outputDirectory }), /unexpected|allow|file/i);
  await fs.unlink(path.join(f.options.outputDirectory, 'private.pem'));
  await fs.symlink('/etc/passwd', path.join(f.options.outputDirectory, 'targets/link'));
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
  assert.equal(git(['ls-remote', '--heads', remote, 'refs/heads/gh-pages']), '');
  const checkout = path.join(f.directory, 'checkout'); git(['clone', '--branch', 'production-publication', remote, checkout]);
  const exported = path.join(f.directory, 'exported'); await exportHistory({ repositoryDirectory: checkout, commit: first, outputDirectory: exported });
  assert.deepEqual(await fs.readFile(path.join(exported, 'metadata/1.targets.json')), await fs.readFile(path.join(f.options.outputDirectory, 'metadata/1.targets.json')));
  const next = path.join(f.directory, 'next'); await preparePagesSite({ ...f.options, previousSiteDirectory: exported, outputDirectory: next });
  const second = await publishHistory({ siteDirectory: next, remote, previousCommit: first });
  assert.notEqual(first, second);
  await fs.copyFile(path.join(f.options.outputDirectory, 'metadata/timestamp.json'), path.join(next, 'metadata/timestamp.json'));
  await fs.copyFile(path.join(f.options.outputDirectory, 'registry-state.json'), path.join(next, 'registry-state.json'));
  await assert.rejects(publishHistory({ siteDirectory: next, remote, previousCommit: second }), /version|rollback|history/i);
  await assert.rejects(publishHistory({ siteDirectory: next, remote, previousCommit: first }), /history|changed|race/i);
  git(['fetch', 'origin', 'production-publication'], checkout);
  git(['checkout', '-B', 'production-publication', 'FETCH_HEAD'], checkout);
  git(['rm', '-r', '--', '.'], checkout);
  await fs.cp(f.options.outputDirectory, checkout, { recursive: true });
  git(['add', '.'], checkout);
  git(['-c', 'user.name=Test', '-c', 'user.email=test@example.org', 'commit', '-m', 'Replay valid signed version one'], checkout);
  await assert.rejects(exportHistory({ repositoryDirectory: checkout, commit: 'HEAD', outputDirectory: path.join(f.directory, 'replayed') }), /history|version|rollback/i);
  await fs.symlink('/etc/passwd', path.join(checkout, 'private.pem')); git(['add', '.'], checkout);
  git(['-c', 'user.name=Test', '-c', 'user.email=test@example.org', 'commit', '-m', 'Bad link'], checkout);
  await assert.rejects(exportHistory({ repositoryDirectory: checkout, commit: 'HEAD', outputDirectory: path.join(f.directory, 'bad-export') }), /link|mode|unexpected/i);
});

test('rejects damaged historical metadata even when the latest publication is authenticated', async t => {
  const f = await setup(t); await preparePagesSite(f.options);
  const next = path.join(f.directory, 'next');
  await preparePagesSite({ ...f.options, previousSiteDirectory: f.options.outputDirectory, outputDirectory: next });
  const file = path.join(next, 'metadata/1.targets.json');
  const metadata = JSON.parse(await fs.readFile(file)); metadata.signed.expires = '2099-01-01T00:00:00Z';
  await fs.writeFile(file, JSON.stringify(metadata));
  await assert.rejects(preparePagesSite({ ...f.options, previousSiteDirectory: next, outputDirectory: path.join(f.directory, 'bad-old') }), /sign|verif|threshold|length|hash/i);
});

test('renders a verified empty production catalog and escapes publisher-controlled entry text', async t => {
  const f = await setup(t);
  const registry = JSON.parse(await fs.readFile(path.join(f.inputs, 'registry.json')));
  registry.releases = [];
  await fs.writeFile(path.join(f.inputs, 'registry.json'), JSON.stringify(registry));
  await preparePagesSite(f.options);
  const html = await fs.readFile(path.join(f.options.outputDirectory, 'index.html'), 'utf8');
  assert.match(html, /No plugins published yet/);
  assert.match(html, /CONTRIBUTING\.md/);
  assert.doesNotMatch(html, /Counter \(test\)|test channel/i);
  const manifest = { ...f.release.manifest, name: '<script>alert(1)</script>' };
  const bytes = encodePackage(manifest, 'var __pluginModule={default:{}};');
  registry.releases = [{ ...f.release, manifest, sha256: sha256(bytes), length: bytes.length }];
  await fs.writeFile(path.join(f.inputs, 'registry.json'), JSON.stringify(registry));
  await fs.writeFile(path.join(f.inputs, 'packages', sha256(bytes) + '.mmxp'), bytes);
  const second = path.join(f.directory, 'escaped'); await preparePagesSite({ ...f.options, outputDirectory: second });
  const escaped = await fs.readFile(path.join(second, 'index.html'), 'utf8');
  assert.match(escaped, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(escaped, /<script>|<iframe/);
});

test('rejects incomplete old history and retained objects exceeding the file quota', async t => {
  const f = await setup(t); await preparePagesSite(f.options);
  const next = path.join(f.directory, 'next'); await preparePagesSite({ ...f.options, previousSiteDirectory: f.options.outputDirectory, outputDirectory: next });
  await fs.unlink(path.join(next, 'metadata/1.targets.json'));
  await assert.rejects(preparePagesSite({ ...f.options, previousSiteDirectory: next, outputDirectory: path.join(f.directory, 'bad-missing') }), /history|historical|missing/i);
  const huge = path.join(f.options.outputDirectory, 'index.html');
  await fs.truncate(huge, 6 * 1024 * 1024 + 1);
  await assert.rejects(staticFiles(f.options.outputDirectory), /quota/i);
});
