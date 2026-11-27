// Setlists and Spotify outcomes for PRD 0011 (Unknown Songs, Incomplete Setlists).
// Shapes follow setlist.fm's REST API 1.0 (as in PRD 0002 / 0005). No network.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { SetlistFmSetlist, Show } from "../../../src/core/index.js";
import { match, type MatchSpec } from "./fake-services";

const here = dirname(fileURLToPath(import.meta.url));
const sharedFixtures = join(here, "..", "..", "fixtures", "performances");
const setlistFmFixtures = join(here, "..", "..", "setlistfm", "fixtures");

const readJson = (path: string) => JSON.parse(readFileSync(path, "utf8"));

// ---------------------------------------------------------------- U1 / T1 — Nirvana, Tacoma

export const NIRVANA_URL =
  "https://www.setlist.fm/setlist/nirvana/1987/community-world-theater-tacoma-wa-53d60349.html";
export const NIRVANA_SETLIST_ID = "53d60349";
export const NIRVANA_PLAYLIST_NAME = "Nirvana – 1987-04-18 – Tacoma";
export const NIRVANA_SHARE_URL = "https://open.spotify.com/playlist/7GhIjKlMnOpQrStUvWxYzA";

/** PRD 0011 U1: 9 Performances and 1 Unknown Song (after #7, info "Written as 'Dope Hippie' on the setlist"). */
export const nirvanaTacoma = (): SetlistFmSetlist => readJson(join(sharedFixtures, "nirvana-53d60349-unknown-song.json"));

export const nirvanaShow: Show = {
  artist: "Nirvana",
  date: "1987-04-18",
  city: "Tacoma",
  venue: "Community World Theater",
  url: NIRVANA_URL,
};

/** PRD 0011 T1 — Spotify outcomes for U1's Performances (Spank Thru is a Miss). */
export const nirvanaOutcomes: Record<string, MatchSpec> = {
  "Love Buzz": match("6tKvLrLFmBvvYDmTHU9YEh", "Love Buzz", "Nirvana", "Bleach"),
  "Floyd the Barber": match("1rHHu0w1kPpJEYGqtzCvOc", "Floyd The Barber", "Nirvana", "Bleach"),
  Downer: match("3XzDkJjrJ1j0Nq7nbF3gKz", "Downer", "Nirvana", "Bleach"),
  "Mexican Seafood": match("0w6kUoYjmVb9bQ5Hqf3TrB", "Mexican Seafood", "Nirvana", "Incesticide"),
  "Hairspray Queen": match("5aPZtPu3bYEDpYi2E0Z0w8", "Hairspray Queen", "Nirvana", "Incesticide"),
  "Spank Thru": "miss",
  "Aero Zeppelin": match("2r7K3fYqXcnwhP7LfYYn1c", "Aero Zeppelin", "Nirvana", "Incesticide"),
  "Pen Cap Chew": match("7bZx1bqMsk1y0wB8m2l4yN", "Pen Cap Chew", "Nirvana", "With The Lights Out"),
  "Paper Cuts": match("0rXhJ9e3eDqUj1qJkC7m3M", "Paper Cuts", "Nirvana", "Bleach"),
};

export const NIRVANA_KEPT_TITLES = [
  "Love Buzz",
  "Floyd the Barber",
  "Downer",
  "Mexican Seafood",
  "Hairspray Queen",
  "Spank Thru",
  "Aero Zeppelin",
  "Pen Cap Chew",
  "Paper Cuts",
];

/** The 8 Match URIs of T1, in played order. */
export const NIRVANA_URIS = [
  "spotify:track:6tKvLrLFmBvvYDmTHU9YEh",
  "spotify:track:1rHHu0w1kPpJEYGqtzCvOc",
  "spotify:track:3XzDkJjrJ1j0Nq7nbF3gKz",
  "spotify:track:0w6kUoYjmVb9bQ5Hqf3TrB",
  "spotify:track:5aPZtPu3bYEDpYi2E0Z0w8",
  "spotify:track:2r7K3fYqXcnwhP7LfYYn1c",
  "spotify:track:7bZx1bqMsk1y0wB8m2l4yN",
  "spotify:track:0rXhJ9e3eDqUj1qJkC7m3M",
];

// ---------------------------------------------------------------- N1 / T1b — Radiohead, note only

