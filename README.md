# MacroMaxx static plugin registry

Git/PR-based publisher and release review, exact-byte GitHub release import, content-addressed artifacts and TUF-authenticated distribution. No database or continuously running API is needed. A separate GitHub Pages **test channel** is configured; no production trust ceremony or real publisher enrollment has been performed.

## GitHub Pages test channel

Public site: https://sidequest-engineering.github.io/macromaxx-plugin-registry/

Metadata and targets live under `test/metadata/` and `test/targets/`. See [test-store/README.md](test-store/README.md) for package provenance, key custody, history, renewal and revocation. The local app pins the public test root; its plugin installations/settings/caches are namespaced by root and endpoints, separate from production or earlier stores. The generated `test/client-config.json` is an example, **not** an independently authenticated trust bootstrap.

The pinned Pages workflow separates read-only signing from keyless publication/deployment. It renews every six hours; monitor Actions because a failed/delayed renewal causes clients to fail closed after 24 hours. GitHub Pages is test hosting, not administrator-proof immutable storage. Production guidance below still applies separately.

## Publisher workflow

1. Copy the example; use your own `publisher--plugin` ID. Enroll the publisher's GitHub account through a reviewed PR; maintainers verify account/repository control out of band.
2. Commit code and lockfile, typecheck/test and build a versioned `.mmxp` file.
3. Tag the reviewed source commit, create a GitHub Release and attach that exact file. Never use `latest` in registry requests.
4. Generate a proposed release descriptor:

   ```sh
   node src/cli.js request ../your-plugin/dist/plugin-1.0.0.mmxp
   ```

5. Add the descriptor to `registry.json` and its pinned source in `sources/<sha256>.json`. Open a PR. Publishers do not get signing/storage access.
6. Maintainers review source, dependency changes, artifact bytes, permissions and platform claims. Automated validation is **not** a malware scanner or code audit. The source commit is review metadata; reproducible source/artifact correspondence still requires independently rebuilding and comparing outputs.
7. Import exact bytes; approve/sign only that hash. Changed upstream assets fail hash/length checks. Fixes always need a new plugin version.

## Local validation/import

```sh
npm ci --ignore-scripts
npm test
node src/cli.js validate registry.json previous-registry.json
node src/cli.js fetch registry.json sources public
# Alternatively import a locally reviewed package without executing it:
node src/cli.js import registry.json ../your-plugin/dist/plugin-1.0.0.mmxp public
```

An existing ID/version cannot change publisher, manifest, hash or byte length. Existing releases cannot disappear; mark them withdrawn/revoked. Revocation is permanent. Withdrawn versions are excluded from installation/execution in this conservative policy. Publisher identity changes need a separately reviewed administrative migration, not a routine release update.

The GitHub importer accepts public GitHub releases and restricted HTTPS GitHub/CDN redirects only, bounds downloaded bytes, and never evaluates package code. A Publisher can still publish malicious *new* versions; each version needs review and users must not equate a known publisher with trustworthy code.

For subsequent publications pass the authenticated previous publication and public root to `fetch` as its final two arguments. Already approved artifacts are verified/reused from that publication instead of fetched again from the developer. CI does this automatically; deletion or replacement of upstream assets cannot retroactively block retained packages. Back up the authoritative publication artifacts beyond GitHub's retention period.

## First trust ceremony (operator only)

**Do not run init casually for a production registry.** Plan backup, custody and recovery first. This MVP bootstrap uses one key per role; use a documented multi-person root/targets threshold ceremony before wider distribution. The official TUF format/client supports thresholds; this CLI does not automate threshold key management.

```sh
node src/cli.js init /absolute/private/location/outside-repo root.json
```

This writes separate Ed25519 root, targets, snapshot and timestamp private PEM files with mode 0600. Move `root.pem` offline immediately; never upload it to GitHub or R2. Back up keys encrypted and limit account access. `root.json` is public, should be reviewed/committed and pinned into the application build. Root expiry is one year; targets/snapshot seven days; timestamp/catalog one day. Refresh publication daily **before** expiry even if no plugin changed. All online roles must be available for this simple publication tool, increasing the impact of CI compromise; split custody/threshold signing is a future hardening requirement.

```sh
node src/cli.js publish registry.json root.json /private/online-keys public 1
```

