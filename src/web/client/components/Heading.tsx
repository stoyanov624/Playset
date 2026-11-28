import { useRef, type ReactNode } from "react";
import { useFocusWhen } from "../hooks/useFocusWhen.js";

export interface HeadingProps {
  level: 1 | 2;
  children: ReactNode;
  className?: string | undefined;
  /**
   * Take focus as soon as this is true (a new screen, result or error). Only a heading given this
   * can take focus, and it never joins the Tab order.
   */
  focusWhen?: boolean;
}

/** A screen or section heading; one that announces a new step can receive focus. */
export function Heading({ level, children, className, focusWhen }: HeadingProps) {
  const ref = useRef<HTMLHeadingElement>(null);
  useFocusWhen(ref, focusWhen === true);
  const Tag = level === 1 ? "h1" : "h2";
  return (
    <Tag ref={ref} tabIndex={focusWhen === undefined ? undefined : -1} className={className}>
      {children}
    </Tag>
  );
}
