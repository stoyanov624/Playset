// Telling an Incomplete Setlist from a complete one, so the user can be warned that the Setlist Playlist
// may miss songs (and offered an older complete Setlist instead).
import type { IncompleteStatus } from "./types.js";

/**
 * Phrases in a Setlist note that make it an Incomplete Setlist, in the order that decides which one is
 * reported as the matched phrase.
 */
const INCOMPLETE_PHRASES = [
  "incomplete",
  "partial",
  "rest unknown",
  "rest of the set unknown",
  "cut short",
  "ended early",
  "unknown songs",
  "not complete",
] as const;

/** Each phrase as a whole-word, case-insensitive pattern: no letter or digit right before or after it. */
const PHRASE_PATTERNS = INCOMPLETE_PHRASES.map(
  (phrase) => [phrase, new RegExp(`(?<![\\p{L}\\p{N}])${phrase}(?![\\p{L}\\p{N}])`, "iu")] as const,
);

/** The first incomplete phrase the Setlist note contains, or undefined (a blank or missing note never matches). */
function matchIncompletePhrase(setlistNote: string | undefined): string | undefined {
  const normalised = (setlistNote ?? "").trim().replace(/\s+/g, " ");
  if (normalised === "") return undefined;
  return PHRASE_PATTERNS.find(([, pattern]) => pattern.test(normalised))?.[0];
}

/** The incomplete status of a Setlist from its Unknown Song count and its Setlist note. */
export function incompleteStatusOf(unknownSongCount: number, setlistNote: string | undefined): IncompleteStatus {
  const matchedPhrase = matchIncompletePhrase(setlistNote);
  const status: IncompleteStatus = {
    isIncomplete: unknownSongCount > 0 || matchedPhrase !== undefined,
    unknownSongCount,
  };
  if (matchedPhrase !== undefined) {
    status.matchedPhrase = matchedPhrase;
    status.setlistNote = (setlistNote ?? "").trim();
  }
  return status;
}
