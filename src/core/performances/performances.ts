import { incompleteStatusOf } from "./incomplete.js";
import type {
  NotedSong,
  NotedUnknownSong,
  Performance,
  PerformancesResult,
  SetlistFmSet,
  SetlistFmSetlist,
  SetlistFmSong,
  Show,
} from "./types.js";

/**
 * Joins the songs of a medley in a song's name: " / ", one space on each side. A "+" in any form
 * is part of a title, never a separator (PRD 0010).
 */
const MEDLEY_SEPARATOR = " / ";

/**
 * Turns a setlist.fm Setlist into Performances in played order, plus the noted songs (snippets/teasers
 * and Unknown Songs), the Show details and the incomplete status. A medley is split into one Performance
 * per part, each carrying the medley name. Pure: never mutates its input.
 */
export function toPerformances(setlist: SetlistFmSetlist): PerformancesResult {
  const artist = setlist.artist.name;
  const performances: Performance[] = [];
  const noted: NotedSong[] = [];

  for (const set of setlist.sets?.set ?? []) {
    const setLabel = labelOf(set);
    for (const song of set.song ?? []) {
      const rawName = song.name ?? "";
      const name = rawName.trim();
      // An Unknown Song wins over every other marker (snippet, medley, tape, cover, guest).
      if (name === "") {
        noted.push(unknownSong(song, rawName, setLabel, performances.length));
        continue;
      }

      if (isSnippet(song)) {
        noted.push({ rawName, reason: "snippet", setLabel, afterPosition: performances.length });
        continue;
      }

      const { titles, medley } = partsOf(song, name);
      const originalArtist = song.cover?.name?.trim();
      for (const title of titles) {
        const performance: Performance = {
          position: performances.length + 1,
          title,
          artist,
          setLabel,
          isTape: song.tape === true,
        };
        if (originalArtist) performance.originalArtist = originalArtist;
        if (medley !== undefined) performance.medley = medley;
        performances.push(performance);
      }
    }
  }

  const unknownSongCount = noted.filter((song) => song.reason === "unknown").length;
  return {
    show: showOf(setlist),
    performances,
    noted,
    incompleteStatus: incompleteStatusOf(unknownSongCount, setlist.info),
  };
}

function unknownSong(song: SetlistFmSong, rawName: string, setLabel: string, afterPosition: number): NotedUnknownSong {
  const noted: NotedUnknownSong = { rawName, reason: "unknown", setLabel, afterPosition };
  const info = song.info?.trim();
  if (info) noted.info = info;
  return noted;
}

/**
 * The titles a song becomes and its medley name, if any. A name with a medley separator is split
 * into its trimmed, non-empty parts; a name marked "medley" only in its info stays whole.
 */
function partsOf(song: SetlistFmSong, name: string): { titles: string[]; medley?: string } {
  if (name.includes(MEDLEY_SEPARATOR)) {
    const titles = name
      .split(MEDLEY_SEPARATOR)
      .map((part) => part.trim())
      .filter((part) => part !== "");
    return { titles, medley: name };
  }
  if ((song.info ?? "").toLowerCase().includes("medley")) return { titles: [name], medley: name };
  return { titles: [name] };
}

/** Titles of the Tape Performances, in played order (repeats kept). */
export function listTapes(performances: readonly Performance[]): string[] {
  return performances.filter((p) => p.isTape).map((p) => p.title);
}

function labelOf(set: SetlistFmSet): string {
  if (set.encore !== undefined) return `Encore ${set.encore}`;
  return set.name ? set.name : "main";
}

/** A snippet or teaser: noted, never a Performance (and never split). */
function isSnippet(song: SetlistFmSong): boolean {
  const info = (song.info ?? "").toLowerCase();
  return info.includes("snippet") || info.trimStart().startsWith("tease");
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
