import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyAuditReceipt, assertDeploymentFresh, assertLivePublication } from '../src/release-gates.js';

const revision = 'a'.repeat(40), rootSha256 = 'b'.repeat(64), commit = 'c'.repeat(40);
const context = { repository: 'Sidequest-Engineering/macromaxx-plugin-registry', revision, runId: '123', runAttempt: '1', rootSha256, now: 1000000 };
const audit = () => ({ schemaVersion: 1, kind: 'governance-audit', repository: context.repository, revision, runId: '123', runAttempt: '1', rootSha256, historyCommit: null, rulesVerified: true, issuedAt: 999000, expiresAt: 1500000 });

test('privileged audit receipts are revision/run/attempt/root bound and short lived', () => {
  assert.equal(verifyAuditReceipt(audit(), context), true);
  for (const change of [{ revision: 'd'.repeat(40) }, { runId: '124' }, { runAttempt: '2' }, { rootSha256: 'e'.repeat(64) }, { expiresAt: 999999 }, { issuedAt: 2000000 }, { rulesVerified: false }])
    assert.throws(() => verifyAuditReceipt({ ...audit(), ...change }, context), /audit|receipt/i);
});

test('deployment rejects replay after a newer history/main or activation change', () => {
  const receipt = { schemaVersion: 1, kind: 'signed', revision, historyCommit: commit, rootSha256 };
  const live = { currentMain: revision, currentHistoryCommit: commit, custodySha256: rootSha256, rootSha256 };
  assert.equal(assertDeploymentFresh(receipt, live), true);
  for (const change of [{ currentHistoryCommit: 'd'.repeat(40) }, { currentMain: 'e'.repeat(40) }, { custodySha256: '' }])
    assert.throws(() => assertDeploymentFresh(receipt, { ...live, ...change }), /stale|deployment|activation|history/i);
  const pending = { schemaVersion: 1, kind: 'pending', revision, historyCommit: null, rootSha256 };
  assert.equal(assertDeploymentFresh(pending, { ...live, currentHistoryCommit: null, custodySha256: '' }), true);
  assert.throws(() => assertDeploymentFresh(pending, live), /deployment|activation|history/i);
});

test('scheduled health cannot close a failed deployment incident while valid older metadata is served', () => {
  const expected = { metadataVersion: 2, timestampSha256: 'a'.repeat(64), catalogSha256: 'b'.repeat(64) };
  assert.equal(assertLivePublication(expected, expected), true);
  assert.throws(() => assertLivePublication({ ...expected, metadataVersion: 1 }, expected), /publication|deployed|history/i);
  assert.throws(() => assertLivePublication({ ...expected, catalogSha256: 'c'.repeat(64) }, expected), /publication|deployed|history/i);
});
