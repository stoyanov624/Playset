# PRD 0006 — Create the Setlist Playlist

Status: Approved
Slice: 6
Depends on: 0002, 0003, 0004
Module: src/core/setlist-playlist

## Problem

Playset can turn a **Setlist** into **Performances** with **Show** details (PRD 0002), find a **Match** for each Performance (PRD 0003) and get a Spotify access token (PRD 0004). It still can't put anything on Spotify. There is no agreed name or description for a **Setlist Playlist**, no way to tell the user that a playlist with the same name already exists, and no safe way to create the playlist and add many tracks in played order. Adding tracks has to work around Spotify limits: at most 100 tracks per request, rate limiting, and the removal of the old playlist endpoints.

## Goal

Given the Show details and the Matches in played order, Playset can:

- work out the Setlist Playlist name and description without any network request, so a front-end can show them in the preview;
- list the user's existing Spotify playlists that already have that exact name, so a front-end can warn before the user confirms;
- create a new private (or, on request, public) Setlist Playlist, fill it with every Match in played order, and return its id, share link, name and track count.

## Non-goals

- **No login.** Getting or refreshing the access token belongs to PRD 0004. This feature only uses an access token that the caller supplies.
- **No matching.** Finding Matches, choosing studio over live, Cover fallback and reporting **Misses** belong to PRD 0003 and Slice 7. The input is the list of Matches, already in played order. Misses are simply not in it.
- **No Tape or snippet decisions.** Which **Tapes** are kept is decided before this feature is called (Slice 7).
- **No prompting or printing.** Showing the preview, the duplicate warning, the confirmation, progress and the share link belong to the CLI (Slice 7). The `--yes` and `--public` flags are read by the CLI. This feature only receives a "public" yes/no option.
- **The duplicate check never blocks.** Finding a playlist with the same name never stops creation. Each create request makes a new Setlist Playlist, even when one with that name exists.
- **No editing, reusing, renaming or deleting existing playlists.** If adding tracks fails part-way, the partly filled playlist is left as it is and reported; it is never deleted or retried automatically.
- **No cover image**, no collaborative playlists, no playlist folders.
- **No filtering by owner.** The duplicate check looks at every playlist in the user's playlist list (owned or followed), as Spotify returns it. It makes no extra request to find out who the user is.
- **No de-duplication.** A song played twice gives two Matches with the same track, and both are added.
- **No fuzzy name comparison.** The duplicate check does not ignore letter case, accents or dash style.
- **No validation of Show details.** A missing Artist, date, city or URL is not checked (PRD 0002 assumes well-formed input too). Name text is used exactly as given and is not shortened.
- **No throttling beyond honouring `Retry-After`** on HTTP 429.
- **No old Spotify endpoints.** `/v1/users/{id}/playlists` and `/v1/playlists/{id}/tracks` are never used.

## User stories

- As a concert-goer, I want my Setlist Playlist named after the Artist, date and city so that I can find it quickly in Spotify.
- As a concert-goer, I want the setlist.fm link in the description so that the source is credited and I can open the Setlist from Spotify.
- As a concert-goer, I want to be warned when I already have a playlist with that name so that I don't end up with copies by accident, while still being able to make a new one.
- As a concert-goer, I want the playlist private unless I ask for public so that my listening stays my own.
- As a concert-goer, I want every Match in played order, Encores and repeats included, even for long Shows with more than 100 tracks, so that the playlist feels like the Show.
- As a concert-goer, if something fails after the playlist was created, I want its link so that I can find or delete the partial playlist myself.
- As a front-end developer, I want the name and description available before anything is created so that the preview shows exactly what will be made.

## Acceptance criteria

Inputs used below:

- **Show details**: the Show details PRD 0002 produces (AC-12 there): Artist name, date (`YYYY-MM-DD`), city name, venue name and setlist.fm URL. They are reused as they are, not redefined.
- **Matches**: Match outcomes from PRD 0003 (AC-2 there), in played order. Only each Match's Spotify track URI is used here; its other fields are ignored.
- **Access token**: supplied by the caller (for example from PRD 0004), the same way the Spotify search in PRD 0003 takes it. Network access and waiting are injectable, as in PRD 0003 (AC-19, AC-20), so tests use a fake Spotify and a fake sleep.

