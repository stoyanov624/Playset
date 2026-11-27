# Playset — Plan

Read by `/implementing` (and `node scripts/wave.mjs`) to choose the next Wave. Not loaded into every session; `CLAUDE.md` only points here.

## End goal

Before a concert, run `playset` with a setlist.fm link or an Artist name and get a private Spotify **Setlist Playlist** of the Artist's latest **Setlist**, in played order, with every **Miss** reported, ready to share.

Phase 2: a web front-end on the same core — direction in `docs/phases/web-ui.md`.

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

## Waves (history)

- Phase 1: Wave 1 = Slices 1, 2, 3, 5 · Wave 2 = 4, 6 · Wave 3 = 7 · Wave 4 = 8 · Wave 5 = 9, 10 · Wave 6 = 11.
- From now on Waves are computed by `node scripts/wave.mjs`, not written here.

## Rules for /implementing

- **Id** = `NNNN-slug`: the PRD number (next free, consecutive) and a short slug. It names the brief (`docs/briefs/Id.md`), the PRD (`docs/prd/Id.md`), the Worktree and the branch (`feat/Id`). A row without an Id is not planned yet and never runs.
- **Depends on** lists Slice numbers (`#`). Until a Slice has a PRD, this column is the truth; after that, the PRD's `Depends on:` wins — if they disagree, update this table in the same PR.
- A Slice is **built** when its PRD on `main` says `Status: Implemented` (a `design` Slice: `docs/design.md` says `Status: Approved`). Progress is derived from those files, so this table has no status column.
- The next Wave = every planned, unbuilt Slice whose dependencies are all built. Slices that change the same shared files should depend on each other so they don't run in parallel.
- New Slices (row + brief) are added in an interactive planning session, in a `chore` PR the user approves, before `/implementing` runs.
