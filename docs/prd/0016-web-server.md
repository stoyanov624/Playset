# PRD 0016 — Visitor API server

Status: Approved
Slice: 16
Depends on: 0015 (and 0012, 0014)
Module: src/web/server

## Problem

The core can now do the web app's work as stateless steps (PRD 0012) and keep one **Setlist Playlist** per **Setlist** in the **Host Account** (PRD 0014). Both web halves also share one contract (PRD 0015). But nothing answers a **Visitor**'s browser yet. Nothing:

- searches an **Artist**, lists their Setlists or reads a setlist.fm link over HTTP;
- streams a preview of **Matches** and **Misses** while it is being made;
- creates or updates a Setlist Playlist on a Visitor's request;
- stores records, cached previews and usage across restarts;
- limits how much one Visitor, or everyone in one day, can ask of setlist.fm, Spotify and the Host Account;
- turns core errors (written for the CLI, naming env vars and commands) into plain sentences for a Visitor.

## Goal

A local web server (`npm run web`, `http://127.0.0.1:3000`) answers every Visitor route of the PRD 0015 contract and serves the built web client. Each route checks its input with the contract, calls the core steps and answers in the contract's shapes. Errors use the fixed code catalogue and Visitor wording. Records, cached previews and usage events live in a SQLite file. Previews and creates are rate-limited, shared when identical and never run twice at once for one Setlist. No secret ever leaves the server.

## Non-goals

- **No admin routes.** `/admin/login`, `/admin/callback`, `/api/admin/status` and `/api/admin/logout` are Slice 17. So are the Host login, storing and refreshing the Host token, the admin cookie and the usage page. The cookie secret and Host Account id are read and checked at startup (AC-1), but nothing uses them yet.
- **No real Host token yet.** The server gets the Host token from an injected Host token source. Until Slice 17 provides a real one, the entry file wires a source that always says "not connected", so a manual run can preview nothing (AC-18).
- **No client code** and no change to the contract. The server answers exactly the PRD 0015 shapes.
- **No domain rules in the server.** Tapes, medleys, snippets, matching, naming, Incomplete Setlist rules, the "one per Setlist" rule and the version check all stay in the core. The server only checks input, calls steps, maps shapes, locks, limits and records usage.
- **No Tape question.** Every **Tape** is always left out (ADR 0002).
- **No "newest complete Setlist" offer** (PRD 0011). The Visitor picks from the Setlist list.
- **No public hosting.** No HTTPS, no domain, no reverse-proxy setup, no `Secure` cookies. The server listens on `127.0.0.1` only. Trusting a proxy's forwarded address exists only as an off-by-default setting (AC-1).
- **No Artist name on the Setlist page.** The core's Setlist page has no Artist name, so `artist.name` is never sent. The client keeps the name from the search (ADR 0001: the browser carries the Visitor's choices).
- **No `NOT_FOUND` for an Artist with no Setlists.** The core answers an unknown mbid or a page past the end as an empty page (PRD 0012 AC-6), so the server answers `200` with no Setlists.
- **No access log, no IP storage.** IPs are used only in memory for rate limits. They are never written to SQLite or to the log.
- **No pruning of cached previews or events.**
- **No browser end-to-end test.** Tests use the app with fakes. One manual run check covers the real wiring.
- **No new glossary term.**

## User stories

- As a Visitor, I want to search for an Artist and page through their Setlists, so that I can pick the **Show** I went to.
- As a Visitor, I want to paste a setlist.fm link and go straight to that Setlist.
- As a Visitor, I want a Setlist that already has a current Setlist Playlist to give me its link at once, with no preview.
- As a Visitor, I want to watch the Matching progress, then see every **Performance** with its Match or Miss, before I create anything.
- As a Visitor, I want Create to give me a Spotify link, and the same link a friend gets for the same Setlist.
- As a Visitor, I want errors in plain words with what to do next, and a countdown when I must wait.
- As the Host Account's admin, I want limits per Visitor and per day, so that one person can't fill the Host Account or get the app blocked by Spotify or setlist.fm.
- As the Host Account's admin, I want records and usage to survive a restart, and no key or token to reach a browser or the log.

## Words used in this PRD

Terms from earlier PRDs keep their meanings: "preview", "kept Performances" (PRD 0007); "not-added list", "Placeholder Setlist" (PRD 0012); "version", "record", "cached preview", "Host steps" (PRD 0014); "contract", "preview stream", "event" (PRD 0015). These PRD-local words are added. None is a glossary term:

- **Host token**: the Spotify access token of the Host Account, given to the server by the Host token source.
- **Connected**: the Host token source gives a Host token. "Not connected" means it gives none, or fails while getting one (for example a refresh fails).
- **Usage event**: one stored row saying a Setlist Playlist was `created`, `updated` or `opened`, with the setlist id, the Show's Artist name and the UTC day (`YYYY-MM-DD`). It holds no IP.
- **Open**: a usage event of kind `opened`.
- **Playlists made today**: the number of `created` and `updated` usage events whose day is today (UTC).
- **Visitor address**: the IP a request comes from (AC-1 says which).
- **Window**: the last 60 minutes before a request.
- **Admitted**: a preview or create/update request that passed every check and limit, so the server starts the core work for it (or joins work already running).
- **Run**: one preview's Matching (one call of the preview step), or one create/update (one call of the create-or-update step).
- **Listener**: a preview request whose stream is waiting for a run's events.
- **Catalogue**: the server's fixed table from errors to code, HTTP status, message and hint (see "Error catalogue").

## How the server is put together (for tests)

Tests build the app with fakes and talk to it over HTTP (supertest). They import these names from the server module's entry point. The names are part of this PRD.

| Name | What it is |
|---|---|
| `createApp(deps)` | Builds the HTTP app. Never listens. Every in-memory state (rate-limit windows, runs in flight, locks) belongs to the app it built, so two apps share nothing. |
| `readWebConfig(env)` | Reads and checks the config from an env object (AC-1, AC-2). Returns the config or throws `WebConfigError`. |
| `WebConfigError` | The config error. Its message lists every problem. |
| `createSqliteStore(db)` | Given an open SQLite database (a file, or `:memory:` in tests), creates the tables it needs if missing and returns `{ records, events }`. |
| `createMemoryUsageEvents()` | Usage events kept in memory, for tests. |
| `createRateLimitHitCounter()` | Counts rate-limit answers per UTC day, in memory. |
| `notConnectedHostTokenSource` | A Host token source that is never connected (the entry file uses it until Slice 17). |

`createApp` takes:

| Dep | Shape |
|---|---|
| `config` | the result of `readWebConfig` |
| `services` | the core's services, as `createRunServices` builds them (setlist.fm Artist search without a chooser, Setlist page, get Setlist, Match search, create, update). Tests give fakes of the same shape. |
| `records` | the core's `SetlistPlaylistRecords` (the SQLite adapter, or the core's in-memory one in tests) |
| `events` | usage events: `recordEvent({ kind, setlistId, artist, day })` and `countPlaylistsMade(day)`, both async. `kind` is `created`, `updated` or `opened`. |
| `hostTokens` | Host token source: `getAccessToken()` resolves the Host token, or resolves `undefined` when not connected, or rejects when getting one failed |
| `rateLimitHits` | the rate-limit hit counter: `add(day)` and `count(day)` |
| `now` | clock in milliseconds since the epoch |
| `logger` | `info`, `warn`, `error`, each `(message: string, details?: unknown)` |
| `clientDir` | the folder of the built client (`index.html` and `assets/`) |

The entry file `src/web/server/main.ts` reads the config from the environment (after loading `.env` from the working directory if there is one; a variable already set wins). It opens the SQLite file (making its folder if needed), builds the core services once with the config's key and client id, builds the app with `notConnectedHostTokenSource`, and listens on `127.0.0.1` at the configured port. It logs `Playset web is running at http://127.0.0.1:<port>`.

## Error catalogue

Every error leaves as `{ "error": { "code", "message", "hint"? } }` with the status below and `Content-Type: application/json`. Every `RATE_LIMITED` answer also has `Retry-After` in whole seconds. The wording is the server's own; a core error's message or hint is never sent.

