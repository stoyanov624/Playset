import { CassetteTape, Scissors } from "lucide-react";
import type { NotAdded } from "../../shared/index.js";
import { Heading } from "./Heading.js";
import styles from "./LeftOut.module.css";

/** Tapes and snippets are never sheet rows; they are listed here, in the order they were played. */
export function LeftOut({ notAdded }: { notAdded: NotAdded[] }) {
  const names = (reason: "tape" | "snippet") =>
    notAdded.flatMap((entry) => (entry.reason === reason ? [entry.name] : []));
  const tapes = names("tape");
  const snippets = names("snippet");
  if (tapes.length === 0 && snippets.length === 0) return null;
  return (
    <section className={styles.leftOut}>
      <Heading level={2} className={styles.heading}>
        Left out
      </Heading>
      {tapes.length === 0 ? null : (
        <>
          <p className={styles.label}>
            <CassetteTape size={20} aria-hidden="true" className={styles.icon} />
            Tapes are never added:
          </p>
          <ul className={styles.list}>
            {tapes.map((name, index) => (
              <li key={index}>{name}</li>
            ))}
          </ul>
        </>
      )}
      {snippets.length === 0 ? null : (
        <>
          <p className={styles.label}>
            <Scissors size={20} aria-hidden="true" className={styles.icon} />
            Snippets are noted, not added:
          </p>
          <ul className={styles.list}>
            {snippets.map((name, index) => (
              <li key={index}>{name}</li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
