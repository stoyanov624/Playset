// The Setlist Playlist on Spotify: its name and description, the duplicate check, creating it, and
// updating it in place.
export { setlistPlaylistDescription, setlistPlaylistName } from "./name.js";
export { findPlaylistsNamed, type ExistingPlaylist } from "./duplicate-check.js";
export {
  createSetlistPlaylist,
  type CreateSetlistPlaylistOptions,
  type CreatedSetlistPlaylist,
} from "./create-setlist-playlist.js";
export {
  updateSetlistPlaylist,
  type PlaylistToUpdate,
  type SetlistPlaylistUpdate,
} from "./update-setlist-playlist.js";
export type { SpotifyPlaylistOptions } from "./spotify-request.js";
export {
  DescriptionTooLongError,
  NothingToAddError,
  PartlyCreatedPlaylistError,
  PartlyUpdatedPlaylistError,
  PlaylistRateLimitError,
  SpotifyPlaylistError,
} from "./errors.js";
