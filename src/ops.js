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
  const collection = (route, key, validItem) => {
    const value = api(route), items = value?.[key];
    if (!Number.isSafeInteger(value?.total_count) || value.total_count < 0 || value.total_count > 100 || !Array.isArray(items) || value.total_count !== items.length || !items.every(validItem)) {
      inventoryErrors.push('Incomplete or malformed collection: ' + route.split('?')[0]);
      return [];
    }
    return items;
  };
  const named = item => item && typeof item.name === 'string' && /^[a-zA-Z_][a-zA-Z_0-9]*$/.test(item.name);
  const variable = item => named(item) && typeof item.value === 'string';
  const root = await readFormattedJSON('root.json');
  const summaries = api(prefix + '/rulesets?includes_parents=true&per_page=100');
  if (!Array.isArray(summaries) || summaries.length >= 100 || !summaries.every(r => Number.isSafeInteger(r?.id) && r.id > 0)) inventoryErrors.push('Incomplete ruleset inventory.');
  const rules = Array.isArray(summaries) ? summaries.map(r => api(prefix + '/rulesets/' + r.id)).filter(Boolean) : [];
  const variables = Object.fromEntries(collection(prefix + '/actions/variables?per_page=100', 'variables', variable).map(v => [v.name, v.value]));
  const environments = {};
  for (const name of ['production-store-signing', 'production-governance']) {
    const env = api(prefix + '/environments/' + name);
    const policies = collection(prefix + '/environments/' + name + '/deployment-branch-policies?per_page=100', 'branch_policies', p => typeof p?.name === 'string' && ['branch', 'tag'].includes(p.type));
    const secrets = collection(prefix + '/environments/' + name + '/secrets?per_page=100', 'secrets', named);
    const vars = collection(prefix + '/environments/' + name + '/variables?per_page=100', 'variables', variable);
    environments[name] = { ...env, policies, secrets: secrets.map(s => s.name), variables: Object.fromEntries(vars.map(v => [v.name, v.value])) };
  }
  const refs = api(prefix + '/git/matching-refs/heads/production-publication');
  if (!Array.isArray(refs) || !refs.every(r => typeof r?.ref === 'string' && /^[a-f0-9]{40}$/.test(r.object?.sha || ''))) inventoryErrors.push('Invalid history reference inventory.');
  const historyCommit = refs?.find(ref => ref.ref === 'refs/heads/production-publication')?.object?.sha || null;
  const result = assessReadiness({ root, rules, codeowners: await fs.readFile('.github/CODEOWNERS', 'utf8'), variables, environments, historyCommit, inventoryErrors });
  console.log(JSON.stringify(result, null, 2));
  if (!result.readyForBootstrap) process.exitCode = 1;
} catch { console.error('Readiness inspection failed; check gh authentication and run from a reviewed registry checkout. No remote settings were changed.'); process.exitCode = 1; }
