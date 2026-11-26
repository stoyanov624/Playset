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
import { runPlayset, type RunOutcome, type RunServices } from "../core/run/index.js";
import { USAGE_LINE, parseArgs } from "./args.js";
import { createTerminalFrontEnd, missLine, plural, type WriteLine } from "./terminal-front-end.js";

export interface CliIo {
  stdout: { write(text: string): unknown };
  stderr: { write(text: string): unknown };
  env: Record<string, string | undefined>;
  prompts: {
    select<T>(question: { message: string; choices: { name: string; value: T }[] }): Promise<T>;
    confirm(question: { message: string; default?: boolean }): Promise<boolean>;
  };
  /** Tries to open the URL in the default browser. May reject; the CLI ignores that. */
  openBrowser(url: string): Promise<void>;
  services: RunServices;
  /** Registers a Ctrl-C handler for when no prompt is active; returns a function that removes it. */
  onInterrupt?(handler: () => void): () => void;
}

export const EXIT_OK = 0;
export const EXIT_ERROR = 1;
export const EXIT_USAGE = 2;
export const EXIT_CANCELLED = 130;

/** The errors from PRDs 0001–0006 whose message is written for the concert-goer. */
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

export function browserCommandFor(platform: string): "open" | "xdg-open" | "start" {
  if (platform === "darwin") return "open";
  if (platform === "win32") return "start";
  return "xdg-open";
}

/** Runs `playset` with the given arguments (without `node` and the script); resolves to the exit code. */
export async function main(argv: string[], io: CliIo): Promise<number> {
  const out: WriteLine = (line = "") => io.stdout.write(`${line}\n`);
  const err: WriteLine = (line = "") => io.stderr.write(`${line}\n`);
  const usageError = (message: string) => {
    err(message);
    err(USAGE_LINE);
    return EXIT_USAGE;
  };

  const parsed = parseArgs(argv, (text) => io.stdout.write(text));
  if (parsed.kind === "done") return EXIT_OK;
  if (parsed.kind === "usage-error") return usageError(parsed.message);

  const { words, options } = parsed;
  const input = words.join(" ").trim();
  if (input === "") return usageError("Please give a setlist.fm link or an Artist name.");
  if (words.length > 1 && words.some(looksLikeSetlistFmLink)) {
    return usageError("Give either one setlist.fm link or an Artist name, not both.");
  }

  let removeInterruptHandler: (() => void) | undefined;
  const interrupted = new Promise<never>((_, reject) => {
    removeInterruptHandler = io.onInterrupt?.(() => reject(new InterruptedError()));
  });

  try {
    const run = runPlayset({ input, options, frontEnd: createTerminalFrontEnd(io, out), services: io.services });
    run.catch(() => {}); // It may still settle after a Ctrl-C has ended the run.
    return reportOutcome(await Promise.race([run, interrupted]), out, err);
  } catch (error) {
    if (isCancellation(error)) {
      err("Cancelled.");
      return EXIT_CANCELLED;
    }
    if (error instanceof SetlistLinkError) return usageError(error.message);
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
      out();
      out("Dry run: no playlist created.");
      return EXIT_OK;
    case "created":
      out();
      out(`Created "${outcome.playlist.name}" with ${plural(outcome.playlist.trackCount, "track")}.`);
      printMisses(outcome.misses, out);
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

function reportError(error: unknown, debug: boolean, out: WriteLine, err: WriteLine): number {
  if (error instanceof PartlyCreatedPlaylistError) {
    err(`The playlist was only partly created: ${error.tracksAdded} of ${error.totalMatches} tracks were added.`);
    if (error.cause instanceof Error) err(error.cause.message);
    if (debug) err(detailsOf(error));
    out(error.shareUrl);
    return EXIT_ERROR;
  }

  if (TYPED_ERRORS.some((type) => error instanceof type)) {
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
