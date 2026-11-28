import type { ReactNode } from "react";
import styles from "./VisuallyHidden.module.css";

export interface VisuallyHiddenProps {
  children: ReactNode;
  /** Makes this the page's polite live region, read out as its text changes. */
  live?: "polite";
}

/** Text for screen readers only, such as a badge's full meaning or the live region. */
export function VisuallyHidden({ children, live }: VisuallyHiddenProps) {
  return (
    <span className={styles.hidden} aria-live={live}>
      {children}
    </span>
  );
}
