import { CircleHelp } from "lucide-react";
import type { UnknownSong } from "../preview/sheet.js";
import styles from "./Sheet.module.css";

/** A song setlist.fm lists without a name: it keeps its place, has no number and is never added. */
export function UnknownSongRow({ song }: { song: UnknownSong }) {
  return (
    <li className={`${styles.row} ${styles.unknownRow}`}>
      <span className={styles.number} />
      <div className={styles.body}>
        <p className={styles.titleLine}>
          <CircleHelp size={20} aria-hidden="true" className={styles.icon} />
          <span className={styles.title}>Unknown Song</span>
        </p>
        <p className={styles.note}>
          Not added.{song.info === undefined ? "" : ` "${song.info}"`}
        </p>
      </div>
    </li>
  );
}
