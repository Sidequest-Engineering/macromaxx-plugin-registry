import { Metadata } from '@tufjs/models';
import { verifyGovernance } from './governance.js';
import { rootFingerprint } from './release-gates.js';

export function assessReadiness({ root, rules, codeowners, environments = {}, variables = {}, historyCommit, inventoryErrors = [], now = Date.now() }) {
  const checks = [];
  const check = (id, action, fn) => {
    try { if (!fn()) throw new Error(); checks.push({ id, ok: true }); }
    catch { checks.push({ id, ok: false, action }); }
  };
  check('inventory', 'Authenticate gh with repository administration access and rerun the read-only doctor; unavailable API inventory is not an empty list.', () => inventoryErrors.length === 0);
  check('root', 'Review the pinned public root, verify its self-signature and renew through an audited ceremony before it has less than seven days remaining.', () => {
    const trusted = Metadata.fromJSON('root', root); trusted.verifyDelegate('root', trusted);
    return Date.parse(root.signed.expires) > now + 7 * 86400000;
  });
  check('governance', 'Restore effective Codeowners and separate no-bypass PR/CI rules; use a caller able to inspect bypass actors. Do not grant the signer an admin token.', () => verifyGovernance({ rules, codeowners }));
  for (const name of ['production-store-signing', 'production-governance']) {
    check(name, `Restrict environment ${name} to exactly the main branch, with custom branch policies and no shadow custody variable.`, () => {
      const env = environments[name];
      return env?.deployment_branch_policy?.custom_branch_policies === true && env.deployment_branch_policy.protected_branches === false && env.policies?.length === 1 && env.policies[0].name === 'main' && env.policies[0].type === 'branch' && env.variables && !Object.hasOwn(env.variables, 'PRODUCTION_ROOT_CUSTODY_SHA256');
    });
  }
  check('custody', 'Operator: move root.pem into offline custody, test an encrypted recovery backup, then explicitly confirm the ceremony and set the repository PRODUCTION_ROOT_CUSTODY_SHA256 to the reviewed fingerprint. Never infer confirmation from file permissions.', () => variables.PRODUCTION_ROOT_CUSTODY_SHA256 === rootFingerprint(root));
  check('online-keys', 'After actual custody confirmation, upload only PRODUCTION_TARGETS_KEY, PRODUCTION_SNAPSHOT_KEY and PRODUCTION_TIMESTAMP_KEY via stdin into production-store-signing. Never upload root.pem.', () => ['PRODUCTION_TARGETS_KEY', 'PRODUCTION_SNAPSHOT_KEY', 'PRODUCTION_TIMESTAMP_KEY'].every(name => environments['production-store-signing']?.secrets?.includes(name)));
  check('auditor', 'Create/install the repository-only governance GitHub App, configure GOVERNANCE_APP_ID and GOVERNANCE_APP_PRIVATE_KEY in production-governance, and test the real audit workflow. No personal CLI token in CI.', () => /^[1-9][0-9]*$/.test(environments['production-governance']?.variables?.GOVERNANCE_APP_ID || '') && environments['production-governance']?.secrets?.includes('GOVERNANCE_APP_PRIVATE_KEY'));
  const blockers = checks.filter(check => !check.ok);
  return { readyForBootstrap: blockers.length === 0, deliveryReady: false, publication: historyCommit ? 'history-present-not-yet-accepted' : 'not-published', fingerprint: rootFingerprint(root), checks, blockers,
    remainingAcceptance: ['Real auditor credential and signed bootstrap/normal renewal', 'Fresh and persisted production client plus packaged plugin lifecycle acceptance', 'External alert receipt and dead-monitor alert verification', '48 hours of healthy real observations and supported-platform release acceptance'] };
}
