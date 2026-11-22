import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import {
  validateRegistry,
  importPackage,
  createTrust,
  publishRepository,
} from '../src/repository.js';
import { encodePackage } from '@macromaxx/plugin-sdk/contracts';
const manifest = {
  schemaVersion: 1,
  id: 'example--counter',
  publisher: 'example',
  name: 'Counter',
  description: 'Example',
  version: '1.0.0',
  apiVersion: 1,
  appVersion: '>=0.1.0 <1.0.0',
  runtime: 'standard',
  platforms: ['linux'],
  permissions: [],
  actions: [{ id: 'count', name: 'Count' }],
};
const bytes = encodePackage(
  manifest,
  'var __pluginModule={default:{actions:{count:{execute(){}}}}};',
);
const release = {
  manifest,
  sha256: createHash('sha256').update(bytes).digest('hex'),
  length: bytes.length,
  status: 'approved',
};
const registry = {
  schemaVersion: 1,
  publishers: [{ id: 'example', name: 'Example', github: 'example' }],
  releases: [release],
};

test('enforces publisher ownership and immutable release descriptors', () => {
  assert.equal(validateRegistry(registry).releases.length, 1);
  assert.throws(() => validateRegistry({ ...registry, publishers: [] }), /publisher/i);
  assert.throws(
    () => validateRegistry({ ...registry, releases: [release, release] }),
    /duplicate/i,
  );
  assert.throws(
    () =>
      validateRegistry(
        { ...registry, releases: [{ ...release, sha256: 'b'.repeat(64) }] },
        registry,
      ),
    /immutable/i,
  );
  assert.throws(() => validateRegistry({ ...registry, releases: [] }, registry), /removed/i);
});

test('imports exact reviewed bytes create-only and publishes real signed TUF metadata', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mmx-registry-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  await assert.rejects(importPackage(dir, release, Buffer.from('{}')), /hash|length/i);
  await importPackage(dir, release, bytes);
  await importPackage(dir, release, bytes);
  const trust = createTrust();
  await publishRepository({
    directory: dir,
    registry,
    root: trust.root,
    keys: trust.keys,
    version: 1,
  });
  const timestamp = JSON.parse(await fs.readFile(path.join(dir, 'metadata/timestamp.json')));
  assert.equal(timestamp.signed.version, 1);
  assert.equal(timestamp.signatures.length, 1);
  const targetFiles = await fs.readdir(path.join(dir, 'targets'));
  assert.equal(
    JSON.parse(
      await fs.readFile(
        path.join(
          dir,
          'targets',
          targetFiles.find((f) => f.endsWith('.catalog.json')),
        ),
      ),
    ).releases[0].sha256,
    release.sha256,
  );
  await assert.rejects(
    publishRepository({ directory: dir, registry, root: trust.root, keys: trust.keys, version: 1 }),
    /version|exist/i,
  );
});

test('retains byte-exact extended releases and revocations without adding unknown grants to the legacy catalog', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mmx-two-catalogs-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const extended = {
    ...manifest, id: 'example--deck', permissions: ['deck:write', 'opencode:sessions:read'],
    appVersion: '>=0.2.0 <0.3.0',
  };
  const pkg = encodePackage(extended, 'var __pluginModule={default:{actions:{count:{execute(){}}}}};');
  const additional = { manifest: extended, sha256: createHash('sha256').update(pkg).digest('hex'), length: pkg.length, status: 'approved' };
  await importPackage(dir, release, bytes);
  await importPackage(dir, additional, pkg);
  const trust = createTrust();
  const input = { ...registry, releases: [release, additional] };
  const loadCatalog = async (version, name) => {
    const targets = JSON.parse(await fs.readFile(path.join(dir, 'metadata', `${version}.targets.json`)));
    const digest = targets.signed.targets[name]?.hashes.sha256;
    assert.ok(digest, `${name} must be listed in signed targets`);
    return JSON.parse(await fs.readFile(path.join(dir, 'targets', `${digest}.${name}`)));
  };
  await publishRepository({ directory: dir, registry: input, root: trust.root, keys: trust.keys, version: 1 });
  assert.deepEqual((await loadCatalog(1, 'catalog.json')).releases, [release]);
  assert.deepEqual((await loadCatalog(1, 'catalog-v2.json')).releases, [release, additional]);
  const revoked = { ...additional, status: 'revoked' };
  await publishRepository({ directory: dir, registry: { ...input, releases: [release, revoked] }, root: trust.root, keys: trust.keys, version: 2 });
  assert.deepEqual((await loadCatalog(2, 'catalog.json')).releases, [release]);
  assert.deepEqual((await loadCatalog(2, 'catalog-v2.json')).releases, [release, revoked]);
});

test('clean publication requires authenticated history and rejects replay/changed descriptors', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mmx-history-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const previous = path.join(dir, 'previous'),
    next = path.join(dir, 'next'),
    trust = createTrust();
  await importPackage(previous, release, bytes);
  await publishRepository({
    directory: previous,
    registry,
    root: trust.root,
    keys: trust.keys,
    version: 1,
  });
  await assert.rejects(
    publishRepository({
      directory: next,
      registry,
      root: trust.root,
      keys: trust.keys,
      version: 2,
    }),
    (error) => error.message === 'Authenticated previous publication required.',
  );
  const revoked = { ...registry, releases: [{ ...release, status: 'revoked' }] };
  await publishRepository({
    directory: next,
    previousDirectory: previous,
    registry: revoked,
    root: trust.root,
    keys: trust.keys,
    version: 2,
  });
  await assert.rejects(
    publishRepository({
      directory: path.join(dir, 'third'),
      previousDirectory: next,
      registry,
      root: trust.root,
      keys: trust.keys,
      version: 3,
    }),
    /revocation/i,
  );
  await fs.writeFile(
    path.join(previous, 'registry-state.json'),
    JSON.stringify({ version: 1, registry: { ...registry, releases: [] } }),
  );
  await assert.rejects(
    publishRepository({
      directory: path.join(dir, 'tampered'),
      previousDirectory: previous,
      registry: revoked,
      root: trust.root,
      keys: trust.keys,
      version: 2,
    }),
    /hash|length|verif/i,
  );
});
