/** No setlist.fm API key in the environment or the config file. */
export class MissingSetlistFmApiKeyError extends Error {
  override name = "MissingSetlistFmApiKeyError";
  /** User-facing hint: where to get a key and where to put it. */
  readonly hint: string;

  constructor(configFile: string) {
    super("No setlist.fm API key found.");
    this.hint =
      "Get a setlist.fm API key at https://www.setlist.fm/settings/api, then either set the " +
      `SETLISTFM_API_KEY environment variable or add "setlistfmApiKey" to ${configFile}.`;
  }
}

/** setlist.fm kept answering HTTP 429 after all retries. */
export class SetlistFmRateLimitError extends Error {
  override name = "SetlistFmRateLimitError";
  constructor(attempts: number) {
    super(`setlist.fm is rate limiting requests (HTTP 429 after ${attempts} attempts). Try again in a moment.`);
  }
}

/** setlist.fm answered with an unexpected status, or the request failed on the network. */
export class SetlistFmRequestError extends Error {
  override name = "SetlistFmRequestError";
  /** HTTP status; undefined on a network error. */
  readonly status?: number;

  constructor(path: string, status?: number) {
    super(
      status === undefined
        ? `Request to setlist.fm (${path}) failed: network error.`
        : `Request to setlist.fm (${path}) failed with HTTP ${status}.`,
    );
    if (status !== undefined) this.status = status;
  }
}

/** No Setlist with the given setlist.fm id. */
export class SetlistNotFoundError extends Error {
  override name = "SetlistNotFoundError";
  constructor(readonly setlistId: string) {
    super(`No setlist.fm Setlist with id "${setlistId}".`);
  }
}

/** setlist.fm knows no Artist by the typed name. */
export class ArtistNotFoundError extends Error {
  override name = "ArtistNotFoundError";
  constructor(readonly artistName: string) {
    super(`No Artist named "${artistName}" found on setlist.fm.`);
  }
}

/** The chooser cancelled instead of picking an Artist. */
export class ArtistChoiceCancelledError extends Error {
  override name = "ArtistChoiceCancelledError";
  constructor() {
    super("Choosing the Artist was cancelled.");
  }
}

/** No Setlist with at least one Performance among the Artist's recent setlists. */
export class NoSetlistError extends Error {
  override name = "NoSetlistError";
  constructor(readonly artistName: string) {
    super(`No played Setlist found on setlist.fm for ${artistName}.`);
  }
}
