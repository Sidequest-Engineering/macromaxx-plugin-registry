import { test } from 'node:test';
import assert from 'node:assert/strict';
import { releaseAssetURL, fetchReviewedReleases } from '../src/source.js';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { encodePackage } from '@macromaxx/plugin-sdk/contracts';
import { createTrust, importPackage, publishRepository, sha256 } from '../src/repository.js';
test('release import only accepts explicit GitHub asset URLs bound to reviewed versions', () => {
  assert.equal(
    releaseAssetURL(
      {
        repository: 'https://github.com/example/counter',
        tag: 'v1.0.0',
        asset: 'plugin.mmxp',
        commit: 'a'.repeat(40),
      },
      '1.0.0',
    ),
    'https://github.com/example/counter/releases/download/v1.0.0/plugin.mmxp',
  );
  for (const source of [
    { repository: 'http://localhost/', tag: 'v1.0.0', asset: 'p.mmxp' },
    { repository: 'https://github.com/example/counter', tag: 'latest', asset: '../escape' },
  ])
    assert.throws(() => releaseAssetURL(source, '1.0.0'));
});

test('metadata-only publications always produce transfer input even with zero approved packages', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mmx-empty-publication-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const manifest = {
    schemaVersion: 1,
    id: 'example--counter',
    publisher: 'example',
    name: 'Counter',
    description: 'Revoked example',
    version: '1.0.0',
    apiVersion: 1,
    appVersion: '>=0.1.0 <1.0.0',
    runtime: 'standard',
    platforms: ['linux'],
    permissions: [],
    actions: [{ id: 'count', name: 'Count' }],
  };
  await fetchReviewedReleases(
    {
      schemaVersion: 1,
      publishers: [{ id: 'example', name: 'Example', github: 'example' }],
      releases: [{ manifest, status: 'revoked', sha256: 'a'.repeat(64), length: 1 }],
    },
    path.join(dir, 'unused'),
    dir,
  );
  const input = JSON.parse(await fs.readFile(path.join(dir, 'publication-input.json')));
  assert.deepEqual(input.packages, []);
});

test('previously approved artifacts are reused from authenticated publication without contacting publisher', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mmx-retained-')); t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const manifest = { schemaVersion: 1, id: 'example--counter', publisher: 'example', name: 'Counter', description: 'Retained example', version: '1.0.0', apiVersion: 1, appVersion: '>=0.1.0 <1.0.0', runtime: 'standard', platforms: ['linux'], permissions: [], actions: [{ id: 'count', name: 'Count' }] };
  const bytes = encodePackage(manifest, 'var __pluginModule={default:{actions:{count:{execute(){}}}}};');
  const release = { manifest, status: 'approved', sha256: sha256(bytes), length: bytes.length };
  const registry = { schemaVersion: 1, publishers: [{ id: 'example', name: 'Example', github: 'example' }], releases: [release] };
  const previous = path.join(dir, 'previous'), output = path.join(dir, 'next'), trust = createTrust();
  await importPackage(previous, release, bytes);
  await publishRepository({ directory: previous, registry, root: trust.root, keys: trust.keys, version: 1 });
  await fetchReviewedReleases(registry, path.join(dir, 'no-upstream-source'), output, previous, trust.root);
  assert.deepEqual(await fs.readFile(path.join(output, 'quarantine', release.sha256 + '.mmxp')), bytes);
});
