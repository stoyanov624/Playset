// PRD 0010 — "+" is part of a title, not a medley separator (src/core/performances).
// The song names table and "Fixture M revisited". Only " / " (space, slash, space) splits a
// medley. No network: recorded setlist.fm "get setlist" shapes only.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  listTapes,
  toPerformances,
  type Performance,
  type PerformancesResult,
  type SetlistFmSetlist,
} from "../../src/core/performances";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "performances");

function loadSetlist(file: string): SetlistFmSetlist {
  return JSON.parse(readFileSync(join(fixturesDir, file), "utf8")) as SetlistFmSetlist;
}

/** Expected Performance; `medley` is the medley name (the medley marker), absent when none. */
function performance(
  artist: string,
  position: number,
  title: string,
  setLabel: string,
  isTape: boolean,
  originalArtist?: string,
  medley?: string,
): Performance {
  const p: Record<string, unknown> = { position, title, artist, setLabel, isTape };
  if (originalArtist !== undefined) p.originalArtist = originalArtist;
  if (medley !== undefined) p.medley = medley;
  return p as unknown as Performance;
}

const medleyOf = (p: Performance): string | undefined => (p as unknown as { medley?: string }).medley;
const titles = (result: PerformancesResult) => result.performances.map((p) => p.title);
const positions = (result: PerformancesResult) => result.performances.map((p) => p.position);

const ARTIST_MBIDS: Record<string, string> = {
  "P!nk": "f4d5cc07-3bc9-4836-9b15-88a08359bc63",
  "blink-182": "0743b15a-3c32-48c8-ad58-cb325350befa",
  "Michael Kiwanuka": "4f5b2a47-6f3d-4a1c-9b0e-1c3a5d7e9f21",
  "Pearl Jam": "83b9cbe7-9857-49e2-ab8e-b57b01038103",
  Muse: "9c9f1380-2516-4fc9-a3e6-f9f61941d090",
  "Arctic Monkeys": "ada7a83c-e3e1-40f1-93f9-3e73dbfd2c7c",
  "Walk the Moon": "5c2d3e4f-6a7b-4c8d-9e0f-1a2b3c4d5e6f",
};

/** A Setlist by `artist` (Fixture A's Show otherwise) whose only Set is a main Set holding just `song`. */
function singleSongSetlist(artist: string, song: Record<string, unknown>): SetlistFmSetlist {
  const base = loadSetlist("fixture-a-full-show.json") as unknown as Record<string, unknown>;
  return {
    ...base,
    artist: { mbid: ARTIST_MBIDS[artist] ?? "00000000-0000-4000-8000-000000000000", name: artist },
    sets: { set: [{ song: [song] }] },
  } as unknown as SetlistFmSetlist;
}

function titleAndMedley(result: PerformancesResult): [string, string | undefined][] {
  return result.performances.map((p) => [p.title, medleyOf(p)]);
}

// ---------------------------------------------------------------- song names table

