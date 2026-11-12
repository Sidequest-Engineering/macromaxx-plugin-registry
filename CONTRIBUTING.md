# Publish a MacroMaxx plugin

Welcome! A good plugin solves one clear problem, asks for understandable permissions, and can be rebuilt from its reviewed source. You keep control of your code and releases; registry maintainers control enrollment and publication.

## Before you start

Use a current supported Node.js release (22.22.2+, 24.15.0+, or newer). You do not need access to a private organization repository to get the SDK: this registry includes a public, versioned SDK snapshot.

In your plugin project:

```sh
npm init -y
mkdir -p vendor
curl --fail --location --proto '=https' --proto-redir '=https' \
  --output vendor/macromaxx-plugin-sdk-0.1.0.tgz \
  https://raw.githubusercontent.com/Sidequest-Engineering/macromaxx-plugin-registry/4a6a7af1ab927b5b30285f82c4a27c53c4201aaa/vendor/macromaxx-plugin-sdk-0.1.0.tgz
```

Verify the downloaded SDK before installing it. SHA-256 for this snapshot:

```text
23428d45b39603b74e0837091b68745e739ae075a6ba2895455c3b3d54f096e9
```

Then install the verified **local** archive:

```sh
npm install --save-dev --ignore-scripts ./vendor/macromaxx-plugin-sdk-0.1.0.tgz
```

This pins the existing public SDK snapshot to a full immutable registry revision and works with npm policies that disable remote-tarball installation; do not disable those policies. Keep the verified archive and lockfile for reproducible builds. npm publication under the package name is not assumed. Review SDK changes before updating the dependency pin.

- Use your own `publisher--plugin` identifier; do not submit the internal demo or copy the documentation fixture as a real release.
- Use the MacroMaxx plugin SDK and supported standard runtime. Declare all actions, supported platforms, app compatibility and required permissions in the manifest.
- Settings are local, unencrypted, non-secret JSON. Do not put credentials in plugin settings, packages, PRs or issue reports.
- Keep code and a lockfile in a reviewable repository. Test/typecheck and independently rebuild the release package before submitting it.

The SDK command reads `manifest.json` and `src/index.ts` in your project. Its installed README and `src/index.d.ts` document `definePlugin`, action hooks and supported host APIs. Once those files are ready, build with `npx --no-install macromaxx-plugin build dist/your-plugin-1.0.0.mmxp`. Keep the resulting lockfile. SDK download does not enroll a publisher or authorize a registry release; the review steps below still apply.

## 1. Enroll your publisher

Add one entry to `publishers` in `registry.json`:

```json
{
  "id": "your-publisher",
  "name": "Your publisher name",
  "github": "your-github-account"
}
```

Maintainers verify account/repository control out of band. A GitHub handle in a JSON file is a claim, not proof of ownership. Existing publisher identities cannot silently change hands. Discuss transfers with maintainers separately.

## 2. Publish exact release bytes

1. Commit reviewed code and the dependency lockfile. Record the full 40-character commit SHA.
2. Build your versioned `.mmxp` file using the SDK, and test it through the real isolated runtime.
3. Tag that commit as `v<manifest-version>`, for example `v1.0.0`.
4. Create a GitHub Release and attach the exact package. Do not reference `latest`, a branch archive, a moving URL or a rebuilt file with different bytes.

The registry importer accepts pinned public GitHub Release assets and restricted GitHub HTTPS redirects. The source pin is review evidence; maintainers still need to establish that the built bytes correspond to the source.

## 3. Generate the release descriptor

From this repository:

```sh
npm ci --ignore-scripts
node src/cli.js request /absolute/path/to/your-plugin-1.0.0.mmxp
```

Add the resulting object to `releases` in `registry.json`. Keep the **complete manifest, SHA-256 and byte length exactly as generated**. A proposed `approved` status does not bypass review: the protected merge and publication are the actual approval boundary.

| Field | Meaning | Reviewer checks |
| --- | --- | --- |
| `manifest.id` | Stable `publisher--plugin` identity | Namespace belongs to the enrolled publisher |
| `manifest.version` | Exact plugin version | New immutable release; never a replacement |
| `manifest.permissions` | Capabilities the runtime may expose | Each permission is necessary and explained |
| `manifest.platforms` / `appVersion` | Compatibility claims | Tests support those claims |
| `sha256` / `length` | Exact package bytes | Independent rebuild and downloaded asset agree |
| `status` | Proposed approved/withdrawn/revoked state | Human review and permanent revocations |

See the complete [formatted entry example](examples/registry.json). Its digest/account/length are placeholders; never use them for your release.

## 4. Pin the source

Create `sources/<actual-package-sha256>.json` with readable JSON:

```json
{
  "repository": "https://github.com/your-account/your-plugin",
  "tag": "v1.0.0",
  "asset": "your-plugin-1.0.0.mmxp",
  "commit": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
}
```

Replace that example commit with the **actual full source SHA**. The tag must equal `v` plus the manifest version. Keep the source descriptor and exact release descriptor in the same PR. Do not submit private keys, access tokens, dependencies, build caches or unrelated files.

## 5. Validate and open your PR

```sh
npm run validate
npm test
```

Use two-space JSON indentation and a final newline. Explain what the plugin does, why every permission is needed, which platforms were tested, and how reviewers can reproduce the build. Include the exact source commit, release asset and package digest. The PR template walks you through this.

CI validates structure, pinned source shape and immutable mappings. It does not enroll publishers, prove reproducibility, scan all malware, or grant permission to publish. Registry maintainers review before merge. New reviewable pushes invalidate old approvals.

## Updates, withdrawal and revocation

- Every changed package requires a **new plugin version** and a new reviewed descriptor/source. Never replace an old release's bytes, manifest or hash.
- Old descriptors cannot disappear. Use `withdrawn` when a version should no longer be offered; use `revoked` for an unsafe release. Revocation cannot be undone.
- Approved artifacts already in authenticated publication history are reused; upstream asset deletion does not erase them.
- Extra permissions require fresh user consent. Automatic updates are opt-in and cannot add permissions silently.
- For vulnerabilities, follow [SECURITY](SECURITY.md), not a public issue containing secrets or an exploit package.

## Review and self-merge policy

The organization team `@Sidequest-Engineering/registry-maintainers` owns all files. Ordinary contributions need Codeowner approval and passing CI. EinCloudy has the user-authorized, named PR-only review exception: GitHub cannot record a literal self-approval, but permits that actor to merge without a second reviewer. This actor-based capability also applies to others' PRs. It is not a general admin exemption; separate PR/CI rules remain mandatory. Team membership is managed explicitly, not automatically granted to every future organization member.
