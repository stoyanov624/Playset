// What the Host Account keeps per Setlist: the record of its one Setlist Playlist, and the previews already
// made per setlist.fm version, so Create puts exactly the previewed Matches in and nobody searches twice.
import type { MatchPreview } from "./types.js";

/** The Setlist Playlist the Host Account holds for one Setlist. */
export interface SetlistPlaylistRecord {
  setlistId: string;
  playlistId: string;
  shareUrl: string;
  /**
   * The setlist.fm version the playlist fully holds; null when it was only partly filled, so it counts as
   * outdated and the next create-or-update fills it in place instead of making another one.
   */
  versionId: string | null;
  /** When the playlist was created, ISO 8601 UTC; an update keeps it. */
  createdAt: string;
}

/**
 * The store of records and cached previews. Every method answers with a Promise, so a database adapter and
 * the in-memory one fit the same seam.
 */
export interface SetlistPlaylistRecords {
  findRecord(setlistId: string): Promise<SetlistPlaylistRecord | undefined>;
  /** Replaces the record of that setlist id. */
  saveRecord(record: SetlistPlaylistRecord): Promise<void>;
  findPreview(setlistId: string, versionId: string): Promise<MatchPreview | undefined>;
  /** Replaces the cached preview of that setlist id and version; other versions stay. */
  savePreview(setlistId: string, versionId: string, preview: MatchPreview): Promise<void>;
}

/** Records kept in memory only, for tests and a front-end that needs nothing to outlive it. */
export function createMemorySetlistPlaylistRecords(): SetlistPlaylistRecords {
  const records = new Map<string, SetlistPlaylistRecord>();
  const previews = new Map<string, MatchPreview>();
  // JSON keeps the setlist id and version apart whatever characters they hold.
  const previewKey = (setlistId: string, versionId: string) => JSON.stringify([setlistId, versionId]);

  return {
    findRecord: async (setlistId) => {
      const record = records.get(setlistId);
      return record === undefined ? undefined : { ...record };
    },
    saveRecord: async (record) => {
      records.set(record.setlistId, { ...record });
    },
    findPreview: async (setlistId, versionId) => previews.get(previewKey(setlistId, versionId)),
    savePreview: async (setlistId, versionId, preview) => {
      previews.set(previewKey(setlistId, versionId), preview);
    },
  };
}
