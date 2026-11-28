# PRD 0018 — Visitor web app

Status: Approved
Slice: 18
Depends on: 0013 (design lock, `docs/design.md`; not a PRD file), 0015
Module: src/web/client

## Problem

The web server (Slices 16 and 17) answers the web API contract of PRD 0015, but a **Visitor** has nothing to open in a browser. Today the only way to turn a **Setlist** into a **Setlist Playlist** is the `playset` CLI, whose prompts and flags confuse people. The phase plan (`docs/phases/web-ui.md`) asks for a guided web page: find the **Artist** or paste a setlist.fm link, pick the **Show**, see every **Performance** with its **Match** or **Miss**, and get the share link of a public Setlist Playlist in the **Host Account**. The approved design lock (`docs/design.md`) says how it looks; nobody has built it yet.

## Goal

A Visitor opens the web app, finds a Setlist by Artist name or setlist.fm link, sees a streamed preview, and creates (or updates, or simply opens) its Setlist Playlist, with every step in the URL so Back works, every error explained in the server's words with the right next action, and every screen passing the accessibility checks. The app reads every answer through one typed API client built on the PRD 0015 contract.

## Non-goals

- **No `/admin` page.** Login, Host Account status, config and usage are Slice 19. Until then `/admin` in the browser shows this Slice's "Page not found" screen (the server's `/admin/login` and `/admin/callback` redirects are untouched).
- **No Tape question.** Tapes are always left out in the web (ADR 0002); they are only listed under "Left out".
- **No "newest complete Setlist" offer, no Latest Setlist shortcut, no auto-pick** of an Artist, even when exactly one candidate matches exactly.
- **No search-as-you-type, no autocomplete list, no infinite scroll.** Load more is a button.
- **No country** in the Show line or the Setlist list. The contract has none (PRD 0015). `docs/design.md` shows "New York, United States"; this Slice shows "New York".
- **No Set label on an Unknown Song.** The contract gives only its place and info. `docs/design.md`'s "Played in Main set." is dropped.
- **No Match rows streaming one by one.** The contract sends only a count while Matching, then the whole preview (PRD 0015). Match lines ink in once, when the sheet first renders.
- **No Spotify links per track, no audio, no album art.** Match lines are plain text.
- **No theme toggle, no language other than English.**
- **No contract change.** Nothing is added to or removed from `src/web/shared/`.
- **No server code**, no route, no rate limit, no record. The client never calls setlist.fm or Spotify.
- **No offline support, service worker or PWA manifest.**
- **No browser end-to-end tests.** Behaviour is tested with Testing Library in jsdom; layout at 375px and reduced motion get a manual run check plus static style checks.
- **No legal review.** The Terms and Privacy text below is a plain-words draft for the user to approve, not lawyer-grade.

## User stories

- As a Visitor planning for a Show, I want to type the Artist's name and pick the right one from a list, so that I never get a playlist for a same-named act.
- As a Visitor who already has the setlist.fm page open, I want to paste its link and go straight to that Setlist.
- As a Visitor, I want to see every Performance with its Match or Miss before anything is made, so that I know what the playlist will hold.
- As a Visitor whose Setlist already has a current Setlist Playlist, I want the link at once, without waiting for Matching.
- As a Visitor whose Setlist changed on setlist.fm, I want to update the existing playlist rather than get a second one.
- As a Visitor using a screen reader or only a keyboard, I want each new screen's heading focused and the Matching progress announced, so that I can follow every step.
- As a Visitor who hits a limit or an outage, I want to be told in plain words what happened and when I can try again.
- As a Visitor, I want to know that the playlists are public in Playset's Spotify account and what Playset keeps about me.

## Words used in this PRD

Terms from earlier PRDs keep their meanings: "preview" (PRD 0007), "not-added list" (PRD 0012), "version" (PRD 0014), "contract", "preview stream", "event" (PRD 0015). These PRD-local words are added; none is a glossary term:

- **Screen**: what one route shows (Start, candidates, Setlist list, Setlist screen, Terms, Page not found).
- **Setlist screen**: the route of one Setlist. It shows the Show line and then one of: the "Setlist Playlist ready" panel, the preview, or an error.
- **Sheet**: the preview's list of rows, one section per **Set** (`docs/design.md` §5.6).
- **Live region**: the one visually hidden polite announcement area of the page.
- **API client**: the one typed module through which the app calls the server.
- **Client error**: an error the API client makes itself when there is no server error body to show (no answer, an answer that isn't the contract's shape, a stream that stops early). It has a code from the shared list and Playset's own words.

## Routes

| Path | Screen | Back link (`docs/design.md` §4) | Document title |
|---|---|---|---|
| `/` | Start | none | `Playset` |
| `/?artist=<name>` | Start form + candidates (or "No Artist found — check spelling") | "New search" → `/` | `Artists for "<name>" – Playset` |
| `/artists/:mbid` | Setlist list | "New search" → `/` | `<Artist> – Setlists – Playset` (`Setlists – Playset` when the name is unknown) |
| `/setlists/:id` | Setlist screen | "Setlists of <Artist>" → `/artists/:mbid` when reached from a Setlist list; otherwise "New search" → `/` | `<Artist>, <date> – Playset` (`Setlist – Playset` until the Show is known) |
| `/terms` | Terms and Privacy | "Back to Playset" → `/` | `Terms and Privacy – Playset` |
| anything else | Page not found | "New search" → `/` | `Page not found – Playset` |

`<name>` is the trimmed search text. `<date>` is the en-GB date ("2 Jun 2026").

## Acceptance criteria

All UI text in quotes is exact. "Announces X" means the live region's text becomes X. "Focus moves to the heading" means the heading becomes `document.activeElement`. "The server's message and hint" means the `message` and `hint` of the error the API client returned, shown as given (the hint line is left out when there is none). "Try again" re-sends the request that failed, unchanged.

### Shell

- **AC-1** — Given any screen, when it renders, then the page has, in this order: a "Skip to content" link as the first focusable element (its target is the `main` element), a `header` with the wordmark link "Playset" to `/`, one `main`, and a `footer` with three paragraphs: "Setlists from setlist.fm" (where "setlist.fm" links to `https://www.setlist.fm/`), "Playlists are created in Playset's Spotify account and are public." and a "Terms and Privacy" link to `/terms`. Every screen has exactly one `h1`.
- **AC-2** — Given each route of the Routes table, when its screen is shown, then the document title is the one in the table and the back link (when the table has one) has exactly that text and target; the Start screen has no back link.
- **AC-3** — Given the Visitor moves to a new screen inside the app (a link, a form, Back or Forward), when that screen's main content has rendered, then focus moves to its heading (the `h1`, or the heading of a screen-level error alert, AC-37). A plain first load of `/` with no `artist` query does not move focus.
- **AC-4** — Given the Visitor has gone Start → candidates → Setlist list → Setlist screen, when they press the browser's Back button three times, then they see the Setlist list (with the rows already loaded, AC-15), then the candidates for the same name, then the empty Start form, each without a new request to the server for data it already showed.
- **AC-5** — Given a path that no route matches (such as `/admin`, `/setlist/73a1b2c5` or `/artists`), or a route parameter the contract rejects (an `:mbid` that isn't an mbid, an `:id` that isn't a setlist id), when it is opened, then the Page not found screen shows the `h1` "Page not found", the text "There's nothing at this address." and a link "Search for an Artist" to `/`, and no request is sent to the server.

### Start and Artist search