The output has versioned metadata, hash-prefixed immutable targets and a timestamp commit point. `registry-state.json` is itself a signed TUF target. Keep it and all earlier metadata/objects between publications. Clean output directories for version 2+ require the prior authenticated publication directory as the final CLI argument. The tool verifies its signatures, metadata chain and state hash before enforcing immutable descriptors, permanent revocations and an increment of exactly one. Historical expiry does not erase history; it is authenticated audit input, not client update trust.

Root rotation uses standard TUF dual-signing and sequential `<version>.root.json` files; perform it offline with audited TUF tooling and test an existing pinned-root client. The client supports the protocol; this CLI does **not** automate the ceremony or authenticate a previous publication signed under replaced role keys. Such a rotation needs an explicitly reviewed history migration; do not bypass it by resetting publication versions.

## GitHub controls

`validate.yml` is unprivileged and compares mappings against the PR base. `prepare-publication.yml` separates unprivileged downloads from protected signing, and produces a signed publication artifact **without deploying it**. Before enabling:

- Decide repository boundaries; templates assume this directory becomes the registry repository root.
- Configure branch protection, required checks/reviews and CODEOWNERS covering registry, publishers, sources, workflows and tooling. Do not let a publisher self-approve.
- Protect the `plugin-release` environment with independent required reviewers and main-only deployment policy.
- Configure only TARGETS_PRIVATE_KEY, SNAPSHOT_PRIVATE_KEY, TIMESTAMP_PRIVATE_KEY in that environment. No root private key or hosting-administration credentials.
- Add the reviewed public `root.json`. The workflow automatically restores the latest successful publication artifact from this workflow on main (not an operator-selected old run), and cryptographically verifies its state before signing. An absent previous run only permits metadata version 1. An expired/deleted prior artifact fails closed; retain/back up history before GitHub retention expires. The workflow prepares publications, not a live cloud deployment; deployment must not introduce an out-of-band alternate version history.
- Actions are pinned to the v4 commit SHAs resolved from the official GitHub repositories during implementation. Review and maintain these pins; pinning prevents tag replacement, not malicious changes already present in a reviewed commit.

Never use `pull_request_target` to execute publisher-controlled source with secrets. Protect SDK/runtime snapshots too. PR checks cannot replace branch/environment protection.

## Hosting recommendation: Cloudflare R2

Use a dedicated bucket/custom HTTPS domain with separate administrator and narrowly scoped upload credentials. Enable bucket locks on immutable `targets/` and versioned metadata prefixes (or separate immutable storage from mutable timestamp). R2 bucket locks can be removed by administrators: this is not administrator-proof WORM storage. TUF authenticates content independently. Store root/key backups separately.

Deploy in order: **immutable targets → versioned root/targets/snapshot metadata → timestamp.json last**. Use create-only uploads/conditional writes for immutable keys and fail if an existing object differs. Never use a destructive bucket sync. Upload metadata with short/no-cache policy; use immutable caching for hash-addressed objects. Make deployment serialized and persist/verify metadata version/history. Metadata-only publications (including revoking the last plugin) carry an explicit transfer manifest, not a required package file. Configure the hosting tool yourself with credentials; this project deliberately does not deploy or assume your cloud account.

App configuration (`macromaxx/electron/plugin-store-config.json`):

```json
{
  "enabled": true,
  "metadataUrl": "https://plugins.your-domain.example/metadata/",
  "targetsUrl": "https://plugins.your-domain.example/targets/",
  "root": { "signed": "REPLACE_WITH_THE_COMPLETE_REVIEWED_ROOT_JSON", "signatures": [] }
}
```

Replace `root` with the **entire** real `root.json`, not the placeholder above. An invalid/missing configuration fails closed. Renderer IPC cannot change registry URLs or trust roots. `MACROMAXX_STORE_CONFIG=/path/config.json` is accepted only in unpackaged development; `allowLoopback: true` only permits loopback HTTP there.

R2 minimizes server maintenance and egress costs, not all costs: storage, requests, CI, domain and account terms still apply. A stronger retention provider is an alternative if administrator-proof retention is required. A VPS adds patching/backups/availability work without solving signing or review.

## Incident response

Set the affected release to `revoked`, retain its immutable descriptor, publish newer signed metadata and invalidate mutable-metadata CDN caches. Clients disable/terminate it on refresh; expiry bounds stale trust but cannot instantaneously notify offline clients. Do not rewrite packages or roll back to revoked versions. Investigate publisher/CI/key compromise before accepting a replacement version. Rotate online signing roles through a properly cross-signed root when needed. Root-key compromise may require an independently authenticated app update/trust reset. Plugin uninstall cannot undo arbitrary effects of a previously privileged legacy plugin.
