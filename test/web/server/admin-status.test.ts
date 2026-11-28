// The admin cookie, the admin status and logout (X6, X7, X8): the status needs a valid admin cookie
// (12 hours by the injected clock), reads only the store, the usage events and the hit counter,
// and logout drops the admin cookie but never the Host token.
import request from "supertest";
import { describe, expect, it } from "vitest";
import { CONFIG_ITEMS, adminStatusResponseSchema } from "../../../src/web/shared/index.js";
import { createMemoryUsageEvents } from "../../../src/web/server/index.js";
import { expectCatalogueError } from "./fixtures/catalogue";
import {
  INVALID_LOGOUT_BODY,
  OTHER_SECRET,
  T,
  cookieNamed,
  expectCookieAttributes,
  expectCookieHoldsNoSecret,
  expectNoAdminLeaks,
  expectNotAdmin,
  makeAdminHarness,
  tamper,
  type AdminHarness,
} from "./fixtures/admin";
import { A, HOST_TOKEN, expectContract, makeFakeHits } from "./fixtures/harness";
import { MADRID_ID } from "./fixtures/setlists";

type Kind = "created" | "updated" | "opened";
type Events = ReturnType<typeof createMemoryUsageEvents>;

const X7_EVENTS: Array<[string, Kind, string, string]> = [
  ["2026-11-28", "created", "2bf1c8e4", "Pearl Jam"],
  ["2026-11-28", "updated", "2bf1c8e4", "Pearl Jam"],
  ["2026-11-28", "opened", "2bf1c8e4", "Pearl Jam"],
  ["2026-11-28", "opened", "2bf1c8e4", "Pearl Jam"],
  ["2026-11-28", "opened", "2bf1c8e4", "Pearl Jam"],
  ["2026-11-28", "created", "73a1b2c5", "Arctic Monkeys"],
  ["2026-11-27", "created", "1bd5a2c8", "Guns N' Roses"],
  ["2026-11-27", "opened", "73a1b2c5", "Arctic Monkeys"],
  ["2026-10-30", "created", "63a5e2b7", "Arctic Monkeys"],
  ["2026-10-29", "created", "9ac1e5d3", "Arctic Monkeys"],
  ["2026-10-29", "opened", "53d60349", "Nirvana"],
];

async function record(events: Events, rows: Array<[string, Kind, string, string]>) {
  for (const [day, kind, setlistId, artist] of rows) await events.recordEvent({ kind, setlistId, artist, day });
}

/** The 30 UTC days from `today` back, newest first. */
function days(today: string): string[] {
  const start = Date.parse(`${today}T00:00:00.000Z`);
  return Array.from({ length: 30 }, (_, i) => new Date(start - i * 86_400_000).toISOString().slice(0, 10));
}

const zeroDays = (today: string) => days(today).map((date) => ({ date, created: 0, updated: 0, opened: 0 }));

const CONFIG = CONFIG_ITEMS.map((name) => ({ name, present: true }));

async function x7Harness() {
  const hits = makeFakeHits();
  hits.add("2026-11-28");
  hits.add("2026-11-28");
  for (let i = 0; i < 5; i++) hits.add("2026-11-27");
  const usageEvents = createMemoryUsageEvents();
  await record(usageEvents, X7_EVENTS);
  const a = makeAdminHarness({ rateLimitHits: hits, usageEvents });
  const admin = await a.loginAsHost();
  return { a, admin, hits };
}

/** No request, no Host token ask, no Host login call during the status. */
function snapshot(a: AdminHarness) {
  return { requests: a.http.requests.length, asked: a.sourceState.asked, calls: a.login.calls() };
}

// ---------------------------------------------------------------- admin cookie

