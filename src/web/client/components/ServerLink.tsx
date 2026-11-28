import type { ReactNode } from "react";
import styles from "./button.module.css";
import type { ButtonVariant } from "./Button.js";

export interface ServerLinkProps {
  href: string;
  children: ReactNode;
  variant: ButtonVariant;
  icon?: ReactNode;
}

/** A link the server answers with a full page load (the admin login's way to Spotify), never in-app navigation. */
export function ServerLink({ href, children, variant, icon }: ServerLinkProps) {
  return (
    <a href={href} className={[styles.button, styles[variant]].join(" ")}>
      {icon}
      {children}
    </a>
  );
}
