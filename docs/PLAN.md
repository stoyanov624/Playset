# Playset — Plan

Read by `/featuring` to choose the next Wave. Not loaded into every session; `CLAUDE.md` only points here.

## End goal

Before a concert, run `playset` with a setlist.fm link or an Artist name and get a private Spotify **Setlist Playlist** of the Artist's latest **Setlist**, in played order, with every **Miss** reported, ready to share.

Later (not planned in Slices yet): a web or mobile front-end on the same core, with a small backend for the setlist.fm key.

## Slices

| # | Slice | Depends on |
|---|-------|------------|
| 1 | Read the setlist id from a setlist.fm link | — |
| 2 | Turn a Setlist into Performances (Tapes, snippets, Covers, Encores, repeats, medleys) | — |
| 3 | Find the Match for one Performance (Cover fallback, studio preference, strict verification) | — |
| 4 | Find the Latest Setlist by Artist name, with disambiguation | 2 |
| 5 | Spotify login (PKCE) with a cached token | — |
| 6 | Create the Setlist Playlist (name, description, privacy, duplicate warning) | 2, 3, 5 |
| 7 | CLI wiring (preview, prompts, flags, Misses, share link) | 1, 2, 3, 4, 5, 6 |
| 8 | Split medleys into Performances (' / ') | 2, 7 |
| 9 | Interactive shell: `playset` with no arguments opens its own prompt session | 7, 8 |
| 10 | '+' is part of a title, not a medley separator; match '+' like '&' | 3, 8 |
| 11 | Note Unknown Songs and Incomplete Setlists; offer an older complete one | 2, 4, 7, 8, 9, 10 |

## Waves (derived from the table)

- **Wave 1:** Slices 1, 2, 3, 5
- **Wave 2:** Slices 4, 6
- **Wave 3:** Slice 7
- **Wave 4:** Slice 8
- **Wave 5:** Slices 9, 10
- **Wave 6:** Slice 11

## Rules for /featuring

- A Slice's dependencies come from this table until its PRD exists; from then on the PRD's `Depends on:` line wins. If they disagree, update this table in the same PR.
- A Slice is **built** when its PRD is on `main` with status `Implemented`. Progress is derived from the PRDs, so this file has no status column to keep in sync.
- The next Wave = every unbuilt Slice whose dependencies are all built.
- New Slices are added here (with dependencies) by the orchestrator, in a `chore` PR approved by the user.
