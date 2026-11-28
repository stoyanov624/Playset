// Preview — GET /api/setlists/:id/preview (X9, X10): the checks before the stream, the stream
// itself, the preview event, cached previews and the per-address preview limit.
import { describe, expect, it } from "vitest";
import { previewProgressSchema, previewResultSchema } from "../../../src/web/shared/index.js";
import { bareError, expectCatalogueError } from "./fixtures/catalogue";
import {
  A,
  B,
  HOST_TOKEN,
  TODAY,
  answer,
  expectContract,
  expectNoLeaks,
  frameNames,
  makeHarness,
  parseSse,
  progressNames,
  setlistFmNotFound,
  spotifyStatus,
} from "./fixtures/harness";
import {
  FIXTURE_A_ID,
  H_ID,
  H_V1,
  MADRID_ID,
  MADRID_VERSION,
  NIRVANA_ID,
  madridPreviewEvent,
  madridSetlist,
  onlyUnknownSongsPreviewEvent,
  onlyUnknownSongsSetlist,
  tooLongDescription,
  variant,
  fixtureHv1,
} from "./fixtures/setlists";

type Harness = ReturnType<typeof makeHarness>;

async function streamOf(h: Harness, id: string, address = A) {
  const res = await h.getStream(`/api/setlists/${id}/preview`, address);
  const text = typeof res.body === "string" ? res.body : res.text;
  return { res, text, ...parseSse(text) };
}

// ---------------------------------------------------------------- AC-20

describe("the preview stream (AC-20)", () => {
  it("AC-20: Madrid, 5 kept Performances → 200 text/event-stream, no-store; progress 1…5 of 5, then one preview event, then the end", async () => {
    const h = makeHarness();
    const { res, frames, text } = await streamOf(h, MADRID_ID);
    expect(res.status).toBe(200);
    expect(String(res.headers["content-type"])).toMatch(/^text\/event-stream/);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(frameNames(frames)).toEqual([...progressNames(5), "preview"]);
    for (const frame of frames.slice(0, 5)) expectContract(previewProgressSchema, frame.data);
    expect(frames.slice(0, 5).map((f) => f.data)).toEqual([1, 2, 3, 4, 5].map((n) => ({ n, total: 5 })));
    for (const frame of frames) expect(frame.rawData).toBe(JSON.stringify(frame.data));
    expect(text.endsWith("\n\n")).toBe(true);
    expectNoLeaks(text);
    expectNoLeaks(res);
  });

  it("AC-20: the preview step ran once with the Host token: 5 Match searches, each with BQDhost-test-token", async () => {
    const h = makeHarness();
    await streamOf(h, MADRID_ID);
    expect(h.matchSearches).toEqual(
      ["Brianstorm", "Do I Wanna Know?", "R U Mine?", "Brianstorm", "505"].map((title) => ({ title, accessToken: HOST_TOKEN })),
    );
    expect(h.host.asked).toBe(1);
  });

  it("AC-20: the preview step was given the records: afterwards a cached preview exists for 73a1b2c5 + g3e5f7a91", async () => {
    const h = makeHarness();
    await streamOf(h, MADRID_ID);
    const cached = (await h.records.findPreview(MADRID_ID, MADRID_VERSION)) as { playlistName: string } | undefined;
    expect(cached?.playlistName).toBe("Arctic Monkeys – 2026-06-02 – Madrid");
  });

  it("AC-20: only Unknown Songs (T1d) → no progress event, one preview event with no rows and no Misses", async () => {
    const h = makeHarness({ setlists: { [H_ID]: onlyUnknownSongsSetlist() } });
    const { res, frames } = await streamOf(h, H_ID);
    expect(res.status).toBe(200);
    expect(frameNames(frames)).toEqual(["preview"]);
    expect(frames[0]!.data).toStrictEqual(onlyUnknownSongsPreviewEvent());
    expect(h.matchSearches).toEqual([]);
  });

  it("AC-20: a Placeholder Setlist (no songs yet) → only the preview event, rows [] and misses []", async () => {
    const h = makeHarness({
      setlists: { [H_ID]: variant(fixtureHv1(), { sets: { set: [] } }) },
    });
    const { frames } = await streamOf(h, H_ID);
    expect(frameNames(frames)).toEqual(["preview"]);
    const preview = frames[0]!.data as { rows: unknown[]; misses: unknown[]; versionId: string };
    expect(preview.rows).toEqual([]);
    expect(preview.misses).toEqual([]);
    expect(preview.versionId).toBe(H_V1);
    expectContract(previewResultSchema, preview);
  });

  it("AC-20: only Tapes → no progress event (every Tape is left out)", async () => {
    const h = makeHarness({
      setlists: { [H_ID]: variant(fixtureHv1(), { sets: { set: [{ song: [{ name: "Intro", tape: true }] }] } }) },
    });
    const { frames } = await streamOf(h, H_ID);
    expect(frameNames(frames)).toEqual(["preview"]);
    expect((frames[0]!.data as { notAdded: unknown }).notAdded).toEqual([{ reason: "tape", name: "Intro" }]);
  });
});

