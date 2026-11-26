# PRD 0003 — Find the Match for one Performance

Status: Approved
Slice: 3
Depends on: none
Module: src/core/matching

## Problem

A **Setlist** lists song titles and the **Artist** who played them, but a **Setlist Playlist** needs Spotify tracks. Spotify search is fuzzy. A naive "take the first result" approach picks remasters by the wrong band, karaoke versions, live bootlegs when a studio recording exists, or a different song with a similar title. Nothing in Playset yet turns one **Performance** into a trustworthy **Match**, or decides honestly that it is a **Miss**.

## Goal

Given one **Performance** (title, Artist and, for a **Cover**, the **Original Artist**), Playset searches Spotify and returns either a **Match** that has been strictly verified against the Performance, preferring the Artist's studio recording, or a **Miss** that lists every search it tried.

## Non-goals

- Creating the Setlist Playlist or adding tracks to it (Slice 6).
- Spotify login, getting or refreshing an access token (Slice 5). This feature only uses an access token that the caller supplies.
- Matching a whole Setlist at once: no batching, no de-duplication across Performances, no progress reporting. A song played twice is matched twice by the caller.
- Deciding which **Tapes** are included, dropping snippets or teasers, or splitting medleys (Slice 2 / Slice 7). The input is a single Performance that is already chosen.
- Fuzzy or "close enough" matching: no edit distance, no partial title matches, no transliteration between scripts (for example Cyrillic to Latin).
- Removing a leading "The" from names, or treating "feat." guests as the Artist. A result verifies only when one of its listed artists is the target artist.
- Market or region availability filtering, explicit/clean preference, popularity ranking, or picking by release date. Order among equally good results is Spotify's order.
- Asking the user to pick between results. Matching is fully automatic. The preview and confirmation step belongs to Slice 7.
- Caching search results between runs.
- Throttling beyond honouring `Retry-After` on HTTP 429.

## User stories

- As a concert-goer, I want each Performance matched to the Artist's studio recording so that I learn the songs as released.
- As a concert-goer, I want a live recording used only when no studio recording exists so that rare songs still make it into the Setlist Playlist.
- As a concert-goer, I want a Cover the Artist never recorded to fall back to the Original Artist's recording so that I still know the song.
- As a concert-goer, I never want a wrong song in my playlist. A Miss I can see is better than a wrong Match I can't.
- As a concert-goer, I want to see which searches were tried for each Miss so that I can look the song up by hand.

## Acceptance criteria

Some terms used below:
- **Target artist**: the Artist, or the Original Artist during the Cover fallback.
- **Normalising** a name means case-folding, removing accents and diacritics, turning `&` into `and`, deleting apostrophes (`'` and `’`), replacing every other punctuation character with a space, collapsing runs of whitespace into a single space, and trimming.
- **Normalising** a title means first removing recognised version suffixes from the end (AC-3), then normalising it like a name.
- A search result **verifies** when its normalised track name equals the normalised Performance title AND at least one of its artists has a normalised name equal to the normalised target artist.

- **AC-1** — Given a Performance with a title and an Artist, when it is matched, then the first search sent to Spotify is the filtered query `track:"<title>" artist:"<Artist>"`, using the Performance title and Artist exactly as given, and asks for 10 results.
- **AC-2** — Given a search result whose track name and artist verify against the Performance, when it is matched, then the outcome is a Match carrying that track's Spotify URI, track id, track name, the names of all its artists in Spotify's order, its album name, and whether it is live.
- **AC-3** — Given a result whose track name differs from the Performance title only by one or more version suffixes at the end, when it is matched, then it verifies. The recognised suffixes, matched case-insensitively and removed repeatedly from the end, are:
  - remaster markers: ` - Remastered`, ` - Remastered <year>`, ` - <year> Remaster`, ` - <year> Remastered`, ` - Remaster`, `(Remastered)`, `(Remastered <year>)`, `(<year> Remaster)`, `(<year> Remastered)`, `[Remastered]`, `[<year> Remaster]`;
  - version markers: ` - Single Version`, ` - Radio Edit`, `(Single Version)`, `(Radio Edit)`;
  - guest markers: `(feat. …)`, `[feat. …]`, `(ft. …)`, ` - feat. …`;
  - live markers: ` - Live`, ` - Live at …`, ` - Live from …`, ` - Live in …`, `(Live)`, `(Live at …)`, `(Live from …)`, `(Live in …)`, `[Live]`.
