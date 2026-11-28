# PRD 0019 — Admin page

Status: Approved
Slice: 19
Depends on: 0013 (design lock, `docs/design.md`; not a PRD file), 0015, 0018
Module: src/web/client

## Problem

The web app creates every **Setlist Playlist** in one **Host Account** (ADR 0002). The admin server (Slice 17) lets the person who owns the Host Account log in with Spotify and answers a status of the Host Account, the config and the usage, through the routes the web contract (PRD 0015) already names. A browser has no page for any of it: today `/admin` shows the **Visitor** app's "Page not found" screen (PRD 0018 AC-5). The admin can't see whether the Host Account is connected, can't reconnect it after a revoked token, and can't see how much Playset is used, without a terminal.

## Goal

The admin opens `/admin`, logs in with Spotify as the Host Account, and sees at a glance whether the Host Account is connected (with a Reconnect link), which required config is present, and the usage numbers of the last 30 days; they can log out. Everything is read through the existing API client and the existing contract, follows `docs/design.md` §5.13, and passes the same accessibility checks as the Visitor screens.

## Non-goals

- **No server code.** The login redirect, the callback, the admin cookie, the Host token and the status numbers are Slice 17. This Slice's tests use a fake API client; the real admin server is not needed.
- **No contract change.** Nothing is added to or removed from `src/web/shared/`. The page reads `ROUTES.adminLogin`, `ROUTES.adminStatus`, `ROUTES.adminLogout`, `adminPageQuerySchema`, `adminStatusResponseSchema`, `CONFIG_ITEMS`, `LIMITS.usageDays` and `LIMITS.topArtistsMax` as they are.
- **Read-only.** No settings editing, no entering or showing a secret, no changing rate limits, no deleting Setlist Playlists or records.
- **No password login** and no second admin. Who counts as the admin is decided only by the server (Spotify login as the Host Account).
- **No config values or env names on screen.** Only the labels the server sends and present/missing.
- **No chart library and no chart beyond a presentational bar** per day; the numbers are a plain table.
- **No date range picker, no export, no auto-refresh.** The status is read when the page opens and on "Try again".
- **No admin link from the Visitor pages.** `/admin` is reached by typing it; the footer and header of Visitor screens are unchanged.
- **No handling of `/admin/callback` in the app.** The server redirects from it to `/admin` or `/admin?login=<code>`; the app only reads the `login` query.
- **No browser end-to-end tests.** Testing Library in jsdom; layout at 375 px and desktop columns get a manual run check.

## User stories

- As the admin, I want to log in with the Host Account's Spotify login so that only the Host Account's owner sees the status.
- As the admin, I want to see whether the Host Account is connected and reconnect it in one click, so that Visitors can make Setlist Playlists again after the token was revoked.
- As the admin, I want to see which required config is present without its values, so that a missing setting is obvious and no secret is shown.
- As the admin, I want the playlists made, opens, a per-day table for the last 30 days, the top Artists and today's rate-limit hits, so that I know how much Playset is used.
- As the admin, I want a clear reason when a login didn't work (another Spotify account, consent refused, Spotify unavailable).
- As the admin using a screen reader or only a keyboard, I want the heading focused when the page is ready and every action reachable by Tab.

## Words used in this PRD

PRD 0018's PRD-local words keep their meanings ("screen", "live region", "API client", "client error"). Added here, none is a glossary term:

- **Admin**: whoever is logged in as the Host Account (GLOSSARY: "whoever logs in as the Host Account is the web app's admin").
- **Admin screen**: what `/admin` shows; one of the logged-out view, the dashboard, a status error, or the loading state.
- **Status**: the admin status answer of the contract (`adminStatusResponseSchema`).
- **Login problem**: the error code the server puts in `/admin?login=<code>` after a login that didn't work.

## Routes

| Path | Screen | Back link | Document title |
|---|---|---|---|
| `/admin` | Admin screen | none | `Admin – Playset` |
| `/admin?login=<code>` | Admin screen with the login problem alert | none | `Admin – Playset` |
| `/admin/<anything>` (e.g. `/admin/settings`) | Page not found (PRD 0018 AC-5) | "New search" → `/` | `Page not found – Playset` |

