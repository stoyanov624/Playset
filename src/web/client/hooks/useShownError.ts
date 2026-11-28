import { useState } from "react";
import { asApiCallError, type ApiCallError } from "../api/index.js";

export interface ShownError {
  error: ApiCallError;
  /** Changes with every new failure, so a countdown starts again for it. */
  key: number;
  /** "Try again" was activated and its request is pending. */
  retrying: boolean;
}

/**
 * Keeps the last failure on screen while "Try again" is pending (the request library forgets an
 * error once a new attempt starts), and drops it once a request is neither failing nor pending.
 */
export function useShownError(error: unknown, pending: boolean): ShownError | null {
  const [shown, setShown] = useState<{ raw: unknown; error: ApiCallError; key: number } | null>(null);
  if (error !== null && error !== undefined && shown?.raw !== error) {
    setShown({ raw: error, error: asApiCallError(error), key: (shown?.key ?? 0) + 1 });
  } else if ((error === null || error === undefined) && !pending && shown !== null) {
    setShown(null);
  }
  const current = error !== null && error !== undefined ? asApiCallError(error) : shown?.error;
  if (current === undefined) return null;
  return { error: current, key: shown?.key ?? 0, retrying: pending };
}
