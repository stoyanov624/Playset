import { describe, expect, it } from "vitest";
import {
  HttpError,
  PlaysetError,
  createRequester,
  type RequestPolicy,
} from "../../src/core/http/index.js";
import {
  T0,
  captureError,
  causeChain,
  chainText,
  fakeClock,
  ok,
  scriptedFetch,
  spotifyError,
  tooManyRequests,
  type Answer,
} from "./fixtures/fakes";

const SETLISTFM_URL = "https://api.setlist.fm/rest/1.0/setlist/63a5e2b7";
const SPOTIFY_SEARCH_URL = "https://api.spotify.com/v1/search?q=track%3A%22Creep%22&type=track&limit=10";
const SPOTIFY_PLAYLISTS_URL = "https://api.spotify.com/v1/me/playlists";

const API_KEY = "sfm-test-key-0f3c9a";
const ACCESS_TOKEN = "BQDj8Zk2-access-token-secret";

/** Builds a requester over scripted answers and a fake clock that only moves through sleep. */
function setup(policy: Partial<RequestPolicy> & { name?: string }, answers: Answer[]) {
  const clock = fakeClock();
  const { fetch, calls } = scriptedFetch(answers, clock);
  const request = createRequester(
    { name: "Spotify search", maxAttempts: 4, ...policy } as RequestPolicy,
    { fetch, sleep: clock.sleep, now: clock.now },
  );
  return { request, calls, clock };
}

const positive = (sleeps: number[]) => sleeps.filter((ms) => ms > 0);
const starts = (calls: { at: number }[]) => calls.map((c) => c.at - T0);

// ---------------------------------------------------------------- success

describe("createRequester — successful requests", () => {
  it("resolves with the 2xx Response from one fetch, body readable", async () => {
    const { request, calls, clock } = setup({}, [ok({ tracks: { items: [] } })]);

    const res = await request(SPOTIFY_SEARCH_URL);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ tracks: { items: [] } });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(SPOTIFY_SEARCH_URL);
    expect(positive(clock.sleeps)).toEqual([]);
  });

  it("passes the RequestInit (method, headers, body) through to fetch", async () => {
    const init: RequestInit = {
      method: "POST",
      headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Arctic Monkeys – 2025-08-23 – Amsterdam", public: false }),
    };
    const { request, calls } = setup({ name: "Spotify playlist" }, [
      { status: 201, body: { id: "8HiJkLmNoPqRsTuVwXyZaB" } },
    ]);

    const res = await request(SPOTIFY_PLAYLISTS_URL, init);

    expect(res.status).toBe(201);
    expect(calls[0]!.init?.method).toBe("POST");
    expect(new Headers(calls[0]!.init?.headers).get("authorization")).toBe(`Bearer ${ACCESS_TOKEN}`);
    expect(calls[0]!.init?.body).toBe(init.body);
  });

  it("treats every 2xx status as success (200, 201, 204)", async () => {
    for (const status of [200, 201, 204]) {
      const { request, calls } = setup({}, [{ status }]);
      const res = await request(SPOTIFY_SEARCH_URL);
      expect(res.status).toBe(status);
      expect(calls).toHaveLength(1);
    }
  });
});

// ---------------------------------------------------------------- 429

