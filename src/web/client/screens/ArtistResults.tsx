import { ChevronRight } from "lucide-react";
import { Link } from "react-router";
import type { ArtistCandidate } from "../../shared/index.js";
import { Heading } from "../components/Heading.js";
import { counted } from "../format.js";
import type { ArtistListState } from "../navigation-state.js";
import styles from "./ArtistResults.module.css";

export interface ArtistResultsProps {
  name: string;
  artists: ArtistCandidate[];
}

/** The candidates for a searched name, always as a list to pick from, even for one exact match. */
export function ArtistResults({ name, artists }: ArtistResultsProps) {
  if (artists.length === 0) {
    return (
      <section className={styles.results}>
        <Heading key={name} level={1} className={styles.heading} focusWhen>
          No Artist found — check spelling
        </Heading>
        <p className={styles.line}>
          Nothing on setlist.fm matches "{name}". Try the Artist's full name or another spelling.
        </p>
      </section>
    );
  }
  return (
    <section className={styles.results}>
      <Heading key={name} level={1} className={styles.heading} focusWhen>
        Pick the Artist
      </Heading>
      <p className={styles.line}>
        {counted(artists.length, "Artist", "Artists")} found for "{name}"
      </p>
      <ol className={styles.list}>
        {artists.map((candidate) => {
          const state: ArtistListState = { artistName: candidate.name };
          return (
            <li key={candidate.mbid}>
              <Link to={`/artists/${candidate.mbid}`} state={state} className={styles.row}>
                <span className={styles.text}>
                  <span className={styles.name}>{candidate.name}</span>
                  {candidate.disambiguation === undefined ? null : (
                    <span className={styles.disambiguation}>{candidate.disambiguation}</span>
                  )}
                </span>
                <ChevronRight size={20} aria-hidden="true" className={styles.chevron} />
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
