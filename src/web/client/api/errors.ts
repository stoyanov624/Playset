// Every way a call to Playset's server can fail, as one error the screens read by its code.
import type { ErrorCode } from "../../shared/index.js";

export interface ApiCallErrorFields {
  code: ErrorCode;
  message: string;
  hint?: string | undefined;
  /** Seconds the Visitor must wait before trying again, from a whole-seconds `Retry-After`. */
  retryAfterSeconds?: number | undefined;
}

/** A server error, or the API client's own words when there is no server error body to show. */
export class ApiCallError extends Error {
  readonly code: ErrorCode;
  readonly hint: string | undefined;
  readonly retryAfterSeconds: number | undefined;

  constructor(fields: ApiCallErrorFields) {
    super(fields.message);
    this.name = "ApiCallError";
    this.code = fields.code;
    this.hint = fields.hint;
    this.retryAfterSeconds = fields.retryAfterSeconds;
  }
}

/** No answer at all, or an answer that isn't JSON (a proxy's error page). */
export function noAnswerError(): ApiCallError {
  return new ApiCallError({
    code: "UPSTREAM_UNAVAILABLE",
    message: "Playset isn't answering right now.",
    hint: "Check your connection and try again in a minute.",
  });
}

/** An answer that isn't the contract's shape: a drift between server and client. */
export function driftedAnswerError(): ApiCallError {
  return new ApiCallError({
    code: "INTERNAL",
    message: "Something went wrong on our side.",
    hint: "Please try again in a minute.",
  });
}

/** The preview stream closed before its preview or error event. */
export function stoppedEarlyError(): ApiCallError {
  return new ApiCallError({
    code: "UPSTREAM_UNAVAILABLE",
    message: "The preview stopped before it finished.",
    hint: "Try again in a minute.",
  });
}

/** Whatever a call rejected with, as an error a screen can show without technical text. */
export function asApiCallError(error: unknown): ApiCallError {
  return error instanceof ApiCallError ? error : driftedAnswerError();
}
