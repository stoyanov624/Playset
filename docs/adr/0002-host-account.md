# The web app creates every Setlist Playlist in one Host Account

Spotify Development Mode lets at most 5 allowlisted accounts log in to an app, and extended quota is not available to personal projects, so "each visitor logs in" caps the web app at 5 people. We chose instead that visitors never log in: the server creates every Setlist Playlist, public, in a single **Host Account**, keeps one per Setlist (updated in place when the Setlist changes) and records them in a SQLite file, which also gives usage numbers. Whoever logs in with Spotify as the Host Account (id checked against config) is the admin; there is no password.

## Consequences

- Playlists must be public: Spotify shows private playlists to nobody else, even by link, and the Web API cannot make invite links.
- Every playlist shows under the Host Account's name; an account holds roughly 10–11k playlists in its lifetime, so duplicates are never made and Create is rate-limited per IP and per day.
- Spotify's Developer Terms neither allow nor forbid this; Spotify may see it as working around the quota and restrict the app. Accepted risk for a free, non-commercial tool. The CLI keeps per-user login and private playlists.

## Considered Options

- **Each visitor logs in** (max 5, private playlists in their own account): fully within the rules, but too few users.
- **Hybrid** (allowlisted users log in, others use the Host Account): more code paths for little gain now.
- **Copy-paste track list** for non-allowlisted visitors: pasting into Spotify is undocumented and unreliable.
