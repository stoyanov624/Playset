# Brief 0022-artist-suggestions-contract — Artist suggestions in the web contract

Kind: feature
Slice: 22
Depends on: 20
Module: src/web/shared

The plan agreed with the user in the planning session. `/implementing`'s `prd-writer` turns it into `docs/prd/0022-artist-suggestions-contract.md`. Rules: `.claude/rules/web-shared.md`. Direction: `docs/phases/artist-suggestions.md`.

## Problem
The client and server need one agreed shape for "Artists matching what is typed so far", the timing/size numbers both sides use, and an admin label for the new MusicBrainz contact setting. Today the contract has only the submit-time candidates route (`GET /api/artists`).

## Goal
The contract describes the suggestions route, its answer and errors, the shared numbers, and the new config label, extending the existing patterns in `src/web/shared`.

## Behaviour
- `ROUTES.artistSuggestions = "/api/artist-suggestions"` — `GET`, no body.
- `artistSuggestionsQuerySchema = z.object({ name: trimmedQueryValue(LIMITS.artistNameMaxLength).min(LIMITS.artistSuggestionMinLength) })` — same key `name` as `GET /api/artists`; trimmed; 2–200 characters; a repeated key rejected.
- `artistCandidateSchema` gains a required `source: z.enum(ARTIST_SUGGESTION_SOURCES)` with `ARTIST_SUGGESTION_SOURCES = ["setlistfm", "musicbrainz"]` in `constants.ts`; `artistSuggestionSchema = artistCandidateSchema` (one shape for both routes); strict. This changes PRD 0015's `GET /api/artists` response: its candidates now carry `source` (MusicBrainz ones appear when setlist.fm finds none, see Slice 21). Its auto-pick field, if the response has one, stays and means "exact normalised match among setlist.fm candidates"; never set for MusicBrainz candidates.
- `artistSuggestionsResponseSchema = z.strictObject({ artists: z.array(artistSuggestionSchema).max(LIMITS.artistSuggestionsMax) })`; may be empty (empty is an answer, not `NOT_FOUND`).
- Error codes (no new code): `INVALID_INPUT` (too short / too long / repeated key), `RATE_LIMITED` (+ `Retry-After`), `UPSTREAM_UNAVAILABLE` (setlist.fm down), `INTERNAL`. MusicBrainz trouble is never an error.
- `LIMITS` gains `artistSuggestionMinLength: 2`, `artistSuggestionsMax: 8`, `artistSuggestionDebounceMs: 300`; the `LIMITS` comment widens to "bounds and timings Playset chooses".
- `CONFIG_ITEMS` gains `"MusicBrainz contact"` (last). The comment changes: listed are the required settings **and** optional ones whose absence turns a feature off; settings with defaults stay unlisted.
- Exported from `src/web/shared/index.ts` like the others (types `ArtistSuggestionsQuery`, `ArtistSuggestion`, `ArtistSuggestionsResponse`, `ArtistSuggestionSource`).

## Decisions already made
- A separate route, not a flag on `/api/artists`: different size limit, own rate limit and cache, and the submit flow stays as in Phase 2.
- Min 2 characters so short names ("U2", "MØ") get suggestions; the MusicBrainz fallback itself starts at 3 (core rule, not contract).
- `source` per suggestion (not per answer) so the client can label MusicBrainz ones without a second field.

## Non-goals
- No change to the Setlist list response or any other existing shape; `artistsResponseSchema` changes only through the candidate's `source`.

## Open questions for the PRD writer
- Does the admin status need to show "on/off" for the MusicBrainz fallback beyond `present`? Recommend: no, `present: false` says it.

## Acceptance hints
- Schema tests: 1-char and 201-char names rejected, padded name trimmed, repeated key rejected; 9 suggestions rejected; unknown `source` rejected; extra field rejected; `disambiguation` optional.
- `adminStatusResponseSchema` accepts the new config label (existing admin tests listing all labels change; so do existing tests of `artistCandidateSchema`/`artistsResponseSchema` that lack `source` — list both in the PR as superseded by PRD 0022, and check PRD 0015 under "Changes to earlier PRDs").
- Both server (Slice 23) and client (Slice 24) tests cover the route.
