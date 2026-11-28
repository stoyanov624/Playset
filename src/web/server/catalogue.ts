// The server's fixed error catalogue: every error a Visitor can get, with its code, HTTP status and
// wording written for a Visitor. A core error's own message is written for the CLI (env names,
// commands), so it is never sent; each core error kind maps to one entry here.
import {
  DescriptionTooLongError,
  HttpError,
  MissingSetlistVersionError,
  NothingToAddError,
  PartlyCreatedPlaylistError,
  PartlyUpdatedPlaylistError,
  SetlistChangedError,
  SetlistFmRateLimitError,
  SetlistFmRequestError,
  SetlistNotFoundError,
  SpotifyPlaylistError,
  SpotifySearchError,
} from "../../core/index.js";
import type { ApiError, ErrorCode } from "../shared/index.js";

/** How an error is logged: not at all (the Visitor's own doing), as a warning, or as an error. */
type LogLevel = "none" | "warn" | "error";

export interface CatalogueEntry {
  code: ErrorCode;
  status: number;
  message: string;
  hint?: string;
  /** Fixed Retry-After seconds, for an upstream service that is busy. */
  retryAfter?: number;
  log: LogLevel;
}

const TRY_AGAIN = "Try again in a minute.";
/** setlist.fm's and Spotify's own Retry-After never reach the server through the core's errors. */
const UPSTREAM_WAIT_SECONDS = 60;

const entry = (
  code: ErrorCode,
  status: number,
  message: string,
  hint: string | undefined,
  log: LogLevel,
  retryAfter?: number,
): CatalogueEntry => ({
  code,
  status,
  message,
  ...(hint === undefined ? {} : { hint }),
  ...(retryAfter === undefined ? {} : { retryAfter }),
  log,
});

export const CATALOGUE = {
  artistNameInvalid: entry("INVALID_INPUT", 400, "Type an Artist name to search for.", "Use 1 to 200 characters.", "none"),
  setlistPageInvalid: entry("INVALID_INPUT", 400, "That Artist or page isn't valid.", "Search for the Artist again.", "none"),
  setlistLinkInvalid: entry(
    "INVALID_INPUT",
    400,
    "That isn't a setlist.fm Setlist link.",
    "Open the Setlist on setlist.fm and copy the link from the address bar. It ends in .html.",
    "none",
  ),
  setlistIdInvalid: entry(
    "INVALID_INPUT",
    400,
    "That Setlist id isn't valid.",
    "Open the Setlist from a search or a setlist.fm link.",
    "none",
  ),
  createBodyInvalid: entry("INVALID_INPUT", 400, "That request isn't valid.", "Load the preview again, then press Create.", "none"),
  bodyTooLarge: entry("INVALID_INPUT", 413, "That request is too large.", undefined, "none"),
  nothingToAdd: entry(
    "INVALID_INPUT",
    400,
    "None of the songs were found on Spotify, so there's nothing to put in a playlist.",
    "Pick another Show.",
    "none",
  ),
  descriptionTooLong: entry(
    "INVALID_INPUT",
    400,
    "Playset can't make a playlist for this Setlist.",
    "Its setlist.fm link is too long for a Spotify playlist description.",
    "none",
  ),
  setlistNotFound: entry(
    "NOT_FOUND",
    404,
    "setlist.fm has no Setlist with that id.",
    "Check the link, or search for the Artist instead.",
    "none",
  ),
  nothingHere: entry("NOT_FOUND", 404, "There's nothing here.", undefined, "none"),
  tooManyPreviews: entry(
    "RATE_LIMITED",
    429,
    "Too many previews from here in the last hour.",
    "Wait a little, then try again. Setlists that already have a preview stay free.",
    "none",
  ),
  tooManyPlaylists: entry(
    "RATE_LIMITED",
    429,
    "Too many playlists from here in the last hour.",
    "Wait a little, then try again.",
    "none",
  ),
  dailyLimitReached: entry(
    "RATE_LIMITED",
    429,
    "Playset has made as many playlists as it can today.",
    "Try again tomorrow. Playlists that already exist still open.",
    "none",
  ),
  setlistFmBusy: entry("RATE_LIMITED", 429, "setlist.fm is busy right now.", TRY_AGAIN, "warn", UPSTREAM_WAIT_SECONDS),
  spotifyBusy: entry("RATE_LIMITED", 429, "Spotify is busy right now.", TRY_AGAIN, "warn", UPSTREAM_WAIT_SECONDS),
  setlistFmDown: entry("UPSTREAM_UNAVAILABLE", 502, "setlist.fm isn't answering right now.", TRY_AGAIN, "error"),
  spotifyDown: entry("UPSTREAM_UNAVAILABLE", 502, "Spotify isn't answering right now.", TRY_AGAIN, "error"),
  partlyCreated: entry(
    "UPSTREAM_UNAVAILABLE",
    502,
    "Spotify stopped answering while the playlist was being filled.",
    "Try again in a minute. The same playlist will be filled.",
    "error",
  ),
  partlyUpdated: entry(
    "UPSTREAM_UNAVAILABLE",
    502,
    "Spotify stopped answering while the playlist was being updated.",
    "Try again in a minute. The same playlist will be updated.",
    "error",
  ),
  noVersion: entry(
    "UPSTREAM_UNAVAILABLE",
    502,
    "setlist.fm didn't send everything Playset needs for this Setlist.",
    "Try again in a few minutes.",
    "error",
  ),
  musicServiceBusy: entry(
    "RATE_LIMITED",
    429,
    "A music service Playset uses is busy right now.",
    TRY_AGAIN,
    "warn",
    UPSTREAM_WAIT_SECONDS,
  ),
  musicServiceDown: entry(
    "UPSTREAM_UNAVAILABLE",
    502,
    "A music service Playset uses isn't answering right now.",
    TRY_AGAIN,
    "error",
  ),
  playlistsUnavailable: entry(
    "PLAYLISTS_UNAVAILABLE",
    503,
    "Making playlists is unavailable right now.",
    "You can still search and open playlists that already exist. Try again later.",
    "warn",
  ),
  setlistChanged: entry(
    "SETLIST_CHANGED",
    409,
    "This Setlist was changed on setlist.fm after your preview.",
    "Load the fresh preview, then press Create again.",
    "none",
  ),
  internal: entry("INTERNAL", 500, "Something went wrong on our side.", "Please try again in a minute.", "error"),
} as const satisfies Record<string, CatalogueEntry>;

