// Normalising names and titles so that a search result can be strictly verified
// against a Performance (PRD 0003, AC-3, AC-4, AC-8).

/**
 * Case-folds, removes accents and diacritics, turns `&` into `and`, deletes apostrophes,
 * replaces every other punctuation character with a space, collapses whitespace and trims.
 */
export function normaliseName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const YEAR = String.raw`\d{4}`;
const VERSION_SUFFIXES: RegExp[] = [
  // Remaster markers.
  new RegExp(String.raw`\s+-\s+remaster(?:ed)?(?:\s+${YEAR})?$`, "i"),
  new RegExp(String.raw`\s+-\s+${YEAR}\s+remaster(?:ed)?$`, "i"),
  new RegExp(String.raw`\s*\(remastered(?:\s+${YEAR})?\)$`, "i"),
  new RegExp(String.raw`\s*\(${YEAR}\s+remaster(?:ed)?\)$`, "i"),
  /\s*\[remastered\]$/i,
  new RegExp(String.raw`\s*\[${YEAR}\s+remaster\]$`, "i"),
  // Version markers.
  /\s+-\s+(?:single version|radio edit)$/i,
  /\s*\((?:single version|radio edit)\)$/i,
  // Guest markers.
  /\s*\((?:feat|ft)\.\s[^()]*\)$/i,
  /\s*\[feat\.\s[^[\]]*\]$/i,
  /\s+-\s+feat\.\s.*$/i,
  // Live markers.
  /\s+-\s+live(?:\s+(?:at|from|in)\s.*)?$/i,
  /\s*\(live(?:\s+(?:at|from|in)\s[^()]*)?\)$/i,
  /\s*\[live\]$/i,
];

/** Removes recognised version suffixes (remaster, version, guest, live) from the end, repeatedly. */
export function stripVersionSuffixes(title: string): string {
  let current = title.trimEnd();
  for (;;) {
    const suffix = VERSION_SUFFIXES.find((pattern) => pattern.test(current));
    if (!suffix) return current;
    current = current.replace(suffix, "").trimEnd();
  }
}

/** Removes recognised version suffixes, then normalises like a name. */
export function normaliseTitle(title: string): string {
  return normaliseName(stripVersionSuffixes(title));
}

/** How often the whole word "live" (any case) appears in the text. */
export function countLiveWords(text: string): number {
  const words = normaliseName(text).split(" ");
  return words.filter((word) => word === "live").length;
}
