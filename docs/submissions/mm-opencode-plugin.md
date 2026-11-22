# OpenCode Sessions for MacroMaxx

MacroMaxx 0.2.x can supervise a temporary deck view and provide a read-only snapshot of local OpenCode V2 sessions. The plugin controls only a declarative view on LCD keys, and has no guest network, filesystem, or shell access.

| Permission | Why it is needed |
| --- | --- |
| `deck:write` | Open and draw the temporary dashboard. MacroMaxx controls Back and restores the underlying profile. |
| `opencode:sessions:read` | Show session titles, live states and whether a question or permission is waiting. There is no way to reply from the deck. |

The source repository uses the versioned SDK snapshot and a lockfile. To reproduce the proposed asset, run `npm ci --ignore-scripts`, `npm run typecheck`, `npm test` and `npm run build` from the pinned source revision, then verify the SHA-256 against the release descriptor.

This release belongs in `catalog-v2.json`. The signed `catalog.json` still serves legacy clients and omits packages whose permissions they cannot decode. CI uses disposable keys and checks both catalogs; the production signing and maintainer review process does not change.
