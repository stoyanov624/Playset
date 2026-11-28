---
paths:
  - "src/web/server/**"
  - "test/web/server/**"
---

# Web server rules (Express)

Direction: `docs/phases/web-ui.md`, ADR 0001 (stateless steps), ADR 0002 (Host Account). Shared API contract: `.claude/rules/web-shared.md`.

## Structure
- Express 5 (async route errors reach the error handler without wrappers).
- `createApp(deps)` builds the app from injected deps (the setlist.fm and Spotify services from `createRunServices`, `SetlistPlaylistRecords`, usage events, Host token source, clock, config, logger; the stateless core steps are imported directly, since they hold no state and reach the outside only through those services) and never calls `listen`; only the entry file starts the server. Tests use `createApp` with fakes.
- Config is read from env once at startup, validated with zod, and passed down; nothing else reads `process.env`. A missing or invalid value stops startup with a clear log line.
- Routes are thin: validate input → call one core step → shape the response. No domain rules in the server — matching, naming, Tapes, Incomplete Setlist logic all stay in `src/core/`.
- The Setlist Playlist record is behind the `SetlistPlaylistRecords` interface: a `better-sqlite3` adapter and an in-memory adapter for tests. SQL lives only in the SQLite adapter, with parameters, never string-built.

## Validation
- Every body, query and path parameter is parsed with the zod schema from `src/web/shared/`; a failed parse is an `INVALID_INPUT` error. Handlers only see parsed values.
- Responses are typed with the shared response types; never send an object the contract doesn't describe.

## Errors — generic codes, human words
- One error handler at the end of the app. Every error leaves as `{ "error": { "code", "message", "hint"? } }` with the matching status.
- `code` comes from a small fixed catalogue in the server (e.g. `INVALID_INPUT` 400, `NOT_FOUND` 404, `RATE_LIMITED` 429, `UPSTREAM_UNAVAILABLE` 502/503, `PLAYLISTS_UNAVAILABLE` 503 when the Host Account is not connected, `NOT_ADMIN` 401/403, `INTERNAL` 500). The client branches on `code` only.
- `message` and `hint` are written for a visitor: a plain sentence saying what happened, and what to do next ("setlist.fm isn't answering right now." / "Try again in a minute."). Never pass a core `PlaysetError` message through verbatim — its wording targets the CLI (env vars, commands). Map each core error kind to a catalogue entry.
- Never in a response: stack, cause, upstream status/body, URLs with keys, ids of internal records, file paths, SQL, env names.
- Unknown errors → `INTERNAL`, "Something went wrong on our side." / "Please try again in a minute." The full error (with cause) goes to the server log, secrets redacted.
- 429 responses carry `Retry-After`.

## Security
- helmet with a strict Content Security Policy (no inline scripts or styles, `default-src 'self'`); no CORS — the client is served from the same origin.
- JSON body limit 10 kB.
- The server only reaches setlist.fm/Spotify through the core requester and its allowed URL prefixes; never fetch a URL a visitor sent.
- Spotify tokens, the setlist.fm key, the cookie secret and the Host Account id never appear in any response or client bundle.
- `/admin` routes check the signed, httpOnly, SameSite=Lax admin cookie (`Secure` when served over HTTPS); the Spotify login callback checks `state` and that `/me` id equals the configured Host Account id.
- Every Create/Update route is behind the per-IP and daily limits. IPs are used only for rate limiting and not stored.

## Tests
- supertest against `createApp(fakes)`; no network, no real SQLite file (in-memory adapter, or `:memory:` when testing the SQLite adapter itself).
- Cover for each route: happy path, invalid input, each catalogue error it can return, and that no secret leaks in the body.
- `npm test`, `npm run typecheck` and `npm run lint` must be green.
