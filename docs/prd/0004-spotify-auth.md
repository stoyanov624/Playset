# PRD 0004 — Spotify login (PKCE) with a cached token

Status: Implemented
Slice: 5
Depends on: none
Module: src/core/spotify-auth

## Problem

Playset can't create a **Setlist Playlist** until the user's Spotify account allows it. Spotify needs a user login for that. Playset is a public client with no client secret, so the login has to use the Authorization Code flow with PKCE. Logging in through the browser on every run would be tiring, so Playset must remember the login between runs and only send the user back to the browser when it has to.

## Goal

Front-ends can ask the core for a valid Spotify access token. The core reuses or refreshes a cached token when it can. When it can't, it runs a full PKCE login through injected interactive hooks. It never needs a client secret and never contains terminal code.

## Non-goals

- Any playlist operation (searching, creating a **Setlist Playlist**, adding tracks). That belongs to other Slices.
- Client secret or Client Credentials flow. Playset never reads, stores or sends a client secret.
- More than one Spotify account: no account switching, no per-user caches, no "log out" command.
- The future web or mobile login flow (browser-side PKCE, different redirect URIs).
- Opening a browser or printing to the terminal. The core only calls the injected "show/open the authorize URL" hook. How that is done belongs to the front-end.
- Timeouts and cancellation while waiting for the callback. The injected callback-waiting interface owns that (for example, the CLI stops it on Ctrl-C).
- Detecting that a cached token was granted with fewer scopes than are required now.
- Encrypting the token cache. It is protected only by file permissions.
- Reading the setlist.fm API key. Only the Spotify client id is in scope.

## User stories

- As a concert-goer, I want to log in to Spotify once in my browser so that later `playset` runs work without asking again.
- As a concert-goer, I want a clear message when my Spotify client id is missing so that I know exactly what to set up.
- As a concert-goer, I want my Spotify tokens stored readable by me only so that other users on my machine can't use my account.
- As a front-end developer, I want the login's interactive steps injected so that the CLI and a future front-end can each show the authorize URL and receive the callback in their own way.

## Acceptance criteria

### Configuration

- **AC-1** — Given `SPOTIFY_CLIENT_ID` is set to a non-empty value, when the client id is resolved, then that value is used, even if the config file also holds a client id.
- **AC-2** — Given `SPOTIFY_CLIENT_ID` is unset or empty and the config file in the Playset config directory holds a non-empty `spotifyClientId`, when the client id is resolved, then the config file value is used.
- **AC-3** — Given no client id in the environment and none in the config file (file missing, unreadable as JSON, or key missing or empty), when the client id is resolved, then a typed "missing client id" error is raised. Its user-facing hint names `SPOTIFY_CLIENT_ID`, the config file path and the redirect URI that has to be registered in the Spotify app settings. No network request is made.
- **AC-4** — Given `PLAYSET_AUTH_PORT` is unset, when the redirect URI is resolved, then it is exactly `http://127.0.0.1:8888/callback`.
- **AC-5** — Given `PLAYSET_AUTH_PORT` is set to an integer from 1 to 65535, when the redirect URI is resolved, then it is `http://127.0.0.1:<port>/callback` with that port. Given it is set to anything else (non-numeric, 0, above 65535), then a typed "invalid port" error is raised that names the bad value.
- **AC-6** — Given any configuration, when a redirect URI is produced, then its host is always `127.0.0.1` and never `localhost`.

### PKCE and the authorize URL

- **AC-7** — Given a new login starts, when the PKCE values are generated, then the code verifier is 43 to 128 characters long, uses only the unreserved characters `A–Z a–z 0–9 - . _ ~`, and is different on each login.
- **AC-8** — Given a code verifier, when the code challenge is computed, then it is the base64url encoding (`-` and `_`, no `=` padding) of the SHA-256 digest of the verifier, and the method is `S256`.
- **AC-9** — Given a new login starts, when the `state` value is generated, then it is random, URL-safe, at least 16 characters long, and different on each login.
- **AC-10** — Given a client id, redirect URI, state and code challenge, when the authorize URL is built, then it is `https://accounts.spotify.com/authorize` with exactly these query parameters, correctly URL-encoded: `client_id`, `response_type=code`, `redirect_uri`, `scope=playlist-modify-private playlist-modify-public playlist-read-private`, `state`, `code_challenge_method=S256` and `code_challenge`. The URL has no client secret.

### Full login