| # | Cause | Code | Status | Message | Hint | Retry-After |
|---|---|---|---|---|---|---|
| E-1 | Artist search query rejected by the contract | `INVALID_INPUT` | 400 | `Type an Artist name to search for.` | `Use 1 to 200 characters.` | — |
| E-2 | Setlist page path or query rejected | `INVALID_INPUT` | 400 | `That Artist or page isn't valid.` | `Search for the Artist again.` | — |
| E-3 | Setlist link query rejected, or the core link reader refuses the link, or the id it reads isn't a contract setlist id | `INVALID_INPUT` | 400 | `That isn't a setlist.fm Setlist link.` | `Open the Setlist on setlist.fm and copy the link from the address bar. It ends in .html.` | — |
| E-4 | `:id` rejected (status, preview or create route) | `INVALID_INPUT` | 400 | `That Setlist id isn't valid.` | `Open the Setlist from a search or a setlist.fm link.` | — |
| E-5 | Create body rejected, not JSON, or malformed JSON | `INVALID_INPUT` | 400 | `That request isn't valid.` | `Load the preview again, then press Create.` | — |
| E-6 | Request body over 10 kB | `INVALID_INPUT` | 413 | `That request is too large.` | — | — |
| E-7 | Core "nothing to add" (no Matches) | `INVALID_INPUT` | 400 | `None of the songs were found on Spotify, so there's nothing to put in a playlist.` | `Pick another Show.` | — |
| E-8 | Core description-too-long | `INVALID_INPUT` | 400 | `Playset can't make a playlist for this Setlist.` | `Its setlist.fm link is too long for a Spotify playlist description.` | — |
| E-9 | Core "setlist not found" | `NOT_FOUND` | 404 | `setlist.fm has no Setlist with that id.` | `Check the link, or search for the Artist instead.` | — |
| E-10 | Unknown `/api` path, or a method a route doesn't answer | `NOT_FOUND` | 404 | `There's nothing here.` | — | — |
| E-11 | Per-address preview limit | `RATE_LIMITED` | 429 | `Too many previews from here in the last hour.` | `Wait a little, then try again. Setlists that already have a preview stay free.` | until the oldest counted preview leaves the window |
| E-12 | Per-address create/update limit | `RATE_LIMITED` | 429 | `Too many playlists from here in the last hour.` | `Wait a little, then try again.` | until the oldest counted create/update leaves the window |
| E-13 | Daily limit | `RATE_LIMITED` | 429 | `Playset has made as many playlists as it can today.` | `Try again tomorrow. Playlists that already exist still open.` | until the next 00:00 UTC |
| E-14 | Core setlist.fm rate-limit error (429 after the core's retries) | `RATE_LIMITED` | 429 | `setlist.fm is busy right now.` | `Try again in a minute.` | 60 |
| E-15 | Core Spotify rate-limit error (search or playlist, 429 after the core's retries) | `RATE_LIMITED` | 429 | `Spotify is busy right now.` | `Try again in a minute.` | 60 |
| E-16 | Core setlist.fm request error (any other status, network failure, timeout) | `UPSTREAM_UNAVAILABLE` | 502 | `setlist.fm isn't answering right now.` | `Try again in a minute.` | — |
| E-17 | Core Spotify search or playlist error with a status other than 401 or 429, or no status (network) | `UPSTREAM_UNAVAILABLE` | 502 | `Spotify isn't answering right now.` | `Try again in a minute.` | — |
| E-18 | Core "partly created" | `UPSTREAM_UNAVAILABLE` | 502 | `Spotify stopped answering while the playlist was being filled.` | `Try again in a minute. The same playlist will be filled.` | — |
| E-19 | Core "partly updated" | `UPSTREAM_UNAVAILABLE` | 502 | `Spotify stopped answering while the playlist was being updated.` | `Try again in a minute. The same playlist will be updated.` | — |
| E-20 | Core no-version error, or a Setlist from setlist.fm with no version on the preview route | `UPSTREAM_UNAVAILABLE` | 502 | `setlist.fm didn't send everything Playset needs for this Setlist.` | `Try again in a few minutes.` | — |
| E-21 | Core generic request error: kind "rate-limited" | `RATE_LIMITED` | 429 | `A music service Playset uses is busy right now.` | `Try again in a minute.` | 60 |
| E-22 | Core generic request error: kind "status" or "network" | `UPSTREAM_UNAVAILABLE` | 502 | `A music service Playset uses isn't answering right now.` | `Try again in a minute.` | — |
| E-23 | Not connected (preview, create/update only), or a core Spotify search or playlist error with status 401 | `PLAYLISTS_UNAVAILABLE` | 503 | `Making playlists is unavailable right now.` | `You can still search and open playlists that already exist. Try again later.` | — |
| E-24 | Core Setlist-changed error | `SETLIST_CHANGED` | 409 | `This Setlist was changed on setlist.fm after your preview.` | `Load the fresh preview, then press Create again.` | — |
| E-25 | Anything else: an unknown error, a core error not listed (such as a missing setlist.fm key, a refused URL, a page-not-valid error), or an answer the contract rejects | `INTERNAL` | 500 | `Something went wrong on our side.` | `Please try again in a minute.` | — |

The core "Artist not found" error is not an error for the Visitor: the Artist search answers `200 { "artists": [] }` (AC-11). The core "run cancelled" error after a Visitor left gets no answer (AC-25).

## Acceptance criteria

Unless an AC says otherwise: "answers E-n" means the status, the exact error body and (for 429) the `Retry-After` of row E-n of the catalogue; every JSON answer has `Content-Type: application/json`; and "request to setlist.fm" or "Spotify" means a call of the injected services.

### Config

- **AC-1** — Given an env object, when the config is read, then it gives:

  | Config | Env name | Default | Rule |
  |---|---|---|---|
  | setlist.fm API key | `SETLISTFM_API_KEY` | none, required | non-empty after trimming |
  | Spotify client id | `SPOTIFY_CLIENT_ID` | none, required | non-empty after trimming |
  | Host Account id | `PLAYSET_HOST_SPOTIFY_ID` | none, required | non-empty after trimming |
  | Cookie secret | `PLAYSET_COOKIE_SECRET` | none, required | at least 32 characters after trimming |
  | Port | `PLAYSET_WEB_PORT` | 3000 | whole number 1 to 65535, digits only |
  | Data file | `PLAYSET_WEB_DATA` | `./data/playset.db` | non-empty after trimming |
  | Preview limit per address per hour | `PLAYSET_PREVIEW_LIMIT` | 30 | whole number ≥ 1, digits only |
  | Create/update limit per address per hour | `PLAYSET_CREATE_LIMIT` | 10 | whole number ≥ 1, digits only |
  | Playlists made per day | `PLAYSET_DAILY_LIMIT` | 200 | whole number ≥ 1, digits only |
  | Trust a proxy's forwarded address | `PLAYSET_TRUST_PROXY` | `0` | `0` or `1` |

  Values are trimmed. A missing, empty or whitespace-only optional value takes its default. With `PLAYSET_TRUST_PROXY=0` the Visitor address is the connection's address. With `1` it is the address the nearest proxy put last in `X-Forwarded-For` (one proxy hop is trusted).
- **AC-2** — Given an env object with one or more missing required values or invalid values, when the config is read, then `WebConfigError` is thrown. Its message starts `Playset can't start:` and lists every problem, in the table's order, one sentence each: `Missing <ENV_NAME>.` for a missing required value, or `<ENV_NAME> must be <rule>.` for an invalid one (the exact sentences are in X1). It never contains a value from the env. Given the entry file meets this error, then it logs that message as an error and exits with code 1 without listening.

### Every answer

- **AC-3** — Given any answer of the app (JSON, the preview stream, a static file or the client page), then:
  - it carries a `Content-Security-Policy` header holding `default-src 'self'`, `script-src 'self'`, `style-src 'self'`, `img-src 'self' data:`, `font-src 'self'`, `connect-src 'self'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'` and `frame-ancestors 'none'`, and nowhere `'unsafe-inline'`, `'unsafe-eval'` or `upgrade-insecure-requests`;
  - it has `X-Content-Type-Options: nosniff` and `Referrer-Policy: no-referrer`;
  - it has no `X-Powered-By` and no `Access-Control-Allow-Origin` header, also when the request has an `Origin` header;
  - every `/api` answer has `Cache-Control: no-store`.
- **AC-4** — Given a POST with a JSON body over 10 kB (10 240 bytes), when it arrives, then the app answers E-6 and calls no core step. Given a body of malformed JSON, or a body that is not `application/json`, then the create route answers E-5.
- **AC-5** — Given a request to an `/api` path no route answers (such as `/api/nope` or `GET /api/setlists/2bf1c8e4/playlist`), when it arrives, then the app answers E-10.
- **AC-6** — Given the client folder holds `index.html` and `assets/index-4f2a9c1b.js`, when:
  - a GET asks for `/assets/index-4f2a9c1b.js`, then that file is answered with a JavaScript content type and `Cache-Control: public, max-age=31536000, immutable`;
  - a GET asks for any other path outside `/api` (`/`, `/artists/83b9cbe7-9857-49e2-ab8e-b57b01038103`, `/setlists/2bf1c8e4`, `/admin`), then `index.html` is answered with `Content-Type: text/html` and `Cache-Control: no-cache`;
  - a GET asks for a missing file under `/assets/`, then the answer is 404 (not `index.html`).

  Given the client folder has no `index.html`, then a GET outside `/api` answers 503 `text/plain` `Playset's web page isn't available right now.` and the app logged a warning when it was built.
