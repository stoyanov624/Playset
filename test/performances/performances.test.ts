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
  type Show,
} from "../../src/core/performances";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "performances");

/** Loads a fresh copy of a recorded setlist.fm "get setlist" response. */
function loadSetlist(file: string): SetlistFmSetlist {
  return JSON.parse(readFileSync(join(fixturesDir, file), "utf8")) as SetlistFmSetlist;
}

const ARTIST = "Arctic Monkeys";

const fixtureAShow: Show = {
  artist: "Arctic Monkeys",
  date: "2025-08-23",
  city: "Amsterdam",
  venue: "Ziggo Dome",
  url: "https://www.setlist.fm/setlist/arctic-monkeys/2025/ziggo-dome-amsterdam-netherlands-63a5e2b7.html",
};

function performance(
  position: number,
  title: string,
  setLabel: string,
  isTape: boolean,
  originalArtist?: string,
  medley?: string,
): Performance {
  const p: Record<string, unknown> = { position, title, artist: ARTIST, setLabel, isTape };
  if (originalArtist !== undefined) p.originalArtist = originalArtist;
  if (medley !== undefined) p.medley = medley;
  return p as unknown as Performance;
}

// Fixture A's expected Performances and noted songs follow PRD 0008 "Fixture A revisited":
// "Teddy Picker / Crying Lightning" is split into two Performances and the info-only medley
// "Cornerstone" is one Performance; both carry a medley name and are no longer noted.
const fixtureAPerformances: Performance[] = [
  performance(1, "I Want It All", "main", true, "Queen"),
  performance(2, "Sculptures of Anything Goes", "main", false),
  performance(3, "Brianstorm", "main", false),
  performance(4, "Don't Sit Down 'Cause I've Moved Your Chair", "main", false),
  performance(5, "505", "main", false),
  performance(6, "Mardy Bum", "Acoustic", false),
  performance(7, "Teddy Picker", "Acoustic", false, undefined, "Teddy Picker / Crying Lightning"),
  performance(8, "Crying Lightning", "Acoustic", false, undefined, "Teddy Picker / Crying Lightning"),
  performance(9, "Cornerstone", "Acoustic", false, undefined, "Cornerstone"),
  performance(10, "I Wanna Be Yours", "Encore 1", false),
  performance(11, "505", "Encore 1", false),
  performance(12, "Baby, I'm Yours", "Encore 1", false, "Barbara Lewis"),
  performance(13, "R U Mine?", "Encore 2", false),
  performance(14, "Mr. Blue Sky", "Encore 2", true, "Electric Light Orchestra"),
];

const fixtureANoted: NotedSong[] = [
  { rawName: "Hey Jude", reason: "snippet", setLabel: "main", afterPosition: 3 },
];

function titles(result: PerformancesResult): string[] {
  return result.performances.map((p) => p.title);
}

