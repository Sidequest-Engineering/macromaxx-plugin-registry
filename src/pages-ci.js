import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { preparePagesSite, staticFiles } from './pages.js';
import { exportHistory, publishHistory } from './pages-history.js';
import { readFormattedJSON, validatePublicationInputs } from './check-inputs.js';
import { assertSigningPreflight, validateTransfer, rootFingerprint } from './production-input.js';
import { fetchReviewedReleases } from './source.js';
import { renderLanding } from './landing.js';
import { historyCommit, liveGovernance } from './github.js';
import { REGISTRY_REPOSITORY } from './governance.js';

const baseUrl = 'https://sidequest-engineering.github.io/macromaxx-plugin-registry/';
const command = process.argv[2];
const json = async (file, value) => fs.writeFile(file, JSON.stringify(value, null, 2) + '\n');
const history = async (commit, outputDirectory) => {
  execFileSync('git', ['fetch', '--no-tags', 'origin', commit], { stdio: 'pipe' });
  await exportHistory({ repositoryDirectory: process.cwd(), commit, outputDirectory });
};
const preflight = async root => assertSigningPreflight({ repository: process.env.GITHUB_REPOSITORY, ref: process.env.GITHUB_REF, root, custodySha256: process.env.PRODUCTION_ROOT_CUSTODY_SHA256, governance: await liveGovernance() });

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
    console.log(`Signed production metadata version ${result.version}.`);
  } else if (command === 'publish') {
    if (process.env.GITHUB_REPOSITORY !== REGISTRY_REPOSITORY || process.env.GITHUB_REF !== 'refs/heads/main') throw new Error('Production publication is main-only.');
    const previousCommit = JSON.parse(await fs.readFile('pages-bundle/previous-commit.json'));
    console.log('Retained production history commit ' + await publishHistory({ siteDirectory: 'pages-bundle/site', remote: `https://github.com/${REGISTRY_REPOSITORY}.git`, previousCommit }));
  } else throw new Error('Usage: pages-ci.js inspect | landing | import | sign | publish');
} catch (error) {
  console.error(error.status ? 'Git operation failed (exit ' + error.status + ').' : error.message);
  process.exitCode = 1;
}
