import { assessHealth, incidentActions, verifyLiveRegistry } from './health.js';
import { github, repoPath, historyCommit } from './github.js';
import { readFormattedJSON } from './check-inputs.js';
import { rootFingerprint } from './production-input.js';

const marker = '<!-- macromaxx-registry-health -->';
try {
  const commit = await historyCommit();
  let health;
  if (!commit && !process.env.PRODUCTION_ROOT_CUSTODY_SHA256) health = assessHealth({ configured: false });
  else {
    try {
      if (!commit) throw new Error('Production is configured but has no publication history.');
      const root = await readFormattedJSON('root.json');
      if (!process.env.PRODUCTION_ROOT_CUSTODY_SHA256 || rootFingerprint(root) !== process.env.PRODUCTION_ROOT_CUSTODY_SHA256) throw new Error('Production root custody confirmation is absent or changed; renewal cannot proceed.');
      if (process.env.DEPLOYMENT_FAILED === 'true') throw new Error('Production signing/deployment workflow failed. Inspect the workflow before trust expires.');
      health = assessHealth({ configured: true, ...await verifyLiveRegistry({ root, baseUrl: 'https://sidequest-engineering.github.io/macromaxx-plugin-registry/' }) });
    } catch (error) { health = assessHealth({ configured: true, error: error.message }); }
  }
  const issues = await github(repoPath + '/issues?state=open&per_page=100&labels=registry-health');
  const incidents = issues.filter(issue => issue.user?.login === 'github-actions[bot]' && issue.body?.startsWith(marker)).map(issue => ({ number: issue.number, state: issue.state, message: issue.body.slice(marker.length).trim() }));
  for (const action of incidentActions(health, incidents)) {
    if (action.action === 'create') await github(repoPath + '/issues', { method: 'POST', body: { title: 'Registry health: operator attention required', body: marker + '\n\n' + action.message, labels: ['registry-health'] } });
    else await github(repoPath + '/issues/' + action.number, { method: 'PATCH', body: action.action === 'close' ? { state: 'closed' } : { body: marker + '\n\n' + action.message } });
  }
  console.log(JSON.stringify(health));
  if (['error', 'warning'].includes(health.kind)) process.exitCode = 1;
} catch (error) { console.error(error.message); process.exitCode = 1; }