describe("createRequester — HTTP 429 and Retry-After", () => {
  it("on 429 with Retry-After: 2 waits 2000 ms, then resends the same request and resolves with its response", async () => {
    const init: RequestInit = { method: "GET", headers: { "x-api-key": API_KEY, Accept: "application/json" } };
    const { request, calls, clock } = setup({ name: "setlist.fm" }, [tooManyRequests("2"), ok({ id: "63a5e2b7" })]);

    const res = await request(SETLISTFM_URL, init);

    expect(await res.json()).toEqual({ id: "63a5e2b7" });
    expect(calls).toHaveLength(2);
    expect(calls[1]!.url).toBe(calls[0]!.url);
    expect(calls[1]!.init?.method).toBe("GET");
    expect(new Headers(calls[1]!.init?.headers).get("x-api-key")).toBe(API_KEY);
    expect(clock.sleeps).toEqual([2000]);
    expect(calls[1]!.at - calls[0]!.at).toBe(2000);
  });

  it("resends the same POST body after a 429", async () => {
    const body = JSON.stringify({ uris: ["spotify:track:003vvx7Niy0yvhvHt4a68B"] });
    const { request, calls } = setup({ name: "Spotify playlist" }, [
      tooManyRequests("1"),
      { status: 201, body: { snapshot_id: "abc" } },
    ]);

    await request("https://api.spotify.com/v1/playlists/8HiJkLmNoPqRsTuVwXyZaB/items", { method: "POST", body });

    expect(calls).toHaveLength(2);
    expect(calls[1]!.init?.method).toBe("POST");
    expect(calls[1]!.init?.body).toBe(body);
  });

  const retryAfterCases: Array<[string, string | null, number]> = [
    ["an integer number of seconds (\"2\")", "2", 2000],
    ["an integer number of seconds (\"3\")", "3", 3000],
    ["a decimal number of seconds (\"1.5\")", "1.5", 1500],
    ["a decimal number of seconds (\"0.5\")", "0.5", 500],
    ["missing", null, 1000],
    ["empty", "", 1000],
    ["only whitespace", "   ", 1000],
    ["unparseable (\"abc\")", "abc", 1000],
    ["unparseable (\"soon\")", "soon", 1000],
  ];

  for (const [label, header, expectedMs] of retryAfterCases) {
    it(`waits ${expectedMs} ms when Retry-After is ${label}`, async () => {
      const { request, calls, clock } = setup({}, [tooManyRequests(header), ok()]);

      const res = await request(SPOTIFY_SEARCH_URL);

      expect(res.status).toBe(200);
      expect(calls).toHaveLength(2);
      expect(clock.sleeps).toEqual([expectedMs]);
      expect(calls[1]!.at - calls[0]!.at).toBe(expectedMs);
    });
  }

  it("does not wait when Retry-After is \"0\" (no throttle)", async () => {
    const { request, calls, clock } = setup({}, [tooManyRequests("0"), ok()]);

    await request(SPOTIFY_SEARCH_URL);

    expect(calls).toHaveLength(2);
    expect(positive(clock.sleeps)).toEqual([]);
    expect(calls[1]!.at).toBe(calls[0]!.at);
  });

  it("after maxAttempts requests all answered 429, fails with a rate-limited HttpError; no wait after the last one", async () => {
    const { request, calls, clock } = setup({ name: "Spotify search", maxAttempts: 4 }, [
      tooManyRequests("1"),
      tooManyRequests("1"),
      tooManyRequests("1"),
      tooManyRequests("1"),
      ok(),
    ]);

    const err = await captureError(() => request(SPOTIFY_SEARCH_URL));

    expect(err).toBeInstanceOf(HttpError);
    expect(err).toBeInstanceOf(PlaysetError);
    const httpErr = err as HttpError;
    expect(httpErr.kind).toBe("rate-limited");
    expect(httpErr.status).toBe(429);
    expect(httpErr.message).toMatch(/rate[- ]?limit/i);
    expect(httpErr.message).toContain("Spotify search");
    expect(httpErr.name).toBe("HttpError");
    expect(calls).toHaveLength(4);
    expect(clock.sleeps).toEqual([1000, 1000, 1000]);
  });

  it("maxAttempts is the total number of requests (3 for the Spotify token endpoint)", async () => {
    const { request, calls } = setup({ name: "Spotify token", maxAttempts: 3 }, [
      tooManyRequests("2"),
      tooManyRequests("2"),
      tooManyRequests("2"),
      ok(),
    ]);

    const err = (await captureError(() =>
      request("https://accounts.spotify.com/api/token", { method: "POST" }),
    )) as HttpError;

    expect(err.kind).toBe("rate-limited");
    expect(err.message).toContain("Spotify token");
    expect(calls).toHaveLength(3);
  });

  it("with maxAttempts 1 a single 429 fails at once without waiting", async () => {
    const { request, calls, clock } = setup({ maxAttempts: 1 }, [tooManyRequests("5"), ok()]);

    const err = (await captureError(() => request(SPOTIFY_SEARCH_URL))) as HttpError;

    expect(err.kind).toBe("rate-limited");
    expect(calls).toHaveLength(1);
    expect(positive(clock.sleeps)).toEqual([]);
  });

  it("a retry that succeeds is used as if the first request had succeeded", async () => {
    const { request, calls } = setup({ maxAttempts: 4 }, [
      tooManyRequests("1"),
      tooManyRequests("1"),
      tooManyRequests("1"),
      ok({ page: 1 }),
    ]);

    const res = await request(SPOTIFY_SEARCH_URL);

    expect(await res.json()).toEqual({ page: 1 });
    expect(calls).toHaveLength(4);
  });

  it("each call has its own attempt budget", async () => {
    const limited = tooManyRequests("1");
    const { request, calls } = setup({ maxAttempts: 4 }, [
      limited,
      limited,
      limited,
      ok({ page: 1 }),
      limited,
      limited,
      limited,
      ok({ page: 2 }),
    ]);

    expect(await (await request(`${SPOTIFY_PLAYLISTS_URL}?offset=0&limit=50`)).json()).toEqual({ page: 1 });
    expect(await (await request(`${SPOTIFY_PLAYLISTS_URL}?offset=50&limit=50`)).json()).toEqual({ page: 2 });
    expect(calls).toHaveLength(8);
  });
});

