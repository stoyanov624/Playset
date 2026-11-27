export interface PlaysetErrorOptions {
  /** User-facing advice on what to do next. */
  hint?: string | undefined;
  /** The underlying error, kept for debugging. */
  cause?: unknown;
}

/**
 * The base of every Playset error: a message written for the concert-goer, an optional hint and an optional
 * cause. Its `name` is the concrete subclass's name, with no per-class code.
 */
export class PlaysetError extends Error {
  readonly hint?: string;

  constructor(message: string, options: PlaysetErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    Object.defineProperty(this, "name", {
      value: new.target.name,
      writable: true,
      configurable: true,
      enumerable: false,
    });
    if (options.hint !== undefined) this.hint = options.hint;
  }
}

/** What went wrong with one HTTP request. */
export type HttpErrorKind = "rate-limited" | "status" | "network" | "refused-url";

/** A request failed: still rate-limited after every attempt, an unexpected status, a network failure, or a refused URL. */
export class HttpError extends PlaysetError {
  readonly kind: HttpErrorKind;
  /** HTTP status; undefined for "network" and "refused-url". */
  readonly status?: number;

  constructor(message: string, details: { kind: HttpErrorKind; status?: number | undefined; cause?: unknown }) {
    super(message, { cause: details.cause });
    this.kind = details.kind;
    if (details.status !== undefined) this.status = details.status;
  }
}
