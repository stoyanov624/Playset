// Core domain logic: Setlist → Performances → Matches → Setlist Playlist.
// Must stay free of CLI/terminal/Node-UI concerns so web and mobile front-ends can reuse it.
// Anything interactive (choosing an Artist, opting into Tapes, confirming) is requested from the caller.
export {
  SetlistLinkError,
  looksLikeSetlistFmLink,
  readSetlistId,
  type SetlistLinkErrorReason,
} from "./setlist-link/index.js";
export {
  listTapes,
  toPerformances,
  type NotedReason,
  type NotedSong,
  type Performance,
  type PerformancesResult,
  type SetlistFmSet,
  type SetlistFmSetlist,
  type SetlistFmSong,
  type Show,
} from "./performances/index.js";
export {
  createSpotifyTrackSearch,
  matchPerformance,
  type Match,
  type MatchablePerformance,
  type MatchOutcome,
  type Miss,
  type SpotifyTrack,
  type SpotifyTrackSearchOptions,
  type TrackSearch,
} from "./matching/index.js";