- **AC-7** — Given any error answer or error event, then it has exactly the catalogue code, message and hint of its cause and no other key. Given any answer, event or header the app sends, then it never contains: the setlist.fm key, the Spotify client id, the cookie secret, the Host Account id, the Host token, a stack trace, a core error's message or hint, an upstream status or body, a file path, SQL, or an env name.
- **AC-8** — Given an error answered as `INTERNAL` (E-25) or `UPSTREAM_UNAVAILABLE` (E-16 to E-20, E-22), when it is answered, then the app logs it once through `logger.error` with the error's message and its cause. An upstream `RATE_LIMITED` (E-14, E-15, E-21) and a `PLAYLISTS_UNAVAILABLE` (E-23) are logged once through `logger.warn` the same way. Every occurrence in the log of the setlist.fm key, the Spotify client id, the cookie secret, the Host Account id and the Host token is replaced by `[redacted]`. No log line contains a Visitor address. Errors E-1 to E-13 and E-24 are not logged as errors.
- **AC-9** — Given a core step's result that the contract's answer or event schema rejects (for example a Show URL that isn't an https setlist.fm link, a Match with no artist, or a version longer than 64 characters), when the app would send it, then it answers E-25 instead (or an `error` event with E-25 once the stream started). It never sends a value the contract rejects.

### Artist search — `GET /api/artists?name=…`

- **AC-10** — Given a query the contract accepts, when the route runs, then the find-Artists step runs once with the trimmed name, and the app answers 200 `{ "artists": [...] }` with every candidate in the step's order. Each candidate holds exactly `name`, `mbid` and `disambiguation` (only when the step gives one). `autoPick` is never sent. Given a query the contract rejects (missing, empty, whitespace-only, over 200 characters, given twice), then the app answers E-1 and calls no step.
- **AC-11** — Given the find-Artists step raises the core "Artist not found" error, when the route runs, then the app answers 200 `{ "artists": [] }`. Given it raises a setlist.fm rate-limit error, request error or any other error, then the app answers E-14, E-16 or E-25 respectively.

### Setlist page — `GET /api/artists/:mbid/setlists?page=…`

- **AC-12** — Given an mbid and a page the contract accepts (page 1 when absent), when the route runs, then the list-Setlists step runs once with the lower-case mbid and that page. The app answers 200 `{ "artist": { "mbid" }, "setlists": [...], "hasMore" }`, with `artist.mbid` the lower-case mbid, no `artist.name`, and every summary in the step's order holding exactly `id`, `date`, `venue`, `city`, `songCount` and `incompleteStatus` (no `versionId`). An empty page from the step is `"setlists": []` with its `hasMore`.
- **AC-13** — Given an mbid or page the contract rejects, when the route runs, then the app answers E-2 and calls no step. Given the step raises a setlist.fm rate-limit error, a request error or any other error, then the app answers E-14, E-16 or E-25.

### Setlist link — `GET /api/setlist-links?url=…`

- **AC-14** — Given a link query the contract accepts, when the route runs, then the core's link reader reads the setlist id from the trimmed link, and the app answers 200 `{ "setlistId" }` with the id in lower case. No request goes to setlist.fm or Spotify, and the link itself is never fetched. Given the link reader refuses the link (not setlist.fm, not a Setlist page, no id), or reads an id the contract rejects, or the contract rejects the query, then the app answers E-3.

### Setlist status — `GET /api/setlists/:id`

- **AC-15** — Given a setlist id the contract accepts, when the route runs, then the Setlist is fetched once from setlist.fm, prepared with every Tape left out (no Tape question), and its recorded Setlist Playlist is looked up for the Setlist's version. The app answers 200 `{ "show", "incompleteStatus", "playlist" }`:
  - `show` holds exactly `artist`, `date`, `venue`, `city` and `url` of the prepared Show;
  - `incompleteStatus` is the prepared one, field by field;
  - `playlist` is `{ "status": "none" }` without a record, `{ "status": "current", "url" }` for a record of this version, and `{ "status": "outdated", "url" }` for a record of another version or of no version. `url` is the recorded share link.

  Given the Setlist has no version, then a record answers `outdated` and no record answers `none`. No Spotify request is sent and no Host token is asked for.
- **AC-16** — Given the answer's `playlist.status` is `current`, when the route answers, then exactly one open is recorded: kind `opened`, the setlist id, the Show's Artist name and today's UTC day. Given `none` or `outdated`, or an error answer, then no usage event is recorded. Opens are never rate-limited and never counted in playlists made today.
- **AC-17** — Given an `:id` the contract rejects, when the route runs, then the app answers E-4 and makes no request. Given setlist.fm answers that it has no such Setlist, then the app answers E-9. Given a setlist.fm rate-limit error, a request error, the description-too-long error or any other error, then the app answers E-14, E-16, E-8 or E-25.

### Host Account not connected

- **AC-18** — Given the Host token source resolves `undefined`, or rejects, when a Visitor asks for a preview or a create/update with a valid id (and body), then the app answers E-23 before any request to setlist.fm or Spotify and before any limit is counted. A rejection is logged as a warning with its cause (secrets redacted). Given the same source, then the Artist search, the Setlist page, the Setlist link and the Setlist status (including recording an open) work as when connected. The source is asked once per preview or create/update request, and never by the other routes.

### Preview — `GET /api/setlists/:id/preview`

- **AC-19** — Given a preview request, when it is handled, then these steps come first, in this order. Each failure is a plain JSON error answer (no stream starts), and a later step does not run:
  1. the `:id` is checked (E-4);
  2. the Host token is got (E-23);
  3. the Setlist is fetched from setlist.fm (E-9, E-14, E-16, E-25);
  4. it is prepared with every Tape left out (E-8, E-25);
  5. a Setlist without a version answers E-20;
  6. a cached preview for this setlist id and version, or a run in flight for them, is free: go to AC-20 (cached) or AC-22 (joined);
  7. the per-address preview limit is checked (AC-23, E-11).

  Only then is the request admitted and the stream started.
- **AC-20** — Given an admitted preview with k kept Performances (k ≥ 1) and no cached preview, when it runs, then the app answers 200 with `Content-Type: text/event-stream` and `Cache-Control: no-store`. The preview step runs once with the Host token, the records and a cancel signal. Before each Match search a `progress` event `{ "n", "total" }` is sent (n = 1…k, total = k). Then one `preview` event is sent, and the stream ends. Each event is `event: <name>`, `data: <JSON on one line>` and a blank line. While waiting, a comment line `: keep-alive` may be sent every 15 seconds. Given k = 0 (a Placeholder Setlist, or only Tapes, snippets and Unknown Songs), then no `progress` event comes, only the `preview` event with `"rows": []` and `"misses": []`.
- **AC-21** — Given the preview step's result, when the `preview` event is built, then its data holds exactly:
  - `show` and `incompleteStatus`, as in AC-15;
  - `rows`: one per preview row, in order: `number`; `performance` with exactly `position`, `title`, `setLabel`, and `originalArtist` and `medley` only when present (never `artist` or `isTape`); `outcome` with exactly `kind`, `name`, `artists`, `album`, `live` for a Match (never `uri` or `id`), or `kind`, `title`, `artist` and `originalArtist` when present for a Miss (never `queries`);
  - `misses`: one entry per Miss row, in row order: that row's `number`, the Miss's `title`, `artist` and `originalArtist` when present;
  - `notAdded`: the prepared not-added list, in order, each entry exactly `{ reason, name }` or `{ reason: "unknown", after, info? }`;
  - `playlistName`: the step's playlist name;
  - `versionId`: the version of the Setlist just fetched.

  There is no `matches` key and no other key.
- **AC-22** — Given a cached preview for the setlist id and version, when a preview request passes AC-19 steps 1 to 5, then the stream has no `progress` event and exactly one `preview` event built from the cached preview (AC-21). No Match search is made and nothing is counted against the Visitor address, even when its preview limit is reached.
- **AC-23** — Given a Visitor address with `PLAYSET_PREVIEW_LIMIT` previews counted in the window, when it asks for a preview that is neither cached nor in flight, then the app answers E-11 with `Retry-After` = the whole seconds (rounded up, at least 1) until the oldest counted preview is 60 minutes old. Every admitted preview that starts a run counts once for its address, at the moment it starts, whether it then finishes, fails or is cancelled. Other addresses are not affected. The rate-limit hit counter rises by 1 for today.
- **AC-24** — Given a run in flight for setlist id S and version V, when another preview request for S and V is handled, then it joins that run as a second listener instead of starting one: no second preview step call and no extra Match search, and it is not counted against its address. The joining stream first gets every `progress` event the run has sent so far, in order (so its `n` still counts up from 1), then each later event as it comes, then the same `preview` or `error` event. A request for S with another version starts its own run.
- **AC-25** — Given a run with listeners, when a listener's connection closes, then that listener gets no more events. When the last listener's connection closes before the run ends, then the run's cancel signal aborts: no further Match search starts, no cached preview is saved (PRD 0014 AC-10), nothing more is written, and the "run cancelled" error is logged as info only. A later request for the same S and V starts a new run (and counts against its address, AC-23).
- **AC-26** — Given the run fails after the stream started (for example a Spotify search error, a Spotify rate-limit error or a 401), when it ends, then every listener gets one `error` event whose data is the bare catalogue error (`{ code, message, hint? }`: E-17, E-15, E-23 or E-25), and the stream ends. No HTTP status changes (it is already 200), no `preview` event is sent and no cached preview is saved.

### Create or update — `POST /api/setlists/:id/playlist`

- **AC-27** — Given a create/update request, when it is handled, then these come first, in this order, each a JSON error answer that stops the rest:
  1. the `:id` (E-4) and the body `{ versionId }` (E-5, E-6) are checked;
  2. the Host token is got (E-23);
  3. the per-address create/update limit (AC-29, E-12);
  4. the daily limit (AC-30, E-13).

  Only then is the request admitted and counted once against its address.
- **AC-28** — Given an admitted request for setlist id S and version V, when it runs, then the Setlist is fetched from setlist.fm, and the create-or-update step runs once with the Setlist, V, the Host token and the records. On success the app answers 200 `{ "url", "status" }` with the step's share link and `created` or `updated`, and records one usage event: kind `created` or `updated` (as the status), S, the Show's Artist name and today's UTC day. Given the step raises the Setlist-changed error, then the app answers E-24. The other core errors map as the catalogue says (E-7, E-8, E-9, E-14 to E-20, E-23, E-25). On any error no usage event is recorded.
- **AC-29** — Given a Visitor address with `PLAYSET_CREATE_LIMIT` admitted creates/updates in the window, when it asks for another, then the app answers E-12 with `Retry-After` = whole seconds (rounded up, at least 1) until the oldest counted one is 60 minutes old. No request is sent and nothing more is counted. Other addresses are not affected. The rate-limit hit counter rises by 1 for today.
- **AC-30** — Given playlists made today (from the usage events) equal `PLAYSET_DAILY_LIMIT` or more, when any address asks for a create/update, then the app answers E-13 with `Retry-After` = whole seconds until the next 00:00 UTC (at least 1), and the request is not counted against its address. Opens never count. The rate-limit hit counter rises by 1 for today.
- **AC-31** — Given a create/update for setlist id S is running, when another admitted request for S arrives:
  - with the same version V, then it does not start a second run. It waits and gets the same answer as the running one: the same `url` and `status`, or the same error. Only one usage event is recorded;
  - with another version, then it waits until the running one has ended, then runs on its own (AC-28), so it sees the record the first one left.

  Requests for different setlist ids run at the same time.

### Rate limits and Visitor addresses

- **AC-32** — Given a rate-limit answer from a Playset limit (E-11, E-12, E-13), when it is sent, then the hit counter's count for today's UTC day rises by 1. Upstream 429s (E-14, E-15, E-21) don't count. Opening links (the Setlist status) is never limited. The windows and the hit counter live in memory only: a new app starts with none.
- **AC-33** — Given any sequence of requests, when they have been handled, then no Visitor address is in any table of the SQLite store, in any usage event or in any log line.

### setlist.fm and Spotify through the core only

- **AC-34** — Given any route, when it needs setlist.fm or Spotify, then it calls only the services it was built with, so every Visitor shares one setlist.fm request spacing and one Spotify request spacing (the core's throttles). The app never fetches a URL a Visitor sent (a link is only read, AC-14).

### SQLite store

- **AC-35** — Given a SQLite store on a `:memory:` database, when its records are used, then they behave exactly as PRD 0014 AC-4 and AC-5 say for records and cached previews: a saved record comes back with every field equal (including `versionId: null` and `createdAt`), saving again for the same setlist id replaces it, a cached preview comes back equal (deeply, including Match URIs and Miss queries) only for its setlist id and version, saving again replaces it, and another version keeps both.
- **AC-36** — Given a SQLite store, when usage events are recorded, then `countPlaylistsMade(day)` gives the number of `created` and `updated` events of that day, and opens never count. Given `createSqliteStore` runs twice on the same database, then the second run keeps every row and fails nothing. Every value is passed to SQL as a parameter: a setlist id, Artist name or version holding `'`, `;` or `--` (such as the Artist `Guns N' Roses`) is stored and read back unchanged.
- **AC-37** — Given the in-memory usage events, when they are used, then they behave exactly as the SQLite events of AC-36.

## Examples

Unless stated otherwise:

- Config (env): `SETLISTFM_API_KEY=sfm-test-key-0f3c9a`, `SPOTIFY_CLIENT_ID=3f9c2a7e5b1d4c8fa6e0b2d4c6a8e1f3`, `PLAYSET_HOST_SPOTIFY_ID=31abcxyzhost`, `PLAYSET_COOKIE_SECRET=test-cookie-secret-7d1f0c9b2e8a4f6d5c3b1a09`, `PLAYSET_TRUST_PROXY=1` (so tests set the address with `X-Forwarded-For`), other values default.
- Host token source: connected, token `BQDhost-test-token`.
- Clock: `2026-11-28T14:30:00.000Z`. Today is `2026-11-28`.
- Records: the core's in-memory store, empty. Events: in-memory, empty.
- Visitor addresses: `203.0.113.7` (A) and `198.51.100.4` (B).
- setlist.fm and Spotify: fake services with the fixtures of PRD 0012 and 0014: Fixture H v1 and v2 (Pearl Jam, Portland, `2bf1c8e4`, versions `g4bd1a2f6` and `g2b5e7c19`) and the Madrid Setlist (Arctic Monkeys, `73a1b2c5`, version `g3e5f7a91`, PRD 0015 X7).

### X1 — Config (AC-1, AC-2)

| Env (besides the four required above) | Result |
|---|---|
| none | port 3000, data file `./data/playset.db`, preview 30, create 10, daily 200, trust proxy off |
| `PLAYSET_WEB_PORT=8080`, `PLAYSET_PREVIEW_LIMIT=5`, `PLAYSET_CREATE_LIMIT=2`, `PLAYSET_DAILY_LIMIT=50`, `PLAYSET_WEB_DATA=/var/lib/playset/web.db`, `PLAYSET_TRUST_PROXY=1` | those values |
| `PLAYSET_WEB_PORT=" 8080 "` | 8080 |
| `PLAYSET_WEB_PORT=""` | 3000 |

`readWebConfig({})` throws `WebConfigError` with the message:

```
Playset can't start: Missing SETLISTFM_API_KEY. Missing SPOTIFY_CLIENT_ID. Missing PLAYSET_HOST_SPOTIFY_ID. Missing PLAYSET_COOKIE_SECRET.
```

| Bad value | Sentence in the message |
|---|---|
| `SETLISTFM_API_KEY="   "` | `Missing SETLISTFM_API_KEY.` |
| `PLAYSET_COOKIE_SECRET=short-secret` | `PLAYSET_COOKIE_SECRET must be at least 32 characters.` |
| `PLAYSET_WEB_PORT=0`, `65536`, `80a`, `8080.5` | `PLAYSET_WEB_PORT must be a whole number from 1 to 65535.` |
| `PLAYSET_PREVIEW_LIMIT=0`, `-1`, `ten` | `PLAYSET_PREVIEW_LIMIT must be a whole number of 1 or more.` |
| `PLAYSET_CREATE_LIMIT=1.5` | `PLAYSET_CREATE_LIMIT must be a whole number of 1 or more.` |
| `PLAYSET_DAILY_LIMIT=abc` | `PLAYSET_DAILY_LIMIT must be a whole number of 1 or more.` |
| `PLAYSET_TRUST_PROXY=yes` | `PLAYSET_TRUST_PROXY must be 0 or 1.` |

With `PLAYSET_COOKIE_SECRET=short-secret` and `PLAYSET_WEB_PORT=0` both: `Playset can't start: PLAYSET_COOKIE_SECRET must be at least 32 characters. PLAYSET_WEB_PORT must be a whole number from 1 to 65535.` The message never contains `short-secret`, `sfm-test-key-0f3c9a` or any other value.

### X2 — Headers, body limit, unknown paths, client files (AC-3 to AC-6)

`GET /api/artists?name=Genesis` with `Origin: https://evil.example`: 200, with a `Content-Security-Policy` holding every directive of AC-3, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Cache-Control: no-store`, no `X-Powered-By`, no `Access-Control-Allow-Origin`.

| Request | Answer |
|---|---|
| `POST /api/setlists/2bf1c8e4/playlist`, `Content-Type: application/json`, body `{"versionId":"g4bd1a2f6","pad":"` + 10 300 × `x` + `"}` | 413 `{"error":{"code":"INVALID_INPUT","message":"That request is too large."}}`; no step called |
| same route, body `{"versionId":` | 400 `{"error":{"code":"INVALID_INPUT","message":"That request isn't valid.","hint":"Load the preview again, then press Create."}}` |
| same route, `Content-Type: text/plain`, body `versionId=g4bd1a2f6` | 400, same body |
| `GET /api/nope` | 404 `{"error":{"code":"NOT_FOUND","message":"There's nothing here."}}` |
| `DELETE /api/setlists/2bf1c8e4` | 404, same body |
| `GET /api/setlists/2bf1c8e4/playlist` | 404, same body |

Client folder (a test fixture): `index.html` = `<!doctype html><html><head><script type="module" src="/assets/index-4f2a9c1b.js"></script></head><body><div id="root"></div></body></html>`, `assets/index-4f2a9c1b.js` = `console.log("playset")`.

| Request | Answer |
|---|---|
| `GET /` | 200 `text/html`, that `index.html`, `Cache-Control: no-cache` |
| `GET /setlists/2bf1c8e4` | same |
| `GET /admin` | same |
| `GET /assets/index-4f2a9c1b.js` | 200 JavaScript, `Cache-Control: public, max-age=31536000, immutable` |
| `GET /assets/missing-00000000.js` | 404 |
| any of the first three, client folder empty | 503 `text/plain` `Playset's web page isn't available right now.`; one `logger.warn` when the app was built |

### X3 — Errors, logging, leaks (AC-7, AC-8, AC-9)

The fake getSetlist for `2bf1c8e4` throws a plain `Error("boom at https://api.setlist.fm/rest/1.0/setlist/2bf1c8e4 key=sfm-test-key-0f3c9a token=BQDhost-test-token")`.

`GET /api/setlists/2bf1c8e4` → 500 `{"error":{"code":"INTERNAL","message":"Something went wrong on our side.","hint":"Please try again in a minute."}}`. `logger.error` was called once. Its text contains `boom at https://api.setlist.fm/rest/1.0/setlist/2bf1c8e4 key=[redacted] token=[redacted]` and no `sfm-test-key-0f3c9a`, `BQDhost-test-token`, `203.0.113.7`.

In every test of every route, no answer body, event or header contains `sfm-test-key-0f3c9a`, `3f9c2a7e5b1d4c8fa6e0b2d4c6a8e1f3`, `test-cookie-secret-7d1f0c9b2e8a4f6d5c3b1a09`, `31abcxyzhost`, `BQDhost-test-token`, `SETLISTFM_API_KEY`, `at Object.`, `spotify:track:` or `queries`.

Contract guard: the fake getSetlist answers Fixture H v1 with `"url": "http://www.setlist.fm/setlist/pearl-jam/2026/moda-center-portland-or-2bf1c8e4.html"` (not https). `GET /api/setlists/2bf1c8e4` → 500 INTERNAL (E-25), logged. A fake Match with `"artists": []` during a preview → `event: error` with the E-25 data.

### X4 — Artist search (AC-10, AC-11)

`GET /api/artists?name=%20%20Genesis%20` → the step is called with `Genesis`. The fake step gives PRD 0012 F1's Genesis result (`autoPick` absent). Answer 200:

```json
{ "artists": [
  { "name": "Genesis", "mbid": "8e3fcd7d-bda1-4ca0-b987-b8528d2ee74e", "disambiguation": "English rock band" },
  { "name": "Genesis", "mbid": "2f4b1c6e-0d3a-4e5b-8c7d-9e0f1a2b3c4d", "disambiguation": "US psychedelic rock band" },
  { "name": "Genesis Owusu", "mbid": "4a5b6c7d-8e9f-4a0b-9c1d-2e3f4a5b6c7d" }
] }
```

`GET /api/artists?name=Arctic%20Monkeys` with an `autoPick` in the step's result: the same shape, no `autoPick` key.

| Request or fake | Answer |
|---|---|
| `GET /api/artists` | 400 `{"error":{"code":"INVALID_INPUT","message":"Type an Artist name to search for.","hint":"Use 1 to 200 characters."}}`, 0 steps |
| `?name=`, `?name=%20%20`, `?name=` + 201 × `A`, `?name=Genesis&name=Pearl%20Jam` | same |
| step raises "Artist not found" for `Xyzzq Nonexistent` | 200 `{"artists":[]}` |
| step raises the setlist.fm rate-limit error | 429, `Retry-After: 60`, `{"error":{"code":"RATE_LIMITED","message":"setlist.fm is busy right now.","hint":"Try again in a minute."}}` |
| step raises a setlist.fm request error, HTTP 503 | 502 `{"error":{"code":"UPSTREAM_UNAVAILABLE","message":"setlist.fm isn't answering right now.","hint":"Try again in a minute."}}` |
| step raises a setlist.fm request error, network failure | 502, same |
| step raises the missing-setlist.fm-key error | 500 INTERNAL (E-25) |

### X5 — Setlist page (AC-12, AC-13)

`GET /api/artists/83B9CBE7-9857-49E2-AB8E-B57B01038103/setlists` → the step is called with `83b9cbe7-9857-49e2-ab8e-b57b01038103` and page 1. The fake gives PRD 0012 P1's page, with `versionId` on each summary (`g4bd1a2f6`, `g8e1c4b27`, `g7ac2e1d9`). Answer 200: exactly PRD 0015 X4's answer without `"name"`:

```json
{
  "artist": { "mbid": "83b9cbe7-9857-49e2-ab8e-b57b01038103" },
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

| Request or fake | Answer |
|---|---|
| `?page=67`, the step gives `{ setlists: [], hasMore: false }` | 200 `{"artist":{"mbid":"83b9cbe7-9857-49e2-ab8e-b57b01038103"},"setlists":[],"hasMore":false}` |
| `/api/artists/83b9cbe7/setlists`, `?page=0`, `?page=01`, `?page=1001` | 400 `{"error":{"code":"INVALID_INPUT","message":"That Artist or page isn't valid.","hint":"Search for the Artist again."}}`, 0 steps |
| step raises the setlist.fm rate-limit error | 429, `Retry-After: 60`, E-14 |
| step raises a request error, HTTP 500 | 502, E-16 |

### X6 — Setlist link (AC-14)

| `url` | Answer |
|---|---|
| `https://www.setlist.fm/setlist/arctic-monkeys/2026/estadio-metropolitano-madrid-spain-73a1b2c5.html` | 200 `{"setlistId":"73a1b2c5"}` |
| `%20https://www.setlist.fm/setlist/nirvana/1987/community-world-theater-tacoma-wa-53D60349.html%0A` | 200 `{"setlistId":"53d60349"}` |
| `https://example.com/x` | 400 `{"error":{"code":"INVALID_INPUT","message":"That isn't a setlist.fm Setlist link.","hint":"Open the Setlist on setlist.fm and copy the link from the address bar. It ends in .html."}}` |
| `https://www.setlist.fm/search?query=pearl+jam` | 400, same |
| absent, `""`, 2049 characters | 400, same |

In every row, 0 calls to setlist.fm or Spotify services, and no fetch of the link.

### X7 — Setlist status and opens (AC-15, AC-16, AC-17)

`GET /api/setlists/2bf1c8e4`, setlist.fm gives Fixture H v1 (`g4bd1a2f6`).

| Record for `2bf1c8e4` | `playlist` in the answer | Usage events afterwards |
|---|---|---|
| none | `{"status":"none"}` | none |
| `5PqRsTuVwXyZaBcDeFgHiJ`, `g4bd1a2f6` | `{"status":"current","url":"https://open.spotify.com/playlist/5PqRsTuVwXyZaBcDeFgHiJ"}` | `{ kind: "opened", setlistId: "2bf1c8e4", artist: "Pearl Jam", day: "2026-11-28" }` |
| `5PqRsTuVwXyZaBcDeFgHiJ`, `g2b5e7c19` | `{"status":"outdated","url":"https://open.spotify.com/playlist/5PqRsTuVwXyZaBcDeFgHiJ"}` | none |
| `5PqRsTuVwXyZaBcDeFgHiJ`, `null` | outdated, same url | none |

Full answer for the second row:

```json
{
  "show": { "artist": "Pearl Jam", "date": "2026-11-22", "venue": "Moda Center", "city": "Portland",
    "url": "https://www.setlist.fm/setlist/pearl-jam/2026/moda-center-portland-or-2bf1c8e4.html" },
  "incompleteStatus": { "isIncomplete": true, "unknownSongCount": 1 },
  "playlist": { "status": "current", "url": "https://open.spotify.com/playlist/5PqRsTuVwXyZaBcDeFgHiJ" }
}
```

Three requests in a row on the current record record three opens. H v2 (with the Tape Master/Slave) is prepared without any Tape question. 0 Spotify calls and 0 Host token asks in every row.

Fixture H v1 without `versionId`: no record → `none`; record `g4bd1a2f6` → `outdated`.

| Request or fake | Answer |
|---|---|
| `GET /api/setlists/63a5e2bz` | 400 `{"error":{"code":"INVALID_INPUT","message":"That Setlist id isn't valid.","hint":"Open the Setlist from a search or a setlist.fm link."}}`, 0 requests |
| `GET /api/setlists/00000000`, getSetlist raises "setlist not found" | 404 `{"error":{"code":"NOT_FOUND","message":"setlist.fm has no Setlist with that id.","hint":"Check the link, or search for the Artist instead."}}` |
| getSetlist raises the setlist.fm rate-limit error | 429, `Retry-After: 60`, E-14 |
| getSetlist raises a request error, network failure | 502, E-16 |
| a Setlist whose description would be 301 characters (PRD 0006 E2) | 400 `{"error":{"code":"INVALID_INPUT","message":"Playset can't make a playlist for this Setlist.","hint":"Its setlist.fm link is too long for a Spotify playlist description."}}` |

### X8 — Host Account not connected (AC-18)

Host token source resolves `undefined`:

| Request | Answer | setlist.fm / Spotify calls |
|---|---|---|
| `GET /api/setlists/2bf1c8e4/preview` | 503 `{"error":{"code":"PLAYLISTS_UNAVAILABLE","message":"Making playlists is unavailable right now.","hint":"You can still search and open playlists that already exist. Try again later."}}`, JSON, no stream | 0 / 0 |
| `POST /api/setlists/2bf1c8e4/playlist` `{"versionId":"g4bd1a2f6"}` | 503, same | 0 / 0 |
| `GET /api/artists?name=Pearl%20Jam` | 200, as when connected | 1 / 0 |
| `GET /api/artists/83b9cbe7-9857-49e2-ab8e-b57b01038103/setlists` | 200 | 1 / 0 |
| `GET /api/setlist-links?url=…2bf1c8e4.html` | 200 | 0 / 0 |
| `GET /api/setlists/2bf1c8e4` with a current record | 200 current, one open recorded | 1 / 0 |

Host token source rejects with `Error("refresh failed: invalid_grant for BQDhost-test-token")`: the preview answers the same 503, `logger.warn` is called once with `refresh failed: invalid_grant for [redacted]`. After 11 such create requests from address A, a connected source then admits A's next create (nothing was counted).

### X9 — Preview stream (AC-19 to AC-21)

`GET /api/setlists/73a1b2c5/preview`, setlist.fm gives PRD 0012 P2's Madrid Setlist with `"versionId": "g3e5f7a91"`; the Spotify fake finds no Match for "505". Answer 200, `Content-Type: text/event-stream`:

```
event: progress
data: {"n":1,"total":5}

event: progress
data: {"n":2,"total":5}

event: progress
data: {"n":3,"total":5}

event: progress
data: {"n":4,"total":5}

event: progress
data: {"n":5,"total":5}

event: preview
data: {…PRD 0015 X7's preview JSON, on one line…}

```

The `preview` data equals PRD 0015 X7's JSON exactly (5 rows, `misses` `[{"number":5,"title":"505","artist":"Arctic Monkeys"}]`, the 4 not-added entries, `playlistName` `Arctic Monkeys – 2026-06-02 – Madrid`, `versionId` `g3e5f7a91`). The fake Match search was called 5 times, each with `BQDhost-test-token`. Afterwards a cached preview exists for `73a1b2c5` + `g3e5f7a91`. Address A has 1 preview counted.

A Cover row from PRD 0011 U1 (Nirvana, `53d60349`, `"versionId": "g9d0c1b2a"`) is sent as `{"number":3,"performance":{"position":3,"title":"Love Buzz","setLabel":"main","originalArtist":"Shocking Blue"},"outcome":{"kind":"match","name":"Love Buzz","artists":["Nirvana"],"album":"Bleach","live":false}}`. Its not-added list holds `{"reason":"unknown","after":7,"info":"Written as 'Dope Hippie' on the setlist"}`.

PRD 0011 T1d (only `{ "name": "" }` and `{ "name": "", "info": "Opener" }`, id `2bf1c8e4`, version `g4bd1a2f6`): no `progress` event; one `preview` event equal to PRD 0015 X7's empty preview.

Order of the first checks (AC-19), each a JSON answer with no stream:

| Situation | Answer | Calls made |
|---|---|---|
| `GET /api/setlists/73A1B2C5.html/preview` | 400 E-4 | none |
| not connected | 503 E-23 | Host token: 1; setlist.fm: 0 |
| getSetlist raises "setlist not found" | 404 E-9 | Spotify: 0 |
| getSetlist raises a request error, HTTP 502 | 502 E-16 | Spotify: 0 |
| Madrid without `versionId` | 502 `{"error":{"code":"UPSTREAM_UNAVAILABLE","message":"setlist.fm didn't send everything Playset needs for this Setlist.","hint":"Try again in a few minutes."}}` | Spotify: 0 |
| address A at its preview limit, not cached, not in flight | 429 E-11 | Spotify: 0 |

### X10 — Cached and limited previews (AC-22, AC-23)

`PLAYSET_PREVIEW_LIMIT=2`. Address A asks for previews:

| Clock | Request | Answer | Counted for A |
|---|---|---|---|
| 14:00:00 | Madrid (`73a1b2c5`), no cache | stream with 5 progress events and the preview | 1 |
| 14:10:00 | Madrid again (now cached) | stream with only the `preview` event, equal to the first; 0 Match searches | 1 |
| 14:20:00 | Portland H v1 (`2bf1c8e4`), no cache | stream with 3 progress events and the preview | 2 |
| 14:30:00 | Nirvana U1 (`53d60349`), no cache | 429, `Retry-After: 1800`, `{"error":{"code":"RATE_LIMITED","message":"Too many previews from here in the last hour.","hint":"Wait a little, then try again. Setlists that already have a preview stay free."}}` | 2 |
| 14:30:00 | Madrid (cached) | stream with only the `preview` event | 2 |
| 14:30:00 | address B asks for Nirvana U1 | stream with 9 progress events and the preview | B: 1 |
| 15:00:01 | address A asks for Nirvana U1 (cached now by B) | stream with only the `preview` event | 1 (the 14:00:00 one left the window) |

The "Counted for A" column is the count inside the window at that clock. The rate-limit hit counter for `2026-11-28` is 1 after this table. A preview that is cancelled (AC-25) or fails (AC-26) after it started still counts 1.

### X11 — Shared preview runs (AC-24, AC-25, AC-26)

The fake Match search waits until the test releases it. All requests are for Fixture H v2 (`2bf1c8e4`, `g2b5e7c19`, 5 kept Performances).

1. Address A asks for the preview. Progress 1 and 2 are sent; search 2 (Even Flow) is waiting.
2. Address B asks for the same preview. B's stream at once gets `progress` 1 and 2, then waits.
3. The test releases the searches. A and B each get `progress` 3, 4, 5 and the same `preview` event.

The fake Match search ran 5 times in total, not 10. A has 1 counted, B has 0.

Disconnects:

| Situation | Outcome |
|---|---|
| A alone; A closes the connection while search 2 waits | the run's signal aborts; search 3 never starts; no cached preview for `2bf1c8e4` + `g2b5e7c19`; `logger.info` once, no `logger.error` |
| A and B listening; A closes while search 2 waits; then the searches are released | B gets `progress` 3, 4, 5 and the `preview` event; the cached preview is saved |
| after the A-alone abort, A asks again | a new run starts with `progress` 1 (5 new Match searches); A has 2 counted |
| A asks for H v2 and B for H v1 (`g4bd1a2f6`) at once (setlist.fm gives each its version) | two runs, 5 and 3 searches |

Error event: A and B listening, search 3 (Corduroy) fails with a Spotify search error, HTTP 503. Each gets `progress` 1, 2, 3 then:

```
event: error
data: {"code":"UPSTREAM_UNAVAILABLE","message":"Spotify isn't answering right now.","hint":"Try again in a minute."}

```

Both streams end. No cached preview is saved. With the Spotify search rate-limit error instead: `{"code":"RATE_LIMITED","message":"Spotify is busy right now.","hint":"Try again in a minute."}`. With a Spotify search error, HTTP 401: `{"code":"PLAYLISTS_UNAVAILABLE","message":"Making playlists is unavailable right now.","hint":"You can still search and open playlists that already exist. Try again later."}`.

### X12 — Create and update (AC-27, AC-28)

`POST /api/setlists/2bf1c8e4/playlist`, body `{"versionId":"g4bd1a2f6"}`, address A. setlist.fm gives Fixture H v1. The fake Spotify services answer as PRD 0014 H1.

| Before | Answer | Usage event | Record afterwards |
|---|---|---|---|
| no record, no cached preview | 200 `{"url":"https://open.spotify.com/playlist/5PqRsTuVwXyZaBcDeFgHiJ","status":"created"}` | `{ kind: "created", setlistId: "2bf1c8e4", artist: "Pearl Jam", day: "2026-11-28" }` | `5PqRs…`, `g4bd1a2f6`, `createdAt` `2026-11-28T14:30:00.000Z` |
| record `5PqRs…` at `g4bd1a2f6`; H v2 fetched; body `{"versionId":"g2b5e7c19"}` | 200 `{"url":"https://open.spotify.com/playlist/5PqRsTuVwXyZaBcDeFgHiJ","status":"updated"}` | `updated`, `2bf1c8e4`, `Pearl Jam`, `2026-11-28` | `g2b5e7c19` |
| record at `g4bd1a2f6`, its playlist deleted in Spotify (PRD 0014 H3) | 200 `{"url":"https://open.spotify.com/playlist/6QrStUvWxYzAbCdEfGhIjK","status":"created"}` | `created` | `6QrSt…`, `g2b5e7c19` |
| H v2 fetched; body `{"versionId":"g4bd1a2f6"}` | 409 `{"error":{"code":"SETLIST_CHANGED","message":"This Setlist was changed on setlist.fm after your preview.","hint":"Load the fresh preview, then press Create again."}}` | none | unchanged |
| every Match search a Miss | 400 `{"error":{"code":"INVALID_INPUT","message":"None of the songs were found on Spotify, so there's nothing to put in a playlist.","hint":"Pick another Show."}}` | none | unchanged |
| replace answers 500 (PRD 0014 H5 row 1) | 502 E-17 | none | unchanged |
| replace answers 401 | 503 E-23 | none | unchanged |
| replace answers 429 four times | 429, `Retry-After: 60`, E-15 | none | unchanged |
| rename answers 404 (partly updated) | 502 `{"error":{"code":"UPSTREAM_UNAVAILABLE","message":"Spotify stopped answering while the playlist was being updated.","hint":"Try again in a minute. The same playlist will be updated."}}` | none | unchanged |
| H4's 230 Matches, batch 2 answers 400 (partly created) | 502 `{"error":{"code":"UPSTREAM_UNAVAILABLE","message":"Spotify stopped answering while the playlist was being filled.","hint":"Try again in a minute. The same playlist will be filled."}}` | none | `versionId: null` |
| getSetlist raises "setlist not found" | 404 E-9 | none | — |
| Fixture A (no version) fetched for `63a5e2b7`, body `{"versionId":"g6bd2a6f2"}` | 502 E-20 | none | — |

Bodies rejected with 400 E-5 and no step called: `{}`, `{"versionId":""}`, `{"versionId":"g4bd 1a2f6"}`, `{"versionId":"g4bd1a2f6","public":false}`, `["g4bd1a2f6"]`. A success answer has exactly the keys `url` and `status` (no `playlistId`, `trackCount` or `name`).

### X13 — Create limits (AC-29, AC-30, AC-32)

`PLAYSET_CREATE_LIMIT=2`, `PLAYSET_DAILY_LIMIT=3`.

| Clock | Address | Request | Answer | Counted for the address | Playlists made today |
|---|---|---|---|---|---|
| 14:00:00 | A | create `2bf1c8e4` v1 | 200 created | A: 1 | 1 |
| 14:20:00 | A | update `2bf1c8e4` v2 | 200 updated | A: 2 | 2 |
| 14:30:00 | A | create `73a1b2c5` | 429, `Retry-After: 1800`, `{"error":{"code":"RATE_LIMITED","message":"Too many playlists from here in the last hour.","hint":"Wait a little, then try again."}}`; 0 setlist.fm calls | A: 2 | 2 |
| 14:30:00 | B | create `73a1b2c5`, Spotify fails (500) | 502 E-17 | B: 1 | 2 |
| 14:30:00 | B | create `73a1b2c5` again, succeeds | 200 created | B: 2 | 3 |
| 14:30:00 | address `192.0.2.44` | create `53d60349` | 429, `Retry-After: 34200` (until 2026-11-29T00:00:00Z), `{"error":{"code":"RATE_LIMITED","message":"Playset has made as many playlists as it can today.","hint":"Try again tomorrow. Playlists that already exist still open."}}` | `192.0.2.44`: 0 | 3 |
| 14:30:00 | any | `GET /api/setlists/2bf1c8e4` (current record) | 200, open recorded | — | 3 |
| 2026-11-29 00:00:00 | `192.0.2.44` | create `53d60349` | 200 created | 1 | 1 (new day) |

The rate-limit hit counter for `2026-11-28` is 2 after this table. Upstream 429s (E-14, E-15) don't raise it.

Retry-After rounding: at 14:30:00.400 with the oldest counted create at 13:30:00.900, the wait is 0.5 s, so `Retry-After: 1`.

### X14 — One create/update at a time (AC-31)

The fake create request waits until the test releases it.

| Situation | Outcome |
|---|---|
| A posts `2bf1c8e4` `{"versionId":"g4bd1a2f6"}`; while it waits, B posts the same | 1 create-or-update step call, 1 Spotify create, both get 200 `{"url":"https://open.spotify.com/playlist/5PqRsTuVwXyZaBcDeFgHiJ","status":"created"}`, 1 `created` event; A and B each have 1 counted |
| the same, and the Spotify create answers 403 | both get 502 E-17; no event; no record |
| A posts `2bf1c8e4` v1 (`g4bd1a2f6`); while it waits, B posts `{"versionId":"g2b5e7c19"}` and setlist.fm now gives H v2 | A gets `created`; after it ends, B's step call starts, finds A's record and B gets `updated` with the same url; 2 events |
| A posts `2bf1c8e4`, B posts `73a1b2c5` at once | both step calls run at once (neither waits for the other) |

### X15 — Addresses never stored (AC-33)

After X10, X13 and X14 run on a SQLite store over a `:memory:` database, every row of every table (listed from the database's schema) is read. None holds `203.0.113.7`, `198.51.100.4` or `192.0.2.44`. No `logger` call's text holds them.

### X16 — One set of services (AC-34)

During X9 to X14, the only calls to setlist.fm and Spotify are calls of the fake services given to `createApp`; the fake global `fetch` installed by the test is never called. `GET /api/setlist-links?url=https://www.setlist.fm/setlist/pearl-jam/2026/moda-center-portland-or-2bf1c8e4.html` makes no call at all.

### X17 — SQLite store (AC-35, AC-36, AC-37)

On `createSqliteStore(new Database(":memory:"))`, PRD 0014 R1's call sequence gives the same results. Also:

```js
await records.saveRecord({ setlistId: "9ac1e5d3", playlistId: "8HiJkLmNoPqRsTuVwXyZaB",
  shareUrl: "https://open.spotify.com/playlist/8HiJkLmNoPqRsTuVwXyZaB",
  versionId: null, createdAt: "2026-11-27T18:04:05.000Z" });
await records.findRecord("9ac1e5d3");   // equal, versionId null
await records.savePreview("2bf1c8e4", "g4bd1a2f6", previewV1); // PRD 0012 M1's result, Match URIs and a Miss with queries
await records.findPreview("2bf1c8e4", "g4bd1a2f6"); // deeply equal to previewV1
```

Events:

```js
await events.recordEvent({ kind: "created", setlistId: "2bf1c8e4", artist: "Pearl Jam", day: "2026-11-28" });
await events.recordEvent({ kind: "updated", setlistId: "2bf1c8e4", artist: "Pearl Jam", day: "2026-11-28" });
await events.recordEvent({ kind: "opened",  setlistId: "2bf1c8e4", artist: "Pearl Jam", day: "2026-11-28" });
await events.recordEvent({ kind: "created", setlistId: "1bd5a2c8", artist: "Guns N' Roses", day: "2026-11-27" });
await events.countPlaylistsMade("2026-11-28"); // 2
await events.countPlaylistsMade("2026-11-27"); // 1
await events.countPlaylistsMade("2026-11-26"); // 0
```

`createSqliteStore` called again on the same database: `countPlaylistsMade("2026-11-28")` is still 2 and `findRecord("9ac1e5d3")` still gives the record. A record with `setlistId: "1bd5a2c8"` and version `g1'; DROP TABLE x; --` saves and reads back unchanged. The same event sequence on `createMemoryUsageEvents()` gives 2, 1 and 0.

### AC coverage

| AC | Examples |
|---|---|
| AC-1 | X1 |
| AC-2 | X1 |
| AC-3 | X2 |
| AC-4 | X2 |
| AC-5 | X2 |
| AC-6 | X2 |
| AC-7 | X3, X4 to X14 |
| AC-8 | X3, X8, X11 |
| AC-9 | X3 |
| AC-10 | X4 |
| AC-11 | X4 |
| AC-12 | X5 |
| AC-13 | X5 |
| AC-14 | X6 |
| AC-15 | X7 |
| AC-16 | X7, X13 |
| AC-17 | X7 |
| AC-18 | X8 |
| AC-19 | X9 |
| AC-20 | X9 |
| AC-21 | X9 |
| AC-22 | X10 |
| AC-23 | X10 |
| AC-24 | X11 |
| AC-25 | X11 |
| AC-26 | X11 |
| AC-27 | X12, X13 |
| AC-28 | X12 |
| AC-29 | X13 |
| AC-30 | X13 |
| AC-31 | X14 |
| AC-32 | X10, X13 |
| AC-33 | X15 |
| AC-34 | X16 |
| AC-35 | X17 |
| AC-36 | X17 |
| AC-37 | X17 |

## Manual run check

With a real setlist.fm key in `.env` and no Host token (the entry file's never-connected source): `npm run web`, open `http://127.0.0.1:3000`. `curl "http://127.0.0.1:3000/api/artists?name=Pearl%20Jam"` lists Pearl Jam; the Setlist page of its mbid lists Setlists; `GET /api/setlists/<id>` answers its Show with `"playlist":{"status":"none"}`; the preview and create routes answer 503 `PLAYLISTS_UNAVAILABLE`. Removing `SETLISTFM_API_KEY` makes `npm run web` log `Playset can't start: Missing SETLISTFM_API_KEY.` and exit with code 1. `data/playset.db` exists after the first start.

## Changes to earlier PRDs

No earlier PRD's behaviour changes. Each was checked:

- **PRD 0001 — setlist.fm link:** unchanged. The link route uses its reader as is. Any reader refusal is one Visitor error (E-3); the reader's own messages aren't sent.
- **PRD 0002 — Performances:** unchanged. Covers, Encores, Sets, repeats and snippets reach the Visitor as the prepare step gives them.
- **PRD 0003 — Matching:** unchanged. Match URIs, ids and Miss queries stay on the server (and in the cached preview).
- **PRD 0004 — Spotify login:** unchanged. The web server uses no loopback login and no `PLAYSET_AUTH_PORT`; the Host token comes from the Host token source.
- **PRD 0005 — setlist.fm:** unchanged. The 404-means-empty rule of the Setlist page is kept (no `NOT_FOUND` for an Artist, see Non-goals). The web server reads its key only from its own config, never from `~/.config/playset/`.
- **PRD 0006 — Setlist Playlist:** unchanged. Its errors (nothing to add, description too long, partly created, rate limit) get Visitor wording.
- **PRD 0007 — CLI:** unchanged. The CLI shares only the env name `SETLISTFM_API_KEY` and `SPOTIFY_CLIENT_ID` with the web server; the CLI's config file and exit codes are untouched.
- **PRD 0008 — Medley split, PRD 0009 — Interactive shell, PRD 0010 — "+" in titles:** unchanged.
- **PRD 0011 — Incomplete Setlists:** unchanged. The incomplete status is shown; the web makes no newest-complete offer.
- **PRD 0012 — Run steps:** unchanged. AC-3's "Artist not found" error is answered as an empty list, not an error (AC-11 here). AC-17's cancel signal is used for disconnects (AC-25 here).
- **PRD 0014 — Host playlists:** unchanged. Its non-goals (no SQLite, locks, limits or usage events) are filled here, in the server. Its decision 3 ("an update with a current record still writes; when to call is the server's job") is used as is: the server calls create-or-update whenever a Visitor asks (see Decisions 11).
- **PRD 0015 — Web contract:** no contract change. The server uses `ROUTES`, `ERROR_CODES`, `LIMITS` and the schemas as they are. Its wire rules are followed. Two things the contract left open are settled here: `artist.name` is never sent (Non-goals), and `previewResult.versionId` is always the fetched Setlist's version because a Setlist without one never gets a stream (E-20). The `CONFIG_ITEMS` labels map to `SETLISTFM_API_KEY`, `SPOTIFY_CLIENT_ID`, `PLAYSET_HOST_SPOTIFY_ID` and `PLAYSET_COOKIE_SECRET` (for Slice 17's status page).

**Tests.** No existing test changes.

## Shared-file requests

For the orchestrator (this Slice does not edit shared files):

- **CLAUDE.md**, Architecture: add "`src/web/server/` — Express app for the web: `createApp(deps)` (never listens; tests use fakes), visitor routes of the contract, SSE preview (shared identical runs, abort on disconnect), per-IP/daily limits in memory, one create/update per Setlist at a time, error catalogue with visitor wording, helmet CSP, SQLite store (`better-sqlite3`: records, cached previews, usage events; no IPs). Entry `main.ts`: zod config from env/`.env`, listens on 127.0.0.1." Commands: add "`npm run web` — build the client and start the web server (`http://127.0.0.1:3000`)".
- **`.env.example`** (new, at the repo root):
  ```
  SETLISTFM_API_KEY=
  SPOTIFY_CLIENT_ID=
  PLAYSET_HOST_SPOTIFY_ID=
  # at least 32 characters, e.g. from: openssl rand -hex 32
  PLAYSET_COOKIE_SECRET=
  # PLAYSET_WEB_PORT=3000
  # PLAYSET_WEB_DATA=./data/playset.db
  # PLAYSET_PREVIEW_LIMIT=30
  # PLAYSET_CREATE_LIMIT=10
  # PLAYSET_DAILY_LIMIT=200
  # PLAYSET_TRUST_PROXY=0
  ```
- **`.gitignore`**: add `.env` and `data/`.
- **package.json, lockfile:** none (express 5, helmet, better-sqlite3, supertest and the `web` scripts are on `main`).
- **src/core/index.ts:** none. Every step, error and type the server needs is exported.
- **GLOSSARY.md:** none.
- **docs/PLAN.md:** none (Depends on: 15).

## Glossary terms used

- **Setlist** — as defined in GLOSSARY.md.
- **Show** — as defined in GLOSSARY.md.
- **Artist** — as defined in GLOSSARY.md.
- **Performance** — as defined in GLOSSARY.md.
- **Tape** — as defined in GLOSSARY.md.
- **Cover** — as defined in GLOSSARY.md (X9 only).
- **Unknown Song** — as defined in GLOSSARY.md (fixtures only).
- **Incomplete Setlist** — as defined in GLOSSARY.md (unchanged rules only).
- **Setlist Playlist** — as defined in GLOSSARY.md.
- **Host Account** — as defined in GLOSSARY.md.
- **Visitor** — as defined in GLOSSARY.md.
- **Match** — as defined in GLOSSARY.md.
- **Miss** — as defined in GLOSSARY.md.

The words in "Words used in this PRD" are PRD-local, not glossary terms.

## Decisions (made by the PRD writer; /implementing is in full-auto mode)

1. **All four secrets are required at startup** (setlist.fm key, Spotify client id, Host Account id, cookie secret). A missing or invalid value stops startup with one log line listing every problem and exit code 1 (the brief and the server rules). Admin status `present` (PRD 0015) is then always true while the server runs; Slice 17 may revisit. The cookie secret needs at least 32 characters.
2. **Env names for the new settings:** `PLAYSET_COOKIE_SECRET`, `PLAYSET_CREATE_LIMIT`, `PLAYSET_DAILY_LIMIT`, `PLAYSET_TRUST_PROXY` (next to the brief's `PLAYSET_PREVIEW_LIMIT`, `PLAYSET_WEB_PORT`, `PLAYSET_WEB_DATA`). `.env` in the working directory is loaded; real env wins.
3. **`PLAYSET_TRUST_PROXY` (default off)** decides the Visitor address. It is needed later behind a proxy, and lets tests set addresses with `X-Forwarded-For`.
4. **Windows are sliding 60 minutes per address; the day is UTC.** `Retry-After` is the exact wait, rounded up, at least 1 second. Upstream 429s use a fixed 60 seconds, because the core's errors don't carry setlist.fm's or Spotify's `Retry-After`.
5. **What counts.** A preview counts when it starts a run (cached and joined previews are free; failed or cancelled ones still count). A create/update counts when admitted, whatever its outcome (and also when it joins a running one). Not-connected and daily-limit answers count nothing. The daily limit counts `created` + `updated` usage events (successes only).
6. **Order of checks.** Host token first (cheap, and "unavailable" beats a countdown), then for preview the setlist.fm fetch (the cache and the version need it), then the limit. For create: limits before setlist.fm, so an over-limit Visitor costs nothing.
7. **`previewResult.versionId` is required, the core's is optional:** a Setlist without a version answers `UPSTREAM_UNAVAILABLE` (E-20) before the stream, so every preview event has the fetched version. In the Setlist status, a Setlist without a version answers `none` or `outdated`, never `current`.
8. **The Host Account must be connected for every preview**, cached or not, because a preview leads to Create, which needs it.
9. **Joined preview streams replay earlier progress** so `n` still counts up from 1 on every stream (PRD 0015 wire rule). The run is aborted only when its last listener leaves.
10. **One create/update per Setlist:** a request for the same version shares the running result; one for another version waits, then runs on its own. Different Setlists run in parallel.
11. **No short-cut for a current record on create.** The server calls create-or-update whenever asked (PRD 0014 decision 3); the client doesn't offer Create for a current playlist, and the limits bound the cost. The update replaces every track, so a repeat is harmless.
12. **Answers are checked against the contract before they are sent;** a rejected one becomes `INTERNAL`. This enforces "never send an object the contract doesn't describe" and keeps fields like `uri`, `queries`, `versionId` (on summaries) or `playlistId` out.
13. **Error statuses:** `INVALID_INPUT` 400 (413 for a too-large body), `NOT_FOUND` 404 (also for a wrong method on an `/api` path), `RATE_LIMITED` 429, `UPSTREAM_UNAVAILABLE` 502, `PLAYLISTS_UNAVAILABLE` 503, `SETLIST_CHANGED` 409, `INTERNAL` 500. (`NOT_ADMIN` is Slice 17.)
14. **A Spotify 401 with the Host token is `PLAYLISTS_UNAVAILABLE`**, not an upstream failure: the Host token no longer works, so making playlists is unavailable until the admin reconnects.
15. **"Artist not found" from the core is an empty list** (PRD 0015 decision 6). An unknown mbid gives an empty Setlist page (core rule), not `NOT_FOUND`.
16. **Partly created / partly updated are `UPSTREAM_UNAVAILABLE`** with a hint to try again: the core's record rules (PRD 0014 AC-19, AC-20) make the retry fill or update the same playlist.
17. **No-version and description-too-long** get their own Visitor wording (E-20, E-8). The core's missing-key, refused-URL, page-not-valid and auth-port errors can't happen with valid config and input, so they are `INTERNAL`.
18. **Usage events:** one `opened` per status answer with a current playlist (no de-duplication); `created`/`updated` once per successful run (not per waiting request). No event on errors, also not for a partly created playlist.
19. **SQLite:** `createSqliteStore` takes an open database so tests use `:memory:` and can inspect every table. Tables are created if missing. Cached previews are stored whole (as JSON), with Match URIs and Miss queries, because create-or-update needs them. No pruning.
20. **Static files:** hashed files under `/assets/` are cached for a year; `index.html` is never cached; every GET outside `/api` that isn't a file gets `index.html` (the client's routes, including `/admin` for Slice 19). Slice 17 adds `/admin/login` and `/admin/callback` before this fallback.
21. **CSP** as AC-3, without `upgrade-insecure-requests`, which would break plain HTTP on 127.0.0.1. Fonts are self-hosted (`docs/design.md`), so `'self'` is enough.
22. **Keep-alive comments every 15 seconds** on a preview stream while waiting.
23. **Logging:** no access log; 5xx and upstream errors are logged with their cause, every secret value replaced by `[redacted]`; a cancelled preview is `info`; no IP is ever logged.
24. **The entry file wires `notConnectedHostTokenSource`** until Slice 17, so this Slice's manual check covers search, Setlist list, status and `PLAYLISTS_UNAVAILABLE`.

## Open questions

(none)
