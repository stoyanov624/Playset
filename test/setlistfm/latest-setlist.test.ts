import { describe, expect, it } from "vitest";
import { toPerformances } from "../../src/core/performances";
import {
  ArtistNotFoundError,
  NoSetlistError,
  SetlistFmRequestError,
} from "../../src/core/setlistfm";
import {
  ARCTIC_MONKEYS,
  ARCTIC_MONKEYS_MBID,
  GENESIS_UK_MBID,
  T0,
  captureError,
  emptySetlist,
  emptySetlistsPage,
  errorText,
  loadFixture,
  makeChooser,
  makeClient,
  makeFakes,
  makeSetlist,
  notFound,
  ok,
  paths,
  serverError,
  setlistsPage,
} from "./helpers";

const SETLISTS_PATH = `/rest/1.0/artist/${ARCTIC_MONKEYS_MBID}/setlists`;

function pageNumbers(fakes: ReturnType<typeof makeFakes>): Array<string | null> {
  return fakes.requests.map((r) => r.parsed.searchParams.get("p"));
}

describe("finding the Latest Setlist", () => {
  it("AC-18: skips the announced future Show and the snippet-only setlist; the first setlist with a Performance is the Latest Setlist", async () => {
    const page1 = loadFixture("setlists-arctic-monkeys-p1.json");
    // sanity: the fixtures mean what the PRD says, judged by PRD 0002
    expect(toPerformances(page1.setlist[0]).performances).toHaveLength(0);
    expect(toPerformances(page1.setlist[1]).performances).toHaveLength(0);
    expect(toPerformances(page1.setlist[2]).performances.length).toBeGreaterThan(0);

    const fakes = makeFakes([ok(page1)]);
    const setlist = await makeClient(fakes).findLatestSetlist(ARCTIC_MONKEYS);
    expect(setlist).toEqual(loadFixture("setlists-arctic-monkeys-p1.json").setlist[2]);
    expect((setlist as { id?: string }).id).toBe("63a5e2b7");
  });

  it("AC-18: requests GET /artist/{mbid}/setlists starting with p=1", async () => {
    const fakes = makeFakes([ok(loadFixture("setlists-arctic-monkeys-p1.json"))]);
    await makeClient(fakes).findLatestSetlist(ARCTIC_MONKEYS);
    const req = fakes.requests[0]!;
    expect(req.method).toBe("GET");
    expect(req.parsed.origin + req.parsed.pathname).toBe(`https://api.setlist.fm/rest/1.0/artist/${ARCTIC_MONKEYS_MBID}/setlists`);
    expect(req.parsed.searchParams.get("p")).toBe("1");
  });

  it("AC-18: setlists with no Sets key or only songs with no name are skipped", async () => {
    const noSetKey = makeSetlist("a0000001", undefined);
    const setsWithoutSongs = makeSetlist("a0000002", { set: [{ name: "Acoustic" }, { encore: 1, song: [] }] });
    const noNames = makeSetlist("a0000004", { set: [{ song: [{ name: "" }, { name: "   " }, {}] }] });
    const played = makeSetlist("a0000005", { set: [{ song: [{ name: "505" }] }] });
    for (const s of [noSetKey, setsWithoutSongs, noNames]) {
      expect(toPerformances(s).performances).toHaveLength(0);
    }

    const fakes = makeFakes([ok(setlistsPage(1, 5, [noSetKey, setsWithoutSongs, noNames, played]))]);
    const setlist = await makeClient(fakes).findLatestSetlist(ARCTIC_MONKEYS);
    expect(setlist).toEqual(played);
  });

  it("AC-18 (amended by PRD 0008): a setlist whose only songs are medleys is not skipped", async () => {
    const noSetKey = makeSetlist("a0000001", undefined);
    const medleyOnly = makeSetlist("a0000003", {
      set: [{ song: [{ name: "Teddy Picker / Crying Lightning" }, { name: "Cornerstone", info: "Medley with 'Fluorescent Adolescent'" }] }],
    });
    const played = makeSetlist("a0000005", { set: [{ song: [{ name: "505" }] }] });
    expect(toPerformances(medleyOnly).performances.map((p) => p.title)).toEqual([
      "Teddy Picker",
      "Crying Lightning",
      "Cornerstone",
    ]);

    const fakes = makeFakes([ok(setlistsPage(1, 5, [noSetKey, medleyOnly, played]))]);
    const setlist = await makeClient(fakes).findLatestSetlist(ARCTIC_MONKEYS);
    expect(setlist).toEqual(medleyOnly);
  });

  it("AC-18: setlists are checked in the order given, without re-sorting by date (a future-dated setlist with songs is kept)", async () => {
    const future = { ...makeSetlist("f0000001", { set: [{ song: [{ name: "Brianstorm" }] }] }), eventDate: "14-03-2027" };
    const older = { ...makeSetlist("f0000002", { set: [{ song: [{ name: "505" }] }] }), eventDate: "01-01-2020" };
    const newer = { ...makeSetlist("f0000003", { set: [{ song: [{ name: "R U Mine?" }] }] }), eventDate: "01-06-2026" };

    let fakes = makeFakes([ok(setlistsPage(1, 3, [future, newer]))]);
    expect(await makeClient(fakes).findLatestSetlist(ARCTIC_MONKEYS)).toEqual(future);

    fakes = makeFakes([ok(setlistsPage(1, 3, [older, newer]))]);
    expect(await makeClient(fakes).findLatestSetlist(ARCTIC_MONKEYS)).toEqual(older);
  });

  it("AC-18: a setlist whose only Performance is a Tape counts; page 1 all empty → the Tape-only setlist on page 2", async () => {
    const tapeOnly = makeSetlist("2bd2c0aa", { set: [{ song: [{ name: "Intro", tape: true }] }] });
    const page2 = setlistsPage(2, 1047, [tapeOnly, makeSetlist("2bd2c0ab", { set: [{ song: [{ name: "505" }] }] })]);
    const fakes = makeFakes([ok(emptySetlistsPage(1, 1047)), ok(page2)]);
    const setlist = await makeClient(fakes).findLatestSetlist(ARCTIC_MONKEYS);
    expect(setlist).toEqual(tapeOnly);
    expect(paths(fakes.requests)).toEqual([SETLISTS_PATH, SETLISTS_PATH]);
    expect(pageNumbers(fakes)).toEqual(["1", "2"]);
  });

  it("AC-19: when the Latest Setlist is on page 1, no later page is requested", async () => {
    const fakes = makeFakes([ok(loadFixture("setlists-arctic-monkeys-p1.json")), ok(emptySetlistsPage(2, 1047))]);
    await makeClient(fakes).findLatestSetlist(ARCTIC_MONKEYS);
    expect(pageNumbers(fakes)).toEqual(["1"]);
  });

  it("AC-19 / AC-20: all 60 setlists on pages 1–3 empty → only p=1, p=2, p=3 requested, then a no-Setlist error naming the Artist", async () => {
    const fakes = makeFakes([
      ok(emptySetlistsPage(1, 1047)),
      ok(emptySetlistsPage(2, 1047)),
      ok(emptySetlistsPage(3, 1047)),
      ok(emptySetlistsPage(4, 1047)),
    ]);
    const err = await captureError(makeClient(fakes).findLatestSetlist(ARCTIC_MONKEYS));
    expect(err).toBeInstanceOf(NoSetlistError);
    expect(errorText(err)).toContain("Arctic Monkeys");
    expect(pageNumbers(fakes)).toEqual(["1", "2", "3"]);
  });

  it("AC-19 / AC-20: page 1 with itemsPerPage 20 and total 2, both empty → only p=1 (1 × 20 ≥ 2), then a no-Setlist error", async () => {
    const fakes = makeFakes([
      ok(setlistsPage(1, 2, [emptySetlist("b0000001"), emptySetlist("b0000002")])),
      ok(emptySetlistsPage(2, 2)),
    ]);
    const err = await captureError(makeClient(fakes).findLatestSetlist(ARCTIC_MONKEYS));
    expect(err).toBeInstanceOf(NoSetlistError);
    expect(pageNumbers(fakes)).toEqual(["1"]);
  });

  it("AC-19: page × itemsPerPage exactly equal to total stops the paging (1 × 20 = 20)", async () => {
    const fakes = makeFakes([ok(emptySetlistsPage(1, 20)), ok(emptySetlistsPage(2, 20))]);
    const err = await captureError(makeClient(fakes).findLatestSetlist(ARCTIC_MONKEYS));
    expect(err).toBeInstanceOf(NoSetlistError);
    expect(pageNumbers(fakes)).toEqual(["1"]);
  });

  it("AC-19 / AC-20: total 25, page 1 all empty and page 2 with no setlists → p=1, p=2 only, then a no-Setlist error", async () => {
    const fakes = makeFakes([
      ok(emptySetlistsPage(1, 25)),
      ok(setlistsPage(2, 25, [])),
      ok(emptySetlistsPage(3, 25)),
    ]);
    const err = await captureError(makeClient(fakes).findLatestSetlist(ARCTIC_MONKEYS));
    expect(err).toBeInstanceOf(NoSetlistError);
    expect(pageNumbers(fakes)).toEqual(["1", "2"]);
  });

  it("AC-19: page 1 with no setlists at all → page 2 is not requested", async () => {
    const fakes = makeFakes([ok(setlistsPage(1, 1047, [])), ok(emptySetlistsPage(2, 1047))]);
    const err = await captureError(makeClient(fakes).findLatestSetlist(ARCTIC_MONKEYS));
    expect(err).toBeInstanceOf(NoSetlistError);
    expect(pageNumbers(fakes)).toEqual(["1"]);
  });

  it("AC-20: HTTP 404 on page 1 (the Artist has no setlists) raises a no-Setlist error naming the Artist", async () => {
    const fakes = makeFakes([notFound, ok(emptySetlistsPage(2, 1047))]);
    const err = await captureError(makeClient(fakes).findLatestSetlist(ARCTIC_MONKEYS));
    expect(err).toBeInstanceOf(NoSetlistError);
    expect(err).not.toBeInstanceOf(SetlistFmRequestError);
    expect(errorText(err)).toContain("Arctic Monkeys");
    expect(pageNumbers(fakes)).toEqual(["1"]);
  });
});