// ---------------------------------------------------------------- throttle

describe("createRequester — throttle (minIntervalMs)", () => {
  it("the first request never waits", async () => {
    const { request, calls, clock } = setup({ name: "setlist.fm", minIntervalMs: 500 }, [ok()]);

    await request(SETLISTFM_URL);

    expect(starts(calls)).toEqual([0]);
    expect(clock.sleeps).toEqual([]);
  });

  it("back-to-back requests start minIntervalMs apart, waiting only through sleep", async () => {
    const { request, calls, clock } = setup({ name: "setlist.fm", minIntervalMs: 500 }, [ok(), ok(), ok()]);

    await request(SETLISTFM_URL);
    await request(SETLISTFM_URL);
    await request(SETLISTFM_URL);

    expect(starts(calls)).toEqual([0, 500, 1000]);
    expect(clock.sleeps).toEqual([500, 500]);
  });

  it("waits only the remainder when some time already passed (200 ms passed → waits 300 ms)", async () => {
    const { request, calls, clock } = setup({ name: "setlist.fm", minIntervalMs: 500 }, [
      { status: 200, body: {}, advance: 200 },
      ok(),
    ]);

    await request(SETLISTFM_URL);
    await request(SETLISTFM_URL);

    expect(starts(calls)).toEqual([0, 500]);
    expect(clock.sleeps).toEqual([300]);
  });

  it("does not call sleep at all when minIntervalMs already passed (800 ms passed)", async () => {
    const { request, calls, clock } = setup({ name: "setlist.fm", minIntervalMs: 500 }, [
      { status: 200, body: {}, advance: 800 },
      ok(),
    ]);

    await request(SETLISTFM_URL);
    await request(SETLISTFM_URL);

    expect(starts(calls)).toEqual([0, 800]);
    expect(clock.sleeps).toEqual([]);
  });

  it("does not call sleep when exactly minIntervalMs already passed", async () => {
    const { request, calls, clock } = setup({ name: "setlist.fm", minIntervalMs: 500 }, [
      { status: 200, body: {}, advance: 500 },
      ok(),
    ]);

    await request(SETLISTFM_URL);
    await request(SETLISTFM_URL);

    expect(starts(calls)).toEqual([0, 500]);
    expect(clock.sleeps).toEqual([]);
  });

  it("without minIntervalMs, back-to-back requests never wait", async () => {
    const { request, calls, clock } = setup({}, [ok(), ok(), ok()]);

    await request(SPOTIFY_SEARCH_URL);
    await request(SPOTIFY_SEARCH_URL);
    await request(SPOTIFY_SEARCH_URL);

    expect(starts(calls)).toEqual([0, 0, 0]);
    expect(clock.sleeps).toEqual([]);
  });

  it("retries after 429 also respect the throttle (Retry-After: 0 → 500 ms apart)", async () => {
    const { request, calls } = setup({ name: "setlist.fm", minIntervalMs: 500 }, [
      tooManyRequests("0"),
      tooManyRequests("0"),
      ok(),
    ]);

    await request(SETLISTFM_URL);

    expect(starts(calls)).toEqual([0, 500, 1000]);
  });

  it("a retry starts no earlier than both the Retry-After wait and the throttle allow (Retry-After longer)", async () => {
    const { request, calls, clock } = setup({ name: "setlist.fm", minIntervalMs: 500 }, [tooManyRequests("2"), ok()]);

    await request(SETLISTFM_URL);

    expect(calls).toHaveLength(2);
    expect(calls[1]!.at - calls[0]!.at).toBeGreaterThanOrEqual(2000);
    expect(calls[1]!.at - calls[0]!.at).toBeLessThan(2500);
    // the clock moved only through the injected sleep
    expect(calls[1]!.at - T0).toBe(clock.sleeps.reduce((a, b) => a + b, 0));
  });

  it("a retry starts no earlier than both the Retry-After wait and the throttle allow (throttle longer)", async () => {
    const { request, calls } = setup({ name: "setlist.fm", minIntervalMs: 2000 }, [tooManyRequests("0.5"), ok()]);

    await request(SETLISTFM_URL);

    expect(calls[1]!.at - calls[0]!.at).toBeGreaterThanOrEqual(2000);
    expect(calls[1]!.at - calls[0]!.at).toBeLessThan(2500);
  });

  it("a decimal Retry-After combines with the throttle (\"1.5\" with 500 ms → at least 1500 ms)", async () => {
    const { request, calls } = setup({ name: "setlist.fm", minIntervalMs: 500 }, [tooManyRequests("1.5"), ok()]);

    await request(SETLISTFM_URL);

    expect(calls[1]!.at - calls[0]!.at).toBeGreaterThanOrEqual(1500);
    expect(calls[1]!.at - calls[0]!.at).toBeLessThan(2000);
  });

  it("the throttle spans calls that ended in an error", async () => {
    const { request, calls } = setup({ name: "setlist.fm", minIntervalMs: 500 }, [
      { status: 500, body: { code: 500, status: "Internal Server Error" } },
      ok(),
    ]);

    await captureError(() => request(SETLISTFM_URL));
    await request(SETLISTFM_URL);

    expect(starts(calls)).toEqual([0, 500]);
  });

  it("each requester has its own throttle: the first request of a second requester does not wait", async () => {
    const clock = fakeClock();
    const a = scriptedFetch([ok()], clock);
    const b = scriptedFetch([ok()], clock);
    const first = createRequester({ name: "setlist.fm", maxAttempts: 4, minIntervalMs: 500 }, {
      fetch: a.fetch,
      sleep: clock.sleep,
      now: clock.now,
    });
    const second = createRequester({ name: "setlist.fm", maxAttempts: 4, minIntervalMs: 500 }, {
      fetch: b.fetch,
      sleep: clock.sleep,
      now: clock.now,
    });

    await first(SETLISTFM_URL);
    await second(SETLISTFM_URL);

    expect(clock.sleeps).toEqual([]);
  });
});

