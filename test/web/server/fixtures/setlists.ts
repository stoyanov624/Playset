// setlist.fm and Spotify data for the web server tests. Raw shapes: setlist.fm REST 1.0 ("get
// setlist", "search artists", "artist setlists") and Spotify Web API search tracks. The Shows are
// the shared ones of the run tests (Fixture H, the Madrid Setlist, Nirvana U1, T1d, P1 page),
// with the versions the web examples give them.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { SetlistFmSetlist } from "../../../../src/core/index.js";
import { fixtureHv1, fixtureHv2, variant } from "../../../run/fixtures/host-setlists";
import { nirvanaTacoma, portlandOnlyUnknownSongs } from "../../../run/fixtures/incomplete-setlists";
import { fixtureA, tooLongDescriptionSetlist } from "../../../run/fixtures/setlists";

const here = dirname(fileURLToPath(import.meta.url));
const readSetlistFm = (file: string) =>
  JSON.parse(readFileSync(join(here, "..", "..", "..", "setlistfm", "fixtures", file), "utf8"));

export { fixtureA, fixtureHv1, fixtureHv2, variant };

// ---------------------------------------------------------------- ids and versions

export const PEARL_JAM_MBID = "83b9cbe7-9857-49e2-ab8e-b57b01038103";
export const ARCTIC_MONKEYS_MBID = "ada7a83c-e3e1-40f1-93f9-3e73dbfd2c7c";

export const H_ID = "2bf1c8e4";
export const H_V1 = "g4bd1a2f6";
export const H_V2 = "g2b5e7c19";
export const MADRID_ID = "73a1b2c5";
export const MADRID_VERSION = "g3e5f7a91";
export const NIRVANA_ID = "53d60349";
export const NIRVANA_VERSION = "g9d0c1b2a";
export const FIXTURE_A_ID = "63a5e2b7";
export const BIG_ID = "9ac1e5d3";
export const BIG_VERSION = "g1f0e9d8c";

export const PLAYLIST_ID = "5PqRsTuVwXyZaBcDeFgHiJ";
export const SHARE_URL = `https://open.spotify.com/playlist/${PLAYLIST_ID}`;
export const NEW_PLAYLIST_ID = "6QrStUvWxYzAbCdEfGhIjK";
export const NEW_SHARE_URL = `https://open.spotify.com/playlist/${NEW_PLAYLIST_ID}`;
export const PARTLY_ID = "8HiJkLmNoPqRsTuVwXyZaB";
export const PARTLY_SHARE_URL = `https://open.spotify.com/playlist/${PARTLY_ID}`;

export const H_URL = "https://www.setlist.fm/setlist/pearl-jam/2026/moda-center-portland-or-2bf1c8e4.html";
export const MADRID_URL =
  "https://www.setlist.fm/setlist/arctic-monkeys/2026/estadio-metropolitano-madrid-spain-73a1b2c5.html";

// ---------------------------------------------------------------- Setlists

/** The Madrid Setlist (Arctic Monkeys): a Tape, a medley, a snippet, an Unknown Song, a repeat, an Encore and a tease. */
export function madridSetlist(versionId: string | undefined = MADRID_VERSION): SetlistFmSetlist {
  const setlist: Record<string, unknown> = {
    id: MADRID_ID,
    eventDate: "02-06-2026",
    artist: { mbid: ARCTIC_MONKEYS_MBID, name: "Arctic Monkeys" },
    venue: {
      id: "5bd7c2a4",
      name: "Estadio Metropolitano",
      city: { id: "3117735", name: "Madrid", country: { code: "ES", name: "Spain" } },
    },
    url: MADRID_URL,
    sets: {
      set: [
        {
          song: [
            { name: "Intro", tape: true },
            { name: "Brianstorm" },
            { name: "Do I Wanna Know? / R U Mine?" },
            { name: "Hey Jude", info: "snippet" },
            { name: "" },
            { name: "Brianstorm" },
          ],
        },
        { encore: 1, song: [{ name: "505", info: "with Miles Kane" }, { name: "Kashmir", info: "Tease" }] },
      ],
    },
  };
  if (versionId !== undefined) setlist.versionId = versionId;
  return setlist as unknown as SetlistFmSetlist;
}

