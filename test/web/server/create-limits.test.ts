// Create/update limits (X13): per address per hour, per day, and the rate-limit hit counter.
import { describe, expect, it } from "vitest";
import { expectCatalogueError } from "./fixtures/catalogue";
import { A, B, C, HOST_TOKEN, TODAY, expectNoLeaks, makeFakeEvents, makeHarness, spotifyStatus } from "./fixtures/harness";
import { H_ID, H_V1, H_V2, MADRID_ID, MADRID_VERSION, NIRVANA_ID, NIRVANA_VERSION, SHARE_URL, fixtureHv2 } from "./fixtures/setlists";

const create = (id: string, versionId: string) => ({ path: `/api/setlists/${id}/playlist`, body: { versionId } });
const H_V1_CREATE = create(H_ID, H_V1);
const MADRID_CREATE = create(MADRID_ID, MADRID_VERSION);
const NIRVANA_CREATE = create(NIRVANA_ID, NIRVANA_VERSION);

describe("X13 — create limits through one day (AC-29, AC-30, AC-32, AC-16)", () => {
  it("AC-29, AC-30, AC-32: PLAYSET_CREATE_LIMIT=2, PLAYSET_DAILY_LIMIT=3", async () => {
    const h = makeHarness({ env: { PLAYSET_CREATE_LIMIT: "2", PLAYSET_DAILY_LIMIT: "3" } });

    h.clock.set("2026-11-28T14:00:00.000Z");
    let res = await h.post(H_V1_CREATE.path, H_V1_CREATE.body, A);
    expect(res.status).toBe(200);
    expect(res.body).toStrictEqual({ url: SHARE_URL, status: "created" });

    h.clock.set("2026-11-28T14:20:00.000Z");
    h.setlists[H_ID] = fixtureHv2();
    res = await h.post(`/api/setlists/${H_ID}/playlist`, { versionId: H_V2 }, A);
    expect(res.status).toBe(200);
    expect(res.body).toStrictEqual({ url: SHARE_URL, status: "updated" });

    h.clock.set("2026-11-28T14:30:00.000Z");
    const setlistFmBefore = h.setlistFmRequests().length;
    res = await h.post(MADRID_CREATE.path, MADRID_CREATE.body, A);
    expectCatalogueError(res, "E-12", 1800);
    expect(h.setlistFmRequests().length).toBe(setlistFmBefore);
    expectNoLeaks(res);

    h.spotify.playlistAnswers[h.playlistRequests().length] = spotifyStatus(500);
    res = await h.post(MADRID_CREATE.path, MADRID_CREATE.body, B);
    expectCatalogueError(res, "E-17");

    res = await h.post(MADRID_CREATE.path, MADRID_CREATE.body, B);
    expect(res.status).toBe(200);
    expect((res.body as { status: string }).status).toBe("created");
    expect(await h.usage.events.countPlaylistsMade(TODAY)).toBe(3);

    const nirvanaBefore = h.setlistFmRequests().length;
    res = await h.post(NIRVANA_CREATE.path, NIRVANA_CREATE.body, C);
    expectCatalogueError(res, "E-13", 34200);
    expect(h.setlistFmRequests().length).toBe(nirvanaBefore);
    expectNoLeaks(res);

    // Opening a current playlist still works and is no playlist made.
    const open = await h.get(`/api/setlists/${H_ID}`, B);
    expect(open.status).toBe(200);
    expect((open.body as { playlist: unknown }).playlist).toStrictEqual({ status: "current", url: SHARE_URL });
    expect(await h.usage.events.countPlaylistsMade(TODAY)).toBe(3);
    expect(h.usage.recorded.map((e) => e.kind)).toEqual(["created", "updated", "created", "opened"]);

    expect(h.hits.count(TODAY)).toBe(2);
    expect(h.hits.added).toEqual([TODAY, TODAY]);

    // B has 2 counted (the failed create counts too).
    expectCatalogueError(await h.post(H_V1_CREATE.path, { versionId: H_V2 }, B), "E-12", 3600);

    h.clock.set("2026-11-29T00:00:00.000Z");
    res = await h.post(NIRVANA_CREATE.path, NIRVANA_CREATE.body, C);
    expect(res.status).toBe(200);
    expect((res.body as { status: string }).status).toBe("created");
    expect(h.usage.recorded.at(-1)).toEqual({ kind: "created", setlistId: NIRVANA_ID, artist: "Nirvana", day: "2026-11-29" });
    expect(await h.usage.events.countPlaylistsMade("2026-11-29")).toBe(1);
  }, 20_000);
});

