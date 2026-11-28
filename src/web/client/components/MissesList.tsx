import { ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { PreviewMiss } from "../../shared/index.js";
import { missRowId } from "../preview/sheet.js";
import { Button } from "./Button.js";
import { Heading } from "./Heading.js";
import styles from "./MissesList.module.css";

/** A long jump list would bury the sheet; the rest opens in place, never in a modal. */
const SHOWN_AT_FIRST = 10;

/** In-page links from each Miss to its row in the sheet. */
export function MissesList({ misses }: { misses: PreviewMiss[] }) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? misses : misses.slice(0, SHOWN_AT_FIRST);
  // The button goes away once pressed, so focus moves on to the first Miss it brought in.
  const firstShownLater = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    if (showAll) firstShownLater.current?.focus();
  }, [showAll]);
  return (
    <section className={styles.misses}>
      <Heading level={2} className={styles.heading}>
        Misses
      </Heading>
      <ul className={styles.list}>
        {shown.map((miss, index) => (
          <li key={miss.number}>
            <a
              ref={index === SHOWN_AT_FIRST ? firstShownLater : undefined}
              href={`#${missRowId(miss.number)}`}
              className={styles.link}
            >
              <span className={styles.number}>{miss.number}</span> <span className={styles.title}>{miss.title}</span>
              <ChevronRight size={20} aria-hidden="true" className={styles.chevron} />
            </a>
          </li>
        ))}
      </ul>
      {shown.length < misses.length ? (
        <Button variant="quiet" onActivate={() => setShowAll(true)}>
          Show all {misses.length} Misses
        </Button>
      ) : null}
    </section>
  );
}
