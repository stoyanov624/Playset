import { createPortal } from "react-dom";
import { Button } from "../components/Button.js";
import { useHeaderSlot } from "../context/header.js";
import styles from "./AdminHeader.module.css";

export interface AdminHeaderProps {
  /** Shown only once a status answer says the admin is logged in. */
  logOut?: { pending: boolean; onActivate: () => void } | undefined;
}

/** "Admin" after the wordmark and, when logged in, "Log out" at the header's end. */
export function AdminHeader({ logOut }: AdminHeaderProps) {
  const slot = useHeaderSlot();
  if (slot === null) return null;
  return createPortal(
    <>
      <span className={styles.label}>Admin</span>{" "}
      {logOut === undefined ? null : (
        <Button variant="secondary" busy={logOut.pending} onActivate={logOut.onActivate}>
          {logOut.pending ? "Logging out…" : "Log out"}
        </Button>
      )}
    </>,
    slot,
  );
}
