# PRD 0015 — Web API contract

Status: Approved
Slice: 15
Depends on: 0012, 0014
Module: src/web/shared

## Problem

The web app is being built as two halves at the same time: the server (Slices 16 and 17) and the browser client (Slices 18 and 19). They talk over HTTP and Server-Sent Events. Without one agreed contract, each half would declare its own shapes for an **Artist** candidate, a **Setlist** summary, a preview row with its **Match** or **Miss**, and the error body. Those copies would drift, and the drift would only show up when the halves meet. The core steps (PRD 0012, PRD 0014) return rich internal types: Spotify URIs, the search queries tried for a Miss, `autoPick`, the full Matches list. Some of these must never reach a **Visitor**, and some the browser simply doesn't need.

## Goal

One contract module that both halves import. It holds a schema for every request and response of every web route and for every preview event, the types inferred from those schemas, the route paths, the error codes and the input limits. The server uses it to check what comes in and to type what goes out. The client uses it to type what it sends and reads. Neither half declares a shape of its own.

## Non-goals

- **No server or client code.** No routes, no handlers, no Server-Sent Events writer or reader, no API client, no React. Slices 16 to 19 build those on this contract.
- **No runtime logic beyond schemas and constants.** No URL builders, no error mapping, no formatting helpers.
- **No HTTP status catalogue.** Which status goes with which error code belongs to the server's error catalogue (`.claude/rules/web-server.md`). The contract only names the success statuses each route answers with (see "Wire rules").
- **No visitor wording.** `message` and `hint` are free sentences the server writes. The contract only checks that they are non-empty strings.
- **No checking that a link is a setlist.fm Setlist link.** The contract only trims and limits the link's length. Reading the setlist id out of a link stays a core rule (PRD 0001), applied by the server.
- **No country in the Show or the Setlist summary.** The core's Show and Setlist summary have no country (PRD 0012), so the contract carries none. `docs/design.md` shows "New York, United States". The client shows the city only until a later PRD adds the country to the core.
- **No Set label on a noted Unknown Song.** The core's not-added list gives an Unknown Song's place (`after`) and info, not its **Set**. The contract carries what the core gives.
- **No Match-by-Match rows during Matching.** A progress event carries only the count (`n` of `total`). The preview rows arrive all at once in the final preview event. This settles `docs/design.md` decision 6: the client shows the counter and bar while Matching, then the whole Setlist sheet.
- **No Spotify track links in the preview.** A Match carries its track name, artists, album and live flag, not its URI or id. `docs/design.md` makes Match lines plain text.
- **No Tape fields.** The web always leaves every **Tape** out (ADR 0002, PRD 0014). A preview row is never a Tape, so a Performance carries no Tape flag. Left-out Tapes appear only in the not-added list.
- **No `autoPick`.** The web always shows the candidate list.
- **No change to any core type, core step or earlier PRD.**
- **No new glossary term.**

## User stories

- As the developer of the web server, I want one schema per request, so that every query, path parameter and body is checked the same way and a bad one is always `INVALID_INPUT`.
- As the developer of the web client, I want types for every response and preview event, so that a server change that breaks the client fails the type check instead of a Visitor's page.
- As a Visitor, I want the errors I see to follow one shape with a fixed set of codes, so that the app always knows whether to offer Try again, a countdown or a fresh preview.
- As the Host Account's admin, I want the status page's data to carry names and counts only, so that no secret value can travel to the browser.

## Words used in this PRD

Terms from earlier PRDs keep their meanings: "preview", "kept Performances" (PRD 0007); "not-added list", "Placeholder Setlist", "song count" (PRD 0012); "version", "record", "cached preview" (PRD 0014). These PRD-local words are added. None is a glossary term:

- **Contract**: the module this PRD describes: schemas, inferred types and constants.
- **Schema**: a rule that a value either passes, giving a parsed value, or fails. "Parses" means passes; "is rejected" means fails.
- **Preview stream**: the Server-Sent Events answer of the preview route.
- **Event**: one message in the preview stream: its name (`progress`, `preview`, `error`) and its JSON data.

## The contract

### Routes

Paths use `:name` for path parameters. "Q" = query string, "P" = path parameters, "B" = JSON body.

| Key | Method | Path | Request | Success answer |
|---|---|---|---|---|
| `artists` | GET | `/api/artists` | Q `{ name }` | 200 `{ artists: ArtistCandidate[] }` |
| `artistSetlists` | GET | `/api/artists/:mbid/setlists` | P `{ mbid }`, Q `{ page? }` | 200 `{ artist: { mbid, name? }, setlists: SetlistSummary[], hasMore }` |
| `setlistLinks` | GET | `/api/setlist-links` | Q `{ url }` | 200 `{ setlistId }` |
| `setlist` | GET | `/api/setlists/:id` | P `{ id }` | 200 `{ show, incompleteStatus, playlist }` |
| `setlistPreview` | GET | `/api/setlists/:id/preview` | P `{ id }` | 200 `text/event-stream`: preview stream |
| `setlistPlaylist` | POST | `/api/setlists/:id/playlist` | P `{ id }`, B `{ versionId }` | 200 `{ url, status }` |
| `adminLogin` | GET | `/admin/login` | none | 302 to Spotify's authorize page |
| `adminCallback` | GET | `/admin/callback` | Q `{ code?, error?, state }` | 302 to `/admin` or `/admin?login=<code>` |
| `adminStatus` | GET | `/api/admin/status` | none | 200 admin status |
| `adminLogout` | POST | `/api/admin/logout` | B none or `{}` | 204, no body |

### Shapes

Every optional field below is either present with a value of its type or absent (no key). `null` is never a value. "Non-empty" means at least one character.

