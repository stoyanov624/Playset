import { useCallback, useState } from "react";
import { Link, Outlet, useLocation } from "react-router";
import { AnnouncerContext } from "../context/announcer.js";
import { HeaderSlotContext } from "../context/header.js";
import { NavigatedContext } from "../context/navigation.js";
import { PLAYSET_SPOTIFY_ACCOUNT } from "../wording.js";
import { VisuallyHidden } from "./VisuallyHidden.js";
import styles from "./Layout.module.css";

/** The page shell: skip link, header, one main with the live region, and the footer. */
export function Layout() {
  const location = useLocation();
  const [firstKey] = useState(location.key);
  const [navigated, setNavigated] = useState(false);
  if (!navigated && location.key !== firstKey) setNavigated(true);

  // Each announcement is a new node, so the same sentence twice ("Link copied") is read out twice.
  const [announcement, setAnnouncement] = useState({ text: "", count: 0 });
  const announce = useCallback((text: string) => setAnnouncement((last) => ({ text, count: last.count + 1 })), []);
  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);

  return (
    <AnnouncerContext.Provider value={announce}>
      <NavigatedContext.Provider value={navigated}>
        <HeaderSlotContext.Provider value={headerSlot}>
        <a href="#main" className={styles.skip}>
          Skip to content
        </a>
        <header className={styles.header}>
          <div className={`${styles.container} ${styles.headerRow}`}>
            <Link to="/" className={styles.wordmark} translate="no">
              Playset
            </Link>{" "}
            <div ref={setHeaderSlot} className={styles.headerSlot} />
          </div>
        </header>
        <main id="main" tabIndex={-1} className={`${styles.container} ${styles.main}`}>
          <Outlet />
          <VisuallyHidden live="polite">
            <span key={announcement.count}>{announcement.text}</span>
          </VisuallyHidden>
        </main>
        <footer className={styles.footer}>
          <div className={`${styles.container} ${styles.footerItems}`}>
            <p>
              Setlists from{" "}
              <a href="https://www.setlist.fm/" translate="no">
                setlist.fm
              </a>
            </p>
            <p>Playlists are created in {PLAYSET_SPOTIFY_ACCOUNT} and are public.</p>
            <p>
              <Link to="/terms" className={styles.target}>
                Terms and Privacy
              </Link>
            </p>
          </div>
        </footer>
        </HeaderSlotContext.Provider>
      </NavigatedContext.Provider>
    </AnnouncerContext.Provider>
  );
}
