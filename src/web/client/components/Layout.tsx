import { useCallback, useState } from "react";
import { Link, Outlet, useLocation } from "react-router";
import { AnnouncerContext } from "../context/announcer.js";
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

  const [announcement, setAnnouncement] = useState("");
  const announce = useCallback((text: string) => setAnnouncement(text), []);

  return (
    <AnnouncerContext.Provider value={announce}>
      <NavigatedContext.Provider value={navigated}>
        <a href="#main" className={styles.skip}>
          Skip to content
        </a>
        <header className={styles.header}>
          <div className={styles.container}>
            <Link to="/" className={styles.wordmark}>
              Playset
            </Link>
          </div>
        </header>
        <main id="main" tabIndex={-1} className={`${styles.container} ${styles.main}`}>
          <Outlet />
          <VisuallyHidden live="polite">{announcement}</VisuallyHidden>
        </main>
        <footer className={styles.footer}>
          <div className={`${styles.container} ${styles.footerItems}`}>
            <p>
              Setlists from <a href="https://www.setlist.fm/">setlist.fm</a>
            </p>
            <p>Playlists are created in {PLAYSET_SPOTIFY_ACCOUNT} and are public.</p>
            <p>
              <Link to="/terms" className={styles.target}>
                Terms and Privacy
              </Link>
            </p>
          </div>
        </footer>
      </NavigatedContext.Provider>
    </AnnouncerContext.Provider>
  );
}
