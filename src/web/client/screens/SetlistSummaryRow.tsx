import { ChevronRight, TriangleAlert } from "lucide-react";
import { Link } from "react-router";
import type { SetlistSummary } from "../../shared/index.js";
import { Badge } from "../components/Badge.js";
import { counted, formatShowDate, showDateParts } from "../format.js";
import type { SetlistState } from "../navigation-state.js";
import styles from "./SetlistSummaryRow.module.css";

/** The row's spoken name: date, venue, city and song count, leaving out empty parts with their commas. */
function rowName(setlist: SetlistSummary): string {
  const parts = [formatShowDate(setlist.date), setlist.venue, setlist.city, counted(setlist.songCount, "song", "songs")];
  if (setlist.incompleteStatus.isIncomplete) parts.push("Incomplete Setlist");
  return parts.filter((part) => part !== "").join(", ");
}

/** One Setlist in the list, the whole row a link to its Setlist screen. */
export function SetlistSummaryRow({ setlist, state }: { setlist: SetlistSummary; state: SetlistState }) {
  const { day, monthYear } = showDateParts(setlist.date);
  return (
    <li>
      <Link to={`/setlists/${setlist.id}`} state={state} className={styles.row} aria-label={rowName(setlist)}>
        <time dateTime={setlist.date} className={styles.date}>
          <span className={styles.day}>{day}</span>
          <span className={styles.monthYear}>{monthYear}</span>
        </time>
        <span className={styles.place}>
          {setlist.venue === "" ? null : <span className={styles.venue}>{setlist.venue}</span>}
          {setlist.city === "" ? null : <span className={styles.city}>{setlist.city}</span>}
          <span className={styles.meta}>
            <span className={styles.count}>{counted(setlist.songCount, "song", "songs")}</span>
            {setlist.incompleteStatus.isIncomplete ? (
              <Badge
                label="Incomplete"
                meaning="Incomplete Setlist"
                tone="caution"
                icon={<TriangleAlert size={16} aria-hidden="true" />}
              />
            ) : null}
          </span>
        </span>
        <ChevronRight size={20} aria-hidden="true" className={styles.chevron} />
      </Link>
    </li>
  );
}
