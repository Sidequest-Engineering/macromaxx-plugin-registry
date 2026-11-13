import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { preparePagesSite, staticFiles } from './pages.js';
import { exportHistory, publishHistory } from './pages-history.js';
import { readFormattedJSON, validatePublicationInputs } from './check-inputs.js';
import { assertSigningPreflight, validateTransfer, rootFingerprint } from './production-input.js';
import { fetchReviewedReleases } from './source.js';
import { renderLanding } from './landing.js';
import { historyCommit, assertCurrentMain, currentMainCommit, github, repoPath } from './github.js';
import { REGISTRY_REPOSITORY } from './governance.js';
import { assertDeploymentFresh } from './release-gates.js';
import { verifyDeploymentTar } from './deployment-artifact.js';
import { verifyPublicationHistory } from './repository.js';

const baseUrl = 'https://sidequest-engineering.github.io/macromaxx-plugin-registry/';
const command = process.argv[2];
const json = async (file, value) => fs.writeFile(file, JSON.stringify(value, null, 2) + '\n');
const history = async (commit, outputDirectory) => {
  execFileSync('git', ['fetch', '--no-tags', 'origin', commit], { stdio: 'pipe' });
  await exportHistory({ repositoryDirectory: process.cwd(), commit, outputDirectory });
};
const preflight = async root => {
  const audit = await readFormattedJSON('audit-receipt/receipt.json', 8192);
  assertSigningPreflight({ repository: process.env.GITHUB_REPOSITORY, ref: process.env.GITHUB_REF, root, custodySha256: process.env.PRODUCTION_ROOT_CUSTODY_SHA256, audit, revision: process.env.GITHUB_SHA, runId: process.env.GITHUB_RUN_ID, runAttempt: process.env.GITHUB_RUN_ATTEMPT });
  await assertCurrentMain();
  if (audit.historyCommit !== await historyCommit()) throw new Error('Production history changed since the privileged audit.');
};

