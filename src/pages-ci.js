import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { preparePagesSite } from './pages.js';
import { exportHistory, publishHistory } from './pages-history.js';

const [command] = process.argv.slice(2);
try {
  if (command === 'prepare') {
    const repository = process.env.GITHUB_REPOSITORY;
    if (repository !== 'Sidequest-Engineering/macromaxx-plugin-registry' || process.env.GITHUB_REF !== 'refs/heads/main') throw new Error('Test signing is main-only.');
    const response = await fetch(`https://api.github.com/repos/${repository}/git/ref/heads/gh-pages`, { headers: { Authorization: `Bearer ${process.env.GH_TOKEN}`, Accept: 'application/vnd.github+json' }, redirect: 'error' });
    let previousCommit = null;
    if (response.ok) {
      previousCommit = (await response.json()).object.sha;
      if (!/^[a-f0-9]{40}$/.test(previousCommit)) throw new Error('Invalid history commit.');
      execFileSync('git', ['fetch', '--no-tags', 'origin', previousCommit], { stdio: 'pipe' });
      await exportHistory({ repositoryDirectory: process.cwd(), commit: previousCommit, outputDirectory: 'previous-site' });
    } else if (response.status !== 404) throw new Error('Cannot read history: HTTP ' + response.status);
    const keys = Object.fromEntries(['targets', 'snapshot', 'timestamp'].map(role => [role, process.env[`TEST_${role.toUpperCase()}_KEY`]]));
    const result = await preparePagesSite({ inputDirectory: 'test-store', outputDirectory: 'pages-bundle/site', previousSiteDirectory: previousCommit ? 'previous-site' : undefined, keys, baseUrl: 'https://sidequest-engineering.github.io/macromaxx-plugin-registry/', allowBootstrap: process.env.ALLOW_BOOTSTRAP === 'true' });
    await fs.writeFile('pages-bundle/previous-commit.json', JSON.stringify(previousCommit));
    console.log(`Prepared test metadata version ${result.version}; prior history ${previousCommit || 'explicit initial bootstrap'}.`);
  } else if (command === 'publish') {
    const previousCommit = JSON.parse(await fs.readFile('pages-bundle/previous-commit.json'));
    console.log('Published history commit ' + await publishHistory({ siteDirectory: 'pages-bundle/site', remote: `https://github.com/${process.env.GITHUB_REPOSITORY}.git`, previousCommit }));
  } else throw new Error('Usage: pages-ci.js prepare | publish');
} catch (error) {
  // Never emit child-process buffers: Git authentication or environment can contain secrets.
  console.error(error.status ? 'Git operation failed (exit ' + error.status + ').' : error.message);
  process.exitCode = 1;
}