| Shape | Fields | Carried from the core | Dropped from the core |
|---|---|---|---|
| `ArtistCandidate` | `name` (non-empty), `mbid` (mbid), `disambiguation?` (non-empty) | `ArtistCandidate` as is | `autoPick` of the candidates result |
| `IncompleteStatus` | `isIncomplete` (boolean), `unknownSongCount` (whole number ≥ 0), `matchedPhrase?` (non-empty), `setlistNote?` (non-empty) | as is | — |
| `SetlistSummary` | `id` (setlist id), `date` (`YYYY-MM-DD`), `venue`, `city`, `songCount` (whole number ≥ 0), `incompleteStatus` | as is | `versionId` (the list doesn't need it; the preview gives the version) |
| `Show` | `artist` (non-empty), `date` (`YYYY-MM-DD`), `venue`, `city`, `url` (https link on setlist.fm) | as is | — |
| `PreviewPerformance` | `position` (whole number ≥ 1), `title` (non-empty), `setLabel` (non-empty), `originalArtist?` (non-empty; present means a **Cover**), `medley?` (non-empty; present means a medley part) | `Performance` | `artist` (always the Show's Artist), `isTape` (never true in the web) |
| `Match` | `kind: "match"`, `name` (non-empty), `artists` (at least one non-empty string), `album`, `live` (boolean) | `Match` | `uri`, `id` |
| `Miss` | `kind: "miss"`, `title` (non-empty), `artist` (non-empty), `originalArtist?` (non-empty) | `Miss` | `queries` |
| `PreviewRow` | `number` (whole number ≥ 1), `performance` (`PreviewPerformance`), `outcome` (`Match` or `Miss`, told apart by `kind`) | `PreviewRow` | — |
| `PreviewMiss` | `number` (the row number of that Miss), `title`, `artist`, `originalArtist?` | `Miss`, plus the row number | `kind`, `queries` |
| `NotAdded` | `{ reason: "snippet" \| "tape", name }` (name non-empty) or `{ reason: "unknown", after (whole number ≥ 0), info? (non-empty) }` | `NotAdded` as is | — |
| `PlaylistStatus` | `{ status: "none" }` or `{ status: "current" \| "outdated", url }` | `SetlistPlaylistLookup` | `playlistId`; `kind` is renamed `status`, `shareUrl` is renamed `url` |
| `ApiError` | `code` (one of the 8 codes), `message` (non-empty), `hint?` (non-empty) | — | — |

The identifier shapes:

- **setlist id**: 1 to 32 characters, each `0`–`9` or `a`–`f`, in either case. It parses to lower case (as the core's link reader returns it, PRD 0001).
- **mbid**: 8-4-4-4-12 hexadecimal digits with hyphens, in either case, such as `83b9cbe7-9857-49e2-ab8e-b57b01038103`. It parses to lower case. Any UUID version is accepted.
- **version** (`versionId`): 1 to 64 characters, none of them whitespace. It is opaque and parses unchanged.
- **Spotify share link** (`url` in `PlaylistStatus` and in the create answer): `https://open.spotify.com/playlist/` followed by one or more letters and digits, and nothing else.
- **setlist.fm link** (`Show.url`): `https://`, then `setlist.fm` or any subdomain of it, then `/` and anything.

### Route answers

| Answer | Shape |
|---|---|
| Artist search | `{ artists: ArtistCandidate[] }`, at most 10, in setlist.fm's order. No results is `{ artists: [] }`, not an error. |
| Setlist page | `{ artist: { mbid, name? }, setlists: SetlistSummary[], hasMore: boolean }`. `name` (non-empty) is present when the server knows the Artist's name. |
| Setlist link | `{ setlistId }` (setlist id). |
| Setlist status | `{ show: Show, incompleteStatus: IncompleteStatus, playlist: PlaylistStatus }` |
| Create or update | `{ url: Spotify share link, status: "created" \| "updated" }` |
| Admin status | `{ hostAccount: { connected: boolean, displayName? }, config: { name: ConfigItem, present: boolean }[], usage: { playlistsMade, opens, perDay, topArtists }, rateLimitHitsToday }` (see AC-22). `name` is a human-readable label from the fixed config list, never an env name or a value. |
| Any error | `{ error: ApiError }` |

### Preview stream events

| Event name | Data | When |
|---|---|---|
| `progress` | `{ n, total }`: whole numbers, `1 ≤ n ≤ total` | before each Match search; none for a cached preview |
| `preview` | `{ show, incompleteStatus, rows: PreviewRow[], misses: PreviewMiss[], notAdded: NotAdded[], playlistName, versionId }` | once, at the end, after a successful preview |
| `error` | `ApiError` (not wrapped in `{ error: … }`) | once, at the end, instead of `preview` |

`playlistName` is non-empty. `versionId` is the version the preview was made from; the client sends it back to create or update.

### Constants

| Constant | Value |
|---|---|
| Error codes, in this order | `INVALID_INPUT`, `NOT_FOUND`, `RATE_LIMITED`, `UPSTREAM_UNAVAILABLE`, `PLAYLISTS_UNAVAILABLE`, `SETLIST_CHANGED`, `NOT_ADMIN`, `INTERNAL` |
| Preview event names | `progress`, `preview`, `error` |
| Artist name, longest | 200 characters, after trimming |
| setlist.fm link, longest | 2048 characters, after trimming |
| Version, longest | 64 characters |
| Setlist page, highest | 1000 |
| Setlist page, default | 1 |
| Top Artists, most | 10 |
| Days in the usage table | 30 |
| Config items (admin status labels), in this order | `setlist.fm API key` (`SETLISTFM_API_KEY`), `Spotify client id` (`SPOTIFY_CLIENT_ID`), `Host Account id` (`PLAYSET_HOST_SPOTIFY_ID`), `Cookie secret` (the cookie secret). The env names in brackets are for the server only and never appear in an answer. Rate-limit numbers, port and data file have defaults and are not listed. |

### Export names

The test-writer imports these from the contract's entry point. The names are part of the contract.

| Kind | Names |
|---|---|
| Constants | `ROUTES` (the route keys above → their paths), `ERROR_CODES`, `CONFIG_ITEMS` (the config labels, in order), `PREVIEW_EVENTS` (`{ progress, preview, error }` → the event names), `LIMITS` (`artistNameMaxLength`, `setlistLinkMaxLength`, `versionIdMaxLength`, `pageMax`, `pageDefault`, `topArtistsMax`, `usageDays`) |
| Building-block schemas | `setlistIdSchema`, `mbidSchema`, `versionIdSchema`, `incompleteStatusSchema`, `showSchema`, `artistCandidateSchema`, `setlistSummarySchema`, `previewPerformanceSchema`, `matchSchema`, `missSchema`, `previewRowSchema`, `previewMissSchema`, `notAddedSchema`, `playlistStatusSchema`, `apiErrorSchema`, `errorBodySchema` |
| Request schemas | `artistsQuerySchema`, `artistSetlistsParamsSchema`, `artistSetlistsQuerySchema`, `setlistLinksQuerySchema`, `setlistParamsSchema`, `createPlaylistBodySchema`, `adminCallbackQuerySchema`, `adminPageQuerySchema`, `adminLogoutBodySchema` |
| Answer schemas | `artistsResponseSchema`, `artistSetlistsResponseSchema`, `setlistLinksResponseSchema`, `setlistResponseSchema`, `createPlaylistResponseSchema`, `adminStatusResponseSchema` |
| Event schemas | `previewProgressSchema`, `previewResultSchema`, `previewErrorSchema` |
| Types | one per schema, its name without `Schema` and with a capital first letter (`ArtistsQuery`, `PreviewResult`, `ApiError`, `ErrorBody`, …), plus `ErrorCode`, `ConfigItem` and `PreviewEventName` |

The setlist, Setlist-page and create-or-update route keys all take `:id`; `setlistParamsSchema` is the one schema for that parameter.

### Wire rules (for Slices 16 to 19; not checked in this Slice)

- JSON answers use `Content-Type: application/json`. An error answer has an error status and the error body. A `RATE_LIMITED` answer also has a `Retry-After` header in whole seconds.
- The preview route answers `Content-Type: text/event-stream`. Each event is one `event: <name>` line, one `data: <JSON>` line and a blank line. Lines starting with `:` (keep-alive comments) may appear and mean nothing. Progress events come with `n` counting up from 1 by 1. Then exactly one `preview` or `error` event comes, and the server closes the stream.
- An error the server knows before it sends the first event (invalid id, preview limit, Host Account not connected, Setlist not found, setlist.fm unavailable) is a plain JSON error answer with its status and, for `RATE_LIMITED`, `Retry-After`. Only an error after the first event is an `error` event. The client therefore reads the stream with a request that can see the status, not with a bare `EventSource`.
- A client that closes the preview stream ends the Matching (PRD 0012 AC-17).
- Path parameters are percent-encoded by the client and decoded before the schema sees them.
- The admin redirect routes never answer JSON. `/admin/callback` redirects to `/admin` on success. On failure it redirects to `/admin?login=<code>`: `NOT_ADMIN` for an account that isn't the Host Account, `INVALID_INPUT` for a denied consent, a missing or wrong `state` or a query the schema rejects, `UPSTREAM_UNAVAILABLE` when Spotify can't be reached, and `INTERNAL` otherwise.
- `POST /api/admin/logout` answers 204 whether or not an admin cookie was sent.

### What each error code means

Both halves rely on these meanings. Slice 16's catalogue gives the status and the wording.

| Code | Used when |
|---|---|
| `INVALID_INPUT` | a query, path parameter or body is rejected by its schema; a link isn't a setlist.fm Setlist link; a create is asked for a Setlist with no Matches |
| `NOT_FOUND` | setlist.fm has no such Setlist or Artist; an unknown `/api` path |
| `RATE_LIMITED` | a Playset limit (per IP, per day, preview) is reached, or setlist.fm or Spotify still answers 429 after the core's retries |
| `UPSTREAM_UNAVAILABLE` | setlist.fm or Spotify fails or can't be reached |
| `PLAYLISTS_UNAVAILABLE` | preview or create/update while the Host Account is not connected |
| `SETLIST_CHANGED` | create/update with a `versionId` that is no longer the Setlist's version |
| `NOT_ADMIN` | an admin route without a valid admin cookie; a login by an account that isn't the Host Account |
| `INTERNAL` | anything else |

## Acceptance criteria

Each AC is about the contract on its own: values parsed or rejected by its schemas, its constants and its inferred types. "Unknown keys" means keys the shape doesn't name.

### Constants

- **AC-1** — Given the contract, when its route paths are read, then each route key has exactly the path in the Routes table: `artists` → `/api/artists`, `artistSetlists` → `/api/artists/:mbid/setlists`, `setlistLinks` → `/api/setlist-links`, `setlist` → `/api/setlists/:id`, `setlistPreview` → `/api/setlists/:id/preview`, `setlistPlaylist` → `/api/setlists/:id/playlist`, `adminLogin` → `/admin/login`, `adminCallback` → `/admin/callback`, `adminStatus` → `/api/admin/status`, `adminLogout` → `/api/admin/logout`. There are no other keys.
- **AC-2** — Given the contract, when its error codes, preview event names and limits are read, then the error codes are exactly the 8 of the Constants table in that order. The event names are `progress`, `preview` and `error`. The limits are 200, 2048, 64, 1000, 1, 10 and 30, as in the Constants table. The config items are exactly `setlist.fm API key`, `Spotify client id`, `Host Account id` and `Cookie secret`, in that order.

### Error body

- **AC-3** — Given an error body `{ error: { code, message, hint? } }`, when it is parsed, then it parses when `code` is one of the 8 codes, `message` is non-empty and `hint` is absent or non-empty. It is rejected when `code` is another string, when `message` is missing or empty, when `hint` is empty or `null`, and when the body or the inner error has an unknown key (such as `stack`, `cause` or `status`).

### Artist search

- **AC-4** — Given the Artist search query, when it is parsed, then `name` is trimmed and parses when the trimmed name has 1 to 200 characters. It is rejected when `name` is missing, empty, only whitespace, longer than 200 characters after trimming, or given more than once (a list). Other query keys are ignored and dropped from the parsed value.
- **AC-5** — Given an Artist search answer, when it is parsed, then `{ artists: [...] }` with 0 to 10 candidates parses. Each candidate needs a non-empty `name` and an mbid, and `disambiguation` is absent or non-empty. It is rejected with 11 candidates, with an `autoPick` key, with a candidate's `disambiguation` of `""` or `null`, or with a candidate's mbid that isn't an mbid.

### Setlist page

- **AC-6** — Given the Setlist-page path parameters, when `mbid` is parsed, then an mbid in either case parses to lower case. A value that isn't 8-4-4-4-12 hexadecimal digits with hyphens is rejected (too short, braces, a non-hex digit, no hyphens).
- **AC-7** — Given the Setlist-page query, when it is parsed, then a missing `page` parses to 1. `page` made only of digits with no leading zero, from `1` to `1000`, parses to that number. It is rejected for `0`, `-1`, `1.5`, `01`, `1e2`, ` 2`, `abc`, `""`, `1001` and when given more than once. Other query keys are ignored.
- **AC-8** — Given a Setlist-page answer, when it is parsed, then `{ artist: { mbid, name? }, setlists, hasMore }` parses with `name` absent or non-empty and every Setlist summary as in the Shapes table, including an empty `setlists`. A summary's `incompleteStatus` parses with or without `matchedPhrase` and `setlistNote`. It is rejected when a summary has `versionId` or another unknown key, when `date` isn't `YYYY-MM-DD`, when `songCount` is negative or not whole, or when `hasMore` is missing.

### Setlist link

- **AC-9** — Given the Setlist-link query, when it is parsed, then `url` is trimmed and parses when it has 1 to 2048 characters, whatever it holds (a non-setlist.fm link parses too). It is rejected when missing, empty, only whitespace, longer than 2048 characters after trimming, or given more than once. Given a Setlist-link answer, then `{ setlistId }` parses with a setlist id and is rejected with any other value or an unknown key.

### Setlist id

- **AC-10** — Given a setlist id (the `:id` parameter, or `setlistId` and `SetlistSummary.id` in answers), when it is parsed, then 1 to 32 hexadecimal characters in either case parse to lower case. It is rejected when empty, longer than 32, or holding any other character (such as `g`, `-`, `.html` or a space).

### Setlist status

- **AC-11** — Given a Setlist status answer, when it is parsed, then `{ show, incompleteStatus, playlist }` parses with:
  - a Show whose `url` is an https link on setlist.fm or a subdomain of it;
  - `playlist` equal to `{ status: "none" }` with no `url`, or `{ status: "current" | "outdated", url }` with a Spotify share link.

  It is rejected for `status: "none"` with a `url`, for `current` or `outdated` without one, for a `url` that isn't a Spotify share link (another host, `http://`, a `/track/` link, a query string), for another `status` value, and for a `playlistId` key.

### Preview stream

- **AC-12** — Given a progress event's data, when it is parsed, then `{ n, total }` parses when both are whole numbers of 1 or more and `n` is at most `total`. It is rejected for `n: 0`, for `n` greater than `total`, for a fraction, and for a `performance` key.
- **AC-13** — Given a preview event's data, when it is parsed, then it parses with every field of the Preview stream events table, and each row as in the Shapes table:
  - an outcome told apart by `kind` (`match` or `miss`);
  - a Match with at least one artist;
  - a Performance with or without `originalArtist` and `medley`.

  It is rejected for a missing `versionId` or an invalid one, for an empty `playlistName`, and for any core field the contract drops: a Match's `uri` or `id`, a Miss's `queries`, a Performance's `artist` or `isTape`, or a top-level `matches` list.
- **AC-14** — Given a preview event's `notAdded` list, when it is parsed, then a snippet `{ reason: "snippet", name }`, a left-out Tape `{ reason: "tape", name }` and an Unknown Song `{ reason: "unknown", after, info? }` each parse, with `after` 0 or more. It is rejected for an Unknown Song with a `name`, a snippet or Tape without a `name`, another `reason`, a negative `after`, or `info: ""`.
- **AC-15** — Given a preview event's `misses` list, when it is parsed, then each entry `{ number, title, artist, originalArtist? }` parses. It is rejected with `kind` or `queries`.
- **AC-16** — Given a preview of a Setlist with no kept Performances (a Placeholder Setlist, or one with only Tapes, snippets and Unknown Songs), when its data is parsed, then `rows: []` and `misses: []` parse, with any `notAdded` entries.
- **AC-17** — Given an error event's data, when it is parsed, then `{ code, message, hint? }` parses under the same rules as the inner error of AC-3. The wrapped error body `{ error: { … } }` is rejected as event data.

### Create or update

- **AC-18** — Given a create body, when it is parsed, then `{ versionId }` parses with a version of 1 to 64 characters with no whitespace, unchanged. It is rejected when `versionId` is missing, empty, longer than 64 characters, contains whitespace or isn't a string, when the body has any other key (such as `public` or `setlistId`), and when the body is not an object (an array, a string, `null`).
- **AC-19** — Given a create answer, when it is parsed, then `{ url, status }` parses with a Spotify share link and `status` `created` or `updated`. It is rejected for another status (such as `current`), for a `url` that isn't a Spotify share link, and for an unknown key (such as `playlistId` or `trackCount`).

### Admin

- **AC-20** — Given the admin callback query, when it is parsed, then `{ code, state }` parses, and so does `{ error, state }`, each value a non-empty string. It is rejected without `state`, with both `code` and `error`, with neither, or with an empty value. Other query keys are ignored.
- **AC-21** — Given the admin page query, when it is parsed, then an absent `login` parses, and so does a `login` equal to one of the 8 error codes. Any other `login` value is rejected.
- **AC-22** — Given an admin status answer, when it is parsed, then it parses with:
  - `hostAccount`: `{ connected }`, and `displayName` absent or non-empty;
  - `config`: a list of `{ name, present }`, `name` exactly one of the config labels (`setlist.fm API key`, `Spotify client id`, `Host Account id`, `Cookie secret`), `present` a boolean;
  - `usage.playlistsMade` and `usage.opens`: whole numbers of 0 or more;
  - `usage.perDay`: exactly 30 entries `{ date (YYYY-MM-DD), created, updated, opened }`, each count a whole number of 0 or more;
  - `usage.topArtists`: 0 to 10 entries `{ artist (non-empty), playlistCount (whole number ≥ 1) }`;
  - `rateLimitHitsToday`: a whole number of 0 or more.

  It is rejected for 29 or 31 days, for 11 top Artists, for a config entry with a `value` key, for a config `name` that is an env name (such as `SETLISTFM_API_KEY`) or any other string not in the list, and for a `hostAccount` with an `id` key.
- **AC-23** — Given the admin logout body, when it is parsed, then an absent body and `{}` parse. A body with any key is rejected.

### Every answer and event

- **AC-24** — Given any answer or event schema, when a value has an unknown key at any level (top level, nested object or list entry), then it is rejected. When an optional field is `null`, then it is rejected. Request schemas reject unknown keys only in bodies (AC-18, AC-23); query and path schemas ignore them (AC-4, AC-7, AC-9, AC-20).

### Types and boundaries

- **AC-25** — Given the inferred types, when they are checked at compile time, then:
  - `ErrorCode` is exactly the union of the 8 code strings;
  - `PreviewEventName` is exactly `"progress" | "preview" | "error"`;
  - `ConfigItem` is exactly `"setlist.fm API key" | "Spotify client id" | "Host Account id" | "Cookie secret"`, and an admin status config entry's `name` is `ConfigItem`;
  - `PreviewRow["outcome"]` is `Match | Miss`, and narrowing on `kind === "match"` gives `Match`;
  - `NotAdded` narrowed on `reason === "unknown"` has `after: number` and `info?: string`, and no `name`;
  - `PlaylistStatus` narrowed on `status === "none"` has no `url`, and on `"current"` has `url: string`;
  - the parsed Setlist-page query has `page: number`;
  - the parsed create body is `{ versionId: string }`;
  - `CreatePlaylistResponse["status"]` is `"created" | "updated"`;
  - `ArtistCandidate` has `disambiguation?: string` and no `autoPick`;
  - `Match` has no `uri`;
  - `Miss` has no `queries`.
- **AC-26** — Given every file of the contract, when its imports are listed, then each import is either the schema library (`zod`) or another file of the contract. No file imports a Node built-in (`node:*` or a bare Node module name), the server, the client or the core.

## Examples

### X1 — Constants (AC-1, AC-2)

```json
{
  "artists": "/api/artists",
  "artistSetlists": "/api/artists/:mbid/setlists",
  "setlistLinks": "/api/setlist-links",
  "setlist": "/api/setlists/:id",
  "setlistPreview": "/api/setlists/:id/preview",
  "setlistPlaylist": "/api/setlists/:id/playlist",
  "adminLogin": "/admin/login",
  "adminCallback": "/admin/callback",
  "adminStatus": "/api/admin/status",
  "adminLogout": "/api/admin/logout"
}
```

Error codes: `["INVALID_INPUT","NOT_FOUND","RATE_LIMITED","UPSTREAM_UNAVAILABLE","PLAYLISTS_UNAVAILABLE","SETLIST_CHANGED","NOT_ADMIN","INTERNAL"]`. Event names: `{ "progress": "progress", "preview": "preview", "error": "error" }`. Limits: `{ "artistNameMaxLength": 200, "setlistLinkMaxLength": 2048, "versionIdMaxLength": 64, "pageMax": 1000, "pageDefault": 1, "topArtistsMax": 10, "usageDays": 30 }`. Config items: `["setlist.fm API key","Spotify client id","Host Account id","Cookie secret"]`.

### X2 — Error body (AC-3, AC-17)

| Value | Result |
|---|---|
| `{"error":{"code":"RATE_LIMITED","message":"Too many playlists from here in the last hour.","hint":"Try again in a few minutes."}}` | parses |
| `{"error":{"code":"NOT_FOUND","message":"setlist.fm has no Setlist with that id."}}` | parses |
| `{"error":{"code":"TEAPOT","message":"x"}}` | rejected (unknown code) |
| `{"error":{"code":"INTERNAL","message":""}}` | rejected (empty message) |
| `{"error":{"code":"INTERNAL","message":"Something went wrong on our side.","hint":null}}` | rejected (`null`) |
| `{"error":{"code":"INTERNAL","message":"Something went wrong on our side.","stack":"Error: at …"}}` | rejected (unknown key) |
| `{"error":{"code":"UPSTREAM_UNAVAILABLE","message":"setlist.fm isn't answering right now."},"status":503}` | rejected (unknown key) |
| `{"code":"UPSTREAM_UNAVAILABLE","message":"setlist.fm isn't answering right now.","hint":"Try again in a minute."}` as error-event data | parses |
| `{"error":{"code":"UPSTREAM_UNAVAILABLE","message":"setlist.fm isn't answering right now."}}` as error-event data | rejected (wrapped) |

### X3 — Artist search (AC-4, AC-5)

Query (as Express gives it):

| Query | Result |
|---|---|
| `{ "name": "Arctic Monkeys" }` | `{ name: "Arctic Monkeys" }` |
| `{ "name": "  arctic monkeys  " }` | `{ name: "arctic monkeys" }` |
| `{ "name": "Sigur Rós", "_": "1764320000" }` | `{ name: "Sigur Rós" }` (the `_` key dropped) |
| `{ "name": "A".repeat(200) }` | parses |
| `{ "name": " " + "A".repeat(200) + " " }` | parses (200 after trimming) |
| `{ "name": "A".repeat(201) }` | rejected |
| `{}`, `{ "name": "" }`, `{ "name": "   " }` | rejected |
| `{ "name": ["Genesis", "Pearl Jam"] }` | rejected |

Answer (PRD 0012 F1's Genesis search):

```json
{ "artists": [
  { "name": "Genesis", "mbid": "8e3fcd7d-bda1-4ca0-b987-b8528d2ee74e", "disambiguation": "English rock band" },
  { "name": "Genesis", "mbid": "2f4b1c6e-0d3a-4e5b-8c7d-9e0f1a2b3c4d", "disambiguation": "US psychedelic rock band" },
  { "name": "Genesis Owusu", "mbid": "4a5b6c7d-8e9f-4a0b-9c1d-2e3f4a5b6c7d" }
] }
```

It parses. `{ "artists": [] }` parses. Each of these is rejected: the same with `"autoPick": { … }` added; a candidate with `"disambiguation": ""`; a candidate with `"mbid": "8e3fcd7d"`; 11 candidates.

### X4 — Setlist page (AC-6, AC-7, AC-8)

Path parameters:

| `mbid` | Result |
|---|---|
| `83b9cbe7-9857-49e2-ab8e-b57b01038103` | parses, unchanged |
| `83B9CBE7-9857-49E2-AB8E-B57B01038103` | `83b9cbe7-9857-49e2-ab8e-b57b01038103` |
| `83b9cbe7`, `{83b9cbe7-9857-49e2-ab8e-b57b01038103}`, `83b9cbe7985749e2ab8eb57b01038103`, `83b9cbe7-9857-49e2-ab8e-b57b0103810g` | rejected |

Query:

| `page` | Result |
|---|---|
| absent | `1` |
| `"1"`, `"2"`, `"66"`, `"1000"` | `1`, `2`, `66`, `1000` |
| `"0"`, `"-1"`, `"1.5"`, `"01"`, `"1e2"`, `" 2"`, `"abc"`, `""`, `"1001"`, `["1","2"]` | rejected |

Answer (PRD 0012 P1):

```json
{
  "artist": { "mbid": "83b9cbe7-9857-49e2-ab8e-b57b01038103", "name": "Pearl Jam" },
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

It parses. These parse too: page 67's `{ "artist": { "mbid": "83b9cbe7-9857-49e2-ab8e-b57b01038103" }, "setlists": [], "hasMore": false }` (no name).

Each of these is rejected: the Portland summary with `"versionId": "g4bd1a2f6"` added; `"date": "22-11-2026"`; `"songCount": -1`; `"songCount": 2.5`; no `hasMore`; `"artist": { "mbid": "…", "name": "" }`.

### X5 — Setlist link and setlist id (AC-9, AC-10)

| Link query `url` | Result |
|---|---|
| `https://www.setlist.fm/setlist/arctic-monkeys/2026/estadio-metropolitano-madrid-spain-73a1b2c5.html` | parses, unchanged |
| `"  https://www.setlist.fm/setlist/nirvana/1987/community-world-theater-tacoma-wa-53d60349.html\n"` | parses, trimmed |
| `https://example.com/x` | parses (the server rejects it with `INVALID_INPUT`, not the contract) |
| `"https://www.setlist.fm/" + "a".repeat(2025)` (2048 characters) | parses |
| 2049 characters | rejected |
| absent, `""`, `"  "`, a list of two links | rejected |

| Setlist id | Result |
|---|---|
| `63a5e2b7`, `53d60349`, `2bf1c8e4` | parses, unchanged |
| `63A5E2B7` | `63a5e2b7` |
| `a` (1 character), 32 × `f` | parses |
| `""`, 33 × `f`, `63a5e2bz`, `63a5e2b7.html`, `63a5-e2b7`, ` 63a5e2b7` | rejected |

Link answer: `{ "setlistId": "73a1b2c5" }` parses; `{ "setlistId": "73a1b2c5", "url": "…" }` and `{ "setlistId": "not-hex" }` are rejected.

### X6 — Setlist status (AC-11)

Fixture H v1 (PRD 0014), recorded and current:

```json
{
  "show": { "artist": "Pearl Jam", "date": "2026-11-22", "venue": "Moda Center", "city": "Portland",
    "url": "https://www.setlist.fm/setlist/pearl-jam/2026/moda-center-portland-or-2bf1c8e4.html" },
  "incompleteStatus": { "isIncomplete": true, "unknownSongCount": 1 },
  "playlist": { "status": "current", "url": "https://open.spotify.com/playlist/5PqRsTuVwXyZaBcDeFgHiJ" }
}
```

| `playlist` (rest as above) | Result |
|---|---|
| `{ "status": "none" }` | parses |
| `{ "status": "outdated", "url": "https://open.spotify.com/playlist/5PqRsTuVwXyZaBcDeFgHiJ" }` | parses |
| `{ "status": "none", "url": "https://open.spotify.com/playlist/5PqRsTuVwXyZaBcDeFgHiJ" }` | rejected |
| `{ "status": "current" }` | rejected |
| `{ "status": "current", "url": "https://open.spotify.com/track/4xGvbS8NnKtwKw5CXGkmA9" }` | rejected |
| `{ "status": "current", "url": "https://open.spotify.com/playlist/5PqRsTuVwXyZaBcDeFgHiJ?si=abc" }` | rejected |
| `{ "status": "current", "url": "http://open.spotify.com/playlist/5PqRsTuVwXyZaBcDeFgHiJ" }` | rejected |
| `{ "status": "current", "url": "https://open.spotify.com/playlist/5PqRsTuVwXyZaBcDeFgHiJ", "playlistId": "5PqRsTuVwXyZaBcDeFgHiJ" }` | rejected |
| `{ "status": "created", "url": "…" }` | rejected |

`show.url` of `https://de.setlist.fm/setlist/pearl-jam/2026/moda-center-portland-or-2bf1c8e4.html` parses; `https://example.com/setlist/…` and `http://www.setlist.fm/…` are rejected.

### X7 — Preview stream (AC-12 to AC-17)

A preview of PRD 0012 P2's Madrid Setlist (Arctic Monkeys, `73a1b2c5`, version `g3e5f7a91`), with every Tape left out. Here the Spotify fake finds no Match for "505".

Stream as sent (wire rules), with the data parsed by the event schemas:

```
event: progress
data: {"n":1,"total":5}

event: progress
data: {"n":2,"total":5}

… (n = 3, 4, 5)

event: preview
data: { …the JSON below… }
```

```json
{
  "show": { "artist": "Arctic Monkeys", "date": "2026-06-02", "venue": "Estadio Metropolitano", "city": "Madrid",
    "url": "https://www.setlist.fm/setlist/arctic-monkeys/2026/estadio-metropolitano-madrid-spain-73a1b2c5.html" },
  "incompleteStatus": { "isIncomplete": true, "unknownSongCount": 1 },
  "rows": [
    { "number": 1, "performance": { "position": 2, "title": "Brianstorm", "setLabel": "main" },
      "outcome": { "kind": "match", "name": "Brianstorm", "artists": ["Arctic Monkeys"], "album": "Favourite Worst Nightmare", "live": false } },
    { "number": 2, "performance": { "position": 3, "title": "Do I Wanna Know?", "setLabel": "main", "medley": "Do I Wanna Know? / R U Mine?" },
      "outcome": { "kind": "match", "name": "Do I Wanna Know?", "artists": ["Arctic Monkeys"], "album": "AM", "live": false } },
    { "number": 3, "performance": { "position": 4, "title": "R U Mine?", "setLabel": "main", "medley": "Do I Wanna Know? / R U Mine?" },
      "outcome": { "kind": "match", "name": "R U Mine?", "artists": ["Arctic Monkeys"], "album": "AM", "live": false } },
    { "number": 4, "performance": { "position": 5, "title": "Brianstorm", "setLabel": "main" },
      "outcome": { "kind": "match", "name": "Brianstorm", "artists": ["Arctic Monkeys"], "album": "Favourite Worst Nightmare", "live": false } },
    { "number": 5, "performance": { "position": 6, "title": "505", "setLabel": "Encore 1" },
      "outcome": { "kind": "miss", "title": "505", "artist": "Arctic Monkeys" } }
  ],
  "misses": [ { "number": 5, "title": "505", "artist": "Arctic Monkeys" } ],
  "notAdded": [
    { "reason": "tape", "name": "Intro" },
    { "reason": "snippet", "name": "Hey Jude" },
    { "reason": "unknown", "after": 3 },
    { "reason": "snippet", "name": "Kashmir" }
  ],
  "playlistName": "Arctic Monkeys – 2026-06-02 – Madrid",
  "versionId": "g3e5f7a91"
}
```

It parses. Brianstorm appears twice, as two rows. The left-out Tape "Intro" is in `notAdded` and is no row, so row 1 has position 2.

A Cover row (PRD 0011 U1, Nirvana; the row numbers and positions in these Nirvana fragments are illustrative) parses:

```json
{ "number": 3, "performance": { "position": 3, "title": "Love Buzz", "setLabel": "main", "originalArtist": "Shocking Blue" },
  "outcome": { "kind": "match", "name": "Love Buzz", "artists": ["Nirvana"], "album": "Bleach", "live": false } }
```

So do the Miss entry `{ "number": 9, "title": "Spank Thru", "artist": "Nirvana" }` and the not-added entry `{ "reason": "unknown", "after": 7, "info": "Written as 'Dope Hippie' on the setlist" }`.

Each change below to the Madrid preview is rejected:

| Change | Why |
|---|---|
| row 1's outcome gets `"uri": "spotify:track:2JUVKZaRwH8L3h5eKq7EvC"` | dropped field |
| row 1's outcome gets `"id": "2JUVKZaRwH8L3h5eKq7EvC"` | dropped field |
| row 5's outcome gets `"queries": ["track:\"505\" artist:\"Arctic Monkeys\""]` | dropped field |
| row 1's performance gets `"artist": "Arctic Monkeys"` or `"isTape": false` | dropped field |
| a top-level `"matches": [...]` | dropped field |
| row 1's outcome `"artists": []` | a Match needs an artist |
| row 1's outcome `"kind": "found"` | unknown kind |
| `misses[0]` gets `"kind": "miss"` | not in a Miss entry |
| `notAdded[2]` becomes `{ "reason": "unknown", "after": 3, "name": "" }` | an Unknown Song has no name |
| `notAdded[1]` becomes `{ "reason": "snippet" }` | a snippet needs its name |
| `notAdded[2]` becomes `{ "reason": "unknown", "after": -1 }` or `{ "reason": "unknown", "after": 3, "info": "" }` | bad `after` or empty info |
| `notAdded[0]` becomes `{ "reason": "skipped", "name": "Intro" }` | unknown reason |
| no `versionId`, `"versionId": ""` or `"versionId": "g3e5 f7a91"` | version required |
| `"playlistName": ""` | must be non-empty |
| `"incompleteStatus": { "isIncomplete": true, "unknownSongCount": 1, "matchedPhrase": null }` | `null` |

Empty preview (PRD 0011 T1d: only `{ "name": "" }` and `{ "name": "", "info": "Opener" }`) parses:

```json
{ "show": { "artist": "Pearl Jam", "date": "2026-11-22", "venue": "Moda Center", "city": "Portland",
    "url": "https://www.setlist.fm/setlist/pearl-jam/2026/moda-center-portland-or-2bf1c8e4.html" },
  "incompleteStatus": { "isIncomplete": true, "unknownSongCount": 2 },
  "rows": [], "misses": [],
  "notAdded": [ { "reason": "unknown", "after": 0 }, { "reason": "unknown", "after": 0, "info": "Opener" } ],
  "playlistName": "Pearl Jam – 2026-11-22 – Portland", "versionId": "g4bd1a2f6" }
```

Progress data:

| Data | Result |
|---|---|
| `{"n":1,"total":5}`, `{"n":5,"total":5}` | parses |
| `{"n":0,"total":5}`, `{"n":6,"total":5}`, `{"n":1.5,"total":5}`, `{"n":1,"total":0}` | rejected |
| `{"n":1,"total":5,"performance":{"title":"Brianstorm"}}` | rejected |

A cached preview (PRD 0014 AC-8) is a stream with no `progress` event and one `preview` event. A preview that fails after progress 2 of 5 (Spotify unreachable) is `progress` 1, `progress` 2, then `event: error` with `{"code":"UPSTREAM_UNAVAILABLE","message":"Spotify isn't answering right now.","hint":"Try again in a minute."}`.

### X8 — Create or update (AC-18, AC-19)

| Body | Result |
|---|---|
| `{ "versionId": "g4bd1a2f6" }` | `{ versionId: "g4bd1a2f6" }` |
| `{ "versionId": "G4BD1A2F6" }` | unchanged (opaque, not lower-cased) |
| `{ "versionId": "x".repeat(64) }` | parses |
| `{}`, `{ "versionId": "" }`, `{ "versionId": "x".repeat(65) }`, `{ "versionId": "g4bd 1a2f6" }`, `{ "versionId": " g4bd1a2f6" }`, `{ "versionId": 42 }` | rejected |
| `{ "versionId": "g4bd1a2f6", "public": false }` | rejected (unknown key) |
| `{ "versionId": "g4bd1a2f6", "setlistId": "2bf1c8e4" }` | rejected (unknown key) |
| `["g4bd1a2f6"]`, `"g4bd1a2f6"`, `null` | rejected |

| Answer | Result |
|---|---|
| `{ "url": "https://open.spotify.com/playlist/5PqRsTuVwXyZaBcDeFgHiJ", "status": "created" }` | parses |
| `{ "url": "https://open.spotify.com/playlist/6QrStUvWxYzAbCdEfGhIjK", "status": "updated" }` | parses |
| `{ "url": "…5PqRsTuVwXyZaBcDeFgHiJ", "status": "current" }` | rejected |
| `{ "url": "https://open.spotify.com/playlist/5PqRsTuVwXyZaBcDeFgHiJ", "status": "created", "trackCount": 3 }` | rejected |
| `{ "url": "spotify:playlist:5PqRsTuVwXyZaBcDeFgHiJ", "status": "created" }` | rejected |

### X9 — Admin (AC-20 to AC-23)

Callback query:

| Query | Result |
|---|---|
| `{ "code": "AQDx9-test-code", "state": "q8VtG2mZ" }` | parses |
| `{ "error": "access_denied", "state": "q8VtG2mZ" }` | parses |
| `{ "code": "AQDx9-test-code", "state": "q8VtG2mZ", "iss": "https://accounts.spotify.com" }` | parses, `iss` dropped |
| `{ "code": "AQDx9-test-code" }` | rejected (no state) |
| `{ "code": "AQDx9-test-code", "error": "access_denied", "state": "q8VtG2mZ" }` | rejected (both) |
| `{ "state": "q8VtG2mZ" }` | rejected (neither) |
| `{ "code": "", "state": "q8VtG2mZ" }` | rejected |

Admin page query: `{}` and `{ "login": "NOT_ADMIN" }` parse; `{ "login": "wrong-account" }` is rejected.

Status answer:

```json
{
  "hostAccount": { "connected": true, "displayName": "playset-host" },
  "config": [
    { "name": "setlist.fm API key", "present": true },
    { "name": "Spotify client id", "present": true },
    { "name": "Host Account id", "present": true },
    { "name": "Cookie secret", "present": false }
  ],
  "usage": {
    "playlistsMade": 128,
    "opens": 1042,
    "perDay": [
      { "date": "2026-11-28", "created": 4, "updated": 1, "opened": 37 },
      { "date": "2026-11-27", "created": 2, "updated": 0, "opened": 21 },
      "… 28 more days, down to 2026-10-30 …"
    ],
    "topArtists": [
      { "artist": "Arctic Monkeys", "playlistCount": 14 },
      { "artist": "Fontaines D.C.", "playlistCount": 9 }
    ]
  },
  "rateLimitHitsToday": 3
}
```

With all 30 days filled in, it parses. A fresh install parses too: `{ "hostAccount": { "connected": false }, "config": [ … ], "usage": { "playlistsMade": 0, "opens": 0, "perDay": [30 days of zeros], "topArtists": [] }, "rateLimitHitsToday": 0 }`.

Each of these is rejected:

- `perDay` with 29 or 31 entries;
- 11 top Artists;
- `{ "name": "setlist.fm API key", "present": true, "value": "sfm-test-key-0f3c9a" }` (a `value` key);
- `{ "name": "SETLISTFM_API_KEY", "present": true }` (an env name, not a label);
- `{ "name": "Preview limit", "present": true }` (not in the fixed list);
- `{ "name": "setlist.fm api key", "present": true }` (labels match exactly, case included);
- `"hostAccount": { "connected": true, "id": "31abcxyzhost" }`;
- `"displayName": ""`;
- `{ "artist": "Arctic Monkeys", "playlistCount": 0 }`;
- `"opens": -1`.

Logout body: absent and `{}` parse; `{ "all": true }` is rejected.

### X10 — Strictness everywhere (AC-24)

| Value | Schema | Result |
|---|---|---|
| X4's page with `"extra": 1` at the top level | Setlist page answer | rejected |
| X4's page with the Portland summary's `incompleteStatus` holding `"reason": "unknown song"` | Setlist page answer | rejected |
| X6 with `"show": { …, "country": "United States" }` | Setlist status answer | rejected |
| X3's Genesis candidate with `"disambiguation": null` | Artist search answer | rejected |
| `{ "name": "Genesis", "sort": "relevance" }` | Artist search query | parses to `{ name: "Genesis" }` |
| `{ "id": "2bf1c8e4", "format": "json" }` | Setlist path parameters | parses to `{ id: "2bf1c8e4" }` |

### X11 — Types and imports (AC-25, AC-26)

Compile-time checks, for example:

```ts
expectTypeOf<ErrorCode>().toEqualTypeOf<
  "INVALID_INPUT" | "NOT_FOUND" | "RATE_LIMITED" | "UPSTREAM_UNAVAILABLE"
  | "PLAYLISTS_UNAVAILABLE" | "SETLIST_CHANGED" | "NOT_ADMIN" | "INTERNAL">();
expectTypeOf<PreviewEventName>().toEqualTypeOf<"progress" | "preview" | "error">();
expectTypeOf<PreviewRow["outcome"]>().toEqualTypeOf<Match | Miss>();
expectTypeOf<ArtistSetlistsQuery["page"]>().toEqualTypeOf<number>();
expectTypeOf<CreatePlaylistBody>().toEqualTypeOf<{ versionId: string }>();
expectTypeOf<CreatePlaylistResponse["status"]>().toEqualTypeOf<"created" | "updated">();
expectTypeOf<Extract<PlaylistStatus, { status: "current" }>["url"]>().toEqualTypeOf<string>();
expectTypeOf<Extract<PlaylistStatus, { status: "none" }>>().not.toHaveProperty("url");
expectTypeOf<Extract<NotAdded, { reason: "unknown" }>>().not.toHaveProperty("name");
expectTypeOf<Match>().not.toHaveProperty("uri");
expectTypeOf<Miss>().not.toHaveProperty("queries");
expectTypeOf<ArtistCandidate>().not.toHaveProperty("autoPick");
```

Imports: each contract file imports only from `zod` or a relative path inside the contract folder. An import of `node:crypto`, `fs`, `express`, a path into the server, client or core folders fails AC-26.

### AC coverage

| AC | Examples |
|---|---|
| AC-1 | X1 |
| AC-2 | X1 |
| AC-3 | X2 |
| AC-4 | X3 |
| AC-5 | X3 |
| AC-6 | X4 |
| AC-7 | X4 |
| AC-8 | X4 |
| AC-9 | X5 |
| AC-10 | X5 |
| AC-11 | X6 |
| AC-12 | X7 |
| AC-13 | X7 |
| AC-14 | X7 |
| AC-15 | X7 |
| AC-16 | X7 |
| AC-17 | X2, X7 |
| AC-18 | X8 |
| AC-19 | X8 |
| AC-20 | X9 |
| AC-21 | X9 |
| AC-22 | X9 |
| AC-23 | X9 |
| AC-24 | X2, X3, X10 |
| AC-25 | X11 |
| AC-26 | X11 |

## Changes to earlier PRDs

None changes behaviour. The contract only describes what the web halves send, using the core's step results. Each earlier PRD was checked:

- **PRD 0001 — setlist.fm link:** unchanged. The setlist id shape (hex, lower case) follows its reader. The contract doesn't check links; the server uses the reader.
- **PRD 0002 — Performances:** unchanged. Cover (`originalArtist`), Encore and Set (`setLabel`), repeated songs (two rows) and snippets (not-added list) are carried as the core gives them.
- **PRD 0003 — Matching:** unchanged. A Match's URI and id and a Miss's queries are left out of what the browser gets. The core still has them.
- **PRD 0004 — Spotify login:** unchanged. The admin callback shape is for the Host login of Slice 17.
- **PRD 0005 — setlist.fm:** unchanged. The Artist search answer is its first-10 rule without the chooser.
- **PRD 0006 — Setlist Playlist:** unchanged. The playlist name and share link are carried as made.
- **PRD 0007 — CLI:** unchanged. The CLI doesn't use the contract.
- **PRD 0008 — Medley split:** unchanged. A medley part carries `medley`.
- **PRD 0009 — Interactive shell:** unchanged.
- **PRD 0010 — "+" in titles:** unchanged.
- **PRD 0011 — Incomplete Setlists:** unchanged. The incomplete status and Unknown Song entries are carried in full. The web makes no "newest complete Setlist" offer, so no field for it exists.
- **PRD 0012 — Run steps:** unchanged. The shapes follow its step results, with the fields listed as dropped left out.
- **(0013 — design lock, `docs/design.md`; not a PRD):** its decision 6 (streaming granularity) is settled here: rows arrive with the final preview event. Its Setlist list shows a country the contract doesn't carry, and its Unknown Song row names a Set the contract doesn't carry (see Non-goals). Its admin Config list shows env names; the contract sends human-readable labels instead (Decision 17). Slice 18 follows the contract.
- **PRD 0014 — Host playlists:** unchanged. `versionId` and the find step's `none` / `current` / `outdated` are carried. The record's ids and `createdAt` stay on the server.

**Tests.** No existing test changes.

## Shared-file requests

For the orchestrator (this Slice does not edit shared files):

- **package.json, lockfile, lint config:** none. `zod` (v4) and `npm run lint` (oxlint) are already in place. The brief asked for ESLint, but ESLint doesn't work with TypeScript 7, so oxlint replaces it. This Slice needs nothing more.
- **src/core/index.ts:** no change. The contract imports nothing from the core.
- **CLAUDE.md:** under Architecture, add: "`src/web/shared/` — the web API contract: zod schemas for every route and preview event, inferred types, route paths, error codes, limits. Browser-safe (imports only zod); server and client both import it."
- **GLOSSARY.md:** no change.
- **docs/PLAN.md:** no change (Depends on: 12, 14).

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
- **Unknown Song** — as defined in GLOSSARY.md.
- **Incomplete Setlist** — as defined in GLOSSARY.md.
- **Setlist Playlist** — as defined in GLOSSARY.md.
- **Host Account** — as defined in GLOSSARY.md.
- **Visitor** — as defined in GLOSSARY.md.
- **Match** — as defined in GLOSSARY.md.
- **Miss** — as defined in GLOSSARY.md.

"Contract", "schema", "preview stream" and "event" are PRD-local words defined above, not glossary terms.

## Decisions (made by the PRD writer; /implementing is in full-auto mode)

1. **Answers and events are strict; requests are strict only in bodies.** Every answer and event schema rejects unknown keys at every level. That makes a leaked field (a Spotify URI, the queries, a secret, a stack) fail the server's own tests, which is how "never send an object the contract doesn't describe" gets enforced. Both halves ship together in one package, so strict answers can't break an older client. Query and path schemas ignore unknown keys, so cache-busting or tracking parameters never break a link. Bodies reject them, as the brief says.
2. **Limits:** Artist name ≤ 200 characters after trimming. setlist.fm link ≤ 2048 (the common URL ceiling). Version ≤ 64 characters with no whitespace (setlist.fm's look like `g4bd1a2f6`). Page 1–1000, with 1 as the default when absent; Grateful Dead-sized Artists have about 115 pages. Top Artists ≤ 10.
3. **Setlist id = 1–32 hexadecimal characters in either case, lower-cased.** This is the core link reader's rule (`[0-9a-f]+`, case-insensitive, lower-case result), with a cap so the path can't carry an endless value. Real ids are 8 characters.
4. **mbid = any 8-4-4-4-12 hex UUID, lower-cased.** No version or variant check, so an older MusicBrainz id is never refused.
5. **Page parsing is digits only, no leading zero.** `01`, `1e2`, ` 2` and `1.5` are rejected rather than coerced, so a page in the URL means one thing only.
6. **No results for an Artist search is `{ artists: [] }` (200), not `NOT_FOUND`.** `docs/design.md` treats it as an empty state with its own heading, not an error alert.
7. **Setlist page `artist.name` is optional.** The core's Setlist summary has no Artist name (PRD 0012). The server fills it when it knows it, for example from the Setlists on the page. An empty page may have none; the client then shows the heading without the name, as `docs/design.md` allows.
8. **Dropped core fields:** `autoPick`; a summary's `versionId`; a Performance's `artist` and `isTape`; a Match's `uri` and `id`; a Miss's `queries`; the preview's `matches` list; the find step's `playlistId`; every record field. `kind`/`shareUrl` are renamed `status`/`url` in the playlist status to follow the brief.
9. **`misses` entries carry the row `number`** so the Misses jump list in `docs/design.md` can link to its row without searching the rows. They drop `kind`, which is always `miss`.
10. **`playlist` is a union:** `none` has no `url`; `current` and `outdated` must have one. This is stricter than the brief's `url?`, so the client never has to handle a current playlist without a link.
11. **Progress carries only `{ n, total }`** (the brief). The rows come all at once in the `preview` event. This settles `docs/design.md` decision 6, and the client renders the sheet once.
12. **Errors before the first event are plain JSON error answers** with their status and `Retry-After`. Only later errors are `error` events. This way the preview limit and the Host-Account-not-connected answers keep their status and countdown. The error event's data is the bare `{ code, message, hint? }`, as the brief writes it.
13. **The create answer is exactly `{ url, status }`** (the brief). The client already has the playlist name and the Match count from the preview. A concurrent Visitor who gets the same link needs nothing more.
14. **Success statuses:** 200 for every JSON answer, including create and update; 204 for logout (also without a cookie); 302 for the two admin redirects.
15. **The admin callback reports failure by redirect, with an error code:** `/admin?login=<code>`, reusing the 8 codes (`NOT_ADMIN` for the wrong account). Slice 19 needs no second list of reasons.
16. **The admin status has `hostAccount.displayName` (optional)** for "Connected as playset-host" in `docs/design.md`. It is the Spotify display name. The server must never put the Host Account id there, and `id` is rejected by the schema.
17. **Admin status config entries use human-readable labels, not env names**, so the server rule "no env names in a response" holds with no exception. The labels come from a fixed list in the contract (`setlist.fm API key`, `Spotify client id`, `Host Account id`, `Cookie secret`), taken from the required config in `docs/phases/web-ui.md`. Rate-limit numbers, port and data file have defaults, so they are not listed. Values are never sent: a `value` key is rejected. `docs/design.md` §5.13 shows env names; Slice 19 shows these labels instead.
18. **Usage per day uses the event kinds as field names** (`created`, `updated`, `opened`), with exactly 30 days. Top Artists are `{ artist, playlistCount }`, and `playlistCount` is at least 1.
19. **Type names avoid browser globals:** `PreviewPerformance` (not `Performance`), `PreviewProgress`, `PreviewResult` and `PreviewError` (not `ProgressEvent` or `ErrorEvent`).
20. **Route paths are templates only (`:id`, `:mbid`).** There are no URL-builder functions, because the contract holds no runtime logic. The client's API module fills them in.
21. **A create for a Setlist with no Matches is `INVALID_INPUT`.** No ninth code is added. The client never offers Create then (`docs/design.md` §7), so only a hand-made request gets it.

## Open questions

(none)

## Notes added during review (2026-11-28)

- **setlist.fm links are checked against an allowlist.** After the host, only ASCII URL characters (RFC 3986 unreserved and reserved, plus `%`) may follow, and no single quote. This is tighter than "`/` and anything" above. Review found that a growing deny-list kept missing characters that are unsafe in an href or the playlist description. A real check of 60 setlist.fm links (Björk, Mötley Crüe, Beyoncé) showed setlist.fm sends plain ASCII slugs, so no real link is rejected.
- **An admin callback carrying both `code` and `error` is rejected, even when one of them is empty** (AC-20).

