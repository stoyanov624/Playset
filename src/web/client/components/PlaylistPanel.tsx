import { CircleCheck } from "lucide-react";
import type { ReactNode } from "react";
import { CopyLinkButton } from "./CopyLinkButton.js";
import { Heading } from "./Heading.js";
import { NewTabLink } from "./NewTabLink.js";
import styles from "./PlaylistPanel.module.css";

export interface PlaylistPanelProps {
  title: string;
  url: string;
  children: ReactNode;
}

/** "Setlist Playlist ready", "Playlist created" or "Playlist updated", with the share link. */
export function PlaylistPanel({ title, url, children }: PlaylistPanelProps) {
  return (
    <section className={styles.panel}>
      <div className={styles.titleRow}>
        <CircleCheck size={20} aria-hidden="true" className={styles.icon} />
        <Heading level={2} className={styles.title} focusWhen>
          {title}
        </Heading>
      </div>
      {children}
      <div className={styles.actions}>
        <NewTabLink href={url} label="Open in Spotify" variant="primary" />
        <p className={styles.url}>{url}</p>
        <CopyLinkButton url={url} />
      </div>
    </section>
  );
}
