// Test helpers for Slice 3 (matching). Not a test file itself.
// Payloads mirror the shape of Spotify `GET /v1/search?type=track` responses,
// trimmed to the fields matching uses.

export interface SpotifySearchItem {
  uri: string;
  id: string;
  name: string;
  artists: { name: string }[];
  album: { name: string };
}

export interface SpotifySearchPayload {
  tracks: { items: SpotifySearchItem[] };
}

export function track(
  id: string,
  name: string,
  artists: string | string[],
  album: string,
): SpotifySearchItem {
  const artistNames = Array.isArray(artists) ? artists : [artists];
  return {
    uri: `spotify:track:${id}`,
    id,
    name,
    artists: artistNames.map((artistName) => ({ name: artistName })),
    album: { name: album },
  };
}

export function payload(...items: SpotifySearchItem[]): SpotifySearchPayload {
  return { tracks: { items } };
}

export interface RecordedSearch {
  query: string;
  limit: number;
}

/**
 * A fake TrackSearch. Answers each query from a lookup table of Spotify-shaped
 * payloads (an unknown query gets an empty result list), and records every
 * search it receives in order.
 */
export function fakeTrackSearch(
  answers: Record<string, SpotifySearchPayload> = {},
  options: { failOn?: Record<string, Error> } = {},
) {
  const searches: RecordedSearch[] = [];
  return {
    searches,
    get queries(): string[] {
      return searches.map((s) => s.query);
    },
    async searchTracks(query: string, limit: number): Promise<SpotifySearchItem[]> {
      searches.push({ query, limit });
      const failure = options.failOn?.[query];
      if (failure) throw failure;
      return answers[query]?.tracks.items ?? [];
    },
  };
}
