// The SQLite adapter of the records, cached previews, usage events and the stored Host token: the only
// place with SQL, and every value goes in as a parameter. Cached previews are stored whole, Match URIs
// and Miss queries included, because create-or-update puts exactly the previewed Matches in.
import type { Database } from "better-sqlite3";
import type { MatchPreview, SetlistPlaylistRecord, SetlistPlaylistRecords } from "../../core/index.js";
import { z } from "zod";
import type { HostTokenStore, StoredHostToken } from "./host-tokens.js";
import { PLAYLIST_MADE_KINDS, topArtistsOf, usageDays, type UsageEventKind, type UsageEvents } from "./usage-events.js";

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
  -- The kinds below are UsageEventKind (usage-events.ts); change both together.
  CREATE TABLE IF NOT EXISTS usage_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL CHECK (kind IN ('created', 'updated', 'opened')),
    setlist_id TEXT NOT NULL,
    artist TEXT NOT NULL,
    day TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS usage_events_by_day ON usage_events (day, kind);
  -- One row at most: only the Host Account's one login is ever kept.
  CREATE TABLE IF NOT EXISTS host_token (
    slot INTEGER PRIMARY KEY CHECK (slot = 1),
    account_id TEXT NOT NULL,
    display_name TEXT,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );
`;

const matchShape = z.object({ kind: z.literal("match"), uri: z.string(), name: z.string(), artists: z.array(z.string()) });
const missShape = z.object({ kind: z.literal("miss"), title: z.string(), artist: z.string(), queries: z.array(z.string()) });

/**
 * Enough of a cached preview's shape to answer from it and create from its Matches. A row that doesn't
 * have it (a cut-off write, an older layout) is no cached preview, so a fresh Matching replaces it.
 */
const cachedPreviewShape = z.object({
  rows: z.array(
    z.object({
      number: z.number(),
      performance: z.object({ title: z.string() }),
      outcome: z.discriminatedUnion("kind", [matchShape, missShape]),
    }),
  ),
  matches: z.array(matchShape),
  misses: z.array(missShape),
  playlistName: z.string(),
});

/** Every real MatchPreview passes the check: the shape asks only for what a MatchPreview has. */
type CachedPreviewFits = MatchPreview extends z.infer<typeof cachedPreviewShape> ? true : false;
/** Fails to compile when `CachedPreviewFits` is `false`; nothing of it is left at run time. */
type Holds<T extends true> = T;
/** Exported only so the compile-time check above isn't flagged as unused; nothing imports it. */
export type CachedPreviewShapeHolds = Holds<CachedPreviewFits>;

/** The stored cached preview, or undefined when it isn't JSON or isn't a cached preview. */
function cachedPreviewOf(stored: string): MatchPreview | undefined {
  let value: unknown;
  try {
    value = JSON.parse(stored);
  } catch {
    return undefined;
  }
  // The check only says yes or no; the stored value is given back whole, every field kept.
  return cachedPreviewShape.safeParse(value).success ? (value as MatchPreview) : undefined;
}

interface RecordRow {
  setlist_id: string;
  playlist_id: string;
  share_url: string;
  version_id: string | null;
  created_at: string;
}

interface HostTokenRow {
  account_id: string;
  display_name: string | null;
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

/** Creates the tables if missing (an existing database keeps every row) and gives its stores. */
export function createSqliteStore(db: Database): {
  records: SetlistPlaylistRecords;
  events: UsageEvents;
  hostTokenStore: HostTokenStore;
} {
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
  // The same kinds as the memory adapter counts (isPlaylistMade), one parameter per kind.
  const madeKinds = PLAYLIST_MADE_KINDS.map(() => "?").join(", ");
  const countPlaylistsMade = db.prepare<[string, ...string[]], { made: number }>(
    `SELECT COUNT(*) AS made FROM usage_events WHERE day = ? AND kind IN (${madeKinds})`,
  );

  const countByKind = db.prepare<[], { kind: UsageEventKind; n: number }>(
    "SELECT kind, COUNT(*) AS n FROM usage_events GROUP BY kind",
  );
  const countByDayAndKind = db.prepare<[string, string], { day: string; kind: UsageEventKind; n: number }>(
    "SELECT day, kind, COUNT(*) AS n FROM usage_events WHERE day BETWEEN ? AND ? GROUP BY day, kind",
  );
  const setlistsPerArtist = db.prepare<string[], { artist: string; n: number }>(
    `SELECT artist, COUNT(DISTINCT setlist_id) AS n FROM usage_events WHERE kind IN (${madeKinds}) GROUP BY artist`,
  );
  const readHostToken = db.prepare<[], HostTokenRow>(
    "SELECT account_id, display_name, access_token, refresh_token, expires_at FROM host_token WHERE slot = 1",
  );
  const saveHostToken = db.prepare<[string, string | null, string, string, number]>(
    "INSERT OR REPLACE INTO host_token (slot, account_id, display_name, access_token, refresh_token, expires_at) VALUES (1, ?, ?, ?, ?, ?)",
  );
  const clearHostToken = db.prepare("DELETE FROM host_token");

  const records: SetlistPlaylistRecords = {
    findRecord: async (setlistId) => {
      const row = findRecord.get(setlistId);
      if (row === undefined) return undefined;
      return {
        setlistId: row.setlist_id,
        playlistId: row.playlist_id,
        shareUrl: row.share_url,
        versionId: row.version_id,
        createdAt: row.created_at,
      } satisfies SetlistPlaylistRecord;
    },
    saveRecord: async ({ setlistId, playlistId, shareUrl, versionId, createdAt }) => {
      saveRecord.run(setlistId, playlistId, shareUrl, versionId, createdAt);
    },
    findPreview: async (setlistId, versionId) => {
      const row = findPreview.get(setlistId, versionId);
      return row === undefined ? undefined : cachedPreviewOf(row.preview);
    },
    savePreview: async (setlistId, versionId, preview) => {
      savePreview.run(setlistId, versionId, JSON.stringify(preview));
    },
  };

  const events: UsageEvents = {
    recordEvent: async ({ kind, setlistId, artist, day }) => {
      recordEvent.run(kind, setlistId, artist, day);
    },
    countPlaylistsMade: async (day) => countPlaylistsMade.get(day, ...PLAYLIST_MADE_KINDS)?.made ?? 0,
    readUsage: async (today) => {
      const days = usageDays(today);
      const totals = new Map(countByKind.all().map(({ kind, n }) => [kind, n]));
      const counted = new Map(
        countByDayAndKind.all(days.at(-1)!, days[0]!).map(({ day, kind, n }) => [`${day} ${kind}`, n]),
      );
      const count = (date: string, kind: UsageEventKind) => counted.get(`${date} ${kind}`) ?? 0;
      return {
        playlistsMade: PLAYLIST_MADE_KINDS.reduce((sum, kind) => sum + (totals.get(kind) ?? 0), 0),
        opens: totals.get("opened") ?? 0,
        perDay: days.map((date) => ({
          date,
          created: count(date, "created"),
          updated: count(date, "updated"),
          opened: count(date, "opened"),
        })),
        topArtists: topArtistsOf(new Map(setlistsPerArtist.all(...PLAYLIST_MADE_KINDS).map(({ artist, n }) => [artist, n]))),
      };
    },
  };

  const hostTokenStore: HostTokenStore = {
    read: async () => {
      const row = readHostToken.get();
      if (row === undefined) return undefined;
      return {
        accountId: row.account_id,
        ...(row.display_name === null ? {} : { displayName: row.display_name }),
        accessToken: row.access_token,
        refreshToken: row.refresh_token,
        expiresAt: row.expires_at,
      } satisfies StoredHostToken;
    },
    save: async ({ accountId, displayName, accessToken, refreshToken, expiresAt }) => {
      saveHostToken.run(accountId, displayName ?? null, accessToken, refreshToken, expiresAt);
    },
    clear: async () => {
      clearHostToken.run();
    },
  };

  return { records, events, hostTokenStore };
}
