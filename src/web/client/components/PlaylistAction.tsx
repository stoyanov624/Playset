import { ListMusic } from "lucide-react";
import type { ShownError } from "../hooks/useShownError.js";
import { PLAYSET_SPOTIFY_ACCOUNT } from "../wording.js";
import { ActionError } from "./ActionError.js";
import { Button } from "./Button.js";
import styles from "./PlaylistAction.module.css";

export interface PlaylistActionProps {
  /** An outdated Setlist Playlist is updated in place; otherwise a new one is created. */
  update: boolean;
  matches: number;
  pending: boolean;
  error: ShownError | null;
  onSend: () => void;
  onRetry: () => void;
  onFreshPreview: () => void;
}

/** The one action of the preview, or why there is none. The verb stays the same through the flow. */
export function PlaylistAction({ update, matches, pending, error, onSend, onRetry, onFreshPreview }: PlaylistActionProps) {
  if (matches === 0) {
    return <p className={styles.line}>No songs matched, so there is nothing to put in a playlist.</p>;
  }
  if (error !== null) {
    return (
      <ActionError
        key={error.key}
        error={error.error}
        retrying={error.retrying}
        onRetry={onRetry}
        onFreshPreview={onFreshPreview}
      />
    );
  }
  const idle = update ? "Update playlist" : "Create playlist";
  const busy = update ? "Updating…" : "Creating…";
  return (
    <>
      <Button variant="primary" wide icon={<ListMusic size={20} aria-hidden="true" />} busy={pending} onActivate={onSend}>
        {pending ? busy : idle}
      </Button>
      <p className={styles.line}>
        {update ? "Replaces the songs in the same playlist" : `Public, in ${PLAYSET_SPOTIFY_ACCOUNT}`}
      </p>
    </>
  );
}
