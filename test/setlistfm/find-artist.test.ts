import { describe, expect, it } from "vitest";
import {
  ArtistChoiceCancelledError,
  ArtistNotFoundError,
  artistNamesMatch,
  type ArtistCandidate,
} from "../../src/core/setlistfm";
import {
  ARCTIC_MONKEYS,
  ARCTIC_MONKEYS_MBID,
  GENESIS_OWUSU_MBID,
  GENESIS_UK_MBID,
  GENESIS_US_MBID,
  captureError,
  errorText,
  loadFixture,
  makeChooser,
  makeClient,
  makeFakes,
  notFound,
  ok,
} from "./helpers";

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

describe("Artist name normalisation", () => {
  const cases: Array<[string, string, boolean]> = [
    ["arctic monkeys", "Arctic Monkeys", true],
    ["  Arctic   Monkeys ", "Arctic Monkeys", true],
    ["beyonce", "Beyoncé", true],
    ["motorhead", "Motörhead", true],
    ["Simon and Garfunkel", "Simon & Garfunkel", true],
    ["Simon&Garfunkel", "Simon & Garfunkel", true],
    ["sigur ros", "Sigur Rós", true],
    ["Arctic\tMonkeys", "Arctic Monkeys", true],
    ["Arctic Monkey", "Arctic Monkeys", false],
    ["Beatles", "The Beatles", false],
    ["AC DC", "AC/DC", false],
    ["Guns N Roses", "Guns N' Roses", false],
    ["Panic at the Disco", "Panic! at the Disco", false],
    ["Mr Big", "Mr. Big", false],
  ];

  for (const [typed, setlistFmName, expected] of cases) {
    it(`AC-12: "${typed}" vs "${setlistFmName}" is ${expected ? "" : "not "}an exact match`, () => {
      expect(artistNamesMatch(typed, setlistFmName)).toBe(expected);
      expect(artistNamesMatch(setlistFmName, typed)).toBe(expected);
    });
  }

  it("AC-12: the Artist lookup auto-chooses an accent-folded exact match (beyonce → Beyoncé)", async () => {
    const fakes = makeFakes([
      ok(
        searchResponse([
          { name: "Beyoncé", mbid: "859d0860-d480-4efd-970c-c05d5f1776b8", disambiguation: "American singer" },
          { name: "Beyoncé Tribute Band" },
        ]),
      ),
    ]);
    const { chooser } = makeChooser(1);
    const artist = await makeClient(fakes).findArtist("beyonce", chooser);
    expect(artist).toEqual({
      name: "Beyoncé",
      mbid: "859d0860-d480-4efd-970c-c05d5f1776b8",
      disambiguation: "American singer",
    });
    expect(chooser).not.toHaveBeenCalled();
  });
});

describe("Artist search request", () => {
  it("AC-13: sends exactly one GET /search/artists with artistName, sort=relevance and p=1", async () => {
    const fakes = makeFakes([ok(searchResponse([{ name: "Simon & Garfunkel" }]))]);
    const { chooser } = makeChooser(0);
    await makeClient(fakes).findArtist("Simon & Garfunkel", chooser);
    expect(fakes.requests).toHaveLength(1);
    const { parsed, method } = fakes.requests[0]!;
    expect(method).toBe("GET");
    expect(parsed.origin + parsed.pathname).toBe("https://api.setlist.fm/rest/1.0/search/artists");
    expect(parsed.searchParams.get("artistName")).toBe("Simon & Garfunkel");
    expect(parsed.searchParams.get("sort")).toBe("relevance");
    expect(parsed.searchParams.get("p")).toBe("1");
    expect([...parsed.searchParams.keys()].sort()).toEqual(["artistName", "p", "sort"]);
  });

  it("AC-13: the typed name is trimmed before it is sent", async () => {
    const fakes = makeFakes([ok(loadFixture("search-arctic-monkeys.json"))]);
    const { chooser } = makeChooser(0);
    await makeClient(fakes).findArtist("   Arctic Monkeys  ", chooser);
    expect(fakes.requests[0]!.parsed.searchParams.get("artistName")).toBe("Arctic Monkeys");
  });

  it("AC-13: only the first page of search results is used (no p=2 request)", async () => {
    const fakes = makeFakes([ok({ ...loadFixture<Record<string, unknown>>("search-bon.json"), itemsPerPage: 10, total: 42 })]);
    const { chooser } = makeChooser(0);
    await makeClient(fakes).findArtist("Bon", chooser);
    expect(fakes.requests).toHaveLength(1);
  });
});

