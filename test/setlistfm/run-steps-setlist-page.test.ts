// PRD 0012 — the list-Setlists step (AC-4 to AC-8): one page of an Artist's Setlists, summarised,
// driven through the real setlist.fm client with a scripted fake fetch (no network).
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PlaysetError } from "../../src/core/index.js";
import { toPerformances, type SetlistFmSetlist } from "../../src/core/performances";
import { listSetlists } from "../../src/core/run/index.js";
import { MissingSetlistFmApiKeyError, SetlistFmRateLimitError, SetlistFmRequestError } from "../../src/core/setlistfm";
import {
  captureError,
  emptySetlist,
  errorText,
  loadFixture,
  loadFixtureA,
  makeClient,
  makeFakes,
  makeSetlist,
  makeTempRoot,
  networkFailure,
  notFound,
  ok,
  removeTempRoot,
  serviceUnavailable,
  setlistsPage,
  tooManyRequests,
  type Fakes,
} from "./helpers";

const PEARL_JAM_MBID = "83b9cbe7-9857-49e2-ab8e-b57b01038103";
const SETLISTS_PATH = `/rest/1.0/artist/${PEARL_JAM_MBID}/setlists`;

const servicesFrom = (fakes: Fakes, opts: Parameters<typeof makeClient>[1] = {}) => makeClient(fakes, opts) as never;

/** A Setlist with one named song (so it has a Performance), Pearl Jam's mbid. */
function playedSetlist(id: string): SetlistFmSetlist {
  return makeSetlist(id, { set: [{ song: [{ name: "Alive" }] }] }, "Pearl Jam", PEARL_JAM_MBID);
}

/** `count` Setlists with ids derived from the page; the first `placeholders` of them have no songs. */
function pageOf(page: number, count: number, placeholders = 0, total = 1310) {
  const setlists = Array.from({ length: count }, (_, i) => {
    const id = `${String(page).padStart(2, "0")}${String(i).padStart(2, "0")}abcd`;
    return i < placeholders ? emptySetlist(id) : playedSetlist(id);
  });
  return setlistsPage(page, total, setlists);
}

/** P2 — Arctic Monkeys in Madrid: Tape, medley, snippet, Unknown Song, repeat, guest, teaser. */
function madridSetlist(): SetlistFmSetlist {
  return {
    id: "73a1b2c5",
    eventDate: "02-06-2026",
    artist: { mbid: "ada7a83c-e3e1-40f1-93f9-3e73dbfd2c7c", name: "Arctic Monkeys" },
    venue: {
      id: "5bd7c2a4",
      name: "Estadio Metropolitano",
      city: { id: "3117735", name: "Madrid", country: { code: "ES", name: "Spain" } },
    },
    url: "https://www.setlist.fm/setlist/arctic-monkeys/2026/estadio-metropolitano-madrid-spain-73a1b2c5.html",
    sets: {
      set: [
        {
          song: [
            { name: "Intro", tape: true },
            { name: "Brianstorm" },
            { name: "Do I Wanna Know? / R U Mine?" },
            { name: "Hey Jude", info: "snippet" },
            { name: "" },
            { name: "Brianstorm" },
          ],
        },
        { encore: 1, song: [{ name: "505", info: "with Miles Kane" }, { name: "Kashmir", info: "Tease" }] },
      ],
    },
  } as unknown as SetlistFmSetlist;
}

// ---------------------------------------------------------------- AC-4, AC-5, AC-8: P1

