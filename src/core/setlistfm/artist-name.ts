/**
 * Normalises an Artist name for exact matching: case folded, accents removed,
 * `&` → ` and `, whitespace trimmed and collapsed. Nothing else changes.
 */
function normaliseArtistName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when two Artist names are an exact match after normalisation. */
export function artistNamesMatch(a: string, b: string): boolean {
  return normaliseArtistName(a) === normaliseArtistName(b);
}
