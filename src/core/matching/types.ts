/** One Spotify track result, trimmed to the fields matching uses. */
export interface SpotifyTrack {
  uri: string;
  id: string;
  name: string;
  artists: { name: string }[];
  album: { name: string };
}

/** Runs a Spotify track search. Faked in tests; see `createSpotifyTrackSearch` for the real adapter. */
export interface TrackSearch {
  searchTracks(query: string, limit: number): Promise<SpotifyTrack[]>;
}

/** The Spotify track chosen to represent a Performance. */
export interface Match {
  kind: "match";
  uri: string;
  id: string;
  name: string;
  artists: string[];
  album: string;
  live: boolean;
}

/** A Performance with no Match, with every query that was tried. */
export interface Miss {
  kind: "miss";
  title: string;
  artist: string;
  originalArtist?: string;
  queries: string[];
}

export type MatchOutcome = Match | Miss;

/** The parts of a Performance that matching looks at. Anything else on the object is ignored. */
export interface MatchablePerformance {
  title: string;
  artist: string;
  originalArtist?: string | undefined;
}
