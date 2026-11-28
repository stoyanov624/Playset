import { useRef, type ReactNode } from "react";
import { useFocusWhen } from "../hooks/useFocusWhen.js";
import styles from "./Heading.module.css";

export interface HeadingProps {
  level: 1 | 2;
  children: ReactNode;
  className?: string | undefined;
  /**
   * Take focus as soon as this is true (a new screen, result or error). Only a heading given this
   * can take focus, and it never joins the Tab order.
   */
  focusWhen?: boolean;
  /** For screen readers only: a screen still waiting for its content keeps its one `h1`. */
  visuallyHidden?: boolean;
}

/** A screen or section heading; one that announces a new step can receive focus. */
export function Heading({ level, children, className, focusWhen, visuallyHidden }: HeadingProps) {
  const ref = useRef<HTMLHeadingElement>(null);
  useFocusWhen(ref, focusWhen === true);
  const Tag = level === 1 ? "h1" : "h2";
  return (
    <Tag ref={ref} tabIndex={focusWhen === undefined ? undefined : -1} className={visuallyHidden === true ? styles.hidden : className}>
      {children}
    </Tag>
  );
}
