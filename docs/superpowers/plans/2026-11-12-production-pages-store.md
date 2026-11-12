# Production Pages Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the active demo with an independently trusted, Codeowner-governed Pages registry and approachable contributor onboarding, with an explicit EinCloudy self-merge exception that cannot waive CI.
**Architecture:** Reuse strict package/TUF contracts; serve production metadata/targets at project-root endpoints and retain a new authenticated `production-publication` history branch. Separate secretless imports, read-only signing, keyless history writes and Pages deployment. The app retains authority-isolated data and gains bounded transient-error recovery.
**Tech Stack:** Existing Node/TUF tools, GitHub REST/Actions/Pages, existing Electron adapter.
**Spec:** `docs/superpowers/specs/2026-11-12-production-pages-store-design.md` (approved; amended with explicit self-approval request).

## Global Constraints
- No test-to-production key promotion; no root private key in CI, logs or Git.
- Preserve signatures, hashes, immutable descriptors, permanent revocations and signed history. No force pushes.
- Root offline custody/encrypted backup requires operator confirmation; never attest this on the operator's behalf or claim incomplete readiness as complete.
- Only EinCloudy's explicit PR-review exception; independent no-bypass PR/CI rules must remain effective.
- Keep local app changes/workspaces intact and unpushed. Keep old authority data; do not migrate it into production.
- Empty production catalog, no demo publisher/package. No schema migration or unnecessary dependencies.
- User authorized execution without further planning handoffs; implement inline, with one final independent review.

## Review Focus
- Actor-based GitHub bypass must not silently bypass CI or allow direct pushes; its capability on other authors' PRs must be documented.
- Old test workflow/secrets must not be able to overwrite the production Pages artifact after cutover.
- A valid but rolled-back or physically incomplete history must never silently bootstrap or erase retained objects.
- Untrusted entry text/paths/packages must not enter generated HTML or signing jobs as executable content.
- Transient retries must preserve root-rotation 404 and integrity failures, respect quotas, and never prolong expired trust.

## File responsibilities and interfaces
- `src/governance.js`: pure expected-rule builders and fail-closed validation of GitHub's effective main rules/CODEOWNERS; operational CLI separate.
- `src/pages.js`, `src/pages-history.js`: production-only static allowlist, authenticated monotonic site assembly, immutable history export/write to `production-publication`.
- `src/landing.js`: escaped, self-contained production landing page with onboarding links and honest catalog state.
- `src/pages-ci.js`, new production workflow: validated secretless input import → protected signing → history/Pages publication; explicit bootstrap/custody gate.
- `src/check-inputs.js`, examples/docs/templates: validate real-schema registry/source/example inputs and readable formatting; no live demo data.
- `src/health.js`, health workflow/runbook: expiry/deployment health with one deduplicated issue, no signing secrets.
- Runtime `src/trust.js` (optional focused fetch helper): bounded HTTP retry and status/path errors; app vendored runtime updated explicitly.
- App config/adapter/UI: disabled during unconfirmed cutover, production root pin only after live verification, no test notice.

## Task 1: Explicit review governance
- [ ] Add failing `test/governance.test.js`: valid three-rule setup accepted; missing checks/PR rule, global/admin bypass, wrong self-approver, wrong team/CODEOWNERS, relaxed force/delete rules rejected.
- [ ] Run `node --test test/governance.test.js`; expect missing-module/feature RED.
- [ ] Implement `productionRules({selfApproverId, actionsAppId})` and `verifyGovernance({rules, codeowners, selfApproverId, actionsAppId})`. Core main rules require PR (0 approvals), `validate` check from the official Actions app, non-fast-forward/deletion protection and no bypasses. Separate Codeowner review rules require one fresh approval with only the named User's `pull_request` bypass. History has no-force/no-delete protection. Account/team identity comes from GitHub, not arbitrary workflow inputs.
- [ ] Add `.github/CODEOWNERS`; full `npm test` must pass. Commit task and ledger evidence.

## Task 2: Production site and durable history
- [ ] Adapt/add failing Pages tests for root-level production endpoints, no `/test/` or test config, verified-empty landing, escaped malicious entry names, explicit bootstrap, history tamper/rollback/removal, quotas, immutable renewal and correct history branch.
- [ ] Run `node --test test/pages.test.js`; expect assertions RED against current test-only implementation.
- [ ] Implement production `preparePagesSite({inputDirectory, outputDirectory, previousSiteDirectory, keys, baseUrl, allowBootstrap})`, root-level `staticFiles(directory)`, escaped `renderLanding(registry)`, and history functions fixed to `production-publication`. Reuse existing signed publisher; never import old `gh-pages` test state.
- [ ] Verify full registry suite; commit task and ledger evidence.

