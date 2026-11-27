// One run of `playset` for a set of arguments (PRD 0007), shared by the command line and the shell (PRD 0009).
import {
  ArtistChoiceCancelledError,
  ArtistNotFoundError,
  AuthorizationError,
  DescriptionTooLongError,
  InvalidPortError,
  MissingClientIdError,
  MissingSetlistFmApiKeyError,
  NoSetlistError,
  NothingToAddError,
  PartlyCreatedPlaylistError,
  PortInUseError,
  RateLimitError,
  SetlistFmRateLimitError,
  SetlistFmRequestError,
  SetlistLinkError,
  SetlistNotFoundError,
  SpotifyPlaylistError,
  StateMismatchError,
  TokenError,
  looksLikeSetlistFmLink,
  type Miss,
} from "../core/index.js";
import { PlaysetError } from "../core/index.js";
import { runPlayset, type RunFrontEnd, type RunOptions, type RunOutcome, type RunServices } from "../core/run/index.js";
import type { CliIo } from "./main.js";
import { INCOMPLETE_NOTE, createTerminalFrontEnd, missLine, plural, type WriteLine } from "./terminal-front-end.js";

export const EXIT_OK = 0;
export const EXIT_ERROR = 1;
export const EXIT_USAGE = 2;
export const EXIT_CANCELLED = 130;

/** The errors from PRDs 0001–0006 whose message is written for the concert-goer (besides any PlaysetError). */
const TYPED_ERRORS = [
  SetlistLinkError,
  MissingSetlistFmApiKeyError,
  ArtistNotFoundError,
  NoSetlistError,
  SetlistNotFoundError,
  SetlistFmRateLimitError,
  SetlistFmRequestError,
  MissingClientIdError,
  InvalidPortError,
  PortInUseError,
  AuthorizationError,
  StateMismatchError,
  TokenError,
  RateLimitError,
  SpotifyPlaylistError,
  DescriptionTooLongError,
  NothingToAddError,
];

/** Ctrl-C outside a prompt (e.g. while waiting for the Spotify login). */
class InterruptedError extends Error {}

export interface RunCommandHow {
  /** Prints a usage problem; returns the exit code to report. */
  usageError(message: string): number;
  /**
   * Shell mode (PRD 0009 AC-16, AC-17): after Ctrl-C the run makes no further request and prints nothing more,
   * and once the create request is sent Ctrl-C no longer stops the run.
   */
  stopOnCancel: boolean;
}

/** Runs PRD 0007's flow for the words and options of one command line; resolves to its exit code. */
export async function runCommand(words: string[], options: RunOptions, io: CliIo, how: RunCommandHow): Promise<number> {
  const out: WriteLine = (line = "") => io.stdout.write(`${line}\n`);
  const err: WriteLine = (line = "") => io.stderr.write(`${line}\n`);

  const input = words.join(" ").trim();
  if (input === "") return how.usageError("Please give a setlist.fm link or an Artist name.");
  if (words.length > 1 && words.some(looksLikeSetlistFmLink)) {
    return how.usageError("Give either one setlist.fm link or an Artist name, not both.");
  }

  const state = { cancelled: false, createSent: false };
  let frontEnd = createTerminalFrontEnd(io, out);
  let services = io.services;
  if (how.stopOnCancel) {
    frontEnd = guardFrontEnd(frontEnd, state);
    services = guardServices(services, state);
  }

  let removeInterruptHandler: (() => void) | undefined;
  const interrupted = new Promise<never>((_, reject) => {
    removeInterruptHandler = io.onInterrupt?.(() => {
      if (how.stopOnCancel && state.createSent) return;
      state.cancelled = true;
      reject(new InterruptedError());
    });
  });

  try {
    const run = runPlayset({ input, options, frontEnd, services });
    run.catch(() => {}); // It may still settle after a Ctrl-C has ended the run.
    return reportOutcome(await Promise.race([run, interrupted]), out, err);
  } catch (error) {
    if (state.cancelled || isCancellation(error)) {
      err("Cancelled.");
      return EXIT_CANCELLED;
    }
    if (error instanceof SetlistLinkError) return how.usageError(error.message);
    return reportError(error, io.env.PLAYSET_DEBUG === "1", out, err);
  } finally {
    removeInterruptHandler?.();
  }
}

interface CancelState {
  cancelled: boolean;
  createSent: boolean;
}

/** After a Ctrl-C, every further question or report of the cancelled run fails instead of printing. */
function guardFrontEnd(frontEnd: RunFrontEnd, state: CancelState): RunFrontEnd {
  const guarded: Record<string, unknown> = {};
  for (const [name, method] of Object.entries(frontEnd) as [string, (...args: unknown[]) => unknown][]) {
    guarded[name] = (...args: unknown[]) => {
      if (state.cancelled) throw new InterruptedError();
      return method.apply(frontEnd, args);
    };
  }
  return guarded as unknown as RunFrontEnd;
}