- **AC-4** — Given a Performance title or Artist and a result that differ only in letter case, accents or diacritics, `&` versus `and`, punctuation, or spacing, when it is matched, then the result verifies.
- **AC-5** — Given a result whose normalised title equals the Performance title but none of whose artists normalise to the target artist, when it is matched, then that result does not verify and is never returned as the Match. A result that lists the target artist among several artists does verify.
- **AC-6** — Given several verifying results in one search, at least one of them not live, when it is matched, then the Match is the first non-live verifying result in Spotify's order, even if a live one comes earlier. Its live flag is false.
- **AC-7** — Given verifying results in one search that are all live, when it is matched, then the Match is the first of them in Spotify's order, and its live flag is true.
- **AC-8** — A result is live when the whole word "live" (any case) appears in its track name or its album name more often than it appears in the Performance title. Words that only contain those letters, such as "Alive", "Lively", "Oliver" or "Delivery", do not count. So for the Performance "Live Forever", a track named "Live Forever" on the album "Definitely Maybe" is not live. A track named "Live Forever - Live at Knebworth" is live.
- **AC-9** — Given the filtered query for a target artist returns no verifying result (including no results at all), when it is matched, then exactly one plain-text retry `<title> <target artist>` is sent for that target artist, asking for 10 results, and its results are judged by the same rules (AC-2 to AC-8). Given the filtered query returns any verifying result, live or not, then no plain-text retry is sent for that target artist.
- **AC-10** — Given a Cover whose Artist searches (filtered and plain-text retry) produce no verifying result, when it is matched, then the same two searches are tried in the same order with the Original Artist as the target artist. A verifying result there becomes the Match.
- **AC-11** — Preference across target artists is: Artist studio > Artist live > Original Artist studio > Original Artist live. Given a Cover whose Artist searches produce any verifying result, including a live-only one, when it is matched, then that result is the Match and no search for the Original Artist is sent.
- **AC-12** — Given a Performance that is not a Cover, when no Artist search produces a verifying result, then the outcome is a Miss after exactly two searches, and no other artist is searched.
- **AC-13** — Given no search produces a verifying result, when it is matched, then the outcome is a Miss that carries the Performance's title, Artist and (if any) Original Artist, plus the list of every query sent, in the order sent. An unverified result is never returned as a Match, however high Spotify ranks it.
- **AC-14** — Given a Performance whose Original Artist is missing, empty or blank, or normalises to the same name as the Artist, when it is matched, then it is treated as not a Cover for searching: there is no Original Artist fallback, and no search is sent twice.
- **AC-15** — Given a Performance whose title is empty or only whitespace, when it is matched, then the outcome is a Miss with an empty list of queries, and no search is sent.
- **AC-16** — Given a Performance title or Artist that contains double-quote characters (`"`, `“`, `”`), when the filtered query is built, then those characters are removed from the values inside the quotes. The plain-text retry also leaves them out.
- **AC-17** — Given a Performance carrying extra information besides title, Artist and Original Artist (for example its Set name, an Encore flag or a Tape flag), when it is matched, then the extra information is ignored and the outcome is the same as without it.
- **AC-18** — Given the Spotify search fails (any error other than a handled 429), when a Performance is matched, then matching ends with that error. The failure is not reported as a Miss.
- **AC-19** — Given the Spotify search adapter and an access token from the caller, when it runs a query, then it sends one `GET` request to Spotify's search endpoint with `type=track`, `limit=10`, the query URL-encoded in `q`, and the header `Authorization: Bearer <token>`. It returns the track results in Spotify's order (none if `tracks.items` is empty).
- **AC-20** — Given Spotify answers a search with HTTP 429, when the adapter runs the query, then it waits the number of seconds in the `Retry-After` header (1 second if the header is missing or unreadable) and sends the same request again. After 3 such retries that are still answered with 429, it fails with an error that says Spotify rate-limited the search.
- **AC-21** — Given Spotify answers a search with any other non-success status (for example 401 or 500), when the adapter runs the query, then it fails right away with an error that includes the HTTP status, and does not retry.