// ---------------------------------------------------------------- other statuses

describe("createRequester — other non-2xx statuses", () => {
  const statusCases: Array<[number, Answer]> = [
    [400, spotifyError(400, "Invalid base62 id")],
    [401, spotifyError(401, "The access token expired")],
    [403, { status: 403, body: { code: 403, status: "Forbidden", message: "Forbidden" } }],
    [404, { status: 404, body: { code: 404, status: "Not Found", message: "not found" } }],
    [500, { status: 500 }],
    [503, { status: 503, body: "" }],
  ];

  for (const [status, answer] of statusCases) {
    it(`HTTP ${status} fails at once with a "status" HttpError carrying ${status}, with no retry`, async () => {
      const { request, calls, clock } = setup({}, [answer, ok()]);

      const err = await captureError(() => request(SPOTIFY_SEARCH_URL));

      expect(err).toBeInstanceOf(HttpError);
      expect(err).toBeInstanceOf(PlaysetError);
      const httpErr = err as HttpError;
      expect(httpErr.kind).toBe("status");
      expect(httpErr.status).toBe(status);
      expect(httpErr.message).toContain(String(status));
      expect(calls).toHaveLength(1);
      expect(positive(clock.sleeps)).toEqual([]);
    });
  }

  it("a pass-through status (404) is returned to the caller with its body instead of thrown", async () => {
    const notFoundBody = { code: 404, status: "Not Found", message: "not found" };
    const { request, calls } = setup({ name: "setlist.fm", passThroughStatuses: [404] }, [
      { status: 404, body: notFoundBody },
    ]);

    const res = await request(SETLISTFM_URL);

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual(notFoundBody);
    expect(calls).toHaveLength(1);
  });

  it("a pass-through status (400) lets the caller read Spotify's error body", async () => {
    const { request } = setup({ name: "Spotify token", maxAttempts: 3, passThroughStatuses: [400] }, [
      { status: 400, body: { error: "invalid_grant", error_description: "Refresh token revoked" } },
    ]);

    const res = await request("https://accounts.spotify.com/api/token", { method: "POST" });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_grant", error_description: "Refresh token revoked" });
  });

  it("statuses not listed as pass-through are still thrown", async () => {
    const { request } = setup({ name: "setlist.fm", passThroughStatuses: [404] }, [
      { status: 403, body: { code: 403, status: "Forbidden", message: "Forbidden" } },
    ]);

    const err = (await captureError(() => request(SETLISTFM_URL))) as HttpError;

    expect(err.kind).toBe("status");
    expect(err.status).toBe(403);
  });
});

