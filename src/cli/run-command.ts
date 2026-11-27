// One run of `playset` for a set of arguments, shared by the command line and the shell.
import {
  ArtistChoiceCancelledError,
  PartlyCreatedPlaylistError,
  PlaysetError,
  RunCancelledError,
  RunInputError,
  SetlistLinkError,
  runPlayset,
  type Miss,
  type RunOptions,
  type RunOutcome,
} from "../core/index.js";
import type { CliIo } from "./main.js";
import { INCOMPLETE_NOTE, createTerminalFrontEnd, missLine, plural, type WriteLine } from "./terminal-front-end.js";

export const EXIT_OK = 0;
export const EXIT_ERROR = 1;
export const EXIT_USAGE = 2;
export const EXIT_CANCELLED = 130;

export interface RunCommandHow {
  /** Prints a usage problem; returns the exit code to report. */
  usageError(message: string): number;
}

/** Runs Playset for the words and options of one command line; resolves to its exit code. */
export async function runCommand(words: string[], options: RunOptions, io: CliIo, how: RunCommandHow): Promise<number> {
  const out: WriteLine = (line = "") => io.stdout.write(`${line}\n`);
  const err: WriteLine = (line = "") => io.stderr.write(`${line}\n`);

  // Ctrl-C outside a prompt (e.g. while waiting for the Spotify login) cancels the run.
  const cancel = new AbortController();
  const removeInterruptHandler = io.onInterrupt?.(() => cancel.abort());

  try {
    const outcome = await runPlayset({
      input: words.join(" "),
      options,
      frontEnd: createTerminalFrontEnd(io, out),
      services: io.services,
      signal: cancel.signal,
    });
    return reportOutcome(outcome, out, err);
  } catch (error) {
    if (isCancellation(error)) {
      err("Cancelled.");
      return EXIT_CANCELLED;
    }
    if (error instanceof RunInputError || error instanceof SetlistLinkError) return how.usageError(error.message);
    return reportError(error, io.env.PLAYSET_DEBUG === "1", out, err);
  } finally {
    removeInterruptHandler?.();
  }
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

  if (error instanceof PlaysetError) {
    err(error.message);
    if (error.hint !== undefined) err(error.hint);
  } else {
    err(`Something went wrong: ${error instanceof Error ? error.message : String(error)}`);
    if (!debug) err("Set PLAYSET_DEBUG=1 to see the details.");
  }
  if (debug) err(detailsOf(error));
  return EXIT_ERROR;
}

function isCancellation(error: unknown): boolean {
  return (
    error instanceof RunCancelledError ||
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