### Name and description (no network)

- **AC-1** — Given Show details, when the Setlist Playlist name is worked out, then it is the Artist name, a space, an en dash (`–`, U+2013), a space, the date as `YYYY-MM-DD`, a space, an en dash, a space and the city name, with each part exactly as in the Show details. No network request is made.
- **AC-2** — Given Show details, when the Setlist Playlist description is worked out, then it is exactly `Setlist from setlist.fm: ` followed by the setlist.fm URL from the Show details, with nothing else before or after it. No network request is made.
- **AC-3** — Given Show details whose description (AC-2) would be longer than 300 characters, when the description is worked out or a Setlist Playlist is created, then a typed "description too long" error is raised that states the length and the 300-character limit. The description is never shortened (shortening would break the setlist.fm link), and no network request is made. A description of exactly 300 characters is allowed.
- **AC-4** — Given the same Show details, when the name and description are worked out several times, and when a Setlist Playlist is created from them, then the name and description are the same every time. The preview always matches what is created.

### Duplicate check

- **AC-5** — Given a Setlist Playlist name and an access token, when the duplicate check runs, then it sends `GET https://api.spotify.com/v1/me/playlists?limit=50` with the header `Authorization: Bearer <token>`. While a response has a non-empty `next` URL, it sends a `GET` to that URL exactly as given, with the same header, one page after another. It stops after the first page whose `next` is `null` or missing.
- **AC-6** — Given the pages of the user's playlists, when the duplicate check finishes, then it returns every playlist whose name, with leading and trailing whitespace removed, equals the checked name with leading and trailing whitespace removed. The comparison is case-sensitive and character-exact: a different letter case, a hyphen (`-`) instead of an en dash, or a different date or city does not count. Each returned playlist has its id, its name as Spotify gave it and its share link (`external_urls.spotify`), listed in the order Spotify returned them across pages. Given no playlist has that name, the result is empty.
- **AC-7** — Given a page whose `items` contains `null` entries or entries without a name, when the duplicate check runs, then those entries are skipped without error. Given a page whose `items` is empty, then it simply has no candidates.
- **AC-8** — Given a checked name that is empty or only whitespace, when the duplicate check runs, then the result is empty and no request is sent.
- **AC-9** — Given a `next` URL that does not start with `https://api.spotify.com/`, when the duplicate check runs, then that URL is not requested (the access token is never sent to another host), and a typed Spotify error is raised.
- **AC-10** — Given the duplicate check found one or more playlists with the same name, when a Setlist Playlist is then created, then creation goes ahead as usual (AC-11 to AC-16). The duplicate check never stops or changes creation.

### Creating and filling the playlist

- **AC-11** — Given Show details, at least one Match and an access token, when a Setlist Playlist is created, then exactly one `POST https://api.spotify.com/v1/me/playlists` is sent first, with headers `Authorization: Bearer <token>` and `Content-Type: application/json`, and a JSON body with exactly `name` (AC-1), `description` (AC-2) and `public`.
- **AC-12** — Given no "public" option, or the option set to no, when a Setlist Playlist is created, then the create body has `"public": false`. Given the option set to yes, then it has `"public": true`.
- **AC-13** — Given the playlist was created with id `<id>`, when the Matches are added, then they are sent with `POST https://api.spotify.com/v1/playlists/<id>/items`, the same two headers, and a JSON body `{"uris": [...]}`. Each request holds at most 100 URIs. The requests are sent one after another, each only after the previous one succeeded. Taken together, they hold every Match's URI exactly once per Match, in played order: the first request has Matches 1–100, the second 101–200, and so on.
- **AC-14** — Given Matches that share the same track URI (a song played twice, or two Performances matched to the same track), when the Setlist Playlist is created, then the URI is sent once for each of those Matches, in its played position. Nothing is collapsed or reordered.
- **AC-15** — Given every request succeeds, when a Setlist Playlist is created, then the result has: the playlist id from the create response; the share link from the create response's `external_urls.spotify` (or `https://open.spotify.com/playlist/<id>` if that field is missing); the name sent (AC-1); and the track count, which equals the number of Matches given (repeats included).
- **AC-16** — Given an empty list of Matches, when a Setlist Playlist is created, then a typed "nothing to add" error is raised and no request is sent. No empty playlist is created.

