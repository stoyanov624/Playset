# Brief 0020-remove-cli — Remove the CLI; the web app is the only front-end

Kind: feature
Slice: 20
Depends on: none
Module: src/cli (deleted), src/core/{run,setlistfm,spotify-auth,settings,setlist-playlist,setlist-link}, the matching `test/` folders; the two `createRunServices` call sites in src/web/server (`main.ts`, `test/web/server/fixtures/harness.ts`)

The plan agreed with the user in the planning session. `/implementing`'s `prd-writer` turns it into `docs/prd/0020-remove-cli.md`. Use `GLOSSARY.md` terms. Direction: `docs/phases/artist-suggestions.md`. Inventory of what goes: the CLI removal map (copied into the PRD's Notes; summary below).

## Problem
Playset carries two front-ends, but only the web app is used. The CLI keeps CLI-only rules alive in core (Tape questions, newest-complete offer, duplicate-name warning, loopback login, file settings, Latest Setlist search), each with its own tests, and every core change has to keep `runPlayset` working. Some rules the web relies on (Artist-name normalisation, medley and "+" rows in the preview) are tested **only** through CLI paths, so deleting carelessly would silently drop their coverage.

## Goal
The `playset` CLI and every piece of core used only by it are gone; every rule the web app uses is still tested, now through the stateless steps; web behaviour is unchanged.

## Behaviour
- Order inside the Slice (each step green before the next):
  1. **Port first.** Artist-name rule ("&", "+", "and" equal; other punctuation kept; auto-pick only on exactly one exact normalised match) — tests from `test/setlistfm/{find-artist,artist-plus-as-and,requests,api-key}.test.ts` re-expressed against `findArtistCandidates` / `findArtists`. Medley and "+" title rules on preview rows and the not-added list — from `test/run/{medley-preview,plus-in-titles}.test.ts` re-expressed against `prepareSetlist` / `previewMatches`. Ported tests cite the PRD 0020 ACs and keep the original examples.
  2. **Delete** `src/cli/`, `test/cli/`, and the CLI-only core: `runPlayset` and its types/guard, `findLatestSetlist`/`createSetlistPlaylist` step wrappers, run-services' `getAccessToken`/receivers/`findPlaylistsNamed`/`findLatestSetlistByArtistName`, spotify-auth `access-token`/`login`/`loopback-receiver`/`config` and their errors, the settings file store and env reading, setlistfm `findArtist(name, chooser)`/Latest Setlist/complete-alternative code and errors, `duplicate-check.ts`, `looksLikeSetlistFmLink`, and their tests (list in the map).
  3. **Narrow** `RunServices` to what the web uses (`getSetlist`, `findArtistCandidates`, `getSetlistPage`, `findMatch`, `createSetlistPlaylist`, `updateSetlistPlaylist`); `createRunServices` loses `env` and `startCallbackReceiver`; the server's two call sites follow.
  4. **Trim** shared test fixtures (`test/run/fixtures/*`, `test/spotify-auth/helpers.ts`, `test/setlistfm/helpers.ts`) and keep-and-trim tests (`run-services`, `steps-preview-create`, `host-version`, `pkce`, `run-steps-*` switch to the memory settings store).
- `src/core/index.ts` exports only what the web uses.
- After the Slice: `npm test`, `typecheck`, `lint` green; `npm run web` behaves exactly as before (manual run check: search, Setlist list, preview, create).

## Decisions already made
- Historical PRDs, briefs and PLAN rows stay untouched as history; their deleted tests are listed in the PR as "superseded by PRD 0020" (the user approves each).
- Keep the `SettingsStore` seam with only the memory adapter (the web passes the setlist.fm key through it); no settings refactor here.
- Keep `pkce.ts`, `stateless.ts`, `token-endpoint.ts`, `TokenError`, `RateLimitError`, `SpotifyAccountError` (admin login). `MissingSetlistFmApiKeyError` stays (the server maps it; its CLI wording never reaches a Visitor).
- Incomplete Setlist detection stays in `performances`; "Latest Setlist" leaves the product (the web lists Setlists).
- Keep `tsx` (runs the server). Drop `bin`, `dev`, the CLI half of `build`, `commander`, `@inquirer/prompts`, `vite.config.ts`'s `build:` block (keep `test:`).

