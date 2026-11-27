# PRD 0014 — One Setlist Playlist per Setlist in the Host Account

Status: Implemented
Slice: 14
Depends on: 0012
Module: src/core/setlist-playlist (also src/core/run for the Host steps and the preview cache, src/core/performances and src/core/setlistfm for the setlist.fm `versionId`)

## Problem

The web app creates every **Setlist Playlist** in one **Host Account**, publicly, and keeps exactly one per **Setlist** (ADR 0002). The core can't do that today:

- A Setlist read from setlist.fm loses its version. setlist.fm keeps the same setlist id when someone edits a Setlist and gives it a new `versionId`. Without it, nobody can tell whether a Setlist Playlist still mirrors the Setlist.
- The core has no record of which Setlist Playlist belongs to which Setlist. Every create makes a new playlist, so the Host Account would fill up with copies (an account holds about 11,000 playlists in its lifetime).
- The core can't update a Setlist Playlist in place: replace its tracks and set its name and description again after the Setlist was edited.
- A **Visitor** who previews a Setlist and then presses Create makes the server search every **Match** a second time. When the Setlist was edited between the preview and Create, the playlist would no longer match what the Visitor saw.

## Goal

The core offers two more stateless steps for the Host Account. One finds the recorded Setlist Playlist of a Setlist and says whether it is current. The other creates the Setlist Playlist, or updates the recorded one in place. Both work through an injected store of records and cached previews. The preview step reuses a cached preview for the same Setlist version, and Create uses its Matches. The CLI behaves exactly as before.

## Non-goals

- **No server code.** No SQLite, no HTTP routes, no locks ("one create/update at a time per Setlist"), no rate limits and no usage events (created, updated, opened). They belong to Slice 16. This Slice gives only the records interface and an in-memory adapter.
- **No Host login, no Host token storage or refresh.** The Host steps take an access token from the caller (Slice 17 provides it). This PRD only names the scopes that login must ask for (see "Host login scopes").
- **No CLI change.** The CLI still makes a new Setlist Playlist on every run, private by default, with its duplicate-name warning. It never reads or writes records and never uses the preview cache.
- **No `GET /setlist/version/{versionId}`** (setlist.fm documents it as deprecated). The current version is the one on the Setlist the caller just fetched.
- **No Spotify library calls.** No `GET /v1/me/library/contains`, no `PUT /v1/me/library` (no re-follow) and no library scope. Whether the Host Account still holds a playlist is learned from the update's first write (see AC-17).
- **No check on opening.** Finding the recorded Setlist Playlist never asks Spotify anything. A playlist the Host Account deleted still opens by its public link, so the recorded link is still returned.
- **No privacy change on update.** An update sets the name and description again, not the public setting. A recorded playlist made private by hand in Spotify stays private.
- **No deleting playlists.** A deleted, partly filled or replaced Setlist Playlist is never deleted or cleaned up.
- **No duplicate-name check for the Host Account.** The record replaces it.
- **No cache pruning.** The core never removes cached previews of older versions; the server's adapter may.
- **No Tape question.** Host Setlist Playlists always leave every **Tape** out.
- **No cancel signal for create/update.** Only the preview step takes one, as in PRD 0012.
- **No new glossary term.**

## User stories

- As a Visitor, I want to open the Setlist Playlist someone already made for this Setlist, so that I get it at once without waiting for a preview.
- As a Visitor, when the Setlist was edited on setlist.fm after its Setlist Playlist was made, I want to update the same playlist, so that its link stays the same and it mirrors the Setlist again.
- As a Visitor, I want Create to put exactly the Matches I saw in the preview into the playlist, so that there are no surprises.
- As the Host Account's admin, I want one Setlist Playlist per Setlist and a new one only when the old one was deleted, so that the account doesn't fill up with copies.
- As a concert-goer using the CLI, I want nothing to change.

## Words used in this PRD

Terms from earlier PRDs keep their meanings: "preview", "kept Performances" (PRD 0007); "not-added list", "Placeholder Setlist" (PRD 0012); "share link", "nothing to add", "partly created" (PRD 0006). These PRD-local words are added. None is a glossary term:

- **Version**: setlist.fm's `versionId` of a Setlist, an opaque non-empty string (for example `g4bd1a2f6`). The setlist id stays the same across edits, and each edit gives a new version. A Setlist has a version when its `versionId` is a non-empty string.
- **Record**: what the core stores for the Setlist Playlist of one Setlist: the setlist id, the Spotify playlist id, its share link, the version the playlist fully holds (or none, see AC-20) and when the playlist was created.
- **Cached preview**: the result of the preview step (preview rows, Matches, **Misses**, playlist name), stored under a setlist id and a version.
- **Host steps**: find-Setlist-Playlist and create-or-update, below.

## The public contract

Each step takes everything as input and remembers nothing between calls (ADR 0001). "Records" is the injected store of records and cached previews.

| Step / type | Input | Result |
|---|---|---|
| `findSetlistPlaylist` | setlist id, version, `{ records }` | `{ kind: "none" }`, or `{ kind: "current" \| "outdated", playlistId, shareUrl }` |
| `createOrUpdateSetlistPlaylist` | services, the Setlist as just fetched from setlist.fm, the version the Visitor previewed, `{ accessToken, records, now? }` | `{ status: "created" \| "updated", playlist: { id, shareUrl, name, trackCount } }` |
| `previewMatches` (PRD 0012) | as today, plus an optional `records` in its options | as today |
| `SetlistPlaylistRecords` | interface, every method returns a Promise: `findRecord(setlistId)` → record or `undefined`; `saveRecord(record)` (replaces the record of that setlist id); `findPreview(setlistId, versionId)` → cached preview or `undefined`; `savePreview(setlistId, versionId, preview)` (replaces) | — |
| `createMemorySetlistPlaylistRecords()` | none | an in-memory `SetlistPlaylistRecords` (tests, core) |
| record | — | `{ setlistId, playlistId, shareUrl, versionId: string \| null, createdAt }`; `createdAt` is an ISO 8601 UTC timestamp, such as `2026-11-27T18:04:05.000Z` |
| `SetlistChangedError` | — | a Playset error with `previewedVersionId` and `currentVersionId` |
| partly-updated error | — | a Playset error with the playlist id, share link, tracks written, total Matches and cause (name chosen by the implementer, for example `PartlyUpdatedPlaylistError`) |
| no-version error | — | a Playset error naming the setlist id (name chosen by the implementer) |