describe("toPerformances — a '+' in a song name stays part of the title (PRD 0010)", () => {
  it.each<[string, string, string]>([
    ["U + Ur Hand", "P!nk", "U + Ur Hand"],
    ["M+M's", "blink-182", "M+M's"],
    ["Love + Hate", "Michael Kiwanuka", "Love + Hate"],
    ["Release + Alive", "Pearl Jam", "Release + Alive"],
    ["  Dead Star + In Your World  ", "Muse", "Dead Star + In Your World"],
    ["Me+You", "Arctic Monkeys", "Me+You"],
  ])("AC-2: %j by %s is exactly one Performance titled %j with no medley marker", (name, artist, title) => {
    const result = toPerformances(singleSongSetlist(artist, { name }));

    expect(result.performances).toEqual([performance(artist, 1, title, "main", false)]);
    expect(medleyOf(result.performances[0]!)).toBeUndefined();
    expect(result.noted).toEqual([]);
  });

  it("AC-2: a Cover 'U + Ur Hand' (Walk the Moon, Original Artist P!nk) is one Performance with its Original Artist", () => {
    const result = toPerformances(
      singleSongSetlist("Walk the Moon", {
        name: "U + Ur Hand",
        cover: { mbid: "f4d5cc07-3bc9-4836-9b15-88a08359bc63", name: "P!nk" },
      }),
    );

    expect(result.performances).toEqual([performance("Walk the Moon", 1, "U + Ur Hand", "main", false, "P!nk")]);
    expect(medleyOf(result.performances[0]!)).toBeUndefined();
  });

  it("AC-2: a '+' with several spaces or several '+' signs still gives one Performance with the full trimmed name", () => {
    const result = toPerformances(singleSongSetlist("Muse", { name: " A + B +C+ D " }));

    expect(titleAndMedley(result)).toEqual([["A + B +C+ D", undefined]]);
  });

  it("AC-1: 'Dumpweed / M+M's / Josie / Man Overboard' splits only at ' / ' into four parts carrying the full medley name", () => {
    const medley = "Dumpweed / M+M's / Josie / Man Overboard";
    const result = toPerformances(singleSongSetlist("blink-182", { name: medley }));

    expect(result.performances).toEqual([
      performance("blink-182", 1, "Dumpweed", "main", false, undefined, medley),
      performance("blink-182", 2, "M+M's", "main", false, undefined, medley),
      performance("blink-182", 3, "Josie", "main", false, undefined, medley),
      performance("blink-182", 4, "Man Overboard", "main", false, undefined, medley),
    ]);
    expect(result.noted).toEqual([]);
  });

  it.each<[string, string, string, [string, string | undefined][]]>([
    ["A / B + C", "Arctic Monkeys", "a part with ' + ' is not split further", [
      ["A", "A / B + C"],
      ["B + C", "A / B + C"],
    ]],
    [
      "Map of the Problematique + Stockholm Syndrome / Knights of Cydonia",
      "Muse",
      "mixed ' + ' and ' / ' give two parts, not three",
      [
        ["Map of the Problematique + Stockholm Syndrome", "Map of the Problematique + Stockholm Syndrome / Knights of Cydonia"],
        ["Knights of Cydonia", "Map of the Problematique + Stockholm Syndrome / Knights of Cydonia"],
      ],
    ],
    ["Alive /  + Black", "Pearl Jam", "two spaces after '/': the second part is the trimmed '+ Black'", [
      ["Alive", "Alive /  + Black"],
      ["+ Black", "Alive /  + Black"],
    ]],
    ["Release / + Outro", "Pearl Jam", "unchanged from PRD 0008: '+ Outro' is a part", [
      ["Release", "Release / + Outro"],
      ["+ Outro", "Release / + Outro"],
    ]],
  ])("AC-3: %j by %s — %s", (name, artist, _label, expected) => {
    const result = toPerformances(singleSongSetlist(artist, { name }));

    expect(titleAndMedley(result)).toEqual(expected);
    expect(positions(result)).toEqual(expected.map((_, i) => i + 1));
    expect(result.performances.every((p) => p.setLabel === "main" && p.artist === artist && !p.isTape)).toBe(true);
    expect(result.noted).toEqual([]);
  });

  it("AC-1: a ' / ' medley with a '+' part inherits the song's Set label, Cover and Tape flag on every part", () => {
    const medley = "Intro + Theme / Release";
    const base = loadSetlist("fixture-a-full-show.json") as unknown as Record<string, unknown>;
    const setlist = {
      ...base,
      artist: { mbid: ARTIST_MBIDS["Pearl Jam"], name: "Pearl Jam" },
      sets: {
        set: [
          { song: [{ name: "Corduroy" }] },
          {
            encore: 1,
            song: [{ name: medley, tape: true, cover: { mbid: "83d91898-7763-47d7-b03b-b92132375c47", name: "Pink Floyd" } }],
          },
        ],
      },
    } as unknown as SetlistFmSetlist;

    const result = toPerformances(setlist);

    expect(result.performances).toEqual([
      performance("Pearl Jam", 1, "Corduroy", "main", false),
      performance("Pearl Jam", 2, "Intro + Theme", "Encore 1", true, "Pink Floyd", medley),
      performance("Pearl Jam", 3, "Release", "Encore 1", true, "Pink Floyd", medley),
    ]);
    expect(listTapes(result.performances)).toEqual(["Intro + Theme", "Release"]);
  });

  it.each<[string, string]>([
    ["Porch + Yellow Ledbetter", "Medley"],
    ["Love/Hate + Black", "MEDLEY"],
    ["Me+You", "medley with 'Black'"],
  ])("AC-4: %j with info %j is one Performance whose medley name is its own title", (name, info) => {
    const result = toPerformances(singleSongSetlist("Pearl Jam", { name, info }));

    expect(result.performances).toEqual([performance("Pearl Jam", 1, name, "main", false, undefined, name)]);
    expect(result.noted).toEqual([]);
  });

  it("AC-4: the info-only medley's title is the trimmed name, '+' included", () => {
    const result = toPerformances(singleSongSetlist("Pearl Jam", { name: "  Porch + Yellow Ledbetter ", info: "Medley" }));

    expect(titleAndMedley(result)).toEqual([["Porch + Yellow Ledbetter", "Porch + Yellow Ledbetter"]]);
  });

  it("AC-2: a snippet 'Even Flow + Alive' (info 'Teaser') is still only noted, never split and never a Performance", () => {
    const result = toPerformances(singleSongSetlist("Pearl Jam", { name: "Even Flow + Alive", info: "Teaser" }));

    expect(result.performances).toEqual([]);
    expect(result.noted).toEqual([
      { rawName: "Even Flow + Alive", reason: "snippet", setLabel: "main", afterPosition: 0 },
    ]);
  });

  it("AC-5: a Tape 'Intro + Release' is one Tape Performance and the Tape list holds its full title once", () => {
    const result = toPerformances(singleSongSetlist("Pearl Jam", { name: "Intro + Release", tape: true }));

    expect(result.performances).toEqual([performance("Pearl Jam", 1, "Intro + Release", "main", true)]);
    expect(listTapes(result.performances)).toEqual(["Intro + Release"]);
  });

  it("AC-6: a '+' song counts as one Performance in the positions that follow it", () => {
    const base = loadSetlist("fixture-a-full-show.json") as unknown as Record<string, unknown>;
    const setlist = {
      ...base,
      sets: {
        set: [
          {
            song: [
              { name: "Me+You" },
              { name: "Dead Star + In Your World" },
              { name: "Porch + Yellow Ledbetter", info: "Medley" },
              { name: "Hey Jude", info: "snippet" },
              { name: "505" },
            ],
          },
        ],
      },
    } as unknown as SetlistFmSetlist;

    const result = toPerformances(setlist);

    expect(titles(result)).toEqual(["Me+You", "Dead Star + In Your World", "Porch + Yellow Ledbetter", "505"]);
    expect(positions(result)).toEqual([1, 2, 3, 4]);
    expect(result.noted).toEqual([{ rawName: "Hey Jude", reason: "snippet", setLabel: "main", afterPosition: 3 }]);
  });
});

