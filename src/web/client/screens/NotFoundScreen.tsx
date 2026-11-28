import { BackLink } from "../components/BackLink.js";
import { Heading } from "../components/Heading.js";
import { SearchLink } from "../components/SearchLink.js";
import { useDocumentTitle } from "../hooks/useDocumentTitle.js";
import styles from "./page.module.css";

export function NotFoundScreen() {
  useDocumentTitle("Page not found – Playset");
  return (
    <div className={styles.flow}>
      <BackLink to="/" label="New search" />
      <Heading level={1} className={styles.heading} focusWhen>
        Page not found
      </Heading>
      <p className={styles.text}>There's nothing at this address.</p>
      <SearchLink />
    </div>
  );
}
