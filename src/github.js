import fs from 'node:fs/promises';
import { REGISTRY_REPOSITORY, SELF_APPROVER_ID, ACTIONS_APP_ID, CODEOWNER } from './governance.js';

export const repoPath = '/repos/' + REGISTRY_REPOSITORY;
export async function github(route, { method = 'GET', body, allow404 = false } = {}) {
  if (!process.env.GH_TOKEN) throw new Error('A scoped GitHub token is required.');
  const response = await fetch('https://api.github.com' + route, { method, headers: { Authorization: 'Bearer ' + process.env.GH_TOKEN, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(20000) });
  if (allow404 && response.status === 404) { await response.body?.cancel(); return null; }
  if (!response.ok) { await response.body?.cancel(); throw new Error(`GitHub API HTTP ${response.status} at ${route.split('?')[0]}`); }
  return response.status === 204 ? null : response.json();
}

export async function historyCommit() {
  const value = await github(repoPath + '/git/ref/heads/production-publication', { allow404: true });
  if (value === null) return null;
  if (!/^[a-f0-9]{40}$/.test(value.object?.sha)) throw new Error('Invalid production history commit.');
  return value.object.sha;
}

export async function currentMainCommit() {
  const main = await github(repoPath + '/git/ref/heads/main');
  if (!/^[a-f0-9]{40}$/.test(main.object?.sha)) throw new Error('Invalid main revision.');
  return main.object.sha;
}

export async function assertCurrentMain() {
  if (await currentMainCommit() !== process.env.GITHUB_SHA) throw new Error('Protected main moved; refusing a stale publication/deployment.');
}

export async function liveGovernance() {
  await assertCurrentMain();
  const account = await github('/users/EinCloudy');
  if (account.id !== SELF_APPROVER_ID) throw new Error('Named self-approver identity changed.');
  const summaries = await github(repoPath + '/rulesets?includes_parents=true&per_page=100');
  const rules = await Promise.all(summaries.map(rule => {
    if (!Number.isSafeInteger(rule.id)) throw new Error('Invalid GitHub ruleset identity.');
    return github(repoPath + '/rulesets/' + rule.id);
  }));
  const errors = await github(repoPath + '/codeowners/errors?ref=' + process.env.GITHUB_SHA);
  if (!Array.isArray(errors.errors) || errors.errors.length) throw new Error('GitHub reports invalid CODEOWNERS.');
  const environment = await github(repoPath + '/environments/production-store-signing');
  const policies = await github(repoPath + '/environments/production-store-signing/deployment-branch-policies');
  if (!environment.deployment_branch_policy?.custom_branch_policies || policies.branch_policies?.length !== 1 || policies.branch_policies[0].name !== 'main' || policies.branch_policies[0].type !== 'branch')
    throw new Error('Production signing environment must be restricted to main only.');
  // GitHub itself validates team visibility and explicit repository access above.
  const codeowners = await fs.readFile('.github/CODEOWNERS', 'utf8');
  if (!codeowners.includes(CODEOWNER)) throw new Error('Registry team is missing.');
  return { rules, codeowners, selfApproverId: SELF_APPROVER_ID, actionsAppId: ACTIONS_APP_ID };
}