- **AC-11** — Given a full login is needed, when it runs, then the authorize URL is passed to the injected "show/open URL" hook exactly once. After that, the injected callback receiver is awaited for the authorization result.
- **AC-12** — Given the callback brings back a `code` and a `state` equal to the one sent, when the login continues, then one form-encoded `POST` goes to `https://accounts.spotify.com/api/token` with `grant_type=authorization_code`, `code`, `redirect_uri` (identical to the one in the authorize URL), `client_id` and `code_verifier` (the verifier whose challenge was sent), and with no client secret or `Authorization` header.
- **AC-13** — Given the callback's `state` differs from the one sent, or is missing, when the login continues, then a typed "state mismatch" error is raised and no token request is made.
- **AC-14** — Given the callback brings back `error=access_denied`, when the login continues, then a typed "access denied" error is raised. It tells the user that the Spotify login was declined, and no token request is made. Any other `error` value raises a typed authorization error that includes that value.
- **AC-15** — Given the callback has neither `code` nor `error`, when the login continues, then a typed authorization error is raised and no token request is made.
- **AC-16** — Given the token endpoint answers the code exchange with HTTP 200, when the login finishes, then the access token is returned to the caller and the token cache is written (see AC-21).
- **AC-17** — Given the token endpoint answers the code exchange with an error response (for example `400 {"error":"invalid_grant"}`), when the login finishes, then a typed token error is raised that includes Spotify's `error` and `error_description`, and the token cache is not changed.

### Getting an access token

- **AC-18** — Given a cached access token whose expiry is more than 60 seconds away, when an access token is requested, then the cached token is returned and no network request is made.
- **AC-19** — Given a cached access token that has expired or expires within 60 seconds, and a cached refresh token, when an access token is requested, then one form-encoded `POST` goes to the token endpoint with `grant_type=refresh_token`, `refresh_token` and `client_id` (no client secret). On HTTP 200 the new access token is returned and the cache is updated.
- **AC-20** — Given a refresh response, when the cache is updated, then the new `refresh_token` is stored if the response has one. If it doesn't, the previous refresh token is kept.
- **AC-21** — Given any successful token response, when the cache is written, then it holds the refresh token, the access token and an absolute expiry time worked out as "time of response + `expires_in` seconds".
- **AC-22** — Given no token cache exists, or the cache can't be read as a valid cache (corrupt JSON, missing refresh token), when an access token is requested, then a full login runs (AC-11 to AC-17) and its result replaces the cache.
- **AC-23** — Given a refresh is rejected with `400 {"error":"invalid_grant"}` (for example, the refresh token was revoked), when an access token is requested, then a full login runs. If it succeeds, its tokens replace the cache.
- **AC-24** — Given a refresh fails for any reason other than `invalid_grant` (network failure, HTTP 5xx, any other error code), when an access token is requested, then a typed token error is raised, no full login starts, and the existing cache stays unchanged.
- **AC-25** — Given the token endpoint answers HTTP 429 with a `Retry-After` header, when an exchange or a refresh is attempted, then Playset waits that many seconds (through an injectable clock or sleeper) and retries. It makes at most 3 attempts in total, then raises a typed rate-limit error.

### Token cache storage

- **AC-26** — Given the token cache is written, when the file is created or overwritten, then its permissions are `0600` (owner read/write only), even if an older file had looser permissions. If the config directory doesn't exist, it is created with `0700` permissions.
- **AC-27** — Given a test or front-end supplies a config directory path, when the client id is read or the token cache is read or written, then only that directory is used and the user's real `~/.config/playset/` is never touched.
- **AC-28** — Given any error or hint produced by this module, when it is shown to the user, then it never contains an access token, refresh token, code verifier or authorization code.

### Loopback callback receiver

- **AC-29** — Given the bundled loopback callback receiver is started for a redirect URI, when it listens, then it binds only to `127.0.0.1` on that URI's port. If the port is already in use, a typed "port in use" error is raised, with a hint to set `PLAYSET_AUTH_PORT`.
- **AC-30** — Given the receiver is listening, when a `GET /callback?code=…&state=…` arrives, then it answers HTTP 200 with a small HTML page saying the login worked and the browser tab can be closed. It hands `code` and `state` to the login, then stops listening.
- **AC-31** — Given the receiver is listening, when a `GET /callback?error=access_denied&state=…` arrives, then it answers with a small HTML page saying the login was declined. It hands the error to the login (which raises per AC-14), then stops listening.
- **AC-32** — Given the receiver is listening, when a request arrives for any other path (for example `/favicon.ico`), then it answers HTTP 404, keeps listening and doesn't end the login.