`/admin/login` and `/admin/callback` are server routes: the app links to `/admin/login` with a link that leaves the app (a full page load), and never renders a screen for either path itself.

## Wireframes

`docs/design.md` §5.13 has the logged-out view, the not-connected alert and the dashboard; they apply as drawn, with the differences listed under "Changes to earlier PRDs". Two states it doesn't draw, in the same notation:

Login problem (above the logged-out view or the dashboard):
```
│ Playset  Admin                      │
├─────────────────────────────────────┤
│ Admin                               │ h1
│ ┌─────────────────────────────────┐ │ caution alert
│ │(!) That Spotify account isn't   │ │ h2 (focus lands here)
│ │ the Host Account.               │ │
│ │ Nothing was changed. Log in     │ │ sm
│ │ with the Spotify account Playset│ │
│ │ uses as its Host Account.       │ │
│ └─────────────────────────────────┘ │
│ Log in as the Host Account to see   │ logged-out view continues
│ its status and usage.               │
│ [ (log-in) Log in with Spotify ]    │
```

Log out didn't go through (dashboard stays):
```
│ Playset  Admin          [ Log out ] │ button back to "Log out"
├─────────────────────────────────────┤
│ Admin                               │ h1
│ ┌─────────────────────────────────┐ │ caution alert, role="alert"
│ │(!) Playset isn't answering      │ │
│ │ right now.                      │ │
│ │ Check your connection and try   │ │
│ │ again in a minute.              │ │
│ └─────────────────────────────────┘ │
│ Host Account …                      │ dashboard unchanged below
```

## Acceptance criteria

All UI text in quotes is exact. "Announces X", "focus moves to the heading", "the server's message and hint" and "Try again" mean what PRD 0018 says they mean. Number formatting follows `docs/design.md` §6.11 (`1,042`).

### Opening `/admin`

- **AC-1** — Given `/admin` is opened (typed, reloaded or reached in the app), when it renders, then the shell of PRD 0018 AC-1 is shown (skip link, header, one `main`, the same footer), the header shows the text "Admin" right after the "Playset" wordmark link, the document title is "Admin – Playset", the `h1` is "Admin", and the API client is asked for the status once. While it is pending the line "Loading the status…" shows and nothing else of the screen.
- **AC-2** — Given the status is pending or has been shown, when the admin leaves `/admin` (a link, Back or another route), then a pending status request is cancelled (its cancel signal is aborted) and nothing about it is shown or announced afterwards. Given the admin opens `/admin` again later in the same visit, then the status is asked for again (no earlier answer is shown instead).
- **AC-3** — Given a path under `/admin/` other than `/admin` itself (such as `/admin/settings`), when it is opened, then the Page not found screen of PRD 0018 AC-5 shows and no request is sent.

### Logged out

- **AC-4** — Given the status call fails with code `NOT_ADMIN`, when it settles, then the screen shows the `h1` "Admin", the text "Log in as the Host Account to see its status and usage." and a primary link "Log in with Spotify" whose target is `/admin/login` and which leaves the app (a full page load handled by the server, not a screen of the app). No error alert, no server message and no "Log out" button is shown. Focus moves to the `h1`.

### Login problem

- **AC-5** — Given `/admin?login=<code>` where `<code>` is one of the contract's error codes, when the screen has rendered (logged-out view or dashboard, whichever the status gives), then a caution alert sits directly under the `h1`, before everything else of the screen, with an `h2` title and a body chosen by the code:

  | `login` | Title | Body |
  |---|---|---|
  | `NOT_ADMIN` | "That Spotify account isn't the Host Account." | "Nothing was changed. Log in with the Spotify account Playset uses as its Host Account." |
  | `INVALID_INPUT` | "The Spotify login didn't finish." | "Spotify didn't confirm the login, or it was cancelled. Log in with Spotify again." |
  | `UPSTREAM_UNAVAILABLE` | "Spotify isn't answering right now." | "Try logging in again in a minute." |
  | any other code | "The login didn't work." | "Something went wrong on our side. Try logging in again in a minute." |

  Focus moves to the alert's `h2` instead of the `h1`. The alert has no button of its own.
