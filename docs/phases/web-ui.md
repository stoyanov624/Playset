# Phase 2 — Web UI

Status: direction agreed (2026-11-27), not yet planned into Slices in `docs/PLAN.md`.
Read this when planning or building the web UI; it is not needed for other work.
Decisions with lasting weight: `docs/adr/0001-run-split-into-steps.md`, `docs/adr/0002-host-account.md`.

## Why

The CLI's prompts and flags confuse users and make mistakes easy; the web UI should guide them. The CLI stays as it is.

## Shape

- Runs locally now (`npm run web`, `http://127.0.0.1:3000`, port via `PLAYSET_WEB_PORT`); public hosting later, single instance. Operating the web app needs no terminal steps — everything after starting the server happens in the web.
- One package: Express backend (`src/web/server/`), React SPA built by Vite (`src/web/client/`). Mobile-first, works on desktop. English only.
- Core split into stateless steps (ADR 0001), done first as a `refactor/` branch: existing tests stay green and unchanged, CLI behaviour identical.
- Config in env / `.env`, never entered in the web: `SETLISTFM_API_KEY`, `SPOTIFY_CLIENT_ID`, `PLAYSET_HOST_SPOTIFY_ID`, cookie secret, rate-limit numbers. One shared setlist.fm throttle (≤2 req/s) and one shared Spotify throttle for all visitors.

## Host Account (ADR 0002)

- Visitors never log in. Every Setlist Playlist is created **public** in the Host Account; same name and description as the CLI.
- One Setlist Playlist per Setlist (setlist.fm id). Tapes are always left out in the web (no Tape question). If the Setlist changed since (setlist.fm version), a visitor sees a fresh preview and presses **Update playlist** — same playlist, items replaced. A recorded playlist deleted in Spotify is made again.
- Record in SQLite: Setlist id → playlist id, Setlist version, created-at, open count. Matches cached per Setlist version. One create/update at a time per Setlist; a concurrent visitor gets the same link.
- Guards: Create/Update limited per IP (default 10/hour) and globally per day (default 200), configurable; opening existing playlists is unlimited.
- Host Account not connected (first start, token revoked): visitors can still search, list Setlists and open recorded playlists; preview/create shows "temporarily unavailable".

## Visitor flow

1. **Artist** input + Search button (Enter too) → setlist.fm Artist search (`sort=relevance`; verified tolerant of one typo, aliases like "rhcp", accents, "and" vs "N'") → candidates (name + disambiguation) → pick. No result → "No Artist found — check spelling". No search-as-you-type.
2. Separate **setlist.fm link** input + Open button → straight to that Setlist.
3. Setlist list: newest first, 20 per page with Load more; date, venue, city, song count, Incomplete marker; empty placeholder Setlists hidden. No "use the newest complete one?" offer.
4. Setlist chosen: if its Setlist Playlist exists and is current → link at once. Otherwise preview (progress streamed over SSE): Show line, Incomplete warning, Performance → Match / Miss, Misses, Unknown Songs and snippets noted, Tapes listed as left out → **Create** → link.
5. Footer: setlist.fm attribution, "playlists are created in Playset's Spotify account and are public", Terms/Privacy page (no visitor data kept; IP used only for rate limits).

## Admin (`/admin`)

- Login = "Log in with Spotify"; accepted only if `/me` id equals `PLAYSET_HOST_SPOTIFY_ID`. Success stores the Host token server-side (server refreshes it) and sets an httpOnly signed admin cookie (12 h). No password (can be a later Slice).
- Shows: Host Account status + Reconnect, usage (playlists made, opens, per day for 30 days, top Artists), rate-limit hits today, config present (✅, never values). No settings editing.
- The Spotify app needs the redirect URI `http://127.0.0.1:3000/admin/callback` (and the public one later).

## Tests

Server routes: supertest with fake core services. React: Testing Library in Vitest (jsdom). No network, no browser e2e in Slices; a manual run check per Slice.

## Spotify facts (researched 2026-11, don't re-research)

- Dev Mode: 5 allowlisted accounts per Client ID (since Feb/Mar 2026), by name + email in Dashboard → Users Management; non-listed users get 403. Logging out does not free a slot.
- Private playlists are unreachable by others even with the link; the Web API cannot make invite links → Host Account playlists must be public.
- An account holds ~10–11k playlists (docs: "generally limited to 11000"; may count deleted ones).
- Dev Mode rate limit is lower than extended quota, number unpublished; 429 + `Retry-After`.
- Client Credentials needs the client secret and may be phased out for metadata — not used.
- Pasting track links into a Spotify playlist is undocumented and unreliable (URIs in the desktop app sometimes work) — not used.
- Developer Terms: non-commercial only; an end-user agreement must be shown; the Host Account pattern is neither allowed nor forbidden (accepted risk, ADR 0002).
