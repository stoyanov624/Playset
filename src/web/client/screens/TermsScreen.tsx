import { BackLink } from "../components/BackLink.js";
import { Heading } from "../components/Heading.js";
import { useDocumentTitle } from "../hooks/useDocumentTitle.js";
import styles from "./page.module.css";

const SPOTIFY_TERMS = "https://www.spotify.com/legal/end-user-agreement/";
const SPOTIFY_PRIVACY = "https://www.spotify.com/legal/privacy-policy/";

/** `/terms`: what Playset is, that playlists are public, what it keeps, and Spotify's end-user terms. */
export function TermsScreen() {
  useDocumentTitle("Terms and Privacy – Playset");
  return (
    <div className={styles.flow}>
      <BackLink to="/" label="Back to Playset" />
      <Heading level={1} className={styles.heading} focusWhen>
        Terms and Privacy
      </Heading>
      <p className={styles.updated}>Last updated 28 Nov 2026</p>

      <h2 className={styles.section}>What Playset is</h2>
      <p className={styles.text}>
        Playset is a free, non-commercial tool. It reads a Setlist from setlist.fm, looks for each song on Spotify and makes a
        Spotify playlist of it, so you can hear the songs before the Show. It is a personal project, not a company. It comes
        with no guarantee: Matches can be wrong, songs can be missing, and Playset can be slow or unavailable.
      </p>

      <h2 className={styles.section}>Playlists are public</h2>
      <p className={styles.text}>
        You don't log in to Spotify to use Playset. Every playlist is created in Playset's own Spotify account and is public:
        anyone with the link can open it, and Spotify shows it under that account's name. Playset keeps one playlist per
        Setlist and updates it when the Setlist changes on setlist.fm, so other people may open and share the same playlist.
        If you want to keep a playlist, save it or copy it to your own Spotify library.
      </p>

      <h2 className={styles.section}>What Playset keeps about you</h2>
      <p className={styles.text}>
        Nothing that identifies you. There are no accounts, no cookies for Visitors, no analytics, no ads and no third-party
        scripts or fonts.
      </p>
      <ul className={styles.list}>
        <li>
          Your IP address is used only to count requests for Playset's rate limits. The count is held in memory only and is
          never written down.
        </li>
        <li>
          Playset records which Setlist Playlists were created, updated and opened, with the Artist's name and the day, but
          not who asked. These numbers show how much Playset is used.
        </li>
        <li>
          What you search for is sent to setlist.fm and Spotify by Playset's server, so they see Playset's server, not you.
        </li>
        <li>
          When you open a playlist you are on Spotify, and Spotify's <a href={SPOTIFY_PRIVACY}>Privacy Policy</a> applies.
        </li>
      </ul>

      <h2 className={styles.section}>Where the data comes from</h2>
      <p className={styles.text}>
        Setlists come from <a href="https://www.setlist.fm/">setlist.fm</a>, written by its community. Every playlist's
        description links back to its Setlist on setlist.fm. Song matches and track details come from Spotify. Playset is not
        made, endorsed or supported by setlist.fm or Spotify. Spotify is a trademark of Spotify AB.
      </p>

      <h2 className={styles.section}>Spotify's terms</h2>
      <p className={styles.text}>Playset uses the Spotify Platform, so these terms apply between you and Playset:</p>
      <ul className={styles.list}>
        <li>
          Spotify gives no warranty for Playset, and all warranties on Spotify's behalf, including implied ones, are excluded.
        </li>
        <li>Spotify is not liable for any loss or damage that comes from using Playset.</li>
        <li>
          You may not modify, reverse-engineer or make works based on the Spotify Platform, Spotify's service or its content
          through Playset.
        </li>
        <li>Playset, not Spotify, is responsible for Playset and for any support of it.</li>
        <li>Spotify is a third-party beneficiary of these terms and may enforce them against you.</li>
      </ul>
      <p className={styles.text}>
        Your use of Spotify itself is governed by Spotify's <a href={SPOTIFY_TERMS}>Terms of Use</a> and{" "}
        <a href={SPOTIFY_PRIVACY}>Privacy Policy</a>.
      </p>

      <h2 className={styles.section}>Using Playset fairly</h2>
      <p className={styles.text}>
        Use Playset by hand, for your own listening. Don't send automated requests; Playset limits how many previews and
        playlists one address can ask for, and how many playlists it makes per day.
      </p>
    </div>
  );
}
