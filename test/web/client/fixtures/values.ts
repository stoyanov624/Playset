// Answers the fake API client gives, from the visitor web app's examples (E1–E11). Each one is
// parsed with the contract's schema, so a fixture that drifts from the contract fails loudly.
// Every builder returns a fresh object.
import {
  artistSetlistsResponseSchema,
  artistsResponseSchema,
  createPlaylistResponseSchema,
  previewResultSchema,
  previewRowSchema,
  setlistResponseSchema,
  type ArtistSetlistsResponse,
  type ArtistsResponse,
  type CreatePlaylistResponse,
  type PreviewResult,
  type PreviewRow,
  type SetlistResponse,
} from "../../../../src/web/shared/index.js";
import {
  MADRID_URL,
  PEARL_JAM_MBID,
  SHARE_URL,
  changed,
  loveBuzzCoverRow,
  madridPreview,
  pearlJamPage,
  portlandStatusAnswer,
  unknownSongsOnlyPreview,
} from "../../shared/fixtures/contract-values";

export { MADRID_URL, PEARL_JAM_MBID, SHARE_URL };

export const ARCTIC_MONKEYS_MBID = "ada7a83c-e3e1-40f1-93f9-3e73dbc9298a";
export const FONTAINES_MBID = "4c1d6a8e-2f3b-4a5c-9d7e-8f0a1b2c3d4e";
export const MADRID_ID = "73a1b2c5";
export const PORTLAND_ID = "2bf1c8e4";
export const SEATTLE_ID = "6bf1b3d0";
export const BOSTON_ID = "4b8c4e2d";
export const NEW_SHARE_URL = "https://open.spotify.com/playlist/6QrStUvWxYzAbCdEfGhIjK";

// ---------------------------------------------------------------- Artist search

/** E1: three candidates for "arctic monkeys", the last without a disambiguation. */
export function arcticMonkeysCandidates(): ArtistsResponse {
  return artistsResponseSchema.parse({
    artists: [
      { name: "Arctic Monkeys", mbid: ARCTIC_MONKEYS_MBID, disambiguation: "English rock band from Sheffield" },
      { name: "The Arctic Monkeys", mbid: "1c3a5e7f-2b4d-4f6a-8c0e-1a2b3c4d5e6f", disambiguation: "1960s cover act" },
      { name: "Arctic Monkeys Tribute", mbid: "7d9e1f3a-5b7c-4d9e-a1f3-5b7c9d1e3f5a" },
    ],
  });
}

/** E2: exactly one candidate, still shown as a list. */
export function fontainesCandidates(): ArtistsResponse {
  return artistsResponseSchema.parse({
    artists: [{ name: "Fontaines D.C.", mbid: FONTAINES_MBID, disambiguation: "Irish post-punk band" }],
  });
}

export function pearlJamCandidates(): ArtistsResponse {
  return artistsResponseSchema.parse({ artists: [{ name: "Pearl Jam", mbid: PEARL_JAM_MBID }] });
}

export function noCandidates(): ArtistsResponse {
  return artistsResponseSchema.parse({ artists: [] });
}

// ---------------------------------------------------------------- Setlist list

const TORONTO = {
  id: "1b8c4d3e", date: "2026-11-21", venue: "Scotiabank Arena", city: "Toronto", songCount: 1,
  incompleteStatus: { isIncomplete: false, unknownSongCount: 0 },
};

/** E5: Arctic Monkeys page 1, the Boston Setlist incomplete, more pages to come. */
export function arcticMonkeysPage1(): ArtistSetlistsResponse {
  return artistSetlistsResponseSchema.parse({
    artist: { mbid: ARCTIC_MONKEYS_MBID, name: "Arctic Monkeys" },
    setlists: [
      {
        id: "2b8c4f1a", date: "2026-11-27", venue: "Madison Square Garden", city: "New York", songCount: 21,
        incompleteStatus: { isIncomplete: false, unknownSongCount: 0 },
      },
      {
        id: BOSTON_ID, date: "2026-11-24", venue: "TD Garden", city: "Boston", songCount: 18,
        incompleteStatus: {
          isIncomplete: true, unknownSongCount: 0, matchedPhrase: "cut short", setlistNote: "Show cut short due to curfew.",
        },
      },
      TORONTO,
    ],
    hasMore: true,
  });
}

