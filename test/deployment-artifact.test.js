import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createTrust } from '../src/repository.js';
import { preparePagesSite } from '../src/pages.js';
import { renderLanding } from '../src/landing.js';
import { verifyDeploymentTar } from '../src/deployment-artifact.js';

test('actual Pages tar rejects valid older signed bytes when history has advanced', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mmx-deploy-artifact-')); t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const trust = createTrust(), input = path.join(directory, 'input'); await fs.mkdir(input);
  await fs.writeFile(path.join(input, 'registry.json'), JSON.stringify({ schemaVersion: 1, publishers: [], releases: [] }));
  await fs.writeFile(path.join(input, 'root.json'), JSON.stringify(trust.root));
  const first = path.join(directory, 'one'), second = path.join(directory, 'two');
  const options = { inputDirectory: input, keys: trust.keys, baseUrl: 'https://example.org/', allowBootstrap: true };
  await preparePagesSite({ ...options, outputDirectory: first });
  await preparePagesSite({ ...options, previousSiteDirectory: first, outputDirectory: second });
  const archive = path.join(directory, 'old.tar'); execFileSync('tar', ['-cf', archive, '-C', first, '.']);
  await assert.rejects(verifyDeploymentTar({ archive, outputDirectory: path.join(directory, 'old-extracted'), root: trust.root, historyDirectory: second, kind: 'signed' }), /publication|deployed|history|mismatch/i);
  const latest = path.join(directory, 'new.tar'); execFileSync('tar', ['-cf', latest, '-C', second, '.']);
  assert.equal(await verifyDeploymentTar({ archive: latest, outputDirectory: path.join(directory, 'new-extracted'), root: trust.root, historyDirectory: second, kind: 'signed' }), true);
});

test('pending tar contains only the expected landing and rejects archive links', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mmx-pending-tar-')); t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const site = path.join(directory, 'site'); await fs.mkdir(site);
  await fs.writeFile(path.join(site, 'index.html'), renderLanding({ releases: [] }, { active: false })); await fs.writeFile(path.join(site, '.nojekyll'), '');
  const archive = path.join(directory, 'pending.tar'); execFileSync('tar', ['-cf', archive, '-C', site, '.']);
  assert.equal(await verifyDeploymentTar({ archive, outputDirectory: path.join(directory, 'good'), kind: 'pending' }), true);
  await fs.symlink('/etc/passwd', path.join(site, 'index-link')); const linked = path.join(directory, 'bad.tar'); execFileSync('tar', ['-cf', linked, '-C', site, '.']);
  await assert.rejects(verifyDeploymentTar({ archive: linked, outputDirectory: path.join(directory, 'bad'), kind: 'pending' }), /archive|link|unexpected/i);
});
