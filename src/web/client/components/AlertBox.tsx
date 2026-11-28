import { Info, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import styles from "./AlertBox.module.css";

export type AlertTone = "caution" | "info";

export interface AlertBoxProps {
  tone: AlertTone;
  /** The title line: a focusable heading for screen errors, plain text elsewhere. */
  title: ReactNode;
  children?: ReactNode;
  /** Action errors are announced at once; screen errors get focus on their heading instead. */
  announce?: boolean;
}

/** A bordered box with a leading icon: never a side bar, never a card grid. */
export function AlertBox({ tone, title, children, announce = false }: AlertBoxProps) {
  const Icon = tone === "caution" ? TriangleAlert : Info;
  return (
    <div className={`${styles.alert} ${styles[tone]}`} role={announce ? "alert" : undefined}>
      <div className={styles.titleRow}>
        <Icon size={20} aria-hidden="true" className={styles.icon} />
        <div className={styles.title}>{title}</div>
      </div>
      {children}
    </div>
  );
}
