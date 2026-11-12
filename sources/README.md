For each approved release, add `<reviewed-sha256>.json`:

```json
{
  "repository": "https://github.com/your-name/your-plugin",
  "tag": "v1.0.0",
  "asset": "plugin-1.0.0.mmxp",
  "commit": "FULL_40_CHARACTER_LOWERCASE_COMMIT_SHA"
}
```

The importer never runs source code or downloads `latest`. Hash and byte length are checked before quarantine. The source commit is a review/provenance claim, not a cryptographic proof of reproducible source-to-binary correspondence. Reviewers must inspect the pinned source and artifact. Changed upstream assets cannot change approved bytes; a mismatch blocks publication. After first import, retain the quarantined bytes as the authoritative publishing input (do not rely on GitHub for permanent availability).
