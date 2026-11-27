// Where Setlist Playlists live on Spotify: the Web API addresses for the user's playlists, the playlist
// shape that both the duplicate check and the creation give back, and the share link anyone can open.

/** Every playlist request goes to this host; a link pointing anywhere else is never followed. */
export const SPOTIFY_HOST = "https://api.spotify.com/";
const SPOTIFY_API = `${SPOTIFY_HOST}v1`;

/** The current user's playlists: listed for the duplicate check, and where a new playlist is created. */
export const MY_PLAYLISTS_URL = `${SPOTIFY_API}/me/playlists`;

/** Where the Matches are added to a playlist (at most 100 per request). */
export function playlistItemsUrl(playlistId: string): string {
  return `${SPOTIFY_API}/playlists/${encodeURIComponent(playlistId)}/items`;
}

/** The link to share when Spotify did not give one. */
export function shareUrlFor(playlistId: string): string {
  return `https://open.spotify.com/playlist/${playlistId}`;
}

/** A playlist in the user's Spotify account. */
export interface SpotifyPlaylist {
  id: string;
  /** The name as Spotify gave it (not trimmed). */
  name: string;
  shareUrl: string;
}
