import { describe, expect, it } from "vitest";
import {
  ArtistChoiceCancelledError,
  ArtistNotFoundError,
  NoSetlistError,
  SetlistFmRateLimitError,
  SetlistFmRequestError,
  SetlistNotFoundError,
} from "../../src/core/setlistfm";
import {
  API_BASE,
  API_KEY,
  ARCTIC_MONKEYS,
  T0,
  captureError,
  emptySetlistsPage,
  errorText,
  forbidden,
  loadFixture,
  loadFixtureA,
  makeChooser,
  makeClient,
  makeFakes,
  networkFailure,
  notFound,
  ok,
  paths,
  serverError,
  serviceUnavailable,
  tooManyRequests,
  unauthorized,
  type ResponseFactory,
} from "./helpers";

const SETLIST_ID = "63a5e2b7";

describe("requests to setlist.fm", () => {
  it("AC-5: fetching a Setlist sends GET to the setlist.fm REST 1.0 URL with x-api-key, Accept and Accept-Language headers", async () => {
    const fakes = makeFakes([ok(loadFixtureA())]);
    await makeClient(fakes).getSetlist(SETLIST_ID);
    expect(fakes.requests).toHaveLength(1);
    const req = fakes.requests[0]!;
    expect(req.method).toBe("GET");
    expect(req.url).toBe(`${API_BASE}/setlist/${SETLIST_ID}`);
    expect(req.headers.get("x-api-key")).toBe(API_KEY);
    expect(req.headers.get("accept")).toBe("application/json");
    expect(req.headers.get("accept-language")).toBe("en");
  });

  it("AC-5: Artist search and setlist pages go to https://api.setlist.fm/rest/1.0/ with the same method and headers", async () => {
    const fakes = makeFakes([
      ok(loadFixture("search-arctic-monkeys.json")),
      ok(loadFixture("setlists-arctic-monkeys-p1.json")),
    ]);
    const { chooser } = makeChooser(0);
    await makeClient(fakes).findLatestSetlistByArtistName("Arctic Monkeys", chooser);
    expect(fakes.requests).toHaveLength(2);
    for (const req of fakes.requests) {
      expect(req.url.startsWith(`${API_BASE}/`)).toBe(true);
      expect(req.method).toBe("GET");
      expect(req.headers.get("x-api-key")).toBe(API_KEY);
      expect(req.headers.get("accept")).toBe("application/json");
      expect(req.headers.get("accept-language")).toBe("en");
    }
  });
});

describe("throttling", () => {
  it("AC-6: the first request of a client is not delayed", async () => {
    const fakes = makeFakes([ok(loadFixtureA())]);
    await makeClient(fakes).getSetlist(SETLIST_ID);
    expect(fakes.requests[0]!.at).toBe(T0);
    expect(fakes.sleeps.reduce((a, b) => a + b, 0)).toBe(0);
  });

  it("AC-6: a search followed by two pages of setlists start at t+0, t+500 and t+1000 ms", async () => {
    const fakes = makeFakes([
      ok(loadFixture("search-arctic-monkeys.json")),
      ok(emptySetlistsPage(1, 1047)),
      ok({ type: "setlists", itemsPerPage: 20, page: 2, total: 1047, setlist: [loadFixtureA()] }),
    ]);
    const { chooser } = makeChooser(0);
    await makeClient(fakes).findLatestSetlistByArtistName("Arctic Monkeys", chooser);
    expect(fakes.requests.map((r) => r.at - T0)).toEqual([0, 500, 1000]);
    expect(fakes.sleep).toHaveBeenCalled();
  });

  it("AC-6: several fetches by id on one client each start at least 500 ms after the previous one", async () => {
    const fakes = makeFakes([ok(loadFixtureA()), ok(loadFixtureA()), ok(loadFixtureA())]);
    const client = makeClient(fakes);
    await client.getSetlist(SETLIST_ID);
    await client.getSetlist(SETLIST_ID);
    await client.getSetlist(SETLIST_ID);
    const times = fakes.requests.map((r) => r.at);
    expect(times).toHaveLength(3);
    expect(times[1]! - times[0]!).toBeGreaterThanOrEqual(500);
    expect(times[2]! - times[1]!).toBeGreaterThanOrEqual(500);
    // waiting happened only through the injected sleep: the clock never moves otherwise
    expect(times[2]! - T0).toBe(fakes.sleeps.reduce((a, b) => a + b, 0));
  });

  it("AC-6: when 800 ms already passed on the clock, the next request is sent without waiting", async () => {
    const fakes = makeFakes();
    fakes.enqueue(() => {
      fakes.advance(800);
      return ok(loadFixtureA())();
    }, ok(loadFixtureA()));
    const client = makeClient(fakes);
    await client.getSetlist(SETLIST_ID);
    await client.getSetlist(SETLIST_ID);
    expect(fakes.requests.map((r) => r.at - T0)).toEqual([0, 800]);
    expect(fakes.sleeps.reduce((a, b) => a + b, 0)).toBe(0);
  });

  it("AC-6: when only 200 ms passed on the clock, the client waits the remaining 300 ms", async () => {
    const fakes = makeFakes();
    fakes.enqueue(() => {
      fakes.advance(200);
      return ok(loadFixtureA())();
    }, ok(loadFixtureA()));
    const client = makeClient(fakes);
    await client.getSetlist(SETLIST_ID);
    await client.getSetlist(SETLIST_ID);
    expect(fakes.requests.map((r) => r.at - T0)).toEqual([0, 500]);
    expect(fakes.sleeps.reduce((a, b) => a + b, 0)).toBe(300);
  });
});

