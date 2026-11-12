import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createTrust } from '../src/repository.js';
import { fetchReviewedReleases } from '../src/source.js';
import { readFormattedJSON as readFormattedRoot } from '../src/check-inputs.js';
import { assertSigningPreflight, validateTransfer } from '../src/production-input.js';

test('signing requires protected main and an explicit custody confirmation for this exact public root', () => {
  const { root } = createTrust();
  const fingerprint = createHash('sha256').update(JSON.stringify(root)).digest('hex');
  const now = Date.now(), revision = 'a'.repeat(40), repository = 'Sidequest-Engineering/macromaxx-plugin-registry';
  const audit = { schemaVersion: 1, kind: 'governance-audit', repository, revision, runId: '123', runAttempt: '1', rootSha256: fingerprint, historyCommit: null, rulesVerified: true, issuedAt: now, expiresAt: now + 900000 };
  const input = { repository, ref: 'refs/heads/main', root, custodySha256: fingerprint, audit, revision, runId: '123', runAttempt: '1', now };
  assert.equal(assertSigningPreflight(input), true);
  for (const change of [{ ref: 'refs/heads/feature' }, { repository: 'attacker/fork' }, { custodySha256: '' }, { custodySha256: 'a'.repeat(64) }, { audit: { ...audit, rulesVerified: false } }])
    assert.throws(() => assertSigningPreflight({ ...input, ...change }), /main|repository|custody|governance|protect|audit/i);
});

test('secretless empty imports transfer to signing without requiring any package and reject alteration', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mmx-transfer-')); t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const registry = { schemaVersion: 1, publishers: [], releases: [] }, { root } = createTrust();
  await fetchReviewedReleases(registry, directory, directory);
  await fs.mkdir(path.join(directory, 'packages'));
  await fs.writeFile(path.join(directory, 'registry.json'), JSON.stringify(registry, null, 2) + '\n');
  await fs.writeFile(path.join(directory, 'root.json'), JSON.stringify(root, null, 2) + '\n');
  await fs.writeFile(path.join(directory, 'previous-commit.json'), 'null\n');
  assert.equal(await validateTransfer({ directory, registry, root }), true);
  await fs.rmdir(path.join(directory, 'packages'));
  assert.equal(await validateTransfer({ directory, registry, root }), true);
  await fs.mkdir(path.join(directory, 'packages'));
  await fs.writeFile(path.join(directory, 'packages/private.pem'), 'not a key');
  await assert.rejects(validateTransfer({ directory, registry, root }), /unexpected|package/i);
  await fs.unlink(path.join(directory, 'packages/private.pem'));
  await fs.writeFile(path.join(directory, 'publication-input.json'), '{"registrySha256":"altered","packages":[]}');
  await assert.rejects(validateTransfer({ directory, registry, root }), /digest|match|input/i);
});

test('real inactive deployment CLI emits an honest landing and never signs or creates test endpoints', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mmx-pending-cli-')); t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const { root } = createTrust(); await fs.writeFile(path.join(directory, 'root.json'), JSON.stringify(root, null, 2) + '\n');
  const script = fileURLToPath(new URL('../src/pages-ci.js', import.meta.url));
  const output = path.join(directory, 'output'); await fs.writeFile(output, '');
  const result = spawnSync(process.execPath, [script, 'inspect'], { cwd: directory, encoding: 'utf8', env: { ...process.env, GITHUB_REPOSITORY: 'Sidequest-Engineering/macromaxx-plugin-registry', GITHUB_REF: 'refs/heads/main', PRODUCTION_ROOT_CUSTODY_SHA256: '', GITHUB_OUTPUT: output, GH_TOKEN: '' } });
  assert.equal(result.status, 0, result.stderr); assert.equal(await fs.readFile(output, 'utf8'), 'active=false\n');
  const landing = spawnSync(process.execPath, [script, 'landing'], { cwd: directory, encoding: 'utf8', env: { ...process.env, GITHUB_SHA: 'a'.repeat(40) } });
  assert.equal(landing.status, 0, landing.stderr);
  assert.deepEqual((await fs.readdir(path.join(directory, 'pages-bundle/site'))).sort(), ['.nojekyll', 'index.html']);
  assert.match(await fs.readFile(path.join(directory, 'pages-bundle/site/index.html'), 'utf8'), /Registry activation pending/);
  const receipt = JSON.parse(await fs.readFile(path.join(directory, 'pages-bundle/deployment-receipt.json')));
  assert.equal(receipt.kind, 'pending'); assert.equal(receipt.revision, 'a'.repeat(40));
});

test('operator init produces a public root directly accepted by production formatting validation', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mmx-root-cli-')); t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const cli = fileURLToPath(new URL('../src/cli.js', import.meta.url));
  const result = spawnSync(process.execPath, [cli, 'init', path.join(directory, 'keys'), path.join(directory, 'root.json')], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal((await readFormattedRoot(path.join(directory, 'root.json'))).signed._type, 'root');
});

test('public fingerprint command computes the exact custody gate value, not the pretty file checksum', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mmx-fingerprint-')); t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const { root } = createTrust(), file = path.join(directory, 'root.json');
  await fs.writeFile(file, JSON.stringify(root, null, 2) + '\n');
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../src/cli.js', import.meta.url)), 'fingerprint', file], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), createHash('sha256').update(JSON.stringify(root)).digest('hex'));
});
