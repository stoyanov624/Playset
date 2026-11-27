import { HttpError, createRequester, type Sleep } from "../http/index.js";
import { SpotifySearchError, SpotifySearchRateLimitError } from "./errors";
import type { SpotifyTrack, TrackSearch } from "./types";

const SEARCH_ENDPOINT = "https://api.spotify.com/v1/search";
/** The first request and up to 3 retries on HTTP 429. */
const MAX_ATTEMPTS = 4;

export interface SpotifyTrackSearchOptions {
  /** A Spotify access token supplied by the caller. */
  accessToken: string;
  /** Defaults to the global `fetch`. */
  fetch?: typeof fetch;
  /** Defaults to a `setTimeout`-based wait. */
  sleep?: Sleep;
}

interface SpotifySearchResponse {
  tracks?: { items?: SpotifyTrack[] };
}

/** A TrackSearch backed by Spotify's `GET /v1/search?type=track`, honouring `Retry-After` on 429. */
export function createSpotifyTrackSearch(options: SpotifyTrackSearchOptions): TrackSearch {
  const request = createRequester(
    { name: "Spotify search", maxAttempts: MAX_ATTEMPTS, secrets: () => [options.accessToken] },
    {
      ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
      ...(options.sleep === undefined ? {} : { sleep: options.sleep }),
    },
  );

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

      let response: Response;
      try {
        response = await request(url.toString(), init);
      } catch (err) {
        throw toSearchError(err, query);
      }
      const body = (await response.json()) as SpotifySearchResponse;
      return (body.tracks?.items ?? []).map(toSpotifyTrack);
    },
  };
}

function toSearchError(err: unknown, query: string): unknown {
  if (!(err instanceof HttpError)) return err;
  if (err.kind === "rate-limited") return new SpotifySearchRateLimitError(query, MAX_ATTEMPTS - 1, { cause: err });
  if (err.kind === "status") {
    return new SpotifySearchError(`Spotify search failed with HTTP ${err.status}: ${query}`, {
      status: err.status,
      cause: err,
    });
  }
  return new SpotifySearchError(`Could not reach Spotify for the search: ${query}`, { cause: err });
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
