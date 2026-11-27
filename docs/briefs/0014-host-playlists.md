# Brief 0014-host-playlists — One Setlist Playlist per Setlist in the Host Account

Kind: feature
Slice: 14
Depends on: 12
Module: src/core/setlist-playlist (also src/core/performances and src/core/setlistfm for `versionId`)

The plan agreed with the user in the planning session. `/implementing`'s `prd-writer` turns it into `docs/prd/0014-host-playlists.md`. Use `GLOSSARY.md` terms. Decisions: ADR 0002, `docs/phases/web-ui.md`.

## Before the PRD (mandatory live check)
The orchestrator logs in as the Host Account with a fresh token and checks on a throwaway playlist: (1) `PUT /v1/playlists/{id}/items` replaces all items; (2) `PUT /v1/playlists/{id}` renames; (3) which scope `GET /v1/me/library/contains?uris=spotify:playlist:{id}` needs and that it returns false after the playlist is deleted (unfollowed); (4) whether adding items to an unfollowed playlist works and brings it back. Results go into `CLAUDE.md` "External API facts" and into this Slice's PRD.

## Behaviour
- A Setlist carries its setlist.fm `versionId` (opaque string; same `id` across edits, new `versionId` per edit). `SetlistSummary` and the prepared Setlist carry it too.
- Core step `findSetlistPlaylist(setlistId, versionId, { records })` → `none` | `current` (with link) | `outdated` (with link): `current` when the record's `versionId` equals the Setlist's.
- Core step `createOrUpdateSetlistPlaylist(...)` for the Host Account (always public, Tapes always left out, same name and description as the CLI):
  - no record → create, record Setlist id → playlist id, `versionId`, created-at;
  - record exists → if the Host Account no longer holds the playlist (deleted), create a new one and replace the record; otherwise replace all items and set the name and description again (date, venue or city may have changed), then store the new `versionId`.
- The deleted check runs only at create/update, never when a visitor opens an existing link (an unfollowed public playlist still opens).
- `SetlistPlaylistRecords` (interface in core, adapters in the server) holds: the record per Setlist, and the cached Preview (rows + Misses) per Setlist id + `versionId`. `previewMatches` reuses a cached Preview for the same version; create/update uses the cached Matches instead of searching again.
- Create/update with a `versionId` that differs from the Setlist's current one → a `SetlistChangedError` (the visitor must see a fresh preview).

## Edge cases
- More than 100 Matches: first 100 with `PUT …/items`, the rest with `POST …/items` in batches of ≤100.
- All Misses / no Performances → the existing outcomes; nothing created.
- Record exists, `versionId` unchanged, playlist deleted → create again only when a create is asked for; opening still returns the recorded link.
- Partly failed update → a `PlaysetError` with a hint; the record keeps the old `versionId` so the next visitor sees Update again.

## Non-goals
- No SQLite, HTTP, locks or rate limits (server Slices). The CLI keeps a new private playlist per run and its duplicate warning.
- No `GET /setlist/version/{versionId}` (docs call it deprecated).

## Notes
- Facts (setlist.fm, verified by call 2026-11-27): every setlist has `versionId` and `lastUpdated`, the same in the list and in `GET /setlist/{id}`; no `ETag`. Fixtures were trimmed — add `versionId` to the fixtures this Slice needs (shared Fixture A stays valid).
- Facts (Spotify, from docs, Feb 2026 changes; confirm in the live check): `PUT /v1/playlists/{id}/items` body `{ uris }` ≤100 replaces; `PUT /v1/playlists/{id}` changes name/description; `GET/PUT …/followers` were removed — use `GET /v1/me/library/contains` (≤40 URIs, booleans) and `PUT /v1/me/library`. Scopes may be `user-library-read`/`-modify` beyond `playlist-modify-public`.
- Shared-file request: export the new steps, `SetlistPlaylistRecords`, `SetlistChangedError` from `src/core/index.ts`; scopes for the Host login are named here and used by Slice 17.