/** After a Ctrl-C, no new setlist.fm or Spotify request starts; records when the create request is sent. */
function guardServices(services: RunServices, state: CancelState): RunServices {
  const unlessCancelled = <T>(call: () => Promise<T>): Promise<T> =>
    state.cancelled ? Promise.reject(new InterruptedError()) : call();
  return {
    getSetlist: (setlistId) => unlessCancelled(() => services.getSetlist(setlistId)),
    findLatestSetlistByArtistName: (name, chooser, options) =>
      unlessCancelled(() => services.findLatestSetlistByArtistName(name, chooser, options)),
    getAccessToken: (hooks) => unlessCancelled(() => services.getAccessToken(hooks)),
    findMatch: (performance, accessToken) => unlessCancelled(() => services.findMatch(performance, accessToken)),
    findPlaylistsNamed: (name, accessToken) => unlessCancelled(() => services.findPlaylistsNamed(name, accessToken)),
    createSetlistPlaylist: (show, matches, options) =>
      unlessCancelled(() => {
        state.createSent = true;
        return services.createSetlistPlaylist(show, matches, options);
      }),
  };
}

function reportOutcome(outcome: RunOutcome, out: WriteLine, err: WriteLine): number {
  switch (outcome.kind) {
    case "no-performances":
      err("This Setlist has no Performances yet, so there is nothing to add.");
      return EXIT_ERROR;
    case "nothing-to-add":
      err("Nothing to add: every Performance is a Tape that was left out.");
      return EXIT_ERROR;
    case "all-misses":
      out();
      out(`${plural(outcome.misses.length, "Miss", "Misses")}:`);
      for (const miss of outcome.misses) out(missLine(miss));
      err("No Match was found for any Performance, so no playlist was created.");
      return EXIT_ERROR;
    case "declined":
      out("No playlist created.");
      return EXIT_OK;
    case "dry-run":
      printMisses(outcome.misses, out);
      printIncompleteNote(outcome.incompleteStatus.isIncomplete, out);
      out();
      out("Dry run: no playlist created.");
      return EXIT_OK;
    case "created":
      out();
      out(`Created "${outcome.playlist.name}" with ${plural(outcome.playlist.trackCount, "track")}.`);
      printMisses(outcome.misses, out);
      printIncompleteNote(outcome.incompleteStatus.isIncomplete, out);
      out();
      out(outcome.playlist.shareUrl);
      return EXIT_OK;
  }
}

function printMisses(misses: Miss[], out: WriteLine): void {
  out();
  if (misses.length === 0) {
    out("Every Performance has a Match.");
    return;
  }
  out(`${plural(misses.length, "Miss", "Misses")} (not in the playlist):`);
  for (const miss of misses) out(missLine(miss));
}

function printIncompleteNote(isIncomplete: boolean, out: WriteLine): void {
  if (!isIncomplete) return;
  out();
  out(INCOMPLETE_NOTE);
}

function reportError(error: unknown, debug: boolean, out: WriteLine, err: WriteLine): number {
  if (error instanceof PartlyCreatedPlaylistError) {
    err(`The playlist was only partly created: ${error.tracksAdded} of ${error.totalMatches} tracks were added.`);
    if (error.cause instanceof Error) err(error.cause.message);
    if (debug) err(detailsOf(error));
    out(error.shareUrl);
    return EXIT_ERROR;
  }

  if (error instanceof PlaysetError || TYPED_ERRORS.some((type) => error instanceof type)) {
    const typed = error as Error & { hint?: unknown };
    err(typed.message);
    if (typeof typed.hint === "string") err(typed.hint);
  } else {
    err(`Something went wrong: ${error instanceof Error ? error.message : String(error)}`);
    if (!debug) err("Set PLAYSET_DEBUG=1 to see the details.");
  }
  if (debug) err(detailsOf(error));
  return EXIT_ERROR;
}

function isCancellation(error: unknown): boolean {
  return (
    error instanceof InterruptedError ||
    error instanceof ArtistChoiceCancelledError ||
    (error instanceof Error && error.name === "ExitPromptError")
  );
}

/** The stack trace and every underlying cause (only with PLAYSET_DEBUG=1). */
function detailsOf(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  for (let depth = 0; current !== undefined && current !== null && depth < 10; depth++) {
    const text = current instanceof Error ? (current.stack ?? `${current.name}: ${current.message}`) : String(current);
    parts.push(depth === 0 ? text : `Caused by: ${text}`);
    current = current instanceof Error ? current.cause : undefined;
  }
  return parts.join("\n");
}
