# Registry operations

## Readiness and hosting

Use [the concrete go-live checklist](GO_LIVE.md) for remaining operator actions, `npm run store:doctor` for read-only prerequisite checks, and `store:probe` / `store:soak` on an independent host for signed monitoring and real48-hour evidence. Configuration readiness and delivery acceptance are separate.

Production uses the Pages project site at `https://sidequest-engineering.github.io/macromaxx-plugin-registry/`, with `metadata/` and `targets/` endpoints. A documentation-only page can be deployed before activation, but it must say **activation pending** and must not pretend an unsigned/empty response is a verified catalog. The local app stays explicitly disabled until independently pinned production trust works.

Activation requires effective protected-main/CODEOWNERS rules, the named review exception isolated from no-bypass CI/PR rules, operator-confirmed [offline root custody and encrypted recovery backup plus isolated governance auditor](KEY_CUSTODY.md), three online-role secrets, a successful signed bootstrap and normal renewal, and real HTTPS/client/app verification. Do not advertise all gates as passed merely because a workflow file exists.

GitHub Pages limits: published site ≤1 GB, recommended source repository ≤1 GB, soft bandwidth limit 100 GB/month, possible rate limiting and deployment timeout after 10 minutes. The assembler deliberately budgets below that (256 MiB total, bounded file sizes/counts). Custom Actions deployment avoids the ordinary branch-build hourly cap, not other hosting limits. See [GitHub's limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits). Pages is not administrator-proof immutable storage or an SLA-backed backend.

## Publishing and renewal

- Sources/descriptors must merge through PR with required validation. Only EinCloudy has the explicitly authorized PR-review exception; CI/PR rules are not bypassable through it. Others need Codeowner approval. Protect workflow/tooling changes as release-authorizing changes.
- Secretless import fetches exact pinned GitHub Release assets and enforces byte/manifest quotas without running publisher code. Authenticated prior packages are reused.
- A separate main-only governance job uses a narrowly scoped administrative GitHub App token to inspect bypass actors, which GitHub omits for read-only callers. No npm dependencies/signing keys run there. Its immutable-ID audit receipt is revision/run/attempt/root/history bound and expires after 15 minutes; import/signing never receive the administrative credential. See the App setup and residual risk in KEY_CUSTODY.
- Signing has read-only repository permission and only online-role secrets in a main-only environment. History writes/Pages deployment happen in separate jobs without signing keys. Main is rechecked before history publication.
- Deployment rechecks current main/history/activation **inside** its job, binds immutable artifact IDs to the producing workflow run/attempt, and validates the actual Pages tar contents against the authoritative signed site. Old signed or pending artifacts cannot be replayed after history/activation advances. If a job fails, dispatch a fresh whole workflow: rerunning only an old deploy/sign job intentionally fails freshness/receipt checks.
- Authoritative history is `production-publication`, one linear commit per metadata version. Preserve all immutable objects, signatures, source review records and permanent revocations. Ordinary pushes reject races; never force-push, delete/rebase history or bootstrap to recover from corruption.
- Root stays local/offline. Initial publication requires explicit bootstrap and custody confirmation for the exact reviewed root. An absent history branch during ordinary renewal is a failure.
- Renew every six hours; timestamp/catalog validity is 24 hours and targets/snapshot seven days. Root validity is one year. Expired trust stops execution; fetching failures must not extend validity.

## Health and failures

The health workflow has no signing keys. It verifies live metadata/catalog with the pinned root and compares version/timestamp/catalog identity with the current authenticated `production-publication` history. A still-valid older deployment cannot close an incident after a failed newer deployment. It warns with six hours remaining and maintains one deduplicated issue; verified recovery closes it. Signing/deployment failure reports use the same maintainer-visible incident channel. Review issues and Actions failures, including quota/rate-limit errors.

An Actions-only monitor can itself stop during disabled workflows or a GitHub outage. For dependable notification, configure an external monitor/operator calendar outside GitHub for metadata expiry, workflow availability, root renewal and backups. No external service/account is provisioned by this repository.

- **HTTP429/502/503/504:** client retries are bounded; show the actual status/path if still unavailable. Do not interpret 5xx as a missing next root, disable TLS/signatures or extend trust. Check Pages/Actions status and retry later.
- **Expired metadata:** restore legitimate scheduled signing with the same authority and incremented version. Do not relax expiration checks or reset the clock.
- **Missing/corrupt/racing history:** stop publication; restore authenticated retained state through reviewed recovery. Do not silently allow bootstrap.
- **Package mismatch:** reject the import. Investigate upstream replacement/reproducibility; use a new plugin version for changed bytes.

## Withdrawal and revocation

Keep the exact old descriptor and change its status through reviewed PR. Revocation is permanent. Publish a newer signed metadata version and verify the live state; clients disable known-revoked releases on refresh, while expiry bounds stale offline trust. Do not replace packages or delete descriptors. Revocation cannot undo arbitrary effects of previously privileged legacy plugins.

## Test retirement and app cutover

Disable/remove the old test workflow and its online GitHub signing secrets/environment before production can take ownership of Pages. Remove test inputs from the active source tree; retain old Git commits/`gh-pages` only as inactive audit history. The deployed artifact must no longer contain `/test/`.

Do not erase local test keys or old user plugin data as cleanup. Production selects a separate root/endpoint namespace, with no automatic test-plugin migration. Real profiles/workspaces remain unchanged. App changes stay local until a separate app commit/release is authorized. During an unconfirmed activation gap, the store is disabled rather than quietly falling back to the retired test root.
