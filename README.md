# Playset

Turns a [setlist.fm](https://www.setlist.fm) Setlist into a Spotify playlist, with every song in played order. It comes as two front-ends on one core:

- **`playset` CLI** — makes the playlist in your own Spotify account.
- **Web app** — Visitors search an Artist, pick a Show and get a public playlist made in one shared Spotify account (the Host Account). An admin page shows its status and usage.

Words such as Setlist, Show, Tape, Match and Host Account are defined in [`GLOSSARY.md`](GLOSSARY.md).

## What you need

- **Node.js 22 or newer** (`node --version`).
- **A setlist.fm API key** (free, non-commercial): apply on your setlist.fm account at <https://www.setlist.fm/settings/api> (API docs: <https://api.setlist.fm/docs/1.0/index.html>).
- **A Spotify app**, created at <https://developer.spotify.com/dashboard>:
  - The app owner needs Spotify Premium.
  - Under **Redirect URIs** add, exactly (`127.0.0.1`, not `localhost`):
    - `http://127.0.0.1:8888/callback` — for the CLI (port from `PLAYSET_AUTH_PORT`, default 8888)
    - `http://127.0.0.1:3000/admin/callback` — for the web app (port from `PLAYSET_WEB_PORT`, default 3000)
  - Under **User Management** add every Spotify account that will log in (at most 5 in Development Mode).
  - Copy the app's **Client ID**. No client secret is used.

Then install:

```sh
npm ci
```

## CLI

Give the CLI your keys, either as environment variables or in `~/.config/playset/config.json`:

```sh
export SETLISTFM_API_KEY=your-setlistfm-key
export SPOTIFY_CLIENT_ID=your-spotify-client-id
```

```json
{ "setlistfmApiKey": "your-setlistfm-key", "spotifyClientId": "your-spotify-client-id" }
```

Run it from source:

```sh
npm run dev -- "https://www.setlist.fm/setlist/arctic-monkeys/2023/....html"
npm run dev -- "Arctic Monkeys"          # the Artist's Latest Setlist
npm run dev -- "Arctic Monkeys" --dry-run # preview the Matches, create nothing
npm run dev                               # no arguments: opens the playset › shell
```

Or build it once and use the `playset` command:

```sh
npm run build
npm link        # puts `playset` on your PATH
playset --help
```

The first run opens a Spotify login in your browser; the token is then cached in `~/.config/playset/spotify-token.json`. Useful flags: `--yes`, `--public`, `--tapes` / `--no-tapes`, `--dry-run`. Set `PLAYSET_DEBUG=1` for stack traces.

## Web app

### 1. Configure

```sh
cp .env.example .env
```

Fill in `.env` (variables already set in the environment win over it):

| Variable | Required | What it is |
|---|---|---|
| `SETLISTFM_API_KEY` | yes | Your setlist.fm API key |
| `SPOTIFY_CLIENT_ID` | yes | Your Spotify app's Client ID |
| `PLAYSET_HOST_SPOTIFY_ID` | yes | The Spotify user id of the Host Account — the account the playlists are made in, and the only one that can log in to the admin page. It is the last part of the account's profile link (`open.spotify.com/user/<id>`). |
| `PLAYSET_COOKIE_SECRET` | yes | At least 32 characters, e.g. `openssl rand -hex 32` |
| `PLAYSET_WEB_PORT` | no (3000) | Port the server listens on (127.0.0.1 only) |
| `PLAYSET_WEB_DATA` | no (`./data/playset.db`) | SQLite file for playlist records, usage and the Host token (created owner-only) |
| `PLAYSET_PREVIEW_LIMIT` | no (30) | Previews per Visitor address per hour |
| `PLAYSET_CREATE_LIMIT` | no (10) | Creates/updates per Visitor address per hour |
| `PLAYSET_DAILY_LIMIT` | no (200) | Playlists made per UTC day, by everyone |
| `PLAYSET_TRUST_PROXY` | no (0) | `1` when running behind a reverse proxy that sets `X-Forwarded-*` |

A missing or invalid value stops the server at startup with a line naming it.

### 2. Start

```sh
npm run web
```

This builds the client into `dist/web` and starts the server at <http://127.0.0.1:3000>.

### 3. Connect the Host Account

Until the Host Account is connected, Visitors can search and open Setlists, but previews and new playlists show "temporarily unavailable".

1. Open <http://127.0.0.1:3000/admin>.
2. Choose **Log in with Spotify** and log in as the Host Account (`PLAYSET_HOST_SPOTIFY_ID`). Any other account is refused.
3. The admin page now shows the Host Account as connected, the config check, and usage. The server keeps the token in the data file and refreshes it itself; use **Reconnect** if Spotify ever ends the login.

### Working on the client

Run the server (`npm run web`) and, in a second terminal, the Vite dev server with hot reload:

```sh
npm run web:dev
```

It forwards `/api` and `/admin` to the server on `PLAYSET_WEB_PORT`.

## Development

| Command | What it does |
|---|---|
| `npm test` | All tests (Vitest; no network) |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | oxlint |
| `npm run build` | CLI bundle (`dist/cli.js`) and web client (`dist/web`) |

How the code is organised and the agreed product rules are in [`CLAUDE.md`](CLAUDE.md); the feature specs are in [`docs/prd/`](docs/prd/).
