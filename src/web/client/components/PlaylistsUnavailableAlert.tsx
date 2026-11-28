import type { ReactNode } from "react";
import type { ApiCallError } from "../api/index.js";
import { AlertBox } from "./AlertBox.js";
import { Heading } from "./Heading.js";

export interface PlaylistsUnavailableAlertProps {
  error: ApiCallError;
  /** A screen error gets a focused heading at this level; an action error a plain, announced line. */
  headingLevel?: 1 | 2 | undefined;
  children?: ReactNode;
}

const TITLE = "Playlist creation is temporarily unavailable";

/** Setlist Playlists can't be made right now: the same words wherever a request learns it. */
export function PlaylistsUnavailableAlert({ error, headingLevel, children }: PlaylistsUnavailableAlertProps) {
  const title =
    headingLevel === undefined ? (
      <p>{TITLE}</p>
    ) : (
      <Heading level={headingLevel} focusWhen>
        {TITLE}
      </Heading>
    );
  return (
    <AlertBox tone="caution" announce={headingLevel === undefined} title={title}>
      <p>{error.hint ?? error.message}</p>
      {children}
    </AlertBox>
  );
}
