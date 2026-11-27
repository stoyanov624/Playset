// PRD 0011 — the setlist.fm side of Incomplete Setlists:
//  - the Setlist note reaches the incomplete check unchanged (AC-6),
//  - looking for the newest complete Setlist after an incomplete Latest Setlist (AC-7 to AC-9).
// Every request is answered by a scripted fake fetch (no network).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { toPerformances, type PerformancesResult, type SetlistFmSetlist } from "../../src/core/performances";
import { SetlistFmRateLimitError, SetlistFmRequestError } from "../../src/core/setlistfm";
import {
  captureError,
  emptySetlist,
  loadFixture,
  makeChooser,
  makeClient,
  makeFakes,
  notFound,
  ok,
  paths,
  serverError,
  setlistsPage,
  tooManyRequests,
  type Fakes,
} from "./helpers";

const PEARL_JAM_MBID = "83b9cbe7-9857-49e2-ab8e-b57b01038103";
const SEARCH_PATH = "/rest/1.0/search/artists";
const SETLISTS_PATH = `/rest/1.0/artist/${PEARL_JAM_MBID}/setlists`;

const sharedFixtures = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "performances");
const loadShared = (file: string) => JSON.parse(readFileSync(join(sharedFixtures, file), "utf8")) as SetlistFmSetlist;

const status = (r: PerformancesResult) => (r as unknown as { incompleteStatus: unknown }).incompleteStatus;

/** The lookup with the new option and result field (PRD 0011 AC-7 to AC-9). */
interface LookupResult {
  artist: { name: string; mbid: string };
  setlist: SetlistFmSetlist;
  completeAlternative?: SetlistFmSetlist | null;
}

async function lookup(fakes: Fakes, wantCompleteAlternative?: boolean): Promise<LookupResult> {
  const client = makeClient(fakes) as unknown as {
    findLatestSetlistByArtistName(name: string, chooser: unknown, options?: { wantCompleteAlternative?: boolean }): Promise<LookupResult>;
  };
  const { chooser } = makeChooser(0);
  if (wantCompleteAlternative === undefined) return client.findLatestSetlistByArtistName("Pearl Jam", chooser);
  return client.findLatestSetlistByArtistName("Pearl Jam", chooser, { wantCompleteAlternative });
}

const alternativeOf = (r: LookupResult) => r.completeAlternative ?? null;

function setlistPages(fakes: Fakes): Array<string | null> {
  return fakes.requests.filter((r) => r.parsed.pathname === SETLISTS_PATH).map((r) => r.parsed.searchParams.get("p"));
}

// ---------------------------------------------------------------- setlists for L2

let counter = 0;
function pjSetlist(sets: unknown, extra: Record<string, unknown> = {}): SetlistFmSetlist {
  counter++;
  const id = `9${String(counter).padStart(7, "0")}`;
  return {
    id,
    eventDate: "01-11-2026",
    artist: { mbid: PEARL_JAM_MBID, name: "Pearl Jam" },
    venue: {
      id: "7bd6e1a0",
      name: "Some Arena",
      city: { id: "5419384", name: "Denver", country: { code: "US", name: "United States" } },
    },
    url: `https://www.setlist.fm/setlist/pearl-jam/2026/some-arena-denver-co-${id}.html`,
    sets,
    ...extra,
  } as unknown as SetlistFmSetlist;
}
/** 1 Unknown Song → incomplete. */
const incomplete = () => pjSetlist({ set: [{ song: [{ name: "Release" }, { name: "" }, { name: "Alive" }] }] });
const complete = (extra: Record<string, unknown> = {}) =>
  pjSetlist({ set: [{ song: [{ name: "Release" }, { name: "Alive" }] }] }, extra);
const empties = (n: number) => Array.from({ length: n }, (_, i) => emptySetlist(`e${counter}${i}`.padEnd(8, "a")));
const page = (p: number, setlists: SetlistFmSetlist[], total = 1310, itemsPerPage = 20) =>
  ok(setlistsPage(p, total, setlists, itemsPerPage));
const search = () => ok(loadFixture("search-pearl-jam.json"));

// ---------------------------------------------------------------- AC-6

describe("the Setlist note reaches the incomplete check", () => {
  it("AC-6: a Setlist fetched by id keeps its Setlist note unchanged, and it makes the Setlist incomplete", async () => {
    const radiohead = loadShared("radiohead-2bf3d4e6-note-incomplete.json");
    const fakes = makeFakes([ok(radiohead)]);
    const setlist = await makeClient(fakes).getSetlist("2bf3d4e6");

    expect(setlist).toEqual(loadShared("radiohead-2bf3d4e6-note-incomplete.json"));
    expect((setlist as unknown as { info?: string }).info).toBe("Setlist incomplete");
    expect(status(toPerformances(setlist))).toEqual({
      isIncomplete: true,
      unknownSongCount: 0,
      matchedPhrase: "incomplete",
      setlistNote: "Setlist incomplete",
    });
  });

  it("AC-6: a Setlist found in a page of the Artist's setlists keeps its Setlist note (Seattle, 'cut short')", () => {
    const seattle = loadFixture("setlists-pearl-jam-p1.json").setlist[2] as SetlistFmSetlist;

    expect(status(toPerformances(seattle))).toEqual({
      isIncomplete: true,
      unknownSongCount: 0,
      matchedPhrase: "cut short",
      setlistNote: "Show cut short after a power outage.",
    });
  });

  it("AC-6: a Setlist without a Setlist note is handled like one with an empty note", () => {
    const noNote = complete();
    const emptyNote = complete({ info: "" });

    expect(status(toPerformances(noNote))).toEqual({ isIncomplete: false, unknownSongCount: 0 });
    expect(status(toPerformances(emptyNote))).toEqual({ isIncomplete: false, unknownSongCount: 0 });
  });
});