describe("single entry point: Artist name → Artist and Latest Setlist", () => {
  it("AC-21: \"Arctic Monkeys\" returns the auto-chosen Artist and the 63a5e2b7 setlist unchanged", async () => {
    const fakes = makeFakes([
      ok(loadFixture("search-arctic-monkeys.json")),
      ok(loadFixture("setlists-arctic-monkeys-p1.json")),
    ]);
    const { chooser } = makeChooser(1);
    const result = await makeClient(fakes).findLatestSetlistByArtistName("Arctic Monkeys", chooser);
    expect(result.artist).toEqual({ name: "Arctic Monkeys", mbid: ARCTIC_MONKEYS_MBID });
    expect(result.artist.disambiguation).toBeUndefined();
    expect(result.setlist).toEqual(loadFixture("setlists-arctic-monkeys-p1.json").setlist[2]);
    expect(chooser).not.toHaveBeenCalled();
  });

  it("AC-21: the Artist lookup runs first, then the Latest Setlist search, 500 ms apart", async () => {
    const fakes = makeFakes([
      ok(loadFixture("search-arctic-monkeys.json")),
      ok(loadFixture("setlists-arctic-monkeys-p1.json")),
    ]);
    const { chooser } = makeChooser(0);
    await makeClient(fakes).findLatestSetlistByArtistName("Arctic Monkeys", chooser);
    expect(paths(fakes.requests)).toEqual(["/rest/1.0/search/artists", SETLISTS_PATH]);
    expect(fakes.requests.map((r) => r.at - T0)).toEqual([0, 500]);
  });

  it("AC-21: the chosen Artist (with disambiguation) is returned and its mbid is used for the setlists", async () => {
    const genesisSetlist = makeSetlist("7bd2a1c3", { set: [{ song: [{ name: "Turn It On Again" }] }] }, "Genesis", GENESIS_UK_MBID);
    const fakes = makeFakes([ok(loadFixture("search-genesis.json")), ok(setlistsPage(1, 1, [genesisSetlist]))]);
    const { chooser } = makeChooser(0);
    const result = await makeClient(fakes).findLatestSetlistByArtistName("Genesis", chooser);
    expect(result.artist).toEqual({ name: "Genesis", mbid: GENESIS_UK_MBID, disambiguation: "English rock band" });
    expect(result.setlist).toEqual(genesisSetlist);
    expect(fakes.requests[1]!.parsed.pathname).toBe(`/rest/1.0/artist/${GENESIS_UK_MBID}/setlists`);
  });

  it("AC-21: an Artist-not-found error from the lookup is passed through unchanged", async () => {
    const fakes = makeFakes([notFound]);
    const { chooser } = makeChooser(0);
    const err = await captureError(makeClient(fakes).findLatestSetlistByArtistName("Xyzzq Nonexistent", chooser));
    expect(err).toBeInstanceOf(ArtistNotFoundError);
    expect(errorText(err)).toContain("Xyzzq Nonexistent");
  });

  it("AC-21: a no-Setlist error from the Latest Setlist search is passed through unchanged", async () => {
    const fakes = makeFakes([ok(loadFixture("search-arctic-monkeys.json")), notFound]);
    const { chooser } = makeChooser(0);
    const err = await captureError(makeClient(fakes).findLatestSetlistByArtistName("Arctic Monkeys", chooser));
    expect(err).toBeInstanceOf(NoSetlistError);
    expect(errorText(err)).toContain("Arctic Monkeys");
  });

  it("AC-21: a request error from the Latest Setlist search is passed through unchanged", async () => {
    const fakes = makeFakes([ok(loadFixture("search-arctic-monkeys.json")), serverError]);
    const { chooser } = makeChooser(0);
    const err = await captureError(makeClient(fakes).findLatestSetlistByArtistName("Arctic Monkeys", chooser));
    expect(err).toBeInstanceOf(SetlistFmRequestError);
    expect((err as SetlistFmRequestError).status).toBe(500);
  });
});
