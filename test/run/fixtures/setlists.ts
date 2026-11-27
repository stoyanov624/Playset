// Setlist fixtures for the run tests (PRD 0007).
// Shapes follow setlist.fm's "get setlist" response (REST API 1.0), as in PRD 0002 / PRD 0005.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ArtistCandidate, SetlistFmSetlist, Show } from "../../../src/core/index.js";

const sharedFixtures = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "fixtures", "performances");

function loadShared(file: string): SetlistFmSetlist {
  return JSON.parse(readFileSync(join(sharedFixtures, file), "utf8")) as SetlistFmSetlist;
}

export const FIXTURE_A_URL =
  "https://www.setlist.fm/setlist/arctic-monkeys/2025/ziggo-dome-amsterdam-netherlands-63a5e2b7.html";
export const FIXTURE_A_SETLIST_ID = "63a5e2b7";
export const FIXTURE_A_PLAYLIST_NAME = "Arctic Monkeys – 2025-08-23 – Amsterdam";

/** PRD 0002 Fixture A (revisited by PRD 0008): 14 Performances, 2 Tapes, 1 noted song. */
export const fixtureA = (): SetlistFmSetlist => loadShared("fixture-a-full-show.json");
/** PRD 0008 Fixture M: Pearl Jam in Amsterdam, every kind of medley (15 Performances, 2 Tapes). */
export const fixtureM = (): SetlistFmSetlist => loadShared("fixture-m-pearl-jam-medleys.json");
export const FIXTURE_M_URL =
  "https://www.setlist.fm/setlist/pearl-jam/2026/johan-cruijff-arena-amsterdam-netherlands-5bf2a3c4.html";
export const FIXTURE_M_SETLIST_ID = "5bf2a3c4";
export const FIXTURE_M_PLAYLIST_NAME = "Pearl Jam – 2026-07-08 – Amsterdam";
export const fixtureMShow: Show = {
  artist: "Pearl Jam",
  date: "2026-07-08",
  city: "Amsterdam",
  venue: "Johan Cruijff ArenA",
  url: FIXTURE_M_URL,
};

/** PRD 0002 Fixture C: no Tapes. */
export const fixtureC = (): SetlistFmSetlist => loadShared("fixture-c-snippets-and-teases.json");
/** PRD 0002 Fixture F: the Tape "Baba O'Riley" (The Who) played twice. */
export const fixtureF = (): SetlistFmSetlist => loadShared("fixture-f-repeated-tape.json");

export const fixtureAShow: Show = {
  artist: "Arctic Monkeys",
  date: "2025-08-23",
  city: "Amsterdam",
  venue: "Ziggo Dome",
  url: FIXTURE_A_URL,
};

/** A setlist.fm setlist with Fixture A's Show details and the given sets. */
export function withFixtureAShow(sets: unknown, overrides: Record<string, unknown> = {}): SetlistFmSetlist {
  const base = fixtureA() as unknown as Record<string, unknown>;
  return { ...base, sets, ...overrides } as unknown as SetlistFmSetlist;
}

/** E2 — the announced Berlin Show (no Performances yet). */
export const E2_URL =
  "https://www.setlist.fm/setlist/arctic-monkeys/2027/mercedes-benz-arena-berlin-germany-1bd2f5a8.html";
export function announcedBerlinShow(): SetlistFmSetlist {
  return {
    id: "1bd2f5a8",
    eventDate: "14-03-2027",
    artist: { mbid: "ada7a83c-e3e1-40f1-93f9-3e73dbfd2c7c", name: "Arctic Monkeys" },
    venue: {
      id: "3bd6b8c4",
      name: "Mercedes-Benz Arena",
      city: { id: "2950159", name: "Berlin", country: { code: "DE", name: "Germany" } },
    },
    url: E2_URL,
    sets: { set: [] },
  } as unknown as SetlistFmSetlist;
}

