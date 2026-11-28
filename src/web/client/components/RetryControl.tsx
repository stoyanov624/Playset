import { RotateCw } from "lucide-react";
import { useEffect, useState } from "react";
import { useAnnounce } from "../context/announcer.js";
import { formatWait } from "../format.js";
import { AlertActions } from "./AlertActions.js";
import { Button } from "./Button.js";
import styles from "./RetryControl.module.css";

export interface RetryControlProps {
  /** Seconds to wait before "Try again" works (from the answer's Retry-After); none means at once. */
  waitSeconds?: number | undefined;
  retrying: boolean;
  onRetry: () => void;
}

/**
 * "Try again", locked during a rate-limit wait with a visible countdown. The countdown isn't read
 * out each second: only its start and its end are announced.
 */
export function RetryControl({ waitSeconds, retrying, onRetry }: RetryControlProps) {
  const announce = useAnnounce();
  const [remaining, setRemaining] = useState(waitSeconds ?? 0);

  useEffect(() => {
    if (waitSeconds === undefined || waitSeconds <= 0) return undefined;
    announce(`Try again in ${waitSeconds} seconds`);
    const deadline = Date.now() + waitSeconds * 1000;
    const timer = setInterval(() => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0) {
        clearInterval(timer);
        announce("You can try again now");
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [waitSeconds, announce]);

  return (
    <>
      {remaining > 0 ? <p className={styles.countdown}>You can try again in {formatWait(remaining)}</p> : null}
      <AlertActions>
        <Button variant="secondary" icon={<RotateCw size={20} aria-hidden="true" />} busy={retrying} unavailable={remaining > 0} onActivate={onRetry}>
          {retrying ? "Trying again…" : "Try again"}
        </Button>
      </AlertActions>
    </>
  );
}
