import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTrust } from '../src/repository.js';
import { productionRules } from '../src/governance.js';
import { rootFingerprint } from '../src/release-gates.js';
import { assessReadiness } from '../src/readiness.js';

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