export const RADIOHEAD_URL = "https://www.setlist.fm/setlist/radiohead/2026/o2-arena-london-england-2bf3d4e6.html";
/** PRD 0011 N1: all songs named, Setlist note "Setlist incomplete". */
export const radioheadNoteIncomplete = (): SetlistFmSetlist =>
  readJson(join(sharedFixtures, "radiohead-2bf3d4e6-note-incomplete.json"));

// ---------------------------------------------------------------- L1 — Pearl Jam

const pearlJamPage1 = () => readJson(join(setlistFmFixtures, "setlists-pearl-jam-p1.json"));

export const PORTLAND_URL = "https://www.setlist.fm/setlist/pearl-jam/2026/moda-center-portland-or-2bf1c8e4.html";
export const VANCOUVER_URL =
  "https://www.setlist.fm/setlist/pearl-jam/2026/rogers-arena-vancouver-bc-canada-3bf1a7c2.html";
export const PORTLAND_PLAYLIST_NAME = "Pearl Jam – 2026-11-22 – Portland";
export const VANCOUVER_PLAYLIST_NAME = "Pearl Jam – 2026-11-18 – Vancouver";

/** L1's Latest Setlist: Portland, 3 Performances, 1 Unknown Song after #1. */
export const pearlJamPortland = (): SetlistFmSetlist => pearlJamPage1().setlist[1];
/** L1's Seattle Setlist: 2 Performances, note "Show cut short after a power outage.". */
export const pearlJamSeattle = (): SetlistFmSetlist => pearlJamPage1().setlist[2];
/** L1's newest complete Setlist: Vancouver, 6 Performances (Yellow Ledbetter in Encore 1). */
export const pearlJamVancouver = (): SetlistFmSetlist => pearlJamPage1().setlist[3];

export const portlandShow: Show = {
  artist: "Pearl Jam",
  date: "2026-11-22",
  city: "Portland",
  venue: "Moda Center",
  url: PORTLAND_URL,
};
export const vancouverShow: Show = {
  artist: "Pearl Jam",
  date: "2026-11-18",
  city: "Vancouver",
  venue: "Rogers Arena",
  url: VANCOUVER_URL,
};

/** L1 — Spotify outcomes for Pearl Jam (every Performance has a Match). */
export const pearlJamOutcomes: Record<string, MatchSpec> = {
  Release: match("4xGvbS8NnKtwKw5CXGkmA9", "Release", "Pearl Jam", "Ten"),
  "Even Flow": match("2pN3kBT1hYiA4bBydDMYv4", "Even Flow", "Pearl Jam", "Ten"),
  Alive: match("3VbM2t6DQHmPWdbTvKrNKz", "Alive", "Pearl Jam", "Ten"),
  Daughter: match("6rSFzV1CKBFnZ1EaPvcGSh", "Daughter", "Pearl Jam", "Vs."),
  Black: match("5Xak5fmy089t0FYmh3VJiY", "Black", "Pearl Jam", "Ten"),
  "Yellow Ledbetter": match(
    "3Tz9GjB1xNnRdC3jGcvTBn",
    "Yellow Ledbetter",
    "Pearl Jam",
    "rearviewmirror (Greatest Hits 1991-2003)",
  ),
};

export const PORTLAND_URIS = [
  "spotify:track:4xGvbS8NnKtwKw5CXGkmA9",
  "spotify:track:2pN3kBT1hYiA4bBydDMYv4",
  "spotify:track:3VbM2t6DQHmPWdbTvKrNKz",
];
export const VANCOUVER_URIS = [
  "spotify:track:4xGvbS8NnKtwKw5CXGkmA9",
  "spotify:track:6rSFzV1CKBFnZ1EaPvcGSh",
  "spotify:track:2pN3kBT1hYiA4bBydDMYv4",
  "spotify:track:5Xak5fmy089t0FYmh3VJiY",
  "spotify:track:3VbM2t6DQHmPWdbTvKrNKz",
  "spotify:track:3Tz9GjB1xNnRdC3jGcvTBn",
];

/** A copy of a setlist with other songs in one main Set (and optional other fields). */
export function withSongs(setlist: SetlistFmSetlist, songs: unknown[], extra: Record<string, unknown> = {}): SetlistFmSetlist {
  return {
    ...(setlist as unknown as Record<string, unknown>),
    sets: { set: [{ song: songs }] },
    ...extra,
  } as unknown as SetlistFmSetlist;
}

/** T1d: Portland fetched by link, whose only songs are Unknown Songs. */
export const portlandOnlyUnknownSongs = (): SetlistFmSetlist =>
  withSongs(pearlJamPortland(), [{ name: "" }, { name: "", info: "Opener" }]);
