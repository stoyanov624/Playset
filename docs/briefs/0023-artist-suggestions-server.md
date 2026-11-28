# Brief 0023-artist-suggestions-server — Serve Artist suggestions

Kind: feature
Slice: 23
Depends on: 21, 22
Module: src/web/server

The plan agreed with the user in the planning session. `/implementing`'s `prd-writer` turns it into `docs/prd/0023-artist-suggestions-server.md`. Rules: `.claude/rules/web-server.md`; contract: `src/web/shared` (Slice 22); core step: `suggestArtists` (Slice 21). Direction: `docs/phases/artist-suggestions.md`.

## Problem
The browser needs suggestions while the Visitor types, which means many small requests per Visitor. setlist.fm (≤ 2 req/s, shared) and MusicBrainz (~1 req/s per server IP, shared) must not be flooded, and MusicBrainz needs an operator contact in its User-Agent.

## Goal
`GET /api/artist-suggestions` answers from a server-wide cache or the core step, behind a per-IP limit, with the MusicBrainz fallback on only when the operator set a contact.

## Behaviour
- Route: parse `artistSuggestionsQuerySchema` (failure → `INVALID_INPUT`, new catalogue entry "Type at least 2 letters to see suggestions." / no hint needed) → cache → `suggestArtists(services, name, { signal })` → `artistSuggestionsResponseSchema`. A closed connection aborts the core call (same pattern as the preview stream).
- Cache (in memory, one per process): key = name lower-cased, NFKC, trimmed, inner whitespace collapsed; value = the answer, **empty answers included**; TTL 1 hour; at most 1000 entries, least recently used evicted. An answer with `fallback: "unavailable"` is cached for 1 minute only, so a busy MusicBrainz is retried soon. Identical requests in flight share one core call.
- Per-IP limit: `PLAYSET_SUGGEST_LIMIT` (optional, default 300 per hour, sliding window like the preview limit); cache hits count too (the limit guards the server, not only upstream). Exceeded → `RATE_LIMITED` + `Retry-After`; counts in the admin's rate-limit hits today.
- `PLAYSET_MUSICBRAINZ_CONTACT` (optional): an email address or an `https://` URL, no whitespace or parentheses (it sits inside `( … )` of the UA); invalid → startup stops with a clear line. Absent/blank → MusicBrainz fallback off, a startup log line says so, `/admin` config shows "MusicBrainz contact" as missing. `appVersion` comes from `package.json` `version`.
- `main.ts` passes `musicBrainz: { contact, appVersion }` to `createRunServices` only when the contact is set. `.env.example` gains both new settings with comments (no real address).
- Logging: `fallback: "unavailable"` → one warn line (no Visitor data); setlist.fm errors map as for `/api/artists`.
- `GET /api/artists` (submit) now gets MusicBrainz candidates from core `findArtists` when setlist.fm has none; the route only maps the new `source` field through. Its limits, cache and error mapping stay; MusicBrainz trouble is never an error there either (empty → the existing `NOT_FOUND`). It shares the MusicBrainz throttle with suggestions; submit requests are not cached by the new suggestion cache. Auto-pick only for setlist.fm candidates (core rule).
- Setlist list for an Artist setlist.fm doesn't know (an id found only on MusicBrainz): already handled — core's `getSetlistPage` turns setlist.fm's 404 into an empty page with `hasMore: false` and no Artist name, so `GET /api/artists/:mbid/setlists` answers 200 `{ artist: { mbid }, setlists: [], hasMore: false }`. This Slice adds a route test pinning that (no `NOT_FOUND`, nothing logged as an error).

## Decisions already made
- Suggestions are not counted as usage events and never touch SQLite. IPs only in the in-memory window.
- The cache lives in the server, not core; it is the only place answers are reused.
- Default limit 300/hour: a Visitor typing with a 300 ms debounce sends roughly 3–6 requests per name.

## Non-goals
- No limit or cache change for `/api/artists`, preview or create. No persistence of the cache.

## Open questions for the PRD writer
- setlist.fm may cap requests per day per key (not verified in `CLAUDE.md`); if the PRD writer finds a documented cap, size the default limit and TTL against it (research subagent, no guess).

## Acceptance hints
- supertest with a fake `suggestArtists`/services and a fake clock: happy path (both sources), empty answer, too short / too long / repeated key, upstream down, rate limited with Retry-After, cache hit makes no core call, TTL expiry, LRU eviction, short TTL for `"unavailable"`, shared in-flight call, aborted on disconnect.
- Config tests: contact absent → fallback off and admin `present: false`; invalid contact → `WebConfigError`; `PLAYSET_SUGGEST_LIMIT` bounds.
- `/api/artists`: setlist.fm none + MusicBrainz candidates → 200 with `source: "musicbrainz"`, no auto-pick; MusicBrainz unavailable/off → `NOT_FOUND` as before.
- No secret, contact or upstream status in any body.
