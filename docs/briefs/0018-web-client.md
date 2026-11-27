# Brief 0018-web-client — Visitor web app

Kind: feature
Slice: 18
Depends on: 13, 15
Module: src/web/client

The plan agreed with the user in the planning session. `/implementing`'s `prd-writer` turns it into `docs/prd/0018-web-client.md`. Rules: `.claude/rules/web-client.md`; look: `docs/design.md` (Slice 13); contract: `src/web/shared` (Slice 15).

## Behaviour
- Routes (React Router; Back works at every step):
  - `/` — Artist input + Search (Enter too) and a separate setlist.fm link input + Open. No search-as-you-type.
  - Search → candidates (name + disambiguation), **always shown, even for one exact match** → pick → `/artists/:mbid`. No result → "No Artist found — check spelling".
  - Open → `GET /api/setlist-links` → `/setlists/:id`.
  - `/artists/:mbid` — Setlist list (date, venue, city, song count, Incomplete marker), Load more = next page; Artist name from the response.
  - `/setlists/:id` — status `current` → the link at once; `none` → preview; `outdated` → preview with **Update playlist**. Preview streams progress (announced in an `aria-live` region), then Show line, Incomplete warning, Performance → Match / Miss, Misses, Unknown Songs and snippets noted, Tapes listed as left out → **Create playlist** → Creating… → Playlist created + share link.
  - `/terms` — Terms/Privacy page.
- Footer on every page: setlist.fm attribution, "playlists are created in Playset's Spotify account and are public", link to Terms/Privacy.
- Errors by `code`: `RATE_LIMITED` (Retry-After countdown), `UPSTREAM_UNAVAILABLE` (retry), `PLAYLISTS_UNAVAILABLE` ("Playlist creation is temporarily unavailable"; search, list and links still work), `SETLIST_CHANGED` (load a fresh preview), `NOT_FOUND`, `INVALID_INPUT` — showing the server's `message`/`hint`.
- One typed API client (`src/web/client/api/`) from the shared contract, injected through React context; TanStack Query for calls.

## Edge cases
- Leaving the preview page closes the SSE stream.
- Empty Setlist page after Load more → nothing added, Load more follows `hasMore`.
- Focus moves to each new screen's heading.

## Non-goals
- No `/admin` page (Slice 19). No Tape question, no "newest complete Setlist" offer, no auto-pick.

## Notes
- The Terms/Privacy text is drafted in this Slice's PRD for the user to approve: non-commercial tool; playlists are public in Playset's Spotify account; no visitor data kept, IP used only for rate limits; setlist.fm and Spotify attribution; Spotify's required end-user terms. Not lawyer-grade.
- Shared-file requests: react, react-dom, react-router, @tanstack/react-query, lucide-react, Fontsource fonts from `docs/design.md`, @testing-library/react + user-event, jsdom, vitest-axe; Vite/Vitest config for the client.
