import type { ReactNode } from "react";
import { Link } from "react-router";
import styles from "./button.module.css";
import type { ButtonVariant } from "./Button.js";

export interface LinkButtonProps {
  to: string;
  children: ReactNode;
  variant: ButtonVariant;
  icon?: ReactNode;
  state?: unknown;
}

/** In-app navigation that looks like a button. */
export function LinkButton({ to, children, variant, icon, state }: LinkButtonProps) {
  return (
    <Link to={to} state={state} className={[styles.button, styles[variant]].join(" ")}>
      {icon}
      {children}
    </Link>
  );
}
