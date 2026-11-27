# PRD 0012 — Split the run into stateless steps

Status: Approved
Slice: 12
Depends on: none
Module: src/core/run (also src/core/setlistfm for the Artist list and the Setlist page)

## Problem

Today the core offers one whole run. It goes from a setlist.fm link or **Artist** name to a **Setlist Playlist**, and it asks its questions in the middle of the run through the front-end's callbacks: choose an Artist, keep this **Tape**, use the newest complete **Setlist**, confirm. A web front-end serves stateless HTTP requests and keeps no run in flight between them (ADR 0001). It needs each part of the run as a separate call that takes everything as input and returns plain data. Two parts the web needs don't exist at all:

- a list of Artist candidates without a chooser;
- one page of an Artist's Setlists, with a short summary of each, so a Visitor can pick a **Show** other than the **Latest Setlist**.

## Goal

The core offers the run as stateless steps: find Artists, list Setlists, get a Setlist, find the Latest Setlist, prepare a Setlist, preview Matches and create the Setlist Playlist. No step asks a question or keeps state between calls. `runPlayset` is rebuilt on these steps, and the CLI behaves exactly as before. Every existing test stays green and unchanged.

## Non-goals

- **No web code.** No server, no client, no API contract, no zod schemas. This PRD changes no API contract.
- **No Host Account logic.** No setlist.fm `versionId`, no update of an existing Setlist Playlist, no records of created playlists, no Match cache (Slice 14).
- **No rule changes.** Match rules, Tape rules, medley and snippet rules, Unknown Song and Incomplete Setlist rules, playlist name, description and privacy, and the incomplete offer (PRD 0011) are unchanged.
- **No CLI change.** No new flag, prompt, output line or exit code. The CLI keeps using `runPlayset`.
- **No new way to choose a Setlist in the CLI.** The page-by-page Setlist list is for other front-ends; the CLI still takes a link or an Artist name.
- **No page-size parameter.** setlist.fm's page size is fixed at 20 (verified 2026-11-27). The list step can't ask for more or fewer.
- **No 3-page limit on the Setlist list.** The limit of PRD 0005 AC-19 applies only to the Latest Setlist search. The list step returns any page the caller asks for.
- **No caching between steps.** A step that needs a Setlist is given the Setlist; it never remembers one from an earlier call.
- **No cancellation for every step.** Only previewing Matches takes a cancel signal in this PRD. `runPlayset` keeps its own cancellation exactly as today.
- **No new glossary term.**

## User stories

- As a front-end developer, I want to call each step of the run on its own with plain inputs, so that a stateless web server can serve one step per request.
- As a front-end developer, I want the Artist candidates and the exact-match pick in one result, so that the CLI can skip the question and the web can always show the list.
- As a concert-goer using the web app later, I want to page through an Artist's Setlists with dates, places, song counts and an incomplete marker, so that I can pick the Show I care about.
- As a concert-goer using the CLI, I want nothing to change, so that my habits and scripts keep working.

## The steps (public contract)