- **AC-6** — Given `/admin?login=<value>` where `<value>` is not one of the contract's error codes (the page query schema rejects it), or `login` is empty, when the screen renders, then no login problem alert shows and the screen is the same as for `/admin`.

### Dashboard

- **AC-7** — Given a status answer, when it arrives, then the screen shows, under the `h1` "Admin" and in this order: the Host Account block (AC-8 or AC-9), an `h2` "Config" (AC-10), an `h2` "Usage" (AC-11), an `h2` "Last 30 days" (AC-12) and an `h2` "Top Artists" (AC-13). The header shows a "Log out" button (AC-15). Focus moves to the `h1` (or to the login problem heading, AC-5).
- **AC-8** — Given `hostAccount.connected: true`, when the dashboard renders, then the Host Account block is an `h2` "Host Account", the line "Connected as <displayName>" (or "Connected" when the status has no `displayName`) and a secondary link "Reconnect" to `/admin/login` that leaves the app as in AC-4.
- **AC-9** — Given `hostAccount.connected: false`, when the dashboard renders, then in place of the AC-8 block a caution alert shows with the `h2` "Host Account not connected", the text "Visitors can search and open playlists. Previews and new playlists are unavailable." and a primary link "Reconnect" to `/admin/login` that leaves the app as in AC-4. The Config, Usage, Last 30 days and Top Artists sections still follow.
- **AC-10** — Given the status `config` list, when the Config section renders, then it is a list with one item per entry in the server's order, each showing the entry's `name` as given and the word "present" or, for `present: false`, the word "missing" in caution style. No value and no env name is ever shown. An empty `config` list shows the line "No config reported." instead of the list.
- **AC-11** — Given the status `usage` and `rateLimitHitsToday`, when the Usage section renders, then it is a description list with the terms "Playlists made", "Opens" and "Rate-limit hits today" in this order and their numbers grouped as in `docs/design.md` §6.11. When `playlistsMade` is 0 its value reads "No playlists made yet."; when `opens` is 0 its value reads "No opens yet."; `rateLimitHitsToday` 0 reads "0".
- **AC-12** — Given the status `usage.perDay` (30 entries), when the Last 30 days section renders and at least one entry has a non-zero `created`, `updated` or `opened`, then it is a table with the caption "Setlist Playlists made, updated and opened per day, last 30 days" (visually hidden), the column headers "Day", "Made", "Updated", "Opens", and one row per entry, newest date first whatever order the server sent, each row headed by its day as an en-GB day and short month ("28 Nov", with a machine-readable ISO date) and showing `created`, `updated` and `opened` (0 shown as "0"). Each row may also hold a bar whose length follows `opened`; the bar is hidden from assistive technology and carries no text. When every entry is all zeros, the table is replaced by the line "Nothing in the last 30 days."
- **AC-13** — Given the status `usage.topArtists`, when the Top Artists section renders, then it is an ordered list in the server's order, each item showing the `artist` as given and `<playlistCount> playlists` ("1 playlist" for one). An empty list shows the line "No Artists yet." instead.

### Status errors

- **AC-14** — Given the status call fails with any code other than `NOT_ADMIN`, when it settles, then under the `h1` "Admin" one alert shows the server's message as an `h2` and its hint, and focus moves to that `h2`; no dashboard section and no "Log out" button is shown. For `RATE_LIMITED` the alert behaves as PRD 0018 AC-38 (countdown from the retry wait, "Try again" `aria-disabled` until zero, the two announcements). For every other code it behaves as PRD 0018 AC-39: a "Try again" button that asks for the status again, reads "Trying again…" with `aria-disabled="true"` while pending, and on success is replaced by the dashboard (or by the logged-out view when the answer is `NOT_ADMIN`). Client errors of the real API client (PRD 0018 AC-49) are shown the same way with their own words.

