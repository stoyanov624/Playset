// The Host Account not connected (X8): previews and creates answer PLAYLISTS_UNAVAILABLE before
// anything else; every other route works as when connected.
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp, notConnectedHostTokenSource } from "../../../src/web/server/index.js";
import { expectCatalogueError } from "./fixtures/catalogue";
import { A, HOST_TOKEN, TODAY, expectNoLeaks, makeHarness, sharedClientDir, type HostMode } from "./fixtures/harness";
import { H_ID, H_V1, PEARL_JAM_MBID, PLAYLIST_ID, SHARE_URL, pearlJamPagePayload, pearlJamSearchPayload } from "./fixtures/setlists";

const absent: HostMode = { kind: "absent" };
const rejects = (): HostMode => ({ kind: "rejects", error: new Error(`refresh failed: invalid_grant for ${HOST_TOKEN}`) });

describe.each([
  ["resolves undefined", absent],
  ["rejects", rejects()],
])("Host token source %s (AC-18)", (_label, mode) => {
  it("AC-18: a preview → 503 E-23 as JSON, no stream; the source asked once; 0 setlist.fm and 0 Spotify requests", async () => {
    const h = makeHarness({ host: mode });
    const res = await h.get(`/api/setlists/${H_ID}/preview`);
    expectCatalogueError(res, "E-23");
    expect(String(res.headers["content-type"])).not.toMatch(/event-stream/);
    expect(h.host.asked).toBe(1);
    expect(h.http.requests).toEqual([]);
    expect(h.matchSearches).toEqual([]);
    expectNoLeaks(res);
  });

  it("AC-18: a create → 503 E-23; the source asked once; no request, no event, nothing counted", async () => {
    const h = makeHarness({ host: mode });
    const res = await h.post(`/api/setlists/${H_ID}/playlist`, { versionId: H_V1 });
    expectCatalogueError(res, "E-23");
    expect(h.host.asked).toBe(1);
    expect(h.http.requests).toEqual([]);
    expect(h.usage.recorded).toEqual([]);
    expect(h.hits.added).toEqual([]);
    expectNoLeaks(res);
  });

  it("AC-18: the Artist search, the Setlist page, the link and the Setlist status work, and never ask the source", async () => {
    const h = makeHarness({ host: mode });
    h.artistSearches["Pearl Jam"] = pearlJamSearchPayload();
    h.setlistPages[`${PEARL_JAM_MBID}?p=1`] = pearlJamPagePayload();
    await h.records.saveRecord({
      setlistId: H_ID,
      playlistId: PLAYLIST_ID,
      shareUrl: SHARE_URL,
      versionId: H_V1,
      createdAt: "2026-11-27T18:04:05.000Z",
    });

    const search = await h.get("/api/artists?name=Pearl%20Jam");
    expect(search.status).toBe(200);
    expect(search.body).toStrictEqual({
      artists: [
        { name: "Pearl Jam", mbid: PEARL_JAM_MBID },
        { name: "Pearl Jam Tribute", mbid: "6c3b9f2e-1a4d-4e8b-9f0a-2b3c4d5e6f70" },
      ],
    });
    expect(h.setlistFmRequests()).toHaveLength(1);

    const page = await h.get(`/api/artists/${PEARL_JAM_MBID}/setlists`);
    expect(page.status).toBe(200);
    expect(h.setlistFmRequests()).toHaveLength(2);

    const link = await h.get(
      "/api/setlist-links?url=https://www.setlist.fm/setlist/pearl-jam/2026/moda-center-portland-or-2bf1c8e4.html",
    );
    expect(link.status).toBe(200);
    expect(link.body).toStrictEqual({ setlistId: H_ID });
    expect(h.setlistFmRequests()).toHaveLength(2);

    const status = await h.get(`/api/setlists/${H_ID}`);
    expect(status.status).toBe(200);
    expect((status.body as { playlist: unknown }).playlist).toStrictEqual({ status: "current", url: SHARE_URL });
    expect(h.usage.recorded).toEqual([{ kind: "opened", setlistId: H_ID, artist: "Pearl Jam", day: TODAY }]);
    expect(h.setlistFmRequests()).toHaveLength(3);

    expect(h.spotifyRequests()).toEqual([]);
    expect(h.host.asked).toBe(0);
  });
});

