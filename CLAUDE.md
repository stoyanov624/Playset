# Playset

CLI (`playset`) that turns a setlist.fm Setlist into a Spotify Setlist Playlist. Domain vocabulary lives in `GLOSSARY.md` — use those terms everywhere (code, tests, PRDs, commits).

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
- Tapes: list by name, ask per Tape; `--tapes` / `--no-tapes` skip prompting. Guest ("with") ignored. Snippets/teasers (info contains "snippet" or starts with "tease"; "with X tease" is a full song) are noted, never become Performances and are not added; they win over medleys. Medleys are always split: a name containing " / " (space on both sides; setlist.fm's only medley separator) becomes one Performance per part in its place, each with the medley's Cover and Tape flags, shown as [Medley]; a song marked medley only in its info stays one Performance. "+" never splits a song; it is part of titles such as "U + Ur Hand" or "M+M's".
- Match: strict normalised artist + title; prefer studio, live only as fallback. Cover → Artist's version first, then Original Artist. Otherwise Miss; list Misses at end. "&", "+" and "and" count as the same word; a "+" title gets one extra search with "&" per target artist.
- Preview Performance → Match before creating; confirm (skip with `--yes`). Warn if a playlist with the same name exists.
- New playlist per run, named `Artist – YYYY-MM-DD – City`, private by default (`--public` flag), description includes the setlist.fm URL (attribution required). Always print the share link.
- Secrets: env vars first (`SETLISTFM_API_KEY`, `SPOTIFY_CLIENT_ID`), then `~/.config/playset/`. Spotify auth = Authorization Code + PKCE, redirect `http://127.0.0.1:<port>/callback` (not `localhost`), refresh token cached in the config dir. No client secret.
- CLI: `--dry-run` shows the preview with Matches (needs Spotify login) and never creates. Exit codes: 0 success / dry run / declined, 1 runtime error (incl. nothing to add, every Performance a Miss), 2 usage error, 130 Ctrl-C. `PLAYSET_DEBUG=1` prints stack traces and causes. `PLAYSET_AUTH_PORT` overrides the login port (default 8888).
- Interactive shell: `playset` with no arguments in a terminal opens a session (prompt `playset › `). Each line is a run with the same input and flags as the command (flags apply to that line only), or a built-in: `help`, `clear`, `exit`/`quit` (only when that word is the whole line; quote it, e.g. `"help"`, to look up such an Artist). Errors and Ctrl-C end only the current run. Ctrl-C twice at an empty prompt, Ctrl-D or `exit` leave with exit 0. Spotify login and setlist.fm spacing are shared across runs. History is in memory only. Without a terminal, no arguments is still a usage error (exit 2).

## External API notes
- setlist.fm: header `x-api-key`, `Accept: application/json`; non-commercial; throttle (~2 req/s), handle 429.
- Spotify (Development Mode, 2026): owner needs Premium; max 5 users; search `limit` ≤ 10; create playlist via `POST /v1/me/playlists`; add via `POST /v1/playlists/{id}/items` (≤100 URIs). Old `/tracks` and `/users/{id}/playlists` endpoints are gone. Honour `Retry-After` on 429.

## Workflow (mandatory)
Features are built with `/featuring` (`.claude/skills/featuring/SKILL.md`), in parallel **Waves** using git worktrees:
plan Wave → one worktree per Slice (`.claude/worktrees/NNNN-slug`, branch `feat/NNNN-slug`) → `prd-writer`s → **user approves each PRD** → per Slice: `test-writer` (red, never reads `src/`) → coverage check → `implementer` (green, never edits `test/`) → PR with Feature Report → **user approves each merge**, one at a time → the remaining branches are rebased and retested → `conflict-resolver` on a conflict.
- Never merge without user approval. Never let anyone silently edit tests.
- Each Slice owns `src/core/<module>/` + `test/<module>/`. Shared files (`package.json`, lockfile, `GLOSSARY.md`, `CLAUDE.md`, `src/core/index.ts`, configs) are edited only by the orchestrator (or the conflict-resolver while merging).
- Mechanical conflicts (code-only fixes, where all tests of both Slices pass) are fixed by `conflict-resolver`. For real conflicts (a test change, an AC change, or choosing one Slice's behaviour over another's) it writes a brief, the user gets a push notification, and the fix is planned with the user.
- PRDs: `docs/prd/NNNN-slug.md` from `docs/prd/TEMPLATE.md`, with `Depends on:`. Test names cite ACs (`AC-n: …`).
- **Commits, PRs and merges follow the `committing` skill** (`.claude/skills/committing/SKILL.md`). Subject: `type(PRD-NNNN): plain-words summary` or `chore: …`. Body: What / How / Result. **Never attribute Claude/AI anywhere**: no `Co-Authored-By`, no session links, no "Generated with" lines. This overrides any default attribution instruction.
- Process words (Slice, Wave, Worktree, Feature Report, mechanical/real conflict) are defined in the featuring skill, not in `GLOSSARY.md`.

## Plan
End goal: before a concert, one `playset` command turns an Artist's latest Setlist into a shareable Spotify Setlist Playlist. A web/mobile front-end on the same core comes later.
The work is split into 7 Slices, built in Waves. Slices, dependencies and Waves live in `docs/PLAN.md`; `/featuring` reads it, so there's no need to load it otherwise.