/** Nirvana in Tacoma (U1): 9 kept Performances (Love Buzz a Cover of Shocking Blue), 1 Unknown Song. */
export const nirvanaSetlist = (): SetlistFmSetlist => variant(nirvanaTacoma(), { versionId: NIRVANA_VERSION });

/** T1d: Portland whose only songs are Unknown Songs, fetched as 2bf1c8e4 at g4bd1a2f6. */
export const onlyUnknownSongsSetlist = (): SetlistFmSetlist =>
  variant(portlandOnlyUnknownSongs(), { id: H_ID, versionId: H_V1 });

/** A Setlist whose playlist description would be 301 characters (fetched as 63a5e2b7). */
export const tooLongDescription = (): SetlistFmSetlist => tooLongDescriptionSetlist();

/** A Setlist with `count` kept Performances "Song 1" … "Song n" (H4's 230). */
export function bigSetlist(count = 230): SetlistFmSetlist {
  const songs = Array.from({ length: count }, (_, i) => ({ name: i + 1 === 150 ? "Song 7" : `Song ${i + 1}` }));
  return {
    id: BIG_ID,
    versionId: BIG_VERSION,
    eventDate: "12-12-2026",
    artist: { mbid: PEARL_JAM_MBID, name: "Pearl Jam" },
    venue: { name: "Moda Center", city: { name: "Portland", country: { name: "United States" } } },
    url: `https://www.setlist.fm/setlist/pearl-jam/2026/moda-center-portland-or-${BIG_ID}.html`,
    sets: { set: [{ song: songs }] },
  } as unknown as SetlistFmSetlist;
}

/** The Setlists setlist.fm knows by default, by id. */
export function defaultSetlists(): Record<string, SetlistFmSetlist> {
  return {
    [H_ID]: fixtureHv1(),
    [MADRID_ID]: madridSetlist(),
    [NIRVANA_ID]: nirvanaSetlist(),
    [FIXTURE_A_ID]: fixtureA(),
    [BIG_ID]: bigSetlist(),
  };
}

// ---------------------------------------------------------------- Artist search payloads

export function genesisSearchPayload() {
  return {
    type: "artists",
    itemsPerPage: 30,
    page: 1,
    total: 3,
    artist: [
      {
        mbid: "8e3fcd7d-bda1-4ca0-b987-b8528d2ee74e",
        name: "Genesis",
        sortName: "Genesis",
        disambiguation: "English rock band",
        url: "https://www.setlist.fm/setlists/genesis-13d6b5b1.html",
      },
      {
        mbid: "2f4b1c6e-0d3a-4e5b-8c7d-9e0f1a2b3c4d",
        name: "Genesis",
        sortName: "Genesis",
        disambiguation: "US psychedelic rock band",
        url: "https://www.setlist.fm/setlists/genesis-2bd6b9a2.html",
      },
      {
        mbid: "4a5b6c7d-8e9f-4a0b-9c1d-2e3f4a5b6c7d",
        name: "Genesis Owusu",
        sortName: "Owusu, Genesis",
        url: "https://www.setlist.fm/setlists/genesis-owusu-1bd6a9f4.html",
      },
    ],
  };
}

export const genesisAnswer = () => ({
  artists: [
    { name: "Genesis", mbid: "8e3fcd7d-bda1-4ca0-b987-b8528d2ee74e", disambiguation: "English rock band" },
    { name: "Genesis", mbid: "2f4b1c6e-0d3a-4e5b-8c7d-9e0f1a2b3c4d", disambiguation: "US psychedelic rock band" },
    { name: "Genesis Owusu", mbid: "4a5b6c7d-8e9f-4a0b-9c1d-2e3f4a5b6c7d" },
  ],
});

export const arcticMonkeysSearchPayload = () => readSetlistFm("search-arctic-monkeys.json");
export const pearlJamSearchPayload = () => readSetlistFm("search-pearl-jam.json");