/** E5: page 2 repeats the Toronto Setlist (setlist.fm pages shift) and adds a Setlist with no city. */
export function arcticMonkeysPage2(): ArtistSetlistsResponse {
  return artistSetlistsResponseSchema.parse({
    artist: { mbid: ARCTIC_MONKEYS_MBID },
    setlists: [
      TORONTO,
      {
        id: "3b8c4c4f", date: "2026-11-19", venue: "Bell Centre", city: "", songCount: 20,
        incompleteStatus: { isIncomplete: false, unknownSongCount: 0 },
      },
    ],
    hasMore: false,
  });
}

export const PAGE1_ROW_NAMES = [
  "27 Nov 2026, Madison Square Garden, New York, 21 songs",
  "24 Nov 2026, TD Garden, Boston, 18 songs, Incomplete Setlist",
  "21 Nov 2026, Scotiabank Arena, Toronto, 1 song",
] as const;

/** X4: Pearl Jam page 1 (Portland, Seattle, Vancouver). */
export function pearlJamPage1(): ArtistSetlistsResponse {
  return artistSetlistsResponseSchema.parse(pearlJamPage());
}

/** E5: the Pearl Jam page with no Setlists left and no name in the answer. */
export function emptyPage(hasMore: boolean): ArtistSetlistsResponse {
  return artistSetlistsResponseSchema.parse({ artist: { mbid: PEARL_JAM_MBID }, setlists: [], hasMore });
}

// ---------------------------------------------------------------- Setlist status

/** E6: Portland, Incomplete Setlist with no note, its Setlist Playlist current. */
export function portlandCurrentStatus(): SetlistResponse {
  return setlistResponseSchema.parse(portlandStatusAnswer());
}

/** E6: Seattle, cut short with a setlist.fm note, its Setlist Playlist current. */
export function seattleCurrentStatus(): SetlistResponse {
  return setlistResponseSchema.parse({
    show: {
      artist: "Pearl Jam", date: "2026-11-20", venue: "Climate Pledge Arena", city: "Seattle",
      url: "https://www.setlist.fm/setlist/pearl-jam/2026/climate-pledge-arena-seattle-wa-6bf1b3d0.html",
    },
    incompleteStatus: {
      isIncomplete: true, unknownSongCount: 0, matchedPhrase: "cut short", setlistNote: "Show cut short after a power outage.",
    },
    playlist: { status: "current", url: SHARE_URL },
  });
}

/** E7: the Madrid Show with no Setlist Playlist yet. */
export function madridStatus(playlist: SetlistResponse["playlist"] = { status: "none" }): SetlistResponse {
  const preview = madridPreview();
  return setlistResponseSchema.parse({ show: preview.show, incompleteStatus: preview.incompleteStatus, playlist });
}

export function madridOutdatedStatus(): SetlistResponse {
  return madridStatus({ status: "outdated", url: SHARE_URL });
}

/** A complete Setlist (no warning) for the Madrid Show. */
export function madridCompleteStatus(): SetlistResponse {
  return setlistResponseSchema.parse(
    changed(madridStatus(), (draft) => {
      draft.incompleteStatus = { isIncomplete: false, unknownSongCount: 0 };
    }),
  );
}

// ---------------------------------------------------------------- Preview results

/** X7: the Madrid preview (4 Matches, the Encore's "505" a Miss, one Unknown Song after row 3). */
export function madridResult(): PreviewResult {
  return previewResultSchema.parse(madridPreview());
}

/** X7 / T1d: Pearl Jam, no rows, two Unknown Songs before the first row. */
export function unknownSongsOnlyResult(): PreviewResult {
  return previewResultSchema.parse(unknownSongsOnlyPreview());
}

