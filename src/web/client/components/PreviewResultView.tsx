import type { ReactNode } from "react";
import type { PreviewResult } from "../../shared/index.js";
import { countPreview } from "../preview/sheet.js";
import { LeftOut } from "./LeftOut.js";
import { MissesList } from "./MissesList.js";
import { PreviewCountsList } from "./PreviewCountsList.js";
import { Sheet } from "./Sheet.js";
import styles from "./PreviewResultView.module.css";

export interface PreviewResultViewProps {
  result: PreviewResult;
  /** The Create or Update action; none once the playlist is made. */
  action: ReactNode;
}

/**
 * The finished preview. One copy of each part: CSS moves the summary and action into the side
 * rail on wide screens and makes the action a sticky bar on phones.
 */
export function PreviewResultView({ result, action }: PreviewResultViewProps) {
  return (
    <div className={styles.preview}>
      <div className={styles.summary}>
        <PreviewCountsList counts={countPreview(result)} />
        {result.misses.length === 0 ? null : <MissesList misses={result.misses} />}
      </div>
      <div className={styles.sheet}>
        <Sheet result={result} />
        <LeftOut notAdded={result.notAdded} />
      </div>
      {action === null ? null : <div className={styles.action}>{action}</div>}
    </div>
  );
}
