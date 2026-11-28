import type { PreviewResult } from "../../shared/index.js";
import { buildSheet, setHeading } from "../preview/sheet.js";
import { Heading } from "./Heading.js";
import { SheetRow } from "./SheetRow.js";
import { UnknownSongRow } from "./UnknownSongRow.js";
import styles from "./Sheet.module.css";

/** The Setlist sheet: every Performance in played order, under its Set. */
export function Sheet({ result }: { result: PreviewResult }) {
  return (
    <>
      {buildSheet(result).map((section, index) => (
        <section key={index} className={styles.section}>
          {section.label === null ? null : (
            <Heading level={2} className={styles.setHeading}>
              {setHeading(section.label)}
            </Heading>
          )}
          <ol className={styles.rows}>
            {section.items.map((item) =>
              item.kind === "row" ? (
                <SheetRow key={`row-${item.row.number}`} row={item.row} />
              ) : (
                <UnknownSongRow key={`unknown-${item.order}`} song={item.song} />
              ),
            )}
          </ol>
        </section>
      ))}
    </>
  );
}