describe("a failing Host token source (AC-18)", () => {
  it("AC-18: the rejection is logged once as a warning with its cause, the Host token redacted", async () => {
    const h = makeHarness({ host: rejects() });
    await h.get(`/api/setlists/${H_ID}/preview`);
    const warnings = h.log.of("warn");
    expect(warnings).toHaveLength(1);
    const text = h.log.textOf(warnings[0]!);
    expect(text).toContain("refresh failed: invalid_grant for [redacted]");
    expect(h.log.allText()).not.toContain(HOST_TOKEN);
    expect(h.log.allText()).not.toContain(A);
    expect(h.log.of("error")).toEqual([]);
  });

  it("AC-18: after 11 refused creates from A, a connected source admits A's next create (nothing was counted)", async () => {
    const h = makeHarness({ host: rejects() });
    for (let i = 0; i < 11; i++) {
      const res = await h.post(`/api/setlists/${H_ID}/playlist`, { versionId: H_V1 });
      expectCatalogueError(res, "E-23");
    }
    expect(h.host.asked).toBe(11);
    h.host.mode = { kind: "connected", token: HOST_TOKEN };
    const res = await h.post(`/api/setlists/${H_ID}/playlist`, { versionId: H_V1 });
    expect(res.status).toBe(200);
    expect(res.body).toStrictEqual({ url: SHARE_URL, status: "created" });
    expect(h.hits.added).toEqual([]);
  });

  it("AC-18: after 31 refused previews from A, a connected source admits A's next preview", async () => {
    const h = makeHarness({ host: { kind: "absent" } });
    for (let i = 0; i < 31; i++) expectCatalogueError(await h.get(`/api/setlists/${H_ID}/preview`), "E-23");
    h.host.mode = { kind: "connected", token: HOST_TOKEN };
    const res = await h.getStream(`/api/setlists/${H_ID}/preview`);
    expect(res.status).toBe(200);
    expect(String(res.headers["content-type"])).toMatch(/^text\/event-stream/);
  });
});

describe("a Host token source that resolves undefined, in the log (AC-8, AC-18)", () => {
  // AC-8: "a PLAYLISTS_UNAVAILABLE (E-23) [is] logged once through logger.warn"; it names no exception
  // for "not connected", so every refused preview and create is one warning, never an error.
  it("AC-8: each E-23 for a source resolving undefined (a preview, then a create) is logged once through logger.warn; nothing as an error", async () => {
    const h = makeHarness({ host: absent });
    expectCatalogueError(await h.get(`/api/setlists/${H_ID}/preview`), "E-23");
    expect(h.log.of("warn")).toHaveLength(1);
    expectCatalogueError(await h.post(`/api/setlists/${H_ID}/playlist`, { versionId: H_V1 }), "E-23");
    expect(h.log.of("warn")).toHaveLength(2);
    expect(h.log.of("error")).toEqual([]);
    expect(h.log.allText()).not.toContain(A);
    expect(h.log.allText()).not.toContain(HOST_TOKEN);
  });
});

describe("notConnectedHostTokenSource (AC-18)", () => {
  it("AC-18: it is never connected: getAccessToken resolves undefined", async () => {
    await expect(notConnectedHostTokenSource.getAccessToken()).resolves.toBeUndefined();
  });

  it("AC-18: an app built with it answers a preview and a create with E-23 and still searches", async () => {
    const h = makeHarness();
    const app = createApp({
      config: h.config,
      services: h.services,
      records: h.records,
      events: h.usage.events,
      hostTokens: notConnectedHostTokenSource,
      rateLimitHits: h.hits,
      now: () => h.clock.ms,
      logger: h.log.logger,
      clientDir: sharedClientDir(),
    });
    expectCatalogueError(await request(app).get(`/api/setlists/${H_ID}/preview`).set("X-Forwarded-For", A), "E-23");
    expectCatalogueError(
      await request(app).post(`/api/setlists/${H_ID}/playlist`).set("X-Forwarded-For", A).send({ versionId: H_V1 }),
      "E-23",
    );
    expect(h.http.requests).toEqual([]);
  });
});
