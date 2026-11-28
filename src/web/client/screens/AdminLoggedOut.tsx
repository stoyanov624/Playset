import { LogIn } from "lucide-react";
import { ROUTES } from "../../shared/index.js";
import { ServerLink } from "../components/ServerLink.js";
import styles from "./AdminLoggedOut.module.css";

/** Nobody, or not the Host Account, is logged in: the only way on is the Spotify login. */
export function AdminLoggedOut() {
  return (
    <>
      <p className={styles.lead}>Log in as the Host Account to see its status and usage.</p>
      <ServerLink href={ROUTES.adminLogin} variant="primary" icon={<LogIn size={20} aria-hidden="true" />}>
        Log in with Spotify
      </ServerLink>
    </>
  );
}