describe("listSetlists — one page of Pearl Jam's Setlists (P1)", () => {
  it("AC-4: sends exactly one GET /artist/{mbid}/setlists?p=1 and fetches no Setlist by id", async () => {
    const fakes = makeFakes([ok(loadFixture("setlists-pearl-jam-p1.json"))]);
    await listSetlists(servicesFrom(fakes), PEARL_JAM_MBID, 1);
    expect(fakes.requests).toHaveLength(1);
    const { parsed, method } = fakes.requests[0]!;
    expect(method).toBe("GET");
    expect(parsed.origin + parsed.pathname).toBe(`https://api.setlist.fm/rest/1.0/artist/${PEARL_JAM_MBID}/setlists`);
    expect(parsed.searchParams.get("p")).toBe("1");
  });

  it("AC-4, AC-8: one summary per Setlist in setlist.fm's order, the placeholder Chase Center Show left out", async () => {
    const fakes = makeFakes([ok(loadFixture("setlists-pearl-jam-p1.json"))]);
    const result = await listSetlists(servicesFrom(fakes), PEARL_JAM_MBID, 1);
    expect(result.setlists).toStrictEqual([
      {
        id: "2bf1c8e4",
        date: "2026-11-22",
        venue: "Moda Center",
        city: "Portland",
        songCount: 3,
        incompleteStatus: { isIncomplete: true, unknownSongCount: 1 },
      },
      {
        id: "6bf1b3d0",
        date: "2026-11-20",
        venue: "Climate Pledge Arena",
        city: "Seattle",
        songCount: 2,
        incompleteStatus: {
          isIncomplete: true,
          unknownSongCount: 0,
          matchedPhrase: "cut short",
          setlistNote: "Show cut short after a power outage.",
        },
      },
      {
        id: "3bf1a7c2",
        date: "2026-11-18",
        venue: "Rogers Arena",
        city: "Vancouver",
        songCount: 6,
        incompleteStatus: { isIncomplete: false, unknownSongCount: 0 },
      },
    ]);
  });

  it("AC-5: hasMore is true when page × itemsPerPage < total (1 × 20 < 1310)", async () => {
    const fakes = makeFakes([ok(loadFixture("setlists-pearl-jam-p1.json"))]);
    const result = await listSetlists(servicesFrom(fakes), PEARL_JAM_MBID, 1);
    expect(result.hasMore).toBe(true);
  });
});

// ---------------------------------------------------------------- AC-4 to AC-7: P3

