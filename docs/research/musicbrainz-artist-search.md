# MusicBrainz Artist search as typo fallback for the web typeahead

Researched 2026-11-28. Calls: about 22 to musicbrainz.org (generic UA `playset-dev/0.1 (local test)`, no personal data) and 2 to setlist.fm.

Sources: [Search](https://musicbrainz.org/doc/MusicBrainz_API/Search), [Rate limiting](https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting), [Data licence](https://musicbrainz.org/doc/About/Data_License). The Search page text was truncated at 100k chars when fetched; fuzzy/wildcard rules come from real calls, not the doc.

## 1. Request and response
`GET https://musicbrainz.org/ws/2/artist?query=<lucene>&fmt=json&limit=N` (`limit` 1-100, default 25; `offset` pages). Send `User-Agent`; `Accept: application/json` optional.

Response: `{ created, count, offset, artists: [...] }`. `count` = total hits (huge and meaningless for fuzzy queries, e.g. 5983).
Per artist (seen): `id` (mbid), `type` ("Person"/"Group"), `type-id`, `score` (int 0-100), `name`, `sort-name`, `country` (ISO, may be absent), `area`, `begin-area`, `disambiguation` (absent when none, e.g. "Icelandic post-rock band"), `life-span`, `aliases[]`, `tags[]`, `gender`, `ipis`, `isnis`. Results are sorted by `score` descending. Responses are large (aliases, tags); only `id`, `name`, `disambiguation`, `country`, `type`, `score` are needed.
`score` = Lucene relevance normalised so the best hit is 100; the docs do not define it. Observed: exact name 100, near misses 70-85.

## 2. Query syntax (real results, top hits with score)
| query | result |
|---|---|
| `radiohed` | count 0 (plain term, no match) |
| `radiohed~` | Radiohead 100, Yannis RockRadioHermes 81, radiohead 3 73 |
| `foo fighers` | Foo Fighters 100, Foo Foo 86 (plain already tolerant here) |
| `arctic monky` | Arctic Monkeys 100, Monky 98, MONKY 97 (first call 503 - rate limiter, repeated OK) |
| `arctic monky~` | Arctic Monkeys 100, Arctic Monkeyz 79, Thelonious Monk 75 |
| `arctic~ monky~` | Arctic Monkeys 100, Antarctic Monkeys 83, Subarctic Monkeys 83 (works; the "returns nothing" seen elsewhere did not reproduce, but it is noisy) |
| `arcti*` | Arctic Monkeys 100, Sonata Arctica 94, Arctic Sunrise 75 |
| `beyonce` | Beyoncé 100 (accents folded), then Beyonce Bowels 72 |
| `guns n roses` | Guns N' Roses 100 (curly apostrophe in name), tribute acts after |
| `AC\/DC` (URL `AC%5C/DC`) | AC/DC 100, AC/DC UK 73 |
| `sigur ros` | Sigur Rós 100, then 55 noise |
| `the national` | The National 100, The National Parks 79 |
Not retested: plain `arcti` (503 at the time), `arcti OR arcti*` (503).
Findings:
- Default fields (no `artist:`) search `alias`, `artist`, `sortname`; accents are folded; "&"/"n"/"and" variants in names are not equated by MB.
- Plain terms: tolerant of one-word typos only sometimes; a single typo in a lone word (`radiohed`) gives nothing. Add `~` for typos.
- Prefix: trailing `*` on the last token works (`arcti*`). Leading wildcards not tested.
- Multi-word: terms are OR-ish/scored, so exact full-name hits reach 100 and junk follows; filter client-side by `score` (suggest >= 70-80) and show max 5-8.
- Escape Lucene specials in user input before building the query: `+ - && || ! ( ) { } [ ] ^ " ~ * ? : \ /` with a backslash, then URL-encode (doc example `ac/dc` -> `ac\/dc`). Alternative per docs: `dismax=true` escapes syntax itself, but then `~`/`*` do not work, so escape manually.
- Do not apply `~` to very short tokens (<3 chars) or stopwords; untested, expect noise.

## 3. Rate limit and User-Agent
Per the doc, checks in order: User-Agent, source IP, global load. Any failure = HTTP 503. UA: "anonymous" UAs (blank, or starting with Java/Python-urllib/Jakarta Commons-HttpClient/Apache-HttpClient) are limited to ~50 req/s on average (the doc names a few specific UAs); source IP: ~1 req/s on average, all requests declined until the rate is back at or below 1/s; global: ~300 req/s. Limits may change; higher limits only by agreement with MusicBrainz.
Required UA: `AppName/<version> ( contact-url-or-email )`, e.g. `Playset/0.1 ( https://example.org/playset )`. A URL or an email both accepted. The limit is per source IP, so a Playset server must share one throttle (>=1 req/s total across all Visitors, with a cache and typeahead debounce) rather than per Visitor.
Observed: 503 with JSON `{"error":"The MusicBrainz web server is currently busy. Please try again later."}`, headers `retry-after: 1`, `x-ratelimit-zone: global`, `x-ratelimit-who: global`, `x-mb-rate-limiter: lua`. These 503s hit about 1 call in 3 even at 1.3-2 s spacing (zone "global" = load, not my IP rate; the doc does not mention Retry-After but it is sent). With 4 s spacing all 4 calls passed. Treat 503 as retryable with `Retry-After`, then give up silently (typeahead shows no fallback suggestions).

## 4. Licence and attribution
Core data (which includes artists) is CC0 (public domain): no attribution required for showing artist names/ids. Supplementary data (tags, ratings, annotations etc.) is CC BY-NC-SA 3.0 - avoid displaying/storing `tags` and similar. The doc does not say explicitly that artist names are core; the data page cites the MusicBrainz Database page for the split (not fetched). A "Names from MusicBrainz" credit is courteous, not required.

## 5. mbid on setlist.fm
Verified: `GET https://api.setlist.fm/rest/1.0/artist/ada7a83c-e3e1-40f1-93f9-3e73dbc9298a/setlists?p=1` (Arctic Monkeys MB id, taken from MusicBrainz) -> 200, `total 1095`, `artist.mbid` equal to the same id, 0.67 s. An unknown, well-formed mbid (`11111111-2222-4333-8444-555555555555`) -> 404 `{"code":404,"status":"Not Found","message":"not found"}` (0.40 s). So a MusicBrainz mbid works directly; a 404 means setlist.fm has no Setlists for that Artist (treat as "no Setlists", not an error). An mbid with no Shows on setlist.fm was not tested separately.

## 6. Latency
MusicBrainz artist search: 0.11-0.40 s per call (typically 0.15-0.25 s; fuzzy slightly slower, 0.2-0.4 s; 503s return in ~0.12 s). setlist.fm: 0.4-0.7 s.

## Facts for CLAUDE.md
- MusicBrainz artist search (verified 2026-11-28): `GET https://musicbrainz.org/ws/2/artist?query=<lucene>&fmt=json&limit=N`; hits sorted by `score` (100 = best); fields `id` (mbid), `name`, `sort-name`, `disambiguation`, `type`, `country`, `score`. `radiohed` plain finds nothing, `radiohed~` finds Radiohead; `arcti*` finds Arctic Monkeys; escape Lucene specials with `\` (`AC\/DC`). ~0.2 s. Limit ~1 req/s per source IP, else 503 (`retry-after: 1`); UA must be `Name/version ( url-or-email )`, anonymous UAs are throttled harder. Artist data is CC0, no attribution required; tags etc. are CC BY-NC-SA.
- A MusicBrainz id works as-is on setlist.fm `/artist/{mbid}/setlists`; an unknown mbid answers 404 `not found`.

## Recommendation
- Primary: setlist.fm `GET /search/artists` (prefixes). Fallback to MusicBrainz only when it returns nothing (404) and the input has >= 3 characters.
- Query: split input on whitespace, escape Lucene specials per token, then send `tok1~ tok2~ ...` for tokens >= 4 chars (shorter tokens plain) - e.g. `arctic monky~`. Optionally add `*` on the last token as a prefix variant only if tested together first (combination untested). `limit=8`, `fmt=json`; keep entries with `score >= 70`, show `name` + `disambiguation`/`country`, use `id` as the setlist.fm mbid.
- Server-side: one shared throttle (>= 1.1 s between MB calls), debounce input (~300 ms), cache by normalised query, honour `Retry-After` on 503 then skip the fallback, UA `Playset/<version> ( <project url or email> )` set by the operator via config (not a personal address in the repo).
