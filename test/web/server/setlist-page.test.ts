// Setlist page — GET /api/artists/:mbid/setlists?page=… (X5), and the Setlist link —
// GET /api/setlist-links?url=… (X6).
import { describe, expect, it, vi } from "vitest";
import { artistSetlistsResponseSchema, setlistLinksResponseSchema } from "../../../src/web/shared/index.js";
import { expectCatalogueError } from "./fixtures/catalogue";
import { answer, expectContract, expectNoLeaks, makeHarness, setlistFmRateLimited } from "./fixtures/harness";
import { PEARL_JAM_MBID, pearlJamPageAnswer, pearlJamPagePayload } from "./fixtures/setlists";

const pageRequests = (h: ReturnType<typeof makeHarness>) =>
  h.setlistFmRequests().map((r) => `${r.url.pathname}${r.url.search}`);

// ---------------------------------------------------------------- AC-12

describe("GET /api/artists/:mbid/setlists — a page (AC-12)", () => {
  it("AC-12: an upper-case mbid, no page → one page-1 request for the lower-case mbid; 200 with X5's answer (no name, no versionId)", async () => {
    const h = makeHarness();
    h.setlistPages[`${PEARL_JAM_MBID}?p=1`] = pearlJamPagePayload();
    const res = await h.get("/api/artists/83B9CBE7-9857-49E2-AB8E-B57B01038103/setlists");
    expect(res.status).toBe(200);
    expect(String(res.headers["content-type"])).toMatch(/^application\/json/);
    expect(res.body).toStrictEqual(pearlJamPageAnswer());
    expectContract(artistSetlistsResponseSchema, res.body);
    expect(pageRequests(h)).toEqual([`/rest/1.0/artist/${PEARL_JAM_MBID}/setlists?p=1`]);
    expect(res.text).not.toContain("versionId");
    expect(res.text).not.toContain("g4bd1a2f6");
    expect(res.text).not.toContain('"name"');
    expect(h.spotifyRequests()).toEqual([]);
    expectNoLeaks(res);
  });

  it("AC-12: ?page=2 → the step is asked for page 2", async () => {
    const h = makeHarness();
    h.setlistPages[`${PEARL_JAM_MBID}?p=2`] = pearlJamPagePayload();
    const res = await h.get(`/api/artists/${PEARL_JAM_MBID}/setlists?page=2`);
    expect(res.status).toBe(200);
    expect(pageRequests(h)).toEqual([`/rest/1.0/artist/${PEARL_JAM_MBID}/setlists?p=2`]);
  });

  it("AC-12: a page past the end (?page=67) → 200 with no Setlists and hasMore false", async () => {
    const h = makeHarness();
    const res = await h.get(`/api/artists/${PEARL_JAM_MBID}/setlists?page=67`);
    expect(res.status).toBe(200);
    expect(res.body).toStrictEqual({ artist: { mbid: PEARL_JAM_MBID }, setlists: [], hasMore: false });
    expectContract(artistSetlistsResponseSchema, res.body);
    expect(pageRequests(h)).toEqual([`/rest/1.0/artist/${PEARL_JAM_MBID}/setlists?p=67`]);
  });

  it("AC-12: ?page=1000 (the last page the contract allows) is asked for", async () => {
    const h = makeHarness();
    const res = await h.get(`/api/artists/${PEARL_JAM_MBID}/setlists?page=1000`);
    expect(res.status).toBe(200);
    expect(pageRequests(h)).toEqual([`/rest/1.0/artist/${PEARL_JAM_MBID}/setlists?p=1000`]);
  });
});

// ---------------------------------------------------------------- AC-13