### Spotify errors and rate limits

- **AC-17** — Given any request in this feature (a duplicate-check page, the create request, or an add-items request) is answered with HTTP 429, when it is handled, then Playset waits the number of seconds in the `Retry-After` header (1 second if the header is missing or unreadable) and sends the same request again. Each request has its own budget of 3 such retries. If the 4th attempt is still answered with 429, a typed rate-limit error is raised saying Spotify rate-limited the request.
- **AC-18** — Given any request in this feature is answered with any other non-success status (for example 400, 401, 403, 404 or 500), when it is handled, then a typed Spotify error is raised right away. It includes the HTTP status, and Spotify's `error.message` when the body has one. The request is not retried.
- **AC-19** — Given the create request fails (a typed error from AC-17 or AC-18, or a network failure), when a Setlist Playlist is created, then no add-items request is sent, and the error says no playlist was created.
- **AC-20** — Given the playlist was created and an add-items request then fails (a typed error from AC-17 or AC-18, or a network failure), when a Setlist Playlist is created, then no further add-items request is sent and a typed "partly created" error is raised. It carries the created playlist's id, its share link (as in AC-15), the number of tracks added before the failure, the total number of Matches, and the underlying cause (including the HTTP status if there was one). The playlist is not deleted.
- **AC-21** — Given any error raised by this feature, when it is turned into text (message, plus any hint or cause), then the access token never appears in it.
- **AC-22** — Given any run of the duplicate check or of creating a Setlist Playlist, when the requests are recorded, then none goes to a URL containing `/v1/users/` or ending in `/tracks`, and every request goes to `https://api.spotify.com/`.

## Examples

All fake responses are trimmed to the fields that matter. The access token in every example is `BQD-test-token`.

### Fixture S — Show details (from PRD 0002, Fixture A)

| Field | Value |
|---|---|
| Artist | Arctic Monkeys |
| Date | 2025-08-23 |
| City | Amsterdam |
| Venue | Ziggo Dome |
| URL | https://www.setlist.fm/setlist/arctic-monkeys/2025/ziggo-dome-amsterdam-netherlands-63a5e2b7.html |

### E1 — Name (AC-1, AC-4)

Fixture S → `Arctic Monkeys – 2025-08-23 – Amsterdam`

The two dashes are U+2013 with one space on each side. The name is 39 characters long. No request is recorded.

More cases:

| Artist | Date | City | Name |
|---|---|---|---|
| Sigur Rós | 2026-03-14 | Reykjavík | `Sigur Rós – 2026-03-14 – Reykjavík` |
| AC/DC | 2026-06-01 | Paris | `AC/DC – 2026-06-01 – Paris` |
| Simon & Garfunkel | 1981-09-19 | New York | `Simon & Garfunkel – 1981-09-19 – New York` |

### E2 — Description (AC-2, AC-3, AC-4)

Fixture S → `Setlist from setlist.fm: https://www.setlist.fm/setlist/arctic-monkeys/2025/ziggo-dome-amsterdam-netherlands-63a5e2b7.html` (122 characters). No request is recorded.

Length limit (AC-3). The prefix `Setlist from setlist.fm: ` is 25 characters, so:

| URL length | Description length | Outcome |
|---|---|---|
| 97 (Fixture S) | 122 | allowed |
| 275 | 300 | allowed, not shortened |
| 276 | 301 | "description too long" error mentioning 301 and 300; no request recorded |

For the 276-character case, use `https://www.setlist.fm/setlist/` followed by `a` repeated until the URL is 271 characters long, followed by `.html` (276 characters in total).

### E3 — Duplicate check, two pages (AC-5, AC-6, AC-7)

Checked name: `Arctic Monkeys – 2025-08-23 – Amsterdam`

Request 1: `GET https://api.spotify.com/v1/me/playlists?limit=50`, `Authorization: Bearer BQD-test-token`

