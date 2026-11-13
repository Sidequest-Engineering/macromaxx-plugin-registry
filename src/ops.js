// Read-only local operator CLI. GitHub secret APIs return names/metadata only.
import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { assessReadiness } from './readiness.js';
import { REGISTRY_REPOSITORY } from './governance.js';
import { readFormattedJSON } from './check-inputs.js';

try {
  if (process.argv.length !== 2) throw new Error('Usage: npm run store:doctor (run in the reviewed registry checkout)');
  const inventoryErrors = [];
  const api = route => {
    try { return JSON.parse(execFileSync('gh', ['api', route], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000, maxBuffer: 5 * 1024 * 1024 })); }
    catch { inventoryErrors.push('Cannot inspect ' + route.split('?')[0]); return null; }
  };
  const prefix = 'repos/' + REGISTRY_REPOSITORY;
  const root = await readFormattedJSON('root.json');
  const summaries = api(prefix + '/rulesets?includes_parents=true&per_page=100');
  const rules = Array.isArray(summaries) ? summaries.map(r => api(prefix + '/rulesets/' + r.id)).filter(Boolean) : [];
  const variablesResponse = api(prefix + '/actions/variables?per_page=100');
  const variables = Object.fromEntries((variablesResponse?.variables || []).map(v => [v.name, v.value]));
  if (variablesResponse?.total_count > 100) inventoryErrors.push('Too many repository variables for a complete inventory.');
  const environments = {};
  for (const name of ['production-store-signing', 'production-governance']) {
    const env = api(prefix + '/environments/' + name);
    const policies = api(prefix + '/environments/' + name + '/deployment-branch-policies?per_page=100');
    const secrets = api(prefix + '/environments/' + name + '/secrets?per_page=100');
    const vars = api(prefix + '/environments/' + name + '/variables?per_page=100');
    if ([policies, secrets, vars].some(value => value?.total_count > 100)) inventoryErrors.push('Incomplete environment inventory: ' + name);
    environments[name] = { ...env, policies: policies?.branch_policies, secrets: secrets?.secrets?.map(s => s.name), variables: vars ? Object.fromEntries(vars.variables.map(v => [v.name, v.value])) : undefined };
  }
  const refs = api(prefix + '/git/matching-refs/heads/production-publication');
  const historyCommit = refs?.find(ref => ref.ref === 'refs/heads/production-publication')?.object?.sha || null;
  const result = assessReadiness({ root, rules, codeowners: await fs.readFile('.github/CODEOWNERS', 'utf8'), variables, environments, historyCommit, inventoryErrors });
  console.log(JSON.stringify(result, null, 2));
  if (!result.readyForBootstrap) process.exitCode = 1;
} catch { console.error('Readiness inspection failed; check gh authentication and run from a reviewed registry checkout. No remote settings were changed.'); process.exitCode = 1; }