describe("GET /api/artists/:mbid/setlists — invalid input and errors (AC-13)", () => {
  it.each([
    ["a short mbid", "/api/artists/83b9cbe7/setlists"],
    ["page 0", `/api/artists/${PEARL_JAM_MBID}/setlists?page=0`],
    ["page 01", `/api/artists/${PEARL_JAM_MBID}/setlists?page=01`],
    ["page 1001", `/api/artists/${PEARL_JAM_MBID}/setlists?page=1001`],
    ["page -1", `/api/artists/${PEARL_JAM_MBID}/setlists?page=-1`],
    ["page 1.5", `/api/artists/${PEARL_JAM_MBID}/setlists?page=1.5`],
    ["page given twice", `/api/artists/${PEARL_JAM_MBID}/setlists?page=1&page=2`],
  ])("AC-13: %s → 400 E-2; no step runs", async (_why, path) => {
    const h = makeHarness();
    const res = await h.get(path);
    expectCatalogueError(res, "E-2");
    expect(h.http.requests).toEqual([]);
    expectNoLeaks(res);
  });

  it("AC-13: the setlist.fm rate-limit error → 429 E-14, Retry-After: 60", async () => {
    const h = makeHarness();
    h.setlistPages[`${PEARL_JAM_MBID}?p=1`] = setlistFmRateLimited;
    const res = await h.get(`/api/artists/${PEARL_JAM_MBID}/setlists`);
    expectCatalogueError(res, "E-14");
    expectNoLeaks(res);
  });

  it("AC-13: a setlist.fm request error, HTTP 500 → 502 E-16", async () => {
    const h = makeHarness();
    h.setlistPages[`${PEARL_JAM_MBID}?p=1`] = answer(500, { code: 500, status: "Internal Server Error" });
    const res = await h.get(`/api/artists/${PEARL_JAM_MBID}/setlists`);
    expectCatalogueError(res, "E-16");
    expectNoLeaks(res);
  });

  it("AC-13: any other error → 500 E-25", async () => {
    const h = makeHarness();
    h.overrides.everyServiceThrows = new Error("boom while listing");
    const res = await h.get(`/api/artists/${PEARL_JAM_MBID}/setlists`);
    expectCatalogueError(res, "E-25");
    expectNoLeaks(res);
  });

  it("AC-13: the missing-setlist.fm-key error → 500 E-25", async () => {
    const h = makeHarness({ setlistFmKey: null });
    const res = await h.get(`/api/artists/${PEARL_JAM_MBID}/setlists`);
    expectCatalogueError(res, "E-25");
    expectNoLeaks(res);
  });
});

// ---------------------------------------------------------------- AC-14

describe("GET /api/setlist-links — reading a link (AC-14)", () => {
  it.each([
    [
      "https://www.setlist.fm/setlist/arctic-monkeys/2026/estadio-metropolitano-madrid-spain-73a1b2c5.html",
      "73a1b2c5",
    ],
    [
      "%20https://www.setlist.fm/setlist/nirvana/1987/community-world-theater-tacoma-wa-53D60349.html%0A",
      "53d60349",
    ],
    ["https://www.setlist.fm/setlist/pearl-jam/2026/moda-center-portland-or-2bf1c8e4.html", "2bf1c8e4"],
  ])("AC-14: url=%s → 200 { setlistId: %j }; no request at all, the link is never fetched", async (url, setlistId) => {
    const globalFetch = vi.fn(async () => new Response("should not be fetched"));
    vi.stubGlobal("fetch", globalFetch);
    try {
      const h = makeHarness();
      const res = await h.get(`/api/setlist-links?url=${url}`);
      expect(res.status).toBe(200);
      expect(res.body).toStrictEqual({ setlistId });
      expectContract(setlistLinksResponseSchema, res.body);
      expect(h.http.requests).toEqual([]);
      expect(h.host.asked).toBe(0);
      expect(globalFetch).not.toHaveBeenCalled();
      expectNoLeaks(res);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it.each([
    ["a link to another site", "/api/setlist-links?url=https://example.com/x"],
    ["a setlist.fm search page", "/api/setlist-links?url=https://www.setlist.fm/search?query=pearl+jam"],
    [
      "an Artist's Setlists page",
      "/api/setlist-links?url=https://www.setlist.fm/setlists/arctic-monkeys-63d6a6b7.html",
    ],
    [
      "a Setlist link with no id",
      "/api/setlist-links?url=https://www.setlist.fm/setlist/radiohead/2025/o2-arena-london-england.html",
    ],
    ["no url", "/api/setlist-links"],
    ["an empty url", "/api/setlist-links?url="],
    ["a url of 2049 characters", `/api/setlist-links?url=https://www.setlist.fm/setlist/${"a".repeat(2049 - 31 - 14)}-2bf1c8e4.html`],
    [
      "the url given twice",
      "/api/setlist-links?url=https://www.setlist.fm/setlist/pearl-jam/2026/moda-center-portland-or-2bf1c8e4.html&url=https://example.com/x",
    ],
  ])("AC-14: %s → 400 E-3; no request", async (_why, path) => {
    const globalFetch = vi.fn(async () => new Response("should not be fetched"));
    vi.stubGlobal("fetch", globalFetch);
    try {
      const h = makeHarness();
      const res = await h.get(path);
      expectCatalogueError(res, "E-3");
      expect(h.http.requests).toEqual([]);
      expect(globalFetch).not.toHaveBeenCalled();
      expectNoLeaks(res);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("AC-14: a link whose id is longer than the contract's 32 hex characters → 400 E-3", async () => {
    const h = makeHarness();
    const res = await h.get(
      `/api/setlist-links?url=https://www.setlist.fm/setlist/pearl-jam/2026/moda-center-portland-or-${"a".repeat(33)}.html`,
    );
    expectCatalogueError(res, "E-3");
    expect(h.http.requests).toEqual([]);
  });
});
