// The setlist.fm steps of the run, driven through the real setlist.fm client with a scripted fake
// fetch (no network): find Artists (AC-1 to AC-3), get a Setlist (AC-9) and find the Latest Setlist
// (AC-10). The client the core builds is passed as the steps' services.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findArtists, findLatestSetlist, getSetlist } from "../../src/core/run/index.js";
import {
  ArtistNotFoundError,
  MissingSetlistFmApiKeyError,
  SetlistFmRateLimitError,
  SetlistFmRequestError,
  SetlistNotFoundError,
} from "../../src/core/setlistfm";
import {
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
  makeTempRoot,
  networkFailure,
  notFound,
  ok,
  paths,
  removeTempRoot,
  serviceUnavailable,
  tooManyRequests,
  type Fakes,
} from "./helpers";

const PEARL_JAM_MBID = "83b9cbe7-9857-49e2-ab8e-b57b01038103";
const SEARCH_PATH = "/rest/1.0/search/artists";

/** The real setlist.fm client, used as the services of a step (it supplies the setlist.fm services). */
const servicesFrom = (fakes: Fakes, opts: Parameters<typeof makeClient>[1] = {}) => makeClient(fakes, opts);

const sharedFixtures = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "performances");
const nirvanaJson = () => JSON.parse(readFileSync(join(sharedFixtures, "nirvana-53d60349-unknown-song.json"), "utf8"));

const ARCTIC_MONKEYS_CANDIDATES = [
  { name: "Arctic Monkeys", mbid: ARCTIC_MONKEYS_MBID },
  { name: "Arctic Monkeys Tribute", mbid: "5b0c1a4e-2f0e-4f1a-9a77-1d2b3c4d5e6f" },
  { name: "The Arctic Monkeys Experience", mbid: "7c1e2d3f-4a5b-4c6d-8e9f-0a1b2c3d4e5f" },
];

const GENESIS_CANDIDATES = [
  { name: "Genesis", mbid: GENESIS_UK_MBID, disambiguation: "English rock band" },
  { name: "Genesis", mbid: GENESIS_US_MBID, disambiguation: "US psychedelic rock band" },
  { name: "Genesis Owusu", mbid: GENESIS_OWUSU_MBID },
];

const SIMON_MBID = "5d02f264-e225-41ff-83f7-d9b1f0b1874a";
const FLORENCE_MBID = "5fee3020-513b-48c2-b1f7-4681b01db0c6";

/** A one-page Artist search response with the given Artists, shaped like setlist.fm's. */
function searchResponse(artists: Array<{ name: string; mbid: string; disambiguation?: string }>) {
  return {
    type: "artists",
    itemsPerPage: 30,
    page: 1,
    total: artists.length,
    artist: artists.map((a, i) => ({
      mbid: a.mbid,
      name: a.name,
      sortName: a.name,
      disambiguation: a.disambiguation ?? "",
      url: `https://www.setlist.fm/setlists/artist-${i}.html`,
    })),
  };
}

/** The 14 "Bon" search results, as candidates (an empty disambiguation is absent). */
function bonCandidates() {
  const body = loadFixture<{ artist: Array<{ name: string; mbid: string; disambiguation?: string }> }>("search-bon.json");
  return body.artist.map((a) => ({
    name: a.name,
    mbid: a.mbid,
    ...(a.disambiguation ? { disambiguation: a.disambiguation } : {}),
  }));
}

// ---------------------------------------------------------------- AC-1