## Examples

The fake Spotify search payloads below use the shape of `GET /v1/search?type=track` responses, trimmed to the fields that matter:

```json
{ "tracks": { "items": [
  { "uri": "spotify:track:<id>", "id": "<id>", "name": "<track name>",
    "artists": [ { "name": "<artist>" } ],
    "album": { "name": "<album name>" } }
] } }
```

### E1 — Remaster suffix (AC-1, AC-2, AC-3)

Performance: `{ "title": "Here Comes the Sun", "artist": "The Beatles" }`

Query 1: `track:"Here Comes the Sun" artist:"The Beatles"` (10 results requested)

```json
{ "tracks": { "items": [
  { "uri": "spotify:track:6dGnYIeXmHdcikdzNNDMm2", "id": "6dGnYIeXmHdcikdzNNDMm2",
    "name": "Here Comes The Sun - Remastered 2009",
    "artists": [ { "name": "The Beatles" } ],
    "album": { "name": "Abbey Road (Remastered)" } }
] } }
```

Outcome: Match `{ uri: "spotify:track:6dGnYIeXmHdcikdzNNDMm2", id: "6dGnYIeXmHdcikdzNNDMm2", name: "Here Comes The Sun - Remastered 2009", artists: ["The Beatles"], album: "Abbey Road (Remastered)", live: false }`. One query sent.

More suffix cases that all verify against the title "Wish You Were Here" by Pink Floyd: `"Wish You Were Here - 2011 Remaster"`, `"Wish You Were Here (2011 Remaster)"`, `"Wish You Were Here - Remaster"`, `"Wish You Were Here - Single Version"`, `"Wish You Were Here - Radio Edit"`, `"Wish You Were Here - Remastered 2011 - Live"` (two suffixes stacked). `"Wish You Were Here (Acoustic)"` does **not** verify, because "(Acoustic)" is not a recognised suffix.

### E2 — Studio preferred over an earlier live result (AC-6, AC-8)

Performance: `{ "title": "Mr. Brightside", "artist": "The Killers" }`

Query 1: `track:"Mr. Brightside" artist:"The Killers"`

```json
{ "tracks": { "items": [
  { "uri": "spotify:track:1aaaaaaaaaaaaaaaaaaaaa", "id": "1aaaaaaaaaaaaaaaaaaaaa",
    "name": "Mr. Brightside - Live at Wembley Stadium",
    "artists": [ { "name": "The Killers" } ],
    "album": { "name": "Live From The Royal Albert Hall" } },
  { "uri": "spotify:track:003vvx7Niy0yvhvHt4a68B", "id": "003vvx7Niy0yvhvHt4a68B",
    "name": "Mr. Brightside",
    "artists": [ { "name": "The Killers" } ],
    "album": { "name": "Hot Fuss" } }
] } }
```

Outcome: Match on `003vvx7Niy0yvhvHt4a68B` ("Hot Fuss"), `live: false`.

### E3 — Live-only (AC-7, AC-9)

Performance: `{ "title": "Crown of Thorns", "artist": "Pearl Jam" }`

Query 1: `track:"Crown of Thorns" artist:"Pearl Jam"`

