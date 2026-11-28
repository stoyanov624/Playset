import { useInfiniteQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useEffect, useRef } from "react";
import { useLocation } from "react-router";
import type { SetlistSummary } from "../../shared/index.js";
import { ActionError } from "../components/ActionError.js";
import { BackLink } from "../components/BackLink.js";
import { Button } from "../components/Button.js";
import { Heading } from "../components/Heading.js";
import { LinkButton } from "../components/LinkButton.js";
import { LoadingLine } from "../components/LoadingLine.js";
import { ScreenError } from "../components/ScreenError.js";
import { useAnnounce } from "../context/announcer.js";
import { useApi } from "../context/api.js";
import { counted } from "../format.js";
import { useDocumentTitle } from "../hooks/useDocumentTitle.js";
import { useShownError } from "../hooks/useShownError.js";
import { readArtistName } from "../navigation-state.js";
import { SetlistSummaryRow } from "./SetlistSummaryRow.js";
import styles from "./SetlistListScreen.module.css";

/** Setlists from every page, in order; setlist.fm pages shift when a new Setlist is added, so ids repeat. */
function uniqueSetlists(pages: { setlists: SetlistSummary[] }[]): { setlists: SetlistSummary[]; addedByLastPage: number } {
  const seen = new Set<string>();
  const setlists: SetlistSummary[] = [];
  let addedByLastPage = 0;
  pages.forEach((page, index) => {
    for (const setlist of page.setlists) {
      if (seen.has(setlist.id)) continue;
      seen.add(setlist.id);
      setlists.push(setlist);
      if (index === pages.length - 1) addedByLastPage += 1;
    }
  });
  return { setlists, addedByLastPage };
}

/** `/artists/:mbid`: an Artist's Setlists, newest first, one page at a time. */
export function SetlistListScreen({ mbid }: { mbid: string }) {
  const api = useApi();
  const announce = useAnnounce();
  const pickedName = readArtistName(useLocation().state);

  const list = useInfiniteQuery({
    queryKey: ["setlists", mbid],
    queryFn: ({ pageParam, signal }) => api.getArtistSetlists(mbid, pageParam, signal),
    initialPageParam: 1,
    getNextPageParam: (last, _pages, lastPage) => (last.hasMore ? lastPage + 1 : undefined),
  });
  const pages = list.data?.pages ?? [];
  const firstPageError = useShownError(list.data === undefined ? list.error : null, list.isFetching);
  const morePagesError = useShownError(list.isFetchNextPageError ? list.error : null, list.isFetchingNextPage);

  const name = pages.find((page) => page.artist.name !== undefined)?.artist.name ?? pickedName;
  useDocumentTitle(name === undefined ? "Setlists – Playset" : `${name} – Setlists – Playset`);
  const { setlists, addedByLastPage } = uniqueSetlists(pages);

  // Only pages loaded while the Visitor is here are announced, not those kept from an earlier visit.
  const pageCount = pages.length;
  const announcedPages = useRef(pageCount);
  useEffect(() => {
    if (pageCount > announcedPages.current && pageCount > 1) {
      announce(addedByLastPage === 0 ? "No more Setlists" : `${counted(addedByLastPage, "more Setlist", "more Setlists")} loaded`);
    }
    announcedPages.current = pageCount;
  }, [pageCount, addedByLastPage, announce]);

  function loadMore() {
    if (!list.isFetchingNextPage) void list.fetchNextPage();
  }

  const fromList = { fromList: { mbid, artistName: name } };

  return (
    <div className={styles.flow}>
      <BackLink to="/" label="New search" />
      <Heading level={1} className={styles.heading} focusWhen={list.data !== undefined}>
        {name ?? "Setlists"}
      </Heading>
      <p className={styles.subtitle}>Setlists on setlist.fm, newest first</p>
      {firstPageError !== null ? (
        <ScreenError
          key={firstPageError.key}
          error={firstPageError.error}
          headingLevel={2}
          retrying={firstPageError.retrying}
          onRetry={() => void list.refetch()}
        />
      ) : list.data === undefined ? (
        <LoadingLine text="Loading Setlists…" />
      ) : (
        <>
          {setlists.length === 0 && !list.hasNextPage ? (
            <section>
              <Heading level={2} className={styles.emptyHeading}>
                No Setlists with songs yet
              </Heading>
              <p className={styles.text}>setlist.fm has no Setlist with songs for this Artist.</p>
              <LinkButton to="/" variant="secondary" icon={<Search size={20} aria-hidden="true" />}>
                Search for another Artist
              </LinkButton>
            </section>
          ) : null}
          {setlists.length === 0 && list.hasNextPage ? (
            <p className={styles.text}>No Setlists with songs among the newest ones. Load more to look further back.</p>
          ) : null}
          {setlists.length === 0 ? null : (
            <ol className={styles.rows}>
              {setlists.map((setlist) => (
                <SetlistSummaryRow key={setlist.id} setlist={setlist} state={fromList} />
              ))}
            </ol>
          )}
          {morePagesError !== null ? (
            <ActionError
              key={morePagesError.key}
              error={morePagesError.error}
              retrying={morePagesError.retrying}
              onRetry={loadMore}
            />
          ) : list.hasNextPage ? (
            <div className={styles.more}>
              <Button variant="secondary" wide busy={list.isFetchingNextPage} onActivate={loadMore}>
                {list.isFetchingNextPage ? "Loading…" : "Load more Setlists"}
              </Button>
            </div>
          ) : setlists.length === 0 ? null : (
            <p className={styles.end}>That's every Setlist on setlist.fm.</p>
          )}
        </>
      )}
    </div>
  );
}
