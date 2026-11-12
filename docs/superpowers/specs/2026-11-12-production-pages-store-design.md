# Production Pages plugin registry

Status: user approved implementation ("Abfahrt") and explicitly requested self-approval for EinCloudy. An independent read-only builder check found nothing important left unanswered before that amendment. Offline key custody/backup is still an operator-confirmed activation gate, not an inferred fact.

## Intent and agreed decisions

Provide the real public MacroMaxx plugin registry through GitHub Pages, remove the active test store, connect the local app to the new authority, and make publisher onboarding approachable. Hosting remains GitHub Pages, not R2. New plugins and updates require organization Codeowner review.

The user approved creating `@Sidequest-Engineering/registry-maintainers` and adding the current organization members. That team now exists, is visible (`privacy: closed`), contains `EinCloudy`, and has explicit `push` permission on the registry repository. Additional organization members are not automatically enrolled; team membership is managed explicitly.

Recommended publication approach: external contribution → unprivileged CI → required Codeowner approval → merge → automated signing/publication. Periodic renewal of the same approved contents needs no new human approval. The user accepted the team setup after this approach was recommended; final approval of this design remains pending.

## Approaches and scope

1. **Protected PR approval followed by automated publication (recommended).** Fits the agreed Codeowner workflow, permits timely renewal, and retains audit history. GitHub is part of the trusted publishing control plane; a compromise of maintainers or signing infrastructure remains a risk.
2. Additional manual deployment approval for every new release, separate from unchanged renewals. More operator work and another release bottleneck; not selected for the initial rollout.
3. Reuse the test root or merely relabel the test deployment. Rejected: a demo identity is not production trust.

Builder proposal: retain the existing strict `registry.json`, source-descriptor and package schemas. Do not introduce a new package format, arbitrary plugin execution privileges, split-file registry compiler, billing system or marketplace backend. Improve presentation and contributor tooling without silently changing signed release identities.

## Publisher experience

- English-first README suitable for an international open-source audience: clear purpose, status, quick start, contribution links, security boundaries and a concise release lifecycle.
- A practical CONTRIBUTING guide with publisher enrollment, exact pinned GitHub Release assets, local validation commands, permission explanations, update/revocation rules and the expected Codeowner review process.
- Formatted, copyable publisher/release/source examples that use the actual supported schema. Examples are clearly documentation fixtures, never fabricated live entries.
- A submission PR template and maintainer checklist covering publisher control, source commit, reproducible package bytes, permissions, supported platforms and immutable version/hash bindings.
- Consistent readable JSON formatting and CI feedback for submission errors. Keep security-critical fields visible; do not hide hashes or permissions for aesthetics.
- The public landing page identifies the production registry and links to onboarding/documentation. All rendered descriptor strings must be escaped; no publisher-supplied raw HTML or remote scripts.
- Start with an honestly empty production catalog. Do not enroll the internal `example` publisher or ship Counter as a production release. The app should distinguish a verified empty catalog from a connection/trust failure.

## Production trust and signing

- Generate an independent production root and distinct role keys outside Git. Never reuse or upload the private test root. Pin the complete public production root in the local app and commit the reviewed public root in the registry.
- The private production root must never enter CI, logs, artifacts or public hosting. File permissions alone are not an offline backup: offline custody and an encrypted recovery backup need an explicit operator handoff and confirmation before activation.
- Initial architecture uses the existing one-key-per-role tooling, not a falsely claimed multi-person cryptographic threshold. Codeowner approval is a GitHub governance control, not an independent TUF signing threshold. Stronger threshold/offline-target signing is a separate hardening project and must be disclosed as a residual risk, not advertised as implemented.
- Online targets/snapshot/timestamp keys exist only in a dedicated production signing environment restricted to protected main. No signing secrets or write tokens in PR jobs. Only protected-main code may access the environment; publication must fail closed if the expected branch protections/CODEOWNERS are absent or invalid. GitHub hides bypass actors from read-only callers, so inspect privileged policy in a separate main-only, dependency-free audit job using a narrowly scoped GitHub App credential, never in signing. Consumers use the immutable artifact ID of its revision/run/attempt/root/history-bound receipt (maximum age15minutes), rechecking main/history; omitted bypass data is never accepted as an empty list. Auditor App provisioning is an additional explicit operator activation gate.
- Import reviewed assets in a read-only, secretless stage. Never execute publisher code in the signing job. Retain the existing exact-byte, manifest, redirect/size and source-pinning checks, and reuse authenticated previously published packages rather than depending on mutable upstream assets.
- Sign in a read-only job; persist history and deploy in separate keyless jobs with narrowly scoped contents/pages/OIDC permissions. Pin actions and dependency versions.

## Hosting, durable history and renewal

