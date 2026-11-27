// The Host Account's steps: it keeps exactly one public Setlist Playlist per Setlist, so the account never
// fills up with copies. Like the other steps they remember nothing between calls; the records and the
// cached previews live in the injected SetlistPlaylistRecords.
import type { Match } from "../matching/index.js";
import type { SetlistFmSetlist } from "../performances/index.js";
import { NothingToAddError, PartlyCreatedPlaylistError } from "../setlist-playlist/index.js";
import { MissingSetlistVersionError, SetlistChangedError } from "./errors.js";
import type { SetlistPlaylistRecords } from "./records.js";
import { prepareSetlist, previewMatches, versionOf } from "./steps.js";
import type { CreatedPlaylist, HostPlaylistServices, PreparedSetlist, RunServices } from "./types.js";

/**
 * The recorded Setlist Playlist of a Setlist: `current` when it holds the given version, `outdated` when it
 * holds another one or was only partly filled.
 */
export type SetlistPlaylistLookup =
  | { kind: "none" }
  | { kind: "current" | "outdated"; playlistId: string; shareUrl: string };

export interface CreateOrUpdateSetlistPlaylistOptions {
  /** The Host Account's Spotify access token. Never included in errors. */
  accessToken: string;
  records: SetlistPlaylistRecords;
  /** Milliseconds since the epoch, for when a playlist was created. Defaults to `Date.now`. */
  now?: () => number;
}

export interface CreateOrUpdateResult {
  /** `created` also when the recorded playlist was no longer held and a new one replaced it. */
  status: "created" | "updated";
  playlist: CreatedPlaylist;
}

export type HostServices = Pick<RunServices, "findMatch" | "createSetlistPlaylist"> & HostPlaylistServices;

/**
 * Asks only the records, never Spotify: a playlist the Host Account deleted still opens by its public link,
 * so the recorded link is worth giving; whether it is still held is learned when it is next written.
 */
export async function findSetlistPlaylist(
  setlistId: string,
  versionId: string,
  { records }: { records: SetlistPlaylistRecords },
): Promise<SetlistPlaylistLookup> {
  const record = await records.findRecord(setlistId);
  if (record === undefined) return { kind: "none" };
  return {
    kind: record.versionId === versionId ? "current" : "outdated",
    playlistId: record.playlistId,
    shareUrl: record.shareUrl,
  };
}

/**
 * Makes the Setlist's one Setlist Playlist mirror the Setlist as just fetched: updates the recorded
 * playlist in place, or creates a public one when there is no record or the account no longer holds it.
 * Every Tape is left out, and the Matches are those of the preview cached for this version, so Create puts
 * in exactly what the Visitor saw.
 */
export async function createOrUpdateSetlistPlaylist(
  services: HostServices,
  setlist: SetlistFmSetlist,
  previewedVersionId: string,
  { accessToken, records, now = Date.now }: CreateOrUpdateSetlistPlaylistOptions,
): Promise<CreateOrUpdateResult> {
  const setlistId = setlist.id;
  const versionId = versionOf(setlist);
  if (!setlistId || versionId === undefined) throw new MissingSetlistVersionError(setlistId || "unknown");
  if (previewedVersionId !== versionId) throw new SetlistChangedError(previewedVersionId, versionId);

  const prepared = await prepareSetlist(setlist, { keepTape: async () => false });
  const { matches } = await previewMatches(services, prepared, accessToken, { records });
  // Checked before the record is used, so an existing Setlist Playlist is never emptied.
  if (matches.length === 0) throw new NothingToAddError();

  const record = await records.findRecord(setlistId);
  if (record !== undefined) {
    const update = await services.updateSetlistPlaylist(
      { id: record.playlistId, shareUrl: record.shareUrl },
      prepared.show,
      matches,
      { accessToken },
    );
    if (update.held) {
      const { playlistId, shareUrl, createdAt } = record;
      await records.saveRecord({ setlistId, playlistId, shareUrl, versionId, createdAt });
      return { status: "updated", playlist: update.playlist };
    }
  }
  return create(services, prepared, matches, { setlistId, versionId, accessToken, records, now });
}

async function create(
  services: HostServices,
  prepared: PreparedSetlist,
  matches: Match[],
  details: { setlistId: string; versionId: string; accessToken: string; records: SetlistPlaylistRecords; now: () => number },
): Promise<CreateOrUpdateResult> {
  const { setlistId, versionId, accessToken, records } = details;
  const createdAt = new Date(details.now()).toISOString();
  let playlist: CreatedPlaylist;
  try {
    // Host Setlist Playlists are public: Spotify shows a private playlist to nobody else, even by link.
    playlist = await services.createSetlistPlaylist(prepared.show, matches, { accessToken, public: true });
  } catch (err) {
    // Recorded without a version, so the next call fills this playlist in place instead of making another.
    if (err instanceof PartlyCreatedPlaylistError) {
      await records.saveRecord({ setlistId, playlistId: err.playlistId, shareUrl: err.shareUrl, versionId: null, createdAt });
    }
    throw err;
  }
  await records.saveRecord({ setlistId, playlistId: playlist.id, shareUrl: playlist.shareUrl, versionId, createdAt });
  return { status: "created", playlist };
}
