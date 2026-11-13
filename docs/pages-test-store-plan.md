# GitHub Pages test store implementation plan

> Historical verification record only. Superseded by the production registry rollout; do not recreate or re-enable this test deployment.

> Execute inline with executing-plans and TDD. User explicitly requested Pages deployment and local app connection.

**Goal:** Real signed HTTPS discovery/install through Pages, without signature bypass or production trust contamination.
**Architecture:** Separate `test-store` inputs, preserved `gh-pages` history, signing/deployment jobs separated, pinned app root with isolated cache.
**Tech stack:** Existing Node/TUF tooling, GitHub Actions/Pages, existing Electron adapter.
**Spec:** `docs/pages-test-store-design.md`.

## Global constraints
- Preserve unrelated local app changes, real workspaces, existing repositories and production registry.
- Never print, commit or publish private keys. Never upload root private key to CI.
- No force pushes, no downgrade/history reset, no disabling TLS/signatures/hash checks.
- Registry commits/pushes and Pages/key-environment configuration are authorized by this request; app binding stays local unless separately requested.

## Review focus
- Persisted history missing/corrupt must not silently bootstrap during renewal.
- Static site must not contain secrets, links or unrecognized file paths.
- Cached roots/settings from one store must not be reused for another.
- Package bytes and permissions must agree with signed descriptors.
- Public endpoints must work through the real client without authentication or redirects.

## Tasks
1. [x] Write failing Pages preparation tests: bootstrap, renewal, history tamper, immutable reuse, archive path/link exclusion, package mismatch. Implement `preparePagesSite(options)` and CI entry.
2. [x] Write failing app configuration isolation tests. Add root/endpoint namespace helper and test-channel status/notice without changing existing action contracts.
3. [x] Generate local TEST trust identity and reviewed counter artifact. Add signed-store inputs, safe static history publisher and pinned Pages workflow. Test all local suites and perform independent read-only review.
4. [x] Configure Pages and main-only online-test-key environment without exposing key values. Commit/push registry changes, bootstrap deployment, await actual workflow completion.
5. [x] Verify anonymous HTTPS and TUF refresh, artifact download/install/execute in temporary state, refresh again for persistence, app adapter configured/trusted against live endpoint. Verify no real workspace mutation, run app regression/format/build checks and record limitations.