describe("the admin cookie (AC-20, AC-21)", () => {
  it("AC-20: accepted until just before T + 12 hours, refused from T + 12 hours on", async () => {
    const a = makeAdminHarness();
    const admin = await a.loginAsHost();
    a.clock.set("2026-11-29T02:29:59.999Z");
    expect((await a.status(admin)).status).toBe(200);
    a.clock.set("2026-11-29T02:30:00.000Z");
    expectNotAdmin(await a.status(admin));
    a.clock.set("2026-11-30T09:00:00.000Z");
    expectNotAdmin(await a.status(admin));
  });

  const refused: Array<[string, (a: AdminHarness, admin: string) => Promise<string | undefined>]> = [
    ["no cookie", async () => undefined],
    ["an empty playset_admin", async () => "playset_admin="],
    ["the admin cookie with one character changed", async (_a, admin) => `playset_admin=${tamper(admin.slice("playset_admin=".length))}`],
    ["playset_admin=admin", async () => "playset_admin=admin"],
    [
      "the login cookie's value sent as playset_admin",
      async (a) => `playset_admin=${(await a.startLogin()).loginCookie.value}`,
    ],
    [
      "an admin cookie from an app with another cookie secret",
      async () => makeAdminHarness({ env: { PLAYSET_COOKIE_SECRET: OTHER_SECRET } }).loginAsHost(),
    ],
  ];

  for (const [label, cookieFor] of refused) {
    it(`AC-20: ${label} → 401 E-26 and no usage read`, async () => {
      const a = makeAdminHarness({
        rateLimitHits: {
          add() {},
          count() {
            throw new Error("the hit counter must not be read without a valid admin cookie");
          },
        },
      });
      const admin = await a.loginAsHost();
      const cookie = await cookieFor(a, admin);
      const before = snapshot(a);
      const res = await a.status(cookie);
      expectNotAdmin(res);
      expect(snapshot(a)).toEqual(before);
      expectNoAdminLeaks(res);
    });
  }

  it("AC-21: the admin cookie and every login cookie hold no id, token, code or secret", async () => {
    const a = makeAdminHarness();
    const s = await a.startLogin();
    expectCookieHoldsNoSecret(s.loginCookie.value);
    const admin = await a.loginAsHost();
    expectCookieHoldsNoSecret(admin.slice("playset_admin=".length));
  });

  it("AC-21: the status answer and its headers hold no id, token or secret", async () => {
    const { a, admin } = await x7Harness();
    const res = await a.status(admin);
    expect(res.status).toBe(200);
    expectNoAdminLeaks(res);
  });
});

// ---------------------------------------------------------------- status

