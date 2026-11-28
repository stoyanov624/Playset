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
 * A new `scope` (another searched name, say) is another request, so the old failure is dropped
 * at once.
 */
export function useShownError(error: unknown, pending: boolean, scope?: string): ShownError | null {
  const [shown, setShown] = useState<{ raw: unknown; error: ApiCallError; key: number; scope: string | undefined } | null>(null);
  const kept = shown !== null && shown.scope === scope ? shown : null;
  if (error !== null && error !== undefined && shown?.raw !== error) {
    setShown({ raw: error, error: asApiCallError(error), key: (shown?.key ?? 0) + 1, scope });
  } else if ((error === null || error === undefined) && shown !== null && (!pending || kept === null)) {
    setShown(null);
  }
  const current = error !== null && error !== undefined ? asApiCallError(error) : kept?.error;
  if (current === undefined) return null;
  return { error: current, key: shown?.key ?? 0, retrying: pending };
}
