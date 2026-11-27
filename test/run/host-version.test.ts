// The setlist.fm version (`versionId`) on the Setlist, its summary and the prepared Setlist
// (AC-1 to AC-3). setlist.fm is a scripted fake fetch behind the real client. No network.
import { describe, expect, it } from "vitest";
import { findLatestSetlist, getSetlist, listSetlists, prepareSetlist } from "../../src/core/run/index.js";
import type { SetlistFmSetlist } from "../../src/core/performances";
import { loadFixture, makeChooser, makeClient, makeFakes, ok } from "../setlistfm/helpers";
import { fixtureA } from "./fixtures/setlists";
import { H_SETLIST_ID, H_V1, H_V2, fixtureHv1, fixtureHv2, variant } from "./fixtures/host-setlists";

const PEARL_JAM_MBID = "83b9cbe7-9857-49e2-ab8e-b57b01038103";
const leaveOutTapes = { keepTape: async () => false };

/** Pearl Jam page 1 (the run steps' example P1) with versions added to Portland and Vancouver. */
function versionedPage(portland: unknown = H_V1, vancouver: unknown = "g7ac2e1d9") {
  const page = loadFixture<{ setlist: Array<Record<string, unknown>> }>("setlists-pearl-jam-p1.json");
  for (const s of page.setlist) {
    if (s.id === "2bf1c8e4") s.versionId = portland;
    if (s.id === "3bf1a7c2") s.versionId = vancouver;
  }
  return page;
}

// ---------------------------------------------------------------- AC-1

describe("the version on a fetched Setlist (V1)", () => {
  it("AC-1: getSetlist on Fixture H v1 gives a Setlist with versionId g4bd1a2f6", async () => {
    const fakes = makeFakes([ok(fixtureHv1())]);
    const setlist = await getSetlist(makeClient(fakes), H_SETLIST_ID);
    expect(setlist.versionId).toBe(H_V1);
    expect(setlist).toEqual(fixtureHv1());
  });

  it("AC-1: a Setlist without versionId (Fixture A) simply has none, and no error is raised", async () => {
    const fakes = makeFakes([ok(fixtureA())]);
    const setlist = await getSetlist(makeClient(fakes), "63a5e2b7");
    expect("versionId" in setlist).toBe(false);
    expect(setlist).toEqual(fixtureA());
  });

  it("AC-1: the Latest Setlist from the Artist lookup keeps its versionId (Pearl Jam → Portland g4bd1a2f6)", async () => {
    const fakes = makeFakes([ok(loadFixture("search-pearl-jam.json")), ok(versionedPage())]);
    const result = await findLatestSetlist(makeClient(fakes), "Pearl Jam", makeChooser(0).chooser, {
      wantCompleteAlternative: true,
    });
    expect(result.setlist.id).toBe("2bf1c8e4");
    expect(result.setlist.versionId).toBe(H_V1);
    expect(result.completeAlternative?.versionId).toBe("g7ac2e1d9");
  });

  it("AC-1: a Setlist page read straight from the client keeps each Setlist's versionId, and one without stays without", async () => {
    const page = versionedPage();
    const fakes = makeFakes([ok(page)]);
    const result = await makeClient(fakes).getSetlistPage(PEARL_JAM_MBID, 1);
    // The raw page also holds an announced future Show (4bf1d2a6) with no version; the client keeps it as it is.
    expect(result.setlists.map((s) => [s.id, s.versionId])).toEqual([
      ["4bf1d2a6", undefined],
      ["2bf1c8e4", H_V1],
      ["6bf1b3d0", undefined],
      ["3bf1a7c2", "g7ac2e1d9"],
    ]);
    expect(result.setlists.map((s) => "versionId" in s)).toEqual([false, true, false, true]);
    expect(result.setlists).toEqual(page.setlist);
  });
});

// ---------------------------------------------------------------- AC-2

