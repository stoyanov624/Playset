// Create or update — POST /api/setlists/:id/playlist (X12). Spotify is the routed fake behind
// the core's real services, so the request sequence and the core errors are the real ones.
import request from "supertest";
import { describe, expect, it } from "vitest";
import type { SetlistPlaylistRecord } from "../../../src/core/index.js";
import { createPlaylistResponseSchema } from "../../../src/web/shared/index.js";
import { expectCatalogueError } from "./fixtures/catalogue";
import {
  A,
  HOST_TOKEN,
  NOW_ISO,
  TODAY,
  answer,
  expectContract,
  expectNoLeaks,
  makeHarness,
  setlistFmNotFound,
  spotifyRateLimited,
  spotifyStatus,
  type Harness,
} from "./fixtures/harness";
import {
  BIG_ID,
  BIG_VERSION,
  FIXTURE_A_ID,
  H_ID,
  H_V1,
  H_V2,
  NEW_PLAYLIST_ID,
  NEW_SHARE_URL,
  PARTLY_ID,
  PARTLY_SHARE_URL,
  PLAYLIST_ID,
  SHARE_URL,
  fixtureHv2,
  tooLongDescription,
  variant,
} from "./fixtures/setlists";

const PATH = `/api/setlists/${H_ID}/playlist`;

const h1Record = (changes: Partial<SetlistPlaylistRecord> = {}): SetlistPlaylistRecord => ({
  setlistId: H_ID,
  playlistId: PLAYLIST_ID,
  shareUrl: SHARE_URL,
  versionId: H_V1,
  createdAt: "2026-11-27T18:04:05.000Z",
  ...changes,
});

async function withV1Record(): Promise<Harness> {
  const h = makeHarness({ setlists: { [H_ID]: fixtureHv2() } });
  await h.records.saveRecord(h1Record());
  return h;
}

// ---------------------------------------------------------------- AC-28: success

describe("POST /api/setlists/:id/playlist — created and updated (AC-28)", () => {
  it("AC-28: no record → 200 { url, status: created }; one created event; the record saved at g4bd1a2f6 with the clock's createdAt", async () => {
    const h = makeHarness();
    const res = await h.post(PATH, { versionId: H_V1 });
    expect(res.status).toBe(200);
    expect(String(res.headers["content-type"])).toMatch(/^application\/json/);
    expect(res.body).toStrictEqual({ url: SHARE_URL, status: "created" });
    expectContract(createPlaylistResponseSchema, res.body);
    expect(h.usage.recorded).toEqual([{ kind: "created", setlistId: H_ID, artist: "Pearl Jam", day: TODAY }]);
    expect(await h.records.findRecord(H_ID)).toEqual({
      setlistId: H_ID,
      playlistId: PLAYLIST_ID,
      shareUrl: SHARE_URL,
      versionId: H_V1,
      createdAt: NOW_ISO,
    });
    expect(h.setlistFmRequests().map((r) => r.url.pathname)).toEqual([`/rest/1.0/setlist/${H_ID}`]);
    expect(h.playlistCalls()).toEqual(["POST /v1/me/playlists", `POST /v1/playlists/${PLAYLIST_ID}/items`]);
    expect(h.playlistRequests().every((r) => r.headers.get("Authorization") === `Bearer ${HOST_TOKEN}`)).toBe(true);
    expect(h.host.asked).toBe(1);
    expectNoLeaks(res);
  });

  it("AC-28: a success answer has exactly url and status (no playlistId, trackCount or name)", async () => {
    const h = makeHarness();
    const res = await h.post(PATH, { versionId: H_V1 });
    expect(Object.keys(res.body as object).sort()).toEqual(["status", "url"]);
    for (const key of ['"playlistId"', '"trackCount"', '"name"']) expect(res.text).not.toContain(key);
  });

  it("AC-28: record at g4bd1a2f6, H v2 fetched, body g2b5e7c19 → 200 updated, same url; one updated event; record at g2b5e7c19", async () => {
    const h = await withV1Record();
    const res = await h.post(PATH, { versionId: H_V2 });
    expect(res.status).toBe(200);
    expect(res.body).toStrictEqual({ url: SHARE_URL, status: "updated" });
    expect(h.usage.recorded).toEqual([{ kind: "updated", setlistId: H_ID, artist: "Pearl Jam", day: TODAY }]);
    expect((await h.records.findRecord(H_ID))?.versionId).toBe(H_V2);
    expect(h.playlistCalls()).toEqual([`PUT /v1/playlists/${PLAYLIST_ID}/items`, `PUT /v1/playlists/${PLAYLIST_ID}`]);
  });

  it("AC-28: the recorded playlist was deleted in Spotify → 200 created with the new playlist's url; record replaced", async () => {
    const h = await withV1Record();
    h.spotify.deleted.add(PLAYLIST_ID);
    h.spotify.createdIds.splice(0, h.spotify.createdIds.length, NEW_PLAYLIST_ID);
    const res = await h.post(PATH, { versionId: H_V2 });
    expect(res.status).toBe(200);
    expect(res.body).toStrictEqual({ url: NEW_SHARE_URL, status: "created" });
    expect(h.usage.recorded).toEqual([{ kind: "created", setlistId: H_ID, artist: "Pearl Jam", day: TODAY }]);
    expect(await h.records.findRecord(H_ID)).toEqual({
      setlistId: H_ID,
      playlistId: NEW_PLAYLIST_ID,
      shareUrl: NEW_SHARE_URL,
      versionId: H_V2,
      createdAt: NOW_ISO,
    });
  });

  it("AC-28: an upper-case :id is used in lower case", async () => {
    const h = makeHarness();
    const res = await h.post("/api/setlists/2BF1C8E4/playlist", { versionId: H_V1 });
    expect(res.status).toBe(200);
    expect(h.usage.recorded[0]?.setlistId).toBe(H_ID);
  });
});

