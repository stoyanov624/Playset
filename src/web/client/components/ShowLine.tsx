import type { Show } from "../../shared/index.js";
import { formatShowDate } from "../format.js";
import styles from "./ShowLine.module.css";

/** The Show's date, venue and city, each its own item; empty parts are left out. */
export function ShowLine({ show }: { show: Show }) {
  const parts = [formatShowDate(show.date), show.venue, show.city].filter((part) => part !== "");
  return (
    <ul className={styles.line}>
      {parts.map((part, index) => (
        <li key={index}>{part}</li>
      ))}
    </ul>
  );
}
