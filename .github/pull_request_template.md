## What does this change do?

Describe the plugin/release or registry change in a few clear sentences.

## Release evidence

| Evidence | Exact value |
| --- | --- |
| Publisher and plugin ID | |
| Version | |
| Source repository and full commit SHA | |
| GitHub Release tag and asset URL | |
| Package SHA-256 and byte length | |
| Build/test commands and dependency lockfile | |
| Platforms actually tested | |

## Permissions

Explain each requested permission and why the plugin cannot do its job without it. Note any new permissions compared with previous versions.

## Contributor checks

- [ ] I used the complete descriptor generated from the actual package bytes.
- [ ] The source descriptor pins the exact commit, tag and asset.
- [ ] Existing publisher ownership and version/hash/manifest bindings are unchanged.
- [ ] I did not delete old releases or undo a revocation.
- [ ] `npm run validate` and `npm test` pass.
- [ ] No credentials, private keys, dependency directories or unrelated artifacts are included.
- [ ] I understand that CI success is not release approval or a security guarantee.

Maintainers: use [the review checklist](../docs/REVIEWING.md). Do not paste secrets into this PR.
