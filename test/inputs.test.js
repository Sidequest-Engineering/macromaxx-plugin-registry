import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { readFormattedJSON, validatePublicationInputs } from '../src/check-inputs.js';

async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mmx-inputs-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const registry = await readFormattedJSON(new URL('../examples/registry.json', import.meta.url));
  const source = await readFormattedJSON(new URL('../examples/source.json', import.meta.url));
  const file = path.join(directory, registry.releases[0].sha256 + '.json');
  await fs.writeFile(file, JSON.stringify(source, null, 2) + '\n');
  return { directory, registry, source, file };
}

test('documented publisher/release/source examples validate without executing or fetching code', async t => {
  const f = await fixture(t);
  assert.equal(await validatePublicationInputs({ registry: f.registry, sourceDirectory: f.directory }), 1);
  const empty = path.join(f.directory, 'empty'); await fs.mkdir(empty);
  assert.equal(await validatePublicationInputs({ registry: { schemaVersion: 1, publishers: [], releases: [] }, sourceDirectory: empty }), 0);
});

test('rejects missing or unpinned release sources and malformed immutable descriptors', async t => {
  const f = await fixture(t);
  await fs.writeFile(f.file, JSON.stringify({ ...f.source, commit: 'main' }, null, 2) + '\n');
  await assert.rejects(validatePublicationInputs({ registry: f.registry, sourceDirectory: f.directory }), /pinned|source/i);
  await fs.unlink(f.file);
  await assert.rejects(validatePublicationInputs({ registry: f.registry, sourceDirectory: f.directory }), /ENOENT|source/i);
  f.registry.releases[0].sha256 = '../wrong';
  await assert.rejects(validatePublicationInputs({ registry: f.registry, sourceDirectory: f.directory }), /Invalid release|SHA|digest|hash/i);
});

test('requires readable JSON and refuses source links or extra unreviewed source files', async t => {
  const f = await fixture(t);
  await fs.writeFile(f.file, JSON.stringify(f.source));
  await assert.rejects(readFormattedJSON(f.file), /format|indent/i);
  await fs.unlink(f.file);
  await fs.symlink('/etc/passwd', f.file);
  await assert.rejects(validatePublicationInputs({ registry: f.registry, sourceDirectory: f.directory }), /regular|file|link/i);
  await fs.unlink(f.file);
  await fs.writeFile(f.file, JSON.stringify(f.source, null, 2) + '\n');
  await fs.writeFile(path.join(f.directory, 'private.pem'), 'not a real key');
  await assert.rejects(validatePublicationInputs({ registry: f.registry, sourceDirectory: f.directory }), /unexpected|source/i);
});
