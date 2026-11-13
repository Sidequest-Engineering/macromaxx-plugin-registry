# Production key custody and activation

For exact operator commands and the separate post-custody/bootstrap/monitor/app acceptance gates, follow [GO_LIVE](GO_LIVE.md). `npm run store:doctor` reports missing setup without uploading keys or changing custody flags.

The production identity is independent of all test/unit-fixture roots. Never promote a test private key or download a public root and adopt it opportunistically.

## Operator ceremony

1. Generate four separate production role keys in a private directory **outside Git**, using the existing operator CLI. Use a trusted machine; private directory 0700 and key files 0600.
2. Review the complete public `root.json` and record the exact custody fingerprint with `node src/cli.js fingerprint root.json`. This hashes compact `JSON.stringify(root)`, **not the pretty-printed file bytes**; `sha256sum root.json` is not the gate value. This command reads public metadata only. Pin that independently reviewed public root into the app only after the production HTTPS deployment verifies.
3. Move the private root role into offline custody. Prepare an **encrypted recovery backup on separate offline storage**, record who holds it and how recovery is authorized, and test restoration on an isolated system. A local 0600 file, a second copy on the same disk, or encryption with the password stored alongside is not proof this step is complete.
4. Confirm custody/backup explicitly to the operator running the rollout. The automation agent must not claim this happened or set its confirmation variable on your behalf without that confirmation. Do not send private keys or backup passwords through chat.
5. Only then upload the three online role keys through stdin to environment `production-store-signing`. Never upload `root.pem`. Configure the separate governance-audit application below before enabling publication.
6. Record the exact fingerprint in the **repository Actions variable** `PRODUCTION_ROOT_CUSTODY_SHA256` (not an environment variable that shadows it). Import, signing and deployment bind confirmation to this reviewed public root. The agent must not set this confirmation without the operator's actual custody/backup confirmation.
7. Perform explicit first-publication bootstrap, verify with the real independently pinned-root client, and verify a normal +1 renewal with persisted client state. Monitor expiry and rehearse recovery.

The concrete local key handoff location/fingerprint is recorded in the rollout ledger, without printing secret contents. Losing the root/online keys or recovery material can prevent future renewal/rotation; compromise can authorize malicious releases. Restrict local and GitHub administrator access accordingly.

## Isolated governance auditor

GitHub hides ruleset bypass actors from callers without ruleset-write access. A read-only signing token therefore cannot prove the absence of broad bypasses. Do not add an admin token to the signer or pretend omitted fields mean an empty list.

Create a dedicated organization-owned GitHub App, installed **only** on this registry repository, with repository **Administration: write**, **Contents: read**, and default **Metadata: read**. Administration write is needed for GitHub's bypass-actor visibility; it is powerful, not a read-only permission. Do not grant Contents/Pull requests/Secrets write. Protect the App identity and installation/private key as administrative credentials.

Put its public App ID in environment `production-governance` variable `GOVERNANCE_APP_ID`, and its App private key in that environment's secret `GOVERNANCE_APP_PRIVATE_KEY` using stdin. Do **not** copy your personal `gh auth` token into CI or use the TUF root key as an App key. The environment must be main-only.

Only the isolated audit job mints a short-lived, repository-scoped App installation token; the pinned official token action revokes it afterward. That job runs protected-main code with built-in Node modules only—no npm install or imported dependencies—and has no TUF signing keys. It checks real rules/CODEOWNERS/environment policies and emits a 15-minute receipt bound to source revision, workflow run/attempt, public root and current history.

Consumers download the audit artifact by the immutable ID output from that specific job, not a caller-selected artifact name. Read-only import/signing jobs verify receipt context/expiry and recheck main/history. The administrative App credential/token never enters their environments. This is a CI trust boundary, not an independent cryptographic quorum; compromise of the auditor remains an administrative risk.

App provisioning, private-key upload and real App-token inspection must be verified before signed activation. An empty protected audit environment is **not** proof this gate has passed.

## Current cryptographic scope

Initial tooling supports separate one-key-per-role signatures. It does **not** automate a multi-person root/targets threshold ceremony or trust-history migration across root rotation. Do not create several keys on one machine and advertise independent custody. A later rotation must be dual-signed, sequential, tested against an existing pinned client and paired with an audited history migration; never reset publication state as a shortcut.

Root validity is one year; online metadata expires sooner. Plan renewal well before expiry, not during an incident. Keep encrypted offline backups and independently retained public publication history. Never place private recovery material in `production-publication`, artifacts or issue comments.
