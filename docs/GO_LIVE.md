# Production go-live and delivery acceptance

The store is not deliverable merely because Pages returns 200 or this checklist exists. **Configuration → signed operation → user-flow acceptance → external alerting → 48-hour soak → release** are separate gates. The current app intentionally remains disabled until real production verification succeeds.

## 1. Inspect, without changing anything

From a reviewed checkout of this repository:

```sh
npm ci --ignore-scripts
npm run store:doctor
```

The doctor uses the authenticated local `gh` account to **read** rules, environment restrictions, public variables and secret **names**. It never retrieves secret contents or changes settings. Missing API access/hidden bypass actors is a blocker, not an empty policy. Exit 1 means prerequisites are missing; every blocker includes an action. `readyForBootstrap: true` means configuration prerequisites only. `deliveryReady` deliberately remains false: a configuration scan cannot certify a real auditor credential, elapsed soak, human alert receipt, plugin safety or another OS.

Current root fingerprint (independently review it, do not copy server-provided trust):

```text
b5aeb97545789a359f275d828d7c3cf4e1b926460c8b931f52f6f96c26ee8460
```

Use `node src/cli.js fingerprint root.json`, not the pretty file's `sha256sum`.

## 2. Operator custody — one real-world action cannot be automated away

The original private role files were created outside Git in `~/.local/share/macromaxx-store-production-keys/`. **Do not print them or send them through chat.** The root role is `root.pem`; the three online roles are `targets.pem`, `snapshot.pem` and `timestamp.pem`.

Follow [KEY_CUSTODY](KEY_CUSTODY.md): move the root into offline custody, create an encrypted backup on separate offline storage, test recovery on an isolated system and record the authorized custodian/recovery procedure. A local copy, permission check or automated file-existence test does not establish this. Retain the public root and fingerprint independently.

**Only after the actual ceremony and explicit operator confirmation**, configure the three online role secrets by stdin (the root is not uploaded):

```sh
gh secret set PRODUCTION_TARGETS_KEY --repo Sidequest-Engineering/macromaxx-plugin-registry --env production-store-signing < ~/.local/share/macromaxx-store-production-keys/targets.pem
gh secret set PRODUCTION_SNAPSHOT_KEY --repo Sidequest-Engineering/macromaxx-plugin-registry --env production-store-signing < ~/.local/share/macromaxx-store-production-keys/snapshot.pem
gh secret set PRODUCTION_TIMESTAMP_KEY --repo Sidequest-Engineering/macromaxx-plugin-registry --env production-store-signing < ~/.local/share/macromaxx-store-production-keys/timestamp.pem
```

Do not set the custody flag yet if the isolated auditor is still missing; finish the next step first. No personal CLI token is copied into CI.

## 3. Dedicated governance App

Organization owner: open <https://github.com/organizations/Sidequest-Engineering/settings/apps/new>.

- Name: an available organization-owned governance-auditor name.
- Homepage: this registry repository; disable webhooks if unused. No OAuth/user authorization is needed.
- Repository permissions: **Administration write**, **Contents read**, default **Metadata read**. No Contents/Pull requests/Secrets write, no organization permissions.
- Install the App on **only** `macromaxx-plugin-registry` (selected repositories), not every repository.
- Generate/download its private key to a private directory outside Git. It is an App credential, not a TUF key. Do not show it in chat/logs.

Configure its public numeric App ID and private key in the isolated environment:

```sh
gh variable set GOVERNANCE_APP_ID --repo Sidequest-Engineering/macromaxx-plugin-registry --env production-governance --body '<actual numeric App ID>'
gh secret set GOVERNANCE_APP_PRIVATE_KEY --repo Sidequest-Engineering/macromaxx-plugin-registry --env production-governance < /secure/path/governance-app.private-key.pem
```

The existing main-only audit job mints a short-lived repository-scoped App token and inspects the real bypass lists. Administration write is powerful; keep it outside signing and review the App installation. Presence in `store:doctor` is not proof that the App key/installation works: the real audit job must succeed.

After confirmed custody **and** all App/online-role inputs are configured, set the repository-level confirmation to the independently reviewed fingerprint:

```sh
gh variable set PRODUCTION_ROOT_CUSTODY_SHA256 --repo Sidequest-Engineering/macromaxx-plugin-registry --body '<confirmed fingerprint from the public fingerprint command>'
npm run store:doctor
```

This permits production signing on the next run; never use it as a way around unconfirmed custody. Do not shadow it with an environment variable.

## 4. Bootstrap and normal renewal, then real client/app acceptance

Dispatch **a fresh whole workflow**, not an old individual job:

```sh
gh workflow run pages-production.yml --repo Sidequest-Engineering/macromaxx-plugin-registry --ref main -f bootstrap=true
```

Watch the resulting run and require audit/import/sign/publish/deploy all to succeed. This is the only explicit first bootstrap. Never bootstrap again to recover lost/corrupt history. Then dispatch the same workflow with `-f bootstrap=false` and require metadata version +1, unchanged retained package bytes and successful deployment. Record both run URLs, history commits and metadata identities.

Verify anonymous HTTPS with the independently pinned public root through fresh **and retained** real TUF clients. The external probe below performs both, compares live metadata/catalog to current authenticated history and rejects rollback. A valid old deployment is not recovery.

Before enabling the shipped app:

