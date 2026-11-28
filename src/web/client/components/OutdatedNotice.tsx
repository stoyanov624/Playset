import { AlertActions } from "./AlertActions.js";
import { AlertBox } from "./AlertBox.js";
import { NewTabLink } from "./NewTabLink.js";

/** The Setlist Playlist exists but no longer matches the Setlist on setlist.fm. */
export function OutdatedNotice({ url }: { url: string }) {
  return (
    <AlertBox tone="info" title={<p>This Setlist changed on setlist.fm since its playlist was made.</p>}>
      <AlertActions>
        <NewTabLink href={url} label="Open current playlist" variant="secondary" />
      </AlertActions>
    </AlertBox>
  );
}