```json
{ "tracks": { "items": [
  { "uri": "spotify:track:2bbbbbbbbbbbbbbbbbbbbb", "id": "2bbbbbbbbbbbbbbbbbbbbb",
    "name": "Crown of Thorns",
    "artists": [ { "name": "Pearl Jam" } ],
    "album": { "name": "Live on Two Legs" } },
  { "uri": "spotify:track:3ccccccccccccccccccccc", "id": "3ccccccccccccccccccccc",
    "name": "Crown Of Thorns - Live",
    "artists": [ { "name": "Pearl Jam" } ],
    "album": { "name": "Let's Play Two" } }
] } }
```

Outcome: Match on `2bbbbbbbbbbbbbbbbbbbbb`, `live: true` (album "Live on Two Legs"). No plain-text retry is sent, because the filtered query produced a verifying result.

### E4 — "Alive" false positive and a title that contains "live" (AC-8)

Performance: `{ "title": "Alive", "artist": "Pearl Jam" }`

```json
{ "tracks": { "items": [
  { "uri": "spotify:track:4ddddddddddddddddddddd", "id": "4ddddddddddddddddddddd",
    "name": "Alive", "artists": [ { "name": "Pearl Jam" } ],
    "album": { "name": "Ten" } }
] } }
```

Outcome: Match on `4ddddddddddddddddddddd`, `live: false`. "Alive" is not the whole word "live".

Also: Daft Punk track `"Robot Rock / Oh Yeah"` on album `"Alive 2007"` has `live: false`. A track on album `"Lively Up Yourself"` has `live: false`.

Performance: `{ "title": "Live Forever", "artist": "Oasis" }`

```json
{ "tracks": { "items": [
  { "uri": "spotify:track:5eeeeeeeeeeeeeeeeeeeee", "id": "5eeeeeeeeeeeeeeeeeeeee",
    "name": "Live Forever - Live at Knebworth Park",
    "artists": [ { "name": "Oasis" } ], "album": { "name": "Knebworth 1996" } },
  { "uri": "spotify:track:6fffffffffffffffffffff", "id": "6fffffffffffffffffffff",
    "name": "Live Forever - Remastered",
    "artists": [ { "name": "Oasis" } ], "album": { "name": "Definitely Maybe (Remastered)" } }
] } }
```

Outcome: Match on `6fffffffffffffffffffff`, `live: false`. The first result has "live" twice in its track name and only once in the title, so it is live. The second result has it once, so it is not live.

Performance `{ "title": "Live and Let Die", "artist": "Wings" }` against a track `"Live And Let Die"` on album `"Live And Let Die"` gives `live: false`.

### E5 — Accents, `&`, punctuation and guest suffix (AC-3, AC-4, AC-5)

Performance: `{ "title": "Deja Vu", "artist": "Beyonce" }`

```json
{ "tracks": { "items": [
  { "uri": "spotify:track:7ggggggggggggggggggggg", "id": "7ggggggggggggggggggggg",
    "name": "Déjà Vu (feat. Jay-Z)",
    "artists": [ { "name": "Beyoncé" }, { "name": "JAY-Z" } ],
    "album": { "name": "B'Day Deluxe Edition" } }
] } }
```

Outcome: Match on `7ggggggggggggggggggggg`, `artists: ["Beyoncé", "JAY-Z"]`, `live: false`.

More pairs that verify:
- Performance artist `"Simon and Garfunkel"`, result artist `"Simon & Garfunkel"`.
- Performance `"Don't Stop Me Now"` (straight apostrophe), result `"Don’t Stop Me Now - Remastered 2011"` (curly apostrophe).
- Performance artist `"Sigur Ros"`, result artist `"Sigur Rós"`. Performance title `"Hoppipolla"`, result `"Hoppípolla"`.
- Performance artist `"AC/DC"`, result artist `"AC/DC"`. Performance title `"T.N.T."`, result `"T.N.T."`.
- Performance title `"Hello,  Goodbye"` (double space), result `"Hello, Goodbye"`.

