// Updating a Setlist Playlist in place, so its link stays the same after the Setlist was edited: replace its
// tracks, add the rest, then set its name and description again (the date, venue or city may have changed).
import type { Match } from "../matching/index.js";
import type { Show } from "../performances/index.js";
import { addInBatches, BATCH_SIZE, type CreatedSetlistPlaylist } from "./create-setlist-playlist.js";
import { NothingToAddError, PartlyUpdatedPlaylistError, SpotifyPlaylistError } from "./errors.js";
import { setlistPlaylistDescription, setlistPlaylistName } from "./name.js";
import { playlistItemsUrl, playlistUrl } from "./spotify-playlist.js";
import { sendSpotifyRequest, type SpotifyPlaylistOptions } from "./spotify-request.js";

/** The playlist to update, as recorded when it was created. */
export interface PlaylistToUpdate {
  id: string;
  shareUrl: string;
}

/**
 * The updated Setlist Playlist, or `held: false` when the account no longer holds that playlist (it was
 * deleted, which on Spotify means unfollowed, or never existed); then nothing was changed.
 */
export type SetlistPlaylistUpdate = { held: true; playlist: CreatedSetlistPlaylist } | { held: false };

/**
 * Replaces every track of the playlist with the Matches in played order, then sets its name and
 * description. The replace goes first because it is also the check that the account still holds the
 * playlist: Spotify answers it 404 on a deleted playlist, while adding to one answers 502, which can't be
 * told apart from an outage. The public setting is left as it is.
 */
export async function updateSetlistPlaylist(
  playlist: PlaylistToUpdate,
  show: Show,
  matches: Match[],
  options: SpotifyPlaylistOptions,
): Promise<SetlistPlaylistUpdate> {
  const name = setlistPlaylistName(show);
  const description = setlistPlaylistDescription(show);
  // An update with nothing would empty a playlist people may already follow.
  if (matches.length === 0) {
    throw new NothingToAddError("There are no Matches to add, so the Setlist Playlist was not changed.");
  }

  const uris = matches.map((match) => match.uri);
  const firstBatch = uris.slice(0, BATCH_SIZE);
  try {
    await sendSpotifyRequest(
      { method: "PUT", url: playlistItemsUrl(playlist.id), body: { uris: firstBatch }, what: "replace tracks" },
      options,
    );
  } catch (err) {
    if (err instanceof SpotifyPlaylistError && err.status === 404) return { held: false };
    throw notChanged(err);
  }

  const partly = (tracksWritten: number, cause: unknown) =>
    new PartlyUpdatedPlaylistError({
      playlistId: playlist.id,
      shareUrl: playlist.shareUrl,
      tracksWritten,
      totalMatches: uris.length,
      cause,
    });
  await addInBatches(playlist.id, uris, firstBatch.length, options, partly);
  try {
    await sendSpotifyRequest(
      { method: "PUT", url: playlistUrl(playlist.id), body: { name, description }, what: "change playlist details" },
      options,
    );
  } catch (cause) {
    throw partly(uris.length, cause);
  }

  return { held: true, playlist: { id: playlist.id, shareUrl: playlist.shareUrl, name, trackCount: uris.length } };
}

function notChanged(cause: unknown): SpotifyPlaylistError {
  const reason = cause instanceof Error ? cause.message : String(cause);
  const status = cause instanceof SpotifyPlaylistError ? cause.status : undefined;
  return new SpotifyPlaylistError(`Could not update the Setlist Playlist, so it was not changed. ${reason}`, {
    status,
    cause,
  });
}