// ---------------------------------------------------------------- Fixture M revisited

const PJ = "Pearl Jam";
const PINK_FLOYD_MEDLEY = "Interstellar Overdrive / Astronomy Domine";
const DAUGHTER_MEDLEY = "Daughter / W.M.A.";
const EVEN_FLOW_MEDLEY = "Even Flow + Alive / Black";
const WHO_MEDLEY = "Baba O'Riley / Won't Get Fooled Again";
const PORCH = "Porch + Yellow Ledbetter";

const fixtureMRevisited: Performance[] = [
  performance(PJ, 1, "Interstellar Overdrive", "main", true, "Pink Floyd", PINK_FLOYD_MEDLEY),
  performance(PJ, 2, "Astronomy Domine", "main", true, "Pink Floyd", PINK_FLOYD_MEDLEY),
  performance(PJ, 3, "Release", "main", false),
  performance(PJ, 4, "Daughter", "main", false, undefined, DAUGHTER_MEDLEY),
  performance(PJ, 5, "W.M.A.", "main", false, undefined, DAUGHTER_MEDLEY),
  performance(PJ, 6, "Even Flow + Alive", "main", false, undefined, EVEN_FLOW_MEDLEY),
  performance(PJ, 7, "Black", "main", false, undefined, EVEN_FLOW_MEDLEY),
  performance(PJ, 8, "Jeremy", "main", false, undefined, "Jeremy"),
  performance(PJ, 9, "Love/Hate", "main", false),
  performance(PJ, 10, "Baba O'Riley", "Encore 1", false, "The Who", WHO_MEDLEY),
  performance(PJ, 11, "Won't Get Fooled Again", "Encore 1", false, "The Who", WHO_MEDLEY),
  performance(PJ, 12, "Black", "Encore 1", false),
  performance(PJ, 13, PORCH, "Encore 1", false, undefined, PORCH),
];

const fixtureM = () => loadSetlist("fixture-m-pearl-jam-medleys.json");

describe("toPerformances — Fixture M revisited (PRD 0010)", () => {
  it("AC-1: produces exactly the 13 Performances of Fixture M revisited", () => {
    const result = toPerformances(fixtureM());

    expect(result.performances).toEqual(fixtureMRevisited);
    expect(positions(result)).toEqual(Array.from({ length: 13 }, (_, i) => i + 1));
  });

  it("AC-3: 'Even Flow + Alive / Black' splits only at ' / ' into 'Even Flow + Alive' and 'Black', both carrying the full medley name", () => {
    const result = toPerformances(fixtureM());

    expect(result.performances.slice(5, 7)).toEqual([
      performance(PJ, 6, "Even Flow + Alive", "main", false, undefined, EVEN_FLOW_MEDLEY),
      performance(PJ, 7, "Black", "main", false, undefined, EVEN_FLOW_MEDLEY),
    ]);
    for (const t of ["Even Flow", "Alive"]) expect(titles(result)).not.toContain(t);
  });

  it("AC-4: 'Porch + Yellow Ledbetter' with info 'Medley' is one Performance whose medley name is its own title", () => {
    const result = toPerformances(fixtureM());

    expect(result.performances[12]).toEqual(performance(PJ, 13, PORCH, "Encore 1", false, undefined, PORCH));
    for (const t of ["Porch", "Yellow Ledbetter"]) expect(titles(result)).not.toContain(t);
  });

  it("AC-1: the snippet 'Kashmir / Whole Lotta Love' is the only noted song, played after 8", () => {
    const result = toPerformances(fixtureM());

    expect(result.noted).toEqual([
      { rawName: "Kashmir / Whole Lotta Love", reason: "snippet", setLabel: "main", afterPosition: 8 },
    ]);
  });

  it("AC-1: the Tape list is Interstellar Overdrive, Astronomy Domine", () => {
    const result = toPerformances(fixtureM());

    expect(listTapes(result.performances)).toEqual(["Interstellar Overdrive", "Astronomy Domine"]);
  });
});
