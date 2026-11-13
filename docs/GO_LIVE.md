# Production go-live and delivery acceptance

Pages200 is not proof of a working signed store. **Configuration → signed bootstrap/renewal → real client and packaged app acceptance → observed operation → release** are separate gates. External Healthchecks/monitoring services are explicitly deferred by the operator: no additional host, webhook or heartbeat setup is required. Existing internal signature/deployment checks remain enabled.

## 1. Read-only configuration inspection

From a reviewed registry checkout:

```sh
npm ci --ignore-scripts
npm run store:doctor
```

The doctor uses local `gh` authentication to read rules, main-only environment restrictions, public variables and secret **names**, never secret contents. It makes no changes. Missing access, incomplete API inventory or hidden bypass actors fails closed. Exit1 includes actionable blockers. `readyForBootstrap` is configuration readiness only; `deliveryReady` deliberately remains false because scanning settings cannot establish real credential validity, elapsed operation or app/platform acceptance.

Current independently reviewed root fingerprint:

```text
b5aeb97545789a359f275d828d7c3cf4e1b926460c8b931f52f6f96c26ee8460
```

Compute it using `node src/cli.js fingerprint root.json`, not `sha256sum` of the pretty file. Never bootstrap trust from an opportunistically downloaded root.

## 2. Root custody and separate online roles

Private keys were created outside Git in `~/.local/share/macromaxx-store-production-keys/`. The original local root path is `~/.local/share/macromaxx-store-production-keys/root.pem`. Do not print/send its contents or upload it to GitHub. A locally accessible plaintext copy is not offline custody; after verifying recovery, manage any retained local copy deliberately rather than letting automation silently delete it.

Follow [KEY_CUSTODY](KEY_CUSTODY.md): offline root storage, encrypted separate offline backup, tested restoration, authorized custodian/recovery procedure. Only after actual operator confirmation may the three online role keys be uploaded by stdin:

```sh
gh secret set PRODUCTION_TARGETS_KEY --repo Sidequest-Engineering/macromaxx-plugin-registry --env production-store-signing < ~/.local/share/macromaxx-store-production-keys/targets.pem
gh secret set PRODUCTION_SNAPSHOT_KEY --repo Sidequest-Engineering/macromaxx-plugin-registry --env production-store-signing < ~/.local/share/macromaxx-store-production-keys/snapshot.pem
gh secret set PRODUCTION_TIMESTAMP_KEY --repo Sidequest-Engineering/macromaxx-plugin-registry --env production-store-signing < ~/.local/share/macromaxx-store-production-keys/timestamp.pem
```

Match each online key's public half against the reviewed public root first. Never use a personal admin token in signing. Do not set the custody flag until actual confirmation and App setup are complete.

## 3. Isolated auditor App

Create an organization-owned GitHub App at <https://github.com/organizations/Sidequest-Engineering/settings/apps/new>, without webhooks/user authorization. Grant exactly repository Administrationwrite, Contentsread and default Metadataread; no Contents/Pull requests/Secrets write or organization permissions. Install it only on `macromaxx-plugin-registry`.

Current provisioned identity: `MacroMaxx Registry Auditor`, App ID5742704, selected-repository installation181552413. Its private App credential is separate from the TUF root and stored outside Git. Its real repository-scoped installation token must be tested against governance/environment inspection, then revoked. The signing job never receives it.

```sh
gh variable set GOVERNANCE_APP_ID --repo Sidequest-Engineering/macromaxx-plugin-registry --env production-governance --body '<actual numeric App ID>'
gh secret set GOVERNANCE_APP_PRIVATE_KEY --repo Sidequest-Engineering/macromaxx-plugin-registry --env production-governance < /secure/path/governance-app.private-key.pem
```

After actual custody confirmation and complete App/online-role setup, set the **repository** confirmation to the reviewed fingerprint:

```sh
gh variable set PRODUCTION_ROOT_CUSTODY_SHA256 --repo Sidequest-Engineering/macromaxx-plugin-registry --body '<confirmed public-root fingerprint>'
npm run store:doctor
```

This permits signing on the next production run. Do not shadow the variable in environments or treat it as a substitute for the real ceremony.

## 4. Signed bootstrap and normal renewal

Dispatch a fresh whole workflow:

```sh
gh workflow run pages-production.yml --repo Sidequest-Engineering/macromaxx-plugin-registry --ref main -f bootstrap=true
```

Require audit/import/sign/publish/deploy all to succeed. This is the explicit first bootstrap only; never use it to recover missing/corrupt history. Then dispatch the same workflow with `-f bootstrap=false`: require metadata +1, identical retained artifact bytes and successful deployment. Record both run URLs, history commits and live identities.

Verify anonymous HTTPS through the real independently pinned TUF client, both fresh and with retained state. Compare signed live version/timestamp/catalog to authenticated current `production-publication`; a valid old deployment is not recovery. Existing internal health/deployment checks do this without adopting server-provided trust. Persistent verification state must not silently change authority or accept rollback.

## 5. Packaged app and plugin acceptance

Only after live bootstrap/renewal verification: pin the reviewed root and production `/metadata/` and `/targets/` endpoints into the app. Keep old authority installations/settings separate; do not migrate/delete them. An empty verified production catalog is valid and must not be padded with demo releases.

For a real first plugin, use normal publisher/source/byte review and protected PR. In an isolated acceptance profile verify native permission confirmation, install/action, actual app-process restart with retained settings, reviewed update, and rejection of silent permission expansion. Exercise unsafe-revocation/expiry/rollback through isolated fixture authorities, not by permanently revoking a real safe production release just for a test.

A repeatable packaged-runtime fixture harness is included:

```sh
ELECTRON_RUN_AS_NODE=1 /absolute/path/to/electron scripts/verify-packaged-store.js /absolute/path/to/resources/app.asar/node_modules/@macromaxx/plugin-runtime/src/index.js
```

It checks permission denial, install/action, close/reopen with persisted state, update preserving settings and revocation execution/install denial using the actual packaged worker/WASM. Keys/packages/state are throwaway loopback fixtures, never real production keys/workspaces. Close/reopen within this harness is **not** full GUI/application-process restart or approval of an actual production plugin.

Run all runtime/app tests, formatting, native packaging and actual ASAR checks. Test every OS you promise to support; Linux success is not Windows/macOS certification. Commit/release app integration separately: uncommitted local changes are not a shipped release.

## 6. Observed operation and disclosed limits

Watch scheduled renewals and internal registry-health Actions/issues after activation. A real48-hour observation cannot be replaced by synthetic clocks or a fast test suite. Record actual run timestamps, metadata advancement and any failures before claiming that duration of stability. External outage notification is not configured and is not a delivery claim.

Existing policy remains: six-hour refresh and **24-hour timestamp/catalog expiry**. Installed store plugins stop after trust expires; this work does not add offline grace or disable verification. Review this product/security tradeoff explicitly before promising offline operation. Pages/Actions have no guaranteed availability here; an internal monitor can fail during the same GitHub outage.

Release sign-off should state actual bootstrap/renewal evidence, packaged app/plugin acceptance, elapsed observation, recovery readiness and supported-platform artifacts. Report missing evidence rather than 'production-ready'. External monitoring can be added later without changing trust rules.
