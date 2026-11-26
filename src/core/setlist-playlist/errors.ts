/** The Setlist Playlist description would exceed Spotify's limit; it is never shortened (that would break the setlist.fm link). */
export class DescriptionTooLongError extends Error {
  readonly descriptionLength: number;
  readonly limit: number;

  constructor(descriptionLength: number, limit: number) {
    super(
      `The Setlist Playlist description would be ${descriptionLength} characters, over Spotify's ${limit}-character limit. ` +
        "It is not shortened because that would break the setlist.fm link.",
    );
    this.name = "DescriptionTooLongError";
    this.descriptionLength = descriptionLength;
    this.limit = limit;
  }
}

/** There are no Matches, so no (empty) Setlist Playlist is created. */
export class NothingToAddError extends Error {
  constructor() {
    super("There are no Matches to add, so no Setlist Playlist was created.");
    this.name = "NothingToAddError";
  }
}

/** Spotify answered a playlist request with a non-success status, or could not be reached. */
export class SpotifyPlaylistError extends Error {
  readonly status?: number;

  constructor(message: string, options: { status?: number | undefined; cause?: unknown } = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "SpotifyPlaylistError";
    if (options.status !== undefined) this.status = options.status;
  }
}

/** Spotify kept answering HTTP 429 after every retry was used. */
export class PlaylistRateLimitError extends SpotifyPlaylistError {
  constructor(what: string, retries: number) {
    super(`Spotify rate-limited the ${what} request (HTTP 429) after ${retries} retries.`, { status: 429 });
    this.name = "PlaylistRateLimitError";
  }
}

/** The Setlist Playlist was created, but adding its tracks failed part-way. The playlist is left as it is. */
export class PartlyCreatedPlaylistError extends Error {
  readonly playlistId: string;
  readonly shareUrl: string;
  readonly tracksAdded: number;
  readonly totalMatches: number;
  override readonly cause: unknown;

  constructor(details: { playlistId: string; shareUrl: string; tracksAdded: number; totalMatches: number; cause: unknown }) {
    const reason = details.cause instanceof Error ? details.cause.message : String(details.cause);
    super(
      `The Setlist Playlist was partly created: ${details.tracksAdded} of ${details.totalMatches} tracks were added ` +
        `before Spotify failed (${reason}). It was left as it is: ${details.shareUrl}`,
      { cause: details.cause },
    );
    this.name = "PartlyCreatedPlaylistError";
    this.playlistId = details.playlistId;
    this.shareUrl = details.shareUrl;
    this.tracksAdded = details.tracksAdded;
    this.totalMatches = details.totalMatches;
    this.cause = details.cause;
  }
}