describe("listSetlists — paging edge cases (P3)", () => {
  it("AC-5: page 1 of only placeholder Setlists → no summaries, hasMore still true", async () => {
    const fakes = makeFakes([ok(pageOf(1, 20, 20))]);
    const result = await listSetlists(servicesFrom(fakes), PEARL_JAM_MBID, 1);
    expect(result).toEqual({ setlists: [], hasMore: true });
    expect(fakes.requests).toHaveLength(1);
  });

  it("AC-4: page 2 with 7 placeholders → 13 summaries in setlist.fm's order, hasMore true", async () => {
    const body = pageOf(2, 20, 7);
    const fakes = makeFakes([ok(body)]);
    const result = await listSetlists(servicesFrom(fakes), PEARL_JAM_MBID, 2);
    expect(result.setlists.map((s: { id: string }) => s.id)).toEqual(
      (body.setlist as Array<{ id: string }>).slice(7).map((s) => s.id),
    );
    expect(result.hasMore).toBe(true);
    expect(fakes.requests[0]!.parsed.searchParams.get("p")).toBe("2");
  });

  it("AC-5: page 65 (1300 < 1310) has more; page 66 (1320 ≥ 1310) has no more", async () => {
    const p65 = makeFakes([ok(pageOf(65, 20))]);
    const r65 = await listSetlists(servicesFrom(p65), PEARL_JAM_MBID, 65);
    expect(r65.setlists).toHaveLength(20);
    expect(r65.hasMore).toBe(true);

    const p66 = makeFakes([ok(pageOf(66, 10))]);
    const r66 = await listSetlists(servicesFrom(p66), PEARL_JAM_MBID, 66);
    expect(r66.setlists).toHaveLength(10);
    expect(r66.hasMore).toBe(false);
  });

  it("AC-5: page × itemsPerPage exactly equal to total has no more (1 × 20 = 20)", async () => {
    const fakes = makeFakes([ok(pageOf(1, 20, 0, 20))]);
    const result = await listSetlists(servicesFrom(fakes), PEARL_JAM_MBID, 1);
    expect(result.hasMore).toBe(false);
  });

  it("AC-5: a last page of only placeholders gives no summaries and hasMore false", async () => {
    const fakes = makeFakes([ok(pageOf(66, 10, 10))]);
    const result = await listSetlists(servicesFrom(fakes), PEARL_JAM_MBID, 66);
    expect(result).toEqual({ setlists: [], hasMore: false });
  });

  it("AC-5: without itemsPerPage or total, hasMore is whether the page had at least one Setlist", async () => {
    const withSetlists = { type: "setlists", page: 3, setlist: [emptySetlist("aa00bb11"), playedSetlist("aa00bb12")] };
    const a = makeFakes([ok(withSetlists)]);
    const ra = await listSetlists(servicesFrom(a), PEARL_JAM_MBID, 3);
    expect(ra.setlists.map((s: { id: string }) => s.id)).toEqual(["aa00bb12"]);
    expect(ra.hasMore).toBe(true);

    const onlyPlaceholders = { type: "setlists", page: 3, setlist: [emptySetlist("aa00bb13")] };
    const b = makeFakes([ok(onlyPlaceholders)]);
    expect(await listSetlists(servicesFrom(b), PEARL_JAM_MBID, 3)).toEqual({ setlists: [], hasMore: true });

    const empty = { type: "setlists", page: 3, setlist: [] };
    const c = makeFakes([ok(empty)]);
    expect(await listSetlists(servicesFrom(c), PEARL_JAM_MBID, 3)).toEqual({ setlists: [], hasMore: false });
  });

  it("AC-4: pages past 3 are allowed (page 4 → 20 summaries, one request for p=4)", async () => {
    const fakes = makeFakes([ok(pageOf(4, 20))]);
    const result = await listSetlists(servicesFrom(fakes), PEARL_JAM_MBID, 4);
    expect(result.setlists).toHaveLength(20);
    expect(fakes.requests).toHaveLength(1);
    expect(fakes.requests[0]!.parsed.pathname).toBe(SETLISTS_PATH);
    expect(fakes.requests[0]!.parsed.searchParams.get("p")).toBe("4");
  });

  it("AC-6: HTTP 404 past the last page (page 67) → no summaries, hasMore false, no error", async () => {
    const fakes = makeFakes([notFound]);
    const result = await listSetlists(servicesFrom(fakes), PEARL_JAM_MBID, 67);
    expect(result).toEqual({ setlists: [], hasMore: false });
    expect(fakes.requests).toHaveLength(1);
  });

  it("AC-6: HTTP 404 on page 1 (an Artist with no setlists) → no summaries, hasMore false", async () => {
    const fakes = makeFakes([notFound]);
    const result = await listSetlists(servicesFrom(fakes), "4a5b6c7d-8e9f-4a0b-9c1d-2e3f4a5b6c7d", 1);
    expect(result).toEqual({ setlists: [], hasMore: false });
  });

  it("AC-4: HTTP 429 with Retry-After: 2 waits 2 s through the injected sleep, then gives the 200 page's result", async () => {
    const fakes = makeFakes([tooManyRequests("2"), ok(loadFixture("setlists-pearl-jam-p1.json"))]);
    const result = await listSetlists(servicesFrom(fakes), PEARL_JAM_MBID, 1);
    expect(fakes.sleeps).toContain(2000);
    expect(fakes.requests).toHaveLength(2);
    for (const r of fakes.requests) expect(r.parsed.searchParams.get("p")).toBe("1");
    expect(result.setlists.map((s: { id: string }) => s.id)).toEqual(["2bf1c8e4", "6bf1b3d0", "3bf1a7c2"]);
    expect(result.hasMore).toBe(true);
  });

  it("AC-6: HTTP 429 four times passes on the setlist.fm rate-limit error after 4 requests", async () => {
    const fakes = makeFakes([tooManyRequests("1"), tooManyRequests("1"), tooManyRequests("1"), tooManyRequests("1")]);
    const err = await captureError(listSetlists(servicesFrom(fakes), PEARL_JAM_MBID, 1));
    expect(err).toBeInstanceOf(SetlistFmRateLimitError);
    expect(fakes.requests).toHaveLength(4);
  });

  it("AC-6: HTTP 503 passes on the setlist.fm request error naming 503, after 1 request", async () => {
    const fakes = makeFakes([serviceUnavailable]);
    const err = await captureError(listSetlists(servicesFrom(fakes), PEARL_JAM_MBID, 1));
    expect(err).toBeInstanceOf(SetlistFmRequestError);
    expect((err as SetlistFmRequestError).status).toBe(503);
    expect(errorText(err)).toContain("503");
    expect(fakes.requests).toHaveLength(1);
  });

  it("AC-6: a network error passes on the setlist.fm request error", async () => {
    const fakes = makeFakes([networkFailure]);
    const err = await captureError(listSetlists(servicesFrom(fakes), PEARL_JAM_MBID, 1));
    expect(err).toBeInstanceOf(SetlistFmRequestError);
  });

  describe("without an API key", () => {
    let root: string;
    beforeEach(async () => {
      root = await makeTempRoot();
    });
    afterEach(async () => {
      await removeTempRoot(root);
    });

    it("AC-6: no API key anywhere passes on the missing-API-key error, with no request", async () => {
      const fakes = makeFakes([ok(loadFixture("setlists-pearl-jam-p1.json"))]);
      const services = servicesFrom(fakes, { env: {}, configDir: join(root, "playset") });
      const err = await captureError(listSetlists(services, PEARL_JAM_MBID, 1));
      expect(err).toBeInstanceOf(MissingSetlistFmApiKeyError);
      expect(fakes.fetch).not.toHaveBeenCalled();
    });
  });

  for (const page of [0, -1, 1.5]) {
    it(`AC-7: page ${page} raises a Playset error saying the page is not valid, with no request`, async () => {
      const fakes = makeFakes([ok(loadFixture("setlists-pearl-jam-p1.json"))]);
      const err = await captureError(listSetlists(servicesFrom(fakes), PEARL_JAM_MBID, page));
      expect(err).toBeInstanceOf(PlaysetError);
      expect(errorText(err)).toMatch(/page/i);
      expect(errorText(err)).toMatch(/not valid|invalid/i);
      expect(fakes.fetch).not.toHaveBeenCalled();
    });
  }
});

