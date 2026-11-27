// PRD 0008 — splitting medleys into Performances (src/core/performances).
// Fixture A revisited, Fixture D revisited, Fixture M (Pearl Jam, every kind of medley) and
// Fixture N (single-song edge cases). PRD 0010 supersedes the " + " splitting: Fixture M and
// the Fixture N rows with " + " follow PRD 0010 ("Fixture M revisited", song names table). No network: recorded setlist.fm "get setlist" shapes only.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  listTapes,
  toPerformances,
  type NotedSong,
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

// ---------------------------------------------------------------- Fixture A revisited

const AM = "Arctic Monkeys";
const TEDDY_MEDLEY = "Teddy Picker / Crying Lightning";

const fixtureARevisitedPerformances: Performance[] = [
  performance(AM, 1, "I Want It All", "main", true, "Queen"),
  performance(AM, 2, "Sculptures of Anything Goes", "main", false),
  performance(AM, 3, "Brianstorm", "main", false),
  performance(AM, 4, "Don't Sit Down 'Cause I've Moved Your Chair", "main", false),
  performance(AM, 5, "505", "main", false),
  performance(AM, 6, "Mardy Bum", "Acoustic", false),
  performance(AM, 7, "Teddy Picker", "Acoustic", false, undefined, TEDDY_MEDLEY),
  performance(AM, 8, "Crying Lightning", "Acoustic", false, undefined, TEDDY_MEDLEY),
  performance(AM, 9, "Cornerstone", "Acoustic", false, undefined, "Cornerstone"),
  performance(AM, 10, "I Wanna Be Yours", "Encore 1", false),
  performance(AM, 11, "505", "Encore 1", false),
  performance(AM, 12, "Baby, I'm Yours", "Encore 1", false, "Barbara Lewis"),
  performance(AM, 13, "R U Mine?", "Encore 2", false),
  performance(AM, 14, "Mr. Blue Sky", "Encore 2", true, "Electric Light Orchestra"),
];

