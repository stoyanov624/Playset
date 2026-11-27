# Brief 0017-web-admin-server — Admin login, Host token and usage

Kind: feature
Slice: 17
Depends on: 16
Module: src/web/server

The plan agreed with the user in the planning session. `/implementing`'s `prd-writer` turns it into `docs/prd/0017-web-admin-server.md`. Rules: `.claude/rules/web-server.md`; contract: `src/web/shared`; ADR 0002.

## Behaviour
- `GET /admin/login` → Spotify authorize redirect (Authorization Code + PKCE, no client secret); `state` and the PKCE verifier live in a short-lived signed httpOnly cookie. Scopes: `playlist-modify-public` plus what Slice 14's live check found necessary (e.g. `user-library-read`).
- `GET /admin/callback` → checks `state`, exchanges the code, calls `/me`; only when the id equals `PLAYSET_HOST_SPOTIFY_ID` it stores the Host token server-side and sets the signed, httpOnly, SameSite=Lax admin cookie (12 h, `Secure` over HTTPS), then redirects to `/admin`. Any other account → `NOT_ADMIN`, nothing stored.
- Host token stored in the SQLite file behind a `HostTokenStore`; the server refreshes it with core's refresh (keeps the old refresh token when none is returned; `invalid_grant` → Host Account not connected). This store feeds the `HostTokenSource` from Slice 16.
- `GET /api/admin/status` (admin cookie required): Host Account connected?, config present (✅ per name, never values), playlists made, opens, per day for 30 days, top Artists (from `events`), rate-limit hits today.
- `POST /api/admin/logout` clears the admin cookie (the Host token stays).

## Edge cases
- Spotify denies consent / `error` in callback / wrong `state` → no token stored, a friendly error page or redirect with a message.
- Expired or forged admin cookie → `NOT_ADMIN`.
- Reconnect while a token exists → replaced by the new one.

## Non-goals
- No password, no settings editing, no admin UI (Slice 19).

## Notes
- Core today exports only the loopback receiver; this Slice needs core's PKCE helpers (verifier/challenge, authorize URL, code exchange, refresh) exported from `src/core/index.ts` — a shared-file request for the orchestrator. The loopback receiver is not used.
- The Spotify app needs the redirect URI `http://127.0.0.1:3000/admin/callback`.