/** A preview of the given rows on the Madrid Show; misses are derived from the rows. */
export function resultWithRows(rows: PreviewRow[], notAdded: PreviewResult["notAdded"] = []): PreviewResult {
  const misses = rows.flatMap((row) =>
    row.outcome.kind === "miss"
      ? [{
          number: row.number,
          title: row.outcome.title,
          artist: row.outcome.artist,
          ...(row.outcome.originalArtist === undefined ? {} : { originalArtist: row.outcome.originalArtist }),
        }]
      : [],
  );
  const base = madridResult();
  return previewResultSchema.parse({ ...base, rows, misses, notAdded });
}

export function matchRow(number: number, title: string, setLabel = "main"): PreviewRow {
  return {
    number,
    performance: { position: number, title, setLabel },
    outcome: { kind: "match", name: title, artists: ["Arctic Monkeys"], album: "AM", live: false },
  };
}

export function missRow(number: number, title: string, setLabel = "main"): PreviewRow {
  return {
    number,
    performance: { position: number, title, setLabel },
    outcome: { kind: "miss", title, artist: "Arctic Monkeys" },
  };
}

/** E8: Nirvana fragments: a Cover Match, a live Match, a Miss, a Cover Miss and a two-artist Match. */
export function nirvanaResult(): PreviewResult {
  const rows: PreviewRow[] = [
    {
      number: 1, performance: { position: 1, title: "Polly", setLabel: "main" },
      outcome: { kind: "match", name: "Polly", artists: ["Nirvana"], album: "MTV Unplugged in New York", live: true },
    },
    {
      number: 2, performance: { position: 2, title: "Boys in the Better Land", setLabel: "main" },
      outcome: {
        kind: "match", name: "Boys in the Better Land", artists: ["Fontaines D.C.", "Grian Chatten"], album: "Dogrel", live: false,
      },
    },
    previewRowSchema.parse(loveBuzzCoverRow()),
    {
      number: 4, performance: { position: 4, title: "Molly's Lips", setLabel: "main", originalArtist: "The Vaselines" },
      outcome: { kind: "miss", title: "Molly's Lips", artist: "Nirvana", originalArtist: "The Vaselines" },
    },
    {
      number: 7, performance: { position: 7, title: "School", setLabel: "main" },
      outcome: { kind: "match", name: "School", artists: ["Nirvana"], album: "Bleach", live: false },
    },
    {
      number: 9, performance: { position: 9, title: "Spank Thru", setLabel: "main" },
      outcome: { kind: "miss", title: "Spank Thru", artist: "Nirvana" },
    },
  ];
  return resultWithRows(rows, [{ reason: "unknown", after: 7, info: "Written as 'Dope Hippie' on the setlist" }]);
}

/** E8: 25 rows of which 23 are Misses. */
export function manyMissesResult(): PreviewResult {
  const rows: PreviewRow[] = [matchRow(1, "Brianstorm"), matchRow(2, "Teddy Picker")];
  for (let number = 3; number <= 25; number++) rows.push(missRow(number, `Song ${number}`));
  return resultWithRows(rows);
}

/** E9: three rows, all Misses. */
export function allMissResult(): PreviewResult {
  return resultWithRows([missRow(1, "Brianstorm"), missRow(2, "Teddy Picker"), missRow(3, "505", "Encore 1")]);
}

/** A preview with a single Match, for the "1 song" line. */
export function oneMatchResult(): PreviewResult {
  return resultWithRows([matchRow(1, "Brianstorm")]);
}

// ---------------------------------------------------------------- Create

export function createdAnswer(url: string = SHARE_URL): CreatePlaylistResponse {
  return createPlaylistResponseSchema.parse({ url, status: "created" });
}

export function updatedAnswer(): CreatePlaylistResponse {
  return createPlaylistResponseSchema.parse({ url: SHARE_URL, status: "updated" });
}