### Log out

- **AC-15** — Given the dashboard is shown, when the admin activates "Log out" in the header, then the API client is asked to log out once. While pending the button reads "Logging out…" with `aria-disabled="true"` and further activations send nothing. On success the screen becomes the logged-out view of AC-4 without a new status request, the URL becomes `/admin` (a `login` query is dropped), the live region announces "Logged out", and focus moves to the `h1`. Leaving `/admin` while it is pending does not cancel it.
- **AC-16** — Given the logout call fails (any code, or a client error), when it settles, then a caution alert with `role="alert"` and the server's message and hint shows directly under the `h1`, the dashboard stays, the button reads "Log out" again and can be activated again, and focus is not moved. A later successful logout removes the alert.

### API client (the real one, over HTTP)

- **AC-17** — Given the API client built on a fetch function, when the status is asked for, then it sends `GET /api/admin/status` with `Accept: application/json`, without opting out of the page's cookies, with the caller's cancel signal, and resolves with the answer parsed by the contract's admin status schema. An error status with an error body fails with that body's code, message and hint as in PRD 0018 AC-48 (a 401/403 `NOT_ADMIN` body included); no answer, a non-JSON body or a body that fails the schema fail with the client errors of PRD 0018 AC-49.
- **AC-18** — Given the API client, when logout is asked for, then it sends `POST /api/admin/logout` with `Accept: application/json`, no body, without opting out of the page's cookies, and resolves with no value on any 2xx answer whatever its body (a 204 has none). An error status fails as in PRD 0018 AC-48; no answer fails with the `UPSTREAM_UNAVAILABLE` client error of PRD 0018 AC-49.

### Accessibility, keyboard and look

- **AC-19** — Given each of these admin screen states, when it is checked with axe, then there are no violations: loading; logged out; logged out with each login problem of AC-5; dashboard connected with full usage; dashboard not connected; dashboard with empty usage; status error `UPSTREAM_UNAVAILABLE`; status error `RATE_LIMITED` counting down; logout error; logging out.
- **AC-20** — Given only a keyboard (Tab, Shift+Tab, Enter, Space), when the admin is on the dashboard, then "Reconnect", "Log out" and every link are reachable by Tab; pressing Enter on "Log out" ends on the logged-out view with focus on the `h1`, and the next Tab presses reach "Log in with Spotify". On a status error, Tab reaches "Try again" and Enter or Space activates it.
- **AC-21** — Given the admin screen in every state, when it renders, then every heading is in order (one `h1`, sections `h2`), PRD 0018 AC-54 holds (lucide icons only, `aria-hidden`, next to visible text; no emoji, no Unicode check mark standing in for "present"), and PRD 0018 AC-55 holds for every new style sheet (tokens only, no banned properties).

## Test seam

Tests reach the page only through PRD 0018's seams (`App`, `PlaysetApi`, `ApiCallError`, `createHttpApi`). This PRD adds two methods to the API client type; the test fake implements them like the others.

