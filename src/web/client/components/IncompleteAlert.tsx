import type { IncompleteStatus } from "../../shared/index.js";
import { AlertBox } from "./AlertBox.js";

/** setlist.fm doesn't list the whole Show; the Visitor is told before anything else. */
export function IncompleteAlert({ status }: { status: IncompleteStatus }) {
  return (
    <AlertBox tone="caution" title={<p>Incomplete Setlist</p>}>
      <p>setlist.fm doesn't list the whole Show. The playlist has only the known songs.</p>
      {status.setlistNote === undefined ? null : <p>setlist.fm note: "{status.setlistNote}"</p>}
    </AlertBox>
  );
}
