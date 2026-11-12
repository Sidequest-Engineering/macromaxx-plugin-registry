import { isDeepStrictEqual } from 'node:util';

export const REGISTRY_REPOSITORY = 'Sidequest-Engineering/macromaxx-plugin-registry';
export const SELF_APPROVER_ID = 57414887;
export const ACTIONS_APP_ID = 15368;
export const CODEOWNER = '@Sidequest-Engineering/registry-maintainers';

const scope = branch => ({ ref_name: { include: ['refs/heads/' + branch], exclude: [] } });
const review = required => ({
  type: 'pull_request',
  parameters: {
    required_approving_review_count: required ? 1 : 0,
    require_code_owner_review: required,
    require_last_push_approval: required,
    dismiss_stale_reviews_on_push: required,
    required_review_thread_resolution: true,
    allowed_merge_methods: ['merge', 'squash', 'rebase'],
  },
});

export function productionRules({ selfApproverId = SELF_APPROVER_ID, actionsAppId = ACTIONS_APP_ID } = {}) {
  return [
    { name: 'MacroMaxx main integrity', target: 'branch', enforcement: 'active', bypass_actors: [], conditions: scope('main'), rules: [
      review(false),
      { type: 'required_status_checks', parameters: { required_status_checks: [{ context: 'validate', integration_id: actionsAppId }], strict_required_status_checks_policy: true, do_not_enforce_on_create: false } },
      { type: 'non_fast_forward' }, { type: 'deletion' },
    ] },
    { name: 'MacroMaxx Codeowner review', target: 'branch', enforcement: 'active', bypass_actors: [{ actor_type: 'User', actor_id: selfApproverId, bypass_mode: 'pull_request' }], conditions: scope('main'), rules: [review(true)] },
    { name: 'MacroMaxx publication history', target: 'branch', enforcement: 'active', bypass_actors: [], conditions: scope('production-publication'), rules: [{ type: 'non_fast_forward' }, { type: 'deletion' }] },
  ];
}

export function verifyGovernance({ rules, codeowners, selfApproverId = SELF_APPROVER_ID, actionsAppId = ACTIONS_APP_ID }) {
  const fail = reason => { throw new Error('Publication governance invalid: ' + reason); };
  const lines = codeowners?.split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#'));
  if (lines?.length !== 1 || lines[0].split(/\s+/).join(' ') !== '* ' + CODEOWNER)
    fail('Codeowner policy must cover all files with the registry maintainers team.');
  const contains = (actual, expected) => {
    if (expected === null || typeof expected !== 'object') return actual === expected;
    if (Array.isArray(expected)) return Array.isArray(actual) && expected.every(item => actual.some(value => contains(value, item)));
    return actual && Object.entries(expected).every(([key, value]) => contains(actual[key], value));
  };
  for (const expected of productionRules({ selfApproverId, actionsAppId })) {
    const matches = rules?.filter(rule => rule.name === expected.name);
    if (matches?.length !== 1) fail('Required protection rule missing or duplicated: ' + expected.name);
    const actual = matches[0];
    if (actual.target !== 'branch' || actual.enforcement !== 'active' || !isDeepStrictEqual(actual.conditions?.ref_name, expected.conditions.ref_name))
      fail('Protection rule inactive or scoped incorrectly: ' + expected.name);
    if (!Array.isArray(actual.bypass_actors)) fail('Bypass policy hidden by GitHub; a privileged audit receipt is required.');
    const actors = actual.bypass_actors;
    if (actors.length !== expected.bypass_actors.length || !actors.every((actor, i) => contains(actor, expected.bypass_actors[i])))
      fail('Unexpected bypass policy: ' + expected.name);
    for (const rule of expected.rules) {
      const candidates = actual.rules?.filter(r => r.type === rule.type);
      // API may add optional defaults, but every security constraint must match.
      const required = structuredClone(rule);
      if (required.parameters) delete required.parameters.allowed_merge_methods;
      if (candidates?.length !== 1 || !contains(candidates[0], required)) fail('Required rule relaxed: ' + rule.type);
    }
  }
  return true;
}
