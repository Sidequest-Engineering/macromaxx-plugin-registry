import { createHash } from 'node:crypto';
import { REGISTRY_REPOSITORY } from './governance.js';

export const rootFingerprint = root => createHash('sha256').update(JSON.stringify(root)).digest('hex');
const sha256 = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const commit = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);

export function verifyAuditReceipt(receipt, context) {
  const now = context.now ?? Date.now();
  if (receipt?.schemaVersion !== 1 || receipt.kind !== 'governance-audit' || receipt.repository !== REGISTRY_REPOSITORY || receipt.repository !== context.repository || receipt.revision !== context.revision || !commit(receipt.revision) || receipt.runId !== context.runId || receipt.runAttempt !== context.runAttempt || !context.runId || !context.runAttempt || !sha256(receipt.rootSha256) || receipt.rootSha256 !== context.rootSha256 || receipt.rulesVerified !== true || (receipt.historyCommit !== null && !commit(receipt.historyCommit)) || !Number.isSafeInteger(receipt.issuedAt) || !Number.isSafeInteger(receipt.expiresAt) || receipt.issuedAt > now + 60000 || receipt.expiresAt <= now || receipt.expiresAt <= receipt.issuedAt || receipt.expiresAt - receipt.issuedAt > 15 * 60000)
    throw new Error('Governance audit receipt is absent, stale or not bound to this revision/run/attempt/root.');
  return true;
}

export function assertDeploymentFresh(receipt, { currentMain, currentHistoryCommit, custodySha256, rootSha256 }) {
  if (receipt?.schemaVersion !== 1 || !commit(receipt.revision) || receipt.revision !== currentMain || !sha256(rootSha256) || receipt.rootSha256 !== rootSha256)
    throw new Error('Stale deployment revision/root; dispatch a new workflow.');
  if (receipt.kind === 'signed') {
    if (!commit(receipt.historyCommit) || receipt.historyCommit !== currentHistoryCommit || custodySha256 !== rootSha256)
      throw new Error('Stale deployment history or changed activation.');
  } else if (receipt.kind !== 'pending' || receipt.historyCommit !== null || currentHistoryCommit !== null || custodySha256)
    throw new Error('Pending deployment cannot replace an activated production history.');
  return true;
}

export function assertLivePublication(live, published) {
  if (!Number.isSafeInteger(published?.metadataVersion) || published.metadataVersion < 1 || live?.metadataVersion !== published.metadataVersion || !sha256(published.timestampSha256) || live.timestampSha256 !== published.timestampSha256 || !sha256(published.catalogSha256) || live.catalogSha256 !== published.catalogSha256)
    throw new Error('Deployed registry does not match authoritative publication history; deployment recovery is incomplete.');
  return true;
}
