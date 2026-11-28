// The one error handler: every error leaves as the catalogue's `{ error: { code, message, hint? } }` with
// its status (and Retry-After for a 429), and is logged at the catalogue entry's level.
import type { ErrorRequestHandler } from "express";
import { apiErrorOf, catalogueEntryOf, retryAfterOf } from "./catalogue.js";
import type { FailureLog } from "./logging.js";

export function createErrorHandler(log: FailureLog): ErrorRequestHandler {
  return (error: unknown, _req, res, _next) => {
    const entry = catalogueEntryOf(error);
    log.failure(error, entry);
    // A preview stream already answered 200; all that is left is to end it.
    if (res.headersSent) {
      res.end();
      return;
    }
    const retryAfter = retryAfterOf(error, entry);
    if (entry.status === 429 && retryAfter !== undefined) res.set("Retry-After", String(retryAfter));
    res.status(entry.status).json({ error: apiErrorOf(entry) });
  };
}