describe("GET /api/admin/status (AC-22 to AC-25)", () => {
  it("AC-22, AC-23, AC-24, AC-25: X7 → exactly the example status, accepted by the contract", async () => {
    const { a, admin } = await x7Harness();
    const before = snapshot(a);
    const usageBefore = await a.events.readUsage("2026-11-28");

    const res = await a.status(admin);

    expect(res.status).toBe(200);
    expect(String(res.headers["content-type"])).toMatch(/^application\/json/);
    expectContract(adminStatusResponseSchema, res.body);
    const perDay = zeroDays("2026-11-28");
    perDay[0] = { date: "2026-11-28", created: 2, updated: 1, opened: 3 };
    perDay[1] = { date: "2026-11-27", created: 1, updated: 0, opened: 1 };
    perDay[29] = { date: "2026-10-30", created: 1, updated: 0, opened: 0 };
    expect(res.body).toStrictEqual({
      hostAccount: { connected: true, displayName: "playset-host" },
      config: CONFIG,
      usage: {
        playlistsMade: 6,
        opens: 5,
        perDay,
        topArtists: [
          { artist: "Arctic Monkeys", playlistCount: 3 },
          { artist: "Guns N' Roses", playlistCount: 1 },
          { artist: "Pearl Jam", playlistCount: 1 },
        ],
      },
      rateLimitHitsToday: 2,
    });
    expect(snapshot(a)).toEqual(before);
    expect(await a.events.readUsage("2026-11-28")).toStrictEqual(usageBefore);
  });

  it("AC-22: config is the four contract labels in contract order, each present", async () => {
    const { a, admin } = await x7Harness();
    const res = await a.status(admin);
    expect((res.body as { config: unknown }).config).toStrictEqual([
      { name: "setlist.fm API key", present: true },
      { name: "Spotify client id", present: true },
      { name: "Host Account id", present: true },
      { name: "Cookie secret", present: true },
    ]);
  });

  it("AC-22: an empty store → { connected: false }", async () => {
    const { a, admin } = await x7Harness();
    await a.store.clear();
    const res = await a.status(admin);
    expect((res.body as { hostAccount: unknown }).hostAccount).toStrictEqual({ connected: false });
  });

  it("AC-22: a stored Host token without displayName → { connected: true } with no displayName key", async () => {
    const { a, admin } = await x7Harness();
    const { displayName: _dropped, ...noName } = T;
    await a.store.save(noName);
    const res = await a.status(admin);
    expect((res.body as { hostAccount: unknown }).hostAccount).toStrictEqual({ connected: true });
  });

  it("AC-22: a stored Host token of another account → { connected: false }, and the id is not in the answer", async () => {
    const { a, admin } = await x7Harness();
    await a.store.save({ ...T, accountId: "jane.doe.music", displayName: "Jane Doe" });
    const res = await a.status(admin);
    expect((res.body as { hostAccount: unknown }).hostAccount).toStrictEqual({ connected: false });
    expect(res.text).not.toContain("jane.doe.music");
  });

  it("AC-22: an expired stored Host token still shows connected, and the status refreshes nothing", async () => {
    const { a, admin } = await x7Harness();
    await a.store.save({ ...T, expiresAt: 1795870000000 });
    const res = await a.status(admin);
    expect((res.body as { hostAccount: unknown }).hostAccount).toStrictEqual({ connected: true, displayName: "playset-host" });
    expect(a.login.state.refreshCalls).toEqual([]);
    expect(a.sourceState.asked).toBe(0);
  });

  it("AC-23: no events and counter 0 → zeros, 30 days from 2026-11-28 to 2026-10-30, no top Artists", async () => {
    const a = makeAdminHarness();
    const admin = await a.loginAsHost();
    const res = await a.status(admin);
    expect(res.status).toBe(200);
    expect((res.body as { usage: unknown }).usage).toStrictEqual({
      playlistsMade: 0,
      opens: 0,
      perDay: zeroDays("2026-11-28"),
      topArtists: [],
    });
    expect((res.body as { rateLimitHitsToday: unknown }).rateLimitHitsToday).toBe(0);
    expect(zeroDays("2026-11-28")[29]!.date).toBe("2026-10-30");
  });

  it("AC-23: events after today are not in perDay but count in the totals", async () => {
    const usageEvents = createMemoryUsageEvents();
    await record(usageEvents, [
      ["2026-11-29", "created", "2bf1c8e4", "Pearl Jam"],
      ["2026-11-29", "opened", "2bf1c8e4", "Pearl Jam"],
    ]);
    const a = makeAdminHarness({ usageEvents });
    const admin = await a.loginAsHost();
    const body = (await a.status(admin)).body as { usage: { playlistsMade: number; opens: number; perDay: unknown } };
    expect(body.usage.playlistsMade).toBe(1);
    expect(body.usage.opens).toBe(1);
    expect(body.usage.perDay).toStrictEqual(zeroDays("2026-11-28"));
  });

  it("AC-23, AC-25: at 2026-11-29T00:00Z perDay starts with 2026-11-29 (zeros), then 2026-11-28; rateLimitHitsToday 0", async () => {
    const { a, admin } = await x7Harness();
    a.clock.set("2026-11-29T00:00:00.000Z");
    const body = (await a.status(admin)).body as {
      usage: { perDay: Array<{ date: string }> };
      rateLimitHitsToday: number;
    };
    expect(body.usage.perDay).toHaveLength(30);
    expect(body.usage.perDay[0]).toStrictEqual({ date: "2026-11-29", created: 0, updated: 0, opened: 0 });
    expect(body.usage.perDay[1]).toStrictEqual({ date: "2026-11-28", created: 2, updated: 1, opened: 3 });
    expect(body.usage.perDay[29]!.date).toBe("2026-10-31");
    expect(body.rateLimitHitsToday).toBe(0);
  });

  it("AC-24: 12 Artists with one created event each → the first 10 by name (ABBA to Jamiroquai)", async () => {
    const names = ["Lorde", "Keane", "Jamiroquai", "Interpol", "Haim", "Genesis", "Feist", "Elbow", "Daft Punk", "Coldplay", "Bjork", "ABBA"];
    const usageEvents = createMemoryUsageEvents();
    await record(
      usageEvents,
      names.map((artist, i): [string, Kind, string, string] => ["2026-11-28", "created", `${(i + 10).toString(16)}a1b2c3`, artist]),
    );
    const a = makeAdminHarness({ usageEvents });
    const admin = await a.loginAsHost();
    const body = (await a.status(admin)).body as { usage: { topArtists: unknown } };
    expect(body.usage.topArtists).toStrictEqual(
      ["ABBA", "Bjork", "Coldplay", "Daft Punk", "Elbow", "Feist", "Genesis", "Haim", "Interpol", "Jamiroquai"].map((artist) => ({
        artist,
        playlistCount: 1,
      })),
    );
  });

  it("AC-24: ties go by ascending code-point order (uppercase before lowercase), names grouped exactly as stored", async () => {
    const usageEvents = createMemoryUsageEvents();
    await record(usageEvents, [
      ["2026-11-28", "created", "1a000001", "beta"],
      ["2026-11-28", "created", "1a000002", "Beta"],
      ["2026-11-28", "updated", "1a000003", "Alpha"],
      ["2026-11-28", "updated", "1a000003", "Alpha"],
      ["2026-11-28", "created", "1a000004", "Zed"],
      ["2026-11-28", "created", "1a000005", "Zed"],
    ]);
    const a = makeAdminHarness({ usageEvents });
    const admin = await a.loginAsHost();
    const body = (await a.status(admin)).body as { usage: { topArtists: unknown } };
    expect(body.usage.topArtists).toStrictEqual([
      { artist: "Zed", playlistCount: 2 },
      { artist: "Alpha", playlistCount: 1 },
      { artist: "Beta", playlistCount: 1 },
      { artist: "beta", playlistCount: 1 },
    ]);
  });

  it("AC-25: a status the contract would reject (a hit count of -1) → 500 E-25", async () => {
    const a = makeAdminHarness({ rateLimitHits: { add() {}, count: () => -1 } });
    const admin = await a.loginAsHost();
    const res = await a.status(admin);
    expectCatalogueError(res, "E-25");
    expectNoAdminLeaks(res);
  });

  it("AC-22: the status records no usage event", async () => {
    const { a, admin } = await x7Harness();
    await a.status(admin);
    await a.status(admin);
    const body = (await a.status(admin)).body as { usage: { playlistsMade: number; opens: number } };
    expect(body.usage.playlistsMade).toBe(6);
    expect(body.usage.opens).toBe(5);
  });
});