- **AC-6** — Given the Start screen, when it renders, then it shows the `h1` "Hear the Setlist before the Show", the text "Find an Artist's Setlist on setlist.fm and play it as a Spotify playlist.", a form with a search input labelled "Artist" and a "Search" button, and a separate form with a URL input labelled "setlist.fm link" (placeholder `https://www.setlist.fm/setlist/…`) and an "Open" button. Typing in the Artist input sends no request.
- **AC-7** — Given the Artist input holds text, when the Visitor presses Enter in it or activates "Search", then the URL becomes `/?artist=<trimmed text>` and the API client is asked to search that trimmed name once. While the answer is pending the button reads "Searching…" with `aria-disabled="true"`, a second activation sends nothing, and an earlier candidate list (if any) stays until the new answer arrives.
- **AC-8** — Given the Artist input is empty or only whitespace, when the Visitor searches, then no request is sent, the input gets `aria-invalid="true"`, and under it the message "Type an Artist's name to search." is linked to the input with `aria-describedby`; focus stays in the input.
- **AC-9** — Given a search answer with one or more candidates, when it arrives, then the Start form stays on top with the input holding the searched name, followed by the `h1` "Pick the Artist", the line `<n> Artists found for "<name>"` ("1 Artist found for …" for one), and an ordered list of links, one per candidate in the server's order, each showing the name and, when present, the disambiguation. This holds for a single candidate too: the app never moves on by itself.
- **AC-10** — Given the candidate list, when the Visitor activates a candidate, then the URL becomes `/artists/<mbid>` and the Setlist list opens, knowing the candidate's name for its heading while the first page loads.
- **AC-11** — Given a search answer with no candidates, when it arrives, then the `h1` reads "No Artist found — check spelling", followed by `Nothing on setlist.fm matches "<name>". Try the Artist's full name or another spelling.`; the input keeps the name and no list is shown.
- **AC-12** — Given the Visitor opens `/?artist=Fontaines%20D.C.` directly (a shared or reloaded URL), when the page loads, then the input holds "Fontaines D.C." and the search for that name runs as in AC-7, without the Visitor pressing Search.

### setlist.fm link

- **AC-13** — Given the link input holds a link, when the Visitor presses Enter in it or activates "Open", then the API client is asked to read the trimmed link once; while pending the button reads "Opening…" (`aria-disabled`). On an answer `{ setlistId }` the URL becomes `/setlists/<setlistId>` and the Setlist screen opens with the back link "New search".
- **AC-14** — Given the link input is empty or only whitespace, when the Visitor opens it, then no request is sent and the field shows the invalid state of AC-8 with the message "Paste a setlist.fm Setlist link to open it.". Given the server answers `INVALID_INPUT` or `NOT_FOUND`, then the field shows the invalid state with the server's message and hint, the link stays in the input and focus returns to the input.

### Setlist list

- **AC-15** — Given `/artists/:mbid`, when it opens, then the `h1` is the Artist's name (the answer's `artist.name`, else the name known from the candidate the Visitor picked, else "Setlists"), followed by "Setlists on setlist.fm, newest first". While page 1 loads, the line "Loading Setlists…" shows. Then each Setlist of the answer is one link row, in the server's order, to `/setlists/<id>`, showing the day, month and year of the date (with a `time` element whose `datetime` is the ISO date), the venue, the city, the song count ("1 song", "21 songs") and, for an Incomplete Setlist (`incompleteStatus.isIncomplete`), an "Incomplete" badge. Pages already loaded are kept in memory: returning to this URL in the same visit shows them again without a new request.
- **AC-16** — Given a Setlist row, when its accessible name is read, then it is the date, venue, city and song count joined by ", ", plus ", Incomplete Setlist" for an Incomplete Setlist (for example "24 Nov 2026, TD Garden, Boston, 18 songs, Incomplete Setlist"). An empty venue or city is left out with its comma.
- **AC-17** — Given the answer has `hasMore: true`, when the list renders, then a "Load more Setlists" button follows the rows. Activating it asks for the next page number once; while pending the button reads "Loading…" (`aria-disabled`) and focus stays on it. The new Setlists are appended below the existing rows, a Setlist whose id is already in the list is not added again, and the live region announces `<n> more Setlists loaded` ("1 more Setlist loaded"), or "No more Setlists" when none was added.
- **AC-18** — Given the latest page answered `hasMore: false`, when the list renders, then there is no "Load more Setlists" button and the line "That's every Setlist on setlist.fm." follows the rows.
- **AC-19** — Given page 1 has no Setlists and `hasMore: false`, when it renders, then under the `h1` an `h2` reads "No Setlists with songs yet", followed by "setlist.fm has no Setlist with songs for this Artist." and a link "Search for another Artist" to `/`. Given page 1 has no Setlists and `hasMore: true`, then the line "No Setlists with songs among the newest ones. Load more to look further back." shows above the "Load more Setlists" button.
- **AC-20** — Given a Visitor activates a Setlist row, when the Setlist screen opens, then its back link reads "Setlists of <Artist>" and goes to `/artists/<mbid>` (or "Setlists" when the name is unknown).

### Setlist screen: status and Show line

- **AC-21** — Given `/setlists/:id`, when it opens, then the API client is asked for the Setlist's status once and the line "Loading the Setlist…" shows. When the status arrives, the `h1` is the Show's Artist and the Show line follows: the en-GB date, the venue and the city, each its own item, empty parts left out (no country). Given `incompleteStatus.isIncomplete`, a caution alert titled "Incomplete Setlist" follows with "setlist.fm doesn't list the whole Show. The playlist has only the known songs." and, when the status has a `setlistNote`, the line `setlist.fm note: "<setlistNote>"`.
- **AC-22** — Given the status has `playlist.status: "current"`, when it arrives, then no preview is asked for. A result panel shows the `h2` "Setlist Playlist ready", the text "It's up to date with setlist.fm.", a link "Open in Spotify" to the playlist `url` that opens in a new tab (`target="_blank"`, `rel` containing `noopener`, accessible name "Open in Spotify (opens in a new tab)"), the `url` as visible text, and a "Copy link" button. Focus moves to the `h2`.
- **AC-23** — Given the "Copy link" button, when it is activated, then the `url` is written to the clipboard, the button reads "Copied" for 2 seconds and then "Copy link" again, and the live region announces "Link copied". If the clipboard refuses, the live region announces "The link couldn't be copied. Select the link text and copy it." and the button keeps "Copy link".
- **AC-24** — Given the status has `playlist.status: "none"` or `"outdated"`, when it arrives, then the preview starts at once (AC-25). For `"outdated"` an info alert sits under the Show line: "This Setlist changed on setlist.fm since its playlist was made." with a link "Open current playlist" to the status `url` that opens in a new tab (accessible name "Open current playlist (opens in a new tab)").

### Setlist screen: preview