/**
 * An error the server itself answers with: a catalogue entry, a Retry-After it worked out (for Playset's
 * own limits), and the error behind it, kept for the log.
 */
export class VisitorError extends Error {
  readonly retryAfter?: number;

  constructor(
    readonly entry: CatalogueEntry,
    options: { retryAfter?: number; cause?: unknown } = {},
  ) {
    super(entry.message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "VisitorError";
    if (options.retryAfter !== undefined) this.retryAfter = options.retryAfter;
  }
}

/** A Spotify answer of 401 means the Host token no longer works, so making playlists is unavailable. */
function spotifyEntry(status: number | undefined): CatalogueEntry {
  if (status === 429) return CATALOGUE.spotifyBusy;
  if (status === 401) return CATALOGUE.playlistsUnavailable;
  return CATALOGUE.spotifyDown;
}

/** The catalogue entry of any error; an error no entry names is INTERNAL. */
export function catalogueEntryOf(error: unknown): CatalogueEntry {
  if (error instanceof VisitorError) return error.entry;
  if (error instanceof SetlistNotFoundError) return CATALOGUE.setlistNotFound;
  if (error instanceof SetlistFmRateLimitError) return CATALOGUE.setlistFmBusy;
  if (error instanceof SetlistFmRequestError) return CATALOGUE.setlistFmDown;
  if (error instanceof PartlyCreatedPlaylistError) return CATALOGUE.partlyCreated;
  if (error instanceof PartlyUpdatedPlaylistError) return CATALOGUE.partlyUpdated;
  if (error instanceof SpotifySearchError || error instanceof SpotifyPlaylistError) return spotifyEntry(error.status);
  if (error instanceof MissingSetlistVersionError) return CATALOGUE.noVersion;
  if (error instanceof NothingToAddError) return CATALOGUE.nothingToAdd;
  if (error instanceof DescriptionTooLongError) return CATALOGUE.descriptionTooLong;
  if (error instanceof SetlistChangedError) return CATALOGUE.setlistChanged;
  if (error instanceof HttpError) {
    if (error.kind === "rate-limited") return CATALOGUE.musicServiceBusy;
    if (error.kind === "status" || error.kind === "network") return CATALOGUE.musicServiceDown;
  }
  return CATALOGUE.internal;
}

/** The Retry-After seconds an error's answer carries, if it is a 429. */
export function retryAfterOf(error: unknown, entry: CatalogueEntry): number | undefined {
  if (error instanceof VisitorError && error.retryAfter !== undefined) return error.retryAfter;
  return entry.retryAfter;
}

/** The error as the Visitor sees it: the catalogue's code, message and hint, nothing else. */
export function apiErrorOf(entry: CatalogueEntry): ApiError {
  return { code: entry.code, message: entry.message, ...(entry.hint === undefined ? {} : { hint: entry.hint }) };
}