// ---------------------------------------------------------------- logout

describe("POST /api/admin/logout (AC-26)", () => {
  const logout = (a: AdminHarness, cookie?: string) => {
    const r = request(a.app).post("/api/admin/logout").set("X-Forwarded-For", A);
    return cookie === undefined ? r : r.set("Cookie", cookie);
  };

  const expectCleared = (res: request.Response, secure = false) => {
    expect(res.status).toBe(204);
    expect(res.text ?? "").toBe("");
    expectCookieAttributes(cookieNamed(res, "playset_admin"), { path: "/", maxAge: "0", secure });
    expect(cookieNamed(res, "playset_admin")!.value).toBe("");
  };

  it("AC-26: with the admin cookie and no body → 204, the admin cookie cleared, the Host token unchanged", async () => {
    const a = makeAdminHarness();
    const admin = await a.loginAsHost();
    const res = await logout(a, admin);
    expectCleared(res);
    expect(await a.store.read()).toStrictEqual(T);
    expectNoAdminLeaks(res);
  });

  it("AC-26: body {} → 204 and cleared", async () => {
    const a = makeAdminHarness();
    const admin = await a.loginAsHost();
    expectCleared(await logout(a, admin).send({}));
    expect(await a.store.read()).toStrictEqual(T);
  });

  it("AC-26: no cookie, or an invalid one → 204 and cleared", async () => {
    const a = makeAdminHarness();
    await a.loginAsHost();
    expectCleared(await logout(a));
    expectCleared(await logout(a, "playset_admin=admin"));
    expect(await a.store.read()).toStrictEqual(T);
  });

  it("AC-26: behind a proxy over https the cleared cookie has Secure", async () => {
    const a = makeAdminHarness();
    const admin = await a.loginAsHost();
    expectCleared(await logout(a, admin).set("X-Forwarded-Proto", "https"), true);
  });

  it("AC-26: {\"all\":true} → 400 E-27, nothing cleared, the Host token unchanged", async () => {
    const a = makeAdminHarness();
    const admin = await a.loginAsHost();
    const res = await logout(a, admin).send({ all: true });
    expect(res.status).toBe(400);
    expect(res.body).toStrictEqual(INVALID_LOGOUT_BODY);
    expect(res.headers["set-cookie"]).toBeUndefined();
    expect(await a.store.read()).toStrictEqual(T);
    expect((await a.status(admin)).status).toBe(200);
  });

  it("AC-26: a text/plain body 'bye' → 400 E-27, nothing cleared", async () => {
    const a = makeAdminHarness();
    const admin = await a.loginAsHost();
    const res = await logout(a, admin).set("Content-Type", "text/plain").send("bye");
    expect(res.status).toBe(400);
    expect(res.body).toStrictEqual(INVALID_LOGOUT_BODY);
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  it("AC-26: after logout the browser (without the cookie) gets 401 E-26, and a preview still gets BQDhost-test-token", async () => {
    const a = makeAdminHarness();
    const admin = await a.loginAsHost();
    expectCleared(await logout(a, admin));
    // The browser applied Max-Age=0: it sends no admin cookie any more.
    expectNotAdmin(await a.status());
    const preview = await a.getStream(`/api/setlists/${MADRID_ID}/preview`);
    expect(preview.status).toBe(200);
    expect(a.matchSearches.length).toBeGreaterThanOrEqual(1);
    expect(new Set(a.matchSearches.map((m) => m.accessToken))).toEqual(new Set([HOST_TOKEN]));
  });

  for (const [method, path] of [
    ["GET", "/api/admin/logout"],
    ["POST", "/api/admin/status"],
    ["DELETE", "/api/admin/status"],
  ] as const) {
    it(`AC-26: ${method} ${path} → 404 E-10`, async () => {
      const a = makeAdminHarness();
      const admin = await a.loginAsHost();
      const agent = request(a.app);
      const base = method === "GET" ? agent.get(path) : method === "POST" ? agent.post(path) : agent.delete(path);
      const res = await base.set("X-Forwarded-For", A).set("Cookie", admin);
      expectCatalogueError(res, "E-10");
      expect(res.headers["set-cookie"]).toBeUndefined();
    });
  }
});
