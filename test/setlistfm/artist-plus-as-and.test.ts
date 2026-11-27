import { describe, expect, it } from "vitest";
import { artistNamesMatch } from "../../src/core/setlistfm";
import { makeChooser, makeClient, makeFakes, ok } from "./helpers";

const FLORENCE_MBID = "5fee3020-513b-48c2-b1f7-4681b01db0c6";

/** A one-page Artist search response with the given names (mbids derived from the index). */
function searchResponse(artists: Array<{ name: string; mbid?: string; disambiguation?: string }>) {
  return {
    type: "artists",
    itemsPerPage: 30,
    page: 1,
    total: artists.length,
    artist: artists.map((a, i) => ({
      mbid: a.mbid ?? `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      name: a.name,
      sortName: a.name,
      ...(a.disambiguation === undefined ? {} : { disambiguation: a.disambiguation }),
      url: `https://www.setlist.fm/setlists/artist-${i}.html`,
    })),
  };
}

describe('Artist name normalisation: "+" counts as "&" and "and"', () => {
  const cases: Array<[string, string, boolean]> = [
    ["Florence and the Machine", "Florence + the Machine", true],
    ["Florence & the Machine", "Florence + the Machine", true],
    ["florence and the machine", "Florence + the Machine", true],
    ["Florence+the Machine", "Florence + the Machine", true],
    ["Florence+the Machine", "Florence and the Machine", true],
    ["Florence+the Machine", "Florence & the Machine", true],
    ["Florence +the Machine", "Florence & the Machine", true],
    ["  Florence   +   the  Machine ", "Florence and the Machine", true],
    ["C and C Music Factory", "C+C Music Factory", true],
    // "+" becomes "and"; it is not dropped
    ["Florence the Machine", "Florence + the Machine", false],
    ["Florence Machine", "Florence + the Machine", false],
    // everything else in AC-12 is unchanged
    ["Panic at the Disco", "Panic! at the Disco", false],
    ["Beatles", "The Beatles", false],
    ["The Beatles", "The Beatles", true],
    ["Mr Big", "Mr. Big", false],
    ["Guns N Roses", "Guns N' Roses", false],
    ["AC DC", "AC/DC", false],
    ["Simon and Garfunkel", "Simon & Garfunkel", true],
  ];

  for (const [typed, setlistFmName, expected] of cases) {
    it(`AC-12: "${typed}" vs "${setlistFmName}" is ${expected ? "" : "not "}an exact match (both directions)`, () => {
      expect(artistNamesMatch(typed, setlistFmName)).toBe(expected);
      expect(artistNamesMatch(setlistFmName, typed)).toBe(expected);
    });
  }
});

describe('choosing the Artist when the name has "+"', () => {
  for (const typed of ["Florence and the Machine", "Florence & the Machine", "Florence+the Machine"]) {
    it(`AC-14: typing "${typed}" auto-chooses the single "Florence + the Machine" result without asking`, async () => {
      const fakes = makeFakes([
        ok(
          searchResponse([
            { name: "Florence Machine Tribute" },
            { name: "Florence + the Machine", mbid: FLORENCE_MBID },
            { name: "Florence" },
          ]),
        ),
      ]);
      const { chooser } = makeChooser(0);
      const artist = await makeClient(fakes).findArtist(typed, chooser);
      expect(artist).toEqual({ name: "Florence + the Machine", mbid: FLORENCE_MBID });
      expect(chooser).not.toHaveBeenCalled();
      expect(fakes.requests).toHaveLength(1);
    });
  }

  it("AC-14: a name that differs by punctuation other than &/+ still asks the chooser (Panic at the Disco)", async () => {
    const fakes = makeFakes([ok(searchResponse([{ name: "Panic! at the Disco" }, { name: "Panic at the Discotheque" }]))]);
    const { chooser } = makeChooser(0);
    const artist = await makeClient(fakes).findArtist("Panic at the Disco", chooser);
    expect(chooser).toHaveBeenCalledTimes(1);
    expect(artist.name).toBe("Panic! at the Disco");
  });
});
