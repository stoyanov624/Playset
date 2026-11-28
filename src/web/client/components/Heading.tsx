import { useRef, type ReactNode } from "react";
import { useFocusWhen } from "../hooks/useFocusWhen.js";

export interface HeadingProps {
  level: 1 | 2;
  children: ReactNode;
  className?: string | undefined;
  /** Take focus as soon as this heading is shown (a new screen, result or error). */
  focusWhen?: boolean;
}

/** A screen or section heading that can receive focus without joining the Tab order. */
export function Heading({ level, children, className, focusWhen = false }: HeadingProps) {
  const ref = useRef<HTMLHeadingElement>(null);
  useFocusWhen(ref, focusWhen);
  const Tag = level === 1 ? "h1" : "h2";
  return (
    <Tag ref={ref} tabIndex={-1} className={className}>
      {children}
    </Tag>
  );
}
