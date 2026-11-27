# Brief 0019-web-admin-client — Admin page

Kind: feature
Slice: 19
Depends on: 13, 15, 18
Module: src/web/client

The plan agreed with the user in the planning session. `/implementing`'s `prd-writer` turns it into `docs/prd/0019-web-admin-client.md`. Rules: `.claude/rules/web-client.md`; look: `docs/design.md`; contract: `src/web/shared`.

## Behaviour
- `/admin`: `GET /api/admin/status`.
  - `NOT_ADMIN` → "Log in with Spotify" (link to `/admin/login`).
  - Logged in → Host Account status (connected or not, with **Reconnect** = `/admin/login`), config present (✅ per name), playlists made, opens, per day for the last 30 days, top Artists, rate-limit hits today; Log out (`POST /api/admin/logout`).
- Read-only: no settings editing.

## Edge cases
- Status call fails (`UPSTREAM_UNAVAILABLE`/`INTERNAL`) → message + retry.
- No usage yet → empty states that say so.

## Non-goals
- No server code (Slice 17). No password login.

## Notes
- Tests use a fake API client; the real admin server (Slice 17) is not needed for this Slice's tests.
- Per-day chart follows `docs/design.md` tokens; a plain accessible table is fine.