## Task 3: Welcoming, validated onboarding
- [ ] Add failing example/input tests: schema-valid formatted publisher/release/source samples; invalid source pin, hash/manifest mismatch, unreadable JSON formatting and missing reviewed source rejected. Do not execute a sample package or fetch fictitious example URLs.
- [ ] Implement `validatePublicationInputs({registry, sourceDirectory})` and validation CLI; reuse source URL/schema logic and strict contracts. Validate source files for new releases, retain approved old packages from authenticated state. Keep production registry empty.
- [ ] Rewrite README and add CONTRIBUTING, SECURITY, operations/key-custody docs, real-schema examples and PR submission checklist. Explain self-merge as a review exception, not a literal own-PR approval; document native actor-wide capability.
- [ ] Full suite and example validation pass; commit task and ledger evidence.

## Task 4: Reliable, fail-closed client transport
- [ ] In sibling runtime, write RED regressions using real local HTTP fixtures: 503→success, permanent 503 bounded with status/path, 429 Retry-After bounds, root 404 not retried, invalid signatures not accepted/retried, no redirects/expired-trust extension.
- [ ] Implement only transient HTTP response recovery (429/502/503/504, at most 3 attempts, bounded delays/deadline); include public status/path in errors. Preserve DownloadHTTPError type/status for tuf-js root rotation.
- [ ] Run full runtime suite. Before app edits, run required GitNexus impact/context. Update only the runtime vendor snapshot/lock in the app; do not sweep unrelated changes or refresh unaffected example/SDK archives.
- [ ] Remove test-only notice and expose honest verified-empty vs error state. Add/extend app regressions, run full app suite/format/build and real worker smoke; ledger results. Keep app changes local.

## Task 5: Production automation and health
- [ ] Write RED tests for protected-main signing preflight, registry-digest/transfer binding, empty imports, absent history without explicit bootstrap, unconfirmed root custody, malformed/deferred health state and deduplicated expiry alert behavior.
- [ ] Implement production CI entry/workflow and health logic. Secretless importer outputs reviewed quarantined package bytes plus registry digest; signer validates input and effective governance before using online keys. Production bootstrap must require explicit operator custody confirmation, which the agent must not fabricate.
- [ ] Health check validates signed live state with pinned root/client, reports approaching expiry (6h) or unavailability through one maintainer-visible issue, and closes it after recovery. Signing/deployment failure notifications likewise deduplicate. Monitor has no signing secrets; document shared Actions-outage limitation.
- [ ] Remove active test workflow/inputs; preserve Git audit history. Use an honest disabled app config/landing if activation awaits operator custody. Run full suites, workflow syntax checks and one independent read-only whole-change review; fix Important/Critical findings RED→GREEN, defer only true minors.
- [ ] Commit task and ledger evidence.

## Task 6: Configure, deploy and verify the real cutover
- [ ] Resolve immutable EinCloudy user ID and Actions app ID, inspect all existing rules, enable additive reviewed governance without weakening anything. Configure production main-only environment; upload only online-role test-independent keys via stdin after custody gate is satisfied. Generate public root/local private production keys outside Git; document handoff path without printing private material.
- [ ] Disable old test workflow and remove its online GitHub secrets/environment. Deploy an unsigned documentation-only landing/disable app if live production is blocked, explicitly labelled not active. No unreviewed production bootstrap.
- [ ] Push feature branch, create PR, await CI via background `gh run watch --exit-status`; merge through PR using the user-authorized named review exception, never bypass required checks or direct-push main. Production preflight must see actual effective rules and valid CODEOWNERS.
- [ ] If and only if the operator has confirmed offline custody/encrypted backup: dispatch explicit first publication and watch completion; run anonymous real TUF/app persisted-client checks, then ordinary renewal (+1, identical retained bytes). Pin app production root/endpoints only after live trust passes. Otherwise stop at this explicit activation gate and report the exact operator action needed.
- [ ] Verify active `/test/` is gone, test workflow/online secrets inactive, local workspaces untouched, main PR/CI rules effective and named review exception limited to review rules. Run all suites/format/build/package smoke, record URLs/SHAs, limits and any remaining gates; commit verification docs and preserve local app branch.

## Ledger
- Base: registry design branch at dee5825; original registry main at 4a6a7af. Existing app integration is uncommitted on feat/secure-plugin-store and must be preserved.
- User amendment: "Abfahrt. EinCloudy soll auch self-approven können" explicitly replaces the second-reviewer activation gate. Native own-PR approving reviews remain impossible; implement a named PR-only review exception with no-bypass CI/PR requirements.
- Authorized team setup already verified: registry-maintainers, closed/visible, EinCloudy member, explicit push permission. No other org members currently returned by GitHub.
- Pre-flight: task 1 supplies governance preflight to task 5; tasks 2/3 supply production assembly/import to task 5; task 4 changes only the local runtime/app transport; task 6 consumes protected main and operator custody confirmation. No conflicting interfaces; keep old test history separate from new production history.