| What | Where | Shape |
|---|---|---|
| Status | `PlaysetApi.getAdminStatus` in `src/web/client/api/index.ts` | `getAdminStatus(signal?) → Promise<AdminStatusResponse>` (the contract's type). `NOT_ADMIN` arrives as an `ApiCallError` with that code. |
| Log out | `PlaysetApi.logOut` in the same file | `logOut() → Promise<void>`. Never cancelled. |
| Real client | `createHttpApi({ fetch })` | Implements both over the fetch function, paths from `ROUTES`. |

The fake's status answers must pass `adminStatusResponseSchema` (exactly 30 `perDay` entries); reuse PRD 0015 X9 from `test/web/shared/fixtures/` where it exists.

## Examples

### E1 — Logged out (AC-1, AC-4, AC-20)

`/admin`; `getAdminStatus` → `ApiCallError({ code: "NOT_ADMIN", message: "Log in as the Host Account to see this page.", hint: "Use the Log in with Spotify button." })`.

While pending: header "Playset" + "Admin"; `h1` "Admin"; "Loading the status…". Title "Admin – Playset".

Then: `h1` "Admin" (focused); "Log in as the Host Account to see its status and usage."; link "Log in with Spotify" → `/admin/login`. The server's message "Log in as the Host Account to see this page." is not shown. No "Log out" button. `getAdminStatus` called once.

### E2 — Dashboard, connected (AC-7, AC-8, AC-10 to AC-13)

Status (PRD 0015 X9, 30 days filled in, the fake sends them oldest first):

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
      { "date": "2026-10-30", "created": 0, "updated": 0, "opened": 0 },
      "… 27 more days …",
      { "date": "2026-11-27", "created": 2, "updated": 0, "opened": 21 },
      { "date": "2026-11-28", "created": 4, "updated": 1, "opened": 37 }
    ],
    "topArtists": [
      { "artist": "Arctic Monkeys", "playlistCount": 14 },
      { "artist": "Fontaines D.C.", "playlistCount": 9 },
      { "artist": "Sigur Rós", "playlistCount": 1 }
    ]
  },
  "rateLimitHitsToday": 3
}
```

Screen:

```
Playset  Admin                          [ Log out ]
Admin                                   h1 (focused)
Host Account                            h2
  Connected as playset-host
  [ Reconnect ]                         → /admin/login
Config                                  h2
  setlist.fm API key   present
  Spotify client id    present
  Host Account id      present
  Cookie secret        missing          caution
Usage                                   h2
  Playlists made         128
  Opens                  1,042
  Rate-limit hits today  3
Last 30 days                            h2, table
  Day     Made  Updated  Opens
  28 Nov  4     1        37             first row
  27 Nov  2     0        21
  …
  30 Oct  0     0        0              last row
Top Artists                             h2
  1 Arctic Monkeys   14 playlists
  2 Fontaines D.C.   9 playlists
  3 Sigur Rós        1 playlist
