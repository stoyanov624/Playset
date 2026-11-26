import type { Match } from "../matching/index.js";
import type { Show } from "../performances/index.js";
import { shareUrlFor } from "./duplicate-check.js";
import { NothingToAddError, PartlyCreatedPlaylistError, SpotifyPlaylistError } from "./errors.js";
import { setlistPlaylistDescription, setlistPlaylistName } from "./name.js";
import { sendSpotifyRequest, type SpotifyPlaylistOptions } from "./spotify-request.js";

const CREATE_URL = "https://api.spotify.com/v1/me/playlists";
/** Spotify accepts at most 100 URIs per add-items request. */
const BATCH_SIZE = 100;

export interface CreateSetlistPlaylistOptions extends SpotifyPlaylistOptions {
  /** Private unless set to true. */
  public?: boolean;
}

export interface CreatedSetlistPlaylist {
  id: string;
  shareUrl: string;
  name: string;
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
      { method: "POST", url: CREATE_URL, body: { name, description, public: options.public === true }, what: "create playlist" },
      options,
    )) as typeof created;
  } catch (err) {
    throw notCreated(err);
  }
  if (typeof created?.id !== "string" || !created.id) {
    throw new SpotifyPlaylistError("Spotify's create playlist response had no playlist id, so no playlist was created.");
  }
  const id = created.id;
  const shareUrl = typeof created.external_urls?.spotify === "string" ? created.external_urls.spotify : shareUrlFor(id);

  const uris = matches.map((match) => match.uri);
  let tracksAdded = 0;
  while (tracksAdded < uris.length) {
    const batch = uris.slice(tracksAdded, tracksAdded + BATCH_SIZE);
    try {
      await sendSpotifyRequest(
        { method: "POST", url: `https://api.spotify.com/v1/playlists/${encodeURIComponent(id)}/items`, body: { uris: batch }, what: "add tracks" },
        options,
      );
    } catch (cause) {
      throw new PartlyCreatedPlaylistError({ playlistId: id, shareUrl, tracksAdded, totalMatches: uris.length, cause });
    }
    tracksAdded += batch.length;
  }

  return { id, shareUrl, name, trackCount: uris.length };
}

function notCreated(cause: unknown): SpotifyPlaylistError {
  const reason = cause instanceof Error ? cause.message : String(cause);
  const status = cause instanceof SpotifyPlaylistError ? cause.status : undefined;
  return new SpotifyPlaylistError(`Could not create the Setlist Playlist, so no playlist was created. ${reason}`, {
    status,
    cause,
  });
}