## Examples

### Configuration (AC-1 to AC-6)

| `SPOTIFY_CLIENT_ID` | `<configDir>/config.json` | Result |
|---|---|---|
| `3f9a0c2e7b4d4e1f8a6b5c4d3e2f1a0b` | `{"spotifyClientId":"aaaabbbbccccdddd0000111122223333"}` | `3f9a0c2e7b4d4e1f8a6b5c4d3e2f1a0b` (AC-1) |
| unset | `{"spotifyClientId":"aaaabbbbccccdddd0000111122223333"}` | `aaaabbbbccccdddd0000111122223333` (AC-2) |
| `""` | `{"spotifyClientId":"aaaabbbbccccdddd0000111122223333"}` | `aaaabbbbccccdddd0000111122223333` (AC-2) |
| unset | file missing | missing-client-id error (AC-3) |
| unset | `{"setlistfmApiKey":"xyz"}` | missing-client-id error (AC-3) |
| unset | `{not json` | missing-client-id error (AC-3) |

Example hint for AC-3 (the wording may differ, but all three facts must be present):

```
Spotify client id not found.
Set SPOTIFY_CLIENT_ID, or add {"spotifyClientId": "<your id>"} to ~/.config/playset/config.json.
In your Spotify app settings, register the redirect URI http://127.0.0.1:8888/callback
```

| `PLAYSET_AUTH_PORT` | Redirect URI / result |
|---|---|
| unset | `http://127.0.0.1:8888/callback` (AC-4) |
| `9090` | `http://127.0.0.1:9090/callback` (AC-5) |
| `abc` | invalid-port error naming `abc` (AC-5) |
| `0` | invalid-port error naming `0` (AC-5) |
| `70000` | invalid-port error naming `70000` (AC-5) |

The result never contains `localhost` (AC-6).

### PKCE (AC-7 to AC-9)

RFC 7636 Appendix B test vector (AC-8):

```
code_verifier  = dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk
code_challenge = E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM
```

The challenge has no trailing `=` and contains no `+` or `/`.

Verifier checks (AC-7): `^[A-Za-z0-9\-._~]{43,128}$` matches. Two logins in a row produce two different verifiers and two different `state` values (AC-9).

### Authorize URL (AC-10)

Input: client id `3f9a0c2e7b4d4e1f8a6b5c4d3e2f1a0b`, redirect URI `http://127.0.0.1:8888/callback`, state `q8Zr1xV0bT3kLmN9pQ2s`, challenge `E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM`.

```
https://accounts.spotify.com/authorize?client_id=3f9a0c2e7b4d4e1f8a6b5c4d3e2f1a0b&response_type=code&redirect_uri=http%3A%2F%2F127.0.0.1%3A8888%2Fcallback&scope=playlist-modify-private+playlist-modify-public+playlist-read-private&state=q8Zr1xV0bT3kLmN9pQ2s&code_challenge_method=S256&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM
```

Tests should compare the parsed query parameters, not the parameter order. In `scope`, spaces may be encoded as `+` or `%20`.

### Full login (AC-11 to AC-17)

Callback the receiver gets (AC-12):

```
GET /callback?code=AQD3x9kLp2...Zq&state=q8Zr1xV0bT3kLmN9pQ2s
```

Token request body (AC-12), `Content-Type: application/x-www-form-urlencoded`:

```
grant_type=authorization_code&code=AQD3x9kLp2...Zq&redirect_uri=http%3A%2F%2F127.0.0.1%3A8888%2Fcallback&client_id=3f9a0c2e7b4d4e1f8a6b5c4d3e2f1a0b&code_verifier=dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk
```

Successful token response (AC-16):

```json
{
  "access_token": "BQDj8Zk2...access",
  "token_type": "Bearer",
  "scope": "playlist-modify-private playlist-modify-public playlist-read-private",
  "expires_in": 3600,
  "refresh_token": "AQCr7Yh1...refresh"
}
```

Callback failure cases:

| Callback query | Outcome |
|---|---|
| `code=AQD3...&state=WRONGstate0000000000` | state-mismatch error, no token request (AC-13) |
| `code=AQD3...` (no state) | state-mismatch error, no token request (AC-13) |
| `error=access_denied&state=q8Zr1xV0bT3kLmN9pQ2s` | access-denied error, no token request (AC-14) |
| `error=server_error&state=q8Zr1xV0bT3kLmN9pQ2s` | authorization error containing `server_error` (AC-14) |
| `state=q8Zr1xV0bT3kLmN9pQ2s` (no code, no error) | authorization error, no token request (AC-15) |