```json
{
  "href": "https://api.spotify.com/v1/me/playlists?offset=0&limit=50",
  "limit": 50,
  "offset": 0,
  "total": 53,
  "next": "https://api.spotify.com/v1/me/playlists?offset=50&limit=50",
  "previous": null,
  "items": [
    { "id": "37i9dQZF1DXcBWIGoYBM5M", "name": "Today's Top Hits",
      "external_urls": { "spotify": "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M" } },
    { "id": "1AbCdEfGhIjKlMnOpQrStU", "name": "Arctic Monkeys – 2025-08-23 – Amsterdam",
      "external_urls": { "spotify": "https://open.spotify.com/playlist/1AbCdEfGhIjKlMnOpQrStU" } },
    null,
    { "id": "2BcDeFgHiJkLmNoPqRsTuV", "name": "arctic monkeys – 2025-08-23 – amsterdam",
      "external_urls": { "spotify": "https://open.spotify.com/playlist/2BcDeFgHiJkLmNoPqRsTuV" } },
    { "id": "3CdEfGhIjKlMnOpQrStUvW", "name": "Arctic Monkeys - 2025-08-23 - Amsterdam",
      "external_urls": { "spotify": "https://open.spotify.com/playlist/3CdEfGhIjKlMnOpQrStUvW" } }
  ]
}
```

Request 2: `GET https://api.spotify.com/v1/me/playlists?offset=50&limit=50`, same header

```json
{
  "href": "https://api.spotify.com/v1/me/playlists?offset=50&limit=50",
  "limit": 50,
  "offset": 50,
  "total": 53,
  "next": null,
  "previous": "https://api.spotify.com/v1/me/playlists?offset=0&limit=50",
  "items": [
    { "id": "4DeFgHiJkLmNoPqRsTuVwX", "name": "Arctic Monkeys – 2025-08-23 – Amsterdam ",
      "external_urls": { "spotify": "https://open.spotify.com/playlist/4DeFgHiJkLmNoPqRsTuVwX" } },
    { "id": "5EfGhIjKlMnOpQrStUvWxY" },
    { "id": "6FgHiJkLmNoPqRsTuVwXyZ", "name": "Arctic Monkeys – 2025-08-24 – Amsterdam",
      "external_urls": { "spotify": "https://open.spotify.com/playlist/6FgHiJkLmNoPqRsTuVwXyZ" } }
  ]
}
```

Result (exactly 2 requests sent):

| id | name | share link |
|---|---|---|
| 1AbCdEfGhIjKlMnOpQrStU | `Arctic Monkeys – 2025-08-23 – Amsterdam` | https://open.spotify.com/playlist/1AbCdEfGhIjKlMnOpQrStU |
| 4DeFgHiJkLmNoPqRsTuVwX | `Arctic Monkeys – 2025-08-23 – Amsterdam ` (trailing space kept as Spotify gave it) | https://open.spotify.com/playlist/4DeFgHiJkLmNoPqRsTuVwX |

Not returned: `2BcDe…` (letter case differs), `3CdEf…` (hyphens instead of en dashes), `6FgHi…` (different date), the `null` entry and `5EfGh…` (no name), all skipped without error.

### E4 — Duplicate check, no match and edge cases (AC-6, AC-7, AC-8, AC-9)

| Situation | Requests | Result |
|---|---|---|
| One page `{ "items": [], "next": null }` | 1 | empty |
| One page, no item has the name, `next` missing from the body | 1 | empty |
| Checked name `"   "` | 0 | empty |
| Checked name `""` | 0 | empty |
| Page 1 has `"next": "https://evil.example.com/v1/me/playlists?offset=50"` | 1 | typed Spotify error; the second URL is never requested |

### E5 — Duplicate found, creation still happens (AC-10)

The duplicate check returns `1AbCdEfGhIjKlMnOpQrStU` (as in E3). Creating a Setlist Playlist from Fixture S with three Matches still sends the create request and one add-items request, and returns a new playlist id (`7GhIjKlMnOpQrStUvWxYzA` in E6).

### E6 — Create and fill, private by default, with a repeat (AC-11, AC-12, AC-13, AC-14, AC-15)

Matches in played order (URIs only; other Match fields as in PRD 0003 E1 and E2):