## Ledger
- Task 5 complete: renewal run 43291222593 succeeded without bootstrap. A real persisted v1 TUF cache accepted monotonic v2, downloaded the verified package, and the anonymously served 1.targets.json remained byte-identical. Current gh-pages tip 266d5ce63566a164cf3dafaac20e14c91c90e069. Live source app smoke repeated against v2: trusted, install/execute/refresh/reopen/settings all passed. Current signed expiry 2026-11-13T19:32:55.065Z; six-hour scheduled renewal remains necessary.
- Negative operational gate: initial automatic push run 43290777931 failed specifically with `Explicit bootstrap required when publication history is absent.` This is the intentional first-publication guard. The subsequent explicit bootstrap and ordinary renewal both succeeded; no bypass was introduced.
- Final independent review: no Critical/Important findings, no deferred minors. Reviewer operational limits (real GitHub environment, live endpoints/client, independently verified tests and missing graph symbols) have all been checked by execution and recorded above. Production/OS isolation/USB and Windows/macOS validation remain outside this test deployment.
- Finish: registry main and gh-pages are published as requested; local app branch/workspace and unrelated edits remain in place, not committed or pushed. No branch/worktree deletion or unrelated cleanup is performed.
- Task 4: registry deployment committed/pushed as c0c2557. Explicit bootstrap run 43290804956 completed success (sign/publish/deploy all green); public timestamp anonymously HTTP200, metadata v1. App changes remain local/uncommitted.
- Task 5 live checks: source adapter and packaged ASAR adapter both use real HTTPS/TUF refresh, native-consent boundary simulation, exact package download, install, physical keyDown/keyUp, execute, refresh, close/reopen and settings persistence. Both yielded Pages: 1 then Pages: 2, no workspace mutation and no legacy directory creation. Temporary userData removed afterward. Public root equality checked against local test trust, not a server-downloaded bootstrap.
- Task 5: packaged real worker/WASM smoke passed; packaged public test config exactly matches source. Fresh GitNexus indexing resolves both modified symbols: createPluginStore LOW (electron/main.js caller); PluginStorePanel LOW (plugins.jsx → App → main.jsx, Plugins/App processes). This narrows the new work, not the earlier all-app critical impact warning.
- Renewal run 43291222593 started with bootstrap=false after persisting a real v1 TUF cache and exact 1.targets.json bytes. Awaiting completion before checking monotonic v2 and retained historical bytes.
- Independent read-only whole-change review: no Critical/Important findings. Public endpoint/history currently absent as expected; live client and authenticated GitHub settings remain verification gates, not waived limitations. Those are covered by tasks 4/5.
- Task 4 setup: Pages enabled as workflow source with HTTPS enforced. `test-store-signing` and `github-pages` environments have custom branch policy containing only main. Secret list contains exactly TEST_TARGETS_KEY, TEST_SNAPSHOT_KEY, TEST_TIMESTAMP_KEY, uploaded from stdin. Root private key not uploaded.
- Verification: SDK3/3, runtime18/18, registry11/11, app194 pass/2 existing skips, example1/1 and typecheck pass. App format/build pass. Linux native verification passed. Default packaging encountered existing-output ENOTEMPTY; retried using a fresh isolated output directory under /tmp/opencode, without deleting any output manually, and packaging passed.
- App graph change analysis reports critical impact across ALL earlier uncommitted app integration (10 tracked files/28 symbols/17 flows). It is not an all-clear for the whole app. No app changes are committed/pushed by this deployment. The new store symbols remain unindexed; direct callers were confirmed by text fallback, and adapter/runtime regressions passed.
- Live smoke script exercised before deployment: public timestamp returned expected 404 and failed its HTTP200 assertion. Repeat after actual Pages deployment; never report this as successful connectivity yet.
- Task 2: full app suite GREEN 194 passed / 2 existing skips. Test-channel snapshot and notice added; authority namespaces preserve legacy directory untouched.
- Task 3: history CLI RED (missing module) → GREEN with local bare Git remote integration covering first publish, second fast-forward, stale bootstrap/renewal rejection and symlink rejection. Historical tamper RED → GREEN via signed snapshots and role signatures. Test initially expected only signature errors; stack confirmed earlier length verification rejected the same tamper, so assertion now accepts either authenticated chain failure.
- Task 3: example typecheck/test pass. Default build correctly refused existing immutable artifact (EEXIST); rebuilt to a new temporary filename and confirmed exact equality with the existing 2548-byte package. Test inputs include that reviewed package; production registry unchanged.
- Task 3: persistent test root created outside Git at /home/joelo/.local/share/macromaxx-store-test-keys, local directory 0700/key files 0600. Root expires 2027-11-12. No private key contents printed or staged. Local preflight signing succeeded, metadata v1.
- Task 1: missing-module RED observed; full registry suite GREEN 9/9. Generator enforces explicit bootstrap, signed prior state, retained immutable target hashes, whitelist/link/size checks and private quarantine exclusion. CI entry follows with workflow task 3.
- Pre-flight: task 1 produces `site/test/client-config.json` with pinned root/endpoints; task 2 consumes the identical authority object; task 3 passes only the three online role keys; task 4 consumes the generated site and prior gh-pages commit. No conflicting interfaces.
- Task 2: GitNexus symbols absent/UNKNOWN; text fallback confirms createPluginStore called in electron/main.js and PluginStorePanel in plugins.jsx. Prior plugins graph impact LOW (App/process, two callers). Namespace test RED (missing export) observed before implementation.
- Baseline: registry `main` clean at cd0e097; app has preserved, uncommitted prior implementation on feat/secure-plugin-store. Pages currently absent (404); no environments or history branch exist.
- Ruling: work in the requested sibling layout/current checkouts, no new worktree. Registry deployment changes are explicitly requested; do not sweep app changes into a new commit.
- Ruling: use a test channel and six-hour renewal; no production keys/approval policy implied. Root private key remains local, three test online keys go to a dedicated main-only environment. Cost: GitHub/environment compromise can sign test releases; never ship this root as production trust.
- Ruling: store cache/settings become namespaced by pinned root and endpoints. Preserve old directory untouched; changing authority intentionally selects a separate installation set.
