import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router";
import type { PreviewProgress } from "../../shared/index.js";
import { asApiCallError } from "../api/index.js";
import { BackLink } from "../components/BackLink.js";
import { Heading } from "../components/Heading.js";
import { IncompleteAlert } from "../components/IncompleteAlert.js";
import { LoadingLine } from "../components/LoadingLine.js";
import { MatchingProgress } from "../components/MatchingProgress.js";
import { OutdatedNotice } from "../components/OutdatedNotice.js";
import { PlaylistAction } from "../components/PlaylistAction.js";
import { PlaylistPanel } from "../components/PlaylistPanel.js";
import { PreviewResultView } from "../components/PreviewResultView.js";
import { ScreenError } from "../components/ScreenError.js";
import { ShowLine } from "../components/ShowLine.js";
import { useAnnounce } from "../context/announcer.js";
import { useApi } from "../context/api.js";
import { counted, formatShowDate } from "../format.js";
import { useDocumentTitle } from "../hooks/useDocumentTitle.js";
import { useShownError } from "../hooks/useShownError.js";
import { readFromList } from "../navigation-state.js";
import { countPreview } from "../preview/sheet.js";
import styles from "./SetlistScreen.module.css";

/** Screen readers hear Matching progress at most this often; the counter on screen moves freely. */
const PROGRESS_ANNOUNCE_GAP_MS = 5000;

/**
 * `/setlists/:id`: the Setlist status first, so a current Setlist Playlist shows at once; otherwise
 * the streamed preview, then Create or Update.
 */
export function SetlistScreen({ id }: { id: string }) {
  const api = useApi();
  const announce = useAnnounce();
  const fromList = readFromList(useLocation().state);
  // Each "Load fresh preview" asks for the status and the preview anew.
  const [round, setRound] = useState(0);

  // The status and the preview are never reused from an earlier visit: the Setlist may have changed.
  const statusQuery = useQuery({
    queryKey: ["setlist", id, round],
    queryFn: ({ signal }) => api.getSetlist(id, signal),
    staleTime: 0,
    gcTime: 0,
  });
  const status = statusQuery.data;
  const statusError = useShownError(statusQuery.error, statusQuery.isFetching);
  const wantsPreview = status !== undefined && status.playlist.status !== "current";

  const [progress, setProgress] = useState<PreviewProgress | null>(null);
  const lastProgressAnnouncement = useRef<number | null>(null);
  const previewQuery = useQuery({
    queryKey: ["preview", id, round],
    queryFn: ({ signal }) => {
      setProgress(null);
      lastProgressAnnouncement.current = null;
      return api.streamPreview(id, {
        signal,
        onProgress: (next) => {
          // A stream the Visitor already left says nothing more.
          if (signal.aborted) return;
          setProgress(next);
          const now = Date.now();
          const last = lastProgressAnnouncement.current;
          if (last === null) {
            announce(`Matching ${next.total} Performances`);
            lastProgressAnnouncement.current = now;
          } else if (now - last >= PROGRESS_ANNOUNCE_GAP_MS) {
            announce(`Matching ${next.n} of ${next.total}`);
            lastProgressAnnouncement.current = now;
          }
        },
      });
    },
    enabled: wantsPreview,
    staleTime: 0,
    gcTime: 0,
  });
  const result = previewQuery.data;
  const counts = result === undefined ? null : countPreview(result);

  useEffect(() => {
    if (result === undefined) return;
    const done = countPreview(result);
    announce(`Matching done: ${counted(done.matches, "Match", "Matches")}, ${counted(done.misses, "Miss", "Misses")}`);
  }, [result, announce]);

  // Never cancelled on leaving: the server finishes a playlist it has started.
  const create = useMutation({ mutationFn: (versionId: string) => api.createPlaylist(id, versionId) });
  const createError = useShownError(create.error, create.isPending);
  const sending = useRef(false);
  const update = status?.playlist.status === "outdated";

  function send(versionId: string, announceStart: boolean) {
    if (sending.current) return;
    sending.current = true;
    if (announceStart) announce(update ? "Updating playlist" : "Creating playlist");
    create.mutate(versionId, {
      onSettled: () => {
        sending.current = false;
      },
    });
  }

  function loadFreshPreview() {
    create.reset();
    setProgress(null);
    setRound((current) => current + 1);
  }

  useDocumentTitle(status === undefined ? "Setlist – Playset" : `${status.show.artist}, ${formatShowDate(status.show.date)} – Playset`);

  const listLink =
    fromList === undefined
      ? undefined
      : {
          to: `/artists/${fromList.mbid}`,
          label: fromList.artistName === undefined ? "Setlists" : `Setlists of ${fromList.artistName}`,
          state: { artistName: fromList.artistName },
        };
  const made = create.data;

  return (
    <div>
      {listLink === undefined ? (
        <BackLink to="/" label="New search" />
      ) : (
        <BackLink to={listLink.to} label={listLink.label} state={listLink.state} />
      )}
      {statusError !== null ? (
        <div className={styles.flow}>
          <ScreenError
            key={statusError.key}
            error={statusError.error}
            headingLevel={1}
            retrying={statusError.retrying}
            onRetry={() => void statusQuery.refetch()}
          />
        </div>
      ) : status === undefined ? (
        <LoadingLine text="Loading the Setlist…" />
      ) : (
        <>
          <div className={styles.flow}>
            <Heading level={1} className={styles.heading} focusWhen={wantsPreview}>
              {status.show.artist}
            </Heading>
            <ShowLine show={status.show} />
            {status.incompleteStatus.isIncomplete ? <IncompleteAlert status={status.incompleteStatus} /> : null}
            {status.playlist.status === "outdated" && made === undefined ? <OutdatedNotice url={status.playlist.url} /> : null}
            {status.playlist.status === "current" ? (
              <PlaylistPanel title="Setlist Playlist ready" url={status.playlist.url}>
                <p>It's up to date with setlist.fm.</p>
              </PlaylistPanel>
            ) : null}
            {made !== undefined && result !== undefined && counts !== null ? (
              <PlaylistPanel title={made.status === "created" ? "Playlist created" : "Playlist updated"} url={made.url}>
                <p>{result.playlistName}</p>
                <p>{counted(counts.matches, "song", "songs")}, public in Playset's Spotify account.</p>
              </PlaylistPanel>
            ) : null}
          </div>
          {!wantsPreview ? null : previewQuery.error !== null && !previewQuery.isFetching ? (
            <div className={styles.flow}>
              <ScreenError
                key={previewQuery.errorUpdatedAt}
                error={asApiCallError(previewQuery.error)}
                headingLevel={2}
                retrying={false}
                onRetry={() => void previewQuery.refetch()}
                elsewhere={listLink}
              />
            </div>
          ) : result === undefined || counts === null ? (
            <MatchingProgress progress={progress} />
          ) : (
            <PreviewResultView
              result={result}
              action={
                made === undefined ? (
                  <PlaylistAction
                    update={update}
                    matches={counts.matches}
                    pending={create.isPending}
                    error={createError}
                    onSend={() => send(result.versionId, true)}
                    onRetry={() => send(result.versionId, false)}
                    onFreshPreview={loadFreshPreview}
                  />
                ) : null
              }
            />
          )}
        </>
      )}
    </div>
  );
}