- **AC-25** — Given the preview has started, when no progress has arrived yet, then the line "Loading the Setlist…" shows. When a progress `{ n, total }` arrives, then the line reads `Matching <n> of <total> Performances` and a `progress` element has `max` = total, `value` = n and an accessible name equal to that line. No sheet, counts or action are shown until the preview result arrives.
- **AC-26** — Given progress events, when they arrive, then the live region announces `Matching <total> Performances` on the first one, and afterwards `Matching <n> of <total>` on a progress event only when at least 5 seconds have passed since the last announcement. When the result arrives it announces `Matching done: <m> Matches, <k> Misses` (singulars "1 Match", "1 Miss"). A cached preview with no progress events announces only the "Matching done" line.
- **AC-27** — Given a preview result, when it renders, then the counts list comes before the sheet: `<m> Matches` always ("1 Match", "0 Matches"), `<k> Misses` only when k > 0, `<u> Unknown Songs not added` only when u > 0 ("1 Unknown Song not added"), `<t> Tapes left out` only when t > 0 ("1 Tape left out"), where u and t count the not-added entries with reason `unknown` and `tape`.
- **AC-28** — Given a preview result, when the sheet renders, then the rows are grouped into one section per run of rows with the same `setLabel`, in row order, each headed by an `h2` with the label as given, except `main`, shown as "Main set". Each row is an item of an ordered list and shows its row `number` and the Performance's `title`. A Match row shows the line `<match name> by <artists joined with ", ">`, plus " (live recording)" when `live` is true. A song played twice is two rows.
- **AC-29** — Given a row whose outcome is a Miss, when it renders, then it is marked as a Miss row, has an `id` that the Misses list links to, and its line reads `Miss. No Spotify track by <artist>.`, or `Miss. No Spotify track by <artist> or <originalArtist>.` for a Cover.
- **AC-30** — Given a Performance with `originalArtist` (a **Cover**), its row shows a "Cover" badge whose accessible text is `Cover of a song by <originalArtist>`. Given a Performance with `medley`, its row shows a "Medley" badge whose accessible text is `Part of the medley "<medley>"`.
- **AC-31** — Given not-added entries with reason `unknown`, when the sheet renders, then each becomes an **Unknown Song** row without a number, placed right after the row whose `number` equals its `after` (in that row's section), or before the first row when `after` is 0, several at the same place in list order. It reads "Unknown Song" and "Not added.", followed by its `info` in quotes when present. It is not counted as a Miss. With no rows at all, the Unknown Song rows form one list with no Set heading.
- **AC-32** — Given the result has Misses, when it renders, then an `h2` "Misses" follows the counts, with one in-page link per Miss in `misses` order reading `<number> <title>` and pointing to that Miss row. With more than 10 Misses only the first 10 show, followed by a button `Show all <k> Misses` that shows the rest in place. With no Misses there is no "Misses" heading.
- **AC-33** — Given not-added entries with reason `tape` or `snippet`, when the result renders, then after the sheet an `h2` "Left out" lists, under "Tapes are never added:", the Tape names, and under "Snippets are noted, not added:", the snippet names, each list in not-added order; a list with no entries is left out, and so is the whole section when both are empty. Tapes and snippets are never sheet rows.
- **AC-34** — Given a preview result with at least one Match, when it renders, then one action button shows ("Create playlist" for status `none`, "Update playlist" for `outdated`), with the line "Public, in Playset's Spotify account" under "Create playlist" or "Replaces the songs in the same playlist" under "Update playlist". Given zero Matches, no action button shows and the line "No songs matched, so there is nothing to put in a playlist." takes its place. Each control appears once on the page whatever the width.

### Create and update

- **AC-35** — Given the action button, when it is activated, then the API client is asked once to create the Setlist Playlist with the result's `versionId`. While pending the button reads "Creating…" (or "Updating…"), has `aria-disabled="true"`, ignores further activations, and the live region announces "Creating playlist" (or "Updating playlist").
- **AC-36** — Given the create answer `{ url, status }`, when it arrives, then the action is removed and a result panel is inserted under the Show line (and under the outdated info alert, which is removed): `h2` "Playlist created" for `status: "created"` or "Playlist updated" for `"updated"`, the result's `playlistName`, the line `<m> songs, public in Playset's Spotify account.` ("1 song, …") with m the number of Match rows, the "Open in Spotify" link and the visible `url` as in AC-22, and the "Copy link" button of AC-23. Focus moves to the `h2`. The counts, Misses and sheet stay below, unchanged. This holds when Update answers `created` (the server made the playlist again).

### Errors

- **AC-37** — Given an error that ends a screen's main request (search, Setlist page 1, link read, Setlist status, preview), when it is shown, then it is one alert in place of the screen's content (under the Start form, under the Setlist list `h1`, under the Show line once the Show is known). Its heading is the server's message, an `h1` when the screen has no other `h1` yet, otherwise an `h2`; the hint follows; focus moves to the heading. An error on Load more or on Create/Update is an alert with `role="alert"` in place of that button (rows and preview stay), and focus is not moved. No error ever shows a status number, exception text or a stack.
- **AC-38** — Given an error with code `RATE_LIMITED` and a retry wait of s seconds (from the answer's `Retry-After`), when it is shown, then the alert holds the server's message and hint, the line `You can try again in <m:ss>` counting down once per second, and a "Try again" button with `aria-disabled="true"` that ignores activation. The live region announces `Try again in <s> seconds` once at the start and "You can try again now" once at zero; the countdown line is then removed and the button is enabled without moving focus. Activating it re-sends the request. Without a retry wait (no or unreadable `Retry-After`, or an `error` event in the preview stream) the button is enabled at once and there is no countdown line.
- **AC-39** — Given an error with code `UPSTREAM_UNAVAILABLE` or `INTERNAL` (or `NOT_ADMIN`, which a Visitor route never answers), when it is shown, then the alert holds the server's message and hint and a "Try again" button; activating it re-sends the request, the button reads "Trying again…" (`aria-disabled`) while pending, and a success replaces the alert with the normal content.
- **AC-40** — Given an error with code `PLAYLISTS_UNAVAILABLE` (from the preview or from Create/Update), when it is shown, then the alert's title is "Playlist creation is temporarily unavailable" and its body is the server's hint (or its message when there is no hint). From the preview: the alert replaces the preview under the Show line and offers a link "Setlists of <Artist>" to the list when reached from one, otherwise "Search for an Artist" to `/`; an outdated playlist's "Open current playlist" link (AC-24) stays. From Create/Update: the alert replaces the action and the preview stays visible.
- **AC-41** — Given an error with code `SETLIST_CHANGED` from Create/Update, when it is shown, then an info alert with the server's message and hint and a "Load fresh preview" button replaces the action. Activating it asks for the Setlist status and a new preview again (AC-21 to AC-34 apply to the new answers), and focus moves to the `h1` once the Show line is shown again.
- **AC-42** — Given an error with code `NOT_FOUND` on the Setlist list or the Setlist screen, when it is shown, then it is a screen-level caution alert (AC-37) with the server's message and hint and a link "Search for an Artist" to `/`.
- **AC-43** — Given an error with code `INVALID_INPUT` from a search, when it is shown, then the Artist field shows the invalid state of AC-8 with the server's message and hint instead of the client's text, and focus returns to the input. From Create/Update it is an action alert with the message and hint and no button.
- **AC-44** — Given the preview stream ends with an `error` event after some progress, when it is shown, then the progress line and bar are replaced by the alert for its code (AC-38 to AC-42), and "Try again" starts a new preview.

### Leaving and cancelling

- **AC-45** — Given a preview is streaming, when the Visitor leaves the Setlist screen (a link, Back, or another route), then the stream is closed at once (the cancel signal handed to the API client is aborted), nothing about it is announced afterwards, and no error is shown for it. Given the status or a page request is still pending when the Visitor leaves, it is cancelled the same way.
- **AC-46** — Given a create or update has been sent, when the Visitor leaves the Setlist screen, then the request is not cancelled (the server finishes it), and no panel or announcement appears on the screen the Visitor moved to.

### API client (the real one, over HTTP)

- **AC-47** — Given the API client built on a fetch function, when each call is made, then it sends exactly these requests (path parameters and query values percent-encoded) with `Accept: application/json`, and returns the answer parsed by the contract's answer schema:
  - search `"Sigur Rós"` → `GET /api/artists?name=Sigur%20R%C3%B3s`;
  - Setlist page of mbid `83b9cbe7-9857-49e2-ab8e-b57b01038103`, page 2 → `GET /api/artists/83b9cbe7-9857-49e2-ab8e-b57b01038103/setlists?page=2` (page 1 sends `?page=1`);
  - link `https://www.setlist.fm/setlist/a/b-73a1b2c5.html?x=1&y=2` → `GET /api/setlist-links?url=` + the link encoded as one query value;
  - status of `73a1b2c5` → `GET /api/setlists/73a1b2c5`;
  - create for `73a1b2c5` with version `g3e5f7a91` → `POST /api/setlists/73a1b2c5/playlist`, `Content-Type: application/json`, body exactly `{"versionId":"g3e5f7a91"}`.
- **AC-48** — Given the server answers with an error status and an error body, when the call settles, then it fails with an API error carrying the body's `code`, `message` and `hint` (absent when the body has none) and, for `RATE_LIMITED`, a retry wait equal to a `Retry-After` of whole seconds (absent when the header is missing or isn't a whole number).
- **AC-49** — Given the fetch function rejects (no connection), or the server answers with a body that isn't JSON or doesn't pass the contract's schema (an error body included), when the call settles, then it fails with a client error: code `UPSTREAM_UNAVAILABLE`, message "Playset isn't answering right now.", hint "Check your connection and try again in a minute." for no answer or a non-JSON body; code `INTERNAL`, message "Something went wrong on our side.", hint "Please try again in a minute." for a body that fails the schema. A call whose cancel signal was aborted fails as cancelled, never as one of these errors.
- **AC-50** — Given the preview call for `73a1b2c5`, when it is made, then it sends `GET /api/setlists/73a1b2c5/preview` with `Accept: text/event-stream` and the caller's cancel signal, reads the answer as a stream, hands each `progress` event's data to the caller's progress callback in order, ignores comment lines (starting with `:`) and blank keep-alives, accepts `\n` and `\r\n` line ends and events split across chunks at any byte, and resolves with the `preview` event's data. An `error` event fails the call with that error (no retry wait). An error status before the stream fails as in AC-48.
- **AC-51** — Given the preview stream ends without a `preview` or `error` event, when it closes, then the call fails with code `UPSTREAM_UNAVAILABLE`, message "The preview stopped before it finished.", hint "Try again in a minute.". Given an event whose data fails its contract schema, then the call fails with the `INTERNAL` client error of AC-49. Given the cancel signal is aborted mid-stream, then the stream is closed and the call fails as cancelled.

