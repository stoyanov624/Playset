// Setlist status — GET /api/setlists/:id (X7) — and opens.
import { describe, expect, it } from "vitest";
import type { SetlistPlaylistRecord } from "../../../src/core/index.js";
import { setlistResponseSchema } from "../../../src/web/shared/index.js";
import { expectCatalogueError } from "./fixtures/catalogue";
import {
  TODAY,
  expectContract,
  expectNoLeaks,
  makeFakeEvents,
  makeHarness,
  networkFailure,
  setlistFmNotFound,
  setlistFmRateLimited,
} from "./fixtures/harness";
import {
  FIXTURE_A_ID,
  H_ID,
  H_URL,
  H_V1,
  H_V1_SHOW,
  H_V2,
  H_V2_SHOW,
  PLAYLIST_ID,
  SHARE_URL,
  fixtureHv1,
  fixtureHv2,
  tooLongDescription,
  variant,
} from "./fixtures/setlists";

const record = (versionId: string | null): SetlistPlaylistRecord => ({
  setlistId: H_ID,
  playlistId: PLAYLIST_ID,
  shareUrl: SHARE_URL,
  versionId,
  createdAt: "2026-11-27T18:04:05.000Z",
});

const INCOMPLETE_1 = { isIncomplete: true, unknownSongCount: 1 };

async function harnessWithRecord(versionId: string | null | undefined) {
  const h = makeHarness();
  if (versionId !== undefined) await h.records.saveRecord(record(versionId));
  return h;
}

// ---------------------------------------------------------------- AC-15, AC-16

describe("GET /api/setlists/:id — the Show and its playlist (AC-15)", () => {
  it("AC-15, AC-16: a record of this version → 200 X7's full answer, status current; one open recorded", async () => {
    const h = await harnessWithRecord(H_V1);
    const res = await h.get(`/api/setlists/${H_ID}`);
    expect(res.status).toBe(200);
    expect(String(res.headers["content-type"])).toMatch(/^application\/json/);
    expect(res.body).toStrictEqual({
      show: H_V1_SHOW,
      incompleteStatus: INCOMPLETE_1,
      playlist: { status: "current", url: SHARE_URL },
    });
    expectContract(setlistResponseSchema, res.body);
    expect(h.usage.recorded).toEqual([{ kind: "opened", setlistId: H_ID, artist: "Pearl Jam", day: TODAY }]);
    expect(h.setlistFmRequests().map((r) => r.url.pathname)).toEqual([`/rest/1.0/setlist/${H_ID}`]);
    expect(h.spotifyRequests()).toEqual([]);
    expect(h.host.asked).toBe(0);
    expect(res.text).not.toContain("playlistId");
    expect(res.text).not.toContain("createdAt");
    expectNoLeaks(res);
  });

  it.each([
    ["no record", undefined, { status: "none" }],
    ["a record of another version", H_V2, { status: "outdated", url: SHARE_URL }],
    ["a record of no version", null, { status: "outdated", url: SHARE_URL }],
  ] as const)("AC-15, AC-16: %s → playlist %j; no usage event", async (_why, versionId, playlist) => {
    const h = await harnessWithRecord(versionId);
    const res = await h.get(`/api/setlists/${H_ID}`);
    expect(res.status).toBe(200);
    expect(res.body).toStrictEqual({ show: H_V1_SHOW, incompleteStatus: INCOMPLETE_1, playlist });
    expectContract(setlistResponseSchema, res.body);
    expect(h.usage.recorded).toEqual([]);
    expect(h.spotifyRequests()).toEqual([]);
    expect(h.host.asked).toBe(0);
    expectNoLeaks(res);
  });

  it("AC-15: H v2 (with the Tape Master/Slave) is prepared with no Tape question; its Show is v2's and the v1 record is outdated", async () => {
    const h = await harnessWithRecord(H_V1);
    h.setlists[H_ID] = fixtureHv2();
    const res = await h.get(`/api/setlists/${H_ID}`);
    expect(res.status).toBe(200);
    expect(res.body).toStrictEqual({
      show: H_V2_SHOW,
      incompleteStatus: { isIncomplete: false, unknownSongCount: 0 },
      playlist: { status: "outdated", url: SHARE_URL },
    });
    expect(res.text).not.toContain("Master/Slave");
  });

  it.each([
    ["no record", undefined, { status: "none" }],
    ["a record of g4bd1a2f6", H_V1, { status: "outdated", url: SHARE_URL }],
    ["a record of no version", null, { status: "outdated", url: SHARE_URL }],
  ] as const)("AC-15: Fixture H v1 without a version, %s → %j (never current), no open", async (_why, versionId, playlist) => {
    const h = await harnessWithRecord(versionId);
    h.setlists[H_ID] = variant(fixtureHv1(), { versionId: undefined });
    const res = await h.get(`/api/setlists/${H_ID}`);
    expect(res.status).toBe(200);
    expect(res.body).toStrictEqual({ show: H_V1_SHOW, incompleteStatus: INCOMPLETE_1, playlist });
    expect(h.usage.recorded).toEqual([]);
  });

  it("AC-15: an upper-case id is read in lower case", async () => {
    const h = await harnessWithRecord(H_V1);
    const res = await h.get("/api/setlists/2BF1C8E4");
    expect(res.status).toBe(200);
    expect(h.setlistFmRequests().map((r) => r.url.pathname)).toEqual([`/rest/1.0/setlist/${H_ID}`]);
    expect(h.usage.recorded).toEqual([{ kind: "opened", setlistId: H_ID, artist: "Pearl Jam", day: TODAY }]);
  });

  it("AC-15: the incomplete status is passed on field by field (a note-only Incomplete Setlist)", async () => {
    const h = makeHarness();
    h.setlists[H_ID] = variant(fixtureHv1(), {
      info: "Show cut short after a power outage.",
      sets: { set: [{ song: [{ name: "Release" }, { name: "Corduroy" }] }] },
    });
    const res = await h.get(`/api/setlists/${H_ID}`);
    expect(res.status).toBe(200);
    expect((res.body as { incompleteStatus: unknown }).incompleteStatus).toStrictEqual({
      isIncomplete: true,
      unknownSongCount: 0,
      matchedPhrase: "cut short",
      setlistNote: "Show cut short after a power outage.",
    });
  });
});

