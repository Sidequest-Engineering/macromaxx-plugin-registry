# Maintainer review checklist

The release decision belongs to `@Sidequest-Engineering/registry-maintainers`. A familiar publisher or green CI is not sufficient evidence that a new package is safe.

## Publisher and provenance

- Verify control of the claimed publisher account/repository through an independently authenticated channel; do not trust the submitted JSON alone.
- Check that the full source SHA, release tag/version, asset name and package are the intended release.
- Review the source and dependency/lockfile changes, including build tooling and generated guest code.
- Rebuild independently and compare **exact bytes**, SHA-256, byte length and complete manifest. A source pin alone does not prove reproducibility.

## Runtime and compatibility

- Explain every permission. Reject shell/network/filesystem/native-runtime requests the standard runtime does not implement.
- Verify action/config schemas, quotas and actual supported app/platform claims.
- Exercise activation, actions, cancellation and settings in isolated state; never test an untrusted package in a real workspace or with credentials.
- Confirm no package installation hooks, path extraction, arbitrary UI or privileged code enter the signing environment.

## Registry and automation

- Existing identities/descriptors remain immutable. Prior releases remain; revocation is permanent.
- Source descriptors are exact, formatted and present. Already approved packages remain in authenticated history.
- Treat changes to CODEOWNERS, workflows, vendor snapshots, trust roots, CI tooling and rules as security-sensitive.
- Required checks must pass for the latest reviewable revision. Do not allow an untrusted PR to read signing secrets.
- Normal PRs require Codeowner review. EinCloudy's explicit PR-review exception is actor-based and visible in rule bypass audit; it does not bypass the separate PR/check rules. Do not describe a self-merge as an independent approving review.

If evidence is missing, request it. For a suspect approved release, use the revocation/incident runbook rather than replacing bytes or resetting signed history.