- Serve production metadata at `/macromaxx-plugin-registry/metadata/` and targets at `/macromaxx-plugin-registry/targets/` on the existing HTTPS Pages project site. There is no test or production channel prefix in the new public API.
- Builder proposal: use a separate `production-publication` branch for authenticated production history. Keep the old `gh-pages` test history only as inactive Git audit history, never as production bootstrap input. No force pushes, rebases or cross-authority history resets.
- First production publication requires explicit operator bootstrap and an absent production-history branch. Renewals require authenticated prior production state, exact +1 metadata versions and permanent descriptor/revocation retention. Corrupt, missing or racing history is an error, not permission to bootstrap.
- Preserve immutable metadata and content-addressed packages; normal commits/pushes reject races. Serve only a validated allowlist of generated static files, bounded sizes and regular files. Exclude private material, source inputs and quarantine.
- Renew every six hours, including an empty catalog, and verify the actual deployed HTTPS state with the real pinned-root client. Current timestamp/catalog validity remains 24 hours; never extend trust merely because fetching failed.
- Add an operational health check for missing/failed renewal and approaching expiry, with a deduplicated maintainer-visible GitHub issue and recovery runbook. Document that an Actions-only monitor cannot report an organization-wide Actions outage; an external monitor is an operator follow-up, not a guaranteed SLA.
- Pages imposes a 1 GB published-site cap, a soft 100 GB/month bandwidth limit and possible rate limits. Add pre-deployment size budgeting and state these constraints. This is static open-source plugin distribution, not a commercial transaction service or administrator-proof WORM storage.

## Required GitHub review controls

- `.github/CODEOWNERS` assigns all repository contents, including CODEOWNERS/workflows/tooling/trust inputs, to `@Sidequest-Engineering/registry-maintainers`.
- Protect main with required passing registry checks, at least one Codeowner approval, dismissal of stale approvals and approval of the latest push by someone else. The user's later amendment authorizes one explicit PR-review exception for EinCloudy, not a blanket admin/bot bypass. Keep PR submission, checks, force-push and deletion restrictions in a separate ruleset without bypass actors. Existing stronger protections must be preserved, not replaced with weaker defaults.
- Verify actual rules and CODEOWNERS validity through GitHub, not just committed configuration text. Direct pushes and deployment from unreviewed branches must be rejected. Contributors never obtain signing credentials or hosting administration permissions.
- **Explicit self-approval amendment:** GitHub does not allow a literal approving review on one's own PR. Implement the user's request as a named, audited, pull-request-only review exception for EinCloudy's immutable GitHub user ID. CI and PR submission remain mandatory. Native GitHub bypass is actor-based, not PR-author-based: the named actor can also override review on another author's PR; document this rather than falsely claiming that GitHub restricts the capability to self-authored changes. Ordinary contributors have no such exception and cannot publish or self-approve. No second-reviewer gate is imposed on EinCloudy's own changes after this amendment.

## Removing the test store and updating the app

- Remove the active test workflow, test inputs, test channel notice and test root from active app configuration. Decommission the test signing secrets/environment and disable its workflow before it can republish the old site. Do not delete local private files or existing user plugin data as cleanup.
- Once the reviewed production deployment replaces the Pages artifact, `/test/` is no longer served. Historical Git commits/branches can still contain public test metadata; removal is not a rewrite of published Git history.
- Never promote a test cache or installed object into production trust. Keep the existing root/endpoint namespace isolation; selecting the production authority starts a separate installation set. Workspaces and old plugin data are preserved, not migrated or deleted.
- Switch the local app only after production endpoints verify against the independently pinned production root. During any cutover gap the test channel must not masquerade as production; leave the store explicitly disabled if production activation is blocked. App changes remain local unless a separate app push/release is requested.
- Improve the observed HTTP503 handling: bounded retries for explicitly transient responses, useful status/path diagnostics, and a clear UI distinction between temporary unavailability, expired/untrusted metadata and a verified empty catalog. Never treat 5xx as root-rotation 404, retry invalid signatures into acceptance, follow arbitrary redirects or disable TLS/integrity checks.

## Verification and readiness claim

Tests must prove review/import boundaries, explicit bootstrap, authenticated renewal, immutable retention, invalid history rejection, test-file exclusion, HTML escaping, transient HTTP handling and fail-closed trust errors. Run full SDK/runtime/registry/app suites, formatting/build and the real packaged worker smoke where applicable.

Operational acceptance requires: effective CODEOWNERS/main protections and production environment restrictions; operator-confirmed production root custody/backup; removal of active test deployment/credentials; successful initial production deployment and ordinary renewal; anonymous HTTPS checks through a real persisted TUF client; local app trusted-empty state and no workspace mutation. Package install/execute regressions use isolated signed fixtures, not an invented production release.

Do not call the result production-ready when a gate is incomplete. Report implementation, actual deployment evidence, operator handoffs and remaining limits separately. Pages hosting does not make the Electron app OS-sandboxed, independent of its main process, app-code-signed, or validated on untested operating systems.

## Calls proposed by the builder, not yet approved by the user

Approved scope covers English onboarding; schema-preserving formatting/templates rather than a new registry format; an initially empty production catalog; root-level production endpoints and a new production-history branch; initial one-key-per-role trust with explicit custody/backup gate; bounded transient fetch recovery; GitHub-issue health reporting; no automatic addition of future organization members; app changes kept local. The explicit EinCloudy PR-review exception above supersedes the earlier independent-review activation gate.
