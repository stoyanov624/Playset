import type { ReactNode } from "react";
import { Spinner } from "./Spinner.js";
import styles from "./button.module.css";

export type ButtonVariant = "primary" | "secondary" | "quiet";

export interface ButtonProps {
  children: ReactNode;
  variant: ButtonVariant;
  /** Leading lucide icon; replaced by the spinner while busy. */
  icon?: ReactNode;
  /** A request is pending: the label says so and activation is ignored. */
  busy?: boolean;
  /** Not yet usable (a rate-limit wait); stays focusable, unlike `disabled`. */
  unavailable?: boolean;
  /** Full width on phones, as in forms and the action bar. */
  wide?: boolean;
  type?: "button" | "submit";
  onActivate?: () => void;
}

/** A button that keeps focus while it can't be used (`aria-disabled`), so the Visitor never loses their place. */
export function Button({ children, variant, icon, busy = false, unavailable = false, wide = false, type = "button", onActivate }: ButtonProps) {
  const inert = busy || unavailable;
  const className = [styles.button, styles[variant], wide ? styles.wide : ""].join(" ");
  return (
    <button
      type={type}
      className={className}
      aria-disabled={inert ? "true" : undefined}
      onClick={(event) => {
        if (inert) {
          event.preventDefault();
          return;
        }
        onActivate?.();
      }}
    >
      {busy ? <Spinner /> : icon}
      {children}
    </button>
  );
}