describe("rate limit (HTTP 429)", () => {
  it("AC-7: on 429 with Retry-After: 2, waits 2 s through the injected sleep and sends the same request again", async () => {
    const fixtureA = loadFixtureA();
    const fakes = makeFakes([tooManyRequests("2"), ok(fixtureA)]);
    const setlist = await makeClient(fakes).getSetlist(SETLIST_ID);
    expect(setlist).toEqual(fixtureA);
    expect(fakes.requests).toHaveLength(2);
    expect(fakes.requests[1]!.url).toBe(fakes.requests[0]!.url);
    expect(fakes.requests[1]!.method).toBe("GET");
    expect(fakes.requests[1]!.headers.get("x-api-key")).toBe(API_KEY);
    expect(fakes.sleeps).toContain(2000);
    expect(fakes.requests[1]!.at - fakes.requests[0]!.at).toBeGreaterThanOrEqual(2000);
  });

  const fallbackCases: Array<[string, string | null]> = [
    ["the Retry-After header is missing", null],
    ["Retry-After is not a whole number of seconds (\"soon\")", "soon"],
    ["Retry-After is fractional (\"1.5\")", "1.5"],
  ];

  for (const [label, header] of fallbackCases) {
    it(`AC-7: waits 1 s and retries when ${label}`, async () => {
      const fixtureA = loadFixtureA();
      const fakes = makeFakes([tooManyRequests(header), ok(fixtureA)]);
      const setlist = await makeClient(fakes).getSetlist(SETLIST_ID);
      expect(setlist).toEqual(fixtureA);
      expect(fakes.requests).toHaveLength(2);
      expect(fakes.sleeps).toContain(1000);
      expect(fakes.requests[1]!.at - fakes.requests[0]!.at).toBeGreaterThanOrEqual(1000);
    });
  }

  it("AC-8: after 429 to the first request and to 3 retries, exactly 4 requests are sent and a rate-limit error is raised", async () => {
    const fakes = makeFakes([
      tooManyRequests("1"),
      tooManyRequests("1"),
      tooManyRequests("1"),
      tooManyRequests("1"),
      ok(loadFixtureA()),
    ]);
    const err = await captureError(makeClient(fakes).getSetlist(SETLIST_ID));
    expect(err).toBeInstanceOf(SetlistFmRateLimitError);
    expect(fakes.requests).toHaveLength(4);
    expect(fakes.sleeps.filter((ms) => ms === 1000)).toHaveLength(3);
  });

  it("AC-8: when a retry succeeds, its result is used as if the first request had succeeded", async () => {
    const search = loadFixture("search-arctic-monkeys.json");
    const page = loadFixture("setlists-arctic-monkeys-p1.json");
    const fakes = makeFakes([tooManyRequests("1"), tooManyRequests("1"), ok(search), ok(page)]);
    const { chooser } = makeChooser(0);
    const result = await makeClient(fakes).findLatestSetlistByArtistName("Arctic Monkeys", chooser);
    expect(result.artist).toEqual(ARCTIC_MONKEYS);
    expect(result.setlist).toEqual(page.setlist[2]);
    expect(paths(fakes.requests)).toEqual([
      "/rest/1.0/search/artists",
      "/rest/1.0/search/artists",
      "/rest/1.0/search/artists",
      `/rest/1.0/artist/${ARCTIC_MONKEYS.mbid}/setlists`,
    ]);
  });

  it("AC-8: retries also respect the 500 ms spacing (Retry-After: 0)", async () => {
    const fakes = makeFakes([tooManyRequests("0"), tooManyRequests("0"), ok(loadFixtureA())]);
    await makeClient(fakes).getSetlist(SETLIST_ID);
    const times = fakes.requests.map((r) => r.at);
    expect(times).toHaveLength(3);
    expect(times[1]! - times[0]!).toBeGreaterThanOrEqual(500);
    expect(times[2]! - times[1]!).toBeGreaterThanOrEqual(500);
  });
});

