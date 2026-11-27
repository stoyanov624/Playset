import { PlaysetError } from "../http/index.js";

/** The Setlist Playlist description would exceed Spotify's limit; it is never shortened (that would break the setlist.fm link). */
export class DescriptionTooLongError extends PlaysetError {
  readonly descriptionLength: number;
  readonly limit: number;

  constructor(descriptionLength: number, limit: number) {
    super(
      `The Setlist Playlist description would be ${descriptionLength} characters, over Spotify's ${limit}-character limit. ` +
        "It is not shortened because that would break the setlist.fm link.",
    );
    this.descriptionLength = descriptionLength;
    this.limit = limit;
  }
}

/** There are no Matches, so no (empty) Setlist Playlist is created, nor an existing one emptied. */
export class NothingToAddError extends PlaysetError {
  constructor(message = "There are no Matches to add, so no Setlist Playlist was created.") {
    super(message);
  }
}

/** Why a playlist request failed, in words: the cause's own message when it is an Error. */
function reasonOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/** Spotify answered a playlist request with a non-success status, or could not be reached. */
export class SpotifyPlaylistError extends PlaysetError {
  readonly status?: number;

  constructor(message: string, options: { status?: number | undefined; cause?: unknown } = {}) {
    super(message, { cause: options.cause });
    if (options.status !== undefined) this.status = options.status;
  }
}

/**
 * A playlist request failed before anything was written: `summary` says what was left unchanged, the
 * cause's message says why, and Spotify's status is kept so callers can tell a missing playlist apart.
 */
export function playlistRequestFailed(summary: string, cause: unknown): SpotifyPlaylistError {
    const status = cause instanceof SpotifyPlaylistError ? cause.status : undefined;
  return new SpotifyPlaylistError(`${summary} ${reasonOf(cause)}`, { status, cause });
}

/** Spotify kept answering HTTP 429 after every retry was used. */
export class PlaylistRateLimitError extends SpotifyPlaylistError {
  constructor(what: string, retries: number, options: { cause?: unknown } = {}) {
    super(`Spotify rate-limited the ${what} request (HTTP 429) after ${retries} retries.`, { status: 429, ...options });
  }
}

/** The Setlist Playlist was created, but adding its tracks failed part-way. The playlist is left as it is. */
export class PartlyCreatedPlaylistError extends PlaysetError {
  readonly playlistId: string;
  readonly shareUrl: string;
  readonly tracksAdded: number;
  readonly totalMatches: number;
  override readonly cause: unknown;

  constructor(details: { playlistId: string; shareUrl: string; tracksAdded: number; totalMatches: number; cause: unknown }) {
    super(
      `The Setlist Playlist was partly created: ${details.tracksAdded} of ${details.totalMatches} tracks were added ` +
        `before Spotify failed (${reasonOf(details.cause)}). It was left as it is: ${details.shareUrl}`,
      { cause: details.cause },
    );
    this.playlistId = details.playlistId;
    this.shareUrl = details.shareUrl;
    this.tracksAdded = details.tracksAdded;
    this.totalMatches = details.totalMatches;
    this.cause = details.cause;
  }
}

/**
 * The Setlist Playlist's tracks were replaced, but a later request of the update failed. Trying again is
 * safe, because an update replaces every track rather than adding to them.
 */
export class PartlyUpdatedPlaylistError extends PlaysetError {
  readonly playlistId: string;
  readonly shareUrl: string;
  readonly tracksWritten: number;
  readonly totalMatches: number;
  override readonly cause: unknown;

  constructor(details: { playlistId: string; shareUrl: string; tracksWritten: number; totalMatches: number; cause: unknown }) {
    super(
      `The Setlist Playlist was partly updated: ${details.tracksWritten} of ${details.totalMatches} tracks were written ` +
        `before Spotify failed (${reasonOf(details.cause)}). It was left as it is: ${details.shareUrl}`,
      { hint: "Try the update again: it replaces every track, so nothing is added twice.", cause: details.cause },
    );
    this.playlistId = details.playlistId;
    this.shareUrl = details.shareUrl;
    this.tracksWritten = details.tracksWritten;
    this.totalMatches = details.totalMatches;
    this.cause = details.cause;
  }
}
