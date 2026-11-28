import { ExternalLink } from "lucide-react";
import styles from "./button.module.css";
import type { ButtonVariant } from "./Button.js";
import { VisuallyHidden } from "./VisuallyHidden.js";

export interface NewTabLinkProps {
  href: string;
  label: string;
  variant: ButtonVariant;
}

/** A link into Spotify that opens a new tab and says so in its accessible name. */
export function NewTabLink({ href, label, variant }: NewTabLinkProps) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={[styles.button, styles[variant]].join(" ")}>
      <ExternalLink size={20} aria-hidden="true" />
      {label} <VisuallyHidden>(opens in a new tab)</VisuallyHidden>
    </a>
  );
}