// ---------------------------------------------------------------- network

describe("createRequester — network failures", () => {
  it("a rejected fetch fails with a \"network\" HttpError whose cause is the original error, with no retry", async () => {
    const original = new TypeError("fetch failed", { cause: new Error("read ECONNRESET") });
    const { request, calls, clock } = setup({}, [{ throws: original }, ok()]);

    const err = await captureError(() => request(SPOTIFY_SEARCH_URL));

    expect(err).toBeInstanceOf(HttpError);
    const httpErr = err as HttpError;
    expect(httpErr.kind).toBe("network");
    expect(httpErr.status).toBeUndefined();
    expect(httpErr.cause).toBe(original);
    expect(calls).toHaveLength(1);
    expect(positive(clock.sleeps)).toEqual([]);
  });

  it("drops the cause when the original network error contains a secret", async () => {
    const original = new TypeError(`request to ${SPOTIFY_SEARCH_URL}&token=${ACCESS_TOKEN} failed`);
    const { request } = setup({ secrets: () => [ACCESS_TOKEN] }, [{ throws: original }]);

    const err = (await captureError(() => request(SPOTIFY_SEARCH_URL))) as HttpError;

    expect(err.kind).toBe("network");
    expect(err.cause).toBeUndefined();
    expect(chainText(err)).not.toContain(ACCESS_TOKEN);
  });

  it("drops the cause when a secret hides deeper in the original error's cause chain", async () => {
    const original = new TypeError("fetch failed", { cause: new Error(`bad header x-api-key: ${API_KEY}`) });
    const { request } = setup({ name: "setlist.fm", secrets: () => [API_KEY] }, [{ throws: original }]);

    const err = (await captureError(() => request(SETLISTFM_URL))) as HttpError;

    expect(err.kind).toBe("network");
    for (const link of causeChain(err)) {
      expect(chainText(link)).not.toContain(API_KEY);
    }
  });
});

// ---------------------------------------------------------------- refused URLs