describe("findArtists — the Artist search (F1)", () => {
  it("AC-1: sends exactly one GET /search/artists with the trimmed name, sort=relevance and p=1", async () => {
    const fakes = makeFakes([ok(loadFixture("search-arctic-monkeys.json"))]);
    await findArtists(servicesFrom(fakes), "  arctic monkeys  ");
    expect(fakes.requests).toHaveLength(1);
    const { parsed, method } = fakes.requests[0]!;
    expect(method).toBe("GET");
    expect(parsed.origin + parsed.pathname).toBe("https://api.setlist.fm/rest/1.0/search/artists");
    expect(parsed.searchParams.get("artistName")).toBe("arctic monkeys");
    expect(parsed.search).toContain("artistName=arctic%20monkeys");
    expect(parsed.searchParams.get("sort")).toBe("relevance");
    expect(parsed.searchParams.get("p")).toBe("1");
    expect([...parsed.searchParams.keys()].sort()).toEqual(["artistName", "p", "sort"]);
  });

  it("AC-1: lists every search result in setlist.fm's order, with name and mbid; an empty disambiguation is absent", async () => {
    const fakes = makeFakes([ok(loadFixture("search-arctic-monkeys.json"))]);
    const result = await findArtists(servicesFrom(fakes), "Arctic Monkeys");
    expect(result.candidates).toStrictEqual(ARCTIC_MONKEYS_CANDIDATES);
  });

  it("AC-1: a non-empty disambiguation is kept on its candidate (Genesis)", async () => {
    const fakes = makeFakes([ok(loadFixture("search-genesis.json"))]);
    const result = await findArtists(servicesFrom(fakes), "Genesis");
    expect(result.candidates).toStrictEqual(GENESIS_CANDIDATES);
  });

  it("AC-1: with 14 search results only the first 10 are listed, in setlist.fm's order (Bon)", async () => {
    const fakes = makeFakes([ok(loadFixture("search-bon.json"))]);
    const result = await findArtists(servicesFrom(fakes), "Bon");
    expect(result.candidates).toStrictEqual(bonCandidates().slice(0, 10));
    expect(result.candidates.map((c: { name: string }) => c.name)).toEqual([
      "Bon Jovi",
      "Bon Iver",
      "Bon Entendeur",
      "Bon Scott",
      "Bonobo",
      "Bonnie Raitt",
      "Bon Voyage",
      "Bonnie Tyler",
      "Bon Homme",
      "Bon Garçon",
    ]);
    expect(fakes.requests).toHaveLength(1);
  });

  it("AC-1: \"&\" and \"+\" in the typed name are sent percent-encoded, so setlist.fm gets the whole name as one parameter", async () => {
    const simon = makeFakes([ok(searchResponse([{ name: "Simon & Garfunkel", mbid: SIMON_MBID }]))]);
    await findArtists(servicesFrom(simon), "Simon & Garfunkel");
    expect(simon.requests[0]!.parsed.search).toBe("?artistName=Simon%20%26%20Garfunkel&sort=relevance&p=1");
    expect(simon.requests[0]!.parsed.searchParams.get("artistName")).toBe("Simon & Garfunkel");

    const florence = makeFakes([ok(searchResponse([{ name: "Florence + the Machine", mbid: FLORENCE_MBID }]))]);
    await findArtists(servicesFrom(florence), "Florence + the Machine");
    expect(florence.requests[0]!.parsed.search).toBe("?artistName=Florence%20%2B%20the%20Machine&sort=relevance&p=1");
    expect(florence.requests[0]!.parsed.searchParams.get("artistName")).toBe("Florence + the Machine");
  });

  it("AC-1: an Artist name with a lone surrogate is still searched, with the character replaced (U+FFFD), not a crash", async () => {
    const fakes = makeFakes([ok(loadFixture("search-arctic-monkeys.json"))]);
    const result = await findArtists(servicesFrom(fakes), "Bj\uD800rk");
    expect(fakes.requests).toHaveLength(1);
    expect(paths(fakes.requests)).toEqual([SEARCH_PATH]);
    expect(new URL(fakes.requests[0]!.url).searchParams.get("artistName")).toBe("Bj�rk");
    expect(result.candidates).toStrictEqual(ARCTIC_MONKEYS_CANDIDATES);
  });
});

// ---------------------------------------------------------------- AC-2

