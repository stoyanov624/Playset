import { PlaysetError } from "../http/index.js";

/** Spotify's track search failed: an unexpected status, or Spotify could not be reached. */
export class SpotifySearchError extends PlaysetError {
  /** HTTP status; undefined when Spotify could not be reached. */
  readonly status?: number;

  constructor(message: string, options: { status?: number | undefined; cause?: unknown } = {}) {
    super(message, { cause: options.cause });
    if (options.status !== undefined) this.status = options.status;
  }
}

/** Spotify kept answering the search with HTTP 429 after every retry was used. */
export class SpotifySearchRateLimitError extends SpotifySearchError {
  constructor(query: string, retries: number, options: { cause?: unknown } = {}) {
    super(`Spotify rate-limited the search after ${retries} retries: ${query}`, { status: 429, ...options });
  }
}
