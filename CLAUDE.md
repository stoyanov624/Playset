# Setlist2Playlist

CLI (`s2p`) that turns a setlist.fm Setlist into a Spotify Setlist Playlist. Domain vocabulary lives in `GLOSSARY.md` — use those terms everywhere (code, tests, PRDs, commits).

## Commands
- `npm test` — Vitest (no network; fixtures only)
- `npm run typecheck` — tsc
- `npm run build` — Vite bundles `src/cli/index.ts` → `dist/cli.js`
- `npm run dev -- <args>` — run CLI via tsx

## Architecture
- `src/core/` — all domain logic. No terminal/CLI imports. Interactive needs (choose Artist, opt into each Tape, confirm, progress) are requested from the caller through injected interfaces. setlist.fm and Spotify sit behind interfaces so tests can fake them.
- `src/cli/` — thin front-end over core. A future web/mobile front-end will reuse core.
- `test/` — tests (`*.test.ts`) and `test/fixtures/`.
- Future web/mobile app: the setlist.fm API key must stay server-side → needs a small backend proxy. Spotify auth (PKCE) can be client-side. Not built yet.

## Product rules (agreed)
- Input: setlist.fm URL (id = trailing hex before `.html`) or Artist name → Latest Setlist (skip empty placeholders). Ambiguous Artist name → ask user to pick.
- Every Performance in played order, Encores included; a song played twice appears twice.
- Tapes: list by name, ask per Tape; `--tapes` / `--no-tapes` skip prompting. Snippets/teasers excluded. Guest ("with") ignored. Medleys split best-effort.
- Match: strict normalised artist + title; prefer studio, live only as fallback. Cover → Artist's version first, then Original Artist. Otherwise Miss; list Misses at end.
- Preview Performance → Match before creating; confirm (skip with `--yes`). Warn if a playlist with the same name exists.
- New playlist per run, named `Artist – YYYY-MM-DD – City`, private by default (`--public` flag), description includes the setlist.fm URL (attribution required). Always print the share link.
- Secrets: env vars first (`SETLISTFM_API_KEY`, `SPOTIFY_CLIENT_ID`), then `~/.config/setlist2playlist/`. Spotify auth = Authorization Code + PKCE, redirect `http://127.0.0.1:<port>/callback` (not `localhost`), refresh token cached in the config dir. No client secret.

## External API notes
- setlist.fm: header `x-api-key`, `Accept: application/json`; non-commercial; throttle (~2 req/s), handle 429.
- Spotify (Development Mode, 2026): owner needs Premium; max 5 users; search `limit` ≤ 10; create playlist via `POST /v1/me/playlists`; add via `POST /v1/playlists/{id}/items` (≤100 URIs). Old `/tracks` and `/users/{id}/playlists` endpoints are gone. Honour `Retry-After` on 429.

## Workflow (mandatory)
Features are built with `/feature` (`.claude/skills/feature/SKILL.md`):
plan → `prd-writer` → **user approves PRD** → `test-writer` (red, never reads `src/`) → coverage check → `implementer` (green, never edits `test/`) → PR → **user approves merge**.
- Every feature branches from `main` as `feat/NNNN-slug` and returns via PR only after user approval. Never merge without it.
- PRDs: `docs/prd/NNNN-slug.md` from `docs/prd/TEMPLATE.md`. Test names cite ACs (`AC-n: …`).

## Build order
1. Parse a setlist.fm URL → setlist id
2. Setlist → Performances (Tapes, snippets, Covers, Encores, repeats, medleys)
3. Match one Performance (Cover fallback, studio preference, strict verification)
4. Latest Setlist by Artist name (+ disambiguation)
5. Spotify PKCE auth + token cache
6. Create Setlist Playlist (name, description, privacy, duplicate warning)
7. CLI wiring (preview, prompts, flags, Misses, share link)