### Accessibility, keyboard and look

- **AC-52** — Given each of these screen states, when it is checked with axe, then there are no violations: Start; candidates; No Artist found; Setlist list (with an Incomplete badge, and with Load more); empty Setlist list; Setlist screen while Matching; preview done (with Misses, Cover, Medley, Unknown Song, Left out, Incomplete alert); preview with zero Matches; Setlist Playlist ready; Playlist created; outdated preview with "Update playlist"; each error alert of AC-38 to AC-43; Terms; Page not found.
- **AC-53** — Given only a keyboard (Tab, Shift+Tab, Enter, Space), when the Visitor types an Artist name and presses Enter, Tabs to a candidate and presses Enter, Tabs to a Setlist row and presses Enter, waits for the preview, Tabs to "Create playlist" and presses Enter, then the Playlist created panel shows and focus is on its heading. Every link and button in that path is reachable by Tab, and the field inputs are labelled controls reachable by Tab.
- **AC-54** — Given every icon in the app, when it renders, then it comes from the lucide icon set, has `aria-hidden="true"` and sits next to visible text; no button or link is icon-only, and no text contains an emoji or a Unicode arrow, check mark or bullet standing in for an icon.
- **AC-55** — Given the client's style sheets, when they are scanned, then: colours, spacing, radii, fonts, type sizes, durations and shadows outside the one tokens file are written only as the tokens of `docs/design.md` (no hex, `rgb(`, `hsl(` and no `px` value other than `0` and `1px`); the tokens file holds the light and dark values of `docs/design.md` §2 (for example `--color-spike: #B5135F` light and `#FF7EB8` under `prefers-color-scheme: dark`); under `prefers-reduced-motion: reduce` it sets `--dur-quick` and `--dur-reveal` to `0ms`; no style sheet uses `text-overflow: ellipsis`, `-webkit-line-clamp`, `white-space: nowrap` or `text-align: center`/`justify`; no style sheet or page loads anything from another origin (fonts come from the bundled Fontsource packages).
- **AC-56** — Given the app's HTML page, when it is read, then `html` has `lang="en"`, it has a `viewport` meta with `width=device-width, initial-scale=1`, two `theme-color` metas (`#F2F4F7` with `media="(prefers-color-scheme: light)"` and `#1B2130` with `media="(prefers-color-scheme: dark)"`), the title "Playset", and no script or style sheet from another origin.

### Terms and Privacy

- **AC-57** — Given `/terms`, when it opens, then it shows the `h1` "Terms and Privacy", the line "Last updated 28 Nov 2026" and, in order, the `h2` sections and text of "Terms and Privacy text" below, with the links named there; focus moves to the `h1`.

## Terms and Privacy text

Drafted for the user to approve. Plain words, not lawyer-grade. Shown on `/terms` exactly as below (headings are `h2`; bullet lists are `ul`).

> **Terms and Privacy**
> Last updated 28 Nov 2026
>
> **What Playset is**
> Playset is a free, non-commercial tool. It reads a Setlist from setlist.fm, looks for each song on Spotify and makes a Spotify playlist of it, so you can hear the songs before the Show. It is a personal project, not a company. It comes with no guarantee: Matches can be wrong, songs can be missing, and Playset can be slow or unavailable.
>
> **Playlists are public**
> You don't log in to Spotify to use Playset. Every playlist is created in Playset's own Spotify account and is public: anyone with the link can open it, and Spotify shows it under that account's name. Playset keeps one playlist per Setlist and updates it when the Setlist changes on setlist.fm, so other people may open and share the same playlist. If you want to keep a playlist, save it or copy it to your own Spotify library.
>
> **What Playset keeps about you**
> Nothing that identifies you. There are no accounts, no cookies for Visitors, no analytics, no ads and no third-party scripts or fonts.
> - Your IP address is used only to count requests for Playset's rate limits. The count is held in memory only and is never written down.
> - Playset records which Setlist Playlists were created, updated and opened, with the Artist's name and the day, but not who asked. These numbers show how much Playset is used.
> - What you search for is sent to setlist.fm and Spotify by Playset's server, so they see Playset's server, not you.
> - When you open a playlist you are on Spotify, and Spotify's Privacy Policy applies.
>
> **Where the data comes from**
> Setlists come from setlist.fm, written by its community. Every playlist's description links back to its Setlist on setlist.fm. Song matches and track details come from Spotify. Playset is not made, endorsed or supported by setlist.fm or Spotify. Spotify is a trademark of Spotify AB.
>
> **Spotify's terms**
> Playset uses the Spotify Platform, so these terms apply between you and Playset:
> - Spotify gives no warranty for Playset, and all warranties on Spotify's behalf, including implied ones, are excluded.
> - Spotify is not liable for any loss or damage that comes from using Playset.
> - You may not modify, reverse-engineer or make works based on the Spotify Platform, Spotify's service or its content through Playset.
> - Playset, not Spotify, is responsible for Playset and for any support of it.
> - Spotify is a third-party beneficiary of these terms and may enforce them against you.
>
> Your use of Spotify itself is governed by Spotify's Terms of Use and Privacy Policy.
>
> **Using Playset fairly**
> Use Playset by hand, for your own listening. Don't send automated requests; Playset limits how many previews and playlists one address can ask for, and how many playlists it makes per day.

Links in that text: "setlist.fm" (first mention in "Where the data comes from") → `https://www.setlist.fm/`; "Terms of Use" → `https://www.spotify.com/legal/end-user-agreement/`; "Privacy Policy" (both mentions) → `https://www.spotify.com/legal/privacy-policy/`.

## Test seam

These names are how tests reach the app; they are the only places tests import from (`.claude/rules/tests.md`).

