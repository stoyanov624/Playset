// Slice 3: find the Match for one Performance (PRD 0003).
export type { Match, MatchablePerformance, MatchOutcome, Miss, SpotifyTrack, TrackSearch } from "./types";
export { matchPerformance } from "./match-performance";
export { createSpotifyTrackSearch, type SpotifyTrackSearchOptions } from "./spotify-track-search";
export { SpotifySearchError, SpotifySearchRateLimitError } from "./errors";
