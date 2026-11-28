import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { BackLink } from "../components/BackLink.js";
import { Heading } from "../components/Heading.js";
import { ScreenError } from "../components/ScreenError.js";
import { useApi } from "../context/api.js";
import { useHasNavigated } from "../context/navigation.js";
import { useDocumentTitle } from "../hooks/useDocumentTitle.js";
import { useShownError } from "../hooks/useShownError.js";
import { ArtistResults } from "./ArtistResults.js";
import { ArtistSearchForm } from "./ArtistSearchForm.js";
import { SetlistLinkForm } from "./SetlistLinkForm.js";
import styles from "./StartScreen.module.css";

/** `/`: the Artist search and the setlist.fm link; with `?artist=` it also shows the candidates. */
export function StartScreen() {
  const api = useApi();
  const navigated = useHasNavigated();
  const [params] = useSearchParams();
  const artist = (params.get("artist") ?? "").trim();
  useDocumentTitle(artist === "" ? "Playset" : `Artists for "${artist}" – Playset`);

  const search = useQuery({
    queryKey: ["artists", artist],
    // The name travels with the answer, so an earlier list keeps its own name while a new search runs.
    queryFn: async ({ signal }) => ({ name: artist, answer: await api.searchArtists(artist, signal) }),
    enabled: artist !== "",
    placeholderData: keepPreviousData,
  });
  const shown = useShownError(search.error, search.isFetching);
  const fieldError = shown?.error.code === "INVALID_INPUT" ? shown.error : null;

  const home = artist === "";

  /** Home offers the link form; a search shows its error (unless it is on the field) or its candidates. */
  function belowForm() {
    if (home) {
      return (
        <>
          <hr className={styles.rule} />
          <SetlistLinkForm />
        </>
      );
    }
    if (shown !== null) {
      if (fieldError !== null) return null;
      return (
        <ScreenError
          key={shown.key}
          error={shown.error}
          headingLevel={1}
          retrying={shown.retrying}
          onRetry={() => void search.refetch()}
        />
      );
    }
    if (search.data === undefined) return null;
    return <ArtistResults name={search.data.name} artists={search.data.answer.artists} />;
  }

  // One form for both states, so the input keeps its place (and focus) when a search starts.
  return (
    <div className={styles.flow}>
      {home ? null : <BackLink to="/" label="New search" />}
      {home ? (
        <>
          <Heading level={1} className={styles.headline} focusWhen={navigated}>
            Hear the Setlist before the Show
          </Heading>
          <p className={styles.intro}>Find an Artist's Setlist on setlist.fm and play it as a Spotify playlist.</p>
        </>
      ) : null}
      <ArtistSearchForm artist={artist} searching={search.isFetching} serverProblem={fieldError} />
      {belowForm()}
    </div>
  );
}
