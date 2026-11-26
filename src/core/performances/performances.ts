import type {
  NotedReason,
  NotedSong,
  Performance,
  PerformancesResult,
  SetlistFmSet,
  SetlistFmSetlist,
  SetlistFmSong,
  Show,
} from "./types.js";

const MEDLEY_SEPARATOR = " / ";

/**
 * Turns a setlist.fm Setlist into Performances in played order, plus the noted
 * songs (snippets/teasers and medleys) and the Show details. Pure: never mutates its input.
 */
export function toPerformances(setlist: SetlistFmSetlist): PerformancesResult {
  const artist = setlist.artist.name;
  const performances: Performance[] = [];
  const noted: NotedSong[] = [];

  for (const set of setlist.sets?.set ?? []) {
    const setLabel = labelOf(set);
    for (const song of set.song ?? []) {
      const rawName = song.name ?? "";
      const title = rawName.trim();
      if (title === "") continue;

      const reason = notedReasonOf(song, rawName);
      if (reason !== undefined) {
        noted.push({ rawName, reason, setLabel, afterPosition: performances.length });
        continue;
      }

      const performance: Performance = {
        position: performances.length + 1,
        title,
        artist,
        setLabel,
        isTape: song.tape === true,
      };
      const originalArtist = song.cover?.name?.trim();
      if (originalArtist) performance.originalArtist = originalArtist;
      performances.push(performance);
    }
  }

  return { show: showOf(setlist), performances, noted };
}

/** Titles of the Tape Performances, in played order (repeats kept). */
export function listTapes(performances: readonly Performance[]): string[] {
  return performances.filter((p) => p.isTape).map((p) => p.title);
}

function labelOf(set: SetlistFmSet): string {
  if (set.encore !== undefined) return `Encore ${set.encore}`;
  return set.name ? set.name : "main";
}

function notedReasonOf(song: SetlistFmSong, rawName: string): NotedReason | undefined {
  const info = (song.info ?? "").toLowerCase();
  if (info.includes("snippet") || info.trimStart().startsWith("tease")) return "snippet";
  if (rawName.includes(MEDLEY_SEPARATOR) || info.includes("medley")) return "medley";
  return undefined;
}

function showOf(setlist: SetlistFmSetlist): Show {
  return {
    artist: setlist.artist.name,
    date: toIsoDate(setlist.eventDate),
    city: setlist.venue.city.name,
    venue: setlist.venue.name,
    url: setlist.url,
  };
}

/** "dd-MM-yyyy" → "YYYY-MM-DD". */
function toIsoDate(eventDate: string): string {
  const [day, month, year] = eventDate.split("-");
  return `${year}-${month}-${day}`;
}
