import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import type { PreviewProgress } from "../../shared/index.js";
import { useAnnounce } from "../context/announcer.js";
import { useApi } from "../context/api.js";

/** Screen readers hear Matching progress at most this often; the counter on screen moves freely. */
const PROGRESS_ANNOUNCE_GAP_MS = 5000;

/**
 * The streamed preview of a Setlist, with its latest Matching progress. `freshPreviewCount` asks for a fresh
 * one; the preview is never reused from an earlier visit, as the Setlist may have changed.
 */
export function usePreviewStream(id: string, freshPreviewCount: number, enabled: boolean) {
  const api = useApi();
  const announce = useAnnounce();
  const [progress, setProgress] = useState<PreviewProgress | null>(null);
  const lastAnnouncement = useRef<number | null>(null);

  const query = useQuery({
    queryKey: ["preview", id, freshPreviewCount],
    queryFn: ({ signal }) => {
      // Each attempt, a retry included, starts counting from nothing.
      setProgress(null);
      lastAnnouncement.current = null;
      // Once the preview result is in, Matching is done: a late progress neither moves nor speaks.
      let done = false;
      return api.streamPreview(id, {
        signal,
        onProgress: (next) => {
          // A stream the Visitor already left says nothing more.
          if (signal.aborted || done) return;
          setProgress(next);
          const now = Date.now();
          const last = lastAnnouncement.current;
          if (last === null) {
            announce(`Matching ${next.total} Performances`);
            lastAnnouncement.current = now;
          } else if (now - last >= PROGRESS_ANNOUNCE_GAP_MS) {
            announce(`Matching ${next.n} of ${next.total}`);
            lastAnnouncement.current = now;
          }
        },
      }).then((result) => {
        done = true;
        return result;
      });
    },
    enabled,
    staleTime: 0,
    gcTime: 0,
  });

  return { query, progress, clearProgress: () => setProgress(null) };
}
