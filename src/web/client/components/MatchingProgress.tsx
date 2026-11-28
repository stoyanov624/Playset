import type { PreviewProgress } from "../../shared/index.js";
import { LoadingLine } from "./LoadingLine.js";
import styles from "./MatchingProgress.module.css";

/** "Loading the Setlist…" until the total is known, then the counter and a real progress bar. */
export function MatchingProgress({ progress }: { progress: PreviewProgress | null }) {
  if (progress === null) return <LoadingLine text="Loading the Setlist…" />;
  const label = `Matching ${progress.n} of ${progress.total} Performances`;
  return (
    <div className={styles.progress}>
      <p className={styles.label}>{label}</p>
      <progress className={styles.bar} max={progress.total} value={progress.n} aria-label={label} />
    </div>
  );
}
