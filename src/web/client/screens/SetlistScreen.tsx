import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router";
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
import { useCreatePlaylist } from "../hooks/useCreatePlaylist.js";
import { useDocumentTitle } from "../hooks/useDocumentTitle.js";
import { usePreviewStream } from "../hooks/usePreviewStream.js";
import { useShownError } from "../hooks/useShownError.js";
import { readFromList } from "../navigation-state.js";
import { countPreview } from "../preview/sheet.js";
import { PLAYSET_SPOTIFY_ACCOUNT } from "../wording.js";
import styles from "./SetlistScreen.module.css";

/**
 * `/setlists/:id`: the Setlist status first, so a current Setlist Playlist shows at once; otherwise
 * the streamed preview, then Create or Update.
 */
export function SetlistScreen({ id }: { id: string }) {
  const api = useApi();
  const announce = useAnnounce();
  // Kept from the first visit: an in-page jump (a Miss link, Skip to content) replaces the
  // history entry's state, but the Visitor still came from that Setlist list.
  const location = useLocation();
  const [fromList] = useState(() => readFromList(location.state));
  // Each "Load fresh preview" asks for the status and the preview anew.
  const [round, setRound] = useState(0);

  // The status is never reused from an earlier visit: the Setlist may have changed.
  const statusQuery = useQuery({
    queryKey: ["setlist", id, round],
    queryFn: ({ signal }) => api.getSetlist(id, signal),
    staleTime: 0,
    gcTime: 0,
  });
  const status = statusQuery.data;
  const statusError = useShownError(statusQuery.error, statusQuery.isFetching);
  const wantsPreview = status !== undefined && status.playlist.status !== "current";
  const update = status?.playlist.status === "outdated";

  const preview = usePreviewStream(id, round, wantsPreview);
  const result = preview.query.data;
  const counts = useMemo(() => (result === undefined ? null : countPreview(result)), [result]);

  useEffect(() => {
    if (counts === null) return;
    announce(`Matching done: ${counted(counts.matches, "Match", "Matches")}, ${counted(counts.misses, "Miss", "Misses")}`);
  }, [counts, announce]);

  const playlist = useCreatePlaylist(id, update);

  function loadFreshPreview() {
    playlist.reset();
    preview.clearProgress();
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
  const made = playlist.made;

  function previewPart() {
    if (!wantsPreview) return null;
    if (preview.query.error !== null && !preview.query.isFetching) {
      return (
        <div className={styles.flow}>
          <ScreenError
            key={preview.query.errorUpdatedAt}
            error={asApiCallError(preview.query.error)}
            headingLevel={2}
            retrying={false}
            onRetry={() => void preview.query.refetch()}
            elsewhere={listLink}
          />
        </div>
      );
    }
    if (result === undefined || counts === null) return <MatchingProgress progress={preview.progress} />;
    return (
      <PreviewResultView
        result={result}
        counts={counts}
        action={
          made === undefined ? (
            <PlaylistAction
              update={update}
              matches={counts.matches}
              pending={playlist.pending}
              error={playlist.error}
              onSend={() => playlist.send(result.versionId, true)}
              onRetry={() => playlist.send(result.versionId, false)}
              onFreshPreview={loadFreshPreview}
            />
          ) : null
        }
      />
    );
  }

  function statusPart() {
    if (statusError !== null) {
      return (
        <div className={styles.flow}>
          <ScreenError
            key={statusError.key}
            error={statusError.error}
            headingLevel={1}
            retrying={statusError.retrying}
            onRetry={() => void statusQuery.refetch()}
          />
        </div>
      );
    }
    if (status === undefined) return <LoadingLine text="Loading the Setlist…" />;
    return (
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
              <p>
                {counted(counts.matches, "song", "songs")}, public in {PLAYSET_SPOTIFY_ACCOUNT}.
              </p>
            </PlaylistPanel>
          ) : null}
        </div>
        {previewPart()}
      </>
    );
  }

  return (
    <div>
      {listLink === undefined ? (
        <BackLink to="/" label="New search" />
      ) : (
        <BackLink to={listLink.to} label={listLink.label} state={listLink.state} />
      )}
      {statusPart()}
    </div>
  );
}
