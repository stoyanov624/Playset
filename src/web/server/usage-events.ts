// Usage events: one per Setlist Playlist created, updated or opened, for the daily limit and the
// admin's usage numbers. They hold no Visitor address.

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
}

/** Whether an event is a Setlist Playlist made, as the daily limit counts them. */
const isPlaylistMade = (kind: UsageEventKind): boolean => kind === "created" || kind === "updated";

/** Usage events kept in memory only, for tests. */
export function createMemoryUsageEvents(): UsageEvents {
  const events: UsageEvent[] = [];
  return {
    recordEvent: async (event) => {
      events.push({ ...event });
    },
    countPlaylistsMade: async (day) => events.filter((event) => event.day === day && isPlaylistMade(event.kind)).length,
  };
}