| What | Where | Shape |
|---|---|---|
| App root | `src/web/client/App.tsx`, export `App` | `App({ api, initialPath? })`. `api`: the API client to inject. Without `initialPath` the app uses the browser's URL and history (tests set it with `history.pushState` and press Back with `history.back()`); with it, an in-memory history starting at that path. Each mount has its own query cache, with no automatic retries. |
| API client type | `src/web/client/api/index.ts`, type `PlaysetApi` | `searchArtists(name, signal?) → ArtistsResponse`; `getArtistSetlists(mbid, page, signal?) → ArtistSetlistsResponse`; `readSetlistLink(url, signal?) → SetlistLinksResponse`; `getSetlist(id, signal?) → SetlistResponse`; `streamPreview(id, { onProgress, signal }) → PreviewResult`; `createPlaylist(id, versionId) → CreatePlaylistResponse`. All return promises; types are the contract's. |
| API error | same file, class `ApiCallError` | `new ApiCallError({ code, message, hint?, retryAfterSeconds? })`; fields of the same names. Every failure of the API client (server, client error) is one; a cancelled call rejects with the signal's abort reason instead. |
| Real client | same file, `createHttpApi({ fetch })` | Builds a `PlaysetApi` over the given fetch function, same-origin paths from `ROUTES`. Its tests are `*.test.ts` under `test/web/client/api/` and use a fake fetch returning `Response` objects (streams via `ReadableStream`). |
| Tokens file | `src/web/client/styles/tokens.css` | For AC-55. |
| HTML page | `src/web/client/index.html` | For AC-56; entry `src/web/client/main.tsx` renders `App` with `createHttpApi({ fetch: window.fetch.bind(window) })`. |

The fake API client in tests implements `PlaysetApi` with answers that pass the contract schemas (reuse the PRD 0015 values in `test/web/shared/fixtures/`).

## Examples

### E1 — Artist search "arctic monkeys" (AC-6, AC-7, AC-9, AC-10, AC-53)

Visitor types `  arctic monkeys ` and presses Enter. URL → `/?artist=arctic%20monkeys`; `searchArtists("arctic monkeys")` once. Answer:

```json
{ "artists": [
  { "name": "Arctic Monkeys", "mbid": "ada7a83c-e3e1-40f1-93f9-3e73dbc9298a", "disambiguation": "English rock band from Sheffield" },
  { "name": "The Arctic Monkeys", "mbid": "1c3a5e7f-2b4d-4f6a-8c0e-1a2b3c4d5e6f", "disambiguation": "1960s cover act" },
  { "name": "Arctic Monkeys Tribute", "mbid": "7d9e1f3a-5b7c-4d9e-a1f3-5b7c9d1e3f5a" }
] }
```

Screen: input "arctic monkeys"; `h1` "Pick the Artist" (focused); `3 Artists found for "arctic monkeys"`; links "Arctic Monkeys / English rock band from Sheffield", "The Arctic Monkeys / 1960s cover act", "Arctic Monkeys Tribute". Title `Artists for "arctic monkeys" – Playset`. Activating "Arctic Monkeys" → `/artists/ada7a83c-e3e1-40f1-93f9-3e73dbc9298a`, list `h1` "Arctic Monkeys" while page 1 loads.

### E2 — One candidate, still a list (AC-9, AC-12)

`/?artist=Fontaines%20D.C.` opened directly → input "Fontaines D.C.", search runs. Answer `{ "artists": [ { "name": "Fontaines D.C.", "mbid": "4c1d6a8e-2f3b-4a5c-9d7e-8f0a1b2c3d4e", "disambiguation": "Irish post-punk band" } ] }` → "1 Artist found for "Fontaines D.C."", one link; URL stays `/?artist=Fontaines%20D.C.`.

### E3 — No Artist, empty input, invalid input (AC-8, AC-11, AC-43)

| Input / answer | Screen |
|---|---|
| `arctci monkys` → `{ "artists": [] }` | `h1` "No Artist found — check spelling" (focused); `Nothing on setlist.fm matches "arctci monkys". Try the Artist's full name or another spelling.`; input keeps "arctci monkys" |
| `""` or `"   "` | no request; input `aria-invalid="true"`; "Type an Artist's name to search." |
| 201 × "a" → `INVALID_INPUT`, message "That Artist name is too long.", hint "Use at most 200 characters." | field invalid with "That Artist name is too long." and "Use at most 200 characters."; focus in the input |

### E4 — Setlist link (AC-13, AC-14)

| Link | API client | Result |
|---|---|---|
| ` https://www.setlist.fm/setlist/arctic-monkeys/2026/estadio-metropolitano-madrid-spain-73a1b2c5.html ` | `readSetlistLink` with the trimmed link → `{ "setlistId": "73a1b2c5" }` | `/setlists/73a1b2c5`; back link "New search" |
| `https://example.com/x` | → `INVALID_INPUT`, "That isn't a setlist.fm Setlist link.", hint "Paste a link like setlist.fm/setlist/…/….html" | field invalid with both lines; link kept; focus in input |
| `""` | none | "Paste a setlist.fm Setlist link to open it." |

### E5 — Setlist list, Load more, duplicates, end (AC-15 to AC-20, AC-4)

Page 1 for Arctic Monkeys:

```json
{ "artist": { "mbid": "ada7a83c-e3e1-40f1-93f9-3e73dbc9298a", "name": "Arctic Monkeys" },
  "setlists": [
    { "id": "2b8c4f1a", "date": "2026-11-27", "venue": "Madison Square Garden", "city": "New York", "songCount": 21,
      "incompleteStatus": { "isIncomplete": false, "unknownSongCount": 0 } },
    { "id": "4b8c4e2d", "date": "2026-11-24", "venue": "TD Garden", "city": "Boston", "songCount": 18,
      "incompleteStatus": { "isIncomplete": true, "unknownSongCount": 0, "matchedPhrase": "cut short", "setlistNote": "Show cut short due to curfew." } },
    { "id": "1b8c4d3e", "date": "2026-11-21", "venue": "Scotiabank Arena", "city": "Toronto", "songCount": 1,
      "incompleteStatus": { "isIncomplete": false, "unknownSongCount": 0 } }
  ],
  "hasMore": true }
```

Rows' accessible names: "27 Nov 2026, Madison Square Garden, New York, 21 songs"; "24 Nov 2026, TD Garden, Boston, 18 songs, Incomplete Setlist"; "21 Nov 2026, Scotiabank Arena, Toronto, 1 song". Title "Arctic Monkeys – Setlists – Playset".

"Load more Setlists" → `getArtistSetlists(mbid, 2)` once. Page 2 `{ "artist": { "mbid": "ada7…" }, "setlists": [ the Toronto summary again, { "id": "3b8c4c4f", "date": "2026-11-19", "venue": "Bell Centre", "city": "", "songCount": 20, "incompleteStatus": { "isIncomplete": false, "unknownSongCount": 0 } } ], "hasMore": false }` → one row added ("19 Nov 2026, Bell Centre, 20 songs"), Toronto not repeated, announces "1 more Setlist loaded"; button removed; "That's every Setlist on setlist.fm." shown. A page 2 of `{ "setlists": [], "hasMore": true }` instead → nothing added, "No more Setlists" announced, button stays.

Activating the Boston row → `/setlists/4b8c4e2d`, back link "Setlists of Arctic Monkeys". Browser Back → the four rows again, no new `getArtistSetlists` call.

Empty: Pearl Jam page 67 `{ "artist": { "mbid": "83b9cbe7-9857-49e2-ab8e-b57b01038103" }, "setlists": [], "hasMore": false }` reached from candidate "Pearl Jam" → `h1` "Pearl Jam", `h2` "No Setlists with songs yet", link "Search for another Artist". Same answer opened directly (no candidate known) → `h1` "Setlists". With `"hasMore": true` → "No Setlists with songs among the newest ones. Load more to look further back." and the button.

### E6 — Setlist Playlist ready (AC-21, AC-22, AC-23)

`/setlists/2bf1c8e4`, status (PRD 0015 X6):

```json
{ "show": { "artist": "Pearl Jam", "date": "2026-11-22", "venue": "Moda Center", "city": "Portland",
    "url": "https://www.setlist.fm/setlist/pearl-jam/2026/moda-center-portland-or-2bf1c8e4.html" },
  "incompleteStatus": { "isIncomplete": true, "unknownSongCount": 1 },
  "playlist": { "status": "current", "url": "https://open.spotify.com/playlist/5PqRsTuVwXyZaBcDeFgHiJ" } }
```