export const arcticMonkeysAnswer = () => ({
  artists: [
    { name: "Arctic Monkeys", mbid: "ada7a83c-e3e1-40f1-93f9-3e73dbfd2c7c" },
    { name: "Arctic Monkeys Tribute", mbid: "5b0c1a4e-2f0e-4f1a-9a77-1d2b3c4d5e6f" },
    { name: "The Arctic Monkeys Experience", mbid: "7c1e2d3f-4a5b-4c6d-8e9f-0a1b2c3d4e5f" },
  ],
});

// ---------------------------------------------------------------- Setlist page payload (P1)

/** P1: Pearl Jam's Setlists page 1 (an announced Show first), each Setlist with its version. */
export function pearlJamPagePayload() {
  const page = readSetlistFm("setlists-pearl-jam-p1.json") as { setlist: Array<Record<string, unknown>> };
  const versions: Record<string, string> = {
    "4bf1d2a6": "g5ac0d3e1",
    "2bf1c8e4": "g4bd1a2f6",
    "6bf1b3d0": "g8e1c4b27",
    "3bf1a7c2": "g7ac2e1d9",
  };
  for (const setlist of page.setlist) {
    const version = versions[setlist.id as string];
    if (version !== undefined) setlist.versionId = version;
  }
  return page;
}

/** X5's answer for P1. */
export function pearlJamPageAnswer() {
  return {
    artist: { mbid: PEARL_JAM_MBID },
    setlists: [
      {
        id: "2bf1c8e4", date: "2026-11-22", venue: "Moda Center", city: "Portland", songCount: 3,
        incompleteStatus: { isIncomplete: true, unknownSongCount: 1 },
      },
      {
        id: "6bf1b3d0", date: "2026-11-20", venue: "Climate Pledge Arena", city: "Seattle", songCount: 2,
        incompleteStatus: {
          isIncomplete: true, unknownSongCount: 0, matchedPhrase: "cut short",
          setlistNote: "Show cut short after a power outage.",
        },
      },
      {
        id: "3bf1a7c2", date: "2026-11-18", venue: "Rogers Arena", city: "Vancouver", songCount: 6,
        incompleteStatus: { isIncomplete: false, unknownSongCount: 0 },
      },
    ],
    hasMore: true,
  };
}

// ---------------------------------------------------------------- Spotify tracks

export interface SpotifyTrack {
  uri: string;
  id: string;
  name: string;
  artists: Array<{ name: string }>;
  album: { name: string };
}

export function spotifyTrack(id: string, name: string, artist: string, album: string): SpotifyTrack {
  return { uri: `spotify:track:${id}`, id, name, artists: [{ name: artist }], album: { name: album } };
}

/** Spotify's catalogue for the fake search, by "<artist>|<title>". "505" and "Spank Thru" are Misses. */
export function defaultTracks(): Record<string, SpotifyTrack> {
  const list = [
    spotifyTrack("2PYNLpcbVSE1hzFg4Ofmd9", "Brianstorm", "Arctic Monkeys", "Favourite Worst Nightmare"),
    spotifyTrack("5FVd6KXrgO9B3JPmC8OPsA", "Do I Wanna Know?", "Arctic Monkeys", "AM"),
    spotifyTrack("2Hp4ZMWJ4D3ACvhzF6S0fM", "R U Mine?", "Arctic Monkeys", "AM"),
    spotifyTrack("4xGvbS8NnKtwKw5CXGkmA9", "Release", "Pearl Jam", "Ten"),
    spotifyTrack("2pN3kBT1hYiA4bBydDMYv4", "Even Flow", "Pearl Jam", "Ten"),
    spotifyTrack("0yA1cVWJ4UjaQvSFbJxbpb", "Corduroy", "Pearl Jam", "Vitalogy"),
    spotifyTrack("3VbM2t6DQHmPWdbTvKrNKz", "Alive", "Pearl Jam", "Ten"),
    spotifyTrack("1QRVyV9SWw0pYxB6hn3HCS", "Yellow Ledbetter", "Pearl Jam", "Lost Dogs"),
    spotifyTrack("6tKvLrLFmBvvYDmTHU9YEh", "Love Buzz", "Nirvana", "Bleach"),
    spotifyTrack("1rHHu0w1kPpJEYGqtzCvOc", "Floyd the Barber", "Nirvana", "Bleach"),
    spotifyTrack("3XzDkJjrJ1j0Nq7nbF3gKz", "Downer", "Nirvana", "Bleach"),
    spotifyTrack("0w6kUoYjmVb9bQ5Hqf3TrB", "Mexican Seafood", "Nirvana", "Incesticide"),
    spotifyTrack("5aPZtPu3bYEDpYi2E0Z0w8", "Hairspray Queen", "Nirvana", "Incesticide"),
    spotifyTrack("2r7K3fYqXcnwhP7LfYYn1c", "Aero Zeppelin", "Nirvana", "Incesticide"),
    spotifyTrack("7bZx1bqMsk1y0wB8m2l4yN", "Pen Cap Chew", "Nirvana", "With The Lights Out"),
    spotifyTrack("0rXhJ9e3eDqUj1qJkC7m3M", "Paper Cuts", "Nirvana", "Bleach"),
  ];
  for (let i = 1; i <= 230; i++) {
    list.push(spotifyTrack(`T${String(i).padStart(21, "0")}`, `Song ${i}`, "Pearl Jam", "Some Album"));
  }
  return Object.fromEntries(list.map((t) => [`${t.artists[0]!.name}|${t.name}`, t]));
}

