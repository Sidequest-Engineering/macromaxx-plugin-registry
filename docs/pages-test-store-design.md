# GitHub Pages test store

User-approved scope: publish a signed test store through GitHub Pages and connect the local MacroMaxx app. Production registry remains independent. No production trust keys are generated; no existing workspace is replaced.

## Design

- Serve only generated static files at `https://sidequest-engineering.github.io/macromaxx-plugin-registry/`, with TUF metadata and targets under `test/`.
- Pin a separate public test root in `test-store/root.json` and in the app configuration. Keep root private key only in a private local directory outside Git. Put only the three online TEST role keys in a main-only GitHub environment.
- Include one minimal reviewed counter package (no network/filesystem/terminal permissions) as a content-addressed source artifact. The production `registry.json` stays unchanged.
- Prepare/sign in a job with read-only repository permissions; publish/deploy in a separate job without signing secrets. Pin Actions by commit SHA.
- Preserve signed publication state and immutable metadata/targets in `gh-pages`. Verify previous state against the pinned root, require monotonically increasing versions, reject replacement of immutable bytes, never force-push. Do not depend on expiring workflow artifacts for history.
- Explicit bootstrap is allowed only when no prior history exists; scheduled renewals cannot silently reset version history. Renew every six hours because timestamp/catalog expire after 24 hours. Disabled/delayed Actions can still cause expiry; clients fail closed.
- Copy only whitelisted static metadata/content-addressed targets, never keys/quarantine/source files. Enforce size/path/link checks when assembling a site.
- The app uses root-and-endpoint-namespaced plugin data/cache, keeping tests separate from any production store. Existing legacy store directory is retained, not migrated or deleted. Display an explicit test-channel notice.
- Root rotation/production rollout, stronger immutable storage, human release approval and OS isolation remain separate requirements. Pages is not administrator-proof WORM storage.

## Alternatives

Local HTTP would not test public HTTPS. R2 remains the production-oriented hosting option but requires cloud setup. Pages is selected for this user-requested real-network test and low operational overhead.
