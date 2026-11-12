# Production key custody and activation

The production identity is independent of all test/unit-fixture roots. Never promote a test private key or download a public root and adopt it opportunistically.

## Operator ceremony

1. Generate four separate production role keys in a private directory **outside Git**, using the existing operator CLI. Use a trusted machine; private directory 0700 and key files 0600.
2. Review the complete public `root.json` and record its SHA-256 fingerprint. Pin that independently reviewed public root into the app only after the production HTTPS deployment verifies.
3. Move the private root role into offline custody. Prepare an **encrypted recovery backup on separate offline storage**, record who holds it and how recovery is authorized, and test restoration on an isolated system. A local 0600 file, a second copy on the same disk, or encryption with the password stored alongside is not proof this step is complete.
4. Confirm custody/backup explicitly to the operator running the rollout. The automation agent must not claim this happened or set its confirmation variable on your behalf without that confirmation. Do not send private keys or backup passwords through chat.
5. Only then upload the three online role keys through stdin to environment `production-store-signing`. Never upload `root.pem`. Record the exact public-root fingerprint in the environment's `PRODUCTION_ROOT_CUSTODY_SHA256` variable; signing preflight binds confirmation to this particular public root.
6. Perform explicit first-publication bootstrap, verify with the real independently pinned-root client, and verify a normal +1 renewal with persisted client state. Monitor expiry and rehearse recovery.

The concrete local key handoff location/fingerprint is recorded in the rollout ledger, without printing secret contents. Losing the root/online keys or recovery material can prevent future renewal/rotation; compromise can authorize malicious releases. Restrict local and GitHub administrator access accordingly.

## Current cryptographic scope

Initial tooling supports separate one-key-per-role signatures. It does **not** automate a multi-person root/targets threshold ceremony or trust-history migration across root rotation. Do not create several keys on one machine and advertise independent custody. A later rotation must be dual-signed, sequential, tested against an existing pinned client and paired with an audited history migration; never reset publication state as a shortcut.

Root validity is one year; online metadata expires sooner. Plan renewal well before expiry, not during an incident. Keep encrypted offline backups and independently retained public publication history. Never place private recovery material in `production-publication`, artifacts or issue comments.
