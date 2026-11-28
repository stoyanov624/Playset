// Artist search — GET /api/artists?name=… (X4). setlist.fm is the routed fake behind the core's
// real services, so the find-Artists step and its errors are the real ones.
import { describe, expect, it } from "vitest";
import { artistsResponseSchema } from "../../../src/web/shared/index.js";
import { expectCatalogueError } from "./fixtures/catalogue";
import {
  answer,
  expectContract,
  expectNoLeaks,
  makeHarness,
  networkFailure,
  setlistFmRateLimited,
} from "./fixtures/harness";
import {
  arcticMonkeysAnswer,
  arcticMonkeysSearchPayload,
  genesisAnswer,
  genesisSearchPayload,
} from "./fixtures/setlists";

const searchedNames = (h: ReturnType<typeof makeHarness>) =>
  h.setlistFmRequests()
    .filter((r) => r.url.pathname === "/rest/1.0/search/artists")
    .map((r) => r.url.searchParams.get("artistName"));

describe("GET /api/artists — candidates (AC-10)", () => {
  it("AC-10: '  Genesis ' → one search for the trimmed name; 200 with every candidate in order, disambiguation only when given", async () => {
    const h = makeHarness();
    h.artistSearches.Genesis = genesisSearchPayload();
    const res = await h.get("/api/artists?name=%20%20Genesis%20");
    expect(res.status).toBe(200);
    expect(String(res.headers["content-type"])).toMatch(/^application\/json/);
    expect(res.body).toStrictEqual(genesisAnswer());
    expectContract(artistsResponseSchema, res.body);
    expect(searchedNames(h)).toEqual(["Genesis"]);
    expect(h.spotifyRequests()).toEqual([]);
    expectNoLeaks(res);
  });

  it("AC-10: an exact single match (the core's autoPick) → the same shape, no autoPick key", async () => {
    const h = makeHarness();
    h.artistSearches["Arctic Monkeys"] = arcticMonkeysSearchPayload();
    const res = await h.get("/api/artists?name=Arctic%20Monkeys");
    expect(res.status).toBe(200);
    expect(res.body).toStrictEqual(arcticMonkeysAnswer());
    expect(Object.keys(res.body as object)).toEqual(["artists"]);
    expect(res.text).not.toContain("autoPick");
    expect(res.text).not.toContain("sortName");
    expect(res.text).not.toContain("setlists/arctic-monkeys");
    expectContract(artistsResponseSchema, res.body);
  });

  it.each([
    ["no name", "/api/artists"],
    ["an empty name", "/api/artists?name="],
    ["a whitespace-only name", "/api/artists?name=%20%20"],
    ["a name of 201 characters", `/api/artists?name=${"A".repeat(201)}`],
    ["the name given twice", "/api/artists?name=Genesis&name=Pearl%20Jam"],
  ])("AC-10: %s → 400 E-1; no step runs", async (_why, path) => {
    const h = makeHarness();
    h.artistSearches.Genesis = genesisSearchPayload();
    const res = await h.get(path);
    expectCatalogueError(res, "E-1");
    expect(h.http.requests).toEqual([]);
    expectNoLeaks(res);
  });

  it("AC-10: a name of exactly 200 characters is searched", async () => {
    const h = makeHarness();
    const res = await h.get(`/api/artists?name=${"A".repeat(200)}`);
    expect(res.status).toBe(200);
    expect(searchedNames(h)).toEqual(["A".repeat(200)]);
  });
});

describe("GET /api/artists — errors (AC-11)", () => {
  it("AC-11: setlist.fm finds no Artist ('Xyzzq Nonexistent') → 200 { artists: [] }", async () => {
    const h = makeHarness();
    const res = await h.get("/api/artists?name=Xyzzq%20Nonexistent");
    expect(res.status).toBe(200);
    expect(res.body).toStrictEqual({ artists: [] });
    expectContract(artistsResponseSchema, res.body);
    expect(h.log.of("error")).toEqual([]);
  });

  it("AC-11: the setlist.fm rate-limit error → 429 E-14 with Retry-After: 60", async () => {
    const h = makeHarness();
    h.artistSearches.Genesis = setlistFmRateLimited;
    const res = await h.get("/api/artists?name=Genesis");
    expectCatalogueError(res, "E-14");
    expectNoLeaks(res);
  });

  it("AC-11: a setlist.fm request error, HTTP 503 → 502 E-16", async () => {
    const h = makeHarness();
    h.artistSearches.Genesis = answer(503, { code: 503, status: "Service Unavailable", message: "upstream down" });
    const res = await h.get("/api/artists?name=Genesis");
    expectCatalogueError(res, "E-16");
    expect(res.text).not.toContain("503");
    expect(res.text).not.toContain("upstream down");
    expectNoLeaks(res);
  });

  it("AC-11: a setlist.fm network failure → 502 E-16", async () => {
    const h = makeHarness();
    h.artistSearches.Genesis = networkFailure;
    const res = await h.get("/api/artists?name=Genesis");
    expectCatalogueError(res, "E-16");
    expect(res.text).not.toContain("ECONNRESET");
    expectNoLeaks(res);
  });

  it("AC-11: the missing-setlist.fm-key error → 500 E-25 (its CLI wording never sent)", async () => {
    const h = makeHarness({ setlistFmKey: null });
    const res = await h.get("/api/artists?name=Genesis");
    expectCatalogueError(res, "E-25");
    expect(res.text).not.toContain("config");
    expectNoLeaks(res);
  });

  it("AC-11: any other error from the step → 500 E-25", async () => {
    const h = makeHarness();
    h.overrides.everyServiceThrows = new Error("boom while searching");
    const res = await h.get("/api/artists?name=Genesis");
    expectCatalogueError(res, "E-25");
    expectNoLeaks(res);
  });
});