// ---------------------------------------------------------------- AC-21

describe("the preview event (AC-21)", () => {
  it("AC-21: Madrid → exactly the contract's Madrid preview (rows, misses, notAdded, name, version); no matches key", async () => {
    const h = makeHarness();
    const { frames, text } = await streamOf(h, MADRID_ID);
    const preview = frames.at(-1)!;
    expect(preview.event).toBe("preview");
    expect(preview.data).toStrictEqual(madridPreviewEvent());
    expectContract(previewResultSchema, preview.data);
    expect(Object.keys(preview.data as object).sort()).toEqual(
      ["incompleteStatus", "misses", "notAdded", "playlistName", "rows", "show", "versionId"].sort(),
    );
    for (const forbidden of ['"matches"', '"uri"', '"isTape"', '"queries"', "spotify:track:", '"id"']) {
      expect(text).not.toContain(forbidden);
    }
  });

  it("AC-21: a Cover row (Nirvana U1, Love Buzz) carries originalArtist; the Unknown Song's info is in notAdded", async () => {
    const h = makeHarness();
    const { frames } = await streamOf(h, NIRVANA_ID);
    expect(frameNames(frames)).toEqual([...progressNames(9), "preview"]);
    const preview = frames.at(-1)!.data as {
      rows: Array<{ number: number; performance: { title: string } }>;
      misses: unknown[];
      notAdded: unknown[];
      playlistName: string;
      versionId: string;
    };
    expectContract(previewResultSchema, preview);
    const loveBuzz = preview.rows.find((r) => r.performance.title === "Love Buzz")!;
    expect(loveBuzz).toStrictEqual({
      number: preview.rows.indexOf(loveBuzz) + 1,
      performance: { position: 1, title: "Love Buzz", setLabel: "main", originalArtist: "Shocking Blue" },
      outcome: { kind: "match", name: "Love Buzz", artists: ["Nirvana"], album: "Bleach", live: false },
    });
    expect(preview.rows.map((r) => r.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(preview.misses).toEqual([{ number: 6, title: "Spank Thru", artist: "Nirvana" }]);
    expect(preview.notAdded).toEqual([{ reason: "unknown", after: 7, info: "Written as 'Dope Hippie' on the setlist" }]);
    expect(preview.playlistName).toBe("Nirvana – 1987-04-18 – Tacoma");
    expect(preview.versionId).toBe("g9d0c1b2a");
  });
});

// ---------------------------------------------------------------- AC-19

describe("checks before the stream, in order (AC-19)", () => {
  it("AC-19: an invalid :id (73A1B2C5.html) → 400 E-4 as JSON; the Host token is not asked; no request", async () => {
    const h = makeHarness();
    const res = await h.get("/api/setlists/73A1B2C5.html/preview");
    expectCatalogueError(res, "E-4");
    expect(h.host.asked).toBe(0);
    expect(h.http.requests).toEqual([]);
  });

  it("AC-19: not connected → 503 E-23; Host token asked once; setlist.fm not asked", async () => {
    const h = makeHarness({ host: { kind: "absent" } });
    const res = await h.get(`/api/setlists/${MADRID_ID}/preview`);
    expectCatalogueError(res, "E-23");
    expect(h.host.asked).toBe(1);
    expect(h.setlistFmRequests()).toEqual([]);
  });

  it("AC-19: setlist.fm has no such Setlist → 404 E-9 as JSON; no Spotify request, nothing counted", async () => {
    const h = makeHarness({ env: { PLAYSET_PREVIEW_LIMIT: "1" }, setlists: { [MADRID_ID]: setlistFmNotFound } });
    const res = await h.get(`/api/setlists/${MADRID_ID}/preview`);
    expectCatalogueError(res, "E-9");
    expect(h.spotifyRequests()).toEqual([]);
    expect(h.matchSearches).toEqual([]);
    const next = await streamOf(h, H_ID);
    expect(next.res.status).toBe(200);
  });

  it("AC-19: a setlist.fm request error, HTTP 502 → 502 E-16 as JSON; no Spotify request", async () => {
    const h = makeHarness({ setlists: { [MADRID_ID]: answer(502, { code: 502, status: "Bad Gateway" }) } });
    const res = await h.get(`/api/setlists/${MADRID_ID}/preview`);
    expectCatalogueError(res, "E-16");
    expect(h.spotifyRequests()).toEqual([]);
  });

  it("AC-19: any other error while fetching → 500 E-25 as JSON", async () => {
    const h = makeHarness();
    h.overrides.getSetlist = async () => {
      throw new Error("boom");
    };
    const res = await h.get(`/api/setlists/${MADRID_ID}/preview`);
    expectCatalogueError(res, "E-25");
  });

  it("AC-19: the description-too-long error while preparing → 400 E-8 (before the version check)", async () => {
    const h = makeHarness({ setlists: { [FIXTURE_A_ID]: tooLongDescription() } });
    const res = await h.get(`/api/setlists/${FIXTURE_A_ID}/preview`);
    expectCatalogueError(res, "E-8");
    expect(h.spotifyRequests()).toEqual([]);
  });

  it("AC-19: Madrid without a version → 502 E-20 as JSON; no Spotify request, nothing counted", async () => {
    const h = makeHarness({ env: { PLAYSET_PREVIEW_LIMIT: "1" }, setlists: { [MADRID_ID]: madridSetlist(undefined) } });
    const res = await h.get(`/api/setlists/${MADRID_ID}/preview`);
    expectCatalogueError(res, "E-20");
    expect(h.spotifyRequests()).toEqual([]);
    expect(h.matchSearches).toEqual([]);
    expect((await streamOf(h, H_ID)).res.status).toBe(200);
  });

  it("AC-19: address A at its preview limit, Setlist neither cached nor in flight → 429 E-11 as JSON; no Spotify request for it", async () => {
    const h = makeHarness({ env: { PLAYSET_PREVIEW_LIMIT: "1" } });
    h.clock.set("2026-11-28T14:00:00.000Z");
    expect((await streamOf(h, H_ID)).res.status).toBe(200);
    const searchesBefore = h.matchSearches.length;
    h.clock.set("2026-11-28T14:30:00.000Z");
    const res = await h.get(`/api/setlists/${MADRID_ID}/preview`);
    expectCatalogueError(res, "E-11", 1800);
    expect(h.matchSearches.length).toBe(searchesBefore);
    expect(h.setlistFmRequests().map((r) => r.url.pathname)).toEqual([
      `/rest/1.0/setlist/${H_ID}`,
      `/rest/1.0/setlist/${MADRID_ID}`,
    ]);
  });
});

// ---------------------------------------------------------------- AC-22, AC-23 (X10)

describe("cached previews and the preview limit (AC-22, AC-23)", () => {
  it("AC-22, AC-23: X10 — PLAYSET_PREVIEW_LIMIT=2, A and B through one afternoon", async () => {
    const h = makeHarness({ env: { PLAYSET_PREVIEW_LIMIT: "2" } });

    h.clock.set("2026-11-28T14:00:00.000Z");
    const first = await streamOf(h, MADRID_ID);
    expect(frameNames(first.frames)).toEqual([...progressNames(5), "preview"]);
    expect(h.matchSearches).toHaveLength(5);

    h.clock.set("2026-11-28T14:10:00.000Z");
    const cached = await streamOf(h, MADRID_ID);
    expect(frameNames(cached.frames)).toEqual(["preview"]);
    expect(cached.frames[0]!.data).toStrictEqual(first.frames.at(-1)!.data);
    expect(h.matchSearches).toHaveLength(5);

    h.clock.set("2026-11-28T14:20:00.000Z");
    const portland = await streamOf(h, H_ID);
    expect(frameNames(portland.frames)).toEqual([...progressNames(3), "preview"]);

    h.clock.set("2026-11-28T14:30:00.000Z");
    const refused = await h.get(`/api/setlists/${NIRVANA_ID}/preview`);
    expectCatalogueError(refused, "E-11", 1800);
    expect(h.matchSearches).toHaveLength(8);

    const cachedAgain = await streamOf(h, MADRID_ID);
    expect(frameNames(cachedAgain.frames)).toEqual(["preview"]);

    const fromB = await streamOf(h, NIRVANA_ID, B);
    expect(frameNames(fromB.frames)).toEqual([...progressNames(9), "preview"]);

    h.clock.set("2026-11-28T15:00:01.000Z");
    const nirvanaForA = await streamOf(h, NIRVANA_ID);
    expect(frameNames(nirvanaForA.frames)).toEqual(["preview"]);

    // The 14:00:00 preview has left A's window: one more uncached preview is admitted, the next is refused
    // until 14:20:00's leaves (15:20:00).
    h.setlists[MADRID_ID] = madridSetlist("g3e5f7a92");
    const admitted = await streamOf(h, MADRID_ID);
    expect(frameNames(admitted.frames)).toEqual([...progressNames(5), "preview"]);
    h.setlists[MADRID_ID] = madridSetlist("g3e5f7a93");
    expectCatalogueError(await h.get(`/api/setlists/${MADRID_ID}/preview`), "E-11", 1199);

    expect(h.hits.count(TODAY)).toBe(2);
    expect(h.hits.added).toEqual([TODAY, TODAY]);
  });

  it("AC-22: a cached preview is free even when A's limit is reached: only the preview event, 0 Match searches", async () => {
    const h = makeHarness({ env: { PLAYSET_PREVIEW_LIMIT: "1" } });
    await streamOf(h, MADRID_ID);
    expect(h.matchSearches).toHaveLength(5);
    for (let i = 0; i < 3; i++) {
      const again = await streamOf(h, MADRID_ID);
      expect(frameNames(again.frames)).toEqual(["preview"]);
      expect(again.frames[0]!.data).toStrictEqual(madridPreviewEvent());
    }
    expect(h.matchSearches).toHaveLength(5);
    expect(h.hits.added).toEqual([]);
  });

  it("AC-22: a cached preview still needs a connected Host Account and a fresh fetch of the Setlist", async () => {
    const h = makeHarness();
    await streamOf(h, MADRID_ID);
    h.host.mode = { kind: "absent" };
    expectCatalogueError(await h.get(`/api/setlists/${MADRID_ID}/preview`), "E-23");
    h.host.mode = { kind: "connected", token: HOST_TOKEN };
    await streamOf(h, MADRID_ID);
    expect(h.setlistFmRequests()).toHaveLength(2);
  });

  it("AC-23: the refusal's Retry-After is rounded up and at least 1 second", async () => {
    const h = makeHarness({ env: { PLAYSET_PREVIEW_LIMIT: "1" } });
    h.clock.set("2026-11-28T13:30:00.900Z");
    await streamOf(h, H_ID);
    h.clock.set("2026-11-28T14:30:00.400Z");
    expectCatalogueError(await h.get(`/api/setlists/${MADRID_ID}/preview`), "E-11", 1);
    h.clock.set("2026-11-28T14:30:00.899Z");
    expectCatalogueError(await h.get(`/api/setlists/${MADRID_ID}/preview`), "E-11", 1);
    h.clock.set("2026-11-28T14:30:00.900Z");
    expect((await streamOf(h, MADRID_ID)).res.status).toBe(200);
  });

  it("AC-23: a preview that fails after it started still counts once", async () => {
    const h = makeHarness({ env: { PLAYSET_PREVIEW_LIMIT: "1" } });
    h.spotify.failSearch.Release = spotifyStatus(503);
    const failed = await streamOf(h, H_ID);
    expect(failed.res.status).toBe(200);
    expect(failed.frames.at(-1)!.data).toStrictEqual(bareError("E-17"));
    expectCatalogueError(await h.get(`/api/setlists/${MADRID_ID}/preview`), "E-11", 3600);
  });

  it("AC-23: other addresses are not affected by A's limit", async () => {
    const h = makeHarness({ env: { PLAYSET_PREVIEW_LIMIT: "1" } });
    await streamOf(h, H_ID, A);
    expectCatalogueError(await h.get(`/api/setlists/${MADRID_ID}/preview`, A), "E-11", 3600);
    const fromB = await streamOf(h, MADRID_ID, B);
    expect(frameNames(fromB.frames)).toEqual([...progressNames(5), "preview"]);
    expect(h.hits.count(TODAY)).toBe(1);
  });
});

// ---------------------------------------------------------------- AC-1: which address is the Visitor's

describe("the Visitor address (AC-1)", () => {
  it("AC-1: PLAYSET_TRUST_PROXY=0 → X-Forwarded-For is ignored: two 'addresses' over one connection share one limit", async () => {
    const h = makeHarness({ env: { PLAYSET_PREVIEW_LIMIT: "1", PLAYSET_TRUST_PROXY: "0" } });
    expect((await streamOf(h, H_ID, A)).res.status).toBe(200);
    expectCatalogueError(await h.get(`/api/setlists/${MADRID_ID}/preview`, B), "E-11", 3600);
  });

  it("AC-1: PLAYSET_TRUST_PROXY=1 → the address the nearest proxy put last in X-Forwarded-For", async () => {
    const h = makeHarness({ env: { PLAYSET_PREVIEW_LIMIT: "1" } });
    expect((await streamOf(h, H_ID, A)).res.status).toBe(200);
    expectCatalogueError(await h.get(`/api/setlists/${MADRID_ID}/preview`, `${B}, ${A}`), "E-11", 3600);
    const asB = await streamOf(h, MADRID_ID, `${A}, ${B}`);
    expect(asB.res.status).toBe(200);
    expect(frameNames(asB.frames)).toEqual([...progressNames(5), "preview"]);
  });
});
