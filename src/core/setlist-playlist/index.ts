// Slice 6: create the Setlist Playlist (PRD 0006).
export { setlistPlaylistDescription, setlistPlaylistName } from "./name.js";
export { findPlaylistsNamed, type ExistingPlaylist } from "./duplicate-check.js";
export {
  createSetlistPlaylist,
  type CreateSetlistPlaylistOptions,
  type CreatedSetlistPlaylist,
} from "./create-setlist-playlist.js";
export type { SpotifyPlaylistOptions } from "./spotify-request.js";
export {
  DescriptionTooLongError,
  NothingToAddError,
  PartlyCreatedPlaylistError,
  PlaylistRateLimitError,
  SpotifyPlaylistError,
} from "./errors.js";
