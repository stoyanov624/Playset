// A path parameter whose percent-encoding can't be decoded (`%E0%A4%A`) is a Visitor's bad input,
// not a server fault: each route answers its own INVALID_INPUT entry for a rejected id or mbid,
// logs nothing as a warning or error, asks no upstream service and records no usage event.
import { describe, expect, it } from "vitest";
import { expectCatalogueError } from "./fixtures/catalogue";
import { expectNoLeaks, makeHarness, type Harness } from "./fixtures/harness";
import { H_V1 } from "./fixtures/setlists";

const BAD = "%E0%A4%A";

function expectNothingElseHappened(h: Harness) {
  expect(h.log.of("error")).toEqual([]);
  expect(h.log.of("warn")).toEqual([]);
  expect(h.http.requests).toEqual([]);
  expect(h.matchSearches).toEqual([]);
  expect(h.host.asked).toBe(0);
  expect(h.usage.recorded).toEqual([]);
}

describe("a setlist id or mbid with broken percent-encoding", () => {
  it("AC-17: GET /api/setlists/%E0%A4%A → 400 E-4; no log warning or error, no request, no usage event", async () => {
    const h = makeHarness();
    const res = await h.get(`/api/setlists/${BAD}`);
    expectCatalogueError(res, "E-4");
    expectNoLeaks(res);
    expectNothingElseHappened(h);
  });

  it("AC-19: GET /api/setlists/%E0%A4%A/preview → 400 E-4 as JSON (no stream); no log warning or error, no request, no usage event", async () => {
    const h = makeHarness();
    const res = await h.get(`/api/setlists/${BAD}/preview`);
    expectCatalogueError(res, "E-4");
    expectNoLeaks(res);
    expectNothingElseHappened(h);
  });

  it("AC-13: GET /api/artists/%E0%A4%A/setlists → 400 E-2; no log warning or error, no step, no usage event", async () => {
    const h = makeHarness();
    const res = await h.get(`/api/artists/${BAD}/setlists`);
    expectCatalogueError(res, "E-2");
    expectNoLeaks(res);
    expectNothingElseHappened(h);
  });

  it("AC-27: POST /api/setlists/%E0%A4%A/playlist with a valid body → 400 E-4; no log warning or error, no request, nothing counted", async () => {
    const h = makeHarness({ env: { PLAYSET_CREATE_LIMIT: "1", PLAYSET_DAILY_LIMIT: "1" } });
    const res = await h.post(`/api/setlists/${BAD}/playlist`, { versionId: H_V1 });
    expectCatalogueError(res, "E-4");
    expectNoLeaks(res);
    expectNothingElseHappened(h);
    expect(h.hits.added).toEqual([]);
  });
});
