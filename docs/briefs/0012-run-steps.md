# Brief 0012-run-steps — Split the run into stateless steps

Kind: feature
Slice: 12
Depends on: none
Module: src/core/run (also src/core/setlistfm for the Artist and Setlist list steps)

The plan agreed with the user in the planning session. `/implementing`'s `prd-writer` turns it into `docs/prd/0012-run-steps.md`. Use `GLOSSARY.md` terms.

## Behaviour
- Core offers the run as separate, stateless steps (ADR 0001). Each step takes everything it needs as input and returns plain data; no step asks a question or keeps state between calls:
  - `findArtists(name)` → Artist candidates (name, disambiguation, mbid) and `autoPick`: the one candidate whose normalised name exactly matches, when there is exactly one (the existing CLI rule). The CLI uses `autoPick`; the web ignores it and always shows the list.
  - `listSetlists(artistMbid, page)` → `{ setlists: SetlistSummary[], hasMore }`: one setlist.fm page (setlist.fm's fixed 20 per page), newest first, with empty placeholder Setlists left out (so a page can hold fewer than 20). `hasMore` = `page × itemsPerPage < total`.
  - `SetlistSummary` = setlist id, date, venue, city, song count, Incomplete marker. Song count = number of Performances (medley parts and Tapes counted; snippets and Unknown Songs not counted). The Incomplete marker follows the existing Incomplete Setlist rules.
  - `getSetlist(setlistId)` for a setlist.fm link, and `findLatestSetlist(...)` — the existing Latest Setlist lookup with the newest-complete alternative, unchanged.
  - `prepareSetlist(setlist, { keepTape })` → Show, kept Performances, the not-added list in played order (snippets, Unknown Songs, left-out Tapes) and the Incomplete status. `keepTape` decides each Tape (the CLI asks; the web leaves every Tape out).
  - `previewMatches(prepared, accessToken, { onProgress, signal })` → Preview rows (Performance → Match / Miss), Misses, playlist name. `onProgress` reports `n` of `total`; an aborted `signal` stops it with no further request.
  - `createSetlistPlaylist(...)` — as today.
- `runPlayset` is rebuilt on these steps. The CLI behaves exactly as before.

## Edge cases
- Every existing test stays green and **unchanged** (an AC of its own); CLI output, prompts, exit codes and request order are identical.
- A page of only placeholder Setlists → `setlists: []` with the correct `hasMore`.
- `listSetlists` past the last page (setlist.fm 404) → `setlists: []`, `hasMore: false`.
- Artist search with no result → the existing `ArtistNotFoundError`.
- Cancellation behaves as today: no request after abort; ignored once the create request is sent.

## Non-goals
- No setlist.fm `versionId`, playlist update, records or Host Account logic (Slice 14).
- No web code. No change to Match rules, Tape rules, naming or the Incomplete offer.

## Notes
- Shared-file request: export the steps and `SetlistSummary` from `src/core/index.ts`.
- `SetlistFmSetlist` fixtures are trimmed (no `versionId`/`lastUpdated`); fine for this Slice.
- setlist.fm paging is fixed at 20 per page; no page-size parameter (verified 2026-11-27). The throttle may still give a 429 under 2 req/s — keep `Retry-After` handling.