## ADR 0003 (orchestrator writes `docs/adr/0003-web-only-front-end.md` in this Slice's branch)
"The web app is the only front-end": the CLI's prompts confused users and the web app covers the whole flow, so the CLI and its core-only code are deleted rather than kept in step. Consequences: per-user Spotify login and private playlists are gone (every Setlist Playlist is public in the Host Account, ADR 0002); core may assume the web's choices (Tapes always left out, no Latest Setlist); ADR 0001's "`runPlayset` is rebuilt on the steps" and ADR 0002's "The CLI keeps per-user login" are superseded. Considered: keeping the CLI as a thin client of the web API (rejected: nobody uses it, still a second front-end to keep working).

## Shared files the orchestrator updates (in this Slice's branch)
- `package.json` + regenerated lockfile, `vite.config.ts` (as above).
- `CLAUDE.md`: intro, Commands (`build`, `dev`), Architecture (`run`, `settings`, `spotify-auth` bullets, "Still Node-only", `src/cli/` bullet), Product rules (drop Input/Latest Setlist, Tape question, incomplete offer, confirm + duplicate warning, new private playlist per run, "CLI only", "CLI secrets"), Workflow (`src/cli/` ownership).
- `GLOSSARY.md`: Setlist Playlist (drop "the CLI makes a new one on every run"), Tape ("never added"), remove Latest Setlist.
- `README.md` (CLI bullet, CLI redirect URI, `## CLI`, build row); `docs/adr/0001` and `0002` (one "superseded in part by ADR 0003" line each); `docs/phases/web-ui.md` lines naming the CLI; `.claude/rules/web-server.md:25`; `.claude/agents/implementer.md`; `.claude/skills/implementing/SKILL.md` (`cli` domain lines).
- Code comment `src/web/server/catalogue.ts:2` ("written for the CLI") is the Slice's own edit.

## Risks
- **Lost coverage**: a rule tested only via the CLI disappears. Mitigation: port first, and the coverage check compares the rule list (Artist name, medley, "+", Unknown Songs, Incomplete) before/after.
- **Fixture ripple**: web server tests import `test/run/fixtures/*` and the harness passes `env: {}` + `startCallbackReceiver`; trimming breaks them. Run the full `node` and `client` projects after each step.
- **Hidden importers**: `test/run/steps-run-unchanged.test.ts` imports `src/cli/main.js` (drop that describe, keep the findArtists/listSetlists one); grep `src/cli`, `runPlayset`, `findLatestSetlist`, `processEnv` until empty.
- **Process docs drift**: skills/agents still naming a `cli` domain would send later Slices to a dead module.
- **Test edits**: many deletions and some trims — every changed or removed existing test is listed in the PR for the user's approval.
- **Lockfile**: regenerate, don't hand-edit; oxlint stays pinned.

## Non-goals
- No change to web behaviour, the contract or the server's routes. No settings refactor. No rewrite of historical PRDs.

## Open questions for the PRD writer
- Does `MissingSetlistFmApiKeyError`'s message get web wording now, or stay (never shown)? Recommend: leave it.

## Acceptance hints
- `src/cli/` and `test/cli/` absent; no `bin`; `commander`/`@inquirer/prompts` absent from `package.json`.
- Ported tests exist for each rule above and pass against the steps.
- `grep -r "src/cli\|runPlayset\|findLatestSetlist\|startCallbackReceiver" src test` finds nothing.
- `createRunServices` type accepts no `env`/`startCallbackReceiver`; server tests and manual run check unchanged.