`now` is a clock giving milliseconds since the epoch, like `Date.now`, which is also the default. "Services" are the Match search plus the Spotify playlist requests the step needs: create, replace items, add items, change name and description. The core's service wiring (`createRunServices`) offers all of them with the injected fetch and sleep. Request-level examples are checked through that wiring with a fake Spotify. The request sequence is part of the contract.

## Acceptance criteria

### Version on the Setlist, its summary and the prepared Setlist

- **AC-1** — Given setlist.fm answers a Setlist with `"versionId": "g4bd1a2f6"`, when the Setlist is fetched by id, or comes from the Latest Setlist lookup or a Setlist page, then the Setlist the core returns has that same `versionId`. Given setlist.fm gives no `versionId`, then the Setlist simply has none, and no error is raised.
- **AC-2** — Given a Setlist on a Setlist page has a version, when the list-Setlists step summarises it, then its summary also holds `versionId` with that value. Given it has no version (missing, `""` or not a string), then the summary has no `versionId` key at all. Every other summary field and rule of PRD 0012 AC-4 to AC-8 is unchanged.
- **AC-3** — Given a Setlist, when the prepare step runs, then its result also holds `setlistId` (the Setlist's id) and `versionId` (its version), each only when the Setlist has it. A missing one has no key at all. Everything else of PRD 0012 AC-11 to AC-14 is unchanged.

### Records

- **AC-4** — Given an empty in-memory records store, when the record of a setlist id is looked up, then there is none. Given a record was saved for setlist id `2bf1c8e4`, then looking up `2bf1c8e4` gives that record with every field as saved, and looking up another setlist id gives none. Given a second record is saved for `2bf1c8e4`, then the lookup gives only the second one.
- **AC-5** — Given a cached preview was saved for setlist id `2bf1c8e4` and version `g4bd1a2f6`, when a cached preview is looked up, then the same setlist id and version give it, unchanged. Any other version of `2bf1c8e4`, or the same version under another setlist id, gives none. Saving again under the same setlist id and version replaces it. Saving under another version keeps both.

### Find the recorded Setlist Playlist

- **AC-6** — Given a setlist id, a version and records, when the find step runs, then:
  - with no record for that setlist id, the result is `none`;
  - with a record whose version equals the given one, the result is `current`, with the recorded playlist id and share link;
  - with a record whose version differs, or a record with no version, the result is `outdated`, with the recorded playlist id and share link.

  No request is sent to Spotify or setlist.fm, and nothing is saved.
- **AC-7** — Given a current record whose playlist the Host Account has deleted in Spotify, when the find step runs, then the result is still `current` with the recorded share link. The deleted check happens only at create or update (AC-17).

### Preview with the cache

- **AC-8** — Given records, and a prepared Setlist that has a setlist id and a version and keeps no Tape, and a cached preview is stored under that setlist id and version, when the preview step runs, then it returns the cached preview unchanged. It makes no Match search and reports no progress. Given its cancel signal is already aborted, it still ends with the "run cancelled" error, as in PRD 0012 AC-17.
- **AC-9** — Given the same set-up with no cached preview for that setlist id and version, when the preview step runs, then it searches and reports progress exactly as PRD 0012 AC-15 and AC-16. When it finishes, it saves its result as the cached preview under that setlist id and version and returns it. The result equals what the step returns without records.
- **AC-10** — Given the preview step ends with an error (the "run cancelled" error or a failed Match search), when it ends, then no cached preview is saved. Given a prepared Setlist without a setlist id or without a version, or one that keeps a Tape, then no cached preview is read or saved and the step searches as today. Given no records at all, the step behaves exactly as PRD 0012 AC-15 to AC-17.

### Create or update the Setlist Playlist: checks before Spotify

- **AC-11** — Given the Setlist as just fetched and a previewed version, when the create-or-update step runs, then these checks come first, in this order. Each one sends no Spotify request and saves no record and no cached preview:
  1. A Setlist without an id or without a version raises the no-version error naming the setlist id (or "unknown" without an id).
  2. A previewed version that differs from the Setlist's version raises the Setlist-changed error. Its message says the Setlist was changed on setlist.fm after the preview. Its hint says to load a fresh preview. It carries both versions.
- **AC-12** — Given the checks pass, when the step reads the Setlist, then it prepares it with every Tape left out and never asks a Tape question. The playlist name and description are those of PRD 0006 AC-1 and AC-2, the same as the CLI makes. A description that would be too long raises the existing description-too-long error (PRD 0006 AC-3) before any request.
- **AC-13** — Given a cached preview under the Setlist's id and version, when the step needs the Matches, then it uses that preview's Matches in played order and makes no Match search. Given none is cached, then it makes one Match search per kept Performance with the given access token, in played order (PRD 0012 AC-15), and saves the result as the cached preview under that id and version. In both cases every Match search comes before any playlist request.
- **AC-14** — Given the Setlist gives no Matches (every kept Performance is a Miss, every Performance is a Tape, or it is a Placeholder Setlist), when the step runs, then the existing "nothing to add" error is raised (PRD 0006 AC-16). No playlist request is sent and the record, if any, is unchanged. An existing Setlist Playlist is not emptied.

### Create (no record)

- **AC-15** — Given no record for the setlist id, when the step runs, then it creates the Setlist Playlist exactly as PRD 0006 AC-11 and AC-13 to AC-15, except that the create body always has `"public": true`. It then saves the record: setlist id, the new playlist id, its share link, the Setlist's version, and `createdAt` from the clock. The result is `status: "created"` with the playlist id, share link, name and track count (the number of Matches, repeats included). No duplicate-name request is sent.

### Update in place (record exists)

- **AC-16** — Given a record for the setlist id, whatever its version (equal, different or none), when the step runs, then it sends, one after another, each only after the previous one succeeded:
  1. `PUT https://api.spotify.com/v1/playlists/<recorded id>/items` with body `{"uris": [...]}`, holding Matches 1–100 (all of them if fewer). This replaces every track the playlist had.
  2. For Matches past 100, `POST https://api.spotify.com/v1/playlists/<recorded id>/items` with at most 100 URIs each (101–200, 201–300, …), in played order.
  3. `PUT https://api.spotify.com/v1/playlists/<recorded id>` with body `{"name": …, "description": …}` (AC-12). The date, venue or city may have changed with the Setlist.

  Every request carries `Authorization: Bearer <token>` and `Content-Type: application/json`. Repeated Matches are sent once per Match, in played position. It then saves the record with the same playlist id, share link and `createdAt`, and the Setlist's version. The result is `status: "updated"` with the recorded playlist id, the recorded share link, the name and the track count.
- **AC-17** — Given a record, when the first replace request (AC-16 step 1) is answered with HTTP 404, then the Host Account no longer holds that playlist: it was deleted (unfollowed), or never existed. No further request goes to the recorded playlist. The step creates a new Setlist Playlist as in AC-15 (public) and replaces the record with the new playlist id, the new share link, the Setlist's version and a new `createdAt`. The result is `status: "created"` with the new playlist. This holds whether the recorded version was current or outdated.
- **AC-18** — Given a record, when the first replace request fails in any other way, then a typed Spotify playlist error is raised at once. Other ways means: HTTP 429 four times (PRD 0006 AC-17), another non-success status such as 401, 403 or 500, or a network failure. The error says the Setlist Playlist was not changed, and it carries the HTTP status if there was one. No further request is sent and the record is unchanged.
- **AC-19** — Given the first replace request succeeded, when a later request of the update fails (an add-items batch or the name-and-description request, in any way AC-18 lists), then no further request is sent and the partly-updated error is raised. Its message says the Setlist Playlist was partly updated and gives the tracks written, the total Matches, the reason and the share link. Its hint says to try the update again, because an update replaces every track. It carries the playlist id, share link, tracks written, total Matches and the cause. The record is unchanged, so it keeps its old version and the next find step answers `outdated` again. The playlist is not deleted.
- **AC-20** — Given a create (AC-15, or after a 404 in AC-17), when the create request itself fails, then the existing "no playlist was created" error is raised (PRD 0006 AC-19) and the record is unchanged. Given the playlist was created but an add-items batch then fails, then the existing "partly created" error is raised (PRD 0006 AC-20), and a record is saved first for the new playlist with no version (`versionId: null`). A later find step then answers `outdated`, and the next create-or-update updates that playlist in place instead of making another one.

### Request rules

- **AC-21** — Given any request the Host steps send, then the rules of PRD 0006 apply:
  - HTTP 429 is retried after `Retry-After`, up to 3 retries per request (AC-17);
  - any other non-success status is not retried (AC-18);
  - the access token never appears in an error's message, hint or cause (AC-21);
  - every request goes to `https://api.spotify.com/`, none to a URL containing `/v1/users/` or ending in `/tracks` (AC-22).

  No request goes to `/v1/me/library` or to `…/followers`, and none is sent to `GET /v1/playlists/<id>`.

### The CLI is unchanged

- **AC-22** — Given any input, options, front-end answers and fake services, when `runPlayset` or the `playset` command runs, then everything is identical to before this PRD: outcomes, front-end calls, output, exit codes, and setlist.fm and Spotify requests in the same order. The CLI's Setlist Playlist is still new on every run, private unless `--public`, with the duplicate-name warning. It reads and writes no records and uses no cached preview. Every existing test passes, and no test file or fixture is changed.

## Examples

Unless stated otherwise, setlist.fm and Spotify are fakes, the Spotify fake answers through the core's service wiring with a fake fetch and a fake sleep, the Host access token is `BQDhost-test-token`, the clock is `2026-11-27T18:04:05.000Z`, and records are a fresh in-memory store.

### Fixture H — Pearl Jam, Portland, two versions

Version 1 (`GET /setlist/2bf1c8e4`):

```json
{
  "id": "2bf1c8e4",
  "versionId": "g4bd1a2f6",
  "eventDate": "22-11-2026",
  "lastUpdated": "2026-11-23T08:12:44.000+0000",
  "artist": { "mbid": "83b9cbe7-9857-49e2-ab8e-b57b01038103", "name": "Pearl Jam" },
  "venue": { "name": "Moda Center", "city": { "name": "Portland", "country": { "name": "United States" } } },
  "url": "https://www.setlist.fm/setlist/pearl-jam/2026/moda-center-portland-or-2bf1c8e4.html",
  "sets": { "set": [ { "song": [
    { "name": "Release" }, { "name": "Even Flow" }, { "name": "" }, { "name": "Alive" }
  ] } ] }
}
```

Version 2: the same id, after an edit:

```json
{
  "id": "2bf1c8e4",
  "versionId": "g2b5e7c19",
  "eventDate": "21-11-2026",
  "lastUpdated": "2026-11-26T21:40:02.000+0000",
  "artist": { "mbid": "83b9cbe7-9857-49e2-ab8e-b57b01038103", "name": "Pearl Jam" },
  "venue": { "name": "Moda Center", "city": { "name": "Portland", "country": { "name": "United States" } } },
  "url": "https://www.setlist.fm/setlist/pearl-jam/2026/moda-center-portland-or-2bf1c8e4.html",
  "sets": { "set": [
    { "song": [
      { "name": "Master/Slave", "tape": true },
      { "name": "Release" }, { "name": "Even Flow" }, { "name": "Corduroy" }, { "name": "Alive" }
    ] },
    { "encore": 1, "song": [ { "name": "Yellow Ledbetter" } ] }
  ] }
}
```

| Kept Performance | Match URI (fake ids) |
|---|---|
| Release | `spotify:track:4xGvbS8NnKtwKw5CXGkmA9` |
| Even Flow | `spotify:track:2pN3kBT1hYiA4bBydDMYv4` |
| Corduroy (v2 only) | `spotify:track:0yA1cVWJ4UjaQvSFbJxbpb` |
| Alive | `spotify:track:3VbM2t6DQHmPWdbTvKrNKz` |
| Yellow Ledbetter (v2 only, Encore 1) | `spotify:track:1QRVyV9SWw0pYxB6hn3HCS` |

- v1: 3 Matches; name `Pearl Jam – 2026-11-22 – Portland`.
- v2: 5 Matches; Master/Slave left out (a Tape); name `Pearl Jam – 2026-11-21 – Portland`.
- Description, both: `Setlist from setlist.fm: https://www.setlist.fm/setlist/pearl-jam/2026/moda-center-portland-or-2bf1c8e4.html`.

Shared Fixture A (Arctic Monkeys, `63a5e2b7`) stays as it is, with no `versionId`. A test that needs it with a version adds one in the test (`{ ...fixtureA, versionId: "g6bd2a6f2" }`) instead of editing the shared fixture. New fixtures this Slice adds carry a `versionId`.

### V1 — Version carried (AC-1, AC-2, AC-3)

| Case | Result |
|---|---|
| `getSetlist(services, "2bf1c8e4")`, setlist.fm answers Fixture H v1 | the Setlist has `versionId: "g4bd1a2f6"` |
| `listSetlists` page 1, where Portland has `"versionId": "g4bd1a2f6"` and Vancouver (`3bf1a7c2`) has `"versionId": "g7ac2e1d9"` | Portland's summary has `versionId: "g4bd1a2f6"`, Vancouver's `"g7ac2e1d9"` |
| PRD 0012 P1's page (no `versionId` anywhere) | the summaries are exactly P1's: no `versionId` key |
| a Setlist on a page with `"versionId": ""` | its summary has no `versionId` key |
| `prepareSetlist(H v2, { keepTape: () => false })` | `setlistId: "2bf1c8e4"`, `versionId: "g2b5e7c19"`; kept Release, Even Flow, Corduroy, Alive, Yellow Ledbetter; not added `Master/Slave (Tape, left out)` |
| `prepareSetlist(Fixture A, …)` | `setlistId: "63a5e2b7"` and no `versionId` key (Fixture A has an id but no version) |
| `findLatestSetlist(…, "Pearl Jam", …)` with the page above | the Latest Setlist has `versionId: "g4bd1a2f6"` |

### R1 — In-memory records (AC-4, AC-5)

```js
const records = createMemorySetlistPlaylistRecords();
await records.findRecord("2bf1c8e4");             // undefined
await records.saveRecord({ setlistId: "2bf1c8e4", playlistId: "5PqRsTuVwXyZaBcDeFgHiJ",
  shareUrl: "https://open.spotify.com/playlist/5PqRsTuVwXyZaBcDeFgHiJ",
  versionId: "g4bd1a2f6", createdAt: "2026-11-27T18:04:05.000Z" });
await records.findRecord("2bf1c8e4");             // that record, every field equal
await records.findRecord("3bf1a7c2");             // undefined
await records.saveRecord({ ...thatRecord, versionId: "g2b5e7c19" });
await records.findRecord("2bf1c8e4");             // versionId "g2b5e7c19"

await records.savePreview("2bf1c8e4", "g4bd1a2f6", previewV1);
await records.findPreview("2bf1c8e4", "g4bd1a2f6"); // previewV1
await records.findPreview("2bf1c8e4", "g2b5e7c19"); // undefined
await records.findPreview("3bf1a7c2", "g4bd1a2f6"); // undefined
await records.savePreview("2bf1c8e4", "g2b5e7c19", previewV2);
await records.findPreview("2bf1c8e4", "g4bd1a2f6"); // still previewV1
```

### F1 — Find (AC-6, AC-7)

| Record for `2bf1c8e4` | Asked version | Result |
|---|---|---|
| none | `g4bd1a2f6` | `{ kind: "none" }` |
| `5PqRsTuVwXyZaBcDeFgHiJ`, `g4bd1a2f6` | `g4bd1a2f6` | `{ kind: "current", playlistId: "5PqRsTuVwXyZaBcDeFgHiJ", shareUrl: "https://open.spotify.com/playlist/5PqRsTuVwXyZaBcDeFgHiJ" }` |
| `5PqRsTuVwXyZaBcDeFgHiJ`, `g4bd1a2f6` | `g2b5e7c19` | `{ kind: "outdated", playlistId: "5PqRsTuVwXyZaBcDeFgHiJ", shareUrl: "https://open.spotify.com/playlist/5PqRsTuVwXyZaBcDeFgHiJ" }` |
| `5PqRsTuVwXyZaBcDeFgHiJ`, `null` | `g4bd1a2f6` | `outdated`, same id and link |
| `5PqRsTuVwXyZaBcDeFgHiJ`, `g4bd1a2f6`, playlist deleted in Spotify | `g4bd1a2f6` | `current`, same link |

In every row, 0 requests are recorded.

### P1 — Preview with the cache (AC-8, AC-9, AC-10)

`prepared` = `prepareSetlist(H v1, { keepTape: () => false })`.

| Situation | Searches | Progress reports | Result | Cache afterwards |
|---|---|---|---|---|
| records empty | 3 (Release, Even Flow, Alive) | (1 of 3) … (3 of 3) | 3 rows, 3 Matches, 0 Misses, name `Pearl Jam – 2026-11-22 – Portland` | that result under `2bf1c8e4` + `g4bd1a2f6` |
| run the same call again with the same records | 0 | none | equal to the first result | unchanged |
| cache holds a v1 preview, prepared from H v2 | 5 | (1 of 5) … (5 of 5) | 5 Matches, name `Pearl Jam – 2026-11-21 – Portland` | v1 and v2 previews both stored |
| records empty, signal aborts while search 2 is in flight | 2 started | (1 of 3), (2 of 3) | "run cancelled" error | nothing saved |
| records empty, search 2 fails with the Spotify search rate-limit error | 2 | (1 of 3), (2 of 3) | that error | nothing saved |
| records given, prepared from Fixture A (no version) | one per kept Performance | as today | as today | nothing saved |
| records given, prepared from H v2 with `keepTape: () => true` (Master/Slave kept) | 6 | (1 of 6) … | as today | nothing read, nothing saved |
| no records | as PRD 0012 M1 | as M1 | as M1 | — |
| cache holds v1, signal already aborted | 0 | none | "run cancelled" error | unchanged |

### H1 — Create, no record (AC-11 to AC-13, AC-15)

`createOrUpdateSetlistPlaylist(services, H v1, "g4bd1a2f6", { accessToken: "BQDhost-test-token", records })` with no record and no cached preview:

| # | Request | Fake answer |
|---|---|---|
| 1–3 | Match searches for Release, Even Flow, Alive (PRD 0003 requests) | the Matches of Fixture H |
| 4 | `POST https://api.spotify.com/v1/me/playlists` body `{"name":"Pearl Jam – 2026-11-22 – Portland","description":"Setlist from setlist.fm: https://www.setlist.fm/setlist/pearl-jam/2026/moda-center-portland-or-2bf1c8e4.html","public":true}` | 201 `{"id":"5PqRsTuVwXyZaBcDeFgHiJ","external_urls":{"spotify":"https://open.spotify.com/playlist/5PqRsTuVwXyZaBcDeFgHiJ"}}` |
| 5 | `POST https://api.spotify.com/v1/playlists/5PqRsTuVwXyZaBcDeFgHiJ/items` body `{"uris":["spotify:track:4xGvbS8NnKtwKw5CXGkmA9","spotify:track:2pN3kBT1hYiA4bBydDMYv4","spotify:track:3VbM2t6DQHmPWdbTvKrNKz"]}` | 201 `{"snapshot_id":"AAAAAgAAAAA"}` |

Result: `{ status: "created", playlist: { id: "5PqRsTuVwXyZaBcDeFgHiJ", shareUrl: "https://open.spotify.com/playlist/5PqRsTuVwXyZaBcDeFgHiJ", name: "Pearl Jam – 2026-11-22 – Portland", trackCount: 3 } }`.

Record saved: `{ setlistId: "2bf1c8e4", playlistId: "5PqRsTuVwXyZaBcDeFgHiJ", shareUrl: "https://open.spotify.com/playlist/5PqRsTuVwXyZaBcDeFgHiJ", versionId: "g4bd1a2f6", createdAt: "2026-11-27T18:04:05.000Z" }`. The cached preview for `2bf1c8e4` + `g4bd1a2f6` is saved. Exactly 5 requests are sent and no `GET /v1/me/playlists`.

The same call when the v1 preview is already cached (from P1) sends only requests 4 and 5: no Match search.

### H2 — Update in place (AC-16)

The record is H1's (`g4bd1a2f6`). Call with H v2 and previewed version `g2b5e7c19`, with the v2 preview cached:

| # | Request | Fake answer |
|---|---|---|
| 1 | `PUT https://api.spotify.com/v1/playlists/5PqRsTuVwXyZaBcDeFgHiJ/items` body `{"uris":["spotify:track:4xGvbS8NnKtwKw5CXGkmA9","spotify:track:2pN3kBT1hYiA4bBydDMYv4","spotify:track:0yA1cVWJ4UjaQvSFbJxbpb","spotify:track:3VbM2t6DQHmPWdbTvKrNKz","spotify:track:1QRVyV9SWw0pYxB6hn3HCS"]}` | 200 `{"snapshot_id":"AAAAAwAAAAA"}` |
| 2 | `PUT https://api.spotify.com/v1/playlists/5PqRsTuVwXyZaBcDeFgHiJ` body `{"name":"Pearl Jam – 2026-11-21 – Portland","description":"Setlist from setlist.fm: https://www.setlist.fm/setlist/pearl-jam/2026/moda-center-portland-or-2bf1c8e4.html"}` | 200, empty body |

Result: `{ status: "updated", playlist: { id: "5PqRsTuVwXyZaBcDeFgHiJ", shareUrl: "https://open.spotify.com/playlist/5PqRsTuVwXyZaBcDeFgHiJ", name: "Pearl Jam – 2026-11-21 – Portland", trackCount: 5 } }`. Master/Slave is not in the URIs. The record becomes `versionId: "g2b5e7c19"`, with the same playlist id, share link and `createdAt: "2026-11-27T18:04:05.000Z"` (the clock now reads `2026-11-28T09:00:00.000Z`, which is not used). Exactly 2 requests are sent.

Same record, same version (`g4bd1a2f6`, H v1): the same two kinds of requests are sent with v1's 3 URIs and v1's name, and the result is `status: "updated"`. A record with `versionId: null` is updated the same way.

### H3 — Recorded playlist deleted (AC-17)

The record is H1's. The Host Account deleted `5PqRsTuVwXyZaBcDeFgHiJ` in Spotify. Call with H v2, `g2b5e7c19`, v2 preview cached, clock `2026-11-28T09:00:00.000Z`:

| # | Request | Fake answer |
|---|---|---|
| 1 | `PUT …/v1/playlists/5PqRsTuVwXyZaBcDeFgHiJ/items` (v2's 5 URIs) | 404 `{"error":{"status":404,"message":"Resource not found"}}` |
| 2 | `POST https://api.spotify.com/v1/me/playlists` body with name `Pearl Jam – 2026-11-21 – Portland`, the description and `"public": true` | 201 `{"id":"6QrStUvWxYzAbCdEfGhIjK","external_urls":{"spotify":"https://open.spotify.com/playlist/6QrStUvWxYzAbCdEfGhIjK"}}` |
| 3 | `POST …/v1/playlists/6QrStUvWxYzAbCdEfGhIjK/items` (the 5 URIs) | 201 |

Result: `status: "created"`, playlist `6QrStUvWxYzAbCdEfGhIjK`, 5 tracks. The record is replaced: `{ setlistId: "2bf1c8e4", playlistId: "6QrStUvWxYzAbCdEfGhIjK", shareUrl: "https://open.spotify.com/playlist/6QrStUvWxYzAbCdEfGhIjK", versionId: "g2b5e7c19", createdAt: "2026-11-28T09:00:00.000Z" }`. No rename and no further request goes to `5PqRs…`.

The same happens with a current record (H v1, `g4bd1a2f6`) whose playlist was deleted: a 404 on the replace, then a new playlist, and the result is `created`.

### H4 — More than 100 Matches (AC-15, AC-16)

A Setlist `9ac1e5d3` with version `g1f0e9d8c` and 230 kept Performances, Matches `spotify:track:T001` … `T230` (fake ids, in played order; Match 150 repeats `T007`), preview cached.

Update (record `7RsTuVwXyZaBcDeFgHiJkL`):

| # | Request | URIs |
|---|---|---|
| 1 | `PUT /v1/playlists/7RsTuVwXyZaBcDeFgHiJkL/items` | 1–100 |
| 2 | `POST /v1/playlists/7RsTuVwXyZaBcDeFgHiJkL/items` | 101–200 (position 50 is `T007`) |
| 3 | `POST /v1/playlists/7RsTuVwXyZaBcDeFgHiJkL/items` | 201–230 |
| 4 | `PUT /v1/playlists/7RsTuVwXyZaBcDeFgHiJkL` | name and description |

Each request is sent only after the previous one answered with a success status. `trackCount` is 230.

- Exactly 100 Matches: one PUT with 100 URIs, then the rename.
- 101 Matches: PUT 100, POST 1, then the rename.
- Create with no record: `POST /v1/me/playlists`, then POST 1–100, POST 101–200, POST 201–230 (PRD 0006 E7).

### H5 — Failures (AC-18, AC-19, AC-20, AC-21)

Record H1's, H v2, `g2b5e7c19`, preview cached, unless stated.

| Fake answers | Outcome | Requests | Record afterwards |
|---|---|---|---|
| PUT items: 500 `{"error":{"status":500,"message":"Server error"}}` | Spotify playlist error, status 500, saying the Setlist Playlist was not changed | 1 | unchanged (`g4bd1a2f6`) |
| PUT items: 401 `{"error":{"status":401,"message":"The access token expired"}}` | the same kind of error, status 401 | 1 | unchanged |
| PUT items: 429 `Retry-After: 2`, then 200; rename 200 | succeeds after sleeping 2 s | 3 | `g2b5e7c19` |
| PUT items: 429 four times | rate-limit error; not changed | 4 | unchanged |
| PUT items: 200; rename: 404 | partly-updated error: 5 of 5 tracks written, cause status 404, share link `https://open.spotify.com/playlist/5PqRsTuVwXyZaBcDeFgHiJ` | 2 | unchanged (`g4bd1a2f6`), so find answers `outdated` for `g2b5e7c19` |
| H4 update: PUT 200, first POST 502 `{"error":{"status":502,"message":"Bad gateway"}}` | partly-updated error: 100 of 230 tracks written, cause status 502 | 2 (no second POST, no rename) | unchanged |
| No record; create POST answers 403 `{"error":{"status":403,"message":"Insufficient client scope"}}` | the existing "no playlist was created" error | 1 | still none |
| No record, H4's 230 Matches; create 201 (`8HiJkLmNoPqRsTuVwXyZaB`), batch 1 201, batch 2 400 | the existing "partly created" error, 100 of 230 added | 3 | `{ setlistId: "9ac1e5d3", playlistId: "8HiJkLmNoPqRsTuVwXyZaB", shareUrl: "https://open.spotify.com/playlist/8HiJkLmNoPqRsTuVwXyZaB", versionId: null, createdAt: "2026-11-27T18:04:05.000Z" }` |
| Then, a create-or-update call for `9ac1e5d3`, `g1f0e9d8c`, all answers succeed | `status: "updated"`, playlist `8HiJkLmNoPqRsTuVwXyZaB`, 230 tracks (PUT, POST, POST, rename) | 4 | `versionId: "g1f0e9d8c"` |

The partly-updated error's hint is: `Try the update again: it replaces every track, so nothing is added twice.`

In every row, no error text contains `BQDhost-test-token`. No request URL contains `/v1/me/library`, `/followers` or `/v1/users/`, none ends in `/tracks`, and no `GET /v1/playlists/<id>` is sent.

### H6 — The Setlist changed, or has no version (AC-11)

| Setlist given | Previewed version | Outcome | Requests | Records |
|---|---|---|---|---|
| H v2 (`g2b5e7c19`) | `g4bd1a2f6` | Setlist-changed error: message `This Setlist was changed on setlist.fm after the preview.`, hint `Load a fresh preview, then create the Setlist Playlist again.`, `previewedVersionId: "g4bd1a2f6"`, `currentVersionId: "g2b5e7c19"` | 0 | no record or cached preview saved |
| Fixture A (no `versionId`) | `g6bd2a6f2` | no-version error naming `63a5e2b7` | 0 | nothing saved |
| H v1 with `"versionId": ""` | `""` | no-version error naming `2bf1c8e4` | 0 | nothing saved |

### H7 — Nothing to add, Tapes, description (AC-12, AC-14)

| Setlist (version `g5c3d2e1f`, id `4cf2a8b1`) | Outcome | Requests | Record |
|---|---|---|---|
| Kept Release, Even Flow; every Match search finds nothing | "nothing to add" error | 2 searches only | none saved; the cached preview (2 Misses) is saved |
| Only `{ "name": "Intro", "tape": true }` | "nothing to add" error; no Tape question asked | 0 | none |
| `"sets": { "set": [] }` (Placeholder Setlist) | "nothing to add" error | 0 | none |
| Record exists for `4cf2a8b1` (`g0a1b2c3d`), new version all Misses | "nothing to add" error | searches only, no PUT | unchanged; the playlist keeps its tracks |
| Setlist URL makes the description 301 characters (PRD 0006 E2) | description-too-long error | 0 | none |

### Z1 — The CLI is unchanged (AC-22)

PRD 0012 Z1's transcripts, call lists and request lists stay byte-for-byte and call-for-call the same. `playset https://www.setlist.fm/setlist/pearl-jam/2026/moda-center-portland-or-2bf1c8e4.html` with Fixture H v1 asks no Tape question (there is none). It sends 3 Match searches, then `GET /v1/me/playlists?limit=50`, then `POST /v1/me/playlists` with `"public": false`, then add items. It prints the same lines as before, whether or not the Setlist has a `versionId`.

### AC coverage

| AC | Examples |
|---|---|
| AC-1 | V1 |
| AC-2 | V1 |
| AC-3 | V1 |
| AC-4 | R1 |
| AC-5 | R1 |
| AC-6 | F1 |
| AC-7 | F1 |
| AC-8 | P1 |
| AC-9 | P1 |
| AC-10 | P1 |
| AC-11 | H1, H6 |
| AC-12 | H1, H2, H7 |
| AC-13 | H1 |
| AC-14 | H7 |
| AC-15 | H1, H4 |
| AC-16 | H2, H4 |
| AC-17 | H3 |
| AC-18 | H5 |
| AC-19 | H5 |
| AC-20 | H5 |
| AC-21 | H5 |
| AC-22 | Z1 |

## Spotify facts this PRD relies on (live check 2026-11-27)

Checked by the orchestrator on a throwaway playlist with a fresh token (scopes `playlist-modify-private`, `playlist-modify-public`, `playlist-read-private`), and recorded in `CLAUDE.md`:

- `PUT /v1/playlists/{id}/items` `{ uris }` (≤100) → 200 `{ snapshot_id }`. It replaces all items.
- `PUT /v1/playlists/{id}` `{ name, description }` → 200, empty body.
- Deleting a playlist means unfollowing it. On an own playlist that was deleted, every time: `PUT …/items` → 404, `PUT /v1/playlists/{id}` → 404, `POST …/items` → 502, `GET /v1/playlists/{id}` → 200 (still public; the link keeps opening). Writing never brings it back.
- `GET /v1/me/library/contains` → 403 "Insufficient client scope" with playlist-only scopes.

Hence: a 404 on the update's first write means the Host Account no longer holds the playlist (AC-17). This needs no library scope and no extra request. The first write is the replace, not an add, because an add answers 502 on a deleted playlist, which can't be told apart from a Spotify outage.

## Host login scopes (for Slice 17)

The Host login asks for exactly the scopes the existing login already asks for: `playlist-modify-public`, `playlist-modify-private` and `playlist-read-private`. It asks for no `user-library-read` or `user-library-modify` and no other scope. Only `playlist-modify-public` is needed by the Host steps. The other two come with the shared login code and change nothing.

## Changes to earlier PRDs

Each of PRDs 0001–0012 was checked:

- **PRD 0001 — setlist.fm link:** unchanged.
- **PRD 0002 — Performances:** unchanged. A Setlist may now carry `versionId`; the Performance, Show, snippet, Cover and Encore rules ignore it.
- **PRD 0003 — Matching:** unchanged. The Host steps use the same Match search.
- **PRD 0004 — Spotify login:** unchanged. Same scopes; the Host login (Slice 17) reuses them.
- **PRD 0005 — setlist.fm:** no behaviour change. The client already returns Setlists unchanged; only the Setlist's type now names `versionId` (AC-1). The requests, the Latest Setlist rules and the errors are as before.
- **PRD 0006 — Setlist Playlist:** unchanged for the CLI and for the create step of PRD 0012. For the Host steps only:
  - The non-goal "No editing, reusing, renaming or deleting existing playlists" no longer holds: a recorded Setlist Playlist is reused, its items are replaced, and it is renamed and described again (AC-16). It is still never deleted.
  - The non-goal "The duplicate check never blocks / each create request makes a new Setlist Playlist" doesn't apply: the Host steps make no duplicate-name check and create only without a usable record (AC-15, AC-17).
  - AC-12: Host creates are always public.
  - AC-20: on "partly created" the Host step also saves a record without a version (AC-20 here).
  - AC-22 still holds. Example E12's list of allowed URL starts gains `https://api.spotify.com/v1/playlists/<id>` (the rename) and the `PUT` method on `…/items`, for the Host steps only.
  - No existing AC or test changes.
- **PRD 0007 — CLI:** unchanged (AC-22). Private by default, a new playlist per run, the duplicate warning, `--dry-run` and the preview all stay.
- **PRD 0008 — Medley split:** unchanged. Medley parts are kept Performances in Host previews as everywhere.
- **PRD 0009 — Interactive shell:** unchanged.
- **PRD 0010 — "+" in titles:** unchanged. The extra "&" search is part of the Match search the cache stores.
- **PRD 0011 — Incomplete Setlists:** unchanged. The incomplete status is not part of a record. The Host steps make no "newest complete Setlist" offer.
- **PRD 0012 — Run steps:** additive changes only:
  - AC-8: a summary also carries `versionId` when the Setlist has one (AC-2 here). Without one, the summary is exactly as before.
  - AC-11: the prepared Setlist also carries `setlistId` and `versionId` when present (AC-3 here).
  - AC-15 to AC-17: still hold when no records are given. With records, the cache rules of AC-8 to AC-10 here apply.
  - Its non-goals "No Host Account logic … no Match cache (Slice 14)" and "No caching between steps" are lifted by this PRD for the opt-in records only. The step still keeps nothing in memory; the cache lives in the injected records.
  - AC-21 still holds: every existing test passes unchanged, because absent fields have no key.

**Tests.** No existing test or fixture changes. Fixture A stays without a `versionId`.

## Shared-file requests

For the orchestrator (this Slice does not edit shared files):

- **src/core/index.ts:** export
  - the steps `findSetlistPlaylist` and `createOrUpdateSetlistPlaylist`;
  - `createMemorySetlistPlaylistRecords`;
  - the types `SetlistPlaylistRecords`, the record type, the find result and the create-or-update result, under the implementer's names;
  - the errors `SetlistChangedError`, the partly-updated error and the no-version error.

  `SetlistSummary`, `PreparedSetlist` and `SetlistFmSetlist` are already exported.
- **CLAUDE.md:**
  - Architecture, `run` bullet: add "Host steps `findSetlistPlaylist` and `createOrUpdateSetlistPlaylist` keep one public Setlist Playlist per Setlist in the Host Account through an injected `SetlistPlaylistRecords` (record + preview cached per Setlist id and `versionId`; in-memory adapter in core). `previewMatches` reuses a cached preview when given records."
  - `setlist-playlist` list entry: "(name, duplicate check, create + fill, update in place)".
  - The live-check line under External API facts is already there.
- **GLOSSARY.md:** no change.
- **docs/PLAN.md:** no change (Depends on: 12).

## Glossary terms used

- **Setlist** — as defined in GLOSSARY.md.
- **Show** — as defined in GLOSSARY.md.
- **Artist** — as defined in GLOSSARY.md.
- **Encore** — as defined in GLOSSARY.md.
- **Performance** — as defined in GLOSSARY.md.
- **Tape** — as defined in GLOSSARY.md.
- **Cover** — as defined in GLOSSARY.md (unchanged rules only).
- **Unknown Song** — as defined in GLOSSARY.md (Fixture H v1).
- **Incomplete Setlist** — as defined in GLOSSARY.md (unchanged rules only).
- **Setlist Playlist** — as defined in GLOSSARY.md.
- **Host Account** — as defined in GLOSSARY.md.
- **Visitor** — as defined in GLOSSARY.md.
- **Match** — as defined in GLOSSARY.md.
- **Miss** — as defined in GLOSSARY.md.

"Version", "record", "cached preview" and "Host steps" are PRD-local words defined above, not glossary terms.

## Decisions (approved 2026-11-28; user put /implementing in full-auto mode)

Made by the PRD writer where the brief, ADRs and live check left room:

1. **The deleted check is the update's first write.** A 404 on `PUT …/items` means "no longer held", and the step creates a new playlist and replaces the record. There is no library scope and no extra request (orchestrator decision from the live check).
2. **Update order:** replace (first 100) → add the rest in batches of ≤100 → name and description. The replace goes first because it is also the deleted check.
3. **An update with a current record still writes.** If create-or-update is called while the record's version equals the Setlist's, it updates anyway (and recreates a deleted playlist). Deciding when to call is the server's job, which uses the find step.
4. **A recreated playlist reports `status: "created"`**, with a new `createdAt`. The old record is replaced.
5. **Partly created on a Host create** saves a record with `versionId: null`, so the next call updates that playlist instead of making a second one (ADR 0002: no duplicates). A failed create request saves nothing.
6. **Partly failed update** leaves the record entirely unchanged (old version), with a new partly-updated error and the hint "Try the update again: it replaces every track, so nothing is added twice." A first-write failure other than 404 is the existing Spotify playlist error, saying the playlist was not changed.
7. **No Matches never empties an existing Setlist Playlist.** "Nothing to add" is raised, and the record and playlist are unchanged.
8. **The cache is only for prepared Setlists with an id, a version and no kept Tape.** That keeps the CLI's Tape choices from ever polluting a Host preview. A cache hit reports no progress. A cancelled or failed preview saves nothing. A preview with all Misses is saved.
9. **Create-or-update takes the freshly fetched Setlist and the previewed version.** It doesn't fetch the Setlist itself (steps are given their Setlist, PRD 0012). A Setlist without an id or version raises a no-version error.
10. **A missing version is an absent key, not `undefined`.** This applies to summaries and prepared Setlists, so every PRD 0012 strict-equality test stays green.
11. **The record holds the share link**, not only the playlist id, so the find step answers without Spotify. `createdAt` is an ISO 8601 UTC string from an injectable clock (default `Date.now`). Update keeps the original `createdAt`, and there is no `updatedAt` (the server's events table counts updates).
12. **Update doesn't send `public`.** Only the verified body `{ name, description }` is sent.
13. **Records methods are all async**, so a synchronous SQLite adapter and the in-memory adapter fit the same interface.
14. **Host login scopes** are the existing three, with no library scope.

## Open questions

(none)