describe("the version on a Setlist summary (V1)", () => {
  it("AC-2: Portland's summary holds versionId g4bd1a2f6 and Vancouver's g7ac2e1d9; every other field as before", async () => {
    const fakes = makeFakes([ok(versionedPage())]);
    const result = await listSetlists(makeClient(fakes), PEARL_JAM_MBID, 1);
    expect(result.setlists).toStrictEqual([
      {
        id: "2bf1c8e4",
        date: "2026-11-22",
        venue: "Moda Center",
        city: "Portland",
        songCount: 3,
        incompleteStatus: { isIncomplete: true, unknownSongCount: 1 },
        versionId: H_V1,
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
        versionId: "g7ac2e1d9",
      },
    ]);
    expect(result.hasMore).toBe(true);
  });

  it("AC-2: the P1 page (no versionId anywhere) gives summaries with no versionId key", async () => {
    const fakes = makeFakes([ok(loadFixture("setlists-pearl-jam-p1.json"))]);
    const result = await listSetlists(makeClient(fakes), PEARL_JAM_MBID, 1);
    expect(result.setlists.map((s) => "versionId" in s)).toEqual([false, false, false]);
    expect(result.setlists.map((s) => s.id)).toEqual(["2bf1c8e4", "6bf1b3d0", "3bf1a7c2"]);
  });

  it.each([
    ["an empty string", ""],
    ["a number", 42],
    ["null", null],
  ])("AC-2: a versionId that is %s gives a summary with no versionId key", async (_label, value) => {
    const fakes = makeFakes([ok(versionedPage(value, value))]);
    const result = await listSetlists(makeClient(fakes), PEARL_JAM_MBID, 1);
    expect(result.setlists).toHaveLength(3);
    for (const summary of result.setlists) expect("versionId" in summary).toBe(false);
  });
});

// ---------------------------------------------------------------- AC-3

describe("the setlist id and version on the prepared Setlist (V1)", () => {
  it("AC-3: H v2 with Tapes left out → setlistId 2bf1c8e4, versionId g2b5e7c19; 5 kept, Master/Slave not added", async () => {
    const prepared = await prepareSetlist(fixtureHv2(), leaveOutTapes);
    expect(prepared.setlistId).toBe(H_SETLIST_ID);
    expect(prepared.versionId).toBe(H_V2);
    expect(prepared.keptPerformances.map((p) => p.title)).toEqual([
      "Release",
      "Even Flow",
      "Corduroy",
      "Alive",
      "Yellow Ledbetter",
    ]);
    expect(prepared.notAdded).toEqual([{ name: "Master/Slave", reason: "tape" }]);
    expect(prepared.show).toEqual({
      artist: "Pearl Jam",
      date: "2026-11-21",
      city: "Portland",
      venue: "Moda Center",
      url: "https://www.setlist.fm/setlist/pearl-jam/2026/moda-center-portland-or-2bf1c8e4.html",
    });
  });

  it("AC-3: Fixture A (an id but no version) → setlistId 63a5e2b7 and no versionId key", async () => {
    const prepared = await prepareSetlist(fixtureA(), leaveOutTapes);
    expect(prepared.setlistId).toBe("63a5e2b7");
    expect("versionId" in prepared).toBe(false);
  });

  it("AC-3: a Setlist with neither id nor version → neither key", async () => {
    const setlist: SetlistFmSetlist = variant(fixtureHv1(), { id: undefined, versionId: undefined });
    const prepared = await prepareSetlist(setlist, leaveOutTapes);
    expect("setlistId" in prepared).toBe(false);
    expect("versionId" in prepared).toBe(false);
    expect(prepared.keptPerformances.map((p) => p.title)).toEqual(["Release", "Even Flow", "Alive"]);
  });

  it("AC-3: an empty versionId is no version → no versionId key", async () => {
    const prepared = await prepareSetlist(variant(fixtureHv1(), { versionId: "" }), leaveOutTapes);
    expect(prepared.setlistId).toBe(H_SETLIST_ID);
    expect("versionId" in prepared).toBe(false);
  });
});
