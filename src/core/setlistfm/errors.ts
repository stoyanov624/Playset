import { PlaysetError } from "../http/index.js";

/** No setlist.fm API key in the environment or the config file. */
export class MissingSetlistFmApiKeyError extends PlaysetError {
  /** User-facing hint: where to get a key and where to put it. */
  declare readonly hint: string;

  constructor(configFile: string) {
    super("No setlist.fm API key found.", {
      hint:
        "Get a setlist.fm API key at https://www.setlist.fm/settings/api, then either set the " +
        `SETLISTFM_API_KEY environment variable or add "setlistfmApiKey" to ${configFile}.`,
    });
  }
}

/** setlist.fm kept answering HTTP 429 after all retries. */
export class SetlistFmRateLimitError extends PlaysetError {
  constructor(attempts: number, options: { cause?: unknown } = {}) {
    super(
      `setlist.fm is rate limiting requests (HTTP 429 after ${attempts} attempts). Try again in a moment.`,
      options,
    );
  }
}

/** setlist.fm answered with an unexpected status, or the request failed on the network. */
export class SetlistFmRequestError extends PlaysetError {
  /** HTTP status; undefined on a network error. */
  readonly status?: number;

  constructor(path: string, status?: number, options: { cause?: unknown } = {}) {
    super(
      status === undefined
        ? `Request to setlist.fm (${path}) failed: network error.`
        : `Request to setlist.fm (${path}) failed with HTTP ${status}.`,
      options,
    );
    if (status !== undefined) this.status = status;
  }
}

/** No Setlist with the given setlist.fm id. */
export class SetlistNotFoundError extends PlaysetError {
  constructor(readonly setlistId: string) {
    super(`No setlist.fm Setlist with id "${setlistId}".`);
  }
}

/** setlist.fm knows no Artist by the typed name. */
export class ArtistNotFoundError extends PlaysetError {
  constructor(readonly artistName: string) {
    super(`No Artist named "${artistName}" found on setlist.fm.`);
  }
}

/** The chooser cancelled instead of picking an Artist. */
export class ArtistChoiceCancelledError extends PlaysetError {
  constructor() {
    super("Choosing the Artist was cancelled.");
  }
}

/** No Setlist with at least one Performance among the Artist's recent setlists. */
export class NoSetlistError extends PlaysetError {
  constructor(readonly artistName: string) {
    super(`No played Setlist found on setlist.fm for ${artistName}.`);
  }
}
