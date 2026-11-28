import { CassetteTape, CircleCheck, CircleHelp, CircleSlash } from "lucide-react";
import { counted } from "../format.js";
import type { PreviewCounts } from "../preview/sheet.js";
import styles from "./PreviewCountsList.module.css";

/** The outcome in one glance, before the sheet: Matches always, the rest only when there are any. */
export function PreviewCountsList({ counts }: { counts: PreviewCounts }) {
  return (
    <ul className={styles.counts}>
      <li>
        <CircleCheck size={20} aria-hidden="true" className={styles.icon} />
        {counted(counts.matches, "Match", "Matches")}
      </li>
      {counts.misses > 0 ? (
        <li className={styles.miss}>
          <CircleSlash size={20} aria-hidden="true" className={styles.icon} />
          {counted(counts.misses, "Miss", "Misses")}
        </li>
      ) : null}
      {counts.unknownSongs > 0 ? (
        <li className={styles.soft}>
          <CircleHelp size={20} aria-hidden="true" className={styles.icon} />
          {counted(counts.unknownSongs, "Unknown Song", "Unknown Songs")} not added
        </li>
      ) : null}
      {counts.tapes > 0 ? (
        <li className={styles.soft}>
          <CassetteTape size={20} aria-hidden="true" className={styles.icon} />
          {counted(counts.tapes, "Tape", "Tapes")} left out
        </li>
      ) : null}
    </ul>
  );
}
