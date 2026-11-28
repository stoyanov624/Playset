import { Search } from "lucide-react";
import type { ApiCallError } from "../api/index.js";
import { AlertActions } from "./AlertActions.js";
import { AlertBox } from "./AlertBox.js";
import { Heading } from "./Heading.js";
import { LinkButton } from "./LinkButton.js";
import { RetryControl } from "./RetryControl.js";

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
      <AlertBox tone="caution" title={<Heading level={headingLevel} focusWhen>Playlist creation is temporarily unavailable</Heading>}>
        <p>{error.hint ?? error.message}</p>
        <AlertActions>
          <LinkButton to={way.to} state={way.state} variant="secondary">
            {way.label}
          </LinkButton>
        </AlertActions>
      </AlertBox>
    );
  }
  return (
    <AlertBox tone="caution" title={<Heading level={headingLevel} focusWhen>{error.message}</Heading>}>
      {error.hint === undefined ? null : <p>{error.hint}</p>}
      {error.code === "NOT_FOUND" ? (
        <AlertActions>
          <LinkButton to="/" variant="secondary" icon={<Search size={20} aria-hidden="true" />}>
            Search for an Artist
          </LinkButton>
        </AlertActions>
      ) : (
        <RetryControl waitSeconds={error.code === "RATE_LIMITED" ? error.retryAfterSeconds : undefined} retrying={retrying} onRetry={onRetry} />
      )}
    </AlertBox>
  );
}