A pair that does **not** verify: Performance artist `"Beatles"`, result artist `"The Beatles"` (no stripping of "The").

### E6 — Plain-text retry after a wrong-artist filtered result (AC-5, AC-9)

Performance: `{ "title": "Yesterday", "artist": "The Beatles" }`

Query 1: `track:"Yesterday" artist:"The Beatles"`

```json
{ "tracks": { "items": [
  { "uri": "spotify:track:8hhhhhhhhhhhhhhhhhhhhh", "id": "8hhhhhhhhhhhhhhhhhhhhh",
    "name": "Yesterday", "artists": [ { "name": "Boyz II Men" } ],
    "album": { "name": "II" } }
] } }
```

Query 2: `Yesterday The Beatles`

```json
{ "tracks": { "items": [
  { "uri": "spotify:track:3BQHpFgAp4l80e1XslIjNI", "id": "3BQHpFgAp4l80e1XslIjNI",
    "name": "Yesterday - Remastered 2009", "artists": [ { "name": "The Beatles" } ],
    "album": { "name": "Help! (Remastered)" } }
] } }
```

Outcome: Match on `3BQHpFgAp4l80e1XslIjNI`, `live: false`. The Boyz II Men result never verifies.

### E7 — Cover fallback to the Original Artist (AC-10, AC-13)

Performance (Cover): `{ "title": "Atlantic City", "artist": "The Hold Steady", "originalArtist": "Bruce Springsteen" }`

| # | Query sent | Fake results | Verifies? |
|---|------------|--------------|-----------|
| 1 | `track:"Atlantic City" artist:"The Hold Steady"` | `"Atlantic City"` by The Band, album "Jericho" | no (artist) |
| 2 | `Atlantic City The Hold Steady` | `{ "tracks": { "items": [] } }` | — |
| 3 | `track:"Atlantic City" artist:"Bruce Springsteen"` | `"Atlantic City"` by Bruce Springsteen, album "Nebraska", id `9iiiiiiiiiiiiiiiiiiiii` | yes |

Outcome: Match on `9iiiiiiiiiiiiiiiiiiiii`, `artists: ["Bruce Springsteen"]`, album "Nebraska", `live: false`. No 4th query.

### E8 — Artist live beats Original Artist studio (AC-11)

Performance (Cover): `{ "title": "Wonderwall", "artist": "Ryan Adams", "originalArtist": "Oasis" }`

Query 1: `track:"Wonderwall" artist:"Ryan Adams"`

```json
{ "tracks": { "items": [
  { "uri": "spotify:track:0jjjjjjjjjjjjjjjjjjjjj", "id": "0jjjjjjjjjjjjjjjjjjjjj",
    "name": "Wonderwall - Live", "artists": [ { "name": "Ryan Adams" } ],
    "album": { "name": "Live at Carnegie Hall" } }
] } }
```

Outcome: Match on `0jjjjjjjjjjjjjjjjjjjjj`, `live: true`. Only one query is sent, so Oasis is never searched.

### E9 — Total Miss, not a Cover (AC-12, AC-13)

Performance: `{ "title": "Untitled New Song", "artist": "Muse" }`

| # | Query sent | Fake results |
|---|------------|--------------|
| 1 | `track:"Untitled New Song" artist:"Muse"` | `[]` |
| 2 | `Untitled New Song Muse` | `"Uprising"` by Muse; `"New Born"` by Muse |

Outcome: Miss `{ title: "Untitled New Song", artist: "Muse", queries: ["track:\"Untitled New Song\" artist:\"Muse\"", "Untitled New Song Muse"] }`.

### E10 — Total Miss for a Cover (AC-10, AC-13)

Performance: `{ "title": "Space Oddity", "artist": "Seu Jorge", "originalArtist": "David Bowie" }`. Every search returns only results by other artists, such as `"Space Oddity"` by Chris Hadfield.

