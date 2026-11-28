// One create/update per Setlist at a time (X14). The fake Spotify holds every create request
// (POST /v1/me/playlists) at a gate until the test releases it.
import { describe, expect, it } from "vitest";
import { bareError } from "./fixtures/catalogue";
import { A, B, TODAY, flush, makeGate, makeHarness, spotifyStatus, waitUntil } from "./fixtures/harness";
import { H_ID, H_V1, H_V2, MADRID_ID, MADRID_VERSION, PLAYLIST_ID, SHARE_URL, fixtureHv2 } from "./fixtures/setlists";

const H_PATH = `/api/setlists/${H_ID}/playlist`;

/** Starts a request now and gives its answer later. */
function start<T>(test: PromiseLike<T>): Promise<T> {
  return Promise.resolve(test);
}

const createRequests = (h: ReturnType<typeof makeHarness>) => h.playlistCalls().filter((c) => c === "POST /v1/me/playlists");

describe("the same Setlist and version at once (AC-31)", () => {
  it("AC-31: A and B post 2bf1c8e4 g4bd1a2f6 → one step call, one Spotify create, the same created answer, one event; each counted", async () => {
    const h = makeHarness({ env: { PLAYSET_CREATE_LIMIT: "1" } });
    const gate = makeGate();
    h.spotify.createGate = gate;
    const fromA = start(h.post(H_PATH, { versionId: H_V1 }, A));
    await waitUntil(() => gate.state.waiting === 1, "A's create to wait");
    const fromB = start(h.post(H_PATH, { versionId: H_V1 }, B));
    await flush(100);
    expect(gate.state.waiting).toBe(1);
    expect(createRequests(h)).toHaveLength(1);
    gate.release();
    const [a, b] = await Promise.all([fromA, fromB]);
    for (const res of [a, b]) {
      expect(res.status).toBe(200);
      expect(res.body).toStrictEqual({ url: SHARE_URL, status: "created" });
    }
    expect(createRequests(h)).toHaveLength(1);
    expect(h.playlistCalls()).toEqual(["POST /v1/me/playlists", `POST /v1/playlists/${PLAYLIST_ID}/items`]);
    expect(h.matchSearches.map((s) => s.title)).toEqual(["Release", "Even Flow", "Alive"]);
    expect(h.usage.recorded).toEqual([{ kind: "created", setlistId: H_ID, artist: "Pearl Jam", day: TODAY }]);

    // Both were admitted and counted once.
    expect((await h.post(`/api/setlists/${MADRID_ID}/playlist`, { versionId: MADRID_VERSION }, A)).status).toBe(429);
    expect((await h.post(`/api/setlists/${MADRID_ID}/playlist`, { versionId: MADRID_VERSION }, B)).status).toBe(429);
  });

  it("AC-31: the same, and the Spotify create answers 403 → both get 502 E-17; no event; no record", async () => {
    const h = makeHarness();
    const gate = makeGate();
    h.spotify.createGate = gate;
    h.spotify.playlistAnswers[0] = spotifyStatus(403, "Insufficient client scope");
    const fromA = start(h.post(H_PATH, { versionId: H_V1 }, A));
    await waitUntil(() => gate.state.waiting === 1, "A's create to wait");
    const fromB = start(h.post(H_PATH, { versionId: H_V1 }, B));
    await flush(100);
    gate.release();
    const [a, b] = await Promise.all([fromA, fromB]);
    for (const res of [a, b]) {
      expect(res.status).toBe(502);
      expect(res.body).toStrictEqual({ error: bareError("E-17") });
    }
    expect(createRequests(h)).toHaveLength(1);
    expect(h.usage.recorded).toEqual([]);
    expect(await h.records.findRecord(H_ID)).toBeUndefined();
  });
});

describe("the same Setlist, another version (AC-31)", () => {
  it("AC-31: A posts v1 and waits; B posts v2 (setlist.fm now gives H v2) → B runs after A ends, finds A's record and updates it", async () => {
    const h = makeHarness();
    const gate = makeGate();
    h.spotify.createGate = gate;
    const fromA = start(h.post(H_PATH, { versionId: H_V1 }, A));
    await waitUntil(() => gate.state.waiting === 1, "A's create to wait");
    h.setlists[H_ID] = fixtureHv2();
    const fromB = start(h.post(H_PATH, { versionId: H_V2 }, B));
    await flush(100);
    expect(h.playlistCalls()).toEqual(["POST /v1/me/playlists"]);
    expect(h.matchSearches.map((s) => s.title)).toEqual(["Release", "Even Flow", "Alive"]);
    gate.release();
    const a = await fromA;
    const b = await fromB;
    expect(a.status).toBe(200);
    expect(a.body).toStrictEqual({ url: SHARE_URL, status: "created" });
    expect(b.status).toBe(200);
    expect(b.body).toStrictEqual({ url: SHARE_URL, status: "updated" });
    expect(h.playlistCalls()).toEqual([
      "POST /v1/me/playlists",
      `POST /v1/playlists/${PLAYLIST_ID}/items`,
      `PUT /v1/playlists/${PLAYLIST_ID}/items`,
      `PUT /v1/playlists/${PLAYLIST_ID}`,
    ]);
    expect(h.usage.recorded.map((e) => e.kind)).toEqual(["created", "updated"]);
    expect((await h.records.findRecord(H_ID))?.versionId).toBe(H_V2);
  });
});

describe("different Setlists at once (AC-31)", () => {
  it("AC-31: A posts 2bf1c8e4 and B posts 73a1b2c5 → both creates run at the same time", async () => {
    const h = makeHarness();
    const gate = makeGate();
    h.spotify.createGate = gate;
    const fromA = start(h.post(H_PATH, { versionId: H_V1 }, A));
    const fromB = start(h.post(`/api/setlists/${MADRID_ID}/playlist`, { versionId: MADRID_VERSION }, B));
    await waitUntil(() => gate.state.waiting === 2, "both creates to wait at once");
    gate.release();
    const [a, b] = await Promise.all([fromA, fromB]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(h.usage.recorded.map((e) => `${e.kind} ${e.setlistId}`).sort()).toEqual([`created ${H_ID}`, `created ${MADRID_ID}`]);
  });
});

describe("no shared state between apps (AC-31)", () => {
  it("AC-31: a create running in one app does not hold a create for the same Setlist in another app", async () => {
    const first = makeHarness();
    const second = makeHarness();
    const gate = makeGate();
    first.spotify.createGate = gate;
    const held = start(first.post(H_PATH, { versionId: H_V1 }));
    await waitUntil(() => gate.state.waiting === 1, "the first app's create to wait");
    const res = await second.post(H_PATH, { versionId: H_V1 });
    expect(res.status).toBe(200);
    gate.release();
    expect((await held).status).toBe(200);
  });
});
