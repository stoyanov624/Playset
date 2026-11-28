// Shared preview runs, disconnects and error events (X11). The app listens on a free local port so
// the test can read each stream as it comes and close a connection mid-run; the Match search is
// held at a gate until the test releases it.
import { afterEach, describe, expect, it } from "vitest";
import { previewResultSchema } from "../../../src/web/shared/index.js";
import { bareError } from "./fixtures/catalogue";
import {
  A,
  B,
  HOST_TOKEN,
  expectContract,
  expectNoLeaks,
  flush,
  makeGate,
  makeHarness,
  listen,
  openStream,
  progressNames,
  spotifyRateLimited,
  spotifyStatus,
  waitUntil,
  type HarnessOptions,
} from "./fixtures/harness";
import { H_ID, H_V1, H_V2, fixtureHv1, fixtureHv2 } from "./fixtures/setlists";

const PATH = `/api/setlists/${H_ID}/preview`;
const closers: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (closers.length > 0) await closers.pop()!();
});

/** H v2 (5 kept Performances) served, the Match search held from search `gateFrom` on. */
async function setup(gateFrom = 2, opts: HarnessOptions = {}) {
  const h = makeHarness({ setlists: { [H_ID]: fixtureHv2() }, ...opts });
  const gate = makeGate();
  h.matching.gate = gate;
  h.matching.gateFrom = gateFrom;
  const server = await listen(h.app);
  closers.push(server.close);
  return { h, gate, port: server.port };
}

// ---------------------------------------------------------------- AC-24

describe("joining a run in flight (AC-24)", () => {
  it("AC-24: B joins A's run: B first gets progress 1 and 2, then both get 3, 4, 5 and the same preview; 5 searches, not 10", async () => {
    const { h, gate, port } = await setup(2);
    const a = openStream(port, PATH, A);
    await a.waitForFrames(2);
    await waitUntil(() => gate.state.waiting === 1, "search 2 to wait");
    expect(a.names()).toEqual(progressNames(5, 2));

    const b = openStream(port, PATH, B);
    await b.waitForFrames(2);
    expect(b.names()).toEqual(progressNames(5, 2));
    await flush();
    expect(b.names()).toEqual(progressNames(5, 2));
    expect(h.matchSearches).toHaveLength(2);

    gate.release();
    await a.waitForEnd();
    await b.waitForEnd();
    expect(a.names()).toEqual([...progressNames(5), "preview"]);
    expect(b.names()).toEqual([...progressNames(5), "preview"]);
    expect(b.frames().at(-1)!.data).toStrictEqual(a.frames().at(-1)!.data);
    expectContract(previewResultSchema, a.frames().at(-1)!.data);
    expect((a.frames().at(-1)!.data as { versionId: string }).versionId).toBe(H_V2);
    expect(h.matchSearches).toHaveLength(5);
    expect(h.matchSearches.every((s) => s.accessToken === HOST_TOKEN)).toBe(true);
    expectNoLeaks(a.raw());
    expectNoLeaks(b.raw());
  });

  it("AC-24: the joined request is not counted against its address (A has 1, B has 0)", async () => {
    const { h, gate, port } = await setup(2, { env: { PLAYSET_PREVIEW_LIMIT: "1" } });
    const a = openStream(port, PATH, A);
    await a.waitForFrames(2);
    const b = openStream(port, PATH, B);
    await b.waitForFrames(2);
    gate.release();
    await a.waitForEnd();
    await b.waitForEnd();

    // B still has its one preview: an uncached one for B is admitted, one more for A is refused.
    h.setlists[H_ID] = fixtureHv1();
    const forB = openStream(port, PATH, B);
    await forB.waitForEnd();
    expect(forB.status()).toBe(200);
    expect(forB.names()).toEqual([...progressNames(3), "preview"]);

    h.setlists[H_ID] = fixtureHv2();
    const fresh = openStream(port, `/api/setlists/73a1b2c5/preview`, A);
    await fresh.waitForEnd();
    expect(fresh.status()).toBe(429);
  });

  it("AC-24: A asks for H v2 and B for H v1 at once → two runs, 5 and 3 searches", async () => {
    const { h, gate, port } = await setup(1);
    const a = openStream(port, PATH, A);
    await waitUntil(() => gate.state.waiting === 1, "A's first search to wait");
    h.setlists[H_ID] = fixtureHv1();
    const b = openStream(port, PATH, B);
    await waitUntil(() => gate.state.waiting === 2, "B's first search to wait");
    gate.release();
    await a.waitForEnd();
    await b.waitForEnd();
    expect(a.names()).toEqual([...progressNames(5), "preview"]);
    expect(b.names()).toEqual([...progressNames(3), "preview"]);
    expect((a.frames().at(-1)!.data as { versionId: string }).versionId).toBe(H_V2);
    expect((b.frames().at(-1)!.data as { versionId: string }).versionId).toBe(H_V1);
    expect(h.matchSearches).toHaveLength(8);
  });
});

// ---------------------------------------------------------------- AC-25