describe("opens (AC-16)", () => {
  it("AC-16: three status requests on a current record → three opens, none counted as playlists made", async () => {
    const h = await harnessWithRecord(H_V1);
    for (let i = 0; i < 3; i++) expect((await h.get(`/api/setlists/${H_ID}`)).status).toBe(200);
    expect(h.usage.recorded).toEqual(
      Array.from({ length: 3 }, () => ({ kind: "opened", setlistId: H_ID, artist: "Pearl Jam", day: TODAY })),
    );
    expect(await h.usage.events.countPlaylistsMade(TODAY)).toBe(0);
    expect(h.hits.added).toEqual([]);
  });

  it("AC-16: opens are never rate-limited (50 opens from one address with every limit at 1)", async () => {
    const h = makeHarness({ env: { PLAYSET_PREVIEW_LIMIT: "1", PLAYSET_CREATE_LIMIT: "1", PLAYSET_DAILY_LIMIT: "1" } });
    await h.records.saveRecord(record(H_V1));
    for (let i = 0; i < 50; i++) expect((await h.get(`/api/setlists/${H_ID}`)).status).toBe(200);
    expect(h.usage.recorded).toHaveLength(50);
    expect(h.hits.added).toEqual([]);
  });

  it("AC-16: the open's day is the UTC day of the clock", async () => {
    const h = makeHarness({ now: "2026-11-28T23:59:59.999Z" });
    await h.records.saveRecord(record(H_V1));
    await h.get(`/api/setlists/${H_ID}`);
    h.clock.set("2026-11-29T00:00:00.000Z");
    await h.get(`/api/setlists/${H_ID}`);
    expect(h.usage.recorded.map((e) => e.day)).toEqual(["2026-11-28", "2026-11-29"]);
  });

  it("AC-16: an error answer records no event", async () => {
    const h = await harnessWithRecord(H_V1);
    h.setlists[H_ID] = setlistFmNotFound;
    const res = await h.get(`/api/setlists/${H_ID}`);
    expect(res.status).toBe(404);
    expect(h.usage.recorded).toEqual([]);
  });
});