// ---------------------------------------------------------------- L1

describe("looking for an older complete Setlist — L1 (Pearl Jam)", () => {
  it("AC-7: the Latest Setlist is Portland (incomplete); Seattle (note 'cut short') is skipped; Vancouver is the newest complete Setlist", async () => {
    const fakes = makeFakes([search(), ok(loadFixture("setlists-pearl-jam-p1.json"))]);
    const result = await lookup(fakes, true);
    const p1 = loadFixture("setlists-pearl-jam-p1.json");

    expect(result.artist).toMatchObject({ name: "Pearl Jam", mbid: PEARL_JAM_MBID });
    expect(result.setlist).toEqual(p1.setlist[1]);
    expect((result.setlist as unknown as { id: string }).id).toBe("2bf1c8e4");
    expect(alternativeOf(result)).toEqual(p1.setlist[3]);
    expect((alternativeOf(result) as unknown as { id: string }).id).toBe("3bf1a7c2");
  });

  it("AC-7: only page 1 is requested, and no extra request fetches the complete Setlist by id", async () => {
    const fakes = makeFakes([search(), ok(loadFixture("setlists-pearl-jam-p1.json"))]);
    await lookup(fakes, true);

    expect(paths(fakes.requests)).toEqual([SEARCH_PATH, SETLISTS_PATH]);
    expect(setlistPages(fakes)).toEqual(["1"]);
  });

  it("AC-8: without asking for an alternative, the lookup makes PRD 0005's requests and says there is no alternative", async () => {
    for (const want of [false, undefined]) {
      const fakes = makeFakes([search(), ok(loadFixture("setlists-pearl-jam-p1.json"))]);
      const result = await lookup(fakes, want);

      expect(result.setlist).toEqual(loadFixture("setlists-pearl-jam-p1.json").setlist[1]);
      expect(alternativeOf(result)).toBeNull();
      expect(paths(fakes.requests)).toEqual([SEARCH_PATH, SETLISTS_PATH]);
    }
  });
});

// ---------------------------------------------------------------- L2

