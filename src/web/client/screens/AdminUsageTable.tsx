import type { AdminStatusResponse } from "../../shared/index.js";
import { VisuallyHidden } from "../components/VisuallyHidden.js";
import { formatCount, formatUsageDay } from "../format.js";
import styles from "./AdminUsageTable.module.css";

type UsageDay = AdminStatusResponse["usage"]["perDay"][number];

/** The last 30 days, newest first whatever order the server sent; the bar only echoes the opens. */
export function AdminUsageTable({ days }: { days: UsageDay[] }) {
  const newestFirst = [...days].sort((a, b) => b.date.localeCompare(a.date));
  const mostOpened = Math.max(...days.map((day) => day.opened));
  return (
    <table className={styles.table}>
      <caption>
        <VisuallyHidden>Setlist Playlists made, updated and opened per day, last 30 days</VisuallyHidden>
      </caption>
      <thead>
        <tr>
          <th scope="col">Day</th>
          <th scope="col">Made</th>
          <th scope="col">Updated</th>
          <th scope="col">Opens</th>
          <td aria-hidden="true" className={styles.barCell} />
        </tr>
      </thead>
      <tbody>
        {newestFirst.map((day) => (
          <tr key={day.date}>
            <th scope="row">
              <time dateTime={day.date}>{formatUsageDay(day.date)}</time>
            </th>
            <td>{formatCount(day.created)}</td>
            <td>{formatCount(day.updated)}</td>
            <td>{formatCount(day.opened)}</td>
            <td aria-hidden="true" className={styles.barCell}>
              <span className={styles.bar} style={{ inlineSize: `${mostOpened === 0 ? 0 : (day.opened / mostOpened) * 100}%` }} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
