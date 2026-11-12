// Isolated privileged job: built-in Node modules only, no npm install/imported dependencies.
import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { REGISTRY_REPOSITORY, verifyGovernance } from './governance.js';
import { rootFingerprint, verifyAuditReceipt } from './release-gates.js';
import { liveGovernance, historyCommit } from './github.js';

try {
  if (process.env.GITHUB_REPOSITORY !== REGISTRY_REPOSITORY || process.env.GITHUB_REF !== 'refs/heads/main' || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() !== process.env.GITHUB_SHA) throw new Error('Governance audit requires the exact canonical main revision.');
  const stat = await fs.lstat('root.json');
  if (!stat.isFile() || stat.size > 512 * 1024) throw new Error('Invalid reviewed public root.');
  const rootSha256 = rootFingerprint(JSON.parse(await fs.readFile('root.json')));
  if (process.env.PRODUCTION_ROOT_CUSTODY_SHA256 !== rootSha256) throw new Error('Operator root-custody confirmation is required before privileged audit.');
  verifyGovernance(await liveGovernance());
  const issuedAt = Date.now();
  const receipt = { schemaVersion: 1, kind: 'governance-audit', repository: REGISTRY_REPOSITORY, revision: process.env.GITHUB_SHA, runId: process.env.GITHUB_RUN_ID, runAttempt: process.env.GITHUB_RUN_ATTEMPT, rootSha256, historyCommit: await historyCommit(), rulesVerified: true, issuedAt, expiresAt: issuedAt + 15 * 60000 };
  verifyAuditReceipt(receipt, { ...receipt, now: issuedAt });
  await fs.mkdir('governance-proof');
  await fs.writeFile('governance-proof/receipt.json', JSON.stringify(receipt, null, 2) + '\n');
  console.log('Privileged rules inspected; revision/run/attempt/root-bound receipt emitted. No signing key is available to this job.');
} catch (error) { console.error(error.message); process.exitCode = 1; }
