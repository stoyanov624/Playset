import type { ReactNode } from "react";
import styles from "./VisuallyHidden.module.css";

/** Text for screen readers only, such as a badge's full meaning. */
export function VisuallyHidden({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <span className={styles.hidden} id={id}>
      {children}
    </span>
  );
}