describe("findArtists — autoPick (F1)", () => {
  it("AC-2: exactly one exact match → autoPick is that candidate (Arctic Monkeys)", async () => {
    const fakes = makeFakes([ok(loadFixture("search-arctic-monkeys.json"))]);
    const result = await findArtists(servicesFrom(fakes), "Arctic Monkeys");
    expect(result.autoPick).toStrictEqual({ name: "Arctic Monkeys", mbid: ARCTIC_MONKEYS_MBID });
    expect(result.autoPick).toEqual(result.candidates[0]);
  });

  it("AC-2: the exact match uses the normalised typed name (\"  arctic monkeys  \")", async () => {
    const fakes = makeFakes([ok(loadFixture("search-arctic-monkeys.json"))]);
    const result = await findArtists(servicesFrom(fakes), "  arctic monkeys  ");
    expect(result.autoPick).toStrictEqual({ name: "Arctic Monkeys", mbid: ARCTIC_MONKEYS_MBID });
    expect(result.candidates).toStrictEqual(ARCTIC_MONKEYS_CANDIDATES);
  });

  it.each([
    { typed: "Simon and Garfunkel", found: "Simon & Garfunkel", mbid: SIMON_MBID },
    { typed: "Florence and the Machine", found: "Florence + the Machine", mbid: FLORENCE_MBID },
    { typed: "Florence & the Machine", found: "Florence + the Machine", mbid: FLORENCE_MBID },
  ])("AC-2: \"$typed\" is an exact match for \"$found\" (\"&\", \"+\" and \"and\" are the same word) → autoPick", async ({ typed, found, mbid }) => {
    const fakes = makeFakes([
      ok(searchResponse([
        { name: found, mbid },
        { name: `${found} Tribute`, mbid: "6c3b9f2e-1a4d-4e8b-9f0a-2b3c4d5e6f70" },
      ])),
    ]);
    const result = await findArtists(servicesFrom(fakes), typed);
    expect(result.autoPick).toStrictEqual({ name: found, mbid });
    expect(result.candidates).toHaveLength(2);
  });

  it("AC-2: two exact matches (Genesis) → no autoPick, same candidate list", async () => {
    const fakes = makeFakes([ok(loadFixture("search-genesis.json"))]);
    const result = await findArtists(servicesFrom(fakes), "Genesis");
    expect(result.autoPick).toBeUndefined();
    expect(result.candidates).toStrictEqual(GENESIS_CANDIDATES);
  });

  it("AC-2: no exact match (Bon) → no autoPick", async () => {
    const fakes = makeFakes([ok(loadFixture("search-bon.json"))]);
    const result = await findArtists(servicesFrom(fakes), "Bon");
    expect(result.autoPick).toBeUndefined();
    expect(result.candidates).toHaveLength(10);
  });

  it("AC-2: the exact-match check looks at the whole first page of results, also past the first 10 (Bon Hiver is result 12)", async () => {
    const fakes = makeFakes([ok(loadFixture("search-bon.json"))]);
    const result = await findArtists(servicesFrom(fakes), "Bon Hiver");
    const bonHiver = bonCandidates().find((c) => c.name === "Bon Hiver");
    expect(bonHiver).toMatchObject({ name: "Bon Hiver" });
    expect(result.autoPick).toStrictEqual(bonHiver);
    expect(result.candidates).toStrictEqual(bonCandidates().slice(0, 10));
  });
});

// ---------------------------------------------------------------- AC-3