// ---------------------------------------------------------------- AC-28: errors

describe("POST /api/setlists/:id/playlist — core errors (AC-28)", () => {
  it("AC-28: H v2 fetched, body g4bd1a2f6 → 409 E-24; no Spotify request, no event, record unchanged", async () => {
    const h = await withV1Record();
    const res = await h.post(PATH, { versionId: H_V1 });
    expectCatalogueError(res, "E-24");
    expect(h.spotifyRequests()).toEqual([]);
    expect(h.usage.recorded).toEqual([]);
    expect(await h.records.findRecord(H_ID)).toEqual(h1Record());
    expect(h.log.of("error")).toEqual([]);
    expectNoLeaks(res);
  });

  it("AC-28: every Match search a Miss → 400 E-7; no event", async () => {
    const h = makeHarness();
    h.spotify.tracks = {};
    const res = await h.post(PATH, { versionId: H_V1 });
    expectCatalogueError(res, "E-7");
    expect(h.usage.recorded).toEqual([]);
    expect(await h.records.findRecord(H_ID)).toBeUndefined();
    expectNoLeaks(res);
  });

  it("AC-28: the replace answers 500 → 502 E-17; no event; record unchanged", async () => {
    const h = await withV1Record();
    h.spotify.playlistAnswers[0] = spotifyStatus(500);
    const res = await h.post(PATH, { versionId: H_V2 });
    expectCatalogueError(res, "E-17");
    expect(h.usage.recorded).toEqual([]);
    expect(await h.records.findRecord(H_ID)).toEqual(h1Record());
    expectNoLeaks(res);
  });

  it("AC-28: the replace answers 401 → 503 E-23; no event; record unchanged", async () => {
    const h = await withV1Record();
    h.spotify.playlistAnswers[0] = spotifyStatus(401, "The access token expired");
    const res = await h.post(PATH, { versionId: H_V2 });
    expectCatalogueError(res, "E-23");
    expect(h.usage.recorded).toEqual([]);
    expect(await h.records.findRecord(H_ID)).toEqual(h1Record());
  });

  it("AC-28: the replace answers 429 four times → 429 E-15 with Retry-After: 60; the hit counter does not rise", async () => {
    const h = await withV1Record();
    for (let i = 0; i < 4; i++) h.spotify.playlistAnswers[i] = spotifyRateLimited;
    const res = await h.post(PATH, { versionId: H_V2 });
    expectCatalogueError(res, "E-15");
    expect(h.usage.recorded).toEqual([]);
    expect(h.hits.added).toEqual([]);
    expect(await h.records.findRecord(H_ID)).toEqual(h1Record());
  });

  it("AC-28: the rename answers 404 (partly updated) → 502 E-19; no event; record unchanged", async () => {
    const h = await withV1Record();
    h.spotify.playlistAnswers[1] = spotifyStatus(404, "Resource not found");
    const res = await h.post(PATH, { versionId: H_V2 });
    expectCatalogueError(res, "E-19");
    expect(h.usage.recorded).toEqual([]);
    expect(await h.records.findRecord(H_ID)).toEqual(h1Record());
    expectNoLeaks(res);
  });

  it("AC-28: 230 Matches, batch 2 answers 400 (partly created) → 502 E-18; no event; the record kept with versionId null", async () => {
    const h = makeHarness();
    h.spotify.createdIds.splice(0, h.spotify.createdIds.length, PARTLY_ID);
    h.spotify.playlistAnswers[2] = spotifyStatus(400, "Invalid base62 id");
    const res = await h.post(`/api/setlists/${BIG_ID}/playlist`, { versionId: BIG_VERSION });
    expectCatalogueError(res, "E-18");
    expect(h.usage.recorded).toEqual([]);
    expect(await h.records.findRecord(BIG_ID)).toEqual({
      setlistId: BIG_ID,
      playlistId: PARTLY_ID,
      shareUrl: PARTLY_SHARE_URL,
      versionId: null,
      createdAt: NOW_ISO,
    });
    expect(res.text).not.toContain(PARTLY_ID);
  }, 20_000);

  it("AC-28: the create answers 403 → 502 E-17; no event, no record", async () => {
    const h = makeHarness();
    h.spotify.playlistAnswers[0] = spotifyStatus(403, "Insufficient client scope");
    const res = await h.post(PATH, { versionId: H_V1 });
    expectCatalogueError(res, "E-17");
    expect(h.usage.recorded).toEqual([]);
    expect(await h.records.findRecord(H_ID)).toBeUndefined();
  });

  it("AC-28: a Spotify network failure on the create → 502 E-17", async () => {
    const h = makeHarness();
    h.spotify.playlistAnswers[0] = () =>
      Promise.reject(Object.assign(new TypeError("fetch failed"), { cause: new Error("read ECONNRESET") }));
    const res = await h.post(PATH, { versionId: H_V1 });
    expectCatalogueError(res, "E-17");
  });

  it("AC-28: a Spotify search error while matching (HTTP 500) → 502 E-17", async () => {
    const h = makeHarness();
    h.spotify.failSearch.Release = spotifyStatus(500);
    const res = await h.post(PATH, { versionId: H_V1 });
    expectCatalogueError(res, "E-17");
    expect(h.usage.recorded).toEqual([]);
  });

  it("AC-28: setlist.fm has no such Setlist → 404 E-9; no event", async () => {
    const h = makeHarness({ setlists: { [H_ID]: setlistFmNotFound } });
    const res = await h.post(PATH, { versionId: H_V1 });
    expectCatalogueError(res, "E-9");
    expect(h.usage.recorded).toEqual([]);
  });

  it("AC-28: the setlist.fm rate-limit error → 429 E-14; a setlist.fm 503 → 502 E-16", async () => {
    const limited = makeHarness({
      setlists: { [H_ID]: answer(429, { code: 429, status: "Too Many Requests" }, { "Retry-After": "1" }) },
    });
    expectCatalogueError(await limited.post(PATH, { versionId: H_V1 }), "E-14");
    expect(limited.hits.added).toEqual([]);
    const down = makeHarness({ setlists: { [H_ID]: answer(503, { code: 503, status: "Service Unavailable" }) } });
    expectCatalogueError(await down.post(PATH, { versionId: H_V1 }), "E-16");
  });

  it("AC-28: Fixture A (no version) fetched for 63a5e2b7 → 502 E-20; no event", async () => {
    const h = makeHarness();
    const res = await h.post(`/api/setlists/${FIXTURE_A_ID}/playlist`, { versionId: "g6bd2a6f2" });
    expectCatalogueError(res, "E-20");
    expect(h.usage.recorded).toEqual([]);
    expect(h.spotifyRequests()).toEqual([]);
  });

  it("AC-28: a description that would be too long → 400 E-8; no event", async () => {
    const h = makeHarness({ setlists: { [FIXTURE_A_ID]: variant(tooLongDescription(), { versionId: "g6bd2a6f2" }) } });
    const res = await h.post(`/api/setlists/${FIXTURE_A_ID}/playlist`, { versionId: "g6bd2a6f2" });
    expectCatalogueError(res, "E-8");
    expect(h.usage.recorded).toEqual([]);
    expectNoLeaks(res);
  });

  it("AC-28: any other error → 500 E-25; no event", async () => {
    const h = makeHarness();
    h.overrides.getSetlist = async () => {
      throw new Error("boom");
    };
    const res = await h.post(PATH, { versionId: H_V1 });
    expectCatalogueError(res, "E-25");
    expect(h.usage.recorded).toEqual([]);
  });
});

