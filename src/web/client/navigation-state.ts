// What one screen tells the next through the browser history: the Artist's name for the Setlist
// list heading, and the list a Setlist was opened from for its back link.
export interface ArtistListState {
  artistName?: string | undefined;
}

export interface SetlistState {
  fromList: { mbid: string; artistName?: string | undefined };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function readArtistName(state: unknown): string | undefined {
  return isRecord(state) && typeof state.artistName === "string" ? state.artistName : undefined;
}

export function readFromList(state: unknown): SetlistState["fromList"] | undefined {
  if (!isRecord(state) || !isRecord(state.fromList)) return undefined;
  const { mbid, artistName } = state.fromList;
  if (typeof mbid !== "string") return undefined;
  return { mbid, artistName: typeof artistName === "string" ? artistName : undefined };
}