describe("looking for an older complete Setlist — L2 paging", () => {
  it("AC-7: p1 items 1–19 empty and item 20 incomplete, p2 item 1 complete (Denver) → p1, p2; Denver is offered", async () => {
    const latest = incomplete();
    const denver = complete({ eventDate: "30-10-2026" });
    const fakes = makeFakes([search(), page(1, [...empties(19), latest]), page(2, [denver, complete()]), page(3, [complete()])]);
    const result = await lookup(fakes, true);

    expect(result.setlist).toEqual(latest);
    expect(alternativeOf(result)).toEqual(denver);
    expect(setlistPages(fakes)).toEqual(["1", "2"]);
  });

  it("AC-8: p1 item 1 complete → p1 only; the Latest Setlist is not incomplete, so no alternative", async () => {
    const latest = complete();
    const fakes = makeFakes([search(), page(1, [latest, complete()]), page(2, [complete()])]);
    const result = await lookup(fakes, true);

    expect(result.setlist).toEqual(latest);
    expect(alternativeOf(result)).toBeNull();
    expect(setlistPages(fakes)).toEqual(["1"]);
  });

  it("AC-9: p1 item 1 incomplete, every other item on p1–p3 empty or incomplete → p1, p2, p3 only; no alternative, no error", async () => {
    const latest = incomplete();
    const fakes = makeFakes([
      search(),
      page(1, [latest, ...empties(9), ...Array.from({ length: 10 }, incomplete)]),
      page(2, [...Array.from({ length: 10 }, incomplete), ...empties(10)]),
      page(3, [...empties(10), ...Array.from({ length: 10 }, incomplete)]),
      page(4, [complete()]),
    ]);
    const result = await lookup(fakes, true);

    expect(result.setlist).toEqual(latest);
    expect(alternativeOf(result)).toBeNull();
    expect(setlistPages(fakes)).toEqual(["1", "2", "3"]);
  });

  it("AC-9: p1 with itemsPerPage 20 and total 4, all incomplete → p1 only (1 × 20 ≥ 4); no alternative", async () => {
    const latest = incomplete();
    const fakes = makeFakes([
      search(),
      page(1, [latest, incomplete(), incomplete(), incomplete()], 4),
      page(2, [complete()], 4),
    ]);
    const result = await lookup(fakes, true);

    expect(result.setlist).toEqual(latest);
    expect(alternativeOf(result)).toBeNull();
    expect(setlistPages(fakes)).toEqual(["1"]);
  });

  it("AC-7: p1 all empty, p2 item 20 incomplete, p3 item 1 complete → p1, p2, p3; the Latest Setlist is p2 item 20 and p3 item 1 is offered", async () => {
    const latest = incomplete();
    const offered = complete();
    const fakes = makeFakes([
      search(),
      page(1, empties(20)),
      page(2, [...empties(19), latest]),
      page(3, [offered, complete()]),
    ]);
    const result = await lookup(fakes, true);

    expect(result.setlist).toEqual(latest);
    expect(alternativeOf(result)).toEqual(offered);
    expect(setlistPages(fakes)).toEqual(["1", "2", "3"]);
  });

  it("AC-7, AC-9: p1 and p2 empty, p3 item 20 incomplete → p1, p2, p3 and never p4; no alternative", async () => {
    const latest = incomplete();
    const fakes = makeFakes([
      search(),
      page(1, empties(20)),
      page(2, empties(20)),
      page(3, [...empties(19), latest]),
      page(4, [complete()]),
    ]);
    const result = await lookup(fakes, true);

    expect(result.setlist).toEqual(latest);
    expect(alternativeOf(result)).toBeNull();
    expect(setlistPages(fakes)).toEqual(["1", "2", "3"]);
  });

  it("AC-7: the search checks the rest of the Latest Setlist's page in setlist.fm's order, without re-sorting by date", async () => {
    const latest = incomplete();
    const olderFirst = complete({ eventDate: "01-01-2020" });
    const newerSecond = complete({ eventDate: "01-10-2026" });
    const fakes = makeFakes([search(), page(1, [emptySetlist("a1000000"), latest, olderFirst, newerSecond])]);
    const result = await lookup(fakes, true);

    expect(alternativeOf(result)).toEqual(olderFirst);
  });

  it("AC-7: a later setlist with 0 Performances is not a complete Setlist", async () => {
    const latest = incomplete();
    const onlyUnknown = pjSetlist({ set: [{ song: [{ name: "" }] }] });
    const offered = complete();
    const fakes = makeFakes([search(), page(1, [latest, emptySetlist("a2000000"), onlyUnknown, offered])]);
    const result = await lookup(fakes, true);

    expect(alternativeOf(result)).toEqual(offered);
  });

  it("AC-9: p1 item 20 incomplete, p2 answered HTTP 404 → p1, p2; no alternative, no error", async () => {
    const latest = incomplete();
    const fakes = makeFakes([search(), page(1, [...empties(19), latest]), notFound, page(3, [complete()])]);
    const result = await lookup(fakes, true);

    expect(result.setlist).toEqual(latest);
    expect(alternativeOf(result)).toBeNull();
    expect(setlistPages(fakes)).toEqual(["1", "2"]);
  });

  it("AC-9: p1 item 20 incomplete, p2 answered HTTP 429 four times → the rate-limit error is passed on after 4 requests for p2", async () => {
    const latest = incomplete();
    const fakes = makeFakes([
      search(),
      page(1, [...empties(19), latest]),
      tooManyRequests("1"),
      tooManyRequests("1"),
      tooManyRequests("1"),
      tooManyRequests("1"),
      page(2, [complete()]),
    ]);
    const err = await captureError(lookup(fakes, true));

    expect(err).toBeInstanceOf(SetlistFmRateLimitError);
    expect(setlistPages(fakes)).toEqual(["1", "2", "2", "2", "2"]);
  });

  it("AC-9: a request error on a later page is passed on unchanged", async () => {
    const latest = incomplete();
    const fakes = makeFakes([search(), page(1, [...empties(19), latest]), serverError]);
    const err = await captureError(lookup(fakes, true));

    expect(err).toBeInstanceOf(SetlistFmRequestError);
    expect((err as SetlistFmRequestError).status).toBe(500);
  });

  it("AC-8: p1 item 20 incomplete, no alternative wanted (--yes) → p1 only; no alternative", async () => {
    const latest = incomplete();
    const fakes = makeFakes([search(), page(1, [...empties(19), latest]), page(2, [complete()])]);
    const result = await lookup(fakes, false);

    expect(result.setlist).toEqual(latest);
    expect(alternativeOf(result)).toBeNull();
    expect(setlistPages(fakes)).toEqual(["1"]);
  });

  it("AC-7: the newest complete Setlist may be the next item on the Latest Setlist's page after a later page was needed for the Latest", async () => {
    const latest = incomplete();
    const offered = complete();
    const fakes = makeFakes([search(), page(1, empties(20)), page(2, [latest, offered]), page(3, [complete()])]);
    const result = await lookup(fakes, true);

    expect(result.setlist).toEqual(latest);
    expect(alternativeOf(result)).toEqual(offered);
    expect(setlistPages(fakes)).toEqual(["1", "2"]);
  });
});
