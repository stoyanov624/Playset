# Playset — Plan

Read by `/implementing` (and `node scripts/wave.mjs`) to choose the next Wave. Not loaded into every session; `CLAUDE.md` only points here.

## End goal

Before a concert, run `playset` with a setlist.fm link or an Artist name and get a private Spotify **Setlist Playlist** of the Artist's latest **Setlist**, in played order, with every **Miss** reported, ready to share.

Phase 2: a web front-end on the same core — direction in `docs/phases/web-ui.md`.

Phase 3: the web app is the only front-end (CLI removed, ADR 0003) and the Artist field suggests Artists while typing, with MusicBrainz as a typo fallback — direction in `docs/phases/artist-suggestions.md`.

## Slices

| # | Slice | Id | Depends on |
|---|-------|----|------------|
| 1 | Read the setlist id from a setlist.fm link | `0001-setlist-link` | — |
| 2 | Turn a Setlist into Performances (Tapes, snippets, Covers, Encores, repeats, medleys) | `0002-performances` | — |
| 3 | Find the Match for one Performance (Cover fallback, studio preference, strict verification) | `0003-matching` | — |
| 4 | Find the Latest Setlist by Artist name, with disambiguation | `0005-setlistfm` | 2 |
| 5 | Spotify login (PKCE) with a cached token | `0004-spotify-auth` | — |
| 6 | Create the Setlist Playlist (name, description, privacy, duplicate warning) | `0006-setlist-playlist` | 2, 3, 5 |
| 7 | CLI wiring (preview, prompts, flags, Misses, share link) | `0007-cli` | 1, 2, 3, 4, 5, 6 |
| 8 | Split medleys into Performances (' / ') | `0008-medley-split` | 2, 7 |
| 9 | Interactive shell: `playset` with no arguments opens its own prompt session | `0009-interactive-shell` | 7, 8 |
| 10 | '+' is part of a title, not a medley separator; match '+' like '&' | `0010-plus-as-and` | 3, 8 |
| 11 | Note Unknown Songs and Incomplete Setlists; offer an older complete one | `0011-incomplete-setlists` | 2, 4, 7, 8, 9, 10 |
| 12 | Split the run into stateless steps (Artist candidates, paged Setlist list, prepare, preview, create); CLI unchanged | `0012-run-steps` | — |
| 13 | Design lock for the web app (`docs/design.md`) | `0013-design-lock` | — |
| 14 | One Setlist Playlist per Setlist in the Host Account (`versionId`, update in place, Match cache) | `0014-host-playlists` | 12 |
| 15 | Web API contract (routes, zod schemas, SSE events, error codes) | `0015-web-contract` | 12, 14 |
| 16 | Visitor API server (search, Setlists, preview SSE, create/update, records, limits) | `0016-web-server` | 15 |
| 17 | Admin server (Spotify login as the Host Account, Host token, usage) | `0017-web-admin-server` | 16 |
| 18 | Visitor web app (search, Setlist list, preview, create, Terms) | `0018-web-client` | 13, 15 |
| 19 | Admin page | `0019-web-admin-client` | 13, 15, 18 |
| 20 | Remove the CLI and the core code only it uses; port web-relevant rule tests to the steps | `0020-remove-cli` | — |
| 21 | Suggest Artists in core: setlist.fm first, MusicBrainz typo fallback (client, throttle, Lucene query) | `0021-artist-suggestions-core` | 20 |
| 22 | Artist suggestions in the web contract (route, schemas, limits, MusicBrainz contact label) | `0022-artist-suggestions-contract` | 20 |
| 23 | Serve Artist suggestions (route, cache, per-IP limit, MusicBrainz contact config) | `0023-artist-suggestions-server` | 21, 22 |
| 24 | Artist suggestions while typing (combobox) and the "no Setlists on setlist.fm" state | `0024-artist-suggestions-client` | 22 |

## Waves (history)

- Phase 1: Wave 1 = Slices 1, 2, 3, 5 · Wave 2 = 4, 6 · Wave 3 = 7 · Wave 4 = 8 · Wave 5 = 9, 10 · Wave 6 = 11.
- Phase 2 (planned): Wave 1 = 12, 13 · Wave 2 = 14 · Wave 3 = 15 · Wave 4 = 16, 18 · Wave 5 = 17, 19.
- From now on Waves are computed by `node scripts/wave.mjs`, not written here.

## Rules for /implementing

- **Id** = `NNNN-slug`: the PRD number (next free, consecutive) and a short slug. It names the brief (`docs/briefs/Id.md`), the PRD (`docs/prd/Id.md`), the Worktree and the branch (`feat/Id`). A row without an Id is not planned yet and never runs.
- **Depends on** lists Slice numbers (`#`). Until a Slice has a PRD, this column is the truth; after that, the PRD's `Depends on:` wins — if they disagree, update this table in the same PR.
- A Slice is **built** when its PRD on `main` says `Status: Implemented` (a `design` Slice: `docs/design.md` says `Status: Approved`). Progress is derived from those files, so this table has no status column.
- The next Wave = every planned, unbuilt Slice whose dependencies are all built. Slices that change the same shared files should depend on each other so they don't run in parallel.
- New Slices (row + brief) are added in an interactive planning session, in a `chore` PR the user approves, before `/implementing` runs.
