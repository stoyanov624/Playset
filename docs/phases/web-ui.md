# Phase 2 — Web UI

Status: direction agreed, not yet planned into Slices in `docs/PLAN.md`.
Read this when planning or building the web UI; it is not needed for other work.

## Direction

Why: the CLI's prompts and flags confuse users and make mistakes easy; the web UI should guide them.
- **Fuzzy Artist search**: search-as-you-type over setlist.fm Artist search, showing candidates (name + disambiguation) to pick from — no auto-pick guessing.
- **Pick a Setlist**: show the Artist's recent Setlists (date, venue, city, song count, Incomplete Setlist marker) and let the user choose which to transfer, instead of only the Latest Setlist.
- **Spotify login on the server, token in an httpOnly cookie**: the backend does the Authorization Code (+PKCE) exchange and refresh; tokens never reach browser JavaScript (httpOnly, Secure, SameSite cookie). This replaces the earlier idea of client-side PKCE. The redirect URI must be registered in the Spotify app.
- **Backend proxy** holds the setlist.fm key and applies its throttle for all users.
- Reuse core server-side: `createRunServices` with a per-user `SettingsStore` adapter; the Node-only parts of `spotify-auth` (loopback receiver) are CLI-only. Open question for planning: `runPlayset` asks its questions mid-run through `RunFrontEnd`, which doesn't map directly to stateless HTTP — the web flow probably needs the run split into steps (choose Setlist → Tapes → preview → create).
- The Spotify 5-user Development Mode limit applies to the web app too.
