import { CircleCheck, CircleSlash } from "lucide-react";
import type { PreviewRow } from "../../shared/index.js";
import { missRowId } from "../preview/sheet.js";
import { Badge } from "./Badge.js";
import styles from "./SheetRow.module.css";

/** The Miss wording is the client's own: the contract carries no reason, and "not found" is not said of a Miss. */
function missLine(artist: string, originalArtist: string | undefined): string {
  return originalArtist === undefined
    ? `Miss. No Spotify track by ${artist}.`
    : `Miss. No Spotify track by ${artist} or ${originalArtist}.`;
}

/** One Performance on the sheet: its number, title, badges and its Match or Miss line. */
export function SheetRow({ row }: { row: PreviewRow }) {
  const { performance, outcome } = row;
  const isMiss = outcome.kind === "miss";
  return (
    <li className={`${styles.row} ${isMiss ? styles.missRow : ""}`} id={isMiss ? missRowId(row.number) : undefined}>
      <span className={styles.number}>{row.number}</span>
      <div className={styles.body}>
        <p className={styles.titleLine}>
          <span className={styles.title}>{performance.title}</span>
          {performance.medley === undefined ? null : (
            <Badge label="Medley" meaning={`Part of the medley "${performance.medley}"`} />
          )}
          {performance.originalArtist === undefined ? null : (
            <Badge label="Cover" meaning={`Cover of a song by ${performance.originalArtist}`} />
          )}
        </p>
        {outcome.kind === "match" ? (
          <p className={styles.matchLine}>
            <CircleCheck size={20} aria-hidden="true" className={styles.icon} />
            <span>
              <strong className={styles.track}>{outcome.name}</strong> by {outcome.artists.join(", ")}
              {outcome.live ? " (live recording)" : ""}
            </span>
          </p>
        ) : (
          <p className={styles.missLine}>
            <CircleSlash size={20} aria-hidden="true" className={styles.icon} />
            <span>{missLine(outcome.artist, outcome.originalArtist)}</span>
          </p>
        )}
      </div>
    </li>
  );
}