try {
  if (command === 'inspect') {
    if (process.env.GITHUB_REPOSITORY !== REGISTRY_REPOSITORY || process.env.GITHUB_REF !== 'refs/heads/main') throw new Error('Production deployment is main-only.');
    let active = false;
    if (process.env.PRODUCTION_ROOT_CUSTODY_SHA256) {
      const root = await readFormattedJSON('root.json');
      if (rootFingerprint(root) !== process.env.PRODUCTION_ROOT_CUSTODY_SHA256) throw new Error('Root custody confirmation does not match the reviewed production root.');
      active = true;
    }
    await fs.appendFile(process.env.GITHUB_OUTPUT, `active=${active}\n`);
    console.log(active ? 'Production custody confirmed; protected signing preflight follows.' : 'Activation pending: publishing documentation only, no signed catalog or demo fallback.');
  } else if (command === 'landing') {
    await fs.mkdir('pages-bundle/site', { recursive: true });
    await fs.writeFile('pages-bundle/site/index.html', renderLanding({ releases: [] }, { active: false }));
    await fs.writeFile('pages-bundle/site/.nojekyll', '');
    await staticFiles('pages-bundle/site');
    await json('pages-bundle/deployment-receipt.json', { schemaVersion: 1, kind: 'pending', revision: process.env.GITHUB_SHA, rootSha256: rootFingerprint(await readFormattedJSON('root.json')), historyCommit: null });
  } else if (command === 'import') {
    const root = await readFormattedJSON('root.json'), registry = await readFormattedJSON('registry.json');
    await preflight(root);
    await validatePublicationInputs({ registry, sourceDirectory: 'sources' });
    const previousCommit = await historyCommit();
    if (!previousCommit && process.env.ALLOW_BOOTSTRAP !== 'true') throw new Error('Explicit production bootstrap required; no silent history reset.');
    await fs.mkdir('publication-bundle/packages', { recursive: true });
    if (previousCommit) await history(previousCommit, 'publication-bundle/previous-site');
    await fetchReviewedReleases(registry, 'sources', 'import-work', previousCommit ? 'publication-bundle/previous-site' : undefined, root);
    for (const release of registry.releases.filter(r => r.status === 'approved'))
      await fs.copyFile(path.join('import-work/quarantine', release.sha256 + '.mmxp'), path.join('publication-bundle/packages', release.sha256 + '.mmxp'));
    await json('publication-bundle/registry.json', registry);
    await json('publication-bundle/root.json', root);
    await json('publication-bundle/previous-commit.json', previousCommit);
    await fs.copyFile('import-work/publication-input.json', 'publication-bundle/publication-input.json');
    await validateTransfer({ directory: 'publication-bundle', registry, root });
    console.log('Prepared secretless exact-byte publication input.');
  } else if (command === 'sign') {
    const root = await readFormattedJSON('root.json'), registry = await readFormattedJSON('registry.json');
    await preflight(root);
    await validateTransfer({ directory: 'publication-bundle', registry, root });
    const previousCommit = JSON.parse(await fs.readFile('publication-bundle/previous-commit.json'));
    if (previousCommit !== await historyCommit()) throw new Error('Production history changed after import.');
    // Independently re-export the real commit, not an importer-selected audit state.
    if (previousCommit) await history(previousCommit, 'signing-history');
    const keys = Object.fromEntries(['targets', 'snapshot', 'timestamp'].map(role => [role, process.env['PRODUCTION_' + role.toUpperCase() + '_KEY']]));
    if (Object.values(keys).some(key => !key)) throw new Error('Three separate production online role keys are required. Root private key is never used.');
    await fs.mkdir('pages-bundle');
    const result = await preparePagesSite({ inputDirectory: 'publication-bundle', outputDirectory: 'pages-bundle/site', previousSiteDirectory: previousCommit ? 'signing-history' : undefined, keys, baseUrl, allowBootstrap: process.env.ALLOW_BOOTSTRAP === 'true' });
    await json('pages-bundle/previous-commit.json', previousCommit);
    await json('pages-bundle/signing-receipt.json', { revision: process.env.GITHUB_SHA, rootSha256: rootFingerprint(root), previousCommit });
    console.log(`Signed production metadata version ${result.version}.`);
  } else if (command === 'publish') {
    if (process.env.GITHUB_REPOSITORY !== REGISTRY_REPOSITORY || process.env.GITHUB_REF !== 'refs/heads/main') throw new Error('Production publication is main-only.');
    const previousCommit = JSON.parse(await fs.readFile('pages-bundle/previous-commit.json'));
    await assertCurrentMain();
    const root = await readFormattedJSON('root.json');
    const signed = await readFormattedJSON('pages-bundle/signing-receipt.json');
    if (signed.revision !== process.env.GITHUB_SHA || signed.rootSha256 !== rootFingerprint(root) || signed.previousCommit !== previousCommit) throw new Error('Signed candidate is not bound to this reviewed revision/root/history.');
    await verifyPublicationHistory('pages-bundle/site', root);
    const commit = await publishHistory({ siteDirectory: 'pages-bundle/site', remote: `https://github.com/${REGISTRY_REPOSITORY}.git`, previousCommit });
    await json('pages-bundle/deployment-receipt.json', { schemaVersion: 1, kind: 'signed', revision: process.env.GITHUB_SHA, rootSha256: rootFingerprint(root), historyCommit: commit });
    console.log('Retained production history commit ' + commit);
  } else if (command === 'deploy-check') {
    const root = await readFormattedJSON('root.json'), receipt = await readFormattedJSON('deployment-receipt/deployment-receipt.json', 8192);
    const currentHistoryCommit = await historyCommit();
    assertDeploymentFresh(receipt, { currentMain: await currentMainCommit(), currentHistoryCommit, custodySha256: process.env.PRODUCTION_ROOT_CUSTODY_SHA256, rootSha256: rootFingerprint(root) });
    const id = process.env.PAGES_ARTIFACT_ID;
    if (!/^[0-9]+$/.test(id || '')) throw new Error('Missing immutable Pages artifact ID.');
    const artifact = await github(repoPath + '/actions/artifacts/' + id);
    const name = `production-pages-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}`;
    if (artifact.expired || artifact.name !== name || String(artifact.workflow_run?.id) !== process.env.GITHUB_RUN_ID || artifact.workflow_run?.head_sha !== process.env.GITHUB_SHA) throw new Error('Pages artifact is not bound to this workflow revision/run/attempt.');
    if (receipt.kind === 'signed') await history(currentHistoryCommit, 'deployment-history');
    await verifyDeploymentTar({ archive: 'pages-artifact/artifact.tar', outputDirectory: 'deployment-verified', root, historyDirectory: receipt.kind === 'signed' ? 'deployment-history' : undefined, kind: receipt.kind });
    // Check again after archive verification; workflow concurrency prevents other
    // production publishers from advancing between this check and deploy-pages.
    if (await historyCommit() !== currentHistoryCommit) throw new Error('History advanced during deployment verification.');
    await assertCurrentMain();
    console.log('Actual Pages artifact matches fresh reviewed revision and authoritative history.');
  } else throw new Error('Usage: pages-ci.js inspect | landing | import | sign | publish');
} catch (error) {
  console.error(error.status ? 'Git operation failed (exit ' + error.status + ').' : error.message);
  process.exitCode = 1;
}