// ---------------------------------------------------------------- AC-27

describe("POST /api/setlists/:id/playlist — checks first (AC-27)", () => {
  it.each([
    ["{}", {}],
    ['{"versionId":""}', { versionId: "" }],
    ['{"versionId":"g4bd 1a2f6"}', { versionId: "g4bd 1a2f6" }],
    ['{"versionId":"g4bd1a2f6","public":false}', { versionId: "g4bd1a2f6", public: false }],
    ['["g4bd1a2f6"]', ["g4bd1a2f6"]],
    ["a version of 65 characters", { versionId: "g".repeat(65) }],
    ["a numeric version", { versionId: 4 }],
  ])("AC-27: body %s → 400 E-5; no step, no Host token, nothing counted", async (_why, body) => {
    const h = makeHarness({ env: { PLAYSET_CREATE_LIMIT: "1" } });
    const res = await h.post(PATH, body);
    expectCatalogueError(res, "E-5");
    expect(h.host.asked).toBe(0);
    expect(h.http.requests).toEqual([]);
    expectNoLeaks(res);
    expect((await h.post(PATH, { versionId: H_V1 })).status).toBe(200);
  });

  it("AC-27: no body at all → 400 E-5", async () => {
    const h = makeHarness();
    const res = await request(h.app).post(PATH).set("X-Forwarded-For", A);
    expectCatalogueError(res, "E-5");
  });

  it("AC-27: an invalid :id → 400 E-4 before the body is looked at; no Host token asked", async () => {
    const h = makeHarness();
    const res = await h.post("/api/setlists/63a5e2bz/playlist", {});
    expectCatalogueError(res, "E-4");
    expect(h.host.asked).toBe(0);
    expect(h.http.requests).toEqual([]);
  });

  it("AC-27: a valid version keeps its case (an opaque value): G4BD1A2F6 is not g4bd1a2f6 → E-24", async () => {
    const h = makeHarness();
    const res = await h.post(PATH, { versionId: "G4BD1A2F6" });
    expectCatalogueError(res, "E-24");
  });
});