The core exports these steps for any front-end. "Services" is the same set of setlist.fm and Spotify services `runPlayset` is given (fakes in tests, the real ones from the core's service wiring). It is the first input of every step that makes a request. A step uses only the services it needs. A fake that supplies only those services is enough for that step.

| Step | Input | Result |
|---|---|---|
| `findArtists` | services, Artist name | Artist candidates (name, mbid, disambiguation) and `autoPick` (one candidate or none) |
| `listSetlists` | services, Artist mbid, page number | `{ setlists: SetlistSummary[], hasMore }` |
| `getSetlist` | services, setlist id | the Setlist, unchanged setlist.fm shape |
| `findLatestSetlist` | services, Artist name, chooser, options (want complete alternative) | the existing lookup: Artist, Latest Setlist, newest complete Setlist or none |
| `prepareSetlist` | Setlist, `{ keepTape }` | Show, kept Performances, not-added list, incomplete status |
| `previewMatches` | services, prepared Setlist, Spotify access token, `{ onProgress, signal }` | Preview rows, Matches, Misses, playlist name |
| `createSetlistPlaylist` | services, Show, Matches, `{ accessToken, public }` | the created Setlist Playlist (share link, track count) |

`SetlistSummary` = setlist id, date (`YYYY-MM-DD`), venue name, city name, song count, incomplete status.

The real services the core builds for any front-end can also search Artists without a chooser and fetch one page of an Artist's setlists. Both use the same setlist.fm client rules as today.

## Acceptance criteria

Terms from earlier PRDs keep their meanings: "noted song", "snippet" (PRD 0002); "chooser", "exact match", "page", "itemsPerPage", "total" (PRD 0005); "kept Performances", "preview", "Show line" (PRD 0007); "medley", "part" (PRD 0008); "Setlist note", "complete Setlist", "newest complete Setlist", "offer question" (PRD 0011). Three more words are used here:

- **Placeholder Setlist**: a Setlist with no **Performance** (an announced future Show, or one whose songs are all snippets or Unknown Songs). This is the same rule the Latest Setlist search uses to skip setlists (PRD 0005 AC-18).
- **Song count**: the number of Performances a Setlist turns into under PRD 0002, 0008, 0010 and 0011. Each medley part counts, and each Tape counts. Snippets and Unknown Songs don't count.
- **Not-added list**: the "Not added" entries of the preview (PRD 0007 AC-27, PRD 0008 AC-12, PRD 0011 AC-14). It holds snippets, left-out Tapes and Unknown Songs in played order.

### Find Artists

- **AC-1** — Given an Artist name, when the find-Artists step runs, then exactly one Artist search is sent with the same request as PRD 0005 AC-13: trimmed name, `sort=relevance`, `p=1`. The result lists the first 10 search results (all of them if fewer) in setlist.fm's order. Each one has its name, its mbid, and its disambiguation text, which is absent when setlist.fm gives none or an empty one. No chooser is involved and no question is asked.
- **AC-2** — Given search results in which exactly one result is an exact match for the typed name (PRD 0005 AC-12, AC-14), when the find-Artists step runs, then `autoPick` is that candidate. Given no exact match, or two or more exact matches, then `autoPick` is absent. The candidate list is the same in both cases.
- **AC-3** — Given a search with no results (HTTP 404, or HTTP 200 with an empty or missing `artist` list), when the find-Artists step runs, then the existing "Artist not found" error naming the typed name is raised (PRD 0005 AC-15). Given an empty or whitespace-only name, the same error is raised and no request is made. Any other setlist.fm error (missing API key, rate limit, request error) is passed on unchanged (PRD 0005 AC-3, AC-8, AC-9).

### List Setlists

- **AC-4** — Given an Artist mbid and a page number n (a whole number, 1 or more), when the list-Setlists step runs, then exactly one `GET /artist/{mbid}/setlists?p=n` is sent, plus any 429 retries (PRD 0005 AC-7, AC-8). The result holds one summary per Setlist on that page, in setlist.fm's order (newest first). Placeholder Setlists are left out, so a page can give fewer than 20 summaries. No other page is requested, and no Setlist is fetched by id.
- **AC-5** — Given a page answered by setlist.fm, when the list-Setlists step runs, then `hasMore` is true exactly when the page's `page × itemsPerPage` is less than its `total`. Placeholders don't change `hasMore`. A page that holds only placeholder Setlists gives `setlists: []`, with `hasMore` from the same rule.
- **AC-6** — Given setlist.fm answers the page with HTTP 404 (past the last page, or an Artist with no setlists), when the list-Setlists step runs, then the result is `setlists: []` and `hasMore: false`, and no error is raised. Any other error (missing API key, rate limit after 4 attempts, other non-2xx status, network error) is passed on unchanged as the existing typed setlist.fm error.
- **AC-7** — Given a page number that is not a whole number of 1 or more (0, -1, 1.5), when the list-Setlists step runs, then a Playset error saying the page is not valid is raised and no request is made.
- **AC-8** — Given a Setlist on the page, when it is summarised, then its summary holds:
  - the setlist id;
  - the date as `YYYY-MM-DD`;
  - the venue name and the city name, as on the Show line;
  - the song count;
  - its incomplete status, decided by the existing Incomplete Setlist rules (PRD 0011 AC-4, AC-5): incomplete yes or no, the Unknown Song count, and, when the Setlist note matches, the matched phrase and the trimmed Setlist note.

  The summary is the same whichever page the Setlist was found on.

### Get a Setlist, find the Latest Setlist

- **AC-9** — Given a setlist id (for example read from a setlist.fm link, PRD 0001), when the get-Setlist step runs, then exactly the request of PRD 0005 AC-10 is sent, and the Setlist is returned unchanged. On HTTP 404 the existing "setlist not found" error naming the id is raised.
- **AC-10** — Given an Artist name, a chooser and the option whether to want a complete alternative, when the find-Latest-Setlist step runs, then it behaves exactly as the existing lookup (PRD 0005 AC-13 to AC-21, PRD 0011 AC-7 to AC-9). It sends the same requests in the same order, asks the chooser in the same cases, raises the same errors, and returns the Artist, the Latest Setlist and the newest complete Setlist or none.

### Prepare a Setlist

- **AC-11** — Given a Setlist and a keep-Tape decision, when the prepare step runs, then it returns:
  - the Show (as on the Show line);
  - the kept Performances: every Performance in played order, unchanged, except the Tapes the decision left out. Encores, Covers, medley parts and repeated songs stay as PRD 0002, 0008 and 0010 describe;
  - the not-added list;
  - the incomplete status (PRD 0011 AC-5).

  It makes no request.
- **AC-12** — Given a Setlist with Tapes, when the prepare step runs, then the keep-Tape decision is asked once per Tape, in played order. A Tape medley part counts as a Tape, as today. Each answer is awaited before the next one is asked. A Tape kept by the decision is a kept Performance. A Tape left out appears in the not-added list as a left-out Tape at its played place. Given no Tapes, the decision is never asked. Given the decision fails (for example the user cancels), the error is passed on unchanged and no further decision is asked.
- **AC-13** — Given a Setlist, when the prepare step builds the not-added list, then it holds the snippets, the left-out Tapes and the Unknown Songs in played order. Each Unknown Song is shown after the preview number of the last kept Performance played before it, or at the start (0) when there is none (PRD 0011 AC-14). The list is the same one `runPlayset` puts in its preview for the same Setlist and the same Tape answers.
- **AC-14** — Given a Setlist whose playlist description would be too long (PRD 0007 AC-11), when the prepare step runs, then the existing description-too-long error is raised before the keep-Tape decision is asked. Given a placeholder Setlist (no Performances), then the prepare step returns no kept Performances, the not-added list and the incomplete status, and never asks the decision.

### Preview Matches

- **AC-15** — Given a prepared Setlist with k kept Performances (k ≥ 1) and an access token, when the preview step runs, then one Match search per kept Performance is made, in played order, with that token. Repeats are searched again. Before each search, progress is reported with `n` (1 to k), `total` = k and the Performance. The result has:
  - one preview row per kept Performance, numbered 1 to k, each with its Match or Miss;
  - the Matches in played order, repeats included;
  - the Misses in played order;
  - the playlist name of the Show (PRD 0006 AC-1).

  The step makes no duplicate-name check and creates nothing.
- **AC-16** — Given a prepared Setlist with no kept Performances, when the preview step runs, then no search is made and no progress is reported. The result has no rows, no Matches, no Misses and the playlist name. Given every kept Performance is a Miss, then the result has no Matches and lists every Miss. No error is raised.
- **AC-17** — Given a cancel signal that is aborted before the step starts, when the preview step runs, then no search is made and no progress is reported, and the step ends with the existing "run cancelled" error. Given the signal aborts while a search is in flight, then the step ends promptly with the same error. No further search is made, no further progress is reported, and a late answer of the in-flight search is ignored. Given no signal, the step runs to the end.

### Create the Setlist Playlist

- **AC-18** — Given a Show, its Matches, an access token and the public choice, when the create step runs, then the Setlist Playlist is created and filled exactly as today (PRD 0006): same name, description, privacy and requests, and the same errors (for example nothing to add, partly created, rate limit). The result gives the share link and the number of tracks added.

### The run on the steps

- **AC-19** — Given any input, options, front-end answers and fake services, when `runPlayset` runs, then the outcome and the front-end calls are the same as before this PRD:
  - the same questions, in the same order, with the same arguments;
  - the same reports (Show, progress, preview);
  - the same service calls, in the same order, with the same arguments;
  - the same errors;
  - the same cancellation (no service or front-end call after an abort; an abort is ignored once the create request is sent).

  It never uses the new Artist-search-without-chooser or Setlist-page services, so services without them still work for a whole run.
- **AC-20** — Given the `playset` command or the interactive session with any arguments, when it runs, then standard output, standard error, prompts, exit codes and setlist.fm and Spotify request order are identical to before this PRD.
- **AC-21** — Given the test suite as it is on `main` before this PRD, when it runs against this Slice, then every existing test passes with no test file and no fixture changed.

## Examples

Unless stated otherwise, setlist.fm and Spotify are fakes. `SETLISTFM_API_KEY=sfm-test-key-0f3c9a`.

### F1 — Find Artists (AC-1, AC-2, AC-3)

Reuses PRD 0005's search responses.

| Typed name | setlist.fm answer | Candidates | `autoPick` |
|---|---|---|---|
| `Arctic Monkeys` | PRD 0005's 3 results | Arctic Monkeys `ada7a83c-e3e1-40f1-93f9-3e73dbfd2c7c` (no disambiguation; setlist.fm gave `""`), Arctic Monkeys Tribute `5b0c1a4e-…`, The Arctic Monkeys Experience `7c1e2d3f-…` | Arctic Monkeys `ada7a83c-…` |
| `  arctic monkeys  ` | same; request has `artistName=arctic%20monkeys` | same 3 | Arctic Monkeys `ada7a83c-…` |
| `Genesis` | PRD 0005's 3 results (two named "Genesis") | Genesis `8e3fcd7d-…` "English rock band", Genesis `2f4b1c6e-…` "US psychedelic rock band", Genesis Owusu `4a5b6c7d-…` | absent (two exact matches) |
| `Bon` | 14 results, none named "Bon" | the first 10, in setlist.fm's order | absent |
| `Xyzzq Nonexistent` | HTTP 404 | — | "Artist not found" error naming "Xyzzq Nonexistent" |
| `Xyzzq Nonexistent` | HTTP 200 `{"type":"artists","itemsPerPage":30,"page":1,"total":0,"artist":[]}` | — | same error |
| `"   "` | (no request) | — | "Artist not found" error, 0 requests |
| `Genesis` | HTTP 429 four times | — | the existing setlist.fm rate-limit error, 4 requests |

### P1 — One page of Pearl Jam's Setlists (AC-4, AC-5, AC-8)

`listSetlists(services, "83b9cbe7-9857-49e2-ab8e-b57b01038103", 1)`, where setlist.fm answers with PRD 0011's L1 page 1 (`itemsPerPage: 20`, `page: 1`, `total: 1310`, 4 setlists). Exactly one request, `GET /artist/83b9cbe7-9857-49e2-ab8e-b57b01038103/setlists?p=1`.

```json
{
  "setlists": [
    { "id": "2bf1c8e4", "date": "2026-11-22", "venue": "Moda Center", "city": "Portland", "songCount": 3,
      "incompleteStatus": { "isIncomplete": true, "unknownSongCount": 1 } },
    { "id": "6bf1b3d0", "date": "2026-11-20", "venue": "Climate Pledge Arena", "city": "Seattle", "songCount": 2,
      "incompleteStatus": { "isIncomplete": true, "unknownSongCount": 0, "matchedPhrase": "cut short",
        "setlistNote": "Show cut short after a power outage." } },
    { "id": "3bf1a7c2", "date": "2026-11-18", "venue": "Rogers Arena", "city": "Vancouver", "songCount": 6,
      "incompleteStatus": { "isIncomplete": false, "unknownSongCount": 0 } }
  ],
  "hasMore": true
}
```

- `4bf1d2a6` (Chase Center, 2026-12-05, `"sets": { "set": [] }`) is a placeholder Setlist and is left out.
- Portland counts 3: its Unknown Song isn't counted.
- Vancouver counts 6: 5 in the main Set and 1 in the Encore.
- `hasMore`: 1 × 20 = 20 < 1310.

The field names in this JSON are illustrative. The facts are what the tests check.

### P2 — Song count rules (AC-8)

One Setlist by "Arctic Monkeys", `"id": "73a1b2c5"`, `"eventDate": "02-06-2026"`, venue "Estadio Metropolitano", city "Madrid", no Setlist note:

```json
"sets": { "set": [
  { "song": [
    { "name": "Intro", "tape": true },
    { "name": "Brianstorm" },
    { "name": "Do I Wanna Know? / R U Mine?" },
    { "name": "Hey Jude", "info": "snippet" },
    { "name": "" },
    { "name": "Brianstorm" }
  ] },
  { "encore": 1, "song": [ { "name": "505", "info": "with Miles Kane" }, { "name": "Kashmir", "info": "Tease" } ] }
] }
```

| Song | Counted? |
|---|---|
| Intro (Tape) | yes, 1 |
| Brianstorm | yes, 1 |
| Do I Wanna Know? / R U Mine? (medley) | yes, 2 parts |
| Hey Jude (snippet) | no |
| `""` (Unknown Song) | no |
| Brianstorm (repeat) | yes, 1 |
| 505 (guest ignored, Encore) | yes, 1 |
| Kashmir (teaser) | no |

The song count is 6. The incomplete status is: incomplete, 1 Unknown Song.

PRD 0002 Fixture A (Arctic Monkeys, `63a5e2b7`) on a page has the song count equal to its Performance count under PRD 0008 and 0010, which is the Show line's "n Performances" count. It is incomplete, with 1 Unknown Song.

### P3 — Paging edge cases (AC-4 to AC-7)

Artist `83b9cbe7-9857-49e2-ab8e-b57b01038103`, `total: 1310`, `itemsPerPage: 20`.

| Call | setlist.fm answer | Result |
|---|---|---|
| page 1 | 20 setlists, all `"sets": { "set": [] }` (announced Shows) | `setlists: []`, `hasMore: true` |
| page 2 | 20 setlists, 7 placeholders | 13 summaries, `hasMore: true` |
| page 65 | 20 setlists | 20 summaries, `hasMore: true` (1300 < 1310) |
| page 66 | 10 setlists | 10 summaries, `hasMore: false` (1320 ≥ 1310) |
| page 67 | HTTP 404 `{"code":404,"status":"Not Found","message":"not found"}` | `setlists: []`, `hasMore: false`, no error |
| page 4 | 20 setlists | 20 summaries. Pages past 3 are allowed here. |
| page 1, Artist with no setlists | HTTP 404 | `setlists: []`, `hasMore: false` |
| page 1 | HTTP 429, `Retry-After: 2`, then 200 | waits 2 s through the injected sleep; the 200 page's result |
| page 1 | HTTP 429 four times | the existing setlist.fm rate-limit error, 4 requests |
| page 1 | HTTP 503 | the existing setlist.fm request error naming 503, 1 request |
| page 0, page -1, page 1.5 | (no request) | page-not-valid error, 0 requests |
| page 1, no API key anywhere | (no request) | the existing missing-API-key error |

### G1 — Get a Setlist, find the Latest Setlist (AC-9, AC-10)

- `getSetlist(services, "53d60349")` sends `GET /setlist/53d60349` and returns PRD 0011's U1 Nirvana JSON unchanged.
- `getSetlist(services, "00000000")` with HTTP 404 raises the "setlist not found" error naming `00000000`.
- `findLatestSetlist(services, "Pearl Jam", chooser, { wantCompleteAlternative: true })` with PRD 0011's L1 fakes sends the artist search and page 1 only, and returns Artist Pearl Jam, Latest Setlist `2bf1c8e4` (Portland) and newest complete Setlist `3bf1a7c2` (Vancouver).
- With `wantCompleteAlternative: false` it returns no alternative.
- Every row of PRD 0005's Latest Setlist examples and PRD 0011's L2 table gives the same requests and result as before.

### R1 — Prepare a Setlist (AC-11 to AC-14)

PRD 0002 Fixture A (Arctic Monkeys, `63a5e2b7`) with PRD 0008's P2 data:

| keep-Tape decision | Asked about | Kept Performances | Not-added list |
|---|---|---|---|
| keep every Tape | "I Want It All", then "Mr. Blue Sky" | all Performances, Tapes included | `Hey Jude (snippet)`, `(Unknown song) after #9`, `Mr. Blue Sky (Tape, left out)`, as in PRD 0011 T2 |
| leave out every Tape | same two, in played order | all but the two Tapes | `I Want It All (Tape, left out)`, `Hey Jude (snippet)`, `(Unknown song) after #8`, `Mr. Blue Sky (Tape, left out)` |
| keep "I Want It All", leave out "Mr. Blue Sky" | same two | all but Mr. Blue Sky | as the first row |
| fails on the first Tape with the cancelled error | "I Want It All" only | — | the cancelled error, unchanged |

In every row the Show is Arctic Monkeys, the Show date, Fixture A's venue and city and URL. The incomplete status is incomplete, with 1 Unknown Song.

- P2's Madrid Setlist, leaving out every Tape: kept Brianstorm, Do I Wanna Know? [Medley], R U Mine? [Medley], Brianstorm, 505 (Set "Encore 1"). Not added: `Intro (Tape, left out)`, `Hey Jude (snippet)`, `(Unknown song) after #3`, `Kashmir (snippet)`. The decision is asked once (Intro).
- PRD 0011's U1 Nirvana Setlist: 9 kept Performances, Love Buzz with Original Artist Shocking Blue. Not added: `(Unknown song) after #7 — Written as 'Dope Hippie' on the setlist`. The decision is never asked.
- PRD 0011's T1d Setlist (only `{ "name": "" }` and `{ "name": "", "info": "Opener" }`): no kept Performances; not added: `(Unknown song) at the start`, `(Unknown song) at the start — Opener`; incomplete, 2 Unknown Songs; the decision is never asked.
- A Setlist whose description would pass the length limit of PRD 0007 AC-11 raises the description-too-long error, and the decision is never asked.

### M1 — Preview Matches (AC-15 to AC-17)

The prepared Setlist is PRD 0011's Pearl Jam Portland Setlist (`2bf1c8e4`): kept Release, Even Flow, Alive. The access token is `BQD3kx-test-token`. The fake Spotify Matches are those of PRD 0011 L1.

Progress reports, in order: (1 of 3, Release), (2 of 3, Even Flow), (3 of 3, Alive). The result:

| # | Performance | Outcome |
|---|---|---|
| 1 | Release | Match `spotify:track:4xGvbS8NnKtwKw5CXGkmA9`, "Release", Pearl Jam, Ten |
| 2 | Even Flow | Match `spotify:track:2pN3kBT1hYiA4bBydDMYv4`, "Even Flow", Pearl Jam, Ten |
| 3 | Alive | Match `spotify:track:3VbM2t6DQHmPWdbTvKrNKz`, "Alive", Pearl Jam, Ten |

It has 3 Matches and 0 Misses. The playlist name is `Pearl Jam – 2026-11-22 – Portland`. There are exactly 3 Match searches and no playlist-name search.

- **Nirvana U1, from PRD 0011 T1:** 9 rows, with Spank Thru → Miss. 8 Matches, Misses [Spank Thru — Nirvana]. Name `Nirvana – 1987-04-18 – Tacoma`.
- **A Setlist with "Brianstorm" played twice:** two rows and two searches, both Match `spotify:track:2JUVKZaRwH8L3h5eKq7EvC`. The Matches list holds it twice.
- **Every search a Miss** (Spotify fake gives no track): 3 rows, 0 Matches, 3 Misses, no error.
- **No kept Performances:** 0 searches, 0 progress reports. Rows `[]`, Matches `[]`, Misses `[]`, name `Pearl Jam – 2026-11-22 – Portland`.
- **Signal aborted before the call:** 0 searches, 0 progress reports, the "run cancelled" error.
- **Signal aborted while search 2 (Even Flow) is in flight:** progress (1 of 3) and (2 of 3) were reported. The step ends with the "run cancelled" error without waiting for search 2. Alive is never searched, and (3 of 3) is never reported.

### C1 — Create (AC-18)

`createSetlistPlaylist(services, show, matches, { accessToken: "BQD3kx-test-token", public: false })` with M1's Show and 3 Matches creates `Pearl Jam – 2026-11-22 – Portland`. It is private, with the description `Setlist from setlist.fm: https://www.setlist.fm/setlist/pearl-jam/2026/moda-center-portland-or-2bf1c8e4.html`. One add-items request carries 3 URIs. The result gives the share link `https://open.spotify.com/playlist/5PqRsTuVwXyZaBcDeFgHiJ` and 3 tracks. With no Matches it raises the existing nothing-to-add error.

### Z1 — The run is unchanged (AC-19, AC-20, AC-21)

These transcripts, call lists and request lists are each byte-for-byte and call-for-call identical before and after this PRD:

- PRD 0007 T1, T2 and E18;
- PRD 0008 P2;
- PRD 0009 S1 and S14;
- PRD 0011 O1 to O5, T1, T1b to T1d and C1.

Examples:

- `playset Pearl Jam` with answer `n` to the offer prints PRD 0011 O2 exactly. Its setlist.fm requests are the artist search and page 1. Its Spotify requests are 3 Match searches, then the playlist-name search, then create and add items. Exit code 0.
- A whole core run with fake services that have only today's services (no Artist-search-without-chooser and no Setlist-page service) completes. It produces PRD 0011 C1's records.
- A Ctrl-C while the Tape question for "I Want It All" is open prints `Cancelled.`, makes no Spotify request and exits with code 130, as today.

### AC coverage

| AC | Examples |
|---|---|
| AC-1 | F1 |
| AC-2 | F1 |
| AC-3 | F1 |
| AC-4 | P1, P3 |
| AC-5 | P1, P3 |
| AC-6 | P3 |
| AC-7 | P3 |
| AC-8 | P1, P2 |
| AC-9 | G1 |
| AC-10 | G1 |
| AC-11 | R1 |
| AC-12 | R1 |
| AC-13 | R1 |
| AC-14 | R1 |
| AC-15 | M1 |
| AC-16 | M1 |
| AC-17 | M1 |
| AC-18 | C1 |
| AC-19 | Z1 |
| AC-20 | Z1 |
| AC-21 | Z1 |

## Changes to earlier PRDs

None of PRDs 0001–0011 changes behaviour. Only the internal structure of the run changes, and new steps are added next to it. Each PRD was checked:

- **PRD 0001 — setlist.fm link:** unchanged. Reading the id from a link stays as it is; the get-Setlist step takes the id.
- **PRD 0002 — Performances:** unchanged. The prepare step and the song count use its rules as they are (with PRD 0008, 0010 and 0011's amendments).
- **PRD 0003 — Matching:** unchanged. The preview step calls the same Match search per Performance.
- **PRD 0004 — Spotify login:** unchanged. No step logs in. The preview and create steps take an access token that the caller got as today.
- **PRD 0005 — setlist.fm:** no behaviour change. AC-1 to AC-21 still hold for the Latest Setlist lookup (AC-10 here).
  - The find-Artists step reuses AC-12 to AC-15 and AC-16's first-10 rule, without a chooser.
  - The list-Setlists step reuses AC-3 and AC-5 to AC-9, and AC-18's placeholder rule.
  - AC-19's 3-page limit applies only to the Latest Setlist search, not to the list-Setlists step. AC-20's "no Setlist" error is not raised by the list-Setlists step: a 404 gives an empty page (AC-6 here).
- **PRD 0006 — Setlist Playlist:** unchanged. The create step is today's creation. The duplicate-name check stays in `runPlayset` and is not part of any step in this PRD.
- **PRD 0007 — CLI:** unchanged. Every AC, including AC-11 (description check before Tape questions), AC-42 (Ctrl-C) and AC-44 (the core with fakes), still holds (AC-19, AC-20 here).
- **PRD 0008 — Medley split:** unchanged. Medley parts count in the song count and appear in the prepare step's kept Performances as today.
- **PRD 0009 — Interactive shell:** unchanged. A session's runs still go through `runPlayset`.
- **PRD 0010 — "+" in titles:** unchanged.
- **PRD 0011 — Incomplete Setlists:** unchanged. AC-4 and AC-5 decide the incomplete status in a summary. AC-7 to AC-9 are the find-Latest-Setlist step. AC-10 to AC-19 still hold for the run.

**Tests.** No existing test changes (AC-21).

## Shared-file requests

For the orchestrator (this Slice does not edit shared files):

- **src/core/index.ts** — export the steps `findArtists`, `listSetlists`, `getSetlist`, `findLatestSetlist`, `prepareSetlist`, `previewMatches` and `createSetlistPlaylist`. Also export their result types: `SetlistSummary`, plus the Artist-candidates result, the Setlist page result, the prepared Setlist and the Match preview result, under whatever names the implementer gives them.
- **CLAUDE.md** — under Architecture, `run` bullet: add "Also offers the run as stateless steps (findArtists → listSetlists / getSetlist / findLatestSetlist → prepareSetlist → previewMatches → createSetlistPlaylist); `runPlayset` is built on them (ADR 0001)."
- **GLOSSARY.md** — no change.
- **docs/PLAN.md** — no change (Depends on stays "—").

## Glossary terms used

- **Setlist** — as defined in GLOSSARY.md.
- **Show** — as defined in GLOSSARY.md.
- **Artist** — as defined in GLOSSARY.md.
- **Set** — as defined in GLOSSARY.md.
- **Encore** — as defined in GLOSSARY.md.
- **Performance** — as defined in GLOSSARY.md.
- **Tape** — as defined in GLOSSARY.md.
- **Cover** — as defined in GLOSSARY.md.
- **Original Artist** — as defined in GLOSSARY.md.
- **Latest Setlist** — as defined in GLOSSARY.md.
- **Unknown Song** — as defined in GLOSSARY.md.
- **Incomplete Setlist** — as defined in GLOSSARY.md.
- **Setlist Playlist** — as defined in GLOSSARY.md.
- **Host Account** — as defined in GLOSSARY.md (Non-goals only).
- **Visitor** — as defined in GLOSSARY.md (Problem and user stories only).
- **Match** — as defined in GLOSSARY.md.
- **Miss** — as defined in GLOSSARY.md.

"Placeholder Setlist", "song count" and "not-added list" are PRD-local words defined above, not glossary terms. Words from PRDs 0002, 0005, 0007, 0008 and 0011 keep their meanings.

## Decisions (approved by the user, 2026-11-27)

- **`autoPick` beyond the first 10:** kept as today — the exact-match check looks at the whole first page of search results, so the CLI stays identical (AC-2, AC-21).
- **Missing `itemsPerPage` or `total`:** `hasMore` = the page had at least one setlist.
- **Incomplete marker shape:** each summary carries the full incomplete status (yes/no, Unknown Song count, matched phrase, Setlist note), as in AC-8.
- **Summary fields:** no setlist.fm URL and no Artist name in `SetlistSummary`.
- **Where the services go:** the first input of every step that makes a request; the prepare step takes none.
- **Description check:** the prepare step raises the description-too-long error before any keep-Tape decision (AC-14).
- **Invalid page number:** page-not-valid error, no request (AC-7).