Screen: `h1` "Pearl Jam"; "22 Nov 2026", "Moda Center", "Portland"; alert "Incomplete Setlist" (no note line); panel `h2` "Setlist Playlist ready" (focused), "It's up to date with setlist.fm.", "Open in Spotify (opens in a new tab)" → the URL, URL text, "Copy link". `streamPreview` never called. Copy → clipboard holds the URL, "Copied", announces "Link copied", back to "Copy link" after 2 s (fake timers). Title "Pearl Jam, 22 Nov 2026 – Playset".

With the Seattle status (`"matchedPhrase": "cut short", "setlistNote": "Show cut short after a power outage."`) the alert adds `setlist.fm note: "Show cut short after a power outage."`.

### E7 — Preview of the Madrid Setlist (AC-24 to AC-34, AC-26)

Fixture A territory (Arctic Monkeys, Incomplete Setlist, medley). `/setlists/73a1b2c5`: status `{ show: Madrid Show, incompleteStatus: { "isIncomplete": true, "unknownSongCount": 1 }, playlist: { "status": "none" } }`. Stream: progress `{1,5}` … `{5,5}`, then the PRD 0015 X7 preview event (rows Brianstorm, Do I Wanna Know? [medley], R U Mine? [medley], Brianstorm, 505 Miss in "Encore 1"; `notAdded` tape "Intro", snippet "Hey Jude", unknown after 3, snippet "Kashmir"; `playlistName` "Arctic Monkeys – 2026-06-02 – Madrid"; `versionId` "g3e5f7a91").

While streaming: "Loading the Setlist…" → "Matching 1 of 5 Performances" (`progress` max 5 value 1); announces "Matching 5 Performances". Then announces "Matching done: 4 Matches, 1 Miss".

Rendered:

```
Arctic Monkeys                         h1
2 Jun 2026 / Estadio Metropolitano / Madrid
(!) Incomplete Setlist  setlist.fm doesn't list the whole Show. The playlist has only the known songs.
4 Matches
1 Miss
1 Unknown Song not added
1 Tape left out
Misses (h2):  "5 505" → link to the 505 row
Main set (h2)
  1 Brianstorm                Brianstorm by Arctic Monkeys
  2 Do I Wanna Know? [Medley] Do I Wanna Know? by Arctic Monkeys
  3 R U Mine? [Medley]        R U Mine? by Arctic Monkeys
    Unknown Song              Not added.
  4 Brianstorm                Brianstorm by Arctic Monkeys
Encore 1 (h2)
  5 505                       Miss. No Spotify track by Arctic Monkeys.
Left out (h2)
  Tapes are never added: Intro
  Snippets are noted, not added: Hey Jude, Kashmir
[ Create playlist ]  Public, in Playset's Spotify account
```

Medley badge accessible text: `Part of the medley "Do I Wanna Know? / R U Mine?"`. Exactly one "Create playlist" button in the page.

Throttle (fake timers, 42 Performances): progress 1 at 0 s → "Matching 42 Performances"; progress 2–19 within 4.9 s → no new text; progress 20 at 5.0 s → "Matching 20 of 42"; result → "Matching done: 38 Matches, 4 Misses".

Cached preview: only the preview event → no "Matching n of total" line ever; announces only "Matching done: 4 Matches, 1 Miss".

### E8 — Cover, live fallback, Unknown Song info, many Misses (AC-28 to AC-32)

Nirvana (PRD 0015 X7 fragments): row `{ "number": 3, "performance": { "position": 3, "title": "Love Buzz", "setLabel": "main", "originalArtist": "Shocking Blue" }, "outcome": { "kind": "match", "name": "Love Buzz", "artists": ["Nirvana"], "album": "Bleach", "live": false } }` → "3 Love Buzz", badge "Cover" (accessible "Cover of a song by Shocking Blue"), "Love Buzz by Nirvana". Miss `{ "kind": "miss", "title": "Spank Thru", "artist": "Nirvana" }` at row 9 → "Miss. No Spotify track by Nirvana."; a Cover Miss `{ "title": "Molly's Lips", "artist": "Nirvana", "originalArtist": "The Vaselines" }` → "Miss. No Spotify track by Nirvana or The Vaselines.". A Match `{ "name": "Polly", "artists": ["Nirvana"], "album": "MTV Unplugged in New York", "live": true }` → "Polly by Nirvana (live recording)". A Match with `"artists": ["Fontaines D.C.", "Grian Chatten"]` → "… by Fontaines D.C., Grian Chatten". Not-added `{ "reason": "unknown", "after": 7, "info": "Written as 'Dope Hippie' on the setlist" }` → Unknown Song row after row 7: "Unknown Song", "Not added. "Written as 'Dope Hippie' on the setlist"".

23 Misses → Misses list shows 10 links and "Show all 23 Misses"; activating it shows all 23 links.

### E9 — Empty and zero-Match previews (AC-27, AC-31, AC-33, AC-34)

PRD 0015 T1d (Pearl Jam, `rows: []`, `notAdded: [ { "reason": "unknown", "after": 0 }, { "reason": "unknown", "after": 0, "info": "Opener" } ]`) → counts "0 Matches", "2 Unknown Songs not added"; no Misses heading; one unheaded list of two Unknown Song rows (second reads "Not added. "Opener""); no "Left out"; no button; "No songs matched, so there is nothing to put in a playlist.". Live: "Matching done: 0 Matches, 0 Misses".

All-Miss preview (3 rows, all Misses) → "0 Matches", "3 Misses", same no-button line.

### E10 — Create, Update, concurrent (AC-35, AC-36, AC-24)

Madrid (E7) → "Create playlist" → `createPlaylist("73a1b2c5", "g3e5f7a91")` once (a double click sends one); "Creating…", announces "Creating playlist". Answer `{ "url": "https://open.spotify.com/playlist/5PqRsTuVwXyZaBcDeFgHiJ", "status": "created" }` → panel `h2` "Playlist created" (focused), "Arctic Monkeys – 2026-06-02 – Madrid", "4 songs, public in Playset's Spotify account.", "Open in Spotify (opens in a new tab)", URL text, "Copy link"; the button is gone; the sheet is still there. A concurrent Visitor whose create returns the same URL with `"created"` sees the same.

Outdated: status `{ "status": "outdated", "url": "https://open.spotify.com/playlist/5PqRsTuVwXyZaBcDeFgHiJ" }` → info alert "This Setlist changed on setlist.fm since its playlist was made." + "Open current playlist (opens in a new tab)"; preview; "Update playlist" / "Replaces the songs in the same playlist" → "Updating…", announces "Updating playlist"; `{ …, "status": "updated" }` → "Playlist updated", info alert removed. `{ "url": "https://open.spotify.com/playlist/6QrStUvWxYzAbCdEfGhIjK", "status": "created" }` → "Playlist created" with the new URL.

### E11 — Errors by code (AC-37 to AC-44)

