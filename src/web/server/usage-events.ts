// Usage events: one per Setlist Playlist created, updated or opened, for the daily limit and the
// admin's usage numbers. They hold no Visitor address.
import { LIMITS, type AdminStatusResponse } from "../shared/index.js";

export type UsageEventKind = "created" | "updated" | "opened";

export interface UsageEvent {
  kind: UsageEventKind;
  setlistId: string;
  /** The Show's Artist name. */
  artist: string;
  /** The UTC day, `YYYY-MM-DD`. */
  day: string;
}

export interface UsageEvents {
  recordEvent(event: UsageEvent): Promise<void>;
  /** Setlist Playlists created or updated that day; opens never count. */
  countPlaylistsMade(day: string): Promise<number>;
  /** The admin's usage numbers, with the last days counted back from `today` (`YYYY-MM-DD`). */
  readUsage(today: string): Promise<Usage>;
}

export type Usage = AdminStatusResponse["usage"];

const DAY_MS = 24 * 60 * 60 * 1000;

/** The UTC days the admin sees, `today` first. */
export function usageDays(today: string): string[] {
  const start = Date.parse(`${today}T00:00:00.000Z`);
  return Array.from({ length: LIMITS.usageDays }, (_, i) => new Date(start - i * DAY_MS).toISOString().slice(0, 10));
}

/** Orders strings by Unicode code point (`<` on strings compares UTF-16 units, which puts astral characters before U+E000 and up). */
function compareCodePoints(a: string, b: string): number {
  const x = Array.from(a);
  const y = Array.from(b);
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const d = x[i]!.codePointAt(0)! - y[i]!.codePointAt(0)!;
    if (d !== 0) return d;
  }
  return x.length - y.length;
}

/** Most Setlist Playlists first; a tie goes by the Artist name as stored, in code-point order. */
export function topArtistsOf(setlistsPerArtist: Map<string, number>): Usage["topArtists"] {
  return [...setlistsPerArtist]
    .map(([artist, playlistCount]) => ({ artist, playlistCount }))
    .sort((x, y) => y.playlistCount - x.playlistCount || compareCodePoints(x.artist, y.artist))
    .slice(0, LIMITS.topArtistsMax);
}

/** The kinds that are a Setlist Playlist made, as the daily limit counts them (the SQLite count uses them too). */
export const PLAYLIST_MADE_KINDS = ["created", "updated"] as const satisfies readonly UsageEventKind[];

/** Whether an event is a Setlist Playlist made, as the daily limit counts them. */
const isPlaylistMade = (kind: UsageEventKind): boolean => (PLAYLIST_MADE_KINDS as readonly string[]).includes(kind);

/** Usage events kept in memory only, for tests. */
export function createMemoryUsageEvents(): UsageEvents {
  const events: UsageEvent[] = [];
  return {
    recordEvent: async (event) => {
      events.push({ ...event });
    },
    countPlaylistsMade: async (day) => events.filter((event) => event.day === day && isPlaylistMade(event.kind)).length,
    readUsage: async (today) => {
      const perDay = usageDays(today).map((date) => {
        const ofDay = events.filter((event) => event.day === date);
        const count = (kind: UsageEventKind) => ofDay.filter((event) => event.kind === kind).length;
        return { date, created: count("created"), updated: count("updated"), opened: count("opened") };
      });
      const made = events.filter((event) => isPlaylistMade(event.kind));
      const setlistsPerArtist = new Map<string, Set<string>>();
      for (const { artist, setlistId } of made) {
        setlistsPerArtist.set(artist, (setlistsPerArtist.get(artist) ?? new Set()).add(setlistId));
      }
      return {
        playlistsMade: made.length,
        opens: events.filter((event) => event.kind === "opened").length,
        perDay,
        topArtists: topArtistsOf(new Map([...setlistsPerArtist].map(([artist, ids]) => [artist, ids.size]))),
      };
    },
  };
}
