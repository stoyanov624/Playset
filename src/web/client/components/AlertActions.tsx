import type { ReactNode } from "react";
import styles from "./AlertActions.module.css";

/** The row of buttons and links at the foot of an alert. */
export function AlertActions({ children }: { children: ReactNode }) {
  return <div className={styles.actions}>{children}</div>;
}