describe("toPerformances — Fixture A (full Show)", () => {
  it("AC-1: lists every Performance in played order across Sets, Encores included, positions 1..n with no gaps", () => {
    const result = toPerformances(loadSetlist("fixture-a-full-show.json"));

    expect(titles(result)).toEqual(fixtureAPerformances.map((p) => p.title));
    expect(result.performances.map((p) => p.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
  });

  it("AC-1: produces exactly the expected Performances for Fixture A", () => {
    const result = toPerformances(loadSetlist("fixture-a-full-show.json"));

    expect(result.performances).toEqual(fixtureAPerformances);
  });

  it("AC-2: labels each Performance with its Set: 'main', the Set's name, or 'Encore n'", () => {
    const result = toPerformances(loadSetlist("fixture-a-full-show.json"));

    expect(result.performances.map((p) => p.setLabel)).toEqual([
      "main", "main", "main", "main", "main",
      "Acoustic", "Acoustic", "Acoustic", "Acoustic",
      "Encore 1", "Encore 1", "Encore 1",
      "Encore 2", "Encore 2",
    ]);
  });

  it("AC-3: a song played twice becomes two Performances, each at its own position", () => {
    const result = toPerformances(loadSetlist("fixture-a-full-show.json"));

    const repeats = result.performances.filter((p) => p.title === "505");
    expect(repeats).toHaveLength(2);
    expect(repeats.map((p) => [p.position, p.setLabel])).toEqual([
      [5, "main"],
      [11, "Encore 1"],
    ]);
  });

  it("AC-4: songs marked as tape are Performances flagged as Tape; all others are not", () => {
    const result = toPerformances(loadSetlist("fixture-a-full-show.json"));

    const tapeFlags = result.performances.map((p) => [p.title, p.isTape]);
    expect(tapeFlags).toEqual([
      ["I Want It All", true],
      ["Sculptures of Anything Goes", false],
      ["Brianstorm", false],
      ["Don't Sit Down 'Cause I've Moved Your Chair", false],
      ["505", false],
      ["Mardy Bum", false],
      ["Teddy Picker", false],
      ["Crying Lightning", false],
      ["Cornerstone", false],
      ["I Wanna Be Yours", false],
      ["505", false],
      ["Baby, I'm Yours", false],
      ["R U Mine?", false],
      ["Mr. Blue Sky", true],
    ]);
  });

  it("AC-5: listing Tapes gives the Tape titles in played order", () => {
    const result = toPerformances(loadSetlist("fixture-a-full-show.json"));

    expect(listTapes(result.performances)).toEqual(["I Want It All", "Mr. Blue Sky"]);
  });

  it("AC-6: a Cover carries its Original Artist; every Performance's Artist is the Setlist's Artist", () => {
    const result = toPerformances(loadSetlist("fixture-a-full-show.json"));

    for (const p of result.performances) expect(p.artist).toBe(ARTIST);
    const byPosition = new Map(result.performances.map((p) => [p.position, p]));
    expect(byPosition.get(1)?.originalArtist).toBe("Queen");
    expect(byPosition.get(12)?.originalArtist).toBe("Barbara Lewis");
    expect(byPosition.get(14)?.originalArtist).toBe("Electric Light Orchestra");
    for (const position of [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13]) {
      expect(byPosition.get(position)?.originalArtist).toBeUndefined();
    }
  });

  it("AC-7: a guest ('with') is ignored — the Performance looks like the same song without a guest", () => {
    const result = toPerformances(loadSetlist("fixture-a-full-show.json"));

    const withGuest = result.performances[3];
    expect(withGuest).toEqual(
      performance(4, "Don't Sit Down 'Cause I've Moved Your Chair", "main", false),
    );
    expect(JSON.stringify(result)).not.toContain("Miles Kane");
  });

  it("AC-8: a whitespace-only song name produces nothing and uses no position; titles are trimmed", () => {
    const result = toPerformances(loadSetlist("fixture-a-full-show.json"));

    expect(result.performances[2]?.title).toBe("Brianstorm");
    expect(result.performances.map((p) => [p.position, p.title]).slice(8, 10)).toEqual([
      [9, "Cornerstone"],
      [10, "I Wanna Be Yours"],
    ]);
    expect(result.noted.map((n) => n.rawName)).not.toContain("   ");
    expect(result.noted.some((n) => n.rawName.trim() === "")).toBe(false);
  });

  it("AC-9: a song whose info is 'snippet' is noted as a snippet, not a Performance", () => {
    const result = toPerformances(loadSetlist("fixture-a-full-show.json"));

    expect(titles(result)).not.toContain("Hey Jude");
    expect(result.noted).toContainEqual({
      rawName: "Hey Jude",
      reason: "snippet",
      setLabel: "main",
      afterPosition: 3,
    });
  });

  // PRD 0002 AC-10 (medleys are noted, not split) is superseded in full by PRD 0008
  // AC-1, AC-2, AC-3, AC-6 and AC-7; see test/performances/medley-split.test.ts.

  it("AC-11: noted songs record raw name, reason, Set label and the position they were played after, in played order", () => {
    const result = toPerformances(loadSetlist("fixture-a-full-show.json"));

    expect(result.noted).toEqual(fixtureANoted);
  });

  it("AC-12: includes Show details with the date converted to YYYY-MM-DD", () => {
    const result = toPerformances(loadSetlist("fixture-a-full-show.json"));

    expect(result.show).toEqual(fixtureAShow);
  });

  it("AC-14: turning the same Setlist into Performances twice gives equal results and leaves the input unchanged", () => {
    const setlist = loadSetlist("fixture-a-full-show.json");
    const pristine = loadSetlist("fixture-a-full-show.json");

    const first = toPerformances(setlist);
    const second = toPerformances(setlist);

    expect(second).toEqual(first);
    expect(setlist).toEqual(pristine);
  });

  it("AC-14: works on a deeply frozen Setlist (does not mutate its input)", () => {
    const setlist = deepFreeze(loadSetlist("fixture-a-full-show.json"));

    expect(() => toPerformances(setlist)).not.toThrow();
    expect(toPerformances(setlist).performances).toEqual(fixtureAPerformances);
  });

  it("AC-14: results from separate calls do not share mutable state", () => {
    const setlist = loadSetlist("fixture-a-full-show.json");
    const first = toPerformances(setlist);
    first.performances.pop();
    first.noted.pop();

    const second = toPerformances(setlist);
    expect(second.performances).toEqual(fixtureAPerformances);
    expect(second.noted).toEqual(fixtureANoted);
  });
});

describe("toPerformances — Fixture B (Encore with a name)", () => {
  it("AC-2: the encore number wins over the Set name", () => {
    const result = toPerformances(loadSetlist("fixture-b-named-encore.json"));

    expect(result.performances).toEqual([performance(1, "Black", "Encore 1", false)]);
  });
});

describe("toPerformances — Fixture C (snippet wording and teases)", () => {
  it("AC-9: 'snippet' anywhere or 'tease' at the start (any case, leading whitespace ignored) is a snippet; 'tease' elsewhere is a full song", () => {
    const result = toPerformances(loadSetlist("fixture-c-snippets-and-teases.json"));

    expect(result.performances).toEqual([
      performance(1, "Alive", "main", false),
      performance(2, "Black", "main", false),
      performance(3, "Jeremy", "main", false),
    ]);
  });

  it("AC-9: snippets and teased songs are noted with reason 'snippet'", () => {
    const result = toPerformances(loadSetlist("fixture-c-snippets-and-teases.json"));

    expect(result.noted).toEqual([
      { rawName: "Smells Like Teen Spirit", reason: "snippet", setLabel: "main", afterPosition: 0 },
      { rawName: "Seven Nation Army", reason: "snippet", setLabel: "main", afterPosition: 0 },
      { rawName: "Wonderwall", reason: "snippet", setLabel: "main", afterPosition: 0 },
      { rawName: "Porch", reason: "snippet", setLabel: "main", afterPosition: 3 },
    ]);
  });

  it("AC-11: a noted song before the first Performance is recorded as played after position 0", () => {
    const result = toPerformances(loadSetlist("fixture-c-snippets-and-teases.json"));

    expect(result.noted[0]?.afterPosition).toBe(0);
  });
});

// Fixture D's expected result follows PRD 0008 "Fixture D revisited". PRD 0002 AC-10 is
// superseded (see medley-split.test.ts) and AC-11 is amended: "snippet" is the only reason.
describe("toPerformances — Fixture D (medleys and snippet precedence)", () => {
  it("AC-11: a snippet with a ' / ' name is noted once, as 'snippet', with its raw name; medleys are not noted", () => {
    const result = toPerformances(loadSetlist("fixture-d-medleys.json"));

    expect(result.noted).toEqual([
      { rawName: "Kashmir / Whole Lotta Love", reason: "snippet", setLabel: "main", afterPosition: 2 },
    ]);
  });

  it("AC-5: a split Tape medley gives Tape parts, so the Tape list holds each part's title", () => {
    const result = toPerformances(loadSetlist("fixture-d-medleys.json"));

    expect(listTapes(result.performances)).toEqual(["Intro", "Release"]);
  });
});

describe("toPerformances — Fixture E (unusable cover names and missing song names)", () => {
  it("AC-6: a cover with an empty or missing name gives no Original Artist", () => {
    const result = toPerformances(loadSetlist("fixture-e-covers-and-missing-names.json"));

    expect(result.performances[0]?.title).toBe("Creep");
    expect(result.performances[0]?.originalArtist).toBeUndefined();
    expect(result.performances[1]?.title).toBe("Karma Police");
    expect(result.performances[1]?.originalArtist).toBeUndefined();
    for (const p of result.performances) expect(p.artist).toBe(ARTIST);
  });

  it("AC-8: missing or empty song names produce nothing and use no position", () => {
    const result = toPerformances(loadSetlist("fixture-e-covers-and-missing-names.json"));

    expect(result.performances).toEqual([
      performance(1, "Creep", "main", false),
      performance(2, "Karma Police", "main", false),
      performance(3, "No Surprises", "main", false),
    ]);
    expect(result.noted).toEqual([]);
  });
});

describe("listTapes — Fixture F (repeated Tape)", () => {
  it("AC-5: a Tape played twice is listed twice", () => {
    const result = toPerformances(loadSetlist("fixture-f-repeated-tape.json"));

    expect(listTapes(result.performances)).toEqual(["Baba O'Riley", "Baba O'Riley"]);
  });

  it("AC-5: a Setlist with no Tapes gives an empty Tape list", () => {
    const result = toPerformances(loadSetlist("fixture-e-covers-and-missing-names.json"));

    expect(listTapes(result.performances)).toEqual([]);
  });
});

describe("toPerformances — Fixture G (no songs)", () => {
  it.each([
    ["an empty list of Sets", "fixture-g1-empty-set-list.json"],
    ["no Sets", "fixture-g2-no-set-key.json"],
    ["Sets with no songs", "fixture-g3-sets-without-songs.json"],
  ])("AC-13: a Setlist with %s gives empty Performances, noted songs and Tape list, with Show details", (_label, file) => {
    let result: PerformancesResult | undefined;
    expect(() => {
      result = toPerformances(loadSetlist(file));
    }).not.toThrow();

    expect(result?.performances).toEqual([]);
    expect(result?.noted).toEqual([]);
    expect(listTapes(result?.performances ?? [])).toEqual([]);
    expect(result?.show).toEqual(fixtureAShow);
  });
});

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