describe("the per-address create/update limit (AC-29)", () => {
  it("AC-29: Retry-After is rounded up: oldest at 13:30:00.900, asked at 14:30:00.400 → Retry-After: 1", async () => {
    const h = makeHarness({ env: { PLAYSET_CREATE_LIMIT: "1" } });
    h.clock.set("2026-11-28T13:30:00.900Z");
    expect((await h.post(H_V1_CREATE.path, H_V1_CREATE.body)).status).toBe(200);
    h.clock.set("2026-11-28T14:30:00.400Z");
    expectCatalogueError(await h.post(H_V1_CREATE.path, H_V1_CREATE.body), "E-12", 1);
    h.clock.set("2026-11-28T14:30:00.900Z");
    expect((await h.post(H_V1_CREATE.path, H_V1_CREATE.body)).status).toBe(200);
  });

  it("AC-29: a refused request sends nothing and counts nothing more; other addresses are not affected", async () => {
    const h = makeHarness({ env: { PLAYSET_CREATE_LIMIT: "1" } });
    h.clock.set("2026-11-28T14:00:00.000Z");
    expect((await h.post(H_V1_CREATE.path, H_V1_CREATE.body, A)).status).toBe(200);
    const before = h.http.requests.length;
    h.clock.set("2026-11-28T14:30:00.000Z");
    for (let i = 0; i < 5; i++) expectCatalogueError(await h.post(MADRID_CREATE.path, MADRID_CREATE.body, A), "E-12", 1800);
    expect(h.http.requests.length).toBe(before);
    // Refusals don't extend the window: at 15:00:00 A is admitted again.
    h.clock.set("2026-11-28T15:00:00.000Z");
    expect((await h.post(MADRID_CREATE.path, MADRID_CREATE.body, A)).status).toBe(200);
    expect((await h.post(NIRVANA_CREATE.path, NIRVANA_CREATE.body, B)).status).toBe(200);
    expect(h.hits.count(TODAY)).toBe(5);
  });

  it("AC-29: an admitted request counts whatever its outcome (a Setlist-changed answer counts)", async () => {
    const h = makeHarness({ env: { PLAYSET_CREATE_LIMIT: "1" } });
    expectCatalogueError(await h.post(H_V1_CREATE.path, { versionId: H_V2 }), "E-24");
    expectCatalogueError(await h.post(H_V1_CREATE.path, H_V1_CREATE.body), "E-12", 3600);
  });

  it("AC-27: the per-address limit is checked before the daily limit", async () => {
    const h = makeHarness({ env: { PLAYSET_CREATE_LIMIT: "1", PLAYSET_DAILY_LIMIT: "1" } });
    expect((await h.post(H_V1_CREATE.path, H_V1_CREATE.body, A)).status).toBe(200);
    expectCatalogueError(await h.post(MADRID_CREATE.path, MADRID_CREATE.body, A), "E-12", 3600);
    expectCatalogueError(await h.post(MADRID_CREATE.path, MADRID_CREATE.body, B), "E-13", 34200);
  });

  it("AC-27: not connected is answered before any limit (A at its limit gets E-23, and nothing is counted)", async () => {
    const h = makeHarness({ env: { PLAYSET_CREATE_LIMIT: "1" } });
    expect((await h.post(H_V1_CREATE.path, H_V1_CREATE.body, A)).status).toBe(200);
    h.host.mode = { kind: "absent" };
    expectCatalogueError(await h.post(MADRID_CREATE.path, MADRID_CREATE.body, A), "E-23");
    expect(h.hits.added).toEqual([]);
    h.host.mode = { kind: "connected", token: HOST_TOKEN };
    expectCatalogueError(await h.post(MADRID_CREATE.path, MADRID_CREATE.body, A), "E-12", 3600);
  });
});