// ---------------------------------------------------------------- AC-28: recording the usage event fails

describe("POST /api/setlists/:id/playlist — the usage event can't be recorded (AC-28)", () => {
  const failingEvents = () => ({
    async recordEvent(): Promise<void> {
      throw new Error("SQLITE_BUSY: database is locked");
    },
    async countPlaylistsMade(): Promise<number> {
      return 0;
    },
  });

  it("AC-28: created, then recordEvent rejects → still 200 { url, status: created }; one warning, no error", async () => {
    const h = makeHarness({ events: failingEvents() });
    const res = await h.post(PATH, { versionId: H_V1 });
    expect(res.status).toBe(200);
    expect(res.body).toStrictEqual({ url: SHARE_URL, status: "created" });
    expect((await h.records.findRecord(H_ID))?.playlistId).toBe(PLAYLIST_ID);
    expect(h.log.of("warn")).toHaveLength(1);
    expect(h.log.of("error")).toEqual([]);
    expectNoLeaks(res);
  });

  it("AC-28: updated, then recordEvent rejects → still 200 { url, status: updated }; one warning, no error", async () => {
    const h = makeHarness({ setlists: { [H_ID]: fixtureHv2() }, events: failingEvents() });
    await h.records.saveRecord(h1Record());
    const res = await h.post(PATH, { versionId: H_V2 });
    expect(res.status).toBe(200);
    expect(res.body).toStrictEqual({ url: SHARE_URL, status: "updated" });
    expect(h.log.of("warn")).toHaveLength(1);
    expect(h.log.of("error")).toEqual([]);
  });
});