Code exchange rejected (AC-17), HTTP 400:

```json
{ "error": "invalid_grant", "error_description": "Invalid authorization code" }
```

→ token error containing `invalid_grant` and `Invalid authorization code`. The cache file is byte-for-byte unchanged.

### Getting an access token (AC-18 to AC-25)

The clock is fixed at `2026-11-26T18:00:00Z` = `1795716000000` ms.

| Cached `expiresAt` | Network | Result |
|---|---|---|
| `1795719600000` (+1 h) | none | cached `BQDj8Zk2...access` (AC-18) |
| `1795716100000` (+100 s) | none | cached token (AC-18) |
| `1795716030000` (+30 s) | refresh | new token (AC-19) |
| `1795715900000` (past) | refresh | new token (AC-19) |

Refresh request body (AC-19):

```
grant_type=refresh_token&refresh_token=AQCr7Yh1...refresh&client_id=3f9a0c2e7b4d4e1f8a6b5c4d3e2f1a0b
```

Refresh response without a new refresh token (AC-20): the cache keeps `AQCr7Yh1...refresh`.

```json
{
  "access_token": "BQNew111...access",
  "token_type": "Bearer",
  "scope": "playlist-modify-private playlist-modify-public playlist-read-private",
  "expires_in": 3600
}
```

Refresh response with a rotated refresh token (AC-20): the cache now holds `AQRotated...refresh`.

```json
{
  "access_token": "BQNew222...access",
  "token_type": "Bearer",
  "scope": "playlist-modify-private playlist-modify-public playlist-read-private",
  "expires_in": 3600,
  "refresh_token": "AQRotated...refresh"
}
```

Refresh revoked (AC-23), HTTP 400. A full login follows: the "show/open URL" hook is called once.

```json
{ "error": "invalid_grant", "error_description": "Refresh token revoked" }
```

Refresh failures that do **not** start a login (AC-24): HTTP 503 with an empty body, a network error from the injected fetch, or HTTP 400 `{"error":"invalid_client","error_description":"Invalid client"}` → token error, cache unchanged, hook not called.

No cache (AC-22): `<configDir>/spotify-token.json` is missing, or contains `{"accessToken":"x"}` (no refresh token), or contains `not json` → full login.

Rate limit (AC-25): first response `429` with `Retry-After: 2`, second `200` → the sleeper is called with 2 s and the token is returned. Three `429`s in a row → rate-limit error after exactly 3 requests.

### Token cache file (AC-21, AC-26, AC-27)

Path: `<configDir>/spotify-token.json` (default `<configDir>` = `~/.config/playset/`). Mode `0600`. The directory is created with mode `0700` if it is missing.

After the successful response above, received at `1795716000000` (AC-21):

```json
{
  "refreshToken": "AQCr7Yh1...refresh",
  "accessToken": "BQDj8Zk2...access",
  "expiresAt": 1795719600000
}
```

An existing cache file with mode `0644` has mode `0600` after the next write (AC-26).

With an injected config dir `/tmp/playset-test-abc/`, all reads and writes stay under that path (AC-27).

### Secret hygiene (AC-28)

When the state-mismatch, token, rate-limit and missing-client-id errors are turned into text (message plus hint), none of the strings `BQDj8Zk2...access`, `AQCr7Yh1...refresh`, `dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk` or `AQD3x9kLp2...Zq` appear in that text.

### Loopback receiver (AC-29 to AC-32)

| Request to `127.0.0.1:8888` | Response | Receiver |
|---|---|---|
| `GET /callback?code=AQD3...&state=q8Zr...` | 200, HTML containing "You can close this tab" | hands back code and state, stops (AC-30) |
| `GET /callback?error=access_denied&state=q8Zr...` | 200, HTML saying the login was declined | hands back the error, stops (AC-31) |
| `GET /favicon.ico` | 404 | keeps listening (AC-32) |

Port 8888 already bound by another process → port-in-use error whose hint mentions `PLAYSET_AUTH_PORT` (AC-29).

## Glossary terms used

- **Setlist Playlist** — as defined in GLOSSARY.md. This Slice only provides the Spotify login that later Slices need in order to create one.

Spotify and OAuth words (access token, refresh token, client id, redirect URI, scope, PKCE, code verifier, code challenge, state) are external protocol terms from Spotify's and RFC 7636's documentation. They are not Playset domain terms.

## Open questions

- (none)