// ---------------------------------------------------------------- expected answers

/** X7: the Madrid preview event data. */
export function madridPreviewEvent() {
  return {
    show: { artist: "Arctic Monkeys", date: "2026-06-02", venue: "Estadio Metropolitano", city: "Madrid", url: MADRID_URL },
    incompleteStatus: { isIncomplete: true, unknownSongCount: 1 },
    rows: [
      {
        number: 1, performance: { position: 2, title: "Brianstorm", setLabel: "main" },
        outcome: { kind: "match", name: "Brianstorm", artists: ["Arctic Monkeys"], album: "Favourite Worst Nightmare", live: false },
      },
      {
        number: 2, performance: { position: 3, title: "Do I Wanna Know?", setLabel: "main", medley: "Do I Wanna Know? / R U Mine?" },
        outcome: { kind: "match", name: "Do I Wanna Know?", artists: ["Arctic Monkeys"], album: "AM", live: false },
      },
      {
        number: 3, performance: { position: 4, title: "R U Mine?", setLabel: "main", medley: "Do I Wanna Know? / R U Mine?" },
        outcome: { kind: "match", name: "R U Mine?", artists: ["Arctic Monkeys"], album: "AM", live: false },
      },
      {
        number: 4, performance: { position: 5, title: "Brianstorm", setLabel: "main" },
        outcome: { kind: "match", name: "Brianstorm", artists: ["Arctic Monkeys"], album: "Favourite Worst Nightmare", live: false },
      },
      {
        number: 5, performance: { position: 6, title: "505", setLabel: "Encore 1" },
        outcome: { kind: "miss", title: "505", artist: "Arctic Monkeys" },
      },
    ],
    misses: [{ number: 5, title: "505", artist: "Arctic Monkeys" }],
    notAdded: [
      { reason: "tape", name: "Intro" },
      { reason: "snippet", name: "Hey Jude" },
      { reason: "unknown", after: 3 },
      { reason: "snippet", name: "Kashmir" },
    ],
    playlistName: "Arctic Monkeys – 2026-06-02 – Madrid",
    versionId: MADRID_VERSION,
  };
}

/** X7: the empty preview of T1d (only Unknown Songs). */
export function onlyUnknownSongsPreviewEvent() {
  return {
    show: { artist: "Pearl Jam", date: "2026-11-22", venue: "Moda Center", city: "Portland", url: H_URL },
    incompleteStatus: { isIncomplete: true, unknownSongCount: 2 },
    rows: [],
    misses: [],
    notAdded: [{ reason: "unknown", after: 0 }, { reason: "unknown", after: 0, info: "Opener" }],
    playlistName: "Pearl Jam – 2026-11-22 – Portland",
    versionId: H_V1,
  };
}

export const H_V1_SHOW = { artist: "Pearl Jam", date: "2026-11-22", venue: "Moda Center", city: "Portland", url: H_URL };
export const H_V2_SHOW = { artist: "Pearl Jam", date: "2026-11-21", venue: "Moda Center", city: "Portland", url: H_URL };
