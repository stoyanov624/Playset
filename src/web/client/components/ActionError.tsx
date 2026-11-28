import type { ApiCallError } from "../api/index.js";
import { AlertActions } from "./AlertActions.js";
import { AlertBox } from "./AlertBox.js";
import { Button } from "./Button.js";
import { PlaylistsUnavailableAlert } from "./PlaylistsUnavailableAlert.js";
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
    return <PlaylistsUnavailableAlert error={error} />;
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
        // The wait is only ever set on a rate-limit answer.
        <RetryControl waitSeconds={error.retryAfterSeconds} retrying={retrying} onRetry={onRetry} />
      )}
    </AlertBox>
  );
}
