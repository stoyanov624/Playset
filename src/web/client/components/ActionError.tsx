import type { ApiCallError } from "../api/index.js";
import { AlertActions } from "./AlertActions.js";
import { AlertBox } from "./AlertBox.js";
import { Button } from "./Button.js";
import { RetryControl } from "./RetryControl.js";

export interface ActionErrorProps {
  error: ApiCallError;
  retrying: boolean;
  onRetry: () => void;
  /** Offered when the Setlist changed since its preview. */
  onFreshPreview?: () => void;
}

/** An error on a button's request (Load more, Create, Update), shown in that button's place; focus stays. */
export function ActionError({ error, retrying, onRetry, onFreshPreview }: ActionErrorProps) {
  if (error.code === "PLAYLISTS_UNAVAILABLE") {
    return (
      <AlertBox tone="caution" announce title={<p>Playlist creation is temporarily unavailable</p>}>
        <p>{error.hint ?? error.message}</p>
      </AlertBox>
    );
  }
  const changed = error.code === "SETLIST_CHANGED";
  const final = error.code === "INVALID_INPUT" || error.code === "NOT_FOUND";
  return (
    <AlertBox tone={changed ? "info" : "caution"} announce title={<p>{error.message}</p>}>
      {error.hint === undefined ? null : <p>{error.hint}</p>}
      {changed && onFreshPreview ? (
        <AlertActions>
          <Button variant="primary" onActivate={onFreshPreview}>
            Load fresh preview
          </Button>
        </AlertActions>
      ) : null}
      {changed || final ? null : (
        <RetryControl waitSeconds={error.code === "RATE_LIMITED" ? error.retryAfterSeconds : undefined} retrying={retrying} onRetry={onRetry} />
      )}
    </AlertBox>
  );
}