// ---------------------------------------------------------------- AC-8: P2

describe("listSetlists — the summary of a Setlist (P2)", () => {
  it("AC-8: Madrid counts 6 songs (Tape and both medley parts and the repeat count; snippet, teaser and Unknown Song don't)", async () => {
    const fakes = makeFakes([ok(setlistsPage(1, 1, [madridSetlist()]))]);
    const result = await listSetlists(servicesFrom(fakes), "ada7a83c-e3e1-40f1-93f9-3e73dbfd2c7c", 1);
    expect(result.setlists).toStrictEqual([
      {
        id: "73a1b2c5",
        date: "2026-06-02",
        venue: "Estadio Metropolitano",
        city: "Madrid",
        songCount: 6,
        incompleteStatus: { isIncomplete: true, unknownSongCount: 1 },
      },
    ]);
    expect(result.hasMore).toBe(false);
  });

  it("AC-8: Fixture A's song count equals its Performance count; incomplete with 1 Unknown Song", async () => {
    const fixtureA = loadFixtureA();
    const performanceCount = toPerformances(loadFixtureA()).performances.length;
    expect(performanceCount).toBe(14);
    const fakes = makeFakes([ok(setlistsPage(1, 1, [fixtureA]))]);
    const result = await listSetlists(servicesFrom(fakes), "ada7a83c-e3e1-40f1-93f9-3e73dbfd2c7c", 1);
    expect(result.setlists).toStrictEqual([
      {
        id: "63a5e2b7",
        date: "2025-08-23",
        venue: "Ziggo Dome",
        city: "Amsterdam",
        songCount: 14,
        incompleteStatus: { isIncomplete: true, unknownSongCount: 1 },
      },
    ]);
  });

  it("AC-8: the summary is the same whichever page the Setlist was found on (page 1 and page 4)", async () => {
    const onPage1 = makeFakes([ok(setlistsPage(1, 200, [madridSetlist(), loadFixtureA()]))]);
    const onPage4 = makeFakes([ok(setlistsPage(4, 200, [playedSetlist("ab12cd34"), loadFixtureA(), madridSetlist()]))]);
    const r1 = await listSetlists(servicesFrom(onPage1), "ada7a83c-e3e1-40f1-93f9-3e73dbfd2c7c", 1);
    const r4 = await listSetlists(servicesFrom(onPage4), "ada7a83c-e3e1-40f1-93f9-3e73dbfd2c7c", 4);
    const byId = (r: { setlists: Array<{ id: string }> }, id: string) => r.setlists.find((s) => s.id === id);
    expect(byId(r4, "73a1b2c5")).toStrictEqual(byId(r1, "73a1b2c5"));
    expect(byId(r4, "63a5e2b7")).toStrictEqual(byId(r1, "63a5e2b7"));
    expect(byId(r1, "73a1b2c5")).toMatchObject({ songCount: 6 });
  });

  it("AC-8: a Setlist on the page without an id is left out (it could not be fetched again)", async () => {
    const withoutId = playedSetlist("ffff0000") as unknown as Record<string, unknown>;
    delete withoutId.id;
    const withId = playedSetlist("ab12cd34");
    // total 200 on page 1: 1 × 20 < 200, so hasMore stays true whatever is left out.
    const fakes = makeFakes([ok(setlistsPage(1, 200, [withoutId as unknown as SetlistFmSetlist, withId]))]);
    const result = await listSetlists(servicesFrom(fakes), PEARL_JAM_MBID, 1);
    expect(result.setlists.map((s: { id: string }) => s.id)).toEqual(["ab12cd34"]);
    expect(result.setlists).toHaveLength(1);
    expect(result.hasMore).toBe(true);
  });

  it("AC-8: a summary has no setlist.fm URL and no Artist name", async () => {
    const fakes = makeFakes([ok(setlistsPage(1, 1, [madridSetlist()]))]);
    const result = await listSetlists(servicesFrom(fakes), "ada7a83c-e3e1-40f1-93f9-3e73dbfd2c7c", 1);
    expect(Object.keys(result.setlists[0]!).sort()).toEqual(
      ["city", "date", "id", "incompleteStatus", "songCount", "venue"].sort(),
    );
  });
});