1. `spotify:track:4LRPiXqCikLlN15c3yImP7` (Sculptures of Anything Goes)
2. `spotify:track:2x8evxqUlF0eRabbW2JBJd` (505)
3. `spotify:track:5FVd6KXrgO9B3JPmC8OPst` (I Wanna Be Yours)
4. `spotify:track:2x8evxqUlF0eRabbW2JBJd` (505, played again)

No "public" option given.

Request 1:

```
POST https://api.spotify.com/v1/me/playlists
Authorization: Bearer BQD-test-token
Content-Type: application/json
```

```json
{
  "name": "Arctic Monkeys – 2025-08-23 – Amsterdam",
  "description": "Setlist from setlist.fm: https://www.setlist.fm/setlist/arctic-monkeys/2025/ziggo-dome-amsterdam-netherlands-63a5e2b7.html",
  "public": false
}
```

Response `201 Created`:

```json
{
  "id": "7GhIjKlMnOpQrStUvWxYzA",
  "name": "Arctic Monkeys – 2025-08-23 – Amsterdam",
  "description": "Setlist from setlist.fm: https://www.setlist.fm/setlist/arctic-monkeys/2025/ziggo-dome-amsterdam-netherlands-63a5e2b7.html",
  "public": false,
  "collaborative": false,
  "uri": "spotify:playlist:7GhIjKlMnOpQrStUvWxYzA",
  "href": "https://api.spotify.com/v1/playlists/7GhIjKlMnOpQrStUvWxYzA",
  "external_urls": { "spotify": "https://open.spotify.com/playlist/7GhIjKlMnOpQrStUvWxYzA" },
  "snapshot_id": "AAAAAQAAAAA"
}
```

Request 2:

```
POST https://api.spotify.com/v1/playlists/7GhIjKlMnOpQrStUvWxYzA/items
Authorization: Bearer BQD-test-token
Content-Type: application/json
```

```json
{ "uris": [
  "spotify:track:4LRPiXqCikLlN15c3yImP7",
  "spotify:track:2x8evxqUlF0eRabbW2JBJd",
  "spotify:track:5FVd6KXrgO9B3JPmC8OPst",
  "spotify:track:2x8evxqUlF0eRabbW2JBJd"
] }
```

Response `201 Created`:

```json
{ "snapshot_id": "AAAAAgAAAAA" }
```

Result:

```json
{
  "id": "7GhIjKlMnOpQrStUvWxYzA",
  "shareUrl": "https://open.spotify.com/playlist/7GhIjKlMnOpQrStUvWxYzA",
  "name": "Arctic Monkeys – 2025-08-23 – Amsterdam",
  "trackCount": 4
}
```

Exactly 2 requests are recorded, in this order.

Public option set to yes (AC-12): the same create body, except `"public": true`.

Missing share link (AC-15): if the create response has no `external_urls`, the share link is `https://open.spotify.com/playlist/7GhIjKlMnOpQrStUvWxYzA`.

### E7 — 250 Matches in three batches (AC-13, AC-15)

Matches 1–250 have URIs `spotify:track:T001` … `spotify:track:T250` (fake ids, numbered in played order), except that Match 180 repeats Match 7's URI `spotify:track:T007`.

| Request | Method and URL | `uris` sent |
|---|---|---|
| 1 | `POST /v1/me/playlists` | — (create, returns id `8HiJkLmNoPqRsTuVwXyZaB`) |
| 2 | `POST /v1/playlists/8HiJkLmNoPqRsTuVwXyZaB/items` | Matches 1–100 (100 URIs, `T001`…`T100`) |
| 3 | `POST /v1/playlists/8HiJkLmNoPqRsTuVwXyZaB/items` | Matches 101–200 (100 URIs; position 80 of this batch is `T007`) |
| 4 | `POST /v1/playlists/8HiJkLmNoPqRsTuVwXyZaB/items` | Matches 201–250 (50 URIs, `T201`…`T250`) |

Request 3 is sent only after request 2 has answered 201, and request 4 only after request 3. Joining the three `uris` lists gives exactly the 250 Match URIs in played order. Result `trackCount` is 250.

Boundary cases: 100 Matches → one add-items request with 100 URIs. 101 Matches → two requests, with 100 and 1 URIs.

### E8 — No Matches (AC-16)

