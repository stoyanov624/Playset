# Phase 2 — Web UI

Status: planned (2026-11-27) as Slices 12–19 in `docs/PLAN.md`; briefs in `docs/briefs/0012`–`0019`.
Read this when planning or building the web UI; it is not needed for other work.
Decisions with lasting weight: `docs/adr/0001-run-split-into-steps.md`, `docs/adr/0002-host-account.md`.

## Why

The CLI's prompts and flags confuse users and make mistakes easy; the web UI should guide them. The CLI stays as it is.

## Shape

- Runs locally now (`npm run web`, `http://127.0.0.1:3000`, port via `PLAYSET_WEB_PORT`); public hosting later, single instance. Operating the web app needs no terminal steps — everything after starting the server happens in the web.
- One package: Express backend (`src/web/server/`), React SPA built by Vite (`src/web/client/`). Mobile-first, works on desktop. English only.
- Core split into stateless steps (ADR 0001), done first as Slice `0012-run-steps` (a Slice with a PRD, so `wave.mjs` can see it built): existing tests stay green and unchanged, CLI behaviour identical.
- Config in env / `.env`, never entered in the web: `SETLISTFM_API_KEY`, `SPOTIFY_CLIENT_ID`, `PLAYSET_HOST_SPOTIFY_ID`, cookie secret, rate-limit numbers. One shared setlist.fm throttle (≤2 req/s) and one shared Spotify throttle for all visitors.

## Host Account (ADR 0002)

- Visitors never log in. Every Setlist Playlist is created **public** in the Host Account; same name and description as the CLI.
- One Setlist Playlist per Setlist (setlist.fm id). Tapes are always left out in the web (no Tape question). If the Setlist changed since (setlist.fm version), a visitor sees a fresh preview and presses **Update playlist** — same playlist, items replaced. A recorded playlist deleted in Spotify is made again.
- Record in SQLite (`PLAYSET_WEB_DATA`, default `./data/playset.db`): Setlist id → playlist id, setlist.fm `versionId`, created-at; an `events` table (created / updated / opened, Setlist id, Artist name, day — no IP) for usage and the daily limit; the Host token. Previews (Matches) cached per Setlist id + `versionId`; Create/Update uses the cached Matches and answers `SETLIST_CHANGED` when the `versionId` moved since the preview. One create/update at a time per Setlist; a concurrent visitor gets the same link.
- The "one per Setlist" rule (link / Update / make again) lives in core behind an injected `SetlistPlaylistRecords`; the server only supplies the adapters, locks and limits.
- Update replaces all items and sets the name and description again. Whether the Host Account still holds a recorded playlist is checked only at Create/Update, never on open (an unfollowed public playlist still opens).
- Guards: Create/Update limited per IP (default 10/hour) and globally per day (default 200), configurable; an uncached preview limited per IP (default 30/hour, `PLAYSET_PREVIEW_LIMIT`), identical concurrent previews share one run; opening existing playlists is unlimited. Per-IP counters in memory only.
- Host Account not connected (first start, token revoked): visitors can still search, list Setlists and open recorded playlists; preview/create shows "temporarily unavailable".

## Visitor flow

1. **Artist** input + Search button (Enter too) → setlist.fm Artist search (`sort=relevance`; verified tolerant of one typo, aliases like "rhcp", accents, "and" vs "N'") → candidates (name + disambiguation) → pick. The list is always shown, even for one exact match (no auto-pick in the web). No result → "No Artist found — check spelling". No search-as-you-type.
2. Separate **setlist.fm link** input + Open button → straight to that Setlist.
3. Setlist list: newest first, one setlist.fm page (fixed 20) per Load more; date, venue, city, song count, Incomplete marker; empty placeholder Setlists hidden. No "use the newest complete one?" offer.
4. Setlist chosen: if its Setlist Playlist exists and is current → link at once. Otherwise preview (progress streamed over SSE): Show line, Incomplete warning, Performance → Match / Miss, Misses, Unknown Songs and snippets noted, Tapes listed as left out → **Create** → link.
5. Footer: setlist.fm attribution, "playlists are created in Playset's Spotify account and are public", Terms/Privacy page (no visitor data kept; IP used only for rate limits).

## Admin (`/admin`)

- Login = "Log in with Spotify"; accepted only if `/me` id equals `PLAYSET_HOST_SPOTIFY_ID`. Success stores the Host token server-side (server refreshes it) and sets an httpOnly signed admin cookie (12 h). No password (can be a later Slice).
- Shows: Host Account status + Reconnect, usage (playlists made, opens, per day for 30 days, top Artists), rate-limit hits today, config present (✅, never values). No settings editing.
- The Spotify app needs the redirect URI `http://127.0.0.1:3000/admin/callback` (and the public one later).

## Tests

Server routes: supertest with fake core services. React: Testing Library in Vitest (jsdom). No network, no browser e2e in Slices; a manual run check per Slice.

## setlist.fm facts (verified by call 2026-11-27)

- Every setlist has `versionId` (opaque, e.g. `g23bc445b`) and `lastUpdated`; an edit keeps the `id` and changes `versionId` (docs). The list and `GET /setlist/{id}` return the same `versionId`. No `ETag`/`Last-Modified`. `GET /setlist/version/{id}` is documented as deprecated — not used.
- `/artist/{mbid}/setlists` pages are fixed at 20 (`itemsPerPage`, `total`); no page-size parameter. A 429 can come even under 2 req/s — honour `Retry-After`.

## Spotify facts (researched 2026-11, don't re-research)

- Dev Mode: 5 allowlisted accounts per Client ID (since Feb/Mar 2026), by name + email in Dashboard → Users Management; non-listed users get 403. Logging out does not free a slot.
- Private playlists are unreachable by others even with the link; the Web API cannot make invite links → Host Account playlists must be public.
- An account holds ~10–11k playlists (docs: "generally limited to 11000"; may count deleted ones).
- Dev Mode rate limit is lower than extended quota, number unpublished; 429 + `Retry-After`.
- Client Credentials needs the client secret and may be phased out for metadata — not used.
- Pasting track links into a Spotify playlist is undocumented and unreliable (URIs in the desktop app sometimes work) — not used.
- Developer Terms: non-commercial only; an end-user agreement must be shown; the Host Account pattern is neither allowed nor forbidden (accepted risk, ADR 0002).
- From docs, Feb 2026 changes (to be confirmed by Slice 14's live check): `PUT /v1/playlists/{id}/items` `{ uris }` (≤100) replaces all items; `PUT /v1/playlists/{id}` changes name/description; `GET/PUT/DELETE /playlists/{id}/followers` were removed — "is it still in the Host Account" is `GET /v1/me/library/contains?uris=spotify:playlist:{id}` (≤40, booleans), following again is `PUT /v1/me/library`; these may need `user-library-read`/`-modify` scopes. Deleting a playlist = unfollowing; `GET /v1/playlists/{id}` still answers and has no deleted flag.
