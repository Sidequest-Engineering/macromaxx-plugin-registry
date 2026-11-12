import { test } from 'node:test';
import assert from 'node:assert/strict';
import { productionRules, verifyGovernance } from '../src/governance.js';

// Hand-specified effective policy: the named exception is never on core integrity rules.
function fixture() {
  return {
    selfApproverId: 57414887, actionsAppId: 15368,
    codeowners: '# All publication code and descriptors\n* @Sidequest-Engineering/registry-maintainers\n',
    rules: [
      { name: 'MacroMaxx main integrity', target: 'branch', enforcement: 'active', bypass_actors: [], conditions: { ref_name: { include: ['refs/heads/main'], exclude: [] } }, rules: [
        { type: 'pull_request', parameters: { required_approving_review_count: 0, require_code_owner_review: false, require_last_push_approval: false, dismiss_stale_reviews_on_push: false, required_review_thread_resolution: true } },
        { type: 'required_status_checks', parameters: { required_status_checks: [{ context: 'validate', integration_id: 15368 }], strict_required_status_checks_policy: true, do_not_enforce_on_create: false } },
        { type: 'non_fast_forward' }, { type: 'deletion' },
      ] },
      { name: 'MacroMaxx Codeowner review', target: 'branch', enforcement: 'active', bypass_actors: [{ actor_type: 'User', actor_id: 57414887, bypass_mode: 'pull_request' }], conditions: { ref_name: { include: ['refs/heads/main'], exclude: [] } }, rules: [
        { type: 'pull_request', parameters: { required_approving_review_count: 1, require_code_owner_review: true, require_last_push_approval: true, dismiss_stale_reviews_on_push: true, required_review_thread_resolution: true } },
      ] },
      { name: 'MacroMaxx publication history', target: 'branch', enforcement: 'active', bypass_actors: [], conditions: { ref_name: { include: ['refs/heads/production-publication'], exclude: [] } }, rules: [{ type: 'non_fast_forward' }, { type: 'deletion' }] },
    ],
  };
}

test('accepts actual protected main with a PR-only named review exception', () => {
  assert.equal(verifyGovernance(fixture()), true);
  const generated = productionRules({ selfApproverId: 57414887, actionsAppId: 15368 });
  assert.equal(verifyGovernance({ ...fixture(), rules: generated }), true);
  const core = generated.find(r => r.name === 'MacroMaxx main integrity');
  assert.deepEqual(core.bypass_actors, []);
  assert.ok(core.rules.some(r => r.type === 'required_status_checks' && r.parameters.required_status_checks.some(c => c.context === 'validate' && c.integration_id === 15368)));
});

test('rejects bypassed CI, missing PR requirement and broadened review privileges', () => {
  const mutations = [
    f => { f.rules[0].bypass_actors.push({ actor_type: 'OrganizationAdmin', bypass_mode: 'always' }); },
    f => { f.rules[0].rules = f.rules[0].rules.filter(r => r.type !== 'pull_request'); },
    f => { f.rules[0].rules[1].parameters.required_status_checks = []; },
    f => { f.rules[0].rules[1].parameters.required_status_checks[0].integration_id = 1; },
    f => { f.rules[1].bypass_actors[0].actor_id = 1; },
    f => { f.rules[1].bypass_actors[0].bypass_mode = 'always'; },
    f => { f.rules[1].bypass_actors.push({ actor_type: 'Team', actor_id: 2, bypass_mode: 'pull_request' }); },
    f => { f.rules[1].rules[0].parameters.require_code_owner_review = false; },
    f => { f.rules[0].rules = f.rules[0].rules.filter(r => r.type !== 'non_fast_forward'); },
    f => { f.rules[2].rules = []; },
    f => { f.rules[0].conditions.ref_name.exclude = ['refs/heads/main']; },
    f => { f.rules[0].enforcement = 'evaluate'; },
    f => { f.codeowners += '/src/ @somebody-else\n'; },
    f => { f.codeowners = '* @Sidequest-Engineering/wrong-team'; },
  ];
  for (const mutate of mutations) {
    const value = fixture(); mutate(value);
    assert.throws(() => verifyGovernance(value), /governance|Codeowner|protect|policy|rule|bypass/i);
  }
});

test('accepts equivalent GitHub API object field ordering without relaxing branch scope', () => {
  const value = fixture();
  value.rules[0].conditions.ref_name = { exclude: [], include: ['refs/heads/main'] };
  assert.equal(verifyGovernance(value), true);
});
