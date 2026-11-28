import { useMutation } from "@tanstack/react-query";
import { useRef } from "react";
import { useAnnounce } from "../context/announcer.js";
import { useApi } from "../context/api.js";
import { useShownError } from "./useShownError.js";

/**
 * Creates or updates the Setlist Playlist. Never cancelled on leaving: the server finishes a
 * playlist it has started. A second activation while one is on its way sends nothing.
 */
export function useCreatePlaylist(id: string, update: boolean) {
  const api = useApi();
  const announce = useAnnounce();
  const create = useMutation({ mutationFn: (versionId: string) => api.createPlaylist(id, versionId) });
  const error = useShownError(create.error, create.isPending);
  const sending = useRef(false);

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

  return { made: create.data, pending: create.isPending, error, send, reset: create.reset };
}
