import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTrust } from '../src/repository.js';
import { productionRules } from '../src/governance.js';
import { rootFingerprint } from '../src/release-gates.js';
import { assessReadiness } from '../src/readiness.js';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

function fixture() {
  const { root } = createTrust();
  const environment = secrets => ({ deployment_branch_policy: { protected_branches: false, custom_branch_policies: true }, policies: [{ name: 'main', type: 'branch' }], secrets, variables: {} });
  return { root, rules: productionRules(), codeowners: '* @Sidequest-Engineering/registry-maintainers', variables: { PRODUCTION_ROOT_CUSTODY_SHA256: rootFingerprint(root) }, historyCommit: null, environments: {
    'production-store-signing': environment(['PRODUCTION_TARGETS_KEY', 'PRODUCTION_SNAPSHOT_KEY', 'PRODUCTION_TIMESTAMP_KEY']),
    'production-governance': { ...environment(['GOVERNANCE_APP_PRIVATE_KEY']), variables: { GOVERNANCE_APP_ID: '123456' } },
  } };
}

test('doctor distinguishes configured bootstrap prerequisites from actual live delivery acceptance', () => {
  const result = assessReadiness(fixture());
  assert.equal(result.readyForBootstrap, true);
  assert.deepEqual(result.blockers, []);
  assert.equal(result.deliveryReady, false);
  assert.equal(result.publication, 'not-published');
});

test('doctor reports all missing operator inputs instead of guessing custody or credential presence', () => {
  const f = fixture(); f.variables = {};
  f.environments['production-store-signing'].secrets = [];
  f.environments['production-governance'].secrets = [];
  f.environments['production-governance'].variables = {};
  const result = assessReadiness(f);
  assert.equal(result.readyForBootstrap, false);
  for (const id of ['custody', 'online-keys', 'auditor']) assert.ok(result.blockers.some(item => item.id === id), id);
  assert.ok(result.blockers.every(item => typeof item.action === 'string' && item.action.length > 10));
});

test('doctor refuses tampered/expiring roots, hidden bypass data and broadened environments', () => {
  const cases = [
    f => { f.root.signed.version++; },
    f => { f.now = Date.parse(f.root.signed.expires) - 86400000; },
    f => { delete f.rules[0].bypass_actors; },
    f => { f.environments['production-store-signing'].policies.push({ name: '*', type: 'branch' }); },
    f => { f.environments['production-governance'].policies = []; },
    f => { f.environments['production-governance'].variables.PRODUCTION_ROOT_CUSTODY_SHA256 = 'shadow'; },
    f => { f.variables.PRODUCTION_ROOT_CUSTODY_SHA256 = 'a'.repeat(64); },
    f => { f.environments = {}; },
  ];
  for (const change of cases) { const f = fixture(); change(f); assert.equal(assessReadiness(f).readyForBootstrap, false); }
});

test('doctor treats unavailable remote inventory as a blocker and never leaks supplied secrets into its report', () => {
  const f = fixture(); f.inventoryErrors = ['Cannot inspect production-governance secret names.'];
  f.environments['production-governance'].variables.UNRELATED = 'never-echo-this';
  const result = assessReadiness(f);
  assert.equal(result.readyForBootstrap, false);
  assert.doesNotMatch(JSON.stringify(result), /never-echo-this/);
});

test('real doctor CLI refuses missing, inconsistent or invalid API collection counts', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mmx-doctor-api-')); t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const f = fixture(), prefix = 'repos/Sidequest-Engineering/macromaxx-plugin-registry';
  await fs.writeFile(path.join(directory, 'root.json'), JSON.stringify(f.root, null, 2) + '\n');
  await fs.mkdir(path.join(directory, '.github')); await fs.writeFile(path.join(directory, '.github/CODEOWNERS'), f.codeowners);
  const routes = { [prefix + '/rulesets?includes_parents=true&per_page=100']: f.rules.map((_, i) => ({ id: i + 1 })), [prefix + '/git/matching-refs/heads/production-publication']: [] };
  f.rules.forEach((rule, i) => { routes[prefix + '/rulesets/' + (i + 1)] = rule; });
  const collectionRoutes = [prefix + '/actions/variables?per_page=100'];
  const vars = value => ({ total_count: Object.keys(value).length, variables: Object.entries(value).map(([name, value]) => ({ name, value })) });
  routes[collectionRoutes[0]] = vars(f.variables);
  for (const [name, env] of Object.entries(f.environments)) {
    const base = prefix + '/environments/' + name;
    routes[base] = { deployment_branch_policy: env.deployment_branch_policy };
    routes[base + '/deployment-branch-policies?per_page=100'] = { total_count: env.policies.length, branch_policies: env.policies };
    routes[base + '/secrets?per_page=100'] = { total_count: env.secrets.length, secrets: env.secrets.map(name => ({ name })) };
    routes[base + '/variables?per_page=100'] = vars(env.variables);
    collectionRoutes.push(base + '/deployment-branch-policies?per_page=100', base + '/secrets?per_page=100', base + '/variables?per_page=100');
  }
  const fixtureFile = path.join(directory, 'routes.json'), bin = path.join(directory, 'bin'); await fs.mkdir(bin);
  await fs.writeFile(path.join(bin, 'gh'), `#!${process.execPath}\nconst fs=require('node:fs');const r=JSON.parse(fs.readFileSync(${JSON.stringify(fixtureFile)}));if(!Object.hasOwn(r,process.argv[3]))process.exit(2);process.stdout.write(JSON.stringify(r[process.argv[3]]));\n`, { mode: 0o700 });
  const run = async value => {
    await fs.writeFile(fixtureFile, JSON.stringify(value));
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('../src/ops.js', import.meta.url))], { cwd: directory, env: { ...process.env, PATH: bin + path.delimiter + process.env.PATH }, encoding: 'utf8' });
    return { status: result.status, report: JSON.parse(result.stdout) };
  };
  assert.equal((await run(routes)).report.readyForBootstrap, true);
  for (const route of collectionRoutes) {
    const missing = structuredClone(routes); delete missing[route].total_count;
    const result = await run(missing); assert.equal(result.status, 1, route); assert.ok(result.report.blockers.some(b => b.id === 'inventory'));
  }
  for (const count of [-1, 1.5, '1', 1000]) { const invalid = structuredClone(routes); invalid[collectionRoutes[0]].total_count = count; assert.equal((await run(invalid)).status, 1); }
});
