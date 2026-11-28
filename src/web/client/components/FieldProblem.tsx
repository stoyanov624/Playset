import { TriangleAlert } from "lucide-react";
import styles from "./FieldProblem.module.css";

export interface FieldProblemProps {
  messageId: string;
  hintId: string;
  message: string;
  hint?: string | undefined;
}

/** What is wrong with a field and what to do, linked to it through `aria-describedby`. */
export function FieldProblem({ messageId, hintId, message, hint }: FieldProblemProps) {
  return (
    <div className={styles.problem}>
      <p className={styles.message}>
        <TriangleAlert size={20} aria-hidden="true" className={styles.icon} />
        <span id={messageId}>{message}</span>
      </p>
      {hint === undefined ? null : (
        <p className={styles.hint} id={hintId}>
          {hint}
        </p>
      )}
    </div>
  );
}

/** The `aria-describedby` value for a field's problem: the message, then the hint when there is one. */
export function describedByIds(messageId: string, hintId: string, hint: string | undefined): string {
  return hint === undefined ? messageId : `${messageId} ${hintId}`;
}
