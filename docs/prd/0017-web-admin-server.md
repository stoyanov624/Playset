# PRD 0017 — Admin server: Host login, Host token and usage

Status: Approved
Slice: 17
Depends on: 0016 (and 0004, 0014, 0015)
Module: src/web/server (plus three stateless additions to src/core/spotify-auth, see "Who owns what")

## Problem

The web server (PRD 0016) answers every **Visitor** route, but it has no real Host token. It runs with a Host token source that is never connected, so no **Visitor** can preview or create a **Setlist Playlist**. Nothing lets the **Host Account** log in with Spotify, nothing keeps its token across restarts or refreshes it, and nothing shows the admin whether the Host Account is connected or how much the app is used.

The core's Spotify login (PRD 0004) is built for the CLI: it waits on a loopback receiver on this machine and keeps tokens in `~/.config/playset/`. A web login needs the same PKCE pieces as separate, stateless calls: build the authorize URL, exchange the code, refresh, and ask Spotify who logged in.

## Goal

The admin opens `/admin/login`, logs in with Spotify as the **Host Account**, and comes back to `/admin` with a signed admin cookie. The server keeps the Host token in the SQLite file, refreshes it when needed, and gives it to every preview and create/update. Any other Spotify account is refused and nothing of it is kept. With the admin cookie, `GET /api/admin/status` gives the connection state, the config names, usage numbers and today's rate-limit hits, in the contract's shape. No token, secret or Host Account id ever reaches a browser or the log.

## Non-goals

- **No admin page.** The `/admin` screen, its login button, Reconnect, the usage view and showing `?login=<code>` are Slice 19. `GET /admin` still answers the client's `index.html` (PRD 0016 AC-6).
- **No password, no second admin, no settings editing.** Config stays in env / `.env`.
- **No contract change.** The routes, schemas, codes and config labels of PRD 0015 are used as they are.
- **No new config value.** The redirect URI is built from the configured port; there is no public base URL setting yet.
- **No public hosting.** The redirect URI is `http://127.0.0.1:<port>/admin/callback`. The `Secure` cookie flag exists for HTTPS behind a proxy (AC-18), but no HTTPS setup is part of this Slice.
- **No server-side admin sessions.** The admin cookie is self-contained. Logout tells the browser to drop it; a copied cookie stays valid until it expires (Decision 6).
- **No forced refresh on a Spotify 401.** A Host token Spotify rejects before its expiry still answers `PLAYLISTS_UNAVAILABLE` (PRD 0016 E-23) until it expires or the admin reconnects.
- **No encryption of the stored Host token.** It is protected by the data file's permissions (Decision 11), like the CLI's token file (PRD 0004).
- **No rate limit on admin routes** and no login attempt counter.
- **No new Spotify scope.** The Host login asks for exactly the scopes PRD 0014 names.
- **No change to the CLI's login.** The loopback receiver, `PLAYSET_AUTH_PORT` and the token file stay as PRD 0004 says; the web server uses none of them.
- **No usage pruning**, and no usage beyond the usage events of PRD 0016 (no per-Visitor numbers).
- **No new glossary term.**

## User stories

- As the Host Account's admin, I want to log in with Spotify once, so that Visitors can preview and create Setlist Playlists again.
- As the Host Account's admin, I want the server to refresh the Host token by itself, so that the app keeps working for days without me.
- As the Host Account's admin, I want any other Spotify account turned away with nothing kept, so that only the Host Account can be connected.
- As the Host Account's admin, I want to see whether the Host Account is connected, which config is present, how many playlists were made and opened, the top Artists and today's rate-limit hits.
- As the Host Account's admin, I want to log out on a shared computer without disconnecting the Host Account.

## Words used in this PRD

Earlier PRD-local words keep their meaning: "Host token", "connected", "usage event", "open", "playlists made today", "catalogue" (PRD 0016); "contract" (PRD 0015). These are added; none is a glossary term:

- **Stored Host token**: the one saved login of the Host Account in the data file: access token, refresh token, expiry (epoch ms), the Spotify account id it belongs to and the account's display name (optional).
- **Admin**: whoever holds a valid admin cookie (GLOSSARY: whoever logs in as the Host Account is the web app's admin).
- **Admin cookie**: the cookie `playset_admin` set after a Host login; valid for 12 hours from that login.
- **Login cookie**: the cookie `playset_login` set by `/admin/login`; it carries that login's `state` and PKCE code verifier, for 10 minutes and one callback.
- **Signed**: the cookie value carries a signature made with the cookie secret; a value changed in any way, or signed with another secret, is not valid.
- **Redirect URI**: `http://127.0.0.1:<PLAYSET_WEB_PORT>/admin/callback`.
- **Made**: a usage event of kind `created` or `updated` (as in "playlists made today").

## Who owns what (for tests)

### Core: `spotify-auth` gains three stateless calls

They read and write nothing (no settings, no token file, no env) and reach Spotify only through the core requester. `deps` is `{ fetch, sleep, now }`, as the existing token endpoint uses. This Slice owns these additions to the core `spotify-auth` module (no other Slice of its Wave touches that module). They are exported from the core entry point together with the existing `generateCodeVerifier`, `computeCodeChallenge`, `generateState` and `buildAuthorizeUrl` (shared-file request).

| Name | What it does |
|---|---|
| `exchangeAuthorizationCode(deps, { clientId, redirectUri, code, codeVerifier })` | Core AC-1, AC-2 |
| `refreshAccessToken(deps, { clientId, refreshToken })` | Core AC-3, AC-4 |
| `fetchSpotifyAccount(deps, accessToken)` | Core AC-5, AC-6 |
| `SpotifyAccountError` | The typed error of `fetchSpotifyAccount`; carries `status` (absent for a network failure). A `PlaysetError`. |

The grant both token calls resolve is `{ accessToken, refreshToken, expiresAt }` (the `TokenGrant` type, exported).

### Server

| Name | What it is |
|---|---|
| `createMemoryHostTokenStore()` | A Host token store kept in memory, for tests. |
| `createSqliteStore(db)` | As PRD 0016, now returning `{ records, events, hostTokenStore }`. |
| `createHostTokenSource({ store, login, hostAccountId, now, logger })` | The Host token source that replaces `notConnectedHostTokenSource` in the entry file (AC-9 to AC-12). |

A Host token store has `read()` (resolves the stored Host token or `undefined`), `save(token)` (replaces whatever was stored) and `clear()`, all async. A stored Host token is `{ accountId, displayName?, accessToken, refreshToken, expiresAt }`.

`createApp` takes two more deps (all PRD 0016 deps stay):

| Dep | Shape |
|---|---|
| `hostTokenStore` | a Host token store |
| `hostLogin` | `exchangeCode({ code, codeVerifier, redirectUri })` → grant, `fetchAccount(accessToken)` → `{ id, displayName? }`, `refresh(refreshToken)` → grant. The entry file builds it from the three core calls with the config's client id; tests give fakes that throw the core's errors. |

`createHostTokenSource`'s `login` is the same `hostLogin` (only `refresh` is used). The usage events of PRD 0016 gain `readUsage(today)` (AC-24). `notConnectedHostTokenSource` stays exported and unchanged.

The entry file builds the store from the SQLite file, builds `hostLogin`, wires `createHostTokenSource` as `hostTokens`, and passes `hostTokenStore` and `hostLogin` to `createApp`.

## Error catalogue additions

PRD 0016's catalogue (E-1 to E-25) stays. Added:

| # | Cause | Code | Status | Message | Hint |
|---|---|---|---|---|---|
| E-26 | `/api/admin/status` without a valid admin cookie | `NOT_ADMIN` | 401 | `You're not logged in as Playset's admin.` | `Log in with Spotify as the Host Account.` |
| E-27 | Logout body rejected by the contract, or not JSON | `INVALID_INPUT` | 400 | `That request isn't valid.` | — |

The two redirect routes never answer JSON; their failures are the redirect codes of AC-15 to AC-17.

## Acceptance criteria

Unless an AC says otherwise: the config is PRD 0016's with `PLAYSET_HOST_SPOTIFY_ID=31abcxyzhost`; "Spotify" means the injected `hostLogin` (server ACs) or the injected `fetch` (core ACs); every answer also meets PRD 0016 AC-3 (headers) and AC-7 (no secret, id or token in any answer, header or event).

### Core: stateless Spotify login calls (`spotify-auth`)

- **AC-1** — Given a client id, redirect URI, authorization code and code verifier, when the code is exchanged, then exactly one form-encoded `POST https://accounts.spotify.com/api/token` is sent with `grant_type=authorization_code`, `code`, `redirect_uri`, `client_id` and `code_verifier`, and no client secret or `Authorization` header (as PRD 0004 AC-12). On HTTP 200 it resolves `{ accessToken, refreshToken, expiresAt }`, `expiresAt` = time of response + `expires_in` seconds. No settings store or file is read or written.
- **AC-2** — Given the code exchange, when Spotify answers 200 without a `refresh_token`, then it rejects with a token error. When Spotify answers 400/401/403 with an OAuth error, it rejects with a token error naming Spotify's `error` (and `error_description`). A 5xx or a network failure rejects with a token error that names no Spotify `error`. 429 is retried honouring `Retry-After`, at most 3 attempts, then the core's rate-limit error (PRD 0004 AC-25).
- **AC-3** — Given a client id and a refresh token, when the token is refreshed, then exactly one form-encoded `POST` to the token endpoint is sent with `grant_type=refresh_token`, `refresh_token` and `client_id` (no client secret). On HTTP 200 it resolves the grant; its `refreshToken` is the answer's `refresh_token` when there is one, else the refresh token it was given (PRD 0004 AC-20). No settings store or file is read or written, and no login starts.
- **AC-4** — Given a refresh, when Spotify answers `400 {"error":"invalid_grant"}`, then it rejects with a token error naming `invalid_grant`. Any other failure rejects with a token error naming the other Spotify `error` or none (network, 5xx), and 429 is handled as in AC-2.
- **AC-5** — Given an access token, when the Spotify account is fetched, then exactly one `GET https://api.spotify.com/v1/me` is sent with `Authorization: Bearer <token>`. On HTTP 200 it resolves `{ id, displayName }` from `id` and `display_name`; `displayName` is absent when `display_name` is `null`, missing or empty. An answer without a non-empty string `id` rejects with a `SpotifyAccountError` without `status`.
- **AC-6** — Given the account fetch, when Spotify answers any status other than 200 (after the core's 429 retries: `Retry-After` honoured, at most 3 attempts), then it rejects with a `SpotifyAccountError` whose `status` is that status (429 when the retries ran out). A network failure rejects with a `SpotifyAccountError` without `status`. No error text of AC-1 to AC-6 contains the access token, refresh token, authorization code or code verifier.

### Host token store

- **AC-7** — Given a Host token store (the memory one, and the SQLite one on `:memory:`), when it is used, then `read()` on a new store resolves `undefined`; after `save(t)`, `read()` resolves a value equal to `t` field by field (a missing `displayName` stays missing); `save(u)` replaces `t` (only one stored Host token ever exists); after `clear()`, `read()` resolves `undefined`. Given `createSqliteStore` runs twice on the same database, then the stored Host token is kept and nothing fails. Values with `'`, `;` or `--` are stored and read back unchanged.
- **AC-8** — Given the SQLite store after any sequence of AC-13 to AC-26, then the only table holding a token is the Host token's, and it holds at most one row. No Visitor address is in it (PRD 0016 AC-33 still holds).

### Host token source

- **AC-9** — Given the store holds no Host token, when the source is asked, then it resolves `undefined` and sends no request. Given the stored Host token's `accountId` is not the configured Host Account id (the config changed since the login), then it resolves `undefined`, sends no request and leaves the store unchanged. Given a stored Host token of the Host Account whose expiry is more than 60 seconds away, then it resolves its access token and sends no request.
- **AC-10** — Given a stored Host token of the Host Account that expires within 60 seconds or has expired, when the source is asked, then `refresh` runs once with the stored refresh token. On success the store holds the new access token and expiry, the refresh token the grant gives (the old one when Spotify sent none, a rotated one when it sent one), and the same `accountId` and `displayName`; the source resolves the new access token.
- **AC-11** — Given the refresh rejects with a token error naming `invalid_grant`, when the source is asked, then the store is cleared, the source resolves `undefined` (not connected), and `logger.warn` is called once with `The Host Account's Spotify login has ended. Log in again at /admin.` Given the refresh fails any other way (network, 5xx, rate limit, other token error), then the source rejects, the store is unchanged, and the next ask tries the refresh again.
- **AC-12** — Given several asks arrive while a refresh is running, when they are handled, then only one refresh request is sent and every ask gets its outcome (the same new access token, the same `undefined`, or the same rejection).

### Host login — `GET /admin/login`

- **AC-13** — Given any request, when `GET /admin/login` is handled, then the app answers 302 with `Cache-Control: no-store` and a `Location` of `https://accounts.spotify.com/authorize` whose query is exactly `client_id` (the config's), `response_type=code`, `redirect_uri` (the redirect URI), `scope=playlist-modify-private playlist-modify-public playlist-read-private`, `state`, `code_challenge_method=S256` and `code_challenge`. It sets the login cookie `playset_login`: signed, `HttpOnly`, `SameSite=Lax`, `Path=/admin`, `Max-Age=600`. The `state` is new on every request; the `code_challenge` is the S256 challenge of a verifier that is new on every request and never appears in the `Location`. No request is sent to Spotify. No admin cookie is needed, and an existing one is left as it is.

### Host login — `GET /admin/callback`

The callback checks, in this order, and the first failure decides the redirect: (1) the query against the contract's callback schema; (2) a valid login cookie (present, signed, issued less than 10 minutes ago); (3) its `state` equals the query's `state`; (4) the query has a `code`, not an `error`; (5) the code exchange; (6) the account fetch; (7) the account id equals the configured Host Account id; (8) saving the Host token. Every callback answer is a 302 with `Cache-Control: no-store` and clears the login cookie (`playset_login`, `Path=/admin`, `Max-Age=0`). The `Location` is `/admin` on success and `/admin?login=<code>` on failure.

- **AC-14** — Given a valid login cookie and a callback with its `state` and a `code`, when Spotify exchanges the code and `/me` gives the id `31abcxyzhost`, then `exchangeCode` was called once with the code, the login's verifier and the redirect URI, and `fetchAccount` once with the new access token. The store then holds `{ accountId: "31abcxyzhost", displayName, accessToken, refreshToken, expiresAt }` from the grant and the account. The app sets the admin cookie `playset_admin`: signed, `HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age=43200`, and redirects to `/admin`.
- **AC-15** — Given a stored Host token (from an earlier login), when a new Host login succeeds, then the store holds only the new one; the source (AC-9) then gives the new access token.
- **AC-16** — Given any of: a query the contract rejects (no `state`, both `code` and `error`, neither, an empty value); no login cookie; a login cookie changed by one character or signed with another cookie secret; a login cookie issued 10 minutes ago or more; a `state` different from the login cookie's; or an `error` (such as `access_denied`) with the right `state` — when the callback is handled, then it redirects to `/admin?login=INVALID_INPUT`, sends no request to Spotify, stores nothing and sets no admin cookie.
- **AC-17** — Given the account fetch gives an id other than the configured Host Account id, or rejects with a `SpotifyAccountError` of status 403 (an account not allowed in the Spotify app), when the callback is handled, then it redirects to `/admin?login=NOT_ADMIN`. The store is unchanged (an earlier Host token stays), no admin cookie is set, the other account's tokens are not kept or logged, and the other account's id appears in no answer and no log line.
- **AC-18** — Given the code exchange or the account fetch fails, when the callback is handled, then it redirects to `/admin?login=UPSTREAM_UNAVAILABLE` for a network failure, a 5xx, or a rate limit (the core's rate-limit error, or a `SpotifyAccountError` of status 429 or 5xx, or without status), and to `/admin?login=INTERNAL` for a token error naming a Spotify OAuth error (such as `invalid_grant` for a code used twice), any other account-fetch status, or a failure to save the Host token. Nothing is stored and no admin cookie is set. `UPSTREAM_UNAVAILABLE` cases are logged once with `logger.warn`, `INTERNAL` cases once with `logger.error`, each with its cause, secrets redacted (AC-27).
- **AC-19** — Given `PLAYSET_TRUST_PROXY=1` and a request with `X-Forwarded-Proto: https`, when the login cookie or the admin cookie is set or cleared, then it also has `Secure`. Given plain HTTP (no forwarded `https`, or `PLAYSET_TRUST_PROXY=0` whatever the header says), then it has no `Secure`.

### Admin cookie

- **AC-20** — Given an admin cookie set at time T, when `GET /api/admin/status` is asked with it, then it is accepted while the clock is before T + 12 hours and rejected from T + 12 hours on. Given no admin cookie, an empty one, a value changed by one character, a value not made by the app, a cookie signed with another cookie secret, or a login cookie sent under the admin cookie's name, then the app answers E-26 and reads no usage. The check uses the injected clock, not only the browser's `Max-Age`.
- **AC-21** — Given any admin cookie or login cookie value the app sets, then it contains none of: the Host Account id, an access token, a refresh token, the authorization code, the cookie secret. No answer, `Location` or header of the admin routes contains the Host Account id, a token, the code or the code verifier.

### Admin status — `GET /api/admin/status`

- **AC-22** — Given a valid admin cookie, when the status is asked, then the app answers 200 with a body the contract's admin status schema accepts, and `hostAccount` is: `{ "connected": true, "displayName": <stored display name> }` when the store holds a Host token for the configured Host Account id (no `displayName` key when none was stored); `{ "connected": false }` when the store is empty or holds another account's. `config` is the four contract labels in contract order, each `present: true` (startup requires them, PRD 0016 AC-2). The status sends no request to Spotify or setlist.fm, does not ask the Host token source, and records no usage event.
- **AC-23** — Given the usage events, when the status is asked on UTC day D (from the injected clock), then `usage.playlistsMade` is the number of made events of all time, `usage.opens` the number of `opened` events of all time, and `usage.perDay` has exactly 30 entries for D, D−1, … D−29 (newest first), each with the number of `created`, `updated` and `opened` events of that day (0 for a day without events). Events after D or before D−29 are not in `perDay` but count in the totals.
- **AC-24** — Given the usage events, when the status is asked, then `usage.topArtists` lists each Artist name (exact string) with `playlistCount` = the number of distinct setlist ids with at least one made event for it, all time; Artists with only opens are not listed; ordered by `playlistCount` high to low, ties by Artist name in ascending code-point order; at most 10. `readUsage(today)` of the memory and the SQLite usage events give the same `{ playlistsMade, opens, perDay, topArtists }` for the same events.
- **AC-25** — Given the rate-limit hit counter, when the status is asked on day D, then `rateLimitHitsToday` is its count for D. Given a status the contract's schema would reject, then the app answers E-25 (PRD 0016 AC-9).

### Logout — `POST /api/admin/logout`

- **AC-26** — Given a body that is absent or `{}`, with or without an admin cookie (valid or not), when logout is asked, then the app answers 204 with no body and clears the admin cookie (`playset_admin`, `Path=/`, `Max-Age=0`, with `HttpOnly`, `SameSite=Lax`, and `Secure` as AC-19). The stored Host token is unchanged and previews still get it. Given a body the contract rejects (such as `{ "all": true }`) or a non-JSON body, then the app answers E-27 and clears nothing. Given `GET /api/admin/logout`, `POST /api/admin/status` or `DELETE /api/admin/status`, then the app answers E-10.

### Logging

- **AC-27** — Given any admin route or Host token source call, when anything is logged, then every occurrence of the Host Account id, any access or refresh token (stored, new or of another account), the authorization code, the code verifier, the cookie secret and any cookie value is replaced by `[redacted]` (PRD 0016 AC-8). A successful login is logged once with `logger.info` as `The Host Account is connected.`; a refused account (AC-17) once with `logger.warn` as `A Spotify account that isn't the Host Account tried to log in.` No log line holds a Visitor address.

## Examples

Unless stated otherwise:

- Config: PRD 0016's examples (`SPOTIFY_CLIENT_ID=3f9c2a7e5b1d4c8fa6e0b2d4c6a8e1f3`, `PLAYSET_HOST_SPOTIFY_ID=31abcxyzhost`, `PLAYSET_COOKIE_SECRET=test-cookie-secret-7d1f0c9b2e8a4f6d5c3b1a09`, port 3000, `PLAYSET_TRUST_PROXY=1`).
- Clock: `2026-11-28T14:30:00.000Z` = `1795876200000`. Today D = `2026-11-28`.
- Redirect URI: `http://127.0.0.1:3000/admin/callback`.
- Spotify grant from the exchange (token endpoint answer):
  ```json
  { "access_token": "BQDhost-test-token", "token_type": "Bearer",
    "scope": "playlist-modify-private playlist-modify-public playlist-read-private",
    "expires_in": 3600, "refresh_token": "AQChost-refresh-token" }
  ```
  → `{ accessToken: "BQDhost-test-token", refreshToken: "AQChost-refresh-token", expiresAt: 1795879800000 }`.
- `/me` of the Host Account: `{ "id": "31abcxyzhost", "display_name": "playset-host", "type": "user", "uri": "spotify:user:31abcxyzhost", "country": "DE", "product": "premium" }`.
- `/me` of another account: `{ "id": "jane.doe.music", "display_name": "Jane Doe", "type": "user" }`, its grant access token `BQDjane-other-token`, refresh `AQCjane-other-refresh`.
- Authorization code: `AQDx9-test-code`.

### X1 — Core calls (AC-1 to AC-6)

Exchange request body (AC-1), `Content-Type: application/x-www-form-urlencoded`, code verifier `dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk`:

```
grant_type=authorization_code&code=AQDx9-test-code&redirect_uri=http%3A%2F%2F127.0.0.1%3A3000%2Fadmin%2Fcallback&client_id=3f9c2a7e5b1d4c8fa6e0b2d4c6a8e1f3&code_verifier=dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk
```

| Token endpoint answer | Result |
|---|---|
| the grant above, received at `1795876200000` | resolves `expiresAt: 1795879800000` (AC-1) |
| 200 without `refresh_token` | token error (AC-2) |
| `400 {"error":"invalid_grant","error_description":"Invalid authorization code"}` | token error naming `invalid_grant` and `Invalid authorization code` (AC-2) |
| 503, empty body | token error naming no Spotify error (AC-2) |
| 429 `Retry-After: 2`, then 200 | sleeper called with 2 s, resolves (AC-2) |
| 429 three times | rate-limit error after exactly 3 requests (AC-2) |

Refresh request body (AC-3): `grant_type=refresh_token&refresh_token=AQChost-refresh-token&client_id=3f9c2a7e5b1d4c8fa6e0b2d4c6a8e1f3`.

| Refresh answer | Resolved `refreshToken` / result |
|---|---|
| `{"access_token":"BQDhost-refreshed","token_type":"Bearer","expires_in":3600}` | `AQChost-refresh-token` (kept) |
| same plus `"refresh_token":"AQChost-rotated"` | `AQChost-rotated` |
| `400 {"error":"invalid_grant","error_description":"Refresh token revoked"}` | token error naming `invalid_grant` (AC-4) |
| `400 {"error":"invalid_client","error_description":"Invalid client"}` | token error naming `invalid_client` (AC-4) |
| network error from the fake fetch | token error naming no Spotify error (AC-4) |

Account fetch (AC-5, AC-6), token `BQDhost-test-token`:

| `/me` answer | Result |
|---|---|
| the Host Account's | `{ id: "31abcxyzhost", displayName: "playset-host" }` |
| `{ "id": "31abcxyzhost", "display_name": null }` | `{ id: "31abcxyzhost" }` (no `displayName` key) |
| `{ "id": "31abcxyzhost", "display_name": "" }` | `{ id: "31abcxyzhost" }` |
| `{ "display_name": "playset-host" }` | `SpotifyAccountError`, no `status` |
| `403 {"error":{"status":403,"message":"Check settings on developer.spotify.com/dashboard, the user may not be registered."}}` | `SpotifyAccountError`, `status` 403 |
| 401 | `status` 401 |
| 500 | `status` 500 |
| 429 three times | `status` 429, after exactly 3 requests |
| network error | no `status` |

The request carried `Authorization: Bearer BQDhost-test-token`. No error message or hint contains `BQDhost-test-token`, `AQChost-refresh-token`, `AQDx9-test-code` or `dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk`.

### X2 — Host token store (AC-7, AC-8)

```js
const t = { accountId: "31abcxyzhost", displayName: "playset-host",
  accessToken: "BQDhost-test-token", refreshToken: "AQChost-refresh-token", expiresAt: 1795879800000 };
await store.read();         // undefined
await store.save(t);
await store.read();         // equal to t
await store.save({ ...t, displayName: undefined, accessToken: "BQDhost-second" }); // displayName key omitted
await store.read();         // { accountId: "31abcxyzhost", accessToken: "BQDhost-second", refreshToken: "AQChost-refresh-token", expiresAt: 1795879800000 }
await store.clear();
await store.read();         // undefined
```

`displayName: "O'Brien; DROP TABLE x; --"` saves and reads back unchanged. `createSqliteStore` twice on one `:memory:` database: the saved `t` is still read.

### X3 — Host token source (AC-9 to AC-12)

Clock `1795876200000`.

| Stored Host token | Refresh fake | Source resolves | Store afterwards | Refresh calls |
|---|---|---|---|---|
| none | — | `undefined` | none | 0 |
| `t` with `accountId: "jane.doe.music"` | — | `undefined` | unchanged | 0 |
| `t` (`expiresAt` `1795879800000`, +1 h) | — | `BQDhost-test-token` | unchanged | 0 |
| `t` with `expiresAt` `1795876260001` (+60.001 s) | — | `BQDhost-test-token` | unchanged | 0 |
| `t` with `expiresAt` `1795876230000` (+30 s) | `{ accessToken: "BQDhost-refreshed", refreshToken: "AQChost-refresh-token", expiresAt: 1795879800000 }` | `BQDhost-refreshed` | `{ accountId: "31abcxyzhost", displayName: "playset-host", accessToken: "BQDhost-refreshed", refreshToken: "AQChost-refresh-token", expiresAt: 1795879800000 }` | 1, with `AQChost-refresh-token` |
| `t` expired (`1795870000000`) | grant with `refreshToken: "AQChost-rotated"` | `BQDhost-refreshed` | refresh token `AQChost-rotated` | 1 |
| `t` expired | rejects: token error naming `invalid_grant` | `undefined` | none; `logger.warn` once: `The Host Account's Spotify login has ended. Log in again at /admin.` | 1 |
| `t` expired | rejects: token error, HTTP 503 | rejects | unchanged | 1; a second ask refreshes again (2) |

Three asks at once with `t` expired and a refresh fake that waits until released: one refresh call; after release all three resolve `BQDhost-refreshed`. With the waiting refresh rejecting `invalid_grant`: all three resolve `undefined`, one warn.

Through the app: with `t` stored and the entry's wiring (source over the store), `GET /api/setlists/73a1b2c5/preview` streams as PRD 0016 X9 and every Match search gets `BQDhost-test-token`; with the store empty it answers 503 E-23.

### X4 — Login redirect (AC-13, AC-19)

`GET /admin/login` → 302, `Cache-Control: no-store`, `Location` (parameter order free; spaces in `scope` as `+` or `%20`):

```
https://accounts.spotify.com/authorize?client_id=3f9c2a7e5b1d4c8fa6e0b2d4c6a8e1f3&response_type=code&redirect_uri=http%3A%2F%2F127.0.0.1%3A3000%2Fadmin%2Fcallback&scope=playlist-modify-private+playlist-modify-public+playlist-read-private&state=<new>&code_challenge_method=S256&code_challenge=<new>
```

`Set-Cookie: playset_login=<signed value>; Max-Age=600; Path=/admin; HttpOnly; SameSite=Lax` (attribute order free). Two requests give two different `state` and `code_challenge` values. With `X-Forwarded-Proto: https` the cookie also has `Secure`; with `PLAYSET_TRUST_PROXY=0` and the same header it has none. 0 calls to `hostLogin`.

With `PLAYSET_WEB_PORT=8080`, `redirect_uri=http%3A%2F%2F127.0.0.1%3A8080%2Fadmin%2Fcallback`.

### X5 — Callback (AC-14 to AC-18)

Each row: first `GET /admin/login`, keep its `playset_login` cookie and `state` (S), then the callback with that cookie unless the row says otherwise.

| Callback | Fakes | `Location` | Store afterwards | Admin cookie |
|---|---|---|---|---|
| `?code=AQDx9-test-code&state=S` | Host grant, Host `/me` | `/admin` | `{ accountId: "31abcxyzhost", displayName: "playset-host", accessToken: "BQDhost-test-token", refreshToken: "AQChost-refresh-token", expiresAt: 1795879800000 }` | `playset_admin=…; Max-Age=43200; Path=/; HttpOnly; SameSite=Lax` |
| same, `/me` `display_name: null` | | `/admin` | same without `displayName` | set |
| same, a different `t` already stored (`BQDhost-old`) | Host grant, Host `/me` | `/admin` | the new one only | set |
| same, `&iss=https%3A%2F%2Faccounts.spotify.com` added | Host grant, Host `/me` | `/admin` | stored | set |
| `?state=S` | — | `/admin?login=INVALID_INPUT` | unchanged | none |
| `?code=AQDx9-test-code` | — | `/admin?login=INVALID_INPUT` | unchanged | none |
| `?code=AQDx9-test-code&error=access_denied&state=S` | — | `/admin?login=INVALID_INPUT` | unchanged | none |
| `?code=AQDx9-test-code&state=S`, no cookie | — | `/admin?login=INVALID_INPUT` | unchanged | none |
| same, cookie value with its last character changed | — | `/admin?login=INVALID_INPUT` | unchanged | none |
| same, cookie from an app with secret `other-cookie-secret-0000000000000000` | — | `/admin?login=INVALID_INPUT` | unchanged | none |
| same, clock moved to `14:40:00.000Z` (10 min after login) | — | `/admin?login=INVALID_INPUT` | unchanged | none |
| same, clock `14:39:59.999Z` | Host grant, Host `/me` | `/admin` | stored | set |
| `?code=AQDx9-test-code&state=WRONGstate0000000000` | — | `/admin?login=INVALID_INPUT` | unchanged | none |
| `?error=access_denied&state=S` | — | `/admin?login=INVALID_INPUT` | unchanged | none |
| `?code=AQDx9-test-code&state=S` | other grant, `/me` `jane.doe.music` | `/admin?login=NOT_ADMIN` | unchanged | none |
| same | Host grant, `fetchAccount` rejects `SpotifyAccountError` 403 | `/admin?login=NOT_ADMIN` | unchanged | none |
| same | `exchangeCode` rejects: token error, network | `/admin?login=UPSTREAM_UNAVAILABLE` | unchanged | none |
| same | `exchangeCode` rejects: the core's rate-limit error | `/admin?login=UPSTREAM_UNAVAILABLE` | unchanged | none |
| same | `fetchAccount` rejects with status 503, or 429, or no status | `/admin?login=UPSTREAM_UNAVAILABLE` | unchanged | none |
| same | `exchangeCode` rejects: token error naming `invalid_grant` | `/admin?login=INTERNAL` | unchanged | none |
| same | `fetchAccount` rejects with status 401 | `/admin?login=INTERNAL` | unchanged | none |
| same | Host grant and `/me`, store `save` rejects | `/admin?login=INTERNAL` | unchanged | none |

In every row: 302, `Cache-Control: no-store`, a `Set-Cookie` clearing `playset_login` (`Max-Age=0`, `Path=/admin`), no JSON body. In the INVALID_INPUT rows, 0 calls to `exchangeCode` and `fetchAccount`. In the success rows `exchangeCode` got `{ code: "AQDx9-test-code", redirectUri: "http://127.0.0.1:3000/admin/callback", codeVerifier: V }` with base64url(SHA-256(V)) equal to the login's `code_challenge`; `fetchAccount` got `BQDhost-test-token`. In the NOT_ADMIN rows no answer header and no log line contains `jane.doe.music`, `BQDjane-other-token` or `AQCjane-other-refresh`; `logger.warn` once with `A Spotify account that isn't the Host Account tried to log in.` In the success rows `logger.info` once with `The Host Account is connected.`

A second callback with the same `state` but no cookie (the browser dropped it) → `/admin?login=INVALID_INPUT`.

### X6 — Admin cookie (AC-20, AC-21)

Login succeeds at `2026-11-28T14:30:00.000Z`; its admin cookie is C.

| Request to `GET /api/admin/status` | Answer |
|---|---|
| C, clock `2026-11-29T02:29:59.999Z` | 200 |
| C, clock `2026-11-29T02:30:00.000Z` | 401 `{"error":{"code":"NOT_ADMIN","message":"You're not logged in as Playset's admin.","hint":"Log in with Spotify as the Host Account."}}` |
| no cookie | 401, same body |
| `playset_admin=` | 401 |
| C with one character changed | 401 |
| `playset_admin=admin` | 401 |
| C from an app built with cookie secret `other-cookie-secret-0000000000000000` | 401 |
| the login cookie's value sent as `playset_admin` | 401 |

The values of C and of every `playset_login` contain none of `31abcxyzhost`, `BQDhost-test-token`, `AQChost-refresh-token`, `AQDx9-test-code`, `test-cookie-secret-7d1f0c9b2e8a4f6d5c3b1a09`. No `Location` of X4 or X5 contains `31abcxyzhost` or the code verifier.

### X7 — Status (AC-22 to AC-25)

Stored Host token `t` (Host Account, `playset-host`). Rate-limit hit counter: 2 for `2026-11-28`, 5 for `2026-11-27`. Usage events:

| Day | Kind | Setlist id | Artist |
|---|---|---|---|
| 2026-11-28 | created | 2bf1c8e4 | Pearl Jam |
| 2026-11-28 | updated | 2bf1c8e4 | Pearl Jam |
| 2026-11-28 | opened | 2bf1c8e4 | Pearl Jam |
| 2026-11-28 | opened | 2bf1c8e4 | Pearl Jam |
| 2026-11-28 | opened | 2bf1c8e4 | Pearl Jam |
| 2026-11-28 | created | 73a1b2c5 | Arctic Monkeys |
| 2026-11-27 | created | 1bd5a2c8 | Guns N' Roses |
| 2026-11-27 | opened | 73a1b2c5 | Arctic Monkeys |
| 2026-10-30 | created | 63a5e2b7 | Arctic Monkeys |
| 2026-10-29 | created | 9ac1e5d3 | Arctic Monkeys |
| 2026-10-29 | opened | 53d60349 | Nirvana |

`GET /api/admin/status` with a valid admin cookie → 200:

```json
{
  "hostAccount": { "connected": true, "displayName": "playset-host" },
  "config": [
    { "name": "setlist.fm API key", "present": true },
    { "name": "Spotify client id", "present": true },
    { "name": "Host Account id", "present": true },
    { "name": "Cookie secret", "present": true }
  ],
  "usage": {
    "playlistsMade": 6,
    "opens": 5,
    "perDay": [
      { "date": "2026-11-28", "created": 2, "updated": 1, "opened": 3 },
      { "date": "2026-11-27", "created": 1, "updated": 0, "opened": 1 },
      { "date": "2026-11-26", "created": 0, "updated": 0, "opened": 0 },
      "… 26 more days of zeros, 2026-11-25 down to 2026-10-31 …",
      { "date": "2026-10-30", "created": 1, "updated": 0, "opened": 0 }
    ],
    "topArtists": [
      { "artist": "Arctic Monkeys", "playlistCount": 3 },
      { "artist": "Guns N' Roses", "playlistCount": 1 },
      { "artist": "Pearl Jam", "playlistCount": 1 }
    ]
  },
  "rateLimitHitsToday": 2
}
```

`perDay` has exactly 30 entries; 2026-10-29 is not in it but counts in `playlistsMade` and `opens`. Pearl Jam counts 1 (one Setlist, created and updated). Nirvana (only an open) is not listed. 0 calls to `hostLogin`, the Host token source, setlist.fm or Spotify services; the events are unchanged.

| Variation | Answer differs in |
|---|---|
| store empty | `"hostAccount": { "connected": false }` |
| `t` without `displayName` | `"hostAccount": { "connected": true }` |
| `t` with `accountId: "jane.doe.music"` | `"hostAccount": { "connected": false }` |
| no events, counter 0 | `playlistsMade` 0, `opens` 0, 30 days of zeros from 2026-11-28 to 2026-10-30, `topArtists` [], `rateLimitHitsToday` 0 |
| 12 Artists, each with 1 created event: `ABBA`, `Bjork`, `Coldplay`, `Daft Punk`, `Elbow`, `Feist`, `Genesis`, `Haim`, `Interpol`, `Jamiroquai`, `Keane`, `Lorde` | 10 entries, `ABBA` to `Jamiroquai` |
| clock `2026-11-29T00:00:00.000Z` | `perDay[0]` is `2026-11-29` (zeros), `perDay[1]` is `2026-11-28`; `rateLimitHitsToday` 0 |

The same events in `createMemoryUsageEvents()` and in `createSqliteStore(new Database(":memory:")).events` give equal `readUsage("2026-11-28")`.

### X8 — Logout and other methods (AC-26)

| Request | Answer | Admin cookie | Store |
|---|---|---|---|
| `POST /api/admin/logout` with C, no body | 204, empty body | `playset_admin=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax` | `t` unchanged |
| same, body `{}` | 204 | cleared | unchanged |
| same, no cookie | 204 | cleared | unchanged |
| same, body `{"all":true}` | 400 `{"error":{"code":"INVALID_INPUT","message":"That request isn't valid."}}` | no `Set-Cookie` | unchanged |
| same, `Content-Type: text/plain`, body `bye` | 400, same | no `Set-Cookie` | unchanged |
| `GET /api/admin/logout` | 404 E-10 | — | — |
| `POST /api/admin/status` | 404 E-10 | — | — |

After logout, the browser (supertest agent) asking the status gets 401 E-26; a preview still gets `BQDhost-test-token` from the source.

### X9 — Logging (AC-27)

In every test of X3 to X8, no `logger` call's text contains `31abcxyzhost`, `BQDhost-test-token`, `BQDhost-refreshed`, `AQChost-refresh-token`, `AQChost-rotated`, `AQDx9-test-code`, the code verifier, `jane.doe.music`, `BQDjane-other-token`, `test-cookie-secret-7d1f0c9b2e8a4f6d5c3b1a09` or any `playset_admin` / `playset_login` value. `exchangeCode` rejecting with `Error("token endpoint said no for AQDx9-test-code")` → `logger.error` text holds `token endpoint said no for [redacted]`.

### AC coverage

| AC | Examples |
|---|---|
| AC-1 | X1 |
| AC-2 | X1 |
| AC-3 | X1 |
| AC-4 | X1 |
| AC-5 | X1 |
| AC-6 | X1 |
| AC-7 | X2 |
| AC-8 | X2, X5 |
| AC-9 | X3 |
| AC-10 | X3 |
| AC-11 | X3 |
| AC-12 | X3 |
| AC-13 | X4 |
| AC-14 | X5 |
| AC-15 | X5 |
| AC-16 | X5 |
| AC-17 | X5 |
| AC-18 | X5 |
| AC-19 | X4 |
| AC-20 | X6 |
| AC-21 | X6 |
| AC-22 | X7 |
| AC-23 | X7 |
| AC-24 | X7 |
| AC-25 | X7 |
| AC-26 | X8 |
| AC-27 | X5, X9 |

## Manual run check

With real keys in `.env` and the redirect URI `http://127.0.0.1:3000/admin/callback` registered in the Spotify app: `npm run web`, open `http://127.0.0.1:3000/admin/login` and log in as the Host Account → the browser lands on `/admin` (the client's page; Slice 19 fills it). `curl` with the admin cookie on `/api/admin/status` shows `"connected": true` and the display name. A preview of a real Setlist now streams Matches. Restarting the server keeps the Host Account connected. Logging in with another allowlisted account lands on `/admin?login=NOT_ADMIN` and the status still shows the Host Account. `POST /api/admin/logout` → 204, and the status then answers 401. The data file is readable and writable by its owner only (`0600`).

## Changes to earlier PRDs

Each earlier PRD was checked:

- **PRD 0016 — Visitor API server:** changed.
  - Its non-goals "No admin routes" and "No real Host token yet" and its Decision 24 (entry wires `notConnectedHostTokenSource`) are superseded: the entry file now wires `createHostTokenSource` over the SQLite store. `notConnectedHostTokenSource` stays exported and its AC-18 behaviour is unchanged.
  - `createApp` takes two more required deps, `hostTokenStore` and `hostLogin`. All its other deps and every Visitor route behave as before.
  - `createSqliteStore(db)` (AC-35, AC-36) also creates the Host token table if missing and returns `hostTokenStore` next to `records` and `events`. Its records and events behave as before; AC-33 (no Visitor address in any table) still holds.
  - Usage events (AC-36, AC-37) gain `readUsage(today)`; `recordEvent` and `countPlaylistsMade` are unchanged.
  - The catalogue gains E-26 (`NOT_ADMIN`, 401) and E-27. Its Decision 13 ("`NOT_ADMIN` is Slice 17") is filled: 401.
  - AC-6's fallback: `/admin/login` and `/admin/callback` are answered before the client fallback (its Decision 20 planned this); `GET /admin` still answers `index.html`.
  - AC-8's redaction adds the stored and new tokens, the code, the code verifier and cookie values (AC-27 here).
  - Its Decision 1 ("admin status `present` is always true while the server runs") is kept (AC-22).
- **PRD 0004 — Spotify login:** behaviour unchanged. The core `spotify-auth` module gains three stateless calls (`exchangeAuthorizationCode`, `refreshAccessToken`, `fetchSpotifyAccount`) and `SpotifyAccountError`; this Slice owns those additions. The CLI's `getAccessToken`, the loopback receiver, the token file, `PLAYSET_AUTH_PORT`, the scopes and every PRD 0004 AC stay as they are. Its non-goal "the future web login flow" is the part filled here, by the server, without changing the CLI flow.
- **PRD 0014 — Host playlists:** unchanged. Its "Host login scopes" are used exactly (AC-13). The Host steps get the access token from the Host token source as before.
- **PRD 0015 — Web contract:** no contract change. Used as they are: `ROUTES.adminLogin`, `adminCallback`, `adminStatus`, `adminLogout`; `adminCallbackQuerySchema`, `adminLogoutBodySchema`, `adminStatusResponseSchema`; `CONFIG_ITEMS`; `LIMITS.usageDays` and `LIMITS.topArtistsMax`; its wire rules for the admin redirects (`/admin` or `/admin?login=<code>`, with `NOT_ADMIN`, `INVALID_INPUT`, `UPSTREAM_UNAVAILABLE`, `INTERNAL`) and logout (204 with or without a cookie). `adminPageQuerySchema` is the client's (Slice 19). Its Decision 16 is followed: `displayName` is the Spotify display name, never the id.
- **PRD 0018 — Visitor web app:** unchanged. `/admin` still shows its Page not found screen until Slice 19.
- **PRD 0012 — Run steps:** unchanged; the steps get the Host token as before.
- **PRD 0001, 0002, 0003, 0005, 0006, 0007, 0008, 0009, 0010, 0011:** not touched (no setlist, matching, playlist or CLI behaviour changes).

**Tests.** Two existing server test files build `createApp` by hand: the shared harness (`test/web/server/fixtures/harness.ts`) and the `notConnectedHostTokenSource` test (`test/web/server/not-connected.test.ts`). Each gains the two new deps (a memory Host token store and a `hostLogin` fake that is never called). No assertion changes. This change is listed in the PR.

## Shared-file requests

For the orchestrator (this Slice does not edit shared files):

- **src/core/index.ts:** export `generateCodeVerifier`, `computeCodeChallenge`, `generateState`, `buildAuthorizeUrl`, `exchangeAuthorizationCode`, `refreshAccessToken`, `fetchSpotifyAccount`, `SpotifyAccountError` and the type `TokenGrant` from `spotify-auth`.
- **CLAUDE.md**, Architecture: `src/core/` `spotify-auth` line: "(PKCE login, token refresh; stateless code exchange, refresh and `/me` for the web)". `src/web/server/` line: add "admin: Spotify login as the Host Account (`/admin/login`, `/admin/callback`, signed httpOnly cookies), Host token in SQLite refreshed by the server, `/api/admin/status`, logout".
- **package.json, lockfile:** none expected (cookie signing uses `node:crypto`; if the implementer wants `cookie-parser`, that is a request to the orchestrator).
- **GLOSSARY.md, docs/PLAN.md, .env.example:** none.

## Glossary terms used

- **Host Account** — as defined in GLOSSARY.md.
- **Setlist Playlist** — as defined in GLOSSARY.md.
- **Setlist** — as defined in GLOSSARY.md.
- **Visitor** — as defined in GLOSSARY.md.
- **Artist** — as defined in GLOSSARY.md (top Artists of the usage numbers).
- **Match** — as defined in GLOSSARY.md (X3 only).

The words in "Words used in this PRD" are PRD-local, not glossary terms. Spotify and OAuth words (access token, refresh token, scope, state, code verifier, redirect URI) are protocol terms, as in PRD 0004.

## Decisions made (by the PRD writer; /implementing is in full-auto mode)

1. **Scopes are PRD 0014's three** (`playlist-modify-private`, `playlist-modify-public`, `playlist-read-private`), not `user-library-read`: Slice 14's live check settled that no library scope is used (the brief's "e.g. `user-library-read`" is superseded by that).
2. **The `/me` call lives in core `spotify-auth`**, next to the code exchange and refresh, so the server reaches Spotify only through the core requester (server rules). The three calls are stateless and new; the CLI's flow is not refactored into them as a requirement (the implementer may share code).
3. **Redirect URI from the configured port** (`http://127.0.0.1:<port>/admin/callback`); no new env value until public hosting.
4. **`state` and the code verifier live in the signed login cookie** (`playset_login`, `Path=/admin`, 10 minutes, cleared by every callback). Signed, not encrypted: the verifier is useless without the code, and the cookie is `HttpOnly`. A new `/admin/login` replaces an earlier login cookie, so only the newest tab's login can finish.
5. **Callback outcome codes:** schema, cookie, state and consent failures → `INVALID_INPUT`; wrong account and a `/me` 403 (an account not on the Spotify app's user list) → `NOT_ADMIN`; network, 5xx and rate limits → `UPSTREAM_UNAVAILABLE` (the contract lists no `RATE_LIMITED` for the callback); anything else (an OAuth rejection of the code, a `/me` 401, a store failure) → `INTERNAL`.
6. **The admin cookie is self-contained and signed** (`playset_admin`, `Path=/` so it reaches `/api/admin/status`, 12 h, `Max-Age=43200`); the server checks its issue time against the injected clock. There are no server-side sessions, so a restart keeps admins logged in, and logout only clears the browser's copy. The cookie holds no id or token.
7. **`Secure` follows the request's protocol** as Express sees it: with `PLAYSET_TRUST_PROXY=1` a proxy's `X-Forwarded-Proto: https` counts; otherwise only a direct HTTPS connection.
8. **The stored Host token keeps the account id it belongs to.** If `PLAYSET_HOST_SPOTIFY_ID` changes, the old token is not used and the status shows not connected, until the new Host Account logs in.
9. **Refresh rules mirror PRD 0004:** 60-second margin; the old refresh token is kept when none comes back; `invalid_grant` clears the stored token (not connected, one warning); other failures reject (PRD 0016 answers E-23 and logs a warning) and keep the token for the next try. One refresh at a time, so a rotated refresh token is never used twice.
10. **Status "connected" reads the store only** (a stored Host token for the configured id), with no Spotify request: the status page stays fast and never refreshes as a side effect. A token Spotify has revoked shows as connected until the next refresh fails.
11. **The data file is made owner-only (`0600`)** by the entry file, because it now holds the Host refresh token (as PRD 0004 does for the CLI's token file). Checked in the manual run.
12. **Usage numbers:** "playlists made" counts `created` + `updated` events (the same "made" as the daily limit); opens count `opened` events; both all time. `perDay` is the last 30 UTC days, today first. Top Artists count distinct Setlists with a made event, all time, ties by name; Artist names are grouped as stored, without normalising.
13. **`NOT_ADMIN` is 401** (not logged in as the admin); the status reads nothing before the cookie check.
14. **Logout clears the cookie even without one** (204, as the contract says), and leaves the Host token: disconnecting the Host Account is not offered (Reconnect replaces it).
15. **Login and refusal are logged** (`info` on success, `warn` for another account), without any id, so the admin can see attempts without the log holding account data.

## Open questions

(none)
