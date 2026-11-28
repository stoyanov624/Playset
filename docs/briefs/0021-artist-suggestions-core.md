# Brief 0021-artist-suggestions-core — Suggest Artists, with MusicBrainz as a typo fallback

Kind: feature
Slice: 21
Depends on: 20
Module: src/core/musicbrainz (new), src/core/run (the steps and `createRunServices`), src/core/http (one policy option)

The plan agreed with the user in the planning session. `/implementing`'s `prd-writer` turns it into `docs/prd/0021-artist-suggestions-core.md`. Use `GLOSSARY.md` terms. Direction: `docs/phases/artist-suggestions.md`; facts: `docs/research/musicbrainz-artist-search.md` (verified 2026-11-28, don't re-research).

## Problem
setlist.fm's Artist search finds nothing for many misspellings (a lone mistyped word such as "radiohed"), so a Visitor who can't spell the Artist gets "No Artist found". MusicBrainz finds such names with fuzzy terms (`radiohed~` → Radiohead), and its ids work as-is on setlist.fm. The web app also needs a cheap, stateless way to ask "which Artists match what is typed so far?".

## Goal
The same MusicBrainz fallback also serves Search: `findArtists` (the submit step) falls back to MusicBrainz when setlist.fm has no Artist for the name, so Search and suggestions never disagree. A stateless core step `suggestArtists` that answers a typed (partial) name with up to 8 Artists: setlist.fm's when it has any, otherwise MusicBrainz's close matches; each suggestion says where it came from.

## Behaviour
- `suggestArtists(services, name, { signal? })` → `{ suggestions: ArtistSuggestion[], fallback: "not-needed" | "used" | "off" | "unavailable" }`, where `ArtistSuggestion = { name, mbid, disambiguation?, source: "setlistfm" | "musicbrainz" }`.
  - `name` trimmed, inner whitespace collapsed; empty → no suggestions, no request.
  - setlist.fm first (`findArtistCandidates`, relevance order). Candidates without an mbid are dropped; first 8 kept. No auto-pick in this step.
  - MusicBrainz only when setlist.fm has none (404 / empty) **and** the name has ≥ 3 characters **and** the MusicBrainz service is configured (else `fallback: "off"`).
  - MusicBrainz failure of any kind (503 after its one try, network, timeout, unexpected body) → `{ suggestions: [], fallback: "unavailable" }`, never an error. setlist.fm failures still throw as today (the server maps them).
  - Dedupe by lower-cased mbid, keeping the first.
  - `signal` aborted → no further request, rejects with the existing cancellation error.
- New module `src/core/musicbrainz`: `createMusicBrainzClient({ contact, appVersion }, requesterDeps)` → `searchArtists(name, { signal? })`:
  - `GET https://musicbrainz.org/ws/2/artist?query=<lucene>&fmt=json&limit=8`, through `createRequester` with `allowedUrlPrefixes: ["https://musicbrainz.org/ws/2/"]`, `minIntervalMs: 1100` (one requester per server process = one shared throttle), header `User-Agent: Playset/<appVersion> ( <contact> )`, `Accept: application/json`.
  - Query: split on whitespace; escape Lucene specials in each token (`+ - && || ! ( ) { } [ ] ^ " ~ * ? : \ /` with `\`); append `~` to tokens of ≥ 4 characters (counted before escaping); join with a space; URL-encode. E.g. `arctic monky` → `arctic~ monky~`, `ac/dc` → `ac\/dc`, `U2 live` → `U2 live`.
  - Keep hits with `score ≥ 70`, in MusicBrainz order; read only `id`, `name`, `disambiguation` (absent/empty → omitted). Never read `tags` or other supplementary data (CC BY-NC-SA).
  - 503: `Retry-After` (default 1 s) holds back the **next** MusicBrainz request of the process; the current call does not wait or retry (the Visitor is typing).
- `findArtists` (submit): setlist.fm first as today; when it has none (404 / empty) and the name has ≥ 3 characters and MusicBrainz is configured, the candidates are MusicBrainz's (same client, query, filter, throttle and failure rule as above). MusicBrainz failure or off → no candidates, as today ("No Artist found"), never a new error. Each candidate gains `source: "setlistfm" | "musicbrainz"`. Auto-pick (exactly one exact normalised name match) applies to setlist.fm candidates only; a MusicBrainz result is never auto-picked, the Visitor chooses. `suggestArtists` and `findArtists` share one internal helper for "setlist.fm, else MusicBrainz".
- `src/core/http`: the requester gains a policy option so a status (MusicBrainz's 503) is treated as "busy": thrown as a typed `HttpError` (`kind: "rate-limited"`) at once, and its Retry-After delays the next start. setlist.fm and Spotify policies unchanged.
- `createRunServices` takes an optional `musicBrainz: { contact, appVersion }`; absent → `services.searchMusicBrainzArtists` is undefined and the fallback is `"off"`.

## Decisions already made
- setlist.fm stays first; MusicBrainz is only a fallback, never merged with setlist.fm results.
- Contact is injected config, never a constant in the repo. MusicBrainz data shown is CC0; no credit required.
- Limits: 8 suggestions, MusicBrainz `limit=8`, `score ≥ 70`, `~` on tokens ≥ 4 chars, fallback from 3 chars, ≥ 1.1 s between MusicBrainz calls.
- No cache in core (the server caches; core stays stateless).

## Non-goals
- No `*` prefix variant (untested with `~`). No MusicBrainz alias display, country or type.

## Open questions for the PRD writer
- Request timeout for MusicBrainz (the requester has none today): recommend an `AbortSignal.timeout(3000)` combined with the caller's signal inside the client.

## Acceptance hints
- Fixture tests (no network) with recorded MusicBrainz bodies for `radiohed`, `arctic monky`, `ac/dc`: exact query strings, UA header, score filter, disambiguation optional.
- setlist.fm has results → MusicBrainz never called; setlist.fm 404 + 2-char name → no MusicBrainz call; 503 → empty + `"unavailable"` and the next call waits Retry-After; URL outside the prefix refused.
- Dedupe by mbid; at most 8; aborted signal sends nothing further.
- `src/core/index.ts` request (orchestrator): export `suggestArtists`, `ArtistSuggestion`, `SuggestArtistsResult`.
