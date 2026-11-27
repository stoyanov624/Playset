import type { Match } from "../matching/index.js";
import type { Show } from "../performances/index.js";
import { NothingToAddError, PartlyCreatedPlaylistError, playlistRequestFailed, SpotifyPlaylistError } from "./errors.js";
import { setlistPlaylistDescription, setlistPlaylistName } from "./name.js";
import { MY_PLAYLISTS_URL, playlistItemsUrl, shareUrlFor, type SpotifyPlaylist } from "./spotify-playlist.js";
import { sendSpotifyRequest, type SpotifyPlaylistOptions } from "./spotify-request.js";

/** Spotify accepts at most 100 URIs per add-items (or replace-items) request. */
export const BATCH_SIZE = 100;

export interface CreateSetlistPlaylistOptions extends SpotifyPlaylistOptions {
  /** Private unless set to true. */
  public?: boolean;
}

export interface CreatedSetlistPlaylist extends SpotifyPlaylist {
  /** Number of Matches added, repeats included. */
  trackCount: number;
}

/**
 * Creates a new Setlist Playlist and adds every Match's URI in played order, 100 per request,
 * one request after another. Never reuses or deletes a playlist.
 */
export async function createSetlistPlaylist(
  show: Show,
  matches: Match[],
  options: CreateSetlistPlaylistOptions,
): Promise<CreatedSetlistPlaylist> {
  const name = setlistPlaylistName(show);
  const description = setlistPlaylistDescription(show);
  if (matches.length === 0) throw new NothingToAddError();

  let created: { id?: unknown; external_urls?: { spotify?: unknown } } | undefined;
  try {
    created = (await sendSpotifyRequest(
      { method: "POST", url: MY_PLAYLISTS_URL, body: { name, description, public: options.public === true }, what: "create playlist" },
      options,
    )) as typeof created;
  } catch (err) {
    throw playlistRequestFailed("Could not create the Setlist Playlist, so no playlist was created.", err);
  }
  if (typeof created?.id !== "string" || !created.id) {
    throw new SpotifyPlaylistError("Spotify's create playlist response had no playlist id, so no playlist was created.");
  }
  const id = created.id;
  const shareUrl = typeof created.external_urls?.spotify === "string" ? created.external_urls.spotify : shareUrlFor(id);

  const uris = matches.map((match) => match.uri);
  await addInBatches(id, uris, 0, options, (tracksAdded, cause) =>
    new PartlyCreatedPlaylistError({ playlistId: id, shareUrl, tracksAdded, totalMatches: uris.length, cause }),
  );

  return { id, shareUrl, name, trackCount: uris.length };
}

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
