# Public TEST channel inputs

This is not the production registry. `../registry.json` remains independent.

- Public test root: `root.json`, independently pinned into the local app, expires 2027-11-12. Never download and blindly adopt a new root from Pages.
- Reviewed package: `example--counter@1.0.0`, SHA-256 `e681f30aaf3bd1a23b2331d72b26936a2cc870f0c69169e41076a992fb758303`, 2548 bytes.
- Source: sibling `macromaxx-plugin-example`, commit `e7f3d69104ed8993cbe3cf3de80b4709a5b4d122`; rebuilding with its pinned SDK produced byte-identical output. Source review: key-down display, increment local count/settings, configurable label, log. Only display/settings permissions; no network/filesystem/shell APIs.
- The `example` publisher is an internal test fixture, not an enrolled third-party production publisher.
- No private keys are stored here. Only the three online TEST keys belong in the main-only `test-store-signing` environment. Never put the root private key in GitHub.

`Deploy signed Pages test store` renews metadata every six hours and on input/tooling changes. All history is retained on `gh-pages` through ordinary fast-forward commits; workflow artifacts are transfer objects, not the authority. First publication requires manual `bootstrap: true`. Renewals with absent, damaged or racing history fail closed. Monitor Actions: timestamps/catalogs expire after 24 hours, and scheduled jobs may be delayed/disabled by GitHub.

Pages serves only generated `test/metadata/`, content-addressed `test/targets/`, authenticated publication state and a public configuration example. It never serves this input folder, sources, quarantine or private material. Administrators can still change the repository/history: Pages is not WORM storage. Protect main/workflows and the test signing environment before widening access; this test identity must not be promoted to production.

Revocation: change status to `revoked` while retaining descriptor/package inputs; merge and deploy a new metadata version. Never rewrite an existing version/hash, delete history or reset the metadata version. Root rotation/threshold signing and production deployment require a separate reviewed ceremony.
