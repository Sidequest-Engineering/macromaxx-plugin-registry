# MacroMaxx Plugin Registry

**Useful actions for your deck. Clear permissions. Releases you can trace.**

[![Registry checks](https://github.com/Sidequest-Engineering/macromaxx-plugin-registry/actions/workflows/validate.yml/badge.svg)](https://github.com/Sidequest-Engineering/macromaxx-plugin-registry/actions/workflows/validate.yml)

[Browse the registry](https://sidequest-engineering.github.io/macromaxx-plugin-registry/) · [Publish your first plugin](CONTRIBUTING.md) · [Entry examples](examples/) · [Security](SECURITY.md)

This repository is the review and publication home for MacroMaxx plugins. Publishers submit versioned packages through pull requests; organization maintainers review ownership, code, exact package bytes and permissions before publication. The app verifies signed metadata and SHA-256 hashes against an independently pinned root.

**Production activation is guarded.** The former demo is not a production trust authority. Production starts with an empty catalog and independent keys; signing stays disabled until the operator confirms root-key custody and recovery backup. See [operations](docs/OPERATIONS.md) for live readiness checks and limits. Example entries are documentation, never fabricated listings.

## Choose your next step

| You want to… | Start here |
| --- | --- |
| Build and submit a plugin | [Contributor guide](CONTRIBUTING.md) |
| Understand an entry | [Formatted examples](examples/) |
| Review a submission | [Maintainer checklist](docs/REVIEWING.md) |
| Report a vulnerability | [Security policy](SECURITY.md) |
| Operate, revoke or recover the registry | [Operations runbook](docs/OPERATIONS.md) |
| Prepare the production signing identity | [Key custody](docs/KEY_CUSTODY.md) |

## Your first submission

1. **Build:** use the MacroMaxx SDK, declare focused actions and only the permissions they need.
2. **Release:** tag a reviewed source commit and attach an exact `.mmxp` file to a versioned GitHub Release.
3. **Submit:** propose a publisher/release entry and pinned source descriptor in a PR. CI gives early feedback; maintainers make the release decision.

```sh
npm ci --ignore-scripts
node src/cli.js request /absolute/path/to/your-plugin-1.0.0.mmxp
npm run validate
npm test
```

The descriptor command inspects bytes; it does not execute your plugin. Follow the [full submission steps](CONTRIBUTING.md) before opening the PR.

## Small, explicit entries

| File | What reviewers see |
| --- | --- |
| `registry.json` | Publisher identity; full manifest, permissions, version, hash, byte length and status |
| `sources/<sha256>.json` | Exact repository, release tag, asset name and source commit |
| `.github/CODEOWNERS` | The organization team responsible for reviewing all publication inputs/tooling |

Keep JSON readable: two-space indentation, one field per line and a final newline. Use [the real-schema examples](examples/) as a guide, not as live release data. Existing version/hash/manifest bindings cannot be rewritten; revocation is permanent.

## How publication works

```text
Your PR → validation → Codeowner review → merge
                                      ↓
verified import → protected signing → retained history → GitHub Pages
```

`@Sidequest-Engineering/registry-maintainers` owns all paths, including workflows and CODEOWNERS itself. PR submission and passing CI remain mandatory. **Explicit owner exception:** EinCloudy may merge through the named PR-review exception without another person's review. GitHub does not permit literal own-PR approving reviews; this is a visible actor-based exception, not a fabricated approval. Native GitHub also lets that named actor override review on another author's PR. It cannot waive the separate no-bypass PR/CI rules. Ordinary contributors receive no publishing credentials or such exception.

Production metadata and packages use the Pages project-root `metadata/` and `targets/` endpoints. Publication retains authenticated state on `production-publication`; the former `gh-pages` test branch is inactive audit history, not production input. Scheduled renewal every six hours does not approve new packages: it republishes protected-main registry contents with a new metadata version.

## What verification does—and does not—mean

- Signatures and hashes authenticate approved bytes; they are **not** a malware scanner or a promise that code is harmless.
- Standard plugins run in the restricted QuickJS/WASM engine. Arbitrary shell, network, direct filesystem, native addons and privileged runtimes are not silently authorized.
- Legacy local plugins remain a separate, trusted-code feature and are not sandboxed by this registry.
- GitHub Pages is static hosting with size/rate/bandwidth limits, not administrator-proof immutable storage or an availability SLA. Expired metadata fails closed.
- A production registry does not automatically code-sign the Electron app, add an independent daemon, or certify untested platforms.

See [SECURITY](SECURITY.md) for the trust boundary and [OPERATIONS](docs/OPERATIONS.md) for failure recovery.