/** E3 — a setlist.fm URL of `totalLength` characters (276 → description of 301 characters). */
export function setlistUrlOfLength(totalLength: number): string {
  const prefix = "https://www.setlist.fm/setlist/";
  const beforeHtml = totalLength - ".html".length;
  return prefix + "a".repeat(beforeHtml - prefix.length) + ".html";
}
export const tooLongDescriptionSetlist = (): SetlistFmSetlist =>
  withFixtureAShow(fixtureA().sets, { url: setlistUrlOfLength(276) });

/** E5 — every Performance is a Tape ("Intro"). */
export const onlyTapeSetlist = (): SetlistFmSetlist =>
  withFixtureAShow({ set: [{ song: [{ name: "Intro", tape: true }] }] });

/** E9 — Muse in Rome, two new songs that are both Misses. */
export function museRomeSetlist(): SetlistFmSetlist {
  return {
    id: "5bd3e6a0",
    eventDate: "20-06-2026",
    artist: { mbid: "9c9f1380-2516-4fc9-a3e6-f9f61941d090", name: "Muse" },
    venue: {
      id: "4bd6a3e2",
      name: "Stadio Olimpico",
      city: { id: "3169070", name: "Rome", country: { code: "IT", name: "Italy" } },
    },
    url: "https://www.setlist.fm/setlist/muse/2026/stadio-olimpico-rome-italy-5bd3e6a0.html",
    sets: { set: [{ song: [{ name: "Untitled New Song" }, { name: "Another New Song" }] }] },
  } as unknown as SetlistFmSetlist;
}

/** E16 — 250 Performances, none of them Tapes. */
export const bigSetlist = (count = 250): SetlistFmSetlist =>
  withFixtureAShow({
    set: [{ song: Array.from({ length: count }, (_, i) => ({ name: `Song ${i + 1}` })) }],
  });

/** E7 — Pearl Jam with a live-only Match and Muse-style Miss in one Show. */
export function pearlJamSetlist(): SetlistFmSetlist {
  return {
    id: "2bd4c5a1",
    eventDate: "05-07-2026",
    artist: { mbid: "83b9cbe7-9857-49e2-ab8e-b57b01038103", name: "Pearl Jam" },
    venue: {
      id: "1bd6a7c3",
      name: "Hyde Park",
      city: { id: "2643743", name: "London", country: { code: "GB", name: "United Kingdom" } },
    },
    url: "https://www.setlist.fm/setlist/pearl-jam/2026/hyde-park-london-england-2bd4c5a1.html",
    sets: { set: [{ song: [{ name: "Crown of Thorns" }, { name: "Untitled New Song" }, { name: "Déjà Vu" }] }] },
  } as unknown as SetlistFmSetlist;
}

// ---------------------------------------------------------------- Artist candidates (PRD 0005)

export const ARCTIC_MONKEYS_CANDIDATES: ArtistCandidate[] = [
  {
    name: "Arctic Monkeys",
    mbid: "ada7a83c-e3e1-40f1-93f9-3e73dbfd2c7c",
    disambiguation: "English rock band from Sheffield",
  },
  { name: "Arctic Monkeys Tribute", mbid: "5b0c1a4e-2f0e-4f1a-9a77-1d2b3c4d5e6f" },
  { name: "The Arctic Monkeys Experience", mbid: "7c1e2d3f-4a5b-4c6d-8e9f-0a1b2c3d4e5f" },
];

export const GENESIS_CANDIDATES: ArtistCandidate[] = [
  { name: "Genesis", mbid: "8e3fcd7d-bda1-4ca0-b987-b8528d2ee74e", disambiguation: "English rock band" },
  { name: "Genesis", mbid: "2f4b1c6e-7a8d-4e9f-b0a1-c2d3e4f5a6b7", disambiguation: "US psychedelic rock band" },
  { name: "Genesis Owusu", mbid: "4a5b6c7d-8e9f-4a0b-9c1d-2e3f4a5b6c7d" },
];