describe("toPerformances — Fixture A revisited (PRD 0008)", () => {
  it("AC-1: 'Teddy Picker / Crying Lightning' becomes two Performances in its place; later positions move down with no gaps", () => {
    const result = toPerformances(loadSetlist("fixture-a-full-show.json"));

    expect(titles(result)).toEqual(fixtureARevisitedPerformances.map((p) => p.title));
    expect(positions(result)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
  });

  it("AC-1: produces exactly the expected Performances for Fixture A revisited", () => {
    const result = toPerformances(loadSetlist("fixture-a-full-show.json"));

    expect(result.performances).toEqual(fixtureARevisitedPerformances);
  });

  it("AC-3: each part carries the medley name; Performances not from a medley carry no medley marker", () => {
    const result = toPerformances(loadSetlist("fixture-a-full-show.json"));

    expect(result.performances.map(medleyOf)).toEqual([
      undefined, undefined, undefined, undefined, undefined, undefined,
      TEDDY_MEDLEY, TEDDY_MEDLEY, "Cornerstone",
      undefined, undefined, undefined, undefined, undefined,
    ]);
  });

  it("AC-6: 'Cornerstone' with info 'Medley with ...' is one Performance whose medley name is its own title, and is not noted", () => {
    const result = toPerformances(loadSetlist("fixture-a-full-show.json"));

    const cornerstone = result.performances.filter((p) => p.title === "Cornerstone");
    expect(cornerstone).toEqual([performance(AM, 9, "Cornerstone", "Acoustic", false, undefined, "Cornerstone")]);
    expect(titles(result)).not.toContain("Fluorescent Adolescent");
    expect(result.noted.map((n) => n.rawName)).not.toContain("Cornerstone");
  });

  it("AC-9 (amended by PRD 0011 AC-1): only the snippet 'Hey Jude' and the Unknown Song after Cornerstone are noted; no medley is noted", () => {
    const result = toPerformances(loadSetlist("fixture-a-full-show.json"));

    expect(result.noted).toEqual([
      { rawName: "Hey Jude", reason: "snippet", setLabel: "main", afterPosition: 3 },
      { rawName: "   ", reason: "unknown", setLabel: "Acoustic", afterPosition: 9 },
    ] as NotedSong[]);
  });

  it("AC-5: the Tape list is unchanged: I Want It All, Mr. Blue Sky", () => {
    const result = toPerformances(loadSetlist("fixture-a-full-show.json"));

    expect(listTapes(result.performances)).toEqual(["I Want It All", "Mr. Blue Sky"]);
  });
});

// ---------------------------------------------------------------- Fixture D revisited

describe("toPerformances — Fixture D revisited (PRD 0008)", () => {
  it("AC-1: produces exactly the expected Performances for Fixture D revisited", () => {
    const result = toPerformances(loadSetlist("fixture-d-medleys.json"));

    expect(result.performances).toEqual([
      performance(AM, 1, "Even Flow", "main", false),
      performance(AM, 2, "Rockin' in the Free World", "main", false, undefined, "Rockin' in the Free World"),
      performance(AM, 3, "Intro", "main", true, undefined, "Intro / Release"),
      performance(AM, 4, "Release", "main", true, undefined, "Intro / Release"),
    ]);
  });

  it("AC-6: info 'MEDLEY' (upper case) with no separator gives one Performance with its own title as medley name", () => {
    const result = toPerformances(loadSetlist("fixture-d-medleys.json"));

    const rockin = result.performances[1];
    expect(rockin?.title).toBe("Rockin' in the Free World");
    expect(rockin && medleyOf(rockin)).toBe("Rockin' in the Free World");
  });

  it("AC-5: a Tape medley gives Tape parts, and the Tape list holds each part's title", () => {
    const result = toPerformances(loadSetlist("fixture-d-medleys.json"));

    expect(result.performances.filter((p) => p.isTape).map((p) => p.title)).toEqual(["Intro", "Release"]);
    expect(listTapes(result.performances)).toEqual(["Intro", "Release"]);
  });

  it("AC-7: 'Kashmir / Whole Lotta Love' with info 'tease' is a snippet: noted, not split, not a Performance", () => {
    const result = toPerformances(loadSetlist("fixture-d-medleys.json"));

    for (const t of ["Kashmir", "Whole Lotta Love", "Kashmir / Whole Lotta Love"]) {
      expect(titles(result)).not.toContain(t);
    }
    expect(result.noted).toEqual([
      { rawName: "Kashmir / Whole Lotta Love", reason: "snippet", setLabel: "main", afterPosition: 2 },
    ]);
  });

  it("AC-9: medleys are never noted; the snippet's 'played after' position counts parts as Performances", () => {
    const result = toPerformances(loadSetlist("fixture-d-medleys.json"));

    expect(result.noted.every((n) => n.reason === "snippet")).toBe(true);
    expect(result.noted.map((n) => n.rawName)).not.toContain("Rockin' in the Free World");
    expect(result.noted.map((n) => n.rawName)).not.toContain("Intro / Release");
  });
});

// ---------------------------------------------------------------- Fixture M (revisited by PRD 0010)
// PRD 0010 replaced PRD 0008's expected Performances for Fixture M: only " / " splits, so
// "Even Flow + Alive / Black" gives two parts and "Porch + Yellow Ledbetter" (info "Medley")
// is one Performance. 13 Performances instead of 15; Kashmir is noted after 8 instead of 9.

const PJ = "Pearl Jam";
const PINK_FLOYD_MEDLEY = "Interstellar Overdrive / Astronomy Domine";
const DAUGHTER_MEDLEY = "Daughter / W.M.A.";
const EVEN_FLOW_MEDLEY = "Even Flow + Alive / Black";
const WHO_MEDLEY = "Baba O'Riley / Won't Get Fooled Again";
const PORCH_MEDLEY = "Porch + Yellow Ledbetter";

const fixtureMPerformances: Performance[] = [
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
  performance(PJ, 13, "Porch + Yellow Ledbetter", "Encore 1", false, undefined, PORCH_MEDLEY),
];

const fixtureM = () => loadSetlist("fixture-m-pearl-jam-medleys.json");

describe("toPerformances — Fixture M (Pearl Jam, every kind of medley; revisited by PRD 0010)", () => {
  it("AC-1 (PRD 0010): produces exactly the expected 13 Performances for Fixture M revisited", () => {
    const result = toPerformances(fixtureM());

    expect(result.performances).toEqual(fixtureMPerformances);
  });

  it("AC-3 (PRD 0010): splits only at ' / ' (a '+' part stays whole), keeps the parts in name order, positions 1..13 with no gaps", () => {
    const result = toPerformances(fixtureM());

    expect(positions(result)).toEqual(Array.from({ length: 13 }, (_, i) => i + 1));
    expect(result.performances.slice(3, 7).map((p) => p.title)).toEqual(["Daughter", "W.M.A.", "Even Flow + Alive", "Black"]);
    expect(result.performances.slice(12).map((p) => p.title)).toEqual(["Porch + Yellow Ledbetter"]);
  });

  it("AC-1 (PRD 0010): each part has the Set label of the medley's Set", () => {
    const result = toPerformances(fixtureM());

    expect(result.performances.map((p) => p.setLabel)).toEqual([
      ...Array(9).fill("main"),
      ...Array(4).fill("Encore 1"),
    ]);
  });

  it("AC-1 (PRD 0010), PRD 0008 AC-2: 'Love/Hate' (slash without spaces) is one normal Performance (#9) with no medley marker", () => {
    const result = toPerformances(fixtureM());

    const loveHate = result.performances[8]!;
    expect(loveHate).toEqual(performance(PJ, 9, "Love/Hate", "main", false));
    expect(medleyOf(loveHate)).toBeUndefined();
  });

  it("AC-3 (PRD 0010): every part carries the full medley name; Release, Love/Hate and the second Black carry none", () => {
    const result = toPerformances(fixtureM());

    expect(result.performances.map(medleyOf)).toEqual([
      PINK_FLOYD_MEDLEY, PINK_FLOYD_MEDLEY,
      undefined,
      DAUGHTER_MEDLEY, DAUGHTER_MEDLEY,
      EVEN_FLOW_MEDLEY, EVEN_FLOW_MEDLEY,
      "Jeremy",
      undefined,
      WHO_MEDLEY, WHO_MEDLEY,
      undefined,
      PORCH_MEDLEY,
    ]);
  });

  it("AC-1 (PRD 0010), PRD 0008 AC-4: every part of a Cover medley has the medley's Original Artist; every Artist is the Setlist's Artist; the guest is ignored", () => {
    const result = toPerformances(fixtureM());

    for (const p of result.performances) expect(p.artist).toBe(PJ);
    expect(result.performances.slice(0, 2).map((p) => p.originalArtist)).toEqual(["Pink Floyd", "Pink Floyd"]);
    expect(result.performances.slice(9, 11).map((p) => p.originalArtist)).toEqual(["The Who", "The Who"]);
    expect(JSON.stringify(result)).not.toContain("Josh Klinghoffer");
  });

  it("AC-5: every part of a Tape medley is a Tape; the Tape list holds each part's title in played order", () => {
    const result = toPerformances(fixtureM());

    expect(result.performances.filter((p) => p.isTape).map((p) => p.position)).toEqual([1, 2]);
    expect(listTapes(result.performances)).toEqual(["Interstellar Overdrive", "Astronomy Domine"]);
  });

  it("AC-4 (PRD 0010), PRD 0008 AC-6: 'Jeremy' (info-only medley) is one Performance (#8) with medley name 'Jeremy'; 'Footsteps' is not added", () => {
    const result = toPerformances(fixtureM());

    expect(result.performances[7]).toEqual(performance(PJ, 8, "Jeremy", "main", false, undefined, "Jeremy"));
    expect(titles(result)).not.toContain("Footsteps");
  });

  it("AC-4 (PRD 0010): 'Porch + Yellow Ledbetter' with info 'Medley' is one Performance whose medley name is its own title", () => {
    const result = toPerformances(fixtureM());

    expect(result.performances.slice(12)).toEqual([
      performance(PJ, 13, "Porch + Yellow Ledbetter", "Encore 1", false, undefined, PORCH_MEDLEY),
    ]);
  });

  it("AC-1 (PRD 0010), PRD 0008 AC-7: the snippet 'Kashmir / Whole Lotta Love' is noted as a snippet with its raw name (after 8), not split and not a Performance", () => {
    const result = toPerformances(fixtureM());

    for (const t of ["Kashmir", "Whole Lotta Love", "Kashmir / Whole Lotta Love"]) {
      expect(titles(result)).not.toContain(t);
    }
    expect(result.noted).toContainEqual({
      rawName: "Kashmir / Whole Lotta Love",
      reason: "snippet",
      setLabel: "main",
      afterPosition: 8,
    });
  });

  it("AC-3 (PRD 0010), PRD 0008 AC-8: a part with the same title as a later song ('Black' #7 and #12) stays two separate Performances", () => {
    const result = toPerformances(fixtureM());

    const blacks = result.performances.filter((p) => p.title === "Black");
    expect(blacks.map((p) => [p.position, p.setLabel, medleyOf(p)])).toEqual([
      [7, "main", EVEN_FLOW_MEDLEY],
      [12, "Encore 1", undefined],
    ]);
  });

  it("AC-6 (PRD 0010), PRD 0008 AC-9: the noted list is only the snippet, played after 8 (parts counted as Performances)", () => {
    const result = toPerformances(fixtureM());

    expect(result.noted).toEqual([
      { rawName: "Kashmir / Whole Lotta Love", reason: "snippet", setLabel: "main", afterPosition: 8 },
    ]);
  });

  it("AC-1: splitting does not mutate the input and gives equal results twice", () => {
    const setlist = fixtureM();
    const pristine = fixtureM();
    const first = toPerformances(setlist);
    const second = toPerformances(setlist);
    expect(second).toEqual(first);
    expect(setlist).toEqual(pristine);
  });
});

// ---------------------------------------------------------------- Fixture N

/** A Setlist by "Arctic Monkeys" (Fixture A's Show) whose only Set holds just `song`. */
function singleSongSetlist(song: Record<string, unknown>): SetlistFmSetlist {
  const base = loadSetlist("fixture-a-full-show.json") as unknown as Record<string, unknown>;
  return { ...base, sets: { set: [{ song: [song] }] } } as unknown as SetlistFmSetlist;
}

function titleAndMedley(result: PerformancesResult): [string, string | undefined][] {
  return result.performances.map((p) => [p.title, medleyOf(p)]);
}

describe("toPerformances — Fixture N (single songs and edge cases)", () => {
  it.each<[string, Record<string, unknown>, [string, string | undefined][]]>([
    [
      "the medley name is the trimmed name",
      { name: "  Do I Wanna Know? / 505  " },
      [
        ["Do I Wanna Know?", "Do I Wanna Know? / 505"],
        ["505", "Do I Wanna Know? / 505"],
      ],
    ],
    [
      "separators are found left to right and never overlap",
      { name: "Release / + Outro" },
      [
        ["Release", "Release / + Outro"],
        ["+ Outro", "Release / + Outro"],
      ],
    ],
  ])("AC-1: %s", (_label, song, expected) => {
    const result = toPerformances(singleSongSetlist(song));

    expect(titleAndMedley(result)).toEqual(expected);
    expect(positions(result)).toEqual(expected.map((_, i) => i + 1));
    expect(result.performances.every((p) => p.setLabel === "main" && p.artist === AM && !p.isTape)).toBe(true);
    expect(result.noted).toEqual([]);
  });

  // PRD 0010 replaced these three Fixture N rows: "+" never splits a song, only " / " does.
  it.each<[string, Record<string, unknown>, [string, string | undefined][]]>([
    [
      "AC-2 (PRD 0010): 'Dead Star + In Your World' is one Performance with no medley marker",
      { name: "Dead Star + In Your World" },
      [["Dead Star + In Your World", undefined]],
    ],
    [
      "AC-3 (PRD 0010): mixed ' + ' and ' / ' give two parts, split only at ' / '",
      { name: "Map of the Problematique + Stockholm Syndrome / Knights of Cydonia" },
      [
        ["Map of the Problematique + Stockholm Syndrome", "Map of the Problematique + Stockholm Syndrome / Knights of Cydonia"],
        ["Knights of Cydonia", "Map of the Problematique + Stockholm Syndrome / Knights of Cydonia"],
      ],
    ],
    [
      "AC-3 (PRD 0010): 'Alive /  + Black' splits only at ' / '; the second part is the trimmed '+ Black'",
      { name: "Alive /  + Black" },
      [
        ["Alive", "Alive /  + Black"],
        ["+ Black", "Alive /  + Black"],
      ],
    ],
  ])("%s", (_label, song, expected) => {
    const result = toPerformances(singleSongSetlist(song));

    expect(titleAndMedley(result)).toEqual(expected);
    expect(positions(result)).toEqual(expected.map((_, i) => i + 1));
    expect(result.performances.every((p) => p.setLabel === "main" && p.artist === AM && !p.isTape)).toBe(true);
    expect(result.noted).toEqual([]);
  });

  it.each([["Love/Hate"], ["Me+You"], ["Rearviewmirror /"]])(
    "AC-2: '%s' (no space on both sides) is one normal Performance with no medley marker",
    (name) => {
      const result = toPerformances(singleSongSetlist({ name }));

      expect(result.performances).toEqual([performance(AM, 1, name, "main", false)]);
      expect(medleyOf(result.performances[0]!)).toBeUndefined();
      expect(result.noted).toEqual([]);
    },
  );

  it.each([
    ["TNT/Highway to Hell", "Medley"],
    ["Hysteria", "MEDLEY"],
  ])("AC-6: '%s' with info '%s' is one Performance, not split, whose medley name is its title", (name, info) => {
    const result = toPerformances(singleSongSetlist({ name, info }));

    expect(result.performances).toEqual([performance(AM, 1, name, "main", false, undefined, name)]);
    expect(result.noted).toEqual([]);
  });

  it("AC-4: a Cover medley with an empty cover name gives no Original Artist on any part", () => {
    const result = toPerformances(
      singleSongSetlist({ name: "Creep / Karma Police", cover: { mbid: "", name: "" } }),
    );

    expect(result.performances).toEqual([
      performance(AM, 1, "Creep", "main", false, undefined, "Creep / Karma Police"),
      performance(AM, 2, "Karma Police", "main", false, undefined, "Creep / Karma Police"),
    ]);
    for (const p of result.performances) expect(p.originalArtist).toBeUndefined();
  });

  it("AC-4: a medley with a guest ('with') gives the same parts as without the guest", () => {
    const withGuest = toPerformances(
      singleSongSetlist({ name: "Creep / Karma Police", with: { name: "Thom Yorke" } }),
    );
    const without = toPerformances(singleSongSetlist({ name: "Creep / Karma Police" }));

    expect(withGuest.performances).toEqual(without.performances);
    expect(withGuest.performances.map((p) => p.title)).toEqual(["Creep", "Karma Police"]);
    expect(JSON.stringify(withGuest)).not.toContain("Thom Yorke");
  });

  it("AC-7: a teaser with ' / ' is noted as a snippet (played after 0) and not split", () => {
    const result = toPerformances(singleSongSetlist({ name: "Even Flow / Alive", info: "Teaser" }));

    expect(result.performances).toEqual([]);
    expect(result.noted).toEqual([
      { rawName: "Even Flow / Alive", reason: "snippet", setLabel: "main", afterPosition: 0 },
    ]);
  });

  it("AC-7: a Tape whose info says both 'medley' and 'snippet' is noted as a snippet; no Performance, empty Tape list", () => {
    const result = toPerformances(
      singleSongSetlist({ name: "Intro / Release", tape: true, info: "medley, snippet" }),
    );

    expect(result.performances).toEqual([]);
    expect(listTapes(result.performances)).toEqual([]);
    expect(result.noted).toEqual([
      { rawName: "Intro / Release", reason: "snippet", setLabel: "main", afterPosition: 0 },
    ]);
  });

  it("AC-8: the same medley played twice, and a part equal to a song played on its own, are all separate Performances", () => {
    const base = loadSetlist("fixture-a-full-show.json") as unknown as Record<string, unknown>;
    const setlist = {
      ...base,
      sets: {
        set: [
          { song: [{ name: "505" }, { name: "Do I Wanna Know? / 505" }] },
          { encore: 1, song: [{ name: "Do I Wanna Know? / 505" }] },
        ],
      },
    } as unknown as SetlistFmSetlist;

    const result = toPerformances(setlist);

    expect(titleAndMedley(result)).toEqual([
      ["505", undefined],
      ["Do I Wanna Know?", "Do I Wanna Know? / 505"],
      ["505", "Do I Wanna Know? / 505"],
      ["Do I Wanna Know?", "Do I Wanna Know? / 505"],
      ["505", "Do I Wanna Know? / 505"],
    ]);
    expect(positions(result)).toEqual([1, 2, 3, 4, 5]);
    expect(result.performances.map((p) => p.setLabel)).toEqual(["main", "main", "main", "Encore 1", "Encore 1"]);
  });

  it("AC-6 (PRD 0010), PRD 0008 AC-9: a snippet after a '+' song and a medley counts each as one Performance in its 'played after' position; 'medley' is never a reason", () => {
    const base = loadSetlist("fixture-a-full-show.json") as unknown as Record<string, unknown>;
    const setlist = {
      ...base,
      sets: {
        set: [
          {
            song: [
              { name: "Dead Star + In Your World" },
              { name: "Hysteria", info: "medley" },
              { name: "Hey Jude", info: "snippet" },
            ],
          },
        ],
      },
    } as unknown as SetlistFmSetlist;

    const result = toPerformances(setlist);

    expect(result.noted).toEqual([{ rawName: "Hey Jude", reason: "snippet", setLabel: "main", afterPosition: 2 }]);
    expect(result.noted.some((n) => (n.reason as string) === "medley")).toBe(false);
  });
});
