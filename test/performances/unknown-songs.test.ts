// PRD 0011 — Unknown Songs and the Incomplete Setlist check in `toPerformances`.
// An Unknown Song (a song with a missing, empty or whitespace-only name) is never a Performance
// and uses no position; it is noted with reason "unknown", its Set label, the position it was
// played after and its info text. The result also carries the incomplete status (AC-5).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  listTapes,
  toPerformances,
  type NotedSong,
  type PerformancesResult,
  type SetlistFmSetlist,
} from "../../src/core/performances";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "performances");

function loadSetlist(file: string): SetlistFmSetlist {
  return JSON.parse(readFileSync(join(fixturesDir, file), "utf8")) as SetlistFmSetlist;
}

const NIRVANA_FILE = "nirvana-53d60349-unknown-song.json";
const RADIOHEAD_FILE = "radiohead-2bf3d4e6-note-incomplete.json";

/** One main Set by "Arctic Monkeys" with the given songs, and an optional Setlist note. */
function arcticMonkeysSetlist(songs: unknown[], note?: unknown): SetlistFmSetlist {
  const setlist: Record<string, unknown> = {
    id: "63a5e2b7",
    eventDate: "23-08-2025",
    artist: { mbid: "ada7a83c-e3e1-40f1-93f9-3e73dbfd2c7c", name: "Arctic Monkeys" },
    venue: {
      id: "6bd6ca6e",
      name: "Ziggo Dome",
      city: { id: "2759794", name: "Amsterdam", country: { code: "NL", name: "Netherlands" } },
    },
    url: "https://www.setlist.fm/setlist/arctic-monkeys/2025/ziggo-dome-amsterdam-netherlands-63a5e2b7.html",
    sets: { set: [{ song: songs }] },
  };
  if (note !== undefined) setlist.info = note;
  return setlist as unknown as SetlistFmSetlist;
}

/** The Radiohead Setlist of N1 with another Setlist note (or none) and optionally other songs. */
function radioheadWithNote(note: string | undefined, songs?: unknown[]): SetlistFmSetlist {
  const base = loadSetlist(RADIOHEAD_FILE) as unknown as Record<string, unknown>;
  const copy: Record<string, unknown> = { ...base };
  if (note === undefined) delete copy.info;
  else copy.info = note;
  if (songs) copy.sets = { set: [{ song: songs }] };
  return copy as unknown as SetlistFmSetlist;
}

function unknownSong(setLabel: string, afterPosition: number, rawName: string, info?: string): NotedSong {
  const n: Record<string, unknown> = { rawName, reason: "unknown", setLabel, afterPosition };
  if (info !== undefined) n.info = info;
  return n as unknown as NotedSong;
}

const titles = (r: PerformancesResult) => r.performances.map((p) => p.title);
const positions = (r: PerformancesResult) => r.performances.map((p) => p.position);
const status = (r: PerformancesResult) => (r as unknown as { incompleteStatus: unknown }).incompleteStatus;

// ---------------------------------------------------------------- U1 — Nirvana, Tacoma

