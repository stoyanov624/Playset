// The Playset core for any front-end: one run from a setlist.fm link or Artist name to a Setlist Playlist,
// the real setlist.fm and Spotify services behind it, the settings stores, and every error a run can raise.
// No terminal or UI code lives here; every question to the user goes through the injected RunFrontEnd.
export {
  RunCancelledError,
  RunInputError,
  createRunServices,
  runPlayset,
  type CompleteSetlistOffer,
  type CreatedPlaylist,
  type MatchProgress,
  type NotAdded,
  type NotAddedSong,
  type NotAddedUnknownSong,
  type PlaylistLink,
  type Preview,
  type PreviewRow,
  type RunFrontEnd,
  type RunOptions,
  type RunOutcome,
  type RunRequest,
  type RunServices,
  type RunServicesDeps,
  type ShowSummary,
} from "./run/index.js";
export {
  SetlistLinkError,
  looksLikeSetlistFmLink,
  readSetlistId,
  type SetlistLinkErrorReason,
} from "./setlist-link/index.js";
export type { IncompleteStatus, Performance, SetlistFmSetlist, Show } from "./performances/index.js";
export {
  SpotifySearchError,
  SpotifySearchRateLimitError,
  type Match,
  type MatchOutcome,
  type Miss,
} from "./matching/index.js";
export {
  AccessDeniedError,
  AuthorizationError,
  InvalidPortError,
  MissingClientIdError,
  PortInUseError,
  RateLimitError,
  StateMismatchError,
  TokenError,
  startLoopbackReceiver,
  type AuthorizationResult,
  type CallbackReceiver,
} from "./spotify-auth/index.js";
export {
  DescriptionTooLongError,
  NothingToAddError,
  PartlyCreatedPlaylistError,
  PlaylistRateLimitError,
  SpotifyPlaylistError,
  type CreatedSetlistPlaylist,
  type ExistingPlaylist,
} from "./setlist-playlist/index.js";
export {
  ArtistChoiceCancelledError,
  ArtistNotFoundError,
  MissingSetlistFmApiKeyError,
  NoSetlistError,
  SetlistFmRateLimitError,
  SetlistFmRequestError,
  SetlistNotFoundError,
  type ArtistCandidate,
  type ArtistChooser,
  type LatestSetlistLookup,
  type LatestSetlistOptions,
} from "./setlistfm/index.js";
export {
  createFileSettingsStore,
  createMemorySettingsStore,
  type Env,
  type Settings,
  type SettingsStore,
  type SpotifyTokens,
} from "./settings/index.js";
export {
  HttpError,
  PlaysetError,
  type FetchLike,
  type HttpErrorKind,
  type PlaysetErrorOptions,
  type Sleep,
} from "./http/index.js";
