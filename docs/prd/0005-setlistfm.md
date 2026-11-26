# PRD 0005 — Find the Latest Setlist by Artist name, with disambiguation

Status: Approved
Slice: 4
Depends on: 0002
Module: src/core/setlistfm

## Problem

Playset can turn a **Setlist** into **Performances** (PRD 0002), but nothing fetches a **Setlist** from setlist.fm yet. A concert-goer who types only an **Artist** name ("Arctic Monkeys", "Genesis", "beyonce") needs Playset to find that **Artist** on setlist.fm, ask them which **Artist** they mean when the name is ambiguous, and then pick the **Latest Setlist**. setlist.fm often lists an announced future **Show** with no songs at the top of an **Artist**'s setlists, so the newest entry is not always usable. A pasted setlist.fm link (PRD 0001 gives the id) also needs that one **Setlist** fetched. Both paths need the setlist.fm API key, request throttling and handling of setlist.fm's rate limit, and none of these exist yet.

## Goal

The core offers two capabilities, with no terminal code and with network, clock, waiting and config directory all injectable:

1. Fetch one **Setlist** by its setlist.fm id.
2. Given an **Artist** name, resolve the **Artist** (choosing automatically only when exactly one result's name is an exact normalised match, otherwise asking an injected chooser) and return that **Artist** together with its **Latest Setlist**.

Both return the **Setlist** in the same setlist.fm Setlist shape that PRD 0002 already accepts, unchanged, so the caller can turn it into **Performances** with PRD 0002. This module does not define a second Setlist shape.

## Non-goals

- **No Spotify.** No **Match**, no **Miss**, no **Setlist Playlist**.
- **No Tape prompting.** Which **Tapes** to keep is decided later; this module only uses PRD 0002 to count **Performances**.
- **No CLI output or prompting.** Choosing an **Artist** is done through the injected chooser; how it is shown belongs to the front-end. Nothing is printed.
- **No caching.** Every run asks setlist.fm again; no search results, **Artist** ids or **Setlists** are stored.
- **No fuzzy matching.** Beyond the normalisation in AC-12 (letter case, accents, whitespace, `&`/`and`), names are not compared loosely. "Arctic Monkey" does not auto-choose "Arctic Monkeys"; the chooser is asked.
- **No re-sorting by date.** The **Artist**'s setlists are used in the order setlist.fm returns them (newest first). A future-dated **Setlist** that already has songs is not skipped.
- **No search beyond 3 pages** of an **Artist**'s setlists, and no paging of **Artist** search results beyond the first page.
- **No reading of setlist links.** Getting the id out of a setlist.fm link is PRD 0001.
- **No changing the Setlist.** The returned **Setlist** is exactly what setlist.fm sent; turning it into **Performances** is the caller's job (PRD 0002).
- **No storing of the API key.** It is only read from the environment or the config file, never written.
- **No backend proxy** for the future web or mobile front-end.

## User stories

- As a concert-goer, I want to type just an **Artist** name and get that **Artist**'s **Latest Setlist**, so that I don't have to look it up on setlist.fm first.
- As a concert-goer, I want to be asked which **Artist** I mean when several share a name, with setlist.fm's short description of each, so that I get the right one.
- As a concert-goer, I want Playset to skip announced **Shows** that have no songs yet, so that my **Setlist Playlist** is built from a **Setlist** that was actually played.
- As a concert-goer, I want a clear message when my setlist.fm API key is missing, so that I know where to get one and where to put it.
- As a concert-goer, I want Playset to wait and retry politely when setlist.fm says "too many requests", so that a busy moment doesn't make the run fail.

## Acceptance criteria

All requests below are made through the injected fetch. "Requests" counts every call to it, including retries.

### API key

- **AC-1** — Given `SETLISTFM_API_KEY` is set to a non-empty value, when the API key is resolved, then that value is used, even if the config file also holds a key.
- **AC-2** — Given `SETLISTFM_API_KEY` is unset or empty and `<configDir>/config.json` holds a non-empty `setlistfmApiKey`, when the API key is resolved, then the config file value is used. Other keys in the same file (for example `spotifyClientId`) are ignored and left alone.
- **AC-3** — Given no key in the environment and none in the config file (file missing, not valid JSON, or `setlistfmApiKey` missing or empty), when a **Setlist** is fetched or an **Artist** is looked up, then a typed "missing API key" error is raised before any request is made. Its user-facing hint names where to get a key (`https://www.setlist.fm/settings/api`), the `SETLISTFM_API_KEY` environment variable and the config file path with the `setlistfmApiKey` key.
- **AC-4** — Given a config directory supplied by the caller, when the key is read, then only `<that dir>/config.json` is read and the user's real `~/.config/playset/` is never touched. With no directory supplied, the default is `~/.config/playset/`.

### Requests, throttling and errors

- **AC-5** — Given a valid key, when any request is sent to setlist.fm, then it goes to `https://api.setlist.fm/rest/1.0/…` with the method `GET` and the headers `x-api-key: <key>`, `Accept: application/json` and `Accept-Language: en`.
- **AC-6** — Given one client used for several requests in a row (for example a search followed by two pages of setlists, or several fetches by id), when they are sent, then each request starts at least 500 ms after the previous one started, measured by the injected clock, with any waiting done through the injected sleep. The first request of a client is not delayed.
- **AC-7** — Given setlist.fm answers HTTP 429 with `Retry-After: <n>` (whole seconds), when a request is made, then Playset waits `n` seconds through the injected sleep and sends the same request again. Given the header is missing or not a whole number of seconds, it waits 1 second.
- **AC-8** — Given setlist.fm answers HTTP 429 to the first request and to each of 3 retries, when a request is made, then exactly 4 requests are sent and a typed rate-limit error is raised. Given a retry succeeds, its result is used as if the first request had succeeded. Retries also respect the spacing in AC-6.
- **AC-9** — Given setlist.fm answers with any other non-2xx status than those given their own meaning in AC-10, AC-15 and AC-20 (for example 401, 403, 500, 503), or the injected fetch fails with a network error, when a request is made, then a typed request error is raised that includes the HTTP status (when there is one), and no retry is made.
- **AC-10** — Given a setlist id, when that **Setlist** is fetched, then exactly one `GET /setlist/{id}` is sent (plus any 429 retries). On HTTP 200 the parsed body is returned unchanged in the setlist.fm Setlist shape PRD 0002 accepts. On HTTP 404 a typed "setlist not found" error is raised that names the id.
- **AC-11** — Given any error raised by this module (missing key, rate limit, request error, not found, cancelled, no Artist, no Setlist), when its message and hint are turned into text, then the API key never appears in it.

### Finding the Artist

- **AC-12** — Given two **Artist** names, when they are compared, then they count as an exact match if they are equal after this normalisation: letter case folded; accents removed (é→e, ö→o, ñ→n); each `&` replaced by ` and `; leading and trailing whitespace removed and every run of whitespace collapsed to one space. Nothing else is changed (punctuation such as `.`, `'`, `!` and a leading "The" are kept).
- **AC-13** — Given an **Artist** name, when the **Artist** is looked up, then the name is trimmed and exactly one `GET /search/artists` is sent with the query parameters `artistName=<name>` (URL-encoded), `sort=relevance` and `p=1`. Only the first page of results is used.
- **AC-14** — Given search results in which exactly one result's name is an exact match (AC-12) for the typed name, when the **Artist** is looked up, then that result is chosen and the chooser is not called, even if other results have similar names.
- **AC-15** — Given a search that returns no **Artists** (HTTP 404, or HTTP 200 with an empty or missing `artist` list), or an **Artist** name that is empty or only whitespace, when the **Artist** is looked up, then a typed "Artist not found" error naming the typed name is raised and the chooser is not called. For an empty or whitespace-only name, no request is made.
- **AC-16** — Given search results with no exact match, or with two or more exact matches, when the **Artist** is looked up, then the injected chooser is called once with the first 10 results (all of them if fewer) in setlist.fm's order, each with its name, its mbid and its disambiguation text (absent when setlist.fm gives none or an empty one). The **Artist** the chooser picks is used.
- **AC-17** — Given the chooser cancels instead of picking, when the **Artist** is looked up, then a typed "cancelled" error is raised and no further request is made.

### Finding the Latest Setlist

- **AC-18** — Given a chosen **Artist**, when its **Latest Setlist** is looked for, then pages of `GET /artist/{mbid}/setlists?p=N` are requested starting with `p=1`, and within each page the setlists are checked in the order given. The **Latest Setlist** is the first one that, turned into **Performances** by PRD 0002, has at least one **Performance**. Setlists with no **Performances** are skipped. This includes announced future **Shows** with no **Sets**, and setlists whose only songs are snippets, medleys or songs with no name. A setlist whose only **Performance** is a **Tape** counts as having one.
- **AC-19** — Given the **Latest Setlist** is found on page N, when the search finishes, then no page after N is requested. Given page N's `page × itemsPerPage` is equal to or greater than its `total`, or page N has no setlists, then page N+1 is not requested. At most pages 1, 2 and 3 are ever requested.
- **AC-20** — Given no **Setlist** with at least one **Performance** within the pages requested under AC-19 (including when setlist.fm answers the first page with HTTP 404 because the **Artist** has no setlists), when the **Latest Setlist** is looked for, then a typed "no Setlist" error is raised that names the **Artist**.
- **AC-21** — Given an **Artist** name and a chooser, when the single entry point for the caller is used, then it returns both the chosen **Artist** (name, mbid and disambiguation text) and its **Latest Setlist** in the unchanged setlist.fm Setlist shape. The **Artist** lookup (AC-13 to AC-17) runs first, then the **Latest Setlist** search (AC-18 to AC-20). Any error from either step is passed to the caller unchanged.

## Examples

Unless stated otherwise: key `sfm-test-key-0f3c9a`, clock starting at `1795716000000` ms, config dir `/tmp/playset-test-abc/`.

### API key (AC-1 to AC-4)

| `SETLISTFM_API_KEY` | `/tmp/playset-test-abc/config.json` | Result |
|---|---|---|
| `sfm-env-key-111` | `{"setlistfmApiKey":"sfm-file-key-222"}` | `sfm-env-key-111` (AC-1) |
| unset | `{"setlistfmApiKey":"sfm-file-key-222","spotifyClientId":"3f9a0c2e7b4d4e1f8a6b5c4d3e2f1a0b"}` | `sfm-file-key-222` (AC-2) |
| `""` | `{"setlistfmApiKey":"sfm-file-key-222"}` | `sfm-file-key-222` (AC-2) |
| unset | file missing | missing-key error, 0 requests (AC-3) |
| unset | `{"spotifyClientId":"3f9a0c2e7b4d4e1f8a6b5c4d3e2f1a0b"}` | missing-key error (AC-3) |
| unset | `{"setlistfmApiKey":""}` | missing-key error (AC-3) |
| unset | `{not json` | missing-key error (AC-3) |

Example hint for AC-3 (the wording may differ, but all three facts must be present):

```
setlist.fm API key not found.
Get a free key at https://www.setlist.fm/settings/api, then set SETLISTFM_API_KEY,
or add {"setlistfmApiKey": "<your key>"} to /tmp/playset-test-abc/config.json.
```

### Request headers (AC-5)

```
GET https://api.setlist.fm/rest/1.0/setlist/63a5e2b7
x-api-key: sfm-test-key-0f3c9a
Accept: application/json
Accept-Language: en
```

### Throttling (AC-6)

Search "Arctic Monkeys", then pages 1 and 2 of its setlists, with the clock only moving through the injected sleep: requests start at `t+0`, `t+500`, `t+1000` ms. If 800 ms passed on the clock between the first and second request, the second is sent without waiting.

### Rate limit (AC-7, AC-8)

Response to `GET /setlist/63a5e2b7`:

```
HTTP/1.1 429 Too Many Requests
Retry-After: 2
Content-Type: application/json

{"code":429,"status":"Too Many Requests","message":"Too Many Requests","timestamp":"2026-11-26T18:00:00.123+0000"}
```

| Responses in order | Sleeps (Retry-After part) | Outcome |
|---|---|---|
| 429 (`Retry-After: 2`), 200 | 2 s | Setlist returned, 2 requests (AC-7) |
| 429 (no `Retry-After`), 200 | 1 s | Setlist returned (AC-7) |
| 429 (`Retry-After: soon`), 200 | 1 s | Setlist returned (AC-7) |
| 429, 429, 429, 429 (all `Retry-After: 1`) | 1 s × 3 | rate-limit error after exactly 4 requests (AC-8) |

### Other failures (AC-9, AC-10, AC-11)

| Request | Response | Outcome |
|---|---|---|
| `GET /setlist/63a5e2b7` | 200 with Fixture A of PRD 0002 | that object, unchanged (AC-10) |
| `GET /setlist/deadbeef` | 404 `{"code":404,"status":"Not Found","message":"not found","timestamp":"2026-11-26T18:00:00.000+0000"}` | setlist-not-found error naming `deadbeef` (AC-10) |
| `GET /setlist/63a5e2b7` | 403 `{"code":403,"status":"Forbidden","message":"Forbidden"}` | request error containing `403`, 1 request (AC-9) |
| `GET /setlist/63a5e2b7` | 503, empty body | request error containing `503`, 1 request (AC-9) |
| `GET /setlist/63a5e2b7` | injected fetch rejects (`ECONNRESET`) | request error, 1 request (AC-9) |

For every error above, and for the missing-key, cancelled, Artist-not-found and no-Setlist errors below, the text never contains `sfm-test-key-0f3c9a` (AC-11).

### Normalisation (AC-12)

| Typed | setlist.fm name | Exact match? |
|---|---|---|
| `arctic monkeys` | `Arctic Monkeys` | yes |
| `  Arctic   Monkeys ` | `Arctic Monkeys` | yes |
| `beyonce` | `Beyoncé` | yes |
| `motorhead` | `Motörhead` | yes |
| `Simon and Garfunkel` | `Simon & Garfunkel` | yes |
| `Simon&Garfunkel` | `Simon & Garfunkel` | yes |
| `Arctic Monkey` | `Arctic Monkeys` | no |
| `Beatles` | `The Beatles` | no |
| `AC DC` | `AC/DC` | no |
| `Guns N Roses` | `Guns N' Roses` | no |

### Artist search (AC-13 to AC-17)

Request for `Simon & Garfunkel` (AC-13); tests compare the parsed query:

```
GET https://api.setlist.fm/rest/1.0/search/artists?artistName=Simon%20%26%20Garfunkel&sort=relevance&p=1
```

Search "Arctic Monkeys" → auto-choose `ada7a83c-…`, chooser not called (AC-14):

```json
{
  "type": "artists",
  "itemsPerPage": 30,
  "page": 1,
  "total": 3,
  "artist": [
    { "mbid": "ada7a83c-e3e1-40f1-93f9-3e73dbfd2c7c", "name": "Arctic Monkeys", "sortName": "Arctic Monkeys",
      "disambiguation": "", "url": "https://www.setlist.fm/setlists/arctic-monkeys-63d6a6b7.html" },
    { "mbid": "5b0c1a4e-2f0e-4f1a-9a77-1d2b3c4d5e6f", "name": "Arctic Monkeys Tribute", "sortName": "Arctic Monkeys Tribute",
      "url": "https://www.setlist.fm/setlists/arctic-monkeys-tribute-2bd6b4a2.html" },
    { "mbid": "7c1e2d3f-4a5b-4c6d-8e9f-0a1b2c3d4e5f", "name": "The Arctic Monkeys Experience", "sortName": "Arctic Monkeys Experience, The",
      "url": "https://www.setlist.fm/setlists/the-arctic-monkeys-experience-1bd6b4a6.html" }
  ]
}
```

Search "Genesis" → two exact matches, chooser called with these 3 candidates in this order (AC-16):

```json
{
  "type": "artists",
  "itemsPerPage": 30,
  "page": 1,
  "total": 3,
  "artist": [
    { "mbid": "8e3fcd7d-bda1-4ca0-b987-b8528d2ee74e", "name": "Genesis", "sortName": "Genesis",
      "disambiguation": "English rock band", "url": "https://www.setlist.fm/setlists/genesis-5bd6b3b4.html" },
    { "mbid": "2f4b1c6e-7a8d-4e9f-b0a1-c2d3e4f5a6b7", "name": "Genesis", "sortName": "Genesis",
      "disambiguation": "US psychedelic rock band", "url": "https://www.setlist.fm/setlists/genesis-3bd6c0a8.html" },
    { "mbid": "4a5b6c7d-8e9f-4a0b-9c1d-2e3f4a5b6c7d", "name": "Genesis Owusu", "sortName": "Owusu, Genesis",
      "url": "https://www.setlist.fm/setlists/genesis-owusu-4bd2a3fe.html" }
  ]
}
```

| Candidate | Name | mbid | Disambiguation |
|---|---|---|---|
| 1 | Genesis | `8e3fcd7d-…` | English rock band |
| 2 | Genesis | `2f4b1c6e-…` | US psychedelic rock band |
| 3 | Genesis Owusu | `4a5b6c7d-…` | (none) |

The chooser picks candidate 1 → the **Artist** is Genesis `8e3fcd7d-bda1-4ca0-b987-b8528d2ee74e`. The chooser cancels → cancelled error, and no `/artist/…/setlists` request is made (AC-17).

Search "Bon" → 14 results, none named exactly "Bon" (Bon Jovi, Bon Iver, Bon Entendeur, …) → chooser called once with the first 10, in setlist.fm's order (AC-16).

Search "Xyzzq Nonexistent" → setlist.fm answers 404 `{"code":404,"status":"Not Found","message":"not found"}` → Artist-not-found error naming "Xyzzq Nonexistent", chooser not called (AC-15). The same happens for HTTP 200 with `{"type":"artists","itemsPerPage":30,"page":1,"total":0,"artist":[]}`. Typed name `"   "` → Artist-not-found error, 0 requests (AC-15).

### Latest Setlist (AC-18 to AC-20)

Page 1 of `GET /artist/ada7a83c-e3e1-40f1-93f9-3e73dbfd2c7c/setlists?p=1`. The first entry is an announced future **Show** with no songs, and the second has only a snippet:

```json
{
  "type": "setlists",
  "itemsPerPage": 20,
  "page": 1,
  "total": 1047,
  "setlist": [
    {
      "id": "1bd2f5a8",
      "eventDate": "14-03-2027",
      "artist": { "mbid": "ada7a83c-e3e1-40f1-93f9-3e73dbfd2c7c", "name": "Arctic Monkeys" },
      "venue": { "id": "4bd6e3a2", "name": "Mercedes-Benz Arena",
        "city": { "id": "2950159", "name": "Berlin", "country": { "code": "DE", "name": "Germany" } } },
      "url": "https://www.setlist.fm/setlist/arctic-monkeys/2027/mercedes-benz-arena-berlin-germany-1bd2f5a8.html",
      "sets": { "set": [] }
    },
    {
      "id": "3bd2e1c4",
      "eventDate": "30-08-2025",
      "artist": { "mbid": "ada7a83c-e3e1-40f1-93f9-3e73dbfd2c7c", "name": "Arctic Monkeys" },
      "venue": { "id": "2bd6c8b6", "name": "Main Stage",
        "city": { "id": "2643743", "name": "London", "country": { "code": "GB", "name": "United Kingdom" } } },
      "url": "https://www.setlist.fm/setlist/arctic-monkeys/2025/main-stage-london-england-3bd2e1c4.html",
      "sets": { "set": [ { "song": [ { "name": "Hey Jude", "info": "snippet" } ] } ] }
    },
    {
      "id": "63a5e2b7",
      "eventDate": "23-08-2025",
      "artist": { "mbid": "ada7a83c-e3e1-40f1-93f9-3e73dbfd2c7c", "name": "Arctic Monkeys" },
      "venue": { "id": "6bd6ca6e", "name": "Ziggo Dome",
        "city": { "id": "2759794", "name": "Amsterdam", "country": { "code": "NL", "name": "Netherlands" } } },
      "url": "https://www.setlist.fm/setlist/arctic-monkeys/2025/ziggo-dome-amsterdam-netherlands-63a5e2b7.html",
      "sets": { "set": [ { "song": [ { "name": "Sculptures of Anything Goes" }, { "name": "Brianstorm" } ] } ] }
    }
  ]
}
```

→ `1bd2f5a8` is skipped (0 Performances), `3bd2e1c4` is skipped (snippet only, 0 Performances), and `63a5e2b7` is the **Latest Setlist** (AC-18). Only page 1 is requested (AC-19).

Single entry point with "Arctic Monkeys" (AC-21) returns:

| Field | Value |
|---|---|
| Artist name | Arctic Monkeys |
| Artist mbid | ada7a83c-e3e1-40f1-93f9-3e73dbfd2c7c |
| Artist disambiguation | (none) |
| Setlist | the `63a5e2b7` object above, unchanged |

Requests in order: `/search/artists?…`, `/artist/ada7a83c-…/setlists?p=1`, 500 ms apart (AC-6).

Other paging cases:

| Pages from setlist.fm | Requests to `/artist/{mbid}/setlists` | Outcome |
|---|---|---|
| p=1: `total: 1047`, 20 setlists all with `"sets":{"set":[]}`; p=2: first setlist has `{"song":[{"name":"Intro","tape":true}]}` | p=1, p=2 | the Tape-only setlist on page 2 (AC-18, AC-19) |
| p=1, p=2, p=3: `total: 1047`, all 60 setlists empty | p=1, p=2, p=3 only | no-Setlist error naming "Arctic Monkeys" (AC-19, AC-20) |
| p=1: `itemsPerPage: 20`, `total: 2`, both setlists empty | p=1 only (1 × 20 ≥ 2) | no-Setlist error (AC-19, AC-20) |
| p=1: `itemsPerPage: 20`, `total: 25`, all empty; p=2: `"setlist": []` | p=1, p=2 | no-Setlist error (AC-19, AC-20) |
| p=1: HTTP 404 `{"code":404,"status":"Not Found","message":"not found"}` | p=1 | no-Setlist error naming the Artist (AC-20) |

## Glossary terms used

- **Setlist** — as defined in GLOSSARY.md.
- **Show** — as defined in GLOSSARY.md.
- **Artist** — as defined in GLOSSARY.md.
- **Set** — as defined in GLOSSARY.md.
- **Performance** — as defined in GLOSSARY.md.
- **Tape** — as defined in GLOSSARY.md.
- **Latest Setlist** — as defined in GLOSSARY.md.
- **Setlist Playlist** — as defined in GLOSSARY.md (mentioned only as out of scope).
- **Match** — as defined in GLOSSARY.md (mentioned only as out of scope).
- **Miss** — as defined in GLOSSARY.md (mentioned only as out of scope).

"Snippet" and "medley" are used as in PRD 0002 and are not glossary terms. "mbid" (MusicBrainz id), "disambiguation", "API key", "page", "itemsPerPage" and "total" are setlist.fm API terms, not Playset domain terms. "Chooser" is the plain-English name for the injected interactive hook that asks the user to pick an **Artist**.

## Shared-file requests

None.

## Open questions

(none)
