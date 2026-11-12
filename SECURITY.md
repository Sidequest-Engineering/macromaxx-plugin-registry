# Security policy

## Reporting

Do not publish credentials, private keys or exploit packages in issues/PRs. Use the repository's **Security → Report a vulnerability** flow if available. If private reporting is unavailable, contact an organization maintainer to arrange a private channel first; a public issue should contain only a request for that channel, not sensitive details. No guaranteed response SLA is advertised.

## Trust boundary

- TUF metadata authenticates catalog state and targets against the root pinned independently into the app. Root trust is never taken from arbitrary server/renderer input.
- Exact SHA-256, byte length and complete manifests bind installation to reviewed packages. Versions cannot be rewritten; revocation is permanent.
- The restricted standard runtime exposes only supported declared capabilities. Process isolation and QuickJS/WASM are not a claim of a complete OS security sandbox. Local legacy plugins are trusted code and remain separate.
- Settings are local, unencrypted, plugin-scoped non-secret JSON, not credential storage. Workspace exports do not grant plugin permissions.
- Reviewed code may still be malicious. Maintainer/GitHub/online-signing compromise, engine vulnerabilities, local-account compromise and unavailable offline revocation are residual risks.

## Governance and key custody

The root private key stays outside GitHub and needs operator-confirmed offline custody plus encrypted backup before activation. Initial tooling uses one key per role, **not** a multi-person TUF threshold. Codeowner review is GitHub governance, not an independent cryptographic quorum.

Online keys are separate targets/snapshot/timestamp roles in the protected production signing environment. No root key, publisher credentials or host-administration credentials belong in CI. PR jobs do not receive signing secrets.

All paths have organization Codeowners. EinCloudy's explicit PR-only review exception permits self-merge, not a fabricated own-PR review; native GitHub can also apply the same actor exception to others' PRs. Separate no-bypass PR/CI rules remain enforced. A compromised maintainer with that authority is a publishing trust compromise.

## Incidents and limits

Revoke unsafe releases, publish a newer signed version, investigate and rotate compromised roles through an audited root transition. Do not reset metadata versions, erase descriptors, undo revocations or silently accept a different root. App/code-signing incidents can require an independently authenticated app release.

Pages is not WORM storage and does not provide an availability guarantee. Catalog/timestamp expiry fails closed; delayed or disabled renewal can stop plugin execution. An Actions-based health check shares GitHub's outage domain. See [operations](docs/OPERATIONS.md) and [key custody](docs/KEY_CUSTODY.md).