1. Enroll/review the actual first plugin through ordinary protected PR; compare built bytes, manifest, hash and source. No fabricated production demo listing.
2. In an isolated acceptance profile, install it through native permission confirmation, execute a real action, restart the app, verify plugin-scoped state, update to a reviewed version, and verify expanded permissions cannot silently auto-update.
3. Exercise revocation/expiry/HTTP-failure/rollback in isolated fixture authorities, **not by permanently revoking a real safe production version for a test**. Known revocation must stop execution; fresh install of revoked bytes must fail.
4. Pin the same independently reviewed root and production `/metadata/` and `/targets/` URLs into the app only after live checks pass. Do not adopt a downloaded `client-config.json` as a root of trust. Old authority installations/settings are not migrated/deleted.
5. Test the actual packaged app, native modules and ASAR worker/WASM. Run full app/runtime suites and platform-specific checks for every OS you promise to support. Linux success is not Windows/macOS certification. Commit/release the app separately; uncommitted local integration is not a shipped release.

A repeatable packaged-runtime fixture check is included (run from the registry checkout with the app's Electron executable and actual absolute ASAR module path):

```sh
ELECTRON_RUN_AS_NODE=1 /absolute/path/to/electron scripts/verify-packaged-store.js /absolute/path/to/resources/app.asar/node_modules/@macromaxx/plugin-runtime/src/index.js
```

It checks consent denial, install/action, close/reopen with persisted state, update preserving settings, and revocation execution/install denial through the real packaged worker/WASM. It uses a new loopback-only signing identity and private temporary state, never production keys or a real workspace. Store close/reopen in this harness is **not** a GUI/application-process restart or real-production-plugin approval; those remain separate acceptance steps.

The current six-hour refresh and **24-hour timestamp/catalog expiry** remain intentional: installed store plugins stop when trust expires. This work does not add offline grace. Changing that product/security policy requires an explicit decision, not an availability workaround.

## 5. Monitoring outside GitHub

Use an always-on host outside GitHub Actions and without production private keys or GitHub administration/write tokens. This repository has a secretless one-shot monitor and example user units in [`ops/`](../ops/). The monitored repository/history is public. Review/pin the monitor code revision and lockfile; never auto-update executable monitor code from a timer.

The host needs supported Node.js (see package engines), Git, network access and accurate time. Install this reviewed checkout as `~/macromaxx-plugin-registry`, run `npm ci --ignore-scripts`, and place an independently checked **public** root copy outside the checkout. Never mount the private-key directory on the monitor host.

Copy `ops/monitor.env.example` to `~/.config/macromaxx-registry-monitor.env` with mode0600; replace the example home paths. Create its state directory mode0700. Set:

- `MONITOR_ROOT_FILE` and independent `MONITOR_ROOT_SHA256`.
- `MONITOR_STATE_DIRECTORY`: durable private state **outside** the checkout (it contains rollback-protecting TUF cache, a retained Git history ref and sample evidence).
- `MONITOR_WEBHOOK_URL` (optional Bearer token): HTTPS JSON POST receiver routing warnings/failures/recovery to an attended destination.
- `MONITOR_HEARTBEAT_URL` (optional separate token): HTTPS POST endpoint at an independent dead-man monitor; configure it to alert after **30 minutes without a successful heartbeat**, including never receiving the initial heartbeat. Only healthy verified probes send heartbeats.

Use a receiver that accepts JSON POST; provider-specific adapters are not assumed. HTTP acceptance does not prove a notification reached a human. Test the real destination with `store:alert-test`, confirm receipt, and deliberately stop probing long enough to confirm a missing-heartbeat alert. An always-on process and endpoint URLs alone are not this evidence.

Install the example units under `~/.config/systemd/user/`, review the Node/path values, then:

```sh
systemd-analyze --user verify ~/.config/systemd/user/macromaxx-registry-monitor.service ~/.config/systemd/user/macromaxx-registry-monitor.timer
systemctl --user daemon-reload
systemctl --user enable --now macromaxx-registry-monitor.timer
systemctl --user start macromaxx-registry-monitor.service
journalctl --user -u macromaxx-registry-monitor.service
```

Ensure the host/user manager runs after logout and reboot (administrator-managed lingering if needed); a sleeping laptop is not the production monitor. The timer fires every15minutes away from the hour. A different scheduler may invoke `node src/monitor-cli.js probe` with the same environment; do not run it inside Actions and call it independent.

Probe failure exits1, records a failing observation and attempts notification. A notification/heartbeat failure also records failure, never a healthy sample. URL/token values are not printed. Missing production history is failure even though the public landing honestly says pending. No root/metadata validity is extended on network errors.

If killed mid-probe, `probe.lock` may remain; investigate the timer/process, stop concurrent probes and remove only that stale lock. Never clear the `client/` or `history.git/` cache as a rollback-recovery shortcut. Preserve logs/evidence. A16MiB evidence quota stops probing rather than silently truncating evidence: archive samples explicitly and restart the soak. State/clock corruption similarly requires operator review.

## 6. Real 48-hour release gate

With the same external environment loaded, run `node src/monitor-cli.js soak` (`npm run store:soak`). It requires at least48 elapsed hours of continuous healthy observations, latest sample no older than30minutes, no gap over30minutes, unchanged authority, monotonic publication identities and actual signed renewal. Warnings/failures reset the healthy run. After a sampling gap or clock/identity anomaly, preserve the old evidence and explicitly start a fresh sample log; never alter its timestamps to pass.

The test suite uses synthetic clocks to test report logic; **that is not a real elapsed soak**. Local evidence is an operational log, not tamper-proof remote attestation. Protect the monitor host/time/logs. The report is explicitly **registry-only** and cannot approve plugin review, receipt of alerts, physical devices, app signing, another platform or the offline-key ceremony.

Release sign-off must include: real bootstrap/renewal evidence, actual plugin/package acceptance, attended alert/dead-monitor tests, the real soak report, recovery drill and supported-platform release artifacts. Until all are present, report the specific missing gate rather than 'production-ready'.