describe("listeners leaving (AC-25)", () => {
  it("AC-25: A alone closes while search 2 waits → the run aborts: no search 3, no cached preview, logged as info only", async () => {
    const { h, gate, port } = await setup(2);
    const a = openStream(port, PATH, A);
    await a.waitForFrames(2);
    await waitUntil(() => gate.state.waiting === 1, "search 2 to wait");
    a.close();
    await waitUntil(() => h.log.of("info").length > 0, "the cancelled run to be logged");
    gate.release();
    await flush(100);
    expect(h.matchSearches.map((s) => s.title)).toEqual(["Release", "Even Flow"]);
    expect(await h.records.findPreview(H_ID, H_V2)).toBeUndefined();
    expect(h.log.of("info")).toHaveLength(1);
    expect(h.log.of("error")).toEqual([]);
    expect(h.log.of("warn")).toEqual([]);
    expect(h.log.allText()).not.toContain(A);
  });

  it("AC-25: after that abort, A asks again → a new run from progress 1 (5 new searches), and A has 2 counted", async () => {
    const { h, gate, port } = await setup(2, { env: { PLAYSET_PREVIEW_LIMIT: "2" } });
    const first = openStream(port, PATH, A);
    await first.waitForFrames(2);
    await waitUntil(() => gate.state.waiting === 1, "search 2 to wait");
    first.close();
    await waitUntil(() => h.log.of("info").length > 0, "the cancelled run to be logged");
    gate.release();
    await flush(50);

    const again = openStream(port, PATH, A);
    await again.waitForEnd();
    expect(again.names()).toEqual([...progressNames(5), "preview"]);
    expect(h.matchSearches).toHaveLength(2 + 5);
    expect((await h.records.findPreview(H_ID, H_V2)) === undefined).toBe(false);

    const third = openStream(port, `/api/setlists/73a1b2c5/preview`, A);
    await third.waitForEnd();
    expect(third.status()).toBe(429);
  });

  it("AC-25: A and B listening; A closes while search 2 waits → B gets 3, 4, 5 and the preview; the cached preview is saved", async () => {
    const { h, gate, port } = await setup(2);
    const a = openStream(port, PATH, A);
    await a.waitForFrames(2);
    const b = openStream(port, PATH, B);
    await b.waitForFrames(2);
    a.close();
    await flush(50);
    gate.release();
    await b.waitForEnd();
    expect(b.names()).toEqual([...progressNames(5), "preview"]);
    expect(a.names()).toEqual(progressNames(5, 2));
    expect(h.matchSearches).toHaveLength(5);
    const cached = (await h.records.findPreview(H_ID, H_V2)) as { playlistName: string } | undefined;
    expect(cached?.playlistName).toBe("Pearl Jam – 2026-11-21 – Portland");
    expect(h.log.of("error")).toEqual([]);
  });
});

// ---------------------------------------------------------------- AC-26

describe("a run failing after the stream started (AC-26)", () => {
  it.each([
    ["a Spotify search error, HTTP 503", spotifyStatus(503), "E-17"],
    ["the Spotify search rate-limit error", spotifyRateLimited, "E-15"],
    ["a Spotify search error, HTTP 401", spotifyStatus(401, "The access token expired"), "E-23"],
  ] as const)("AC-26: A and B listening, search 3 (Corduroy) fails with %s → both get progress 1–3, then one error event; no cache", async (_why, failure, id) => {
    const { h, gate, port } = await setup(2);
    h.spotify.failSearch.Corduroy = failure;
    const a = openStream(port, PATH, A);
    await a.waitForFrames(2);
    const b = openStream(port, PATH, B);
    await b.waitForFrames(2);
    gate.release();
    await a.waitForEnd();
    await b.waitForEnd();
    for (const stream of [a, b]) {
      expect(stream.status()).toBe(200);
      expect(stream.names()).toEqual([...progressNames(5, 3), `error ${bareError(id).code}`]);
      const error = stream.frames().at(-1)!;
      expect(error.event).toBe("error");
      expect(error.data).toStrictEqual(bareError(id));
      expect(error.rawData).toBe(JSON.stringify(bareError(id)));
      expectNoLeaks(stream.raw());
    }
    expect(await h.records.findPreview(H_ID, H_V2)).toBeUndefined();
    expect(h.matchSearches.map((s) => s.title)).toEqual(["Release", "Even Flow", "Corduroy"]);
  });

  it("AC-26: the exact error event for E-17 on the wire", async () => {
    const { h, gate, port } = await setup(99);
    h.spotify.failSearch.Corduroy = spotifyStatus(503);
    gate.release();
    const a = openStream(port, PATH, A);
    await a.waitForEnd();
    expect(a.raw()).toContain(
      'event: error\ndata: {"code":"UPSTREAM_UNAVAILABLE","message":"Spotify isn\'t answering right now.","hint":"Try again in a minute."}\n\n',
    );
    expect(a.raw()).not.toContain("event: preview");
  });

  it("AC-26: a Spotify 401 error event is logged as a warning, a 503 as an error, each once", async () => {
    const run = async (failure: ReturnType<typeof spotifyStatus>) => {
      const { h, gate, port } = await setup(99);
      gate.release();
      h.spotify.failSearch.Corduroy = failure;
      const a = openStream(port, PATH, A);
      await a.waitForEnd();
      return h;
    };
    const unauthorised = await run(spotifyStatus(401, "The access token expired"));
    expect(unauthorised.log.of("warn")).toHaveLength(1);
    expect(unauthorised.log.of("error")).toEqual([]);
    const down = await run(spotifyStatus(503));
    expect(down.log.of("error")).toHaveLength(1);
    expect(down.log.allText()).not.toContain(HOST_TOKEN);
  });
});
