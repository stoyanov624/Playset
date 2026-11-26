import type { SpotifyTrack, TrackSearch } from "./types";

const SEARCH_ENDPOINT = "https://api.spotify.com/v1/search";
const MAX_RATE_LIMIT_RETRIES = 3;
const DEFAULT_RETRY_AFTER_SECONDS = 1;

export interface SpotifyTrackSearchOptions {
  /** A Spotify access token supplied by the caller. */
  accessToken: string;
  /** Defaults to the global `fetch`. */
  fetch?: typeof fetch;
  /** Defaults to a `setTimeout`-based wait. */
  sleep?: (ms: number) => Promise<void>;
}

interface SpotifySearchResponse {
  tracks?: { items?: SpotifyTrack[] };
}

/** A TrackSearch backed by Spotify's `GET /v1/search?type=track`, honouring `Retry-After` on 429. */
export function createSpotifyTrackSearch(options: SpotifyTrackSearchOptions): TrackSearch {
  const doFetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  return {
    async searchTracks(query: string, limit: number): Promise<SpotifyTrack[]> {
      const url = new URL(SEARCH_ENDPOINT);
      url.searchParams.set("q", query);
      url.searchParams.set("type", "track");
      url.searchParams.set("limit", String(limit));
      const init: RequestInit = {
        method: "GET",
        headers: { Authorization: `Bearer ${options.accessToken}`, Accept: "application/json" },
      };

      for (let retries = 0; ; retries++) {
        const response = await doFetch(url.toString(), init);
        if (response.status === 429) {
          if (retries >= MAX_RATE_LIMIT_RETRIES) {
            throw new Error(`Spotify rate-limited the search after ${MAX_RATE_LIMIT_RETRIES} retries: ${query}`);
          }
          await sleep(retryAfterSeconds(response.headers.get("Retry-After")) * 1000);
          continue;
        }
        if (!response.ok) {
          throw new Error(`Spotify search failed with HTTP ${response.status}: ${query}`);
        }
        const body = (await response.json()) as SpotifySearchResponse;
        return (body.tracks?.items ?? []).map(toSpotifyTrack);
      }
    },
  };
}

function retryAfterSeconds(header: string | null): number {
  const value = header?.trim() ?? "";
  return /^\d+(\.\d+)?$/.test(value) ? Number(value) : DEFAULT_RETRY_AFTER_SECONDS;
}

function toSpotifyTrack(item: SpotifyTrack): SpotifyTrack {
  return {
    uri: item.uri,
    id: item.id,
    name: item.name,
    artists: item.artists.map((artist) => ({ name: artist.name })),
    album: { name: item.album.name },
  };
}
