// The server log: no access log and no Visitor address; failures are logged with their cause chain,
// every secret replaced by [redacted]. Each failure is logged once, even when several Visitors share it.
import { VisitorError, type CatalogueEntry } from "./catalogue.js";

export interface Logger {
  info(message: string, details?: unknown): void;
  warn(message: string, details?: unknown): void;
  error(message: string, details?: unknown): void;
}

const REDACTED = "[redacted]";

/**
 * Spotify access tokens start with "BQ". A Host token source that fails while refreshing may name a token
 * the server was never given, so token-shaped words are redacted too, as is anything sent as a bearer.
 */
const TOKEN_SHAPED = [/\bBQ[A-Za-z0-9_-]{6,}/g, /\bBearer\s+\S+/gi];

/** Replaces every secret the server knows (and every token-shaped word) with [redacted]. */
export function createRedactor(secrets: () => Iterable<string>): (text: string) => string {
  return (text) => {
    let redacted = text;
    for (const secret of secrets()) {
      if (secret !== "") redacted = redacted.split(secret).join(REDACTED);
    }
    for (const pattern of TOKEN_SHAPED) redacted = redacted.replace(pattern, REDACTED);
    return redacted;
  };
}

const MAX_CAUSE_DEPTH = 8;

/**
 * An error as text for the log: its name, message, hint and (with `stacks`) stack, then each cause in turn.
 */
function describe(error: unknown, stacks: boolean, depth = 0): string {
  if (depth > MAX_CAUSE_DEPTH) return "";
  if (!(error instanceof Error)) return String(error);
  const hint = (error as { hint?: unknown }).hint;
  const lines = [
    `${error.name}: ${error.message}`,
    ...(typeof hint === "string" ? [`hint: ${hint}`] : []),
    ...(stacks ? [error.stack ?? ""] : []),
  ];
  if (error.cause !== undefined) lines.push(`caused by: ${describe(error.cause, stacks, depth + 1)}`);
  return lines.join("\n");
}

export interface FailureLog {
  /** Logs a failure answered with `entry`, at the entry's level, once per error object. */
  failure(error: unknown, entry: CatalogueEntry): void;
  /** Logs a preview run that stopped because every Visitor watching it left. */
  cancelled(error: unknown): void;
  /** Logs an unexpected failure (a bug, a broken store) of a preview whose Visitor had already left. */
  failedAfterLeaving(error: unknown): void;
  /** Logs a usage event that couldn't be saved; the Visitor's playlist exists all the same. */
  eventNotRecorded(error: unknown): void;
}

export function createFailureLog(logger: Logger, redact: (text: string) => string): FailureLog {
  const logged = new WeakSet<object>();

  /** The error the log is about: the server's own wrapper only adds the catalogue entry. */
  const underlying = (error: unknown): unknown => (error instanceof VisitorError ? error.cause : error);

  const write = (level: "info" | "warn" | "error", summary: string, error: unknown, stacks = true) => {
    if (typeof error === "object" && error !== null) {
      if (logged.has(error)) return;
      logged.add(error);
    }
    const first = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    logger[level](redact(`${summary}: ${first}`), redact(describe(error, stacks)));
  };

  return {
    failure(error, entry) {
      if (entry.log === "none") return;
      const cause = underlying(error);
      // A refusal the server made itself (such as "not connected") has nothing behind it to log.
      if (cause === undefined) return;
      write(entry.log, `Answered ${entry.code}`, cause);
    },
    cancelled(error) {
      write("info", "Preview stopped, nobody is watching it", error);
    },
    failedAfterLeaving(error) {
      // Nobody gets an answer, but a fault Playset didn't expect must still stand out in the log.
      write("warn", "Preview failed after the Visitor left", error);
    },
    eventNotRecorded(error) {
      // The Visitor's answer is unharmed and the store's message says what failed; no stack is needed.
      write("warn", "Usage event not recorded", error, false);
    },
  };
}
