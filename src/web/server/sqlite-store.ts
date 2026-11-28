// The SQLite adapter of the records, cached previews and usage events: the only place with SQL, and
// every value goes in as a parameter. Cached previews are stored whole, Match URIs and Miss queries
// included, because create-or-update puts exactly the previewed Matches in.
import type { Database } from "better-sqlite3";
import type { MatchPreview, SetlistPlaylistRecord, SetlistPlaylistRecords } from "../../core/index.js";
import type { UsageEvents } from "./usage-events.js";

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS setlist_playlists (
    setlist_id TEXT PRIMARY KEY,
    playlist_id TEXT NOT NULL,
    share_url TEXT NOT NULL,
    version_id TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS cached_previews (
    setlist_id TEXT NOT NULL,
    version_id TEXT NOT NULL,
    preview TEXT NOT NULL,
    PRIMARY KEY (setlist_id, version_id)
  );
  CREATE TABLE IF NOT EXISTS usage_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL CHECK (kind IN ('created', 'updated', 'opened')),
    setlist_id TEXT NOT NULL,
    artist TEXT NOT NULL,
    day TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS usage_events_by_day ON usage_events (day, kind);
`;

interface RecordRow {
  setlist_id: string;
  playlist_id: string;
  share_url: string;
  version_id: string | null;
  created_at: string;
}

/** Creates the tables if missing (an existing database keeps every row) and gives its stores. */
export function createSqliteStore(db: Database): { records: SetlistPlaylistRecords; events: UsageEvents } {
  db.exec(SCHEMA);

  const findRecord = db.prepare<[string], RecordRow>(
    "SELECT setlist_id, playlist_id, share_url, version_id, created_at FROM setlist_playlists WHERE setlist_id = ?",
  );
  const saveRecord = db.prepare<[string, string, string, string | null, string]>(
    "INSERT OR REPLACE INTO setlist_playlists (setlist_id, playlist_id, share_url, version_id, created_at) VALUES (?, ?, ?, ?, ?)",
  );
  const findPreview = db.prepare<[string, string], { preview: string }>(
    "SELECT preview FROM cached_previews WHERE setlist_id = ? AND version_id = ?",
  );
  const savePreview = db.prepare<[string, string, string]>(
    "INSERT OR REPLACE INTO cached_previews (setlist_id, version_id, preview) VALUES (?, ?, ?)",
  );
  const recordEvent = db.prepare<[string, string, string, string]>(
    "INSERT INTO usage_events (kind, setlist_id, artist, day) VALUES (?, ?, ?, ?)",
  );
  const countPlaylistsMade = db.prepare<[string], { made: number }>(
    "SELECT COUNT(*) AS made FROM usage_events WHERE day = ? AND kind IN ('created', 'updated')",
  );

  const records: SetlistPlaylistRecords = {
    findRecord: async (setlistId) => {
      const row = findRecord.get(setlistId);
      if (row === undefined) return undefined;
      const record: SetlistPlaylistRecord = {
        setlistId: row.setlist_id,
        playlistId: row.playlist_id,
        shareUrl: row.share_url,
        versionId: row.version_id,
        createdAt: row.created_at,
      };
      return record;
    },
    saveRecord: async ({ setlistId, playlistId, shareUrl, versionId, createdAt }) => {
      saveRecord.run(setlistId, playlistId, shareUrl, versionId, createdAt);
    },
    findPreview: async (setlistId, versionId) => {
      const row = findPreview.get(setlistId, versionId);
      return row === undefined ? undefined : (JSON.parse(row.preview) as MatchPreview);
    },
    savePreview: async (setlistId, versionId, preview) => {
      savePreview.run(setlistId, versionId, JSON.stringify(preview));
    },
  };

  const events: UsageEvents = {
    recordEvent: async ({ kind, setlistId, artist, day }) => {
      recordEvent.run(kind, setlistId, artist, day);
    },
    countPlaylistsMade: async (day) => countPlaylistsMade.get(day)?.made ?? 0,
  };

  return { records, events };
}