describe("createRequester — allowed URL prefixes", () => {
  const allowed = { name: "Spotify playlist", allowedUrlPrefixes: ["https://api.spotify.com/"] };

  const refused = [
    "https://evil.example.com/v1/me/playlists?offset=50",
    "http://api.spotify.com/v1/me/playlists?offset=50&limit=50",
    "https://api.spotify.com.evil.example.com/v1/me/playlists?offset=50",
  ];

  for (const url of refused) {
    it(`refuses ${url} before any fetch with a "refused-url" HttpError`, async () => {
      const { request, calls } = setup(allowed, [ok()]);

      const err = await captureError(() => request(url));

      expect(err).toBeInstanceOf(HttpError);
      expect((err as HttpError).kind).toBe("refused-url");
      expect(calls).toHaveLength(0);
    });
  }

  it("requests a URL that starts with an allowed prefix", async () => {
    const { request, calls } = setup(allowed, [ok()]);

    await request(`${SPOTIFY_PLAYLISTS_URL}?offset=50&limit=50`);

    expect(calls).toHaveLength(1);
  });

  it("accepts a URL matching any one of several prefixes", async () => {
    const { request, calls } = setup(
      { name: "Spotify", allowedUrlPrefixes: ["https://api.spotify.com/", "https://accounts.spotify.com/api/token"] },
      [ok(), ok()],
    );

    await request(SPOTIFY_SEARCH_URL);
    await request("https://accounts.spotify.com/api/token", { method: "POST" });

    expect(calls).toHaveLength(2);
  });

  it("allows any URL when no prefixes are given", async () => {
    const { request, calls } = setup({}, [ok()]);

    await request("https://example.test/anything");

    expect(calls).toHaveLength(1);
  });
});

// ---------------------------------------------------------------- secrets

describe("createRequester — secrets never leak", () => {
  const secretUrl = `https://api.spotify.com/v1/search?q=Creep&access_token=${ACCESS_TOKEN}`;

  const scenarios: Array<[string, Partial<RequestPolicy>, string, Answer[]]> = [
    ["rate-limited", {}, secretUrl, [tooManyRequests("1"), tooManyRequests("1"), tooManyRequests("1"), tooManyRequests("1")]],
    ["status 401", {}, secretUrl, [spotifyError(401, `token ${ACCESS_TOKEN} expired`)]],
    ["status 500", {}, secretUrl, [{ status: 500 }]],
    ["network", {}, secretUrl, [{ throws: new TypeError(`fetch ${secretUrl} failed`) }]],
    [
      "refused-url",
      { allowedUrlPrefixes: ["https://api.spotify.com/"] },
      `https://evil.example.com/v1/me/playlists?access_token=${ACCESS_TOKEN}`,
      [ok()],
    ],
  ];

  for (const [label, policy, url, answers] of scenarios) {
    it(`no secret appears in the message, hint, String(err) or any cause (${label})`, async () => {
      const { request } = setup({ ...policy, secrets: () => [ACCESS_TOKEN] }, answers);

      const err = await captureError(() =>
        request(url, { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } }),
      );

      expect(err).toBeInstanceOf(HttpError);
      expect(chainText(err)).not.toContain(ACCESS_TOKEN);
    });
  }

  it("reads secrets lazily, so a secret known only after creation is still redacted", async () => {
    const secrets: string[] = [];
    const { request } = setup({ secrets: () => secrets }, [{ status: 500 }]);
    secrets.push(ACCESS_TOKEN);

    const err = await captureError(() => request(secretUrl));

    expect(chainText(err)).not.toContain(ACCESS_TOKEN);
  });

  it("redacts every secret in the list (API key and access token)", async () => {
    const url = `https://api.example.test/x?key=${API_KEY}&token=${ACCESS_TOKEN}`;
    const { request } = setup({ secrets: () => [API_KEY, ACCESS_TOKEN] }, [
      { throws: new TypeError(`fetch ${url} failed`) },
    ]);

    const text = chainText(await captureError(() => request(url)));

    expect(text).not.toContain(API_KEY);
    expect(text).not.toContain(ACCESS_TOKEN);
  });

  it("ignores empty secrets: the message still names the status", async () => {
    const { request } = setup({ secrets: () => ["", ACCESS_TOKEN] }, [{ status: 500 }]);

    const err = (await captureError(() => request(SPOTIFY_SEARCH_URL))) as HttpError;

    expect(err.message).toContain("500");
  });
});

// ---------------------------------------------------------------- defaults

describe("createRequester — default dependencies", () => {
  it("can be created without fetch, sleep or now", () => {
    expect(() => createRequester({ name: "setlist.fm", maxAttempts: 4, minIntervalMs: 500 }, {})).not.toThrow();
  });

  it("returns a function", () => {
    expect(typeof createRequester({ name: "Spotify search", maxAttempts: 4 }, {})).toBe("function");
  });
});
