import type { ReactNode } from "react";
import { VisuallyHidden } from "./VisuallyHidden.js";
import styles from "./Badge.module.css";

export interface BadgeProps {
  label: string;
  /** What the badge means, read out instead of its short label. */
  meaning: string;
  tone?: "neutral" | "caution";
  icon?: ReactNode;
}

/** A small label beside a name; screen readers get its full meaning. */
export function Badge({ label, meaning, tone = "neutral", icon }: BadgeProps) {
  return (
    <span className={`${styles.badge} ${styles[tone]}`}>
      {icon}
      <span aria-hidden="true">{label}</span>
      <VisuallyHidden>{meaning}</VisuallyHidden>
    </span>
  );
}