describe("Unknown Songs — U1 (Nirvana, 1987-04-18, Tacoma)", () => {
  it("AC-1: the Unknown Song is not a Performance and uses no position: Pen Cap Chew is #8, Paper Cuts #9", () => {
    const result = toPerformances(loadSetlist(NIRVANA_FILE));

    expect(titles(result)).toEqual([
      "Love Buzz",
      "Floyd the Barber",
      "Downer",
      "Mexican Seafood",
      "Hairspray Queen",
      "Spank Thru",
      "Aero Zeppelin",
      "Pen Cap Chew",
      "Paper Cuts",
    ]);
    expect(positions(result)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(result.performances.every((p) => p.setLabel === "main")).toBe(true);
    expect(result.performances.every((p) => p.artist === "Nirvana")).toBe(true);
    expect(result.performances[0]?.originalArtist).toBe("Shocking Blue");
    expect(titles(result)).not.toContain("");
  });

  it("AC-1: the Unknown Song is noted with reason 'unknown', Set label 'main', played after 7, and its info text", () => {
    const result = toPerformances(loadSetlist(NIRVANA_FILE));

    expect(result.noted).toEqual([unknownSong("main", 7, "", "Written as 'Dope Hippie' on the setlist")]);
    expect(listTapes(result.performances)).toEqual([]);
  });

  it("AC-5: U1 is an Incomplete Setlist with 1 Unknown Song, no matched phrase and no Setlist note", () => {
    const result = toPerformances(loadSetlist(NIRVANA_FILE));

    expect(status(result)).toEqual({ isIncomplete: true, unknownSongCount: 1 });
  });
});

// ---------------------------------------------------------------- U2 — edge cases

describe("Unknown Songs — U2 edge cases", () => {
  it("AC-1: a song with no name but info 'Unknown song' before the first Performance is noted after 0 with that info", () => {
    const result = toPerformances(arcticMonkeysSetlist([{ info: "Unknown song" }, { name: "Brianstorm" }]));

    expect(titles(result)).toEqual(["Brianstorm"]);
    expect(positions(result)).toEqual([1]);
    expect(result.noted).toEqual([unknownSong("main", 0, "", "Unknown song")]);
  });

  it("AC-1: an empty and a whitespace-only name next to each other are two Unknown Songs, both after 1, with no info", () => {
    const result = toPerformances(
      arcticMonkeysSetlist([{ name: "505" }, { name: "" }, { name: "   " }, { name: "Mardy Bum" }]),
    );

    expect(titles(result)).toEqual(["505", "Mardy Bum"]);
    expect(positions(result)).toEqual([1, 2]);
    expect(result.noted).toEqual([unknownSong("main", 1, ""), unknownSong("main", 1, "   ")]);
    expect(status(result)).toMatchObject({ isIncomplete: true, unknownSongCount: 2 });
  });

  it("AC-1: whitespace-only info counts as no info text", () => {
    const result = toPerformances(arcticMonkeysSetlist([{ name: "505" }, { name: "", info: "  " }]));

    expect(result.noted).toEqual([unknownSong("main", 1, "")]);
    expect((result.noted[0] as unknown as { info?: string }).info).toBeUndefined();
  });

  it("AC-1: the info text is trimmed", () => {
    const result = toPerformances(arcticMonkeysSetlist([{ name: "", info: "  Intro jam  " }, { name: "Brianstorm" }]));

    expect(result.noted).toEqual([unknownSong("main", 0, "", "Intro jam")]);
  });

  it("AC-1: the entry records the label of the Set it was played in (Acoustic, Encore n)", () => {
    const setlist = arcticMonkeysSetlist([]);
    (setlist as unknown as { sets: unknown }).sets = {
      set: [
        { song: [{ name: "505" }] },
        { name: "Acoustic", song: [{ name: "Mardy Bum" }, { name: "" }] },
        { encore: 1, song: [{ name: "", info: "Jam" }, { name: "R U Mine?" }] },
      ],
    };
    const result = toPerformances(setlist);

    expect(titles(result)).toEqual(["505", "Mardy Bum", "R U Mine?"]);
    expect(result.noted).toEqual([unknownSong("Acoustic", 2, ""), unknownSong("Encore 1", 2, "", "Jam")]);
  });

  it("AC-2: an unnamed song with info 'snippet' is noted as unknown, not as a snippet", () => {
    const result = toPerformances(arcticMonkeysSetlist([{ name: "", info: "snippet" }]));

    expect(result.performances).toEqual([]);
    expect(result.noted).toEqual([unknownSong("main", 0, "", "snippet")]);
  });

  it("AC-2: an unnamed song with info 'Tease' or 'teased' is noted as unknown", () => {
    const result = toPerformances(arcticMonkeysSetlist([{ name: "  ", info: "Tease" }, { name: "", info: "teased intro" }]));

    expect(result.noted.map((n) => n.reason)).toEqual(["unknown", "unknown"]);
    expect(result.noted.map((n) => (n as unknown as { info?: string }).info)).toEqual(["Tease", "teased intro"]);
  });

  it("AC-2: a whitespace-only name with info 'Medley' is noted as unknown and is not a Performance", () => {
    const result = toPerformances(arcticMonkeysSetlist([{ name: " ", info: "Medley" }]));

    expect(result.performances).toEqual([]);
    expect(result.noted).toEqual([unknownSong("main", 0, " ", "Medley")]);
  });

  it("AC-2: a tape flag on an unnamed song doesn't make it a Tape: the Tape list is empty", () => {
    const result = toPerformances(arcticMonkeysSetlist([{ name: "", tape: true, info: "Intro tape" }]));

    expect(result.performances).toEqual([]);
    expect(listTapes(result.performances)).toEqual([]);
    expect(result.noted).toEqual([unknownSong("main", 0, "", "Intro tape")]);
  });

  it("AC-2: a cover artist gives no Original Artist and a guest is ignored", () => {
    const result = toPerformances(
      arcticMonkeysSetlist([{ name: "", cover: { name: "The Beatles" }, with: { name: "Miles Kane" } }]),
    );

    expect(result.performances).toEqual([]);
    expect(result.noted).toEqual([unknownSong("main", 0, "")]);
    expect(JSON.stringify(result.noted)).not.toContain("The Beatles");
    expect(JSON.stringify(result)).not.toContain("Miles Kane");
  });

  it("AC-2: the snippet rule still applies to songs with a name", () => {
    const result = toPerformances(arcticMonkeysSetlist([{ name: "Hey Jude", info: "snippet" }, { name: "505" }]));

    expect(result.noted).toEqual([{ rawName: "Hey Jude", reason: "snippet", setLabel: "main", afterPosition: 0 }]);
  });

  it("AC-3: snippets and Unknown Songs are noted together in played order", () => {
    const result = toPerformances(
      arcticMonkeysSetlist([
        { name: "Hey Jude", info: "snippet" },
        { name: "505" },
        { name: "" },
        { name: "Kashmir", info: "Tease" },
      ]),
    );

    expect(titles(result)).toEqual(["505"]);
    expect(result.noted).toEqual([
      { rawName: "Hey Jude", reason: "snippet", setLabel: "main", afterPosition: 0 },
      unknownSong("main", 1, ""),
      { rawName: "Kashmir", reason: "snippet", setLabel: "main", afterPosition: 1 },
    ]);
  });

  it("AC-3: each Unknown Song is counted once in the Unknown Song count; snippets are not counted", () => {
    const result = toPerformances(
      arcticMonkeysSetlist([
        { name: "Hey Jude", info: "snippet" },
        { name: "" },
        { name: "" },
        { name: "505" },
        { info: "x" },
      ]),
    );

    expect(status(result)).toEqual({ isIncomplete: true, unknownSongCount: 3 });
  });
});

// ---------------------------------------------------------------- PRD 0002 Fixture E and A under the new rules

describe("Unknown Songs — PRD 0002 Fixtures E and A revisited", () => {
  it("AC-3: Fixture E notes two Unknown Songs after 2 (the first with info 'Unknown song') and is incomplete with 2 Unknown Songs", () => {
    const result = toPerformances(loadSetlist("fixture-e-covers-and-missing-names.json"));

    expect(titles(result)).toEqual(["Creep", "Karma Police", "No Surprises"]);
    expect(result.noted).toEqual([unknownSong("main", 2, "", "Unknown song"), unknownSong("main", 2, "")]);
    expect(status(result)).toEqual({ isIncomplete: true, unknownSongCount: 2 });
  });

  it("AC-1: Fixture A's whitespace-only song in the Acoustic Set is noted as unknown after 9 (Cornerstone); Fixture A is incomplete with 1 Unknown Song", () => {
    const result = toPerformances(loadSetlist("fixture-a-full-show.json"));

    expect(result.performances).toHaveLength(14);
    expect(result.noted).toEqual([
      { rawName: "Hey Jude", reason: "snippet", setLabel: "main", afterPosition: 3 },
      unknownSong("Acoustic", 9, "   "),
    ]);
    expect(status(result)).toEqual({ isIncomplete: true, unknownSongCount: 1 });
  });

  it.each([
    ["an empty list of Sets", "fixture-g1-empty-set-list.json"],
    ["no Sets", "fixture-g2-no-set-key.json"],
    ["Sets with no songs", "fixture-g3-sets-without-songs.json"],
  ])("AC-5: a Setlist with %s and no Setlist note is not incomplete", (_label, file) => {
    const result = toPerformances(loadSetlist(file));

    expect(status(result)).toEqual({ isIncomplete: false, unknownSongCount: 0 });
  });

  it("AC-5: a Setlist with only named songs and no Setlist note is not incomplete (Fixture C)", () => {
    const result = toPerformances(loadSetlist("fixture-c-snippets-and-teases.json"));

    expect(status(result)).toEqual({ isIncomplete: false, unknownSongCount: 0 });
  });
});

// ---------------------------------------------------------------- N1 — the Setlist note

const PHRASE_ROWS: [string, string][] = [
  ["Setlist incomplete", "incomplete"],
  ["INCOMPLETE SETLIST.", "incomplete"],
  ["Partial setlist, from fan videos", "partial"],
  ["Rest of the set unknown.", "rest of the set unknown"],
  ["First 5 songs known, rest unknown", "rest unknown"],
  ["Show cut short after a power outage.", "cut short"],
  ["Show ended early because of rain", "ended early"],
  ["There were 2 unknown songs before the encore", "unknown songs"],
  ["Setlist is not   complete", "not complete"],
  ["Setlist incomplete, rest unknown", "incomplete"],
  ["Not incomplete!", "incomplete"],
  ["Show was cut\tshort", "cut short"],
  ["(partial)", "partial"],
];

const NON_MATCHING_NOTES = [
  "Partially recorded",
  "Incompletely documented",
  "Show was cut-short",
  "Unknown song order",
  "Not completed yet",
  "First show of the tour",
  "Recorded for BBC radio",
  "unincomplete",
  "",
  "   ",
];

describe("Incomplete Setlist — N1 Setlist note phrases", () => {
  it.each(PHRASE_ROWS)("AC-4: the note %j matches with phrase %j", (note, phrase) => {
    const result = toPerformances(radioheadWithNote(note));

    expect(status(result)).toEqual({
      isIncomplete: true,
      unknownSongCount: 0,
      matchedPhrase: phrase,
      setlistNote: note.trim(),
    });
  });

  it.each(NON_MATCHING_NOTES)("AC-4: the note %j does not match", (note) => {
    const result = toPerformances(radioheadWithNote(note));

    expect(status(result)).toEqual({ isIncomplete: false, unknownSongCount: 0 });
  });

  it("AC-4: a missing Setlist note never matches", () => {
    const result = toPerformances(radioheadWithNote(undefined));

    expect(status(result)).toEqual({ isIncomplete: false, unknownSongCount: 0 });
  });

  it("AC-5: the Setlist note is given trimmed", () => {
    const result = toPerformances(radioheadWithNote("  Setlist incomplete \n"));

    expect(status(result)).toMatchObject({ matchedPhrase: "incomplete", setlistNote: "Setlist incomplete" });
  });

  it("AC-5: the Radiohead Setlist (note 'Setlist incomplete', all songs named) is incomplete with 0 Unknown Songs; Performances as usual, nothing noted", () => {
    const result = toPerformances(loadSetlist(RADIOHEAD_FILE));

    expect(titles(result)).toEqual(["Airbag", "Paranoid Android", "Karma Police"]);
    expect(result.noted).toEqual([]);
    expect(status(result)).toEqual({
      isIncomplete: true,
      unknownSongCount: 0,
      matchedPhrase: "incomplete",
      setlistNote: "Setlist incomplete",
    });
  });

  it("AC-5: a song's own info never counts: the phrases in a song's info don't make the Setlist incomplete", () => {
    const result = toPerformances(
      radioheadWithNote("Recorded for BBC radio", [
        { name: "Airbag" },
        { name: "Paranoid Android", info: "incomplete, cut short by a broken string" },
        { name: "Karma Police" },
      ]),
    );

    expect(titles(result)).toEqual(["Airbag", "Paranoid Android", "Karma Police"]);
    expect(status(result)).toEqual({ isIncomplete: false, unknownSongCount: 0 });
  });

  it("AC-5: both a matching note and Unknown Songs give incomplete, the count, the phrase and the note", () => {
    const result = toPerformances(
      radioheadWithNote("Rest of the set unknown.", [{ name: "Airbag" }, { name: "" }, { name: "" }]),
    );

    expect(status(result)).toEqual({
      isIncomplete: true,
      unknownSongCount: 2,
      matchedPhrase: "rest of the set unknown",
      setlistNote: "Rest of the set unknown.",
    });
  });

  it("AC-5: an empty Setlist (no songs) is incomplete only when its note matches", () => {
    const empty = arcticMonkeysSetlist([], "Setlist incomplete");
    (empty as unknown as { sets: unknown }).sets = { set: [] };

    expect(status(toPerformances(empty))).toEqual({
      isIncomplete: true,
      unknownSongCount: 0,
      matchedPhrase: "incomplete",
      setlistNote: "Setlist incomplete",
    });
  });

  it("AC-5: turning the same Setlist into Performances twice gives equal incomplete statuses and leaves the input unchanged", () => {
    const setlist = radioheadWithNote("Rest of the set unknown.", [{ name: "Airbag" }, { name: "" }]);
    const pristine = JSON.parse(JSON.stringify(setlist));

    const first = toPerformances(setlist);
    const second = toPerformances(setlist);

    expect(status(second)).toEqual(status(first));
    expect(setlist).toEqual(pristine);
  });
});
