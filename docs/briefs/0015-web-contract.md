# Brief 0015-web-contract — Web API contract

Kind: feature
Slice: 15
Depends on: 12, 14
Module: src/web/shared

The plan agreed with the user in the planning session. `/implementing`'s `prd-writer` turns it into `docs/prd/0015-web-contract.md`. Use `GLOSSARY.md` terms in field names. Rules: `.claude/rules/web-shared.md`.

## Behaviour
- zod schemas (request + response), inferred types, route paths and error codes for every route below. Shapes follow the core step types from Slices 12 and 14.
- Visitor routes:
  - `GET /api/artists?name=` → Artist candidates (name, disambiguation, mbid); `autoPick` is not sent — the web always shows the list.
  - `GET /api/artists/:mbid/setlists?page=` → `{ artist, setlists: SetlistSummary[], hasMore }`.
  - `GET /api/setlist-links?url=` → `{ setlistId }` (the server reads the link; the client never parses it).
  - `GET /api/setlists/:id` → Show summary + `playlist: { status: "none" | "current" | "outdated", url? }`.
  - `GET /api/setlists/:id/preview` → Server-Sent Events: `progress { n, total }` (zero or more), then exactly one of `preview { show, incompleteStatus, rows, misses, notAdded, playlistName, versionId }` or `error { code, message, hint? }`.
  - `POST /api/setlists/:id/playlist` body `{ versionId }` → `{ url, status: "created" | "updated" }`.
- Admin routes: `GET /admin/login` (redirect), `GET /admin/callback` (redirect), `GET /api/admin/status` → `{ hostAccount: { connected }, config: { name, present }[], usage: { playlistsMade, opens, perDay[30], topArtists[] }, rateLimitHitsToday }`, `POST /api/admin/logout`.
- Error body `{ error: { code, message, hint? } }`; codes: `INVALID_INPUT`, `NOT_FOUND`, `RATE_LIMITED`, `UPSTREAM_UNAVAILABLE`, `PLAYLISTS_UNAVAILABLE`, `SETLIST_CHANGED`, `NOT_ADMIN`, `INTERNAL`.

## Edge cases
- `page` is a positive integer; `name` and `url` are trimmed, non-empty, length-limited; `:id` is setlist.fm's hex id; `:mbid` is a UUID; `versionId` is a non-empty string.
- Schemas reject unknown fields in request bodies.

## Non-goals
- No server or client code. No runtime logic beyond schemas and constants.

## Notes
- Shared-file requests: add `zod`; add ESLint (typescript-eslint, react-hooks, jsx-a11y) with an `npm run lint` script and config — the web rules require lint to be green.
- `src/web/shared` must not import Node-only modules (it ships to the browser).
