import { countLiveWords, normaliseName, normaliseTitle } from "./normalise.js";
import type { Match, MatchablePerformance, MatchOutcome, Miss, SpotifyTrack, TrackSearch } from "./types.js";

const SEARCH_LIMIT = 10;

/**
 * Finds the Match for one Performance: the Artist's studio recording first, then the Artist's
 * live recording, then (for a Cover) the Original Artist's studio and live recordings.
 * Otherwise a Miss listing every query sent. Search errors are not caught.
 */
export async function matchPerformance(
  performance: MatchablePerformance,
  search: TrackSearch,
): Promise<MatchOutcome> {
  const { title, artist, originalArtist } = performance;
  const queries: string[] = [];
  const miss = (): Miss =>
    hasText(originalArtist)
      ? { kind: "miss", title, artist, originalArtist, queries }
      : { kind: "miss", title, artist, queries };

  if (!hasText(title)) return miss();

  for (const targetArtist of targetArtists(performance)) {
    for (const query of queriesFor(title, targetArtist)) {
      queries.push(query);
      const results = await search.searchTracks(query, SEARCH_LIMIT);
      const match = pickMatch(results, title, targetArtist);
      if (match) return match;
    }
  }
  return miss();
}

/** The Artist, then the Original Artist when the Performance is a real Cover. */
function targetArtists({ artist, originalArtist }: MatchablePerformance): string[] {
  const isCover = hasText(originalArtist) && normaliseName(originalArtist) !== normaliseName(artist);
  return isCover ? [artist, originalArtist] : [artist];
}

/**
 * The queries for one target artist, in order: filtered, plain-text retry, and — only for a title with
 * "+" — a filtered query with every "+" replaced by "&", since Spotify's search often misses a title
 * written with "+" that its catalogue spells with "&".
 */
function queriesFor(title: string, targetArtist: string): string[] {
  const queries = [filteredQuery(title, targetArtist), plainTextQuery(title, targetArtist)];
  if (title.includes("+")) queries.push(filteredQuery(title.replace(/\+/g, "&"), targetArtist));
  return queries;
}

function filteredQuery(title: string, targetArtist: string): string {
  return `track:"${withoutDoubleQuotes(title)}" artist:"${withoutDoubleQuotes(targetArtist)}"`;
}

function plainTextQuery(title: string, targetArtist: string): string {
  return `${withoutDoubleQuotes(title)} ${withoutDoubleQuotes(targetArtist)}`;
}

function withoutDoubleQuotes(value: string): string {
  return value.replace(/["“”]/g, "");
}

function hasText(value: string | undefined): value is string {
  return value !== undefined && value.trim() !== "";
}

/** The first verifying non-live result, else the first verifying live one, else none. */
function pickMatch(results: SpotifyTrack[], title: string, targetArtist: string): Match | undefined {
  const wantedTitle = normaliseTitle(title);
  const wantedArtist = normaliseName(targetArtist);
  const titleLiveWords = countLiveWords(title);

  const verified = results
    .filter(
      (result) =>
        normaliseTitle(result.name) === wantedTitle &&
        result.artists.some((resultArtist) => normaliseName(resultArtist.name) === wantedArtist),
    )
    .map((result) => toMatch(result, titleLiveWords));

  return verified.find((match) => !match.live) ?? verified[0];
}

function toMatch(result: SpotifyTrack, titleLiveWords: number): Match {
  const live =
    countLiveWords(result.name) > titleLiveWords || countLiveWords(result.album.name) > titleLiveWords;
  return {
    kind: "match",
    uri: result.uri,
    id: result.id,
    name: result.name,
    artists: result.artists.map((resultArtist) => resultArtist.name),
    album: result.album.name,
    live,
  };
}