describe("the daily limit (AC-30)", () => {
  it("AC-30: a request refused by the daily limit is not counted against its address", async () => {
    const h = makeHarness({ env: { PLAYSET_CREATE_LIMIT: "1", PLAYSET_DAILY_LIMIT: "1" } });
    h.clock.set("2026-11-28T23:30:00.000Z");
    expect((await h.post(H_V1_CREATE.path, H_V1_CREATE.body, A)).status).toBe(200);
    h.clock.set("2026-11-28T23:40:00.000Z");
    expectCatalogueError(await h.post(MADRID_CREATE.path, MADRID_CREATE.body, C), "E-13", 1200);
    h.clock.set("2026-11-29T00:10:00.000Z");
    expect((await h.post(MADRID_CREATE.path, MADRID_CREATE.body, C)).status).toBe(200);
  });

  it("AC-30: Retry-After until the next 00:00 UTC is at least 1 (asked at 23:59:59.500)", async () => {
    const events = makeFakeEvents();
    await events.events.recordEvent({ kind: "created", setlistId: "1bd5a2c8", artist: "Guns N' Roses", day: TODAY });
    const h = makeHarness({ env: { PLAYSET_DAILY_LIMIT: "1" }, events: events.events, now: "2026-11-28T23:59:59.500Z" });
    expectCatalogueError(await h.post(H_V1_CREATE.path, H_V1_CREATE.body), "E-13", 1);
    expect(h.http.requests).toEqual([]);
  });

  it("AC-30: playlists made today come from the usage events: created and updated count, opens and other days don't", async () => {
    const events = makeFakeEvents();
    for (let i = 0; i < 40; i++) {
      await events.events.recordEvent({ kind: "opened", setlistId: H_ID, artist: "Pearl Jam", day: TODAY });
    }
    await events.events.recordEvent({ kind: "created", setlistId: "1bd5a2c8", artist: "Guns N' Roses", day: "2026-11-27" });
    await events.events.recordEvent({ kind: "updated", setlistId: "1bd5a2c8", artist: "Guns N' Roses", day: TODAY });
    const h = makeHarness({ env: { PLAYSET_DAILY_LIMIT: "2" }, events: events.events });
    expect((await h.post(H_V1_CREATE.path, H_V1_CREATE.body, A)).status).toBe(200);
    expectCatalogueError(await h.post(MADRID_CREATE.path, MADRID_CREATE.body, B), "E-13", 34200);
    expect(h.hits.count(TODAY)).toBe(1);
  });

  it("AC-30: the daily limit applies to every address alike", async () => {
    const h = makeHarness({ env: { PLAYSET_DAILY_LIMIT: "1" } });
    expect((await h.post(H_V1_CREATE.path, H_V1_CREATE.body, A)).status).toBe(200);
    for (const address of [A, B, C]) {
      expectCatalogueError(await h.post(MADRID_CREATE.path, MADRID_CREATE.body, address), "E-13", 34200);
    }
    expect(h.hits.count(TODAY)).toBe(3);
  });
});

describe("the rate-limit hit counter (AC-32)", () => {
  it("AC-32: only Playset's own limits raise it, under today's UTC day; upstream 429s don't", async () => {
    const h = makeHarness({ env: { PLAYSET_PREVIEW_LIMIT: "1", PLAYSET_CREATE_LIMIT: "1" } });
    h.setlists[MADRID_ID] = () =>
      new Response(JSON.stringify({ code: 429 }), { status: 429, headers: { "Content-Type": "application/json", "Retry-After": "1" } });
    expectCatalogueError(await h.get(`/api/setlists/${MADRID_ID}`), "E-14");
    expectCatalogueError(await h.post(MADRID_CREATE.path, MADRID_CREATE.body), "E-14");
    expect(h.hits.added).toEqual([]);
    expectCatalogueError(await h.post(H_V1_CREATE.path, H_V1_CREATE.body), "E-12", 3600);
    expect(h.hits.added).toEqual([TODAY]);
  });

  it("AC-32: a new app starts with empty windows (nothing is shared between two apps)", async () => {
    const first = makeHarness({ env: { PLAYSET_CREATE_LIMIT: "1" } });
    expect((await first.post(H_V1_CREATE.path, H_V1_CREATE.body)).status).toBe(200);
    expectCatalogueError(await first.post(H_V1_CREATE.path, H_V1_CREATE.body), "E-12", 3600);
    const second = makeHarness({ env: { PLAYSET_CREATE_LIMIT: "1" } });
    expect((await second.post(H_V1_CREATE.path, H_V1_CREATE.body)).status).toBe(200);
  });
});
