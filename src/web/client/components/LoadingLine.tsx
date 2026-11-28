import { Spinner } from "./Spinner.js";
import styles from "./LoadingLine.module.css";

/** "Loading Setlists…" and the like: a spinner with the words, never a skeleton. */
export function LoadingLine({ text }: { text: string }) {
  return (
    <p className={styles.line}>
      <Spinner />
      {text}
    </p>
  );
}
