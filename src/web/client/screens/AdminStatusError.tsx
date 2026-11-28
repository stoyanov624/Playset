import { AlertBox } from "../components/AlertBox.js";
import { Heading } from "../components/Heading.js";
import { RetryControl } from "../components/RetryControl.js";
import type { ShownError } from "../hooks/useShownError.js";

/**
 * The status couldn't be read: the server's words, and "Try again" (locked during a rate-limit wait).
 * Key it by `shown.key` so each new failure mounts afresh: its heading takes focus again and any
 * countdown restarts.
 */
export function AdminStatusError({ shown, onRetry }: { shown: ShownError; onRetry: () => void }) {
  const { error } = shown;
  return (
    <AlertBox
      tone="caution"
      title={
        <Heading level={2} focusWhen>
          {error.message}
        </Heading>
      }
    >
      {error.hint === undefined ? null : <p>{error.hint}</p>}
      <RetryControl waitSeconds={error.retryAfterSeconds} retrying={shown.retrying} onRetry={onRetry} />
    </AlertBox>
  );
}
