import { CircleCheck } from "lucide-react";
import { ROUTES, type AdminStatusResponse } from "../../shared/index.js";
import { AlertActions } from "../components/AlertActions.js";
import { AlertBox } from "../components/AlertBox.js";
import { Heading } from "../components/Heading.js";
import { ServerLink } from "../components/ServerLink.js";
import admin from "./admin.module.css";
import styles from "./AdminHostAccount.module.css";

/** Connected (with a Reconnect for a new login), or the alert that playlists can't be made until it is. */
export function AdminHostAccount({ hostAccount }: { hostAccount: AdminStatusResponse["hostAccount"] }) {
  if (!hostAccount.connected) {
    return (
      // A plain h2, not the focusing Heading: this is a state of the dashboard, and focus stays on the page's h1.
      <AlertBox tone="caution" title={<h2>Host Account not connected</h2>}>
        <p>Visitors can search and open playlists. Previews and new playlists are unavailable.</p>
        <AlertActions>
          <ServerLink href={ROUTES.adminLogin} variant="primary">
            Reconnect
          </ServerLink>
        </AlertActions>
      </AlertBox>
    );
  }
  return (
    <>
      <Heading level={2} className={admin.section}>
        Host Account
      </Heading>
      <p className={styles.connected}>
        <CircleCheck size={20} aria-hidden="true" className={admin.icon} />
        {hostAccount.displayName === undefined ? "Connected" : `Connected as ${hostAccount.displayName}`}
      </p>
      <ServerLink href={ROUTES.adminLogin} variant="secondary">
        Reconnect
      </ServerLink>
    </>
  );
}