describe("findArtists — no results and errors (F1)", () => {
  it("AC-3: HTTP 404 raises the Artist-not-found error naming the typed name", async () => {
    const fakes = makeFakes([notFound]);
    const err = await captureError(findArtists(servicesFrom(fakes), "Xyzzq Nonexistent"));
    expect(err).toBeInstanceOf(ArtistNotFoundError);
    expect(errorText(err)).toContain("Xyzzq Nonexistent");
    expect(fakes.requests).toHaveLength(1);
  });

  it("AC-3: HTTP 200 with an empty artist list raises the same Artist-not-found error", async () => {
    const fakes = makeFakes([ok({ type: "artists", itemsPerPage: 30, page: 1, total: 0, artist: [] })]);
    const err = await captureError(findArtists(servicesFrom(fakes), "Xyzzq Nonexistent"));
    expect(err).toBeInstanceOf(ArtistNotFoundError);
    expect(errorText(err)).toContain("Xyzzq Nonexistent");
  });

  it("AC-3: HTTP 200 with no artist list at all raises the same Artist-not-found error", async () => {
    const fakes = makeFakes([ok({ type: "artists", itemsPerPage: 30, page: 1, total: 0 })]);
    const err = await captureError(findArtists(servicesFrom(fakes), "Xyzzq Nonexistent"));
    expect(err).toBeInstanceOf(ArtistNotFoundError);
    expect(errorText(err)).toContain("Xyzzq Nonexistent");
  });

  for (const name of ["", "   ", "\t \n"]) {
    it(`AC-3: an empty or whitespace-only name (${JSON.stringify(name)}) raises Artist-not-found with no request`, async () => {
      const fakes = makeFakes([ok(loadFixture("search-arctic-monkeys.json"))]);
      const err = await captureError(findArtists(servicesFrom(fakes), name));
      expect(err).toBeInstanceOf(ArtistNotFoundError);
      expect(fakes.fetch).not.toHaveBeenCalled();
    });
  }

  it("AC-3: HTTP 429 four times passes on the setlist.fm rate-limit error after 4 requests", async () => {
    const fakes = makeFakes([tooManyRequests("1"), tooManyRequests("1"), tooManyRequests("1"), tooManyRequests("1")]);
    const err = await captureError(findArtists(servicesFrom(fakes), "Genesis"));
    expect(err).toBeInstanceOf(SetlistFmRateLimitError);
    expect(fakes.requests).toHaveLength(4);
  });

  it("AC-3: a network error is passed on as the setlist.fm request error", async () => {
    const fakes = makeFakes([networkFailure]);
    const err = await captureError(findArtists(servicesFrom(fakes), "Genesis"));
    expect(err).toBeInstanceOf(SetlistFmRequestError);
  });

  it("AC-3: HTTP 503 passes on the setlist.fm request error naming 503, after 1 request", async () => {
    const fakes = makeFakes([serviceUnavailable]);
    const err = await captureError(findArtists(servicesFrom(fakes), "Genesis"));
    expect(err).toBeInstanceOf(SetlistFmRequestError);
    expect((err as SetlistFmRequestError).status).toBe(503);
    expect(fakes.requests).toHaveLength(1);
  });

  describe("without an API key", () => {
    let root: string;
    beforeEach(async () => {
      root = await makeTempRoot();
    });
    afterEach(async () => {
      await removeTempRoot(root);
    });

    it("AC-3: no API key anywhere passes on the missing-API-key error, with no request", async () => {
      const fakes = makeFakes([ok(loadFixture("search-genesis.json"))]);
      const err = await captureError(findArtists(servicesFrom(fakes, { env: {}, configDir: join(root, "playset") }), "Genesis"));
      expect(err).toBeInstanceOf(MissingSetlistFmApiKeyError);
      expect(fakes.fetch).not.toHaveBeenCalled();
    });
  });
});

// ---------------------------------------------------------------- AC-9

describe("getSetlist (G1)", () => {
  it("AC-9: sends GET /setlist/53d60349 and returns the Setlist unchanged (Nirvana U1)", async () => {
    const fakes = makeFakes([ok(nirvanaJson())]);
    const setlist = await getSetlist(servicesFrom(fakes), "53d60349");
    expect(setlist).toEqual(nirvanaJson());
    expect(fakes.requests).toHaveLength(1);
    expect(fakes.requests[0]!.method).toBe("GET");
    expect(fakes.requests[0]!.parsed.origin + fakes.requests[0]!.parsed.pathname).toBe(
      "https://api.setlist.fm/rest/1.0/setlist/53d60349",
    );
  });

  it("AC-9: HTTP 404 raises the setlist-not-found error naming the id", async () => {
    const fakes = makeFakes([notFound]);
    const err = await captureError(getSetlist(servicesFrom(fakes), "00000000"));
    expect(err).toBeInstanceOf(SetlistNotFoundError);
    expect(errorText(err)).toContain("00000000");
  });
});

// ---------------------------------------------------------------- AC-10

