import type { ApiCallError } from "../api/index.js";
import { AlertActions } from "./AlertActions.js";
import { AlertBox } from "./AlertBox.js";
import { Heading } from "./Heading.js";
import { LinkButton } from "./LinkButton.js";
import { PlaylistsUnavailableAlert } from "./PlaylistsUnavailableAlert.js";
import { RetryControl } from "./RetryControl.js";
import { SearchLink } from "./SearchLink.js";

export interface ScreenErrorProps {
  error: ApiCallError;
  /** h1 when the screen has no other h1 yet, otherwise h2. */
  headingLevel: 1 | 2;
  retrying: boolean;
  onRetry: () => void;
  /** Where to go when playlists can't be made: back to the Setlist list, or a new search. */
  elsewhere?: { to: string; label: string; state?: unknown } | undefined;
}

/** An error that ends a screen's main request, shown in place of its content with focus on its heading. */
export function ScreenError({ error, headingLevel, retrying, onRetry, elsewhere }: ScreenErrorProps) {
  if (error.code === "PLAYLISTS_UNAVAILABLE") {
    const way = elsewhere ?? { to: "/", label: "Search for an Artist" };
    return (
      <PlaylistsUnavailableAlert error={error} headingLevel={headingLevel}>
        <AlertActions>
          <LinkButton to={way.to} state={way.state} variant="secondary">
            {way.label}
          </LinkButton>
        </AlertActions>
      </PlaylistsUnavailableAlert>
    );
  }
  return (
    <AlertBox tone="caution" title={<Heading level={headingLevel} focusWhen>{error.message}</Heading>}>
      {error.hint === undefined ? null : <p>{error.hint}</p>}
      {error.code === "NOT_FOUND" ? (
        <AlertActions>
          <SearchLink />
        </AlertActions>
      ) : (
        // The wait is only ever set on a rate-limit answer.
        <RetryControl waitSeconds={error.retryAfterSeconds} retrying={retrying} onRetry={onRetry} />
      )}
    </AlertBox>
  );
}
