// Writing a Setlist Playlist's tracks in Spotify-sized batches; shared by creating and updating it.
import { playlistItemsUrl } from "./spotify-playlist.js";
import { sendSpotifyRequest, type SpotifyPlaylistOptions } from "./spotify-request.js";

/** Spotify accepts at most 100 URIs per add-items (or replace-items) request. */
export const BATCH_SIZE = 100;

/**
 * Adds `uris` from `from` on, in played order, 100 per request, one request after another. When a request
 * fails, nothing more is sent and the error from `partly` (given the tracks written so far) is raised.
 */
export async function addInBatches(
  playlistId: string,
  uris: readonly string[],
  from: number,
  options: SpotifyPlaylistOptions,
  partly: (tracksWritten: number, cause: unknown) => Error,
): Promise<void> {
  let tracksWritten = from;
  while (tracksWritten < uris.length) {
    const batch = uris.slice(tracksWritten, tracksWritten + BATCH_SIZE);
    try {
      await sendSpotifyRequest(
        { method: "POST", url: playlistItemsUrl(playlistId), body: { uris: batch }, what: "add tracks" },
        options,
      );
    } catch (cause) {
      throw partly(tracksWritten, cause);
    }
    tracksWritten += batch.length;
  }
}
