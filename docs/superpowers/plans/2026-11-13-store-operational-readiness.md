# Store Operational Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the technical delivery gates and make remaining operator actions explicit and mechanically checkable, without claiming production activation or elapsed soak time prematurely.
**Architecture:** Retain GitHub Pages, protected publication, isolated auditor and the independently pinned production root. Add read-only operator diagnostics, an external one-shot monitoring command and evidence-based 48-hour reporting; reuse actual runtime/app acceptance suites and leave trust expiry unchanged.
**Tech Stack:** Existing Node.js, tuf-js, Git/GitHub CLI; optional external systemd timer and HTTPS alert endpoint. No new runtime dependencies.
**Spec:** `docs/superpowers/specs/2026-11-12-production-pages-store-design.md`, `docs/OPERATIONS.md`, `docs/KEY_CUSTODY.md`, and the user's 2026-11-13 approval of implementation of the five-step production-readiness proposal. User requested execution rather than another design discussion; no authorization to fabricate custody or weaken expiry.

**Operator amendment:** External Healthchecks/monitoring was explicitly cancelled during execution. Task2's new external monitor CLI/webhook/heartbeat/systemd components are removed from the active branch; retain only reusable persistent signed-client validation and its regressions. No external monitoring setup blocks activation. Existing internal signature/deployment/health workflows remain. The operator explicitly confirmed root custody/backup and authorized creating the dedicated auditor App through logged-in Chrome; online-role/App credentials are now provisioned and the actual App token was verified/revoked. Real bootstrap/renewal/app activation proceeds under the original trust policy.

## Global Constraints
- Preserve main PR/CI and EinCloudy's named review exception; no direct push to main.
- No root/private-key disclosure, no personal admin token in CI, no upload before actual operator custody confirmation.
- Preserve local user changes and workspaces. App remains disabled until real signed HTTPS/bootstrap/renewal acceptance passes.
- Current 24-hour timestamp/catalog validity and six-hour renewal remain unchanged. No offline grace extension authorized.
- External monitor must not require signing/admin credentials. A missing publication is a failing probe, not healthy pending readiness.
- Never call a synthetic-time test a real 48-hour soak; operator-provided evidence is local operational evidence, not a cryptographic attestation.

## Review Focus
- Missing API fields/access denied must produce actionable blockers, never readiness.
- Persistent monitoring cannot accept rollback or silently replace its independently pinned root.
- A dead monitor or stale samples must not pass the soak report; gaps and unhealthy observations reset acceptance.
- Alert delivery failures/redirects must fail without leaking endpoint/token values.
- No diagnostic may mutate secrets, rules, custody flags, root material or app activation.

### Task 1: Read-only production doctor
Files: `src/readiness.js`, `src/ops.js`, `test/readiness.test.js`, `package.json`.
Interface: `assessReadiness({root, rules, codeowners, environments, variables, historyCommit, now}) -> {readyForBootstrap, blockers, checks}`. Metadata-only GitHub CLI adapter retrieves only names/presence, not secret values. Root self-signature/expiry, exact governance, main-only signing/audit policies, online secret names, App ID/key presence and exact custody confirmation must pass.
- [ ] RED: accept complete fixture; absent custody, missing App/key, missing online role, hidden bypass list, expired/tampered root and non-main environment fail.
- [ ] Implement pure assessor plus `npm run store:doctor` CLI with JSON output and nonzero exit for blockers; no remote mutation commands.
- [ ] GREEN: full registry suite and run against real repository; record real blockers.
- [ ] Commit only task files.

### Task 2: External monitor and honest soak report
Files: `src/monitor.js`, `src/monitor-cli.js`, `test/monitor.test.js`, `src/health.js`, `test/health.test.js`, `ops/` example units.
Interfaces: `verifyLiveRegistry({root,baseUrl,allowLoopback,directory?})` optionally retains TUF cache bound to original root/endpoint; `probeRegistry({root,baseUrl,historyDirectory,directory,...})` authenticates live/catalog against history; `assessSoak(samples,{now})` requires 48 real hours of healthy samples, latest <=30minutes, no gap >30minutes, monotonic versions and multiple versions; `deliverAlert({url,token,payload,allowLoopback?})` bounded HTTPS/no redirects and sanitized errors.
- [ ] RED: real HTTP signed v1→v2 cache then replay v1 rejected; changed root/endpoint rejected; pending/HTTP failure samples fail; history=v2/live=v1 fails; no 48h shortcut, stale/gapped/warning samples fail, monotonic renewals pass only with elapsed time. Real alert server accepts body, redirects/failure are rejected without URL/token leakage.
- [ ] Implement one-shot CLI using anonymous public Git history fetched into private state, persistent TUF cache, append-only per-probe JSON evidence and webhook alert on failures/recovery. Timer every15minutes lives outside GitHub; do not install/provision an external service without operator destination.
- [ ] Implement `store:soak` report (read-only); require fresh same-authority samples and label it registry-only evidence, not plugin/app/platform acceptance.
- [ ] GREEN: full suite plus actual unactivated public probe must fail honestly, not generate a healthy sample.
- [ ] Commit task files.

### Task 3: Operator handoff and actual acceptance
Files: `docs/GO_LIVE.md`, `docs/OPERATIONS.md`, `docs/KEY_CUSTODY.md`; existing runtime/app tests and packaging scripts.
- [ ] Give exact remaining root custody/App/monitor setup actions and distinguish bootstrap readiness from delivery readiness; link diagnostic and monitoring commands.
- [ ] Run actual runtime installation/action/update/consent/restart/revocation suites; full app/format/build/package/ASAR worker check. Preserve all unrelated app work; no enabled config before HTTPS success.
- [ ] One independent whole-change review, address Important findings with RED→GREEN.
- [ ] Push a PR and use ordinary CI-gated named review exception if checks pass. Verify deployed docs and doctor against current protected main.
- [ ] If and only if real custody/App/monitor inputs are provided: configure approved online secrets, bootstrap/renewal, real client/package acceptance, start external soak and enable independently pinned app. Otherwise report exact BLOCKED gates; never mark these acceptance steps complete.

## Execution ledger
- Existing native registry worktree reused, branch `feat/store-operational-readiness` from main20910c1; clean baseline33/33.
- Current actual API inventory: main-only environments exist; repository Actions variables empty. Offline root backup is unconfirmed; App/online secrets previously absent. No secret values read.
- Execution is inline, as requested; do not pause between technical tasks. No change to trust/offline behavior is inferred from 'Okay'.
