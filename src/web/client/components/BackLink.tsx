import { ArrowLeft } from "lucide-react";
import { Link } from "react-router";
import styles from "./BackLink.module.css";

export interface BackLinkProps {
  to: string;
  label: string;
  state?: unknown;
}

/** The link above a screen that names where it goes ("New search", "Setlists of Arctic Monkeys"). */
export function BackLink({ to, label, state }: BackLinkProps) {
  return (
    <p className={styles.back}>
      <Link to={to} state={state} className={styles.link}>
        <ArrowLeft size={20} aria-hidden="true" />
        {label}
      </Link>
    </p>
  );
}