Outcome: Miss with queries, in order:
1. `track:"Space Oddity" artist:"Seu Jorge"`
2. `Space Oddity Seu Jorge`
3. `track:"Space Oddity" artist:"David Bowie"`
4. `Space Oddity David Bowie`

### E11 — Original Artist missing, blank or same as the Artist (AC-14)

- `{ "title": "Hurt", "artist": "Nine Inch Nails", "originalArtist": "" }`, no verifying results: Miss with 2 queries.
- `{ "title": "Hurt", "artist": "Nine Inch Nails", "originalArtist": "nine inch nails" }`, no verifying results: Miss with 2 queries, none repeated.

### E12 — Empty title (AC-15)

`{ "title": "   ", "artist": "Radiohead" }`: Miss `{ title: "   ", artist: "Radiohead", queries: [] }`. The fake search records zero calls.

### E13 — Double quotes in a title (AC-16)

Performance: `{ "title": "The \"Fabulous\" Song", "artist": "Weezer" }`
- Filtered query: `track:"The Fabulous Song" artist:"Weezer"`
- Plain-text retry: `The Fabulous Song Weezer`

### E14 — Extra Performance information is ignored (AC-17)

`{ "title": "Paranoid Android", "artist": "Radiohead", "set": "Encore 1", "encore": true, "tape": false }` gives the same queries and the same outcome as `{ "title": "Paranoid Android", "artist": "Radiohead" }`.

### E15 — Search failure is an error, not a Miss (AC-18)

The fake search throws "network unreachable" on query 1 for `{ "title": "Creep", "artist": "Radiohead" }`. Matching fails with that error. No Miss is returned and no further query is sent.

### E16 — Adapter request shape (AC-19)

Query `track:"Mr. Brightside" artist:"The Killers"` with token `BQD-test-token` sends:

```
GET https://api.spotify.com/v1/search?q=track%3A%22Mr.%20Brightside%22%20artist%3A%22The%20Killers%22&type=track&limit=10
Authorization: Bearer BQD-test-token
```

(Parameter order and the choice of `%20` or `+` for spaces may differ. The decoded `q`, `type` and `limit` values must be exactly these.) A 200 response with `{ "tracks": { "items": [] } }` gives no results.

### E17 — Rate limiting (AC-20)

| Response sequence from fake fetch | Expected behaviour |
|---|---|
| 429 `Retry-After: 2`, then 200 with one item | waits 2 s, then returns that one result (2 requests total) |
| 429 with no `Retry-After`, then 200 | waits 1 s, then returns results |
| 429 `Retry-After: abc`, then 200 | waits 1 s, then returns results |
| 429, 429, 429, 429 (all `Retry-After: 1`) | 4 requests, then fails with a rate-limit error |

(Tests use a fake clock or sleep, so no real waiting happens.)

### E18 — Other HTTP failures (AC-21)

| Response | Expected behaviour |
|---|---|
| 401 `{ "error": { "status": 401, "message": "The access token expired" } }` | fails with an error mentioning 401; 1 request only |
| 500 | fails with an error mentioning 500; 1 request only |

## Glossary terms used

- **Performance**: as defined in GLOSSARY.md. Here, the single slot being matched.
- **Artist**: as defined in GLOSSARY.md.
- **Cover**: as defined in GLOSSARY.md.
- **Original Artist**: as defined in GLOSSARY.md.
- **Match**: as defined in GLOSSARY.md.
- **Miss**: as defined in GLOSSARY.md.
- **Setlist**: as defined in GLOSSARY.md.
- **Setlist Playlist**: as defined in GLOSSARY.md.
- **Set**: as defined in GLOSSARY.md.
- **Encore**: as defined in GLOSSARY.md.
- **Tape**: as defined in GLOSSARY.md.

## Open questions

(none)