Fixture S with `[]` Matches → "nothing to add" error; 0 requests recorded.

### E9 — Rate limiting (AC-17)

| Fake responses | Behaviour |
|---|---|
| Create: 429 `Retry-After: 2`, then 201 | sleeps 2 s, sends the same create again, continues to add items |
| Add-items batch 2: 429 with no `Retry-After`, then 201 | sleeps 1 s, resends batch 2 (same URIs), continues with batch 3 |
| Duplicate-check page 1: 429 `Retry-After: abc`, then 200 | sleeps 1 s, resends page 1 |
| Create: 429, 429, 429, 429 (all `Retry-After: 1`) | 4 create requests, then a rate-limit error; no add-items request (AC-19) |
| Batch 1: 429, then 201; batch 2: 429, 429, 429, then 201 | succeeds; each batch has its own 3-retry budget |

Tests use a fake sleep, so there is no real waiting.

### E10 — Other failures (AC-18, AC-19, AC-21)

| Failing request | Response | Outcome |
|---|---|---|
| Create | 401 `{ "error": { "status": 401, "message": "The access token expired" } }` | Spotify error mentioning 401 and "The access token expired"; says no playlist was created; 1 request in total |
| Create | 403 `{ "error": { "status": 403, "message": "Insufficient client scope" } }` | Spotify error mentioning 403; no add-items request |
| Create | fake network throws "network unreachable" | error says no playlist was created; no add-items request |
| Duplicate-check page 2 | 500 with an empty body | Spotify error mentioning 500; 2 requests in total; no retry |

In every case the error text does not contain `BQD-test-token`.

### E11 — Partly created playlist (AC-20, AC-21)

250 Matches as in E7. Create succeeds (`8HiJkLmNoPqRsTuVwXyZaB`), batch 1 answers 201, and batch 2 answers `400 { "error": { "status": 400, "message": "Invalid base62 id" } }`.

→ "partly created" error with:

| Field | Value |
|---|---|
| Playlist id | 8HiJkLmNoPqRsTuVwXyZaB |
| Share link | https://open.spotify.com/playlist/8HiJkLmNoPqRsTuVwXyZaB |
| Tracks added | 100 |
| Total Matches | 250 |
| Cause | Spotify error, status 400, "Invalid base62 id" |

Exactly 3 requests are recorded (create, batch 1, batch 2). Batch 3 is never sent and nothing is deleted. The error text does not contain `BQD-test-token`.

Same set-up, but batch 1 gets four 429s → "partly created" error with 0 tracks added and a rate-limit cause.

### E12 — Only allowed endpoints (AC-22)

Across E3, E6, E7 and E11, every recorded request URL starts with `https://api.spotify.com/v1/me/playlists` or `https://api.spotify.com/v1/playlists/<id>/items`. None contains `/v1/users/` and none ends in `/tracks`.

## Glossary terms used

- **Setlist** — as defined in GLOSSARY.md.
- **Show** — as defined in GLOSSARY.md. Its details (Artist, date, city, URL) come from PRD 0002.
- **Artist** — as defined in GLOSSARY.md.
- **Encore** — as defined in GLOSSARY.md.
- **Performance** — as defined in GLOSSARY.md.
- **Tape** — as defined in GLOSSARY.md (mentioned only as out of scope).
- **Cover** — as defined in GLOSSARY.md (mentioned only as out of scope).
- **Setlist Playlist** — as defined in GLOSSARY.md.
- **Match** — as defined in GLOSSARY.md. Its shape comes from PRD 0003.
- **Miss** — as defined in GLOSSARY.md (mentioned only as out of scope).

Spotify words (playlist, track URI, access token, share link, `next` page) are external API terms, not Playset domain terms. "Duplicate check" is used in its plain-English sense and is not a glossary term.

## Shared-file requests

For the orchestrator (this Slice does not edit shared files):

- **docs/PLAN.md** — Slice 6 also depends on Slice 2, because the name and description come from PRD 0002's Show details. Change the Slice 6 row to "Depends on: 2, 3, 5". Slice 2 is already built, so Waves are unaffected.
- **src/core/index.ts** — export this module's public API: name and description preview, duplicate check, create Setlist Playlist, and its typed errors.

## Open questions

(none)