describe("findLatestSetlist (G1)", () => {
  const pearlJamFakes = () =>
    makeFakes([ok(loadFixture("search-pearl-jam.json")), ok(loadFixture("setlists-pearl-jam-p1.json"))]);

  it("AC-10: Pearl Jam wanting a complete alternative sends the artist search and page 1 only; Latest Portland, alternative Vancouver", async () => {
    const fakes = pearlJamFakes();
    const { chooser } = makeChooser(0);
    const result = await findLatestSetlist(servicesFrom(fakes), "Pearl Jam", chooser, { wantCompleteAlternative: true });
    expect(paths(fakes.requests)).toEqual([SEARCH_PATH, `/rest/1.0/artist/${PEARL_JAM_MBID}/setlists`]);
    expect(fakes.requests[1]!.parsed.searchParams.get("p")).toBe("1");
    const page = loadFixture<{ setlist: Array<{ id: string }> }>("setlists-pearl-jam-p1.json").setlist;
    expect(result).toEqual({
      artist: { name: "Pearl Jam", mbid: PEARL_JAM_MBID },
      setlist: page.find((s) => s.id === "2bf1c8e4"),
      completeAlternative: page.find((s) => s.id === "3bf1a7c2"),
    });
    expect(chooser).not.toHaveBeenCalled();
  });

  it("AC-10: without wanting a complete alternative, no alternative is returned", async () => {
    const fakes = pearlJamFakes();
    const { chooser } = makeChooser(0);
    const result = await findLatestSetlist(servicesFrom(fakes), "Pearl Jam", chooser, { wantCompleteAlternative: false });
    const page = loadFixture<{ setlist: Array<{ id: string }> }>("setlists-pearl-jam-p1.json").setlist;
    expect(result.setlist).toEqual(page.find((s) => s.id === "2bf1c8e4"));
    expect(result.completeAlternative).toBeNull();
    expect(fakes.requests).toHaveLength(2);
  });

  it("AC-10: gives the same requests and result as the existing lookup, also when the chooser is asked (Genesis)", async () => {
    const genesisPage = {
      type: "setlists",
      itemsPerPage: 20,
      page: 1,
      total: 1,
      setlist: [
        {
          id: "7bd2a1c3",
          eventDate: "23-08-2025",
          artist: { mbid: GENESIS_US_MBID, name: "Genesis" },
          venue: {
            id: "6bd6ca6e",
            name: "Ziggo Dome",
            city: { id: "2759794", name: "Amsterdam", country: { code: "NL", name: "Netherlands" } },
          },
          url: "https://www.setlist.fm/setlist/genesis/2025/ziggo-dome-amsterdam-netherlands-7bd2a1c3.html",
          sets: { set: [{ song: [{ name: "Turn It On Again" }] }] },
        },
      ],
    };
    const viaStep = makeFakes([ok(loadFixture("search-genesis.json")), ok(genesisPage)]);
    const stepChooser = makeChooser(1);
    const stepResult = await findLatestSetlist(servicesFrom(viaStep), "Genesis", stepChooser.chooser, {
      wantCompleteAlternative: true,
    });

    const viaLookup = makeFakes([ok(loadFixture("search-genesis.json")), ok(genesisPage)]);
    const lookupChooser = makeChooser(1);
    const lookupResult = await makeClient(viaLookup).findLatestSetlistByArtistName("Genesis", lookupChooser.chooser, {
      wantCompleteAlternative: true,
    });

    expect(stepChooser.calls).toEqual(lookupChooser.calls);
    expect(stepChooser.calls).toHaveLength(1);
    expect(viaStep.requests.map((r) => r.url)).toEqual(viaLookup.requests.map((r) => r.url));
    expect(stepResult).toEqual(lookupResult);
    expect(stepResult.artist).toEqual({ name: "Genesis", mbid: GENESIS_US_MBID, disambiguation: "US psychedelic rock band" });
  });

  it("AC-10: raises the same errors as the existing lookup (Artist not found, chooser cancelled)", async () => {
    const notFoundFakes = makeFakes([notFound]);
    const notFoundErr = await captureError(
      findLatestSetlist(servicesFrom(notFoundFakes), "Xyzzq Nonexistent", makeChooser(0).chooser, {}),
    );
    expect(notFoundErr).toBeInstanceOf(ArtistNotFoundError);
    expect(errorText(notFoundErr)).toContain("Xyzzq Nonexistent");

    const viaStep = makeFakes([ok(loadFixture("search-genesis.json"))]);
    const stepErr = await captureError(findLatestSetlist(servicesFrom(viaStep), "Genesis", makeChooser(null).chooser, {}));
    const viaLookup = makeFakes([ok(loadFixture("search-genesis.json"))]);
    const lookupErr = await captureError(
      makeClient(viaLookup).findLatestSetlistByArtistName("Genesis", makeChooser(null).chooser),
    );
    expect((stepErr as Error).constructor).toBe((lookupErr as Error).constructor);
    expect((stepErr as Error).message).toBe((lookupErr as Error).message);
    expect(viaStep.requests).toHaveLength(1);
  });
});
