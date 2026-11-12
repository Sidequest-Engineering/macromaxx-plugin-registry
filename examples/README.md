# Entry anatomy

These are **schema-valid documentation fixtures**, not real enrolled publishers or approved packages. The `a…a` digest/commit, account, byte length and plugin are placeholders. Nothing in this directory is published into the live catalog or fetched by the tests.

- [`registry.json`](registry.json): a complete, readable publisher plus release entry.
- [`source.json`](source.json): the pinned GitHub Release source for that proposed release.

For a real submission, generate the descriptor from your actual `.mmxp` bytes with `node src/cli.js request /path/plugin.mmxp`. Copy the exact manifest/hash/length it prints; **do not copy the placeholder hash or invent permissions**. Add the source file as `sources/<actual-package-sha256>.json`, including the reviewed source commit, exact tag and asset name. See [CONTRIBUTING](../CONTRIBUTING.md).

`status: approved` is a proposed descriptor value. It does not grant approval: only the protected Codeowner-reviewed merge/publication process does that. Revoked releases remain in the registry permanently.

Examples and submission validation are exercised by `npm test`. Validation checks structure, not publisher ownership, source/package reproducibility or whether code is harmless; maintainers review those separately.
