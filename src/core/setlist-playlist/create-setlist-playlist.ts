import type { Match } from "../matching/index.js";
import type { Show } from "../performances/index.js";
import { NothingToAddError, PartlyCreatedPlaylistError, playlistRequestFailed, SpotifyPlaylistError } from "./errors.js";
import { setlistPlaylistDescription, setlistPlaylistName } from "./name.js";
import { addInBatches } from "./playlist-items.js";
import { MY_PLAYLISTS_URL, shareUrlFor, type SpotifyPlaylist } from "./spotify-playlist.js";
import { sendSpotifyRequest, type SpotifyPlaylistOptions } from "./spotify-request.js";

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
