// How a preview becomes the sheet: one section per run of rows with the same Set, and each
// Unknown Song placed right after the row it followed in the Show.
import type { NotAdded, PreviewResult, PreviewRow } from "../../shared/index.js";

export type UnknownSong = Extract<NotAdded, { reason: "unknown" }>;

export type SheetItem = { kind: "row"; row: PreviewRow } | { kind: "unknown"; song: UnknownSong; order: number };

export interface SheetSection {
  /** The Set's heading; none when the preview has no rows, only Unknown Songs. */
  label: string | null;
  items: SheetItem[];
}

/** setlist.fm calls the main set "main"; every other Set label is shown as given. */
export function setHeading(setLabel: string): string {
  return setLabel === "main" ? "Main set" : setLabel;
}

function unknownSongs(result: PreviewResult): UnknownSong[] {
  return result.notAdded.filter((entry): entry is UnknownSong => entry.reason === "unknown");
}

export function buildSheet(result: PreviewResult): SheetSection[] {
  const unknown = unknownSongs(result).map((song, order) => ({ kind: "unknown" as const, song, order }));
  if (result.rows.length === 0) return unknown.length === 0 ? [] : [{ label: null, items: unknown }];

  const numbers = new Set(result.rows.map((row) => row.number));
  const after = (number: number) => unknown.filter((item) => item.song.after === number);
  // An Unknown Song whose row isn't in the preview keeps its place at the end rather than vanish.
  const stray = unknown.filter((item) => item.song.after !== 0 && !numbers.has(item.song.after));

  const sections: SheetSection[] = [];
  for (const row of result.rows) {
    let section = sections.at(-1);
    if (section === undefined || section.label !== row.performance.setLabel) {
      section = { label: row.performance.setLabel, items: sections.length === 0 ? after(0) : [] };
      sections.push(section);
    }
    section.items.push({ kind: "row", row }, ...after(row.number));
  }
  sections.at(-1)?.items.push(...stray);
  return sections;
}

export interface PreviewCounts {
  matches: number;
  misses: number;
  unknownSongs: number;
  tapes: number;
}

export function countPreview(result: PreviewResult): PreviewCounts {
  return {
    matches: result.rows.filter((row) => row.outcome.kind === "match").length,
    misses: result.rows.filter((row) => row.outcome.kind === "miss").length,
    unknownSongs: unknownSongs(result).length,
    tapes: result.notAdded.filter((entry) => entry.reason === "tape").length,
  };
}

/** The in-page target of a Miss row, which the Misses list links to. */
export function missRowId(number: number): string {
  return `miss-${number}`;
}