describe("choosing the Artist", () => {
  it("AC-14: exactly one exact match is chosen without asking, even with similar names", async () => {
    const fakes = makeFakes([ok(loadFixture("search-arctic-monkeys.json"))]);
    const { chooser } = makeChooser(1);
    const artist = await makeClient(fakes).findArtist("Arctic Monkeys", chooser);
    expect(artist).toEqual(ARCTIC_MONKEYS);
    expect(artist.mbid).toBe(ARCTIC_MONKEYS_MBID);
    expect(artist.disambiguation).toBeUndefined();
    expect(chooser).not.toHaveBeenCalled();
    expect(fakes.requests).toHaveLength(1);
  });

  it("AC-14: the single exact match is chosen even when it is not the first result", async () => {
    const fakes = makeFakes([
      ok(
        searchResponse([
          { name: "Simon & Garfunkel Tribute" },
          { name: "Simon & Garfunkel", mbid: "5d02f264-e225-41ff-83f7-d9b1f0b1874a" },
          { name: "Simon Garfunkel Story" },
        ]),
      ),
    ]);
    const { chooser } = makeChooser(0);
    const artist = await makeClient(fakes).findArtist("simon and garfunkel", chooser);
    expect(artist).toEqual({ name: "Simon & Garfunkel", mbid: "5d02f264-e225-41ff-83f7-d9b1f0b1874a" });
    expect(chooser).not.toHaveBeenCalled();
  });

  it("AC-15: HTTP 404 from the search raises an Artist-not-found error naming the typed name, chooser not called", async () => {
    const fakes = makeFakes([notFound]);
    const { chooser } = makeChooser(0);
    const err = await captureError(makeClient(fakes).findArtist("Xyzzq Nonexistent", chooser));
    expect(err).toBeInstanceOf(ArtistNotFoundError);
    expect(errorText(err)).toContain("Xyzzq Nonexistent");
    expect(chooser).not.toHaveBeenCalled();
    expect(fakes.requests).toHaveLength(1);
  });

  it("AC-15: HTTP 200 with an empty artist list raises an Artist-not-found error", async () => {
    const fakes = makeFakes([ok({ type: "artists", itemsPerPage: 30, page: 1, total: 0, artist: [] })]);
    const { chooser } = makeChooser(0);
    const err = await captureError(makeClient(fakes).findArtist("Xyzzq Nonexistent", chooser));
    expect(err).toBeInstanceOf(ArtistNotFoundError);
    expect(errorText(err)).toContain("Xyzzq Nonexistent");
    expect(chooser).not.toHaveBeenCalled();
  });

  it("AC-15: HTTP 200 with no artist list at all raises an Artist-not-found error", async () => {
    const fakes = makeFakes([ok({ type: "artists", itemsPerPage: 30, page: 1, total: 0 })]);
    const { chooser } = makeChooser(0);
    const err = await captureError(makeClient(fakes).findArtist("Xyzzq Nonexistent", chooser));
    expect(err).toBeInstanceOf(ArtistNotFoundError);
    expect(chooser).not.toHaveBeenCalled();
  });

  for (const [label, typed] of [
    ["whitespace-only", "   "],
    ["empty", ""],
  ] as const) {
    it(`AC-15: an ${label} Artist name raises an Artist-not-found error with no request`, async () => {
      const fakes = makeFakes([ok(loadFixture("search-arctic-monkeys.json"))]);
      const { chooser } = makeChooser(0);
      const err = await captureError(makeClient(fakes).findArtist(typed, chooser));
      expect(err).toBeInstanceOf(ArtistNotFoundError);
      expect(fakes.fetch).not.toHaveBeenCalled();
      expect(chooser).not.toHaveBeenCalled();
    });
  }

  it("AC-16: two exact matches (Genesis) → the chooser is called once with all 3 candidates in setlist.fm order", async () => {
    const fakes = makeFakes([ok(loadFixture("search-genesis.json"))]);
    const { chooser, calls } = makeChooser(0);
    const artist = await makeClient(fakes).findArtist("Genesis", chooser);
    expect(chooser).toHaveBeenCalledTimes(1);
    expect(calls[0]).toEqual([
      { name: "Genesis", mbid: GENESIS_UK_MBID, disambiguation: "English rock band" },
      { name: "Genesis", mbid: GENESIS_US_MBID, disambiguation: "US psychedelic rock band" },
      { name: "Genesis Owusu", mbid: GENESIS_OWUSU_MBID },
    ]);
    expect(calls[0]![2]!.disambiguation).toBeUndefined();
    expect(artist).toEqual({ name: "Genesis", mbid: GENESIS_UK_MBID, disambiguation: "English rock band" });
  });

  it("AC-16: the Artist the chooser picks is used (second Genesis)", async () => {
    const fakes = makeFakes([ok(loadFixture("search-genesis.json"))]);
    const { chooser } = makeChooser(1);
    const artist = await makeClient(fakes).findArtist("Genesis", chooser);
    expect(artist).toEqual({ name: "Genesis", mbid: GENESIS_US_MBID, disambiguation: "US psychedelic rock band" });
  });

  it("AC-16: no exact match among 14 results (Bon) → the chooser gets the first 10, in order", async () => {
    const bon = loadFixture("search-bon.json");
    const fakes = makeFakes([ok(bon)]);
    const { chooser, calls } = makeChooser(9);
    const artist = await makeClient(fakes).findArtist("Bon", chooser);
    expect(chooser).toHaveBeenCalledTimes(1);
    const candidates = calls[0]!;
    expect(candidates).toHaveLength(10);
    expect(candidates.map((c: ArtistCandidate) => c.mbid)).toEqual(
      bon.artist.slice(0, 10).map((a: { mbid: string }) => a.mbid),
    );
    expect(candidates.map((c: ArtistCandidate) => c.name)).toEqual(
      bon.artist.slice(0, 10).map((a: { name: string }) => a.name),
    );
    // empty or missing disambiguation is absent; a given one is kept
    expect(candidates[0]!.disambiguation).toBeUndefined();
    expect(candidates[1]!.disambiguation).toBeUndefined();
    expect(candidates[2]!.disambiguation).toBe("French electronic collective");
    expect(artist).toEqual({ name: "Bon Garçon", mbid: bon.artist[9].mbid, disambiguation: "Belgian band" });
  });

  it("AC-16: a near-miss name (Arctic Monkey) is not auto-chosen; the chooser is asked", async () => {
    const fakes = makeFakes([ok(loadFixture("search-arctic-monkeys.json"))]);
    const { chooser, calls } = makeChooser(0);
    const artist = await makeClient(fakes).findArtist("Arctic Monkey", chooser);
    expect(chooser).toHaveBeenCalledTimes(1);
    expect(calls[0]).toHaveLength(3);
    expect(calls[0]![0]).toEqual(ARCTIC_MONKEYS);
    expect(artist).toEqual(ARCTIC_MONKEYS);
  });

  it("AC-16: a single result that is not an exact match still goes to the chooser", async () => {
    const fakes = makeFakes([ok(searchResponse([{ name: "The Beatles", mbid: "b10bbbfc-cf9e-42e0-be17-e2c3e1d2600d" }]))]);
    const { chooser, calls } = makeChooser(0);
    await makeClient(fakes).findArtist("Beatles", chooser);
    expect(chooser).toHaveBeenCalledTimes(1);
    expect(calls[0]).toEqual([{ name: "The Beatles", mbid: "b10bbbfc-cf9e-42e0-be17-e2c3e1d2600d" }]);
  });

  it("AC-17: when the chooser cancels, a cancelled error is raised and no further request is made", async () => {
    const fakes = makeFakes([ok(loadFixture("search-genesis.json"))]);
    const { chooser } = makeChooser(null);
    const err = await captureError(makeClient(fakes).findArtist("Genesis", chooser));
    expect(err).toBeInstanceOf(ArtistChoiceCancelledError);
    expect(fakes.requests).toHaveLength(1);
  });

  it("AC-17: when the chooser cancels in the single entry point, no /artist/…/setlists request is made", async () => {
    const fakes = makeFakes([ok(loadFixture("search-genesis.json")), ok(loadFixture("setlists-arctic-monkeys-p1.json"))]);
    const { chooser } = makeChooser(null);
    const err = await captureError(makeClient(fakes).findLatestSetlistByArtistName("Genesis", chooser));
    expect(err).toBeInstanceOf(ArtistChoiceCancelledError);
    expect(fakes.requests).toHaveLength(1);
    expect(fakes.requests[0]!.parsed.pathname).toBe("/rest/1.0/search/artists");
  });
});
