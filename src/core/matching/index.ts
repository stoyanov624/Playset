// Matching: finding the Spotify track (the Match) for one Performance, or reporting a Miss.
export type { Match, MatchablePerformance, MatchOutcome, Miss, SpotifyTrack, TrackSearch } from "./types.js";
export { matchPerformance } from "./match-performance.js";
export { createSpotifyTrackSearch, type SpotifyTrackSearchOptions } from "./spotify-track-search.js";
export { SpotifySearchError, SpotifySearchRateLimitError } from "./errors.js";