describe("other failures", () => {
  const statusCases: Array<[number, ResponseFactory]> = [
    [401, unauthorized],
    [403, forbidden],
    [500, serverError],
    [503, serviceUnavailable],
  ];

  for (const [status, response] of statusCases) {
    it(`AC-9: HTTP ${status} raises a request error containing ${status}, with no retry`, async () => {
      const fakes = makeFakes([response, ok(loadFixtureA())]);
      const err = await captureError(makeClient(fakes).getSetlist(SETLIST_ID));
      expect(err).toBeInstanceOf(SetlistFmRequestError);
      expect((err as SetlistFmRequestError).status).toBe(status);
      expect(errorText(err)).toContain(String(status));
      expect(fakes.requests).toHaveLength(1);
    });
  }

  it("AC-9: a network error from the injected fetch raises a request error, with no retry", async () => {
    const fakes = makeFakes([networkFailure, ok(loadFixtureA())]);
    const err = await captureError(makeClient(fakes).getSetlist(SETLIST_ID));
    expect(err).toBeInstanceOf(SetlistFmRequestError);
    expect((err as SetlistFmRequestError).status).toBeUndefined();
    expect(fakes.requests).toHaveLength(1);
  });

  it("AC-9: HTTP 500 to the Artist search raises a request error and the chooser is not called", async () => {
    const fakes = makeFakes([serverError]);
    const { chooser } = makeChooser(0);
    const err = await captureError(makeClient(fakes).findArtist("Arctic Monkeys", chooser));
    expect(err).toBeInstanceOf(SetlistFmRequestError);
    expect(chooser).not.toHaveBeenCalled();
    expect(fakes.requests).toHaveLength(1);
  });

  it("AC-10: fetching a Setlist by id sends exactly one GET /setlist/{id} and returns the body unchanged", async () => {
    const fakes = makeFakes([ok(loadFixtureA())]);
    const setlist = await makeClient(fakes).getSetlist(SETLIST_ID);
    expect(setlist).toEqual(loadFixtureA());
    expect(fakes.requests).toHaveLength(1);
    expect(fakes.requests[0]!.parsed.pathname).toBe(`/rest/1.0/setlist/${SETLIST_ID}`);
  });

  it("AC-10: HTTP 404 raises a setlist-not-found error naming the id", async () => {
    const fakes = makeFakes([notFound]);
    const err = await captureError(makeClient(fakes).getSetlist("deadbeef"));
    expect(err).toBeInstanceOf(SetlistNotFoundError);
    expect(err).not.toBeInstanceOf(SetlistFmRequestError);
    expect(errorText(err)).toContain("deadbeef");
    expect(fakes.requests).toHaveLength(1);
    expect(fakes.requests[0]!.parsed.pathname).toBe("/rest/1.0/setlist/deadbeef");
  });
});

describe("the API key never leaks into errors", () => {
  async function errorsFor(): Promise<Array<[string, unknown]>> {
    const out: Array<[string, unknown]> = [];

    let fakes = makeFakes([tooManyRequests("1"), tooManyRequests("1"), tooManyRequests("1"), tooManyRequests("1")]);
    out.push(["rate limit", await captureError(makeClient(fakes).getSetlist(SETLIST_ID))]);

    fakes = makeFakes([forbidden]);
    out.push(["403", await captureError(makeClient(fakes).getSetlist(SETLIST_ID))]);

    fakes = makeFakes([serviceUnavailable]);
    out.push(["503", await captureError(makeClient(fakes).getSetlist(SETLIST_ID))]);

    fakes = makeFakes([networkFailure]);
    out.push(["network", await captureError(makeClient(fakes).getSetlist(SETLIST_ID))]);

    fakes = makeFakes([notFound]);
    out.push(["setlist not found", await captureError(makeClient(fakes).getSetlist("deadbeef"))]);

    fakes = makeFakes([ok(loadFixture("search-genesis.json"))]);
    out.push(["cancelled", await captureError(makeClient(fakes).findArtist("Genesis", makeChooser(null).chooser))]);

    fakes = makeFakes([notFound]);
    out.push([
      "Artist not found",
      await captureError(makeClient(fakes).findArtist("Xyzzq Nonexistent", makeChooser(0).chooser)),
    ]);

    fakes = makeFakes([notFound]);
    out.push(["no Setlist", await captureError(makeClient(fakes).findLatestSetlist(ARCTIC_MONKEYS))]);

    return out;
  }

  it("AC-11: rate-limit, request, not-found, cancelled, Artist-not-found and no-Setlist errors never contain the API key", async () => {
    const errors = await errorsFor();
    const expectedTypes = [
      SetlistFmRateLimitError,
      SetlistFmRequestError,
      SetlistFmRequestError,
      SetlistFmRequestError,
      SetlistNotFoundError,
      ArtistChoiceCancelledError,
      ArtistNotFoundError,
      NoSetlistError,
    ];
    errors.forEach(([label, err], i) => {
      expect(err, label).toBeInstanceOf(expectedTypes[i]!);
      expect(errorText(err), label).not.toContain(API_KEY);
    });
  });
});
