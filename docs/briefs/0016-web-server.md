# Brief 0016-web-server — Visitor API server

Kind: feature
Slice: 16
Depends on: 15
Module: src/web/server

The plan agreed with the user in the planning session. `/implementing`'s `prd-writer` turns it into `docs/prd/0016-web-server.md`. Rules: `.claude/rules/web-server.md`; contract: `src/web/shared` (Slice 15); ADR 0001, ADR 0002, `docs/phases/web-ui.md`.

## Behaviour
- `createApp(deps)` serves the visitor routes of the contract and the built client (SPA fallback); the entry file reads config (zod) and listens on `127.0.0.1:${PLAYSET_WEB_PORT ?? 3000}`.
- Routes call one core step each (Slices 12, 14); Tapes are always left out; no domain rules in the server.
- `GET /api/setlists/:id` returning a current link records an **open**.
- Preview over SSE: progress events, then the preview or an error event; a closed connection aborts matching. Identical previews running at once (same Setlist id + `versionId`) share one run. A cached preview (same version) is free; an uncached one counts against a per-IP preview limit (default 30/hour, `PLAYSET_PREVIEW_LIMIT`).
- Create/Update: per-IP limit (default 10/hour) and global daily limit (default 200), configurable; one create/update at a time per Setlist — a concurrent request waits and gets the same link.
- Records in SQLite (`better-sqlite3`, file `PLAYSET_WEB_DATA`, default `./data/playset.db`): Setlist playlist records, cached Previews per version, and an `events` table (kind created/updated/opened, Setlist id, Artist name, day; no IP). Global daily count reads `events`; per-IP counters live in memory (IPs never stored). Rate-limit hits today are counted in memory.
- Host Account not connected (no Host token, or refresh fails) → preview and create answer `PLAYLISTS_UNAVAILABLE`; search, Setlist list and opening recorded links still work. The Host token comes from an injected `HostTokenSource`; until Slice 17 fills it, the entry file wires one that reports "not connected" (so this Slice's manual run check covers search, Setlist list and `PLAYLISTS_UNAVAILABLE`; tests use a fake source that is connected).
- Errors map core errors to the catalogue with visitor wording; `SetlistChangedError` → `SETLIST_CHANGED`; 429 carries `Retry-After`.
- Scripts: `npm run web` (build client + start server), `npm run web:dev` (Vite dev server proxying `/api` and `/admin` to the server).

## Edge cases
- setlist.fm 404 for a Setlist or Artist → `NOT_FOUND`; setlist.fm/Spotify 5xx or timeout → `UPSTREAM_UNAVAILABLE`; upstream 429 → `RATE_LIMITED` with `Retry-After`.
- Link that isn't a setlist.fm Setlist link → `INVALID_INPUT` with a hint.
- Limits exceeded → `RATE_LIMITED`, `Retry-After` until the window frees; opening links never limited.
- Missing config at startup → a clear log line and exit.

## Non-goals
- No `/admin` login, Host token refresh or usage page (Slice 17). No public hosting/HTTPS setup.

## Notes
- Shared-file requests: express 5, helmet, better-sqlite3, supertest, `web`/`web:dev` scripts, Vite config for the client build.
- Config (env / `.env`): `SETLISTFM_API_KEY`, `SPOTIFY_CLIENT_ID`, `PLAYSET_HOST_SPOTIFY_ID`, cookie secret, `PLAYSET_WEB_PORT`, `PLAYSET_WEB_DATA`, limit numbers. Shared throttles: one setlist.fm (≤2 req/s) and one Spotify for all visitors.
