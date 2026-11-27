// The duplicate check: a warning, never a block, when the user already has a playlist with the Setlist
// Playlist name (for example from an earlier run for the same Show).
import { SpotifyPlaylistError } from "./errors.js";
import { MY_PLAYLISTS_URL, SPOTIFY_HOST, shareUrlFor, type SpotifyPlaylist } from "./spotify-playlist.js";
import { sendSpotifyRequest, type SpotifyPlaylistOptions } from "./spotify-request.js";

const FIRST_PAGE_URL = `${MY_PLAYLISTS_URL}?limit=50`;

/** A playlist in the user's list that already has the Setlist Playlist name. */
export type ExistingPlaylist = SpotifyPlaylist;

interface PlaylistPage {
  items?: Array<{ id?: string; name?: unknown; external_urls?: { spotify?: string } } | null>;
  next?: string | null;
}

/**
 * Pages through `GET /v1/me/playlists` and returns every playlist whose trimmed name equals the trimmed
 * `name` exactly (case- and dash-sensitive), in Spotify's order. Never blocks creating a Setlist Playlist.
 */
export async function findPlaylistsNamed(name: string, options: SpotifyPlaylistOptions): Promise<ExistingPlaylist[]> {
  const wanted = name.trim();
  if (!wanted) return [];

  const found: ExistingPlaylist[] = [];
  let url: string | null | undefined = FIRST_PAGE_URL;
  while (url) {
    if (!url.startsWith(SPOTIFY_HOST)) {
      throw new SpotifyPlaylistError(
        `Spotify's next page link points outside ${SPOTIFY_HOST}; it was not followed, so the duplicate check stopped.`,
      );
    }
    const page = ((await sendSpotifyRequest({ method: "GET", url, what: "list playlists" }, options)) ??
      {}) as PlaylistPage;
    for (const item of page.items ?? []) {
      if (!item || typeof item.name !== "string" || typeof item.id !== "string") continue;
      if (item.name.trim() !== wanted) continue;
      found.push({ id: item.id, name: item.name, shareUrl: item.external_urls?.spotify ?? shareUrlFor(item.id) });
    }
    url = page.next;
  }
  return found;
}
