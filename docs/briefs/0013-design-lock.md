# Brief 0013-design-lock — Design lock for the web app

Kind: design
Slice: 13
Depends on: none
Module: docs/design.md

The plan agreed with the user in the planning session. `/implementing` runs a design pass (the `frontend-design` skill) that produces `docs/design.md` (`Status: Draft` → user approves → `Approved`). Use `GLOSSARY.md` terms in every label.

## Behaviour
- `docs/design.md` holds: a concept grounded in the subject (concerts, setlists, getting ready for a Show), 4–6 named colour tokens (light and dark), self-hosted fonts (Fontsource) and a type scale, spacing/radius tokens, and banned patterns (including the Refuse list in `.claude/references/impeccable/craft-floor.md`).
- Mobile-first (375 px) with a desktop layout. One wireframe per screen/state:
  - Start: Artist input + Search, and a separate setlist.fm link input + Open.
  - Artist candidates (always shown, even for one exact match); "No Artist found — check spelling".
  - Setlist list: date, venue, city, song count, Incomplete marker; Load more; empty state.
  - Setlist status: Setlist Playlist exists and is current → link at once.
  - Preview with live progress (n of total), Show line, Incomplete warning, Performance → Match / Miss, Misses, Unknown Songs and snippets noted, Tapes listed as left out.
  - Create playlist → Creating… → Playlist created (share link); Update playlist when the Setlist changed.
  - Errors: `RATE_LIMITED` with Retry-After countdown, `UPSTREAM_UNAVAILABLE` with retry, `PLAYLISTS_UNAVAILABLE` ("temporarily unavailable"), `SETLIST_CHANGED` (fresh preview), `NOT_FOUND`, `INVALID_INPUT`.
  - Footer (setlist.fm attribution; "playlists are created in Playset's Spotify account and are public"; Terms/Privacy link) and the Terms/Privacy page.
  - `/admin`: logged out (Log in with Spotify), Host Account not connected (Reconnect), dashboard (status, config present ✅, playlists made, opens, per day for 30 days, top Artists, rate-limit hits today).

## Edge cases
- Long Artist, venue and song names wrap without horizontal scroll at 375 px.
- Large Setlists (40+ Performances) and many Misses stay readable.

## Non-goals
- No code. No copy for the Terms page (Slice 18's PRD).

## Notes
- Must satisfy `.claude/rules/web-client.md` (tokens only, lucide-react icons, WCAG 2.2 AA, 44 px targets, reduced motion).