```

Table has 30 body rows; the first row header is "28 Nov" (ISO `2026-11-28`), the last "30 Oct". Same status with no `displayName` → "Connected".

### E3 — Host Account not connected, fresh install (AC-9, AC-10, AC-11, AC-12, AC-13)

```json
{
  "hostAccount": { "connected": false },
  "config": [
    { "name": "setlist.fm API key", "present": true },
    { "name": "Spotify client id", "present": true },
    { "name": "Host Account id", "present": true },
    { "name": "Cookie secret", "present": true }
  ],
  "usage": { "playlistsMade": 0, "opens": 0, "perDay": ["30 entries 2026-10-30 … 2026-11-28, all counts 0"], "topArtists": [] },
  "rateLimitHitsToday": 0
}
```

Screen: caution alert `h2` "Host Account not connected", "Visitors can search and open playlists. Previews and new playlists are unavailable.", primary link "Reconnect" → `/admin/login`; no "Host Account" `h2`, no "Connected" line. Config: four "present". Usage: "Playlists made" "No playlists made yet.", "Opens" "No opens yet.", "Rate-limit hits today" "0". Last 30 days: "Nothing in the last 30 days.", no table. Top Artists: "No Artists yet.". "Log out" in the header.

Variants: `"config": []` → "No config reported."; one day `{ "date": "2026-11-12", "created": 0, "updated": 1, "opened": 0 }` among zeros → the table shows (30 rows), not the empty line.

### E4 — Login problems (AC-5, AC-6)

| URL | Status answer | Screen |
|---|---|---|
| `/admin?login=NOT_ADMIN` | `NOT_ADMIN` | alert `h2` "That Spotify account isn't the Host Account." (focused), "Nothing was changed. Log in with the Spotify account Playset uses as its Host Account."; then the logged-out text and "Log in with Spotify" |
| `/admin?login=INVALID_INPUT` | `NOT_ADMIN` | "The Spotify login didn't finish." / "Spotify didn't confirm the login, or it was cancelled. Log in with Spotify again." |
| `/admin?login=UPSTREAM_UNAVAILABLE` | E2 status (logged in from an earlier login) | "Spotify isn't answering right now." / "Try logging in again in a minute." above the "Host Account" block; focus on the alert `h2` |
| `/admin?login=INTERNAL` | `NOT_ADMIN` | "The login didn't work." / "Something went wrong on our side. Try logging in again in a minute." |
| `/admin?login=RATE_LIMITED` | `NOT_ADMIN` | same as `INTERNAL` |
| `/admin?login=wrong-account` | `NOT_ADMIN` | no alert; focus on `h1` "Admin" |
| `/admin?login=` | `NOT_ADMIN` | no alert |

### E5 — Status errors (AC-14)

| Status answer | Screen |
|---|---|
| `UPSTREAM_UNAVAILABLE`, "Playset can't read its records right now.", hint "Try again in a minute." | `h1` "Admin", alert `h2` "Playset can't read its records right now." (focused), "Try again in a minute.", "Try again"; no "Log out" |
| then "Try again" → pending | "Trying again…" `aria-disabled="true"`; `getAdminStatus` called a second time |
| → E2 status | dashboard replaces the alert |
| `INTERNAL`, "Something went wrong on our side.", "Please try again in a minute." | same pattern |
| `RATE_LIMITED`, "Too many requests from here.", hint "Wait a moment, then try again.", retry wait 42 | "You can try again in 0:42", "Try again" `aria-disabled`; announces "Try again in 42 seconds"; at 0:00 "You can try again now", button enabled (fake timers) |
| client error (fetch rejects) | "Playset isn't answering right now." / "Check your connection and try again in a minute." + "Try again" |
| "Try again" → `NOT_ADMIN` (cookie expired meanwhile) | logged-out view of E1 |

### E6 — Log out (AC-15, AC-16, AC-20)

From `/admin?login=UPSTREAM_UNAVAILABLE` with the E2 dashboard: Tab to "Log out", Enter → `logOut()` once (a second Enter while pending sends nothing), "Logging out…" `aria-disabled="true"`; resolves → URL `/admin`, logged-out view, announces "Logged out", focus on `h1` "Admin", no login problem alert, `getAdminStatus` still called only once; next Tab reaches "Log in with Spotify".

`logOut` rejects with `ApiCallError({ code: "UPSTREAM_UNAVAILABLE", message: "Playset isn't answering right now.", hint: "Check your connection and try again in a minute." })` → `role="alert"` alert under the `h1` with both lines; dashboard stays; button "Log out"; focus stays on the button. Pressing it again and succeeding → logged-out view, alert gone.

### E7 — Leaving and coming back (AC-2, AC-3)

`/admin` with `getAdminStatus` pending → activate the "Playset" wordmark → the signal passed to `getAdminStatus` is aborted; Start screen shows; nothing announced. Back to `/admin` → `getAdminStatus` called again. `/admin/settings` → "Page not found", no API call.

### E8 — The real API client (AC-17, AC-18)

| Call | Fake fetch answer | Result |
|---|---|---|
| status | 200 E2 JSON | the E2 status |
| status | 401 `{"error":{"code":"NOT_ADMIN","message":"Log in as the Host Account to see this page."}}` | `ApiCallError` code `NOT_ADMIN`, that message, no hint |
| status | 200 E2 JSON with `"hostAccount": { "connected": true, "id": "31abcxyzhost" }` | `INTERNAL`, "Something went wrong on our side.", "Please try again in a minute." |
| status | 200 with 29 `perDay` entries | same `INTERNAL` client error |
| status | 502 `text/html` `<html>Bad Gateway</html>` | `UPSTREAM_UNAVAILABLE`, "Playset isn't answering right now.", "Check your connection and try again in a minute." |
| status, signal aborted | — | rejects with the abort reason |
| logout | 204, empty body | resolves with no value |
| logout | 200 `{}` | resolves with no value |
| logout | fetch rejects `TypeError: Failed to fetch` | `UPSTREAM_UNAVAILABLE` client error |
| logout | 500 `{"error":{"code":"INTERNAL","message":"Something went wrong on our side.","hint":"Please try again in a minute."}}` | `ApiCallError` `INTERNAL` with that message and hint |

Requests: status → `GET /api/admin/status`, `Accept: application/json`, no `credentials: "omit"`. Logout → `POST /api/admin/logout`, `Accept: application/json`, no body, no `credentials: "omit"`.

### E9 — axe, icons, styles (AC-19, AC-21)

Each state of AC-19 built from E1–E6. "present" items carry a lucide `CircleCheck`, "missing" a `CircleX`, alerts a `TriangleAlert`, "Log in with Spotify" a `LogIn` icon, "Try again" a `RotateCw`; all `aria-hidden="true"`. No text on the page contains "✅" or "✓". The day bars have `aria-hidden="true"`.

### AC coverage

| AC | Examples |
|---|---|
| AC-1 | E1 |
| AC-2, AC-3 | E7 |
| AC-4 | E1 |
| AC-5, AC-6 | E4 |
| AC-7, AC-8 | E2 |
| AC-9 | E3 |
| AC-10 to AC-13 | E2, E3 |
| AC-14 | E5 |
| AC-15, AC-16 | E6 |
| AC-17, AC-18 | E8 |
| AC-19 | E9 |
| AC-20 | E1, E6 |
| AC-21 | E9 |

## Manual run check

With `npm run web` and the Slice 17 server: `/admin` logged out → "Log in with Spotify" → Spotify → back on the dashboard; logging in with another allowlisted account → the `NOT_ADMIN` login problem; cancelling consent → the `INVALID_INPUT` one. At 375 px in both colour schemes: no horizontal scroll, the bar column hidden, the "Log out" button wraps under the wordmark if needed. At ≥ 64rem: Host Account and Config in the left column, Usage in the right, Last 30 days and Top Artists full width with bars.

## Changes to earlier PRDs

- **PRD 0018 — Visitor web app:** changed.
  - Its Non-goal "No `/admin` page … `/admin` in the browser shows this Slice's Page not found screen" and its Decision 18 ("`/admin` shows it too until Slice 19") are superseded: `/admin` is the admin screen. Paths under `/admin/` still show Page not found (AC-3).
  - AC-5 and E14 list `/admin` as a Page not found example; `/admin/settings` replaces it.
  - AC-1 (shell) is unchanged for Visitor screens; on `/admin` the header also shows "Admin" and, when logged in, "Log out". The footer is the same everywhere.
  - The `PlaysetApi` test seam gains `getAdminStatus` and `logOut` (Test seam above); its existing methods are unchanged.
  - **Existing tests that change** (to be listed in the PR for the user's approval):
    - `test/web/client/App.test.tsx`: the AC-1 "Page not found screen has exactly one h1" case uses `/admin/settings` instead of `/admin`; the AC-5 path list replaces `/admin` with `/admin/settings`; the AC-5 "with an in-memory start path, /admin shows Page not found" test uses `/admin/settings`.
    - `test/web/client/keyboard-and-icons.test.tsx`: the AC-52 "Page not found has no axe violations" test opens `/admin/settings`.
    - `test/web/client/screen-states.test.tsx`: the "Page not found" state opens `/admin/settings`.
    - `test/web/client/fixtures/fake-api.ts`: the fake gains `getAdminStatus` and `logOut` (unexpected-call by default, like the other methods), because the fake's type covers every API client method.
- **PRD 0015 — Web contract:** unchanged. Read exactly as it is; the login query, status answer, routes and logout's 204 are consumed as defined. Its note that `docs/design.md`'s Config list shows env names while the contract sends labels is followed here (labels shown).
- **PRD 0016 — Web server:** unchanged. It already answers `index.html` for `/admin` (its AC-6) and leaves `/admin/login` and `/admin/callback` to Slice 17.
- **PRD 0004 — Spotify login:** unchanged. The admin login runs on the server (Slice 17); the browser only follows a link.
- **PRD 0014 — Host playlists:** unchanged. The page only shows counts.
- **PRDs 0001–0003, 0005–0012:** unchanged; nothing in setlist.fm reading, Performances, Matching, the CLI or the run steps is touched.
- **0013 — design lock (`docs/design.md`, not a PRD):** followed, with these differences (see Decisions): Config shows the contract's labels, not env names; the table header reads "Updated", not "Upd."; empty Usage values replace the number in the `<dl>`; two states it doesn't draw (login problem, logout error) are drawn above; "Logging out…" follows its loading pattern.

## Shared-file requests

For the orchestrator (this Slice edits none of these):

- **CLAUDE.md:** in the `src/web/client/` line, add `/admin` to the routes: "routes `/`, `/artists/:mbid`, `/setlists/:id`, `/terms`, `/admin` (Host Account status, config, usage, log out; read-only)".
- **package.json, configs, GLOSSARY.md, docs/PLAN.md, src/core/index.ts, src/web/shared/:** no change. `lucide-react` already has every icon named.

## Glossary terms used

- **Host Account**, **Setlist Playlist**, **Visitor**, **Artist**, **Setlist**, **Show** — as defined in GLOSSARY.md.

"Admin", "admin screen", "status" and "login problem" are PRD-local words defined above, not glossary terms.

## Decisions made (by the PRD writer; /implementing is in full-auto mode)

1. **No contract change.** Everything the brief asks for is in `adminStatusResponseSchema`, `adminPageQuerySchema` and the routes.
2. **`NOT_ADMIN` from the status is not an error on screen**: it is the logged-out view (the brief: `NOT_ADMIN` → "Log in with Spotify"). The server's message for it is not shown; the page's own sentence from `docs/design.md` is.
3. **Login problem wording is the client's own**, per code, because the redirect carries only a code (PRD 0015 Decision 15). Codes the callback never sends today fall back to the generic line. An unknown `login` value is ignored rather than shown, since the page query schema rejects it.
4. **The login problem alert takes focus** over the `h1`, because it is the news the admin came back for; it stays while the URL has the query, and logout drops the query.
5. **Login and Reconnect are links that leave the app** (`/admin/login` is a server redirect to Spotify), never in-app navigation.
6. **The status is read fresh each time `/admin` opens** (no answer kept for the visit, unlike Visitor screens), so the numbers and the Host Account state are current; there is still no automatic retry or refresh.
7. **"Log out" shows only once a status answer arrived**; during loading, logged out or a status error there is nothing to log out of that the page knows of.
8. **After logout the logged-out view shows without asking the status again** (the server clears the cookie and answers 204 either way, PRD 0015 wire rules), and "Logged out" is announced.
9. **A failed logout keeps the dashboard** with a `role="alert"` message and an enabled "Log out" to press again; no separate "Try again" button, so the header button keeps one verb.
10. **`RATE_LIMITED` on the status gets the PRD 0018 countdown**, and every other code the "Try again" of PRD 0018 AC-39, so the admin page reuses the Visitor error behaviour.
11. **Empty usage:** 0 playlists and 0 opens read "No playlists made yet." / "No opens yet." in place of the number; 0 rate-limit hits read "0" (nothing to do); the table is replaced only when all 30 days are zero; no top Artists reads "No Artists yet."; an empty config list (the server always sends four) reads "No config reported.".
12. **Per-day rows are sorted newest first by the client**, since the contract fixes 30 entries but not their order. Dates show as "28 Nov" (design §6.11); the ISO date is kept machine-readable.
13. **Column header "Updated" in full** instead of the design's "Upd.", so screen readers read a word; the four numeric columns still fit at 375 px with the bar column hidden.
14. **The bar per day is presentational** (hidden from assistive technology), its length relative to the highest `opened` of the 30 days; the numbers in the table carry the meaning.
15. **The API client stays one client**: `getAdminStatus` and `logOut` join `PlaysetApi` (not a second injected client), so the app keeps one injection point; the test fake grows two methods.
16. **Logout sends no body** (the contract accepts none or `{}`) and treats any 2xx as success.
17. **The header "Admin" text and "Log out" button show only on `/admin`**; Visitor screens' header is unchanged and has no link to `/admin`.

## Open questions

(none)