| Where | Error | Screen |
|---|---|---|
| Search | `RATE_LIMITED`, "Too many searches from here.", hint "Wait a moment, then search again.", retry wait 42 | alert under the Start form, `h1` "Too many searches from here." (focused), hint, "You can try again in 0:42" → "0:41" after 1 s; "Try again" `aria-disabled`; announces "Try again in 42 seconds"; at 0:00 announces "You can try again now", line gone, button enabled, focus unchanged; activating re-sends `searchArtists("arctic monkeys")` |
| Preview start | `RATE_LIMITED`, "You've asked for many previews in the last hour.", hint "Try again later, or open a Setlist that already has a playlist.", no `Retry-After` | alert under the Show line, `h2` (the Show's `h1` exists), "Try again" enabled, no countdown line |
| Setlist page 1 | `UPSTREAM_UNAVAILABLE`, "setlist.fm isn't answering right now.", hint "Try again in a minute." | screen alert under the list `h1`; "Try again" → "Trying again…" → rows |
| Preview, after progress 2 of 5 | `error` event `UPSTREAM_UNAVAILABLE`, "Spotify isn't answering right now.", "Try again in a minute." | progress line and bar replaced by the alert; "Try again" calls `streamPreview` again |
| Preview | `PLAYLISTS_UNAVAILABLE`, "Playlists can't be made right now.", hint "Search and existing playlists still work. Try again later." | title "Playlist creation is temporarily unavailable", body "Search and existing playlists still work. Try again later.", link "Setlists of Arctic Monkeys" (from list) or "Search for an Artist" (from a link) |
| Create | `PLAYLISTS_UNAVAILABLE` (same) | `role="alert"` alert in place of the button; sheet stays |
| Create | `SETLIST_CHANGED`, "This Setlist changed on setlist.fm a moment ago.", hint "Load a fresh preview to see the new songs." | info alert + "Load fresh preview" → `getSetlist` and `streamPreview` again; focus to `h1` after the Show line returns |
| Create | `RATE_LIMITED`, "You've made many playlists in the last hour.", hint "Try again later.", retry wait 600 | "You can try again in 10:00" in place of the button |
| Create | `INVALID_INPUT`, "There are no Matches to put in a playlist.", no hint | action alert with the message, no button |
| Setlist status | `NOT_FOUND`, "setlist.fm has no Setlist with that id.", hint "Check the link, or search for the Artist." | `h1` "setlist.fm has no Setlist with that id." (focused), hint, link "Search for an Artist" |
| Setlist list | `NOT_FOUND`, "setlist.fm has no Artist with that id.", hint "Search for the Artist by name." | same pattern |
| Load more | `UPSTREAM_UNAVAILABLE` (as above) | `role="alert"` in place of the button; loaded rows stay; "Try again" re-asks for the same page |
| Search | `INTERNAL`, "Something went wrong on our side.", "Please try again in a minute." | alert with "Try again" |

### E12 — Leaving the preview (AC-45, AC-46)

`/setlists/73a1b2c5` from the list, progress 2 of 5 arrived. Visitor activates "Setlists of Arctic Monkeys" → the signal given to `streamPreview` is aborted; the list shows; nothing is announced about Matching. Same with `history.back()`. Leaving while `createPlaylist` is pending → the fake's promise resolves later; the list screen shows no panel and nothing is announced.

### E13 — The real API client (AC-47 to AC-51)

Requests: as listed in AC-47. Fake fetch answers:

| Answer | Call result |
|---|---|
| 200 `{"artists":[]}` | `{ artists: [] }` |
| 429, `Retry-After: 42`, `{"error":{"code":"RATE_LIMITED","message":"Too many searches from here.","hint":"Wait a moment, then search again."}}` | `ApiCallError` code `RATE_LIMITED`, that message and hint, `retryAfterSeconds` 42 |
| 429, `Retry-After: Wed, 21 Oct 2026 07:28:00 GMT`, same body | same, no `retryAfterSeconds` |
| 404 `{"error":{"code":"NOT_FOUND","message":"setlist.fm has no Setlist with that id."}}` | code `NOT_FOUND`, no hint |
| 502, `text/html` body `<html>Bad Gateway</html>` | `UPSTREAM_UNAVAILABLE`, "Playset isn't answering right now.", "Check your connection and try again in a minute." |
| fetch rejects `TypeError: Failed to fetch` | same |
| 200 `{"artists":[{"name":"Genesis","mbid":"8e3fcd7d","autoPick":true}]}` | `INTERNAL`, "Something went wrong on our side.", "Please try again in a minute." |

Preview stream body, delivered in chunks `"event: prog"`, `"ress\r\ndata: {\"n\":1,\"total\":2}\r\n\r\n: keep-alive\n\n"`, `"event: progress\ndata: {\"n\":2,\"total\":2}\n\nevent: preview\ndata: "`, `<preview JSON>`, `"\n\n"` → progress callback gets `{n:1,total:2}`, `{n:2,total:2}`; resolves with the preview. A body ending after the second progress → `UPSTREAM_UNAVAILABLE`, "The preview stopped before it finished.", "Try again in a minute.". `event: error\ndata: {"code":"UPSTREAM_UNAVAILABLE","message":"Spotify isn't answering right now.","hint":"Try again in a minute."}` → that error, no retry wait. `event: progress\ndata: {"n":3,"total":2}` → `INTERNAL` client error. Aborting the signal after the first chunk → rejects with the abort reason.

### E14 — Shell, routes, not found, focus, keyboard, axe (AC-1 to AC-5, AC-52 to AC-54)

- `/terms` → title "Terms and Privacy – Playset", back link "Back to Playset" → `/`.
- `/admin`, `/artists/not-an-mbid`, `/setlists/73a1b2c5.html` → "Page not found", no API call.
- Start → E1 → E5 → E7 → `history.back()` ×3 → list (no new `getArtistSetlists`), candidates (no new `searchArtists`), Start with an empty input.
- Keyboard: E1 → E5 → E7 → E10 using only `user.keyboard`/`user.tab`; ends with focus on "Playlist created".
- axe: each state of AC-52 built from E1–E11.

### E15 — Static checks (AC-55, AC-56)

A component style sheet with `color: #B5135F`, `padding: 16px`, `border-radius: 4px` or `text-overflow: ellipsis` fails AC-55; `padding: var(--space-4)` and `border-bottom: 1px solid var(--color-rule)` pass. The tokens file must contain `--dur-quick: 0ms` and `--dur-reveal: 0ms` inside `@media (prefers-reduced-motion: reduce)`. `@import url("https://fonts.googleapis.com/…")` fails. `index.html` with `<html lang="en">`, both theme-color metas and `<title>Playset</title>` passes.

### E16 — Terms (AC-57)

`/terms` → `h1` "Terms and Privacy" (focused), "Last updated 28 Nov 2026", `h2`s in order: "What Playset is", "Playlists are public", "What Playset keeps about you", "Where the data comes from", "Spotify's terms", "Using Playset fairly"; link "Terms of Use" → `https://www.spotify.com/legal/end-user-agreement/`.

### AC coverage

| AC | Examples |
|---|---|
| AC-1, AC-2 | E14 |
| AC-3 | E1, E3, E6, E10, E11, E14 |
| AC-4, AC-5 | E5, E14 |
| AC-6, AC-7 | E1 |
| AC-8 | E3 |
| AC-9 | E1, E2 |
| AC-10 | E1 |
| AC-11 | E3 |
| AC-12 | E2 |
| AC-13, AC-14 | E4 |
| AC-15 to AC-20 | E5 |
| AC-21 to AC-23 | E6 |
| AC-24 | E7, E10 |
| AC-25 to AC-27 | E7, E9 |
| AC-28 to AC-30 | E7, E8 |
| AC-31 | E7, E8, E9 |
| AC-32 | E7, E8 |
| AC-33, AC-34 | E7, E9 |
| AC-35, AC-36 | E10 |
| AC-37 to AC-44 | E11 |
| AC-45, AC-46 | E12 |
| AC-47 to AC-51 | E13 |
| AC-52 to AC-54 | E14 |
| AC-55, AC-56 | E15 |
| AC-57 | E16 |

## Manual run check

With `npm run web` and a real server: each screen at 375 px wide in both colour schemes with no horizontal scroll and the long names of `docs/design.md` §7; the sticky action bar never covering the last row; desktop rail at ≥ 64rem; reduced motion stops the spinner and the ink-in; the fonts load from the app's own origin only (browser network panel).

## Changes to earlier PRDs

None changes behaviour. Each was checked:

- **PRD 0001 — setlist.fm link:** unchanged. The client never reads a link itself; the server's link reader decides (AC-13, AC-14).
- **PRD 0002 — Performances:** unchanged. Set labels are shown as the core gives them, except that `main` reads "Main set" on screen (display only). Snippets are listed, never rows.
- **PRD 0003 — Matching:** unchanged. Match and Miss are shown, not decided.
- **PRD 0004 — Spotify login:** unchanged. Visitors never log in.
- **PRD 0005 — setlist.fm:** unchanged. The candidate list shows its first 10 results; the client never auto-picks.
- **PRD 0006 — Setlist Playlist:** unchanged. The playlist name is shown exactly as sent.
- **PRD 0007 — CLI:** unchanged. The CLI and its tests are untouched; the web has no Tape question, `--yes`, `--public` or `--dry-run`.
- **PRD 0008 — Medley split:** unchanged. Each medley part is its own row with a "Medley" badge.
- **PRD 0009 — Interactive shell:** unchanged.
- **PRD 0010 — "+" in titles:** unchanged.
- **PRD 0011 — Incomplete Setlists:** unchanged. The web shows the warning and the Unknown Songs, and (by ADR 0002 and the brief) makes no "newest complete Setlist" offer.
- **PRD 0012 — Run steps:** unchanged.
- **0013 — design lock (`docs/design.md`, not a PRD):** followed, with these display differences forced by the contract or chosen here (see Decisions): no country; no Set on an Unknown Song; Unknown Song rows have no number; the row number is the preview number; rows render once (decision 6 settled by PRD 0015); one result panel under the Show line instead of a second copy in the rail; Miss text written by the client; Spotify attribution by text.
- **PRD 0014 — Host playlists:** unchanged. `current` / `outdated` / `none` and `created` / `updated` drive the screens.
- **PRD 0015 — Web contract:** unchanged. The client follows its wire rules (reads the preview stream with a request that sees the status) and adds nothing to it.

**Tests.** No existing test changes.

## Shared-file requests

For the orchestrator (this Slice edits none of these):

- **package.json:** `"build": "vite build && vite build --config vite.client.config.ts"` (CLI first: its build empties `dist/`, then the client fills `dist/web/`). No new dependency: everything named in the brief is already installed.
- **vitest / vite configs:** none expected. The `client` test project already runs `test/web/client/**/*.test.{ts,tsx}` in jsdom; the real API client's tests (AC-47 to AC-51) run there too, using the global `Response` and `ReadableStream`. If jsdom lacks a streaming `Response` body, the orchestrator moves `test/web/client/api/**` to the `node` project.
- **CLAUDE.md:** under Architecture, add: "`src/web/client/` — the visitor React app (Vite, root `src/web/client`, builds to `dist/web`): routes `/`, `/artists/:mbid`, `/setlists/:id`, `/terms`; one typed API client (`api/`, injected through React context, preview stream read with fetch); styles from `styles/tokens.css` only."
- **GLOSSARY.md:** no change.
- **docs/PLAN.md:** no change.
- **src/core/index.ts:** no change.

## Glossary terms used

- **Setlist**, **Show**, **Artist**, **Set**, **Encore**, **Performance**, **Tape**, **Cover**, **Original Artist**, **Unknown Song**, **Incomplete Setlist**, **Setlist Playlist**, **Host Account**, **Visitor**, **Match**, **Miss** — as defined in GLOSSARY.md.

"Screen", "Setlist screen", "sheet", "live region", "API client" and "client error" are PRD-local words defined above, not glossary terms. "Snippet" and "medley" are used as in PRD 0002 and PRD 0008.

## Decisions (made by the PRD writer; /implementing is in full-auto mode)

1. **Routes:** `/`, `/?artist=<name>`, `/artists/:mbid`, `/setlists/:id`, `/terms`, plus a Page not found screen. The search lives in the query of `/` (the brief's route list) so Back returns to the candidates and a search URL can be shared or reloaded.
2. **Preview stream via fetch, not `EventSource`.** The contract's wire rules send early errors (preview limit with `Retry-After`, Host Account not connected) as plain JSON answers that `EventSource` can't read. The API client reads the body as a stream, parses the event lines itself and closes on an abort signal.
3. **TanStack Query for every call**, the preview included (a query keyed by Setlist id, given the query's abort signal, so leaving the screen aborts it); create/update is a mutation that is not cancelled on leave. No automatic retries: an extra request could hit a rate limit, and the Visitor chooses "Try again".
4. **Every answer is parsed with the contract's schema in the API client.** A drifted answer becomes the `INTERNAL` client error instead of a broken screen.
5. **Client errors have their own words**: no answer or non-JSON → `UPSTREAM_UNAVAILABLE` "Playset isn't answering right now."; schema failure → `INTERNAL` with the server's own generic wording; a stream ending early → `UPSTREAM_UNAVAILABLE` "The preview stopped before it finished.".
6. **`Retry-After` is read as whole seconds only**; anything else means no countdown and an enabled "Try again". Errors from the stream's `error` event never have a countdown (no header).
7. **`INTERNAL` and `NOT_ADMIN` behave like `UPSTREAM_UNAVAILABLE`** (message, hint, Try again).
8. **`PLAYLISTS_UNAVAILABLE`** uses the fixed title from the brief and the server's hint (else message) as its body, so the visitor still gets the server's next step.
9. **Row number = the preview row number**, not the setlist.fm position: Misses and Unknown Songs refer to row numbers, so the jump list and placement stay consistent. Unknown Song rows carry no number (they use no position, PRD 0011).
10. **`main` Set label shows as "Main set"**; every other label as given ("Encore 1", "Acoustic").
11. **Miss line text** is "Miss. No Spotify track by <artist>[ or <Original Artist>]." The contract carries no reason, and "not found" is a banned word for a Miss.
12. **Live Matches get " (live recording)"**; the album is not shown (design shows none).
13. **One copy of each control and panel.** The desktop rail and the mobile sticky bar are the same elements placed by CSS; the "Playlist created" panel appears only under the Show line. Two copies would give screen readers and tests two "Create playlist" buttons.
14. **Focus rule:** every screen reached by a Visitor action, Back/Forward or a deep link focuses its heading once its content is shown; only a plain first load of `/` doesn't, so a screen reader starts at the top of a fresh page. Matching done does not move focus (the live region announces it); Playlist created does.
15. **The Setlist screen asks for the status first, then the preview** (two calls), because a current playlist must show at once with no Matching.
16. **The Incomplete Setlist warning shows on every Setlist screen** (ready, preview, outdated), with the setlist.fm note when present; the Setlist list shows the badge.
17. **Load more de-duplicates by Setlist id** (setlist.fm pages can shift when a new Setlist is added) and the first-page-empty-but-more case gets its own line.
18. **An invalid `:mbid` or `:id` in the URL shows Page not found without a request**, using the contract's schemas; `/admin` shows it too until Slice 19.
19. **Spotify attribution is by text**, not logo: "Open in Spotify" buttons, the "Song matches and track details come from Spotify" line in Terms, and the trademark note. `docs/design.md` bans the Spotify logo as Playset branding, and the app shows only text metadata with links into Spotify. If Spotify asks for its logo next to Match lines, that is a later design change.
20. **Terms text:** drafted above; "Last updated 28 Nov 2026"; no contact address (the app runs locally for now; one is added before public hosting). It names Spotify's required end-user terms (no warranty, no liability, no reverse engineering, Playset responsible, Spotify a third-party beneficiary).
21. **Copy link** uses the Clipboard API with a fallback announcement; no toast.
22. **Test seam names** (`App`, `PlaysetApi`, `ApiCallError`, `createHttpApi`, `tokens.css`, `index.html`) are fixed here so the test-writer can import them without reading `src/`.

## Open questions

(none)