// ---------------------------------------------------------------- AC-17

describe("GET /api/setlists/:id — invalid input and errors (AC-17)", () => {
  it.each([
    ["a non-hex id", "/api/setlists/63a5e2bz"],
    ["an id with .html", "/api/setlists/73A1B2C5.html"],
    ["an id of 33 characters", `/api/setlists/${"a".repeat(33)}`],
  ])("AC-17: %s → 400 E-4; no request", async (_why, path) => {
    const h = makeHarness();
    const res = await h.get(path);
    expectCatalogueError(res, "E-4");
    expect(h.http.requests).toEqual([]);
    expect(h.usage.recorded).toEqual([]);
    expectNoLeaks(res);
  });

  it("AC-17: setlist.fm has no such Setlist (00000000) → 404 E-9", async () => {
    const h = makeHarness();
    const res = await h.get("/api/setlists/00000000");
    expectCatalogueError(res, "E-9");
    expect(h.log.of("error")).toEqual([]);
    expectNoLeaks(res);
  });

  it("AC-17: the setlist.fm rate-limit error → 429 E-14, Retry-After: 60", async () => {
    const h = makeHarness({ setlists: { [H_ID]: setlistFmRateLimited } });
    const res = await h.get(`/api/setlists/${H_ID}`);
    expectCatalogueError(res, "E-14");
    expect(h.hits.added).toEqual([]);
    expectNoLeaks(res);
  });

  it("AC-17: a setlist.fm network failure → 502 E-16", async () => {
    const h = makeHarness({ setlists: { [H_ID]: networkFailure } });
    const res = await h.get(`/api/setlists/${H_ID}`);
    expectCatalogueError(res, "E-16");
    expectNoLeaks(res);
  });

  it("AC-17: a Setlist whose description would be 301 characters → 400 E-8", async () => {
    const h = makeHarness({ setlists: { [FIXTURE_A_ID]: tooLongDescription() } });
    const res = await h.get(`/api/setlists/${FIXTURE_A_ID}`);
    expectCatalogueError(res, "E-8");
    expectNoLeaks(res);
  });

  it("AC-17: any other error → 500 E-25", async () => {
    const h = makeHarness();
    h.overrides.getSetlist = async () => {
      throw new Error("boom");
    };
    const res = await h.get(`/api/setlists/${H_ID}`);
    expectCatalogueError(res, "E-25");
    expectNoLeaks(res);
  });

  it("AC-17: the missing-setlist.fm-key error → 500 E-25", async () => {
    const h = makeHarness({ setlistFmKey: null });
    const res = await h.get(`/api/setlists/${H_ID}`);
    expectCatalogueError(res, "E-25");
    expectNoLeaks(res);
  });

  it("AC-15: the Show's url is the prepared Show's setlist.fm link", async () => {
    const h = makeHarness();
    const res = await h.get(`/api/setlists/${H_ID}`);
    expect((res.body as { show: { url: string } }).show.url).toBe(H_URL);
  });
});

describe("opens when saving the event fails (AC-16)", () => {
  it("AC-16: when saving the opened event fails, the status answer is still 200 with the current link, and one warning is logged", async () => {
    const fake = makeFakeEvents();
    const events = {
      async recordEvent(event: Parameters<typeof fake.events.recordEvent>[0]): Promise<void> {
        if (event.kind === "opened") throw new Error("SQLITE_BUSY: database is locked");
        return fake.events.recordEvent(event);
      },
      countPlaylistsMade: fake.events.countPlaylistsMade,
    };
    const h = makeHarness({ events });
    await h.records.saveRecord(record(H_V1));
    const res = await h.get(`/api/setlists/${H_ID}`);
    expect(res.status).toBe(200);
    expect(res.body).toStrictEqual({
      show: H_V1_SHOW,
      incompleteStatus: INCOMPLETE_1,
      playlist: { status: "current", url: SHARE_URL },
    });
    expectContract(setlistResponseSchema, res.body);
    expect(fake.recorded).toEqual([]);
    expect(h.log.of("warn")).toHaveLength(1);
    expect(h.log.of("error")).toEqual([]);
    expectNoLeaks(res);
    expectNoLeaks(h.log.allText());
  });
});
