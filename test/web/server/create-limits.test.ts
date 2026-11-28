// Create/update limits (X13): per address per hour, per day, and the rate-limit hit counter.
import { afterEach, describe, expect, it } from "vitest";
import { expectCatalogueError } from "./fixtures/catalogue";
import {
  A,
  B,
  C,
  HOST_TOKEN,
  TODAY,
  expectNoLeaks,
  flush,
  makeFakeEvents,
  makeGate,
  makeHarness,
  spotifyStatus,
  waitUntil,
  type Gate,
} from "./fixtures/harness";
import { H_ID, H_V1, H_V2, MADRID_ID, MADRID_VERSION, NIRVANA_ID, NIRVANA_VERSION, SHARE_URL, fixtureHv2 } from "./fixtures/setlists";

/** Every gate a test made; each is released after the test, so a failing assertion never leaves a create hanging. */
const gates: Gate[] = [];
const heldGate = (): Gate => {
  const gate = makeGate();
  gates.push(gate);
  return gate;
};

afterEach(() => {
  while (gates.length > 0) gates.pop()!.release();
});

const create = (id: string, versionId: string) => ({ path: `/api/setlists/${id}/playlist`, body: { versionId } });
const H_V1_CREATE = create(H_ID, H_V1);
const MADRID_CREATE = create(MADRID_ID, MADRID_VERSION);
const NIRVANA_CREATE = create(NIRVANA_ID, NIRVANA_VERSION);

describe("X13 — create limits through one day (AC-29, AC-30, AC-32, AC-16)", () => {
  it("AC-29, AC-30, AC-32: PLAYSET_CREATE_LIMIT=2, PLAYSET_DAILY_LIMIT=3", async () => {
    const h = makeHarness({ env: { PLAYSET_CREATE_LIMIT: "2", PLAYSET_DAILY_LIMIT: "3" } });

    h.clock.set("2026-11-28T14:00:00.000Z");
    let res = await h.post(H_V1_CREATE.path, H_V1_CREATE.body, A);
    expect(res.status).toBe(200);
    expect(res.body).toStrictEqual({ url: SHARE_URL, status: "created" });

    h.clock.set("2026-11-28T14:20:00.000Z");
    h.setlists[H_ID] = fixtureHv2();
    res = await h.post(`/api/setlists/${H_ID}/playlist`, { versionId: H_V2 }, A);
    expect(res.status).toBe(200);
    expect(res.body).toStrictEqual({ url: SHARE_URL, status: "updated" });

    h.clock.set("2026-11-28T14:30:00.000Z");
    const setlistFmBefore = h.setlistFmRequests().length;
    res = await h.post(MADRID_CREATE.path, MADRID_CREATE.body, A);
    expectCatalogueError(res, "E-12", 1800);
    expect(h.setlistFmRequests().length).toBe(setlistFmBefore);
    expectNoLeaks(res);

    h.spotify.playlistAnswers[h.playlistRequests().length] = spotifyStatus(500);
    res = await h.post(MADRID_CREATE.path, MADRID_CREATE.body, B);
    expectCatalogueError(res, "E-17");

    res = await h.post(MADRID_CREATE.path, MADRID_CREATE.body, B);
    expect(res.status).toBe(200);
    expect((res.body as { status: string }).status).toBe("created");
    expect(await h.usage.events.countPlaylistsMade(TODAY)).toBe(3);

    const nirvanaBefore = h.setlistFmRequests().length;
    res = await h.post(NIRVANA_CREATE.path, NIRVANA_CREATE.body, C);
    expectCatalogueError(res, "E-13", 34200);
    expect(h.setlistFmRequests().length).toBe(nirvanaBefore);
    expectNoLeaks(res);

    // Opening a current playlist still works and is no playlist made.
    const open = await h.get(`/api/setlists/${H_ID}`, B);
    expect(open.status).toBe(200);
    expect((open.body as { playlist: unknown }).playlist).toStrictEqual({ status: "current", url: SHARE_URL });
    expect(await h.usage.events.countPlaylistsMade(TODAY)).toBe(3);
    expect(h.usage.recorded.map((e) => e.kind)).toEqual(["created", "updated", "created", "opened"]);

    expect(h.hits.count(TODAY)).toBe(2);
    expect(h.hits.added).toEqual([TODAY, TODAY]);

    // B has 2 counted (the failed create counts too).
    expectCatalogueError(await h.post(H_V1_CREATE.path, { versionId: H_V2 }, B), "E-12", 3600);

    h.clock.set("2026-11-29T00:00:00.000Z");
    res = await h.post(NIRVANA_CREATE.path, NIRVANA_CREATE.body, C);
    expect(res.status).toBe(200);
    expect((res.body as { status: string }).status).toBe("created");
    expect(h.usage.recorded.at(-1)).toEqual({ kind: "created", setlistId: NIRVANA_ID, artist: "Nirvana", day: "2026-11-29" });
    expect(await h.usage.events.countPlaylistsMade("2026-11-29")).toBe(1);
  }, 20_000);
});

describe("the per-address create/update limit (AC-29)", () => {
  it("AC-29: Retry-After is rounded up: oldest at 13:30:00.900, asked at 14:30:00.400 → Retry-After: 1", async () => {
    const h = makeHarness({ env: { PLAYSET_CREATE_LIMIT: "1" } });
    h.clock.set("2026-11-28T13:30:00.900Z");
    expect((await h.post(H_V1_CREATE.path, H_V1_CREATE.body)).status).toBe(200);
    h.clock.set("2026-11-28T14:30:00.400Z");
    expectCatalogueError(await h.post(H_V1_CREATE.path, H_V1_CREATE.body), "E-12", 1);
    h.clock.set("2026-11-28T14:30:00.900Z");
    expect((await h.post(H_V1_CREATE.path, H_V1_CREATE.body)).status).toBe(200);
  });

  it("AC-29: a refused request sends nothing and counts nothing more; other addresses are not affected", async () => {
    const h = makeHarness({ env: { PLAYSET_CREATE_LIMIT: "1" } });
    h.clock.set("2026-11-28T14:00:00.000Z");
    expect((await h.post(H_V1_CREATE.path, H_V1_CREATE.body, A)).status).toBe(200);
    const before = h.http.requests.length;
    h.clock.set("2026-11-28T14:30:00.000Z");
    for (let i = 0; i < 5; i++) expectCatalogueError(await h.post(MADRID_CREATE.path, MADRID_CREATE.body, A), "E-12", 1800);
    expect(h.http.requests.length).toBe(before);
    // Refusals don't extend the window: at 15:00:00 A is admitted again.
    h.clock.set("2026-11-28T15:00:00.000Z");
    expect((await h.post(MADRID_CREATE.path, MADRID_CREATE.body, A)).status).toBe(200);
    expect((await h.post(NIRVANA_CREATE.path, NIRVANA_CREATE.body, B)).status).toBe(200);
    expect(h.hits.count(TODAY)).toBe(5);
  });

  it("AC-29: an admitted request counts whatever its outcome (a Setlist-changed answer counts)", async () => {
    const h = makeHarness({ env: { PLAYSET_CREATE_LIMIT: "1" } });
    expectCatalogueError(await h.post(H_V1_CREATE.path, { versionId: H_V2 }), "E-24");
    expectCatalogueError(await h.post(H_V1_CREATE.path, H_V1_CREATE.body), "E-12", 3600);
  });

  it("AC-27: the per-address limit is checked before the daily limit", async () => {
    const h = makeHarness({ env: { PLAYSET_CREATE_LIMIT: "1", PLAYSET_DAILY_LIMIT: "1" } });
    expect((await h.post(H_V1_CREATE.path, H_V1_CREATE.body, A)).status).toBe(200);
    expectCatalogueError(await h.post(MADRID_CREATE.path, MADRID_CREATE.body, A), "E-12", 3600);
    expectCatalogueError(await h.post(MADRID_CREATE.path, MADRID_CREATE.body, B), "E-13", 34200);
  });

  it("AC-27: not connected is answered before any limit (A at its limit gets E-23, and nothing is counted)", async () => {
    const h = makeHarness({ env: { PLAYSET_CREATE_LIMIT: "1" } });
    expect((await h.post(H_V1_CREATE.path, H_V1_CREATE.body, A)).status).toBe(200);
    h.host.mode = { kind: "absent" };
    expectCatalogueError(await h.post(MADRID_CREATE.path, MADRID_CREATE.body, A), "E-23");
    expect(h.hits.added).toEqual([]);
    h.host.mode = { kind: "connected", token: HOST_TOKEN };
    expectCatalogueError(await h.post(MADRID_CREATE.path, MADRID_CREATE.body, A), "E-12", 3600);
  });
});

describe("the daily limit (AC-30)", () => {
  it("AC-30: a request refused by the daily limit is not counted against its address", async () => {
    const h = makeHarness({ env: { PLAYSET_CREATE_LIMIT: "1", PLAYSET_DAILY_LIMIT: "1" } });
    h.clock.set("2026-11-28T23:30:00.000Z");
    expect((await h.post(H_V1_CREATE.path, H_V1_CREATE.body, A)).status).toBe(200);
    h.clock.set("2026-11-28T23:40:00.000Z");
    expectCatalogueError(await h.post(MADRID_CREATE.path, MADRID_CREATE.body, C), "E-13", 1200);
    h.clock.set("2026-11-29T00:10:00.000Z");
    expect((await h.post(MADRID_CREATE.path, MADRID_CREATE.body, C)).status).toBe(200);
  });

  it("AC-30: Retry-After until the next 00:00 UTC is at least 1 (asked at 23:59:59.500)", async () => {
    const events = makeFakeEvents();
    await events.events.recordEvent({ kind: "created", setlistId: "1bd5a2c8", artist: "Guns N' Roses", day: TODAY });
    const h = makeHarness({ env: { PLAYSET_DAILY_LIMIT: "1" }, events: events.events, now: "2026-11-28T23:59:59.500Z" });
    expectCatalogueError(await h.post(H_V1_CREATE.path, H_V1_CREATE.body), "E-13", 1);
    expect(h.http.requests).toEqual([]);
  });

  it("AC-30: playlists made today come from the usage events: created and updated count, opens and other days don't", async () => {
    const events = makeFakeEvents();
    for (let i = 0; i < 40; i++) {
      await events.events.recordEvent({ kind: "opened", setlistId: H_ID, artist: "Pearl Jam", day: TODAY });
    }
    await events.events.recordEvent({ kind: "created", setlistId: "1bd5a2c8", artist: "Guns N' Roses", day: "2026-11-27" });
    await events.events.recordEvent({ kind: "updated", setlistId: "1bd5a2c8", artist: "Guns N' Roses", day: TODAY });
    const h = makeHarness({ env: { PLAYSET_DAILY_LIMIT: "2" }, events: events.events });
    expect((await h.post(H_V1_CREATE.path, H_V1_CREATE.body, A)).status).toBe(200);
    expectCatalogueError(await h.post(MADRID_CREATE.path, MADRID_CREATE.body, B), "E-13", 34200);
    expect(h.hits.count(TODAY)).toBe(1);
  });

  it("AC-30: the daily limit applies to every address alike", async () => {
    const h = makeHarness({ env: { PLAYSET_DAILY_LIMIT: "1" } });
    expect((await h.post(H_V1_CREATE.path, H_V1_CREATE.body, A)).status).toBe(200);
    for (const address of [A, B, C]) {
      expectCatalogueError(await h.post(MADRID_CREATE.path, MADRID_CREATE.body, address), "E-13", 34200);
    }
    expect(h.hits.count(TODAY)).toBe(3);
  });
});

describe("the rate-limit hit counter (AC-32)", () => {
  it("AC-32: only Playset's own limits raise it, under today's UTC day; upstream 429s don't", async () => {
    const h = makeHarness({ env: { PLAYSET_PREVIEW_LIMIT: "1", PLAYSET_CREATE_LIMIT: "1" } });
    h.setlists[MADRID_ID] = () =>
      new Response(JSON.stringify({ code: 429 }), { status: 429, headers: { "Content-Type": "application/json", "Retry-After": "1" } });
    expectCatalogueError(await h.get(`/api/setlists/${MADRID_ID}`), "E-14");
    expectCatalogueError(await h.post(MADRID_CREATE.path, MADRID_CREATE.body), "E-14");
    expect(h.hits.added).toEqual([]);
    expectCatalogueError(await h.post(H_V1_CREATE.path, H_V1_CREATE.body), "E-12", 3600);
    expect(h.hits.added).toEqual([TODAY]);
  });

  it("AC-32: a new app starts with empty windows (nothing is shared between two apps)", async () => {
    const first = makeHarness({ env: { PLAYSET_CREATE_LIMIT: "1" } });
    expect((await first.post(H_V1_CREATE.path, H_V1_CREATE.body)).status).toBe(200);
    expectCatalogueError(await first.post(H_V1_CREATE.path, H_V1_CREATE.body), "E-12", 3600);
    const second = makeHarness({ env: { PLAYSET_CREATE_LIMIT: "1" } });
    expect((await second.post(H_V1_CREATE.path, H_V1_CREATE.body)).status).toBe(200);
  });
});

// ---------------------------------------------------------------- windows forgetting old moments

describe("windows forget moments older than 60 minutes (AC-29, AC-23)", () => {
  it("AC-29: A at its limit at 14:00 gets a fresh window 61 minutes later: two more admitted, the third waits a full hour", async () => {
    const h = makeHarness({ env: { PLAYSET_CREATE_LIMIT: "2" } });
    h.clock.set("2026-11-28T14:00:00.000Z");
    expect((await h.post(H_V1_CREATE.path, H_V1_CREATE.body, A)).status).toBe(200);
    expect((await h.post(H_V1_CREATE.path, H_V1_CREATE.body, A)).status).toBe(200);
    expectCatalogueError(await h.post(MADRID_CREATE.path, MADRID_CREATE.body, A), "E-12", 3600);

    h.clock.set("2026-11-28T15:01:00.000Z");
    expect((await h.post(MADRID_CREATE.path, MADRID_CREATE.body, A)).status).toBe(200);
    expect((await h.post(NIRVANA_CREATE.path, NIRVANA_CREATE.body, A)).status).toBe(200);
    expectCatalogueError(await h.post(H_V1_CREATE.path, H_V1_CREATE.body, A), "E-12", 3600);
  });

  it("AC-23: A at its preview limit at 14:00 gets a fresh window 61 minutes later", async () => {
    const h = makeHarness({ env: { PLAYSET_PREVIEW_LIMIT: "1" } });
    h.clock.set("2026-11-28T14:00:00.000Z");
    expect((await h.getStream(`/api/setlists/${MADRID_ID}/preview`, A)).status).toBe(200);
    expectCatalogueError(await h.get(`/api/setlists/${H_ID}/preview`, A), "E-11", 3600);

    h.clock.set("2026-11-28T15:01:00.000Z");
    expect((await h.getStream(`/api/setlists/${H_ID}/preview`, A)).status).toBe(200);
    expectCatalogueError(await h.get(`/api/setlists/${NIRVANA_ID}/preview`, A), "E-11", 3600);
  });
});

// ---------------------------------------------------------------- concurrent requests

/** Usage events whose playlists-made count waits at `gate` (so concurrent requests overlap there). */
function eventsWithGatedCount(gate: Gate) {
  const fake = makeFakeEvents();
  return {
    recorded: fake.recorded,
    events: {
      recordEvent: fake.events.recordEvent,
      async countPlaylistsMade(day: string): Promise<number> {
        await gate.pass();
        return fake.events.countPlaylistsMade(day);
      },
    },
  };
}

type Posted = { status: number; body: unknown; headers: Record<string, string | string[] | undefined> };

/** Starts every request at once, lets them pile up at the gate, then releases it and waits for all. */
async function allAtOnce(gate: Gate, start: Array<() => PromiseLike<Posted>>): Promise<Posted[]> {
  let settled = 0;
  const pending = start.map((go) =>
    Promise.resolve(go()).then((res) => {
      settled++;
      return res;
    }),
  );
  await waitUntil(() => gate.state.waiting >= 1 || settled === start.length, "a request to reach the daily count");
  await flush(100);
  gate.release();
  return Promise.all(pending);
}

describe("concurrent creates and the limits (AC-29, AC-30)", () => {
  it("AC-29: 5 creates from A at once with a create limit of 2 → at most 2 admitted, the rest E-12", async () => {
    const gate = heldGate();
    const usage = eventsWithGatedCount(gate);
    const h = makeHarness({ env: { PLAYSET_CREATE_LIMIT: "2" }, events: usage.events });
    const targets = [H_V1_CREATE, MADRID_CREATE, NIRVANA_CREATE, H_V1_CREATE, MADRID_CREATE];
    const answers = await allAtOnce(
      gate,
      targets.map((t) => () => h.post(t.path, t.body, A)),
    );
    const admitted = answers.filter((r) => r.status === 200);
    const refused = answers.filter((r) => r.status === 429);
    expect(admitted).toHaveLength(2);
    expect(refused).toHaveLength(3);
    for (const res of refused) expectCatalogueError(res, "E-12", 3600);
    expect(h.hits.count(TODAY)).toBe(3);
    // Nothing more slipped through: A is still at its limit.
    expectCatalogueError(await h.post(NIRVANA_CREATE.path, NIRVANA_CREATE.body, A), "E-12", 3600);
  }, 20_000);

  it("AC-30: 3 creates from 3 addresses at once with a daily limit of 1 → exactly one admitted, the others E-13", async () => {
    const gate = heldGate();
    const usage = eventsWithGatedCount(gate);
    const h = makeHarness({ env: { PLAYSET_DAILY_LIMIT: "1" }, events: usage.events });
    const answers = await allAtOnce(gate, [
      () => h.post(H_V1_CREATE.path, H_V1_CREATE.body, A),
      () => h.post(MADRID_CREATE.path, MADRID_CREATE.body, B),
      () => h.post(NIRVANA_CREATE.path, NIRVANA_CREATE.body, C),
    ]);
    const admitted = answers.filter((r) => r.status === 200);
    const refused = answers.filter((r) => r.status === 429);
    expect(admitted).toHaveLength(1);
    expect(refused).toHaveLength(2);
    for (const res of refused) expectCatalogueError(res, "E-13", 34200);
    expect(usage.recorded.filter((e) => e.kind === "created")).toHaveLength(1);
    expect(await usage.events.countPlaylistsMade(TODAY)).toBe(1);
  }, 20_000);

  it("AC-30: an address refused by the daily limit in a concurrent race is not counted against its address", async () => {
    const gate = heldGate();
    const usage = eventsWithGatedCount(gate);
    const h = makeHarness({ env: { PLAYSET_CREATE_LIMIT: "1", PLAYSET_DAILY_LIMIT: "1" }, events: usage.events });
    h.clock.set("2026-11-28T23:30:00.000Z");
    const addresses = [A, B];
    const answers = await allAtOnce(gate, [
      () => h.post(H_V1_CREATE.path, H_V1_CREATE.body, A),
      () => h.post(MADRID_CREATE.path, MADRID_CREATE.body, B),
    ]);
    expect(answers.map((r) => r.status).sort()).toEqual([200, 429]);
    const loser = addresses[answers.findIndex((r) => r.status === 429)]!;
    expectCatalogueError(answers.find((r) => r.status === 429)!, "E-13", 1800);

    // 40 minutes later (inside the loser's window, but a new UTC day): the loser is admitted.
    h.clock.set("2026-11-29T00:10:00.000Z");
    expect((await h.post(NIRVANA_CREATE.path, NIRVANA_CREATE.body, loser)).status).toBe(200);
  }, 20_000);
});

// ---------------------------------------------------------------- finished creates and a failed daily count

describe("the daily count and finished or failed creates (AC-30, AC-29)", () => {
  it("AC-30: a create that has finished no longer holds a daily slot", async () => {
    const h = makeHarness({ env: { PLAYSET_DAILY_LIMIT: "2" } });
    const first = await h.post(H_V1_CREATE.path, H_V1_CREATE.body, A);
    expect(first.status).toBe(200);
    expect(first.body).toStrictEqual({ url: SHARE_URL, status: "created" });
    expect(h.usage.recorded).toEqual([{ kind: "created", setlistId: H_ID, artist: "Pearl Jam", day: TODAY }]);

    // One playlist made today, limit 2: B is admitted (the finished create is counted once, from its event).
    const second = await h.post(MADRID_CREATE.path, MADRID_CREATE.body, B);
    expect(second.status).toBe(200);
    expect((second.body as { status: string }).status).toBe("created");
    expect(await h.usage.events.countPlaylistsMade(TODAY)).toBe(2);
    expect(h.hits.added).toEqual([]);

    // Now two are made: the next one is refused.
    expectCatalogueError(await h.post(NIRVANA_CREATE.path, NIRVANA_CREATE.body, C), "E-13", 34200);
    expect(h.hits.added).toEqual([TODAY]);
  });

  it("AC-30: when the daily count can't be read, the answer is 500 and the address slot is given back", async () => {
    const fake = makeFakeEvents();
    let failuresLeft = 1;
    const events = {
      recordEvent: fake.events.recordEvent,
      async countPlaylistsMade(day: string): Promise<number> {
        if (failuresLeft > 0) {
          failuresLeft--;
          throw new Error("SQLITE_IOERR: disk I/O error");
        }
        return fake.events.countPlaylistsMade(day);
      },
    };
    const h = makeHarness({ env: { PLAYSET_CREATE_LIMIT: "1" }, events });
    h.clock.set("2026-11-28T14:00:00.000Z");
    const failed = await h.post(H_V1_CREATE.path, H_V1_CREATE.body, A);
    expectCatalogueError(failed, "E-25");
    expectNoLeaks(failed);
    expect(h.http.requests).toEqual([]);
    expect(fake.recorded).toEqual([]);
    expect(h.hits.added).toEqual([]);
    expect(h.log.of("error")).toHaveLength(1);

    // Ten minutes later, same address, create limit 1: the failed request took no slot.
    h.clock.set("2026-11-28T14:10:00.000Z");
    const retried = await h.post(H_V1_CREATE.path, H_V1_CREATE.body, A);
    expect(retried.status).toBe(200);
    expect(retried.body).toStrictEqual({ url: SHARE_URL, status: "created" });
    expect(fake.recorded).toEqual([{ kind: "created", setlistId: H_ID, artist: "Pearl Jam", day: TODAY }]);
  });
});

// ---------------------------------------------------------------- a create that joins a queued run

describe("a create that joins a running one and the daily limit (AC-30, AC-31)", () => {
  it("AC-30: a create that only shares a queued run for the same version holds no daily slot", async () => {
    const h = makeHarness({ env: { PLAYSET_DAILY_LIMIT: "2" } });
    const gate = heldGate();
    h.spotify.createGate = gate;

    // A's create for 2bf1c8e4 g4bd1a2f6 holds one daily slot while its Spotify create waits.
    const fromA = Promise.resolve(h.post(H_V1_CREATE.path, H_V1_CREATE.body, A));
    await waitUntil(() => gate.state.waiting === 1, "A's create to wait");

    // B posts the same Setlist and version: it joins A's run and makes no playlist of its own.
    const fromB = Promise.resolve(h.post(H_V1_CREATE.path, H_V1_CREATE.body, B));
    await waitUntil(() => h.host.asked === 2, "B's request to reach the server");
    await flush();
    expect(gate.state.waiting).toBe(1);

    // C posts another Setlist while both wait: one slot is still free, so C is admitted.
    let cSettled = false;
    const fromC = Promise.resolve(h.post(MADRID_CREATE.path, MADRID_CREATE.body, C)).then((res) => {
      cSettled = true;
      return res;
    });
    await waitUntil(() => gate.state.waiting === 2 || cSettled, "C's create to wait or be answered");
    expect(cSettled).toBe(false);
    expect(gate.state.waiting).toBe(2);
    expect(h.hits.added).toEqual([]);

    gate.release();
    const [a, b, c] = await Promise.all([fromA, fromB, fromC]);
    expect(a.status).toBe(200);
    expect(a.body).toStrictEqual({ url: SHARE_URL, status: "created" });
    expect(b.status).toBe(200);
    expect(b.body).toStrictEqual({ url: SHARE_URL, status: "created" });
    expect(c.status).toBe(200);
    expect((c.body as { status: string }).status).toBe("created");
    expect(h.usage.recorded.filter((e) => e.kind === "created").map((e) => e.setlistId).sort()).toEqual([H_ID, MADRID_ID].sort());
    expect(await h.usage.events.countPlaylistsMade(TODAY)).toBe(2);

    // Two playlists made today, limit 2: the next one is refused.
    expectCatalogueError(await h.post(NIRVANA_CREATE.path, NIRVANA_CREATE.body, A), "E-13", 34200);
  }, 20_000);
});

// ---------------------------------------------------------------- quiet addresses swept out

describe("addresses that went quiet (AC-29)", () => {
  // The sweep itself (at most once a minute) has no public seam; this pins what a Visitor sees around it.
  const D = "198.51.100.23";

  it("AC-29: A and B counted at 14:00 then quiet; C's request at 15:00:30 and D's 30 s later are admitted, and A and B each get a fresh window", async () => {
    const h = makeHarness({ env: { PLAYSET_CREATE_LIMIT: "1" } });
    h.clock.set("2026-11-28T14:00:00.000Z");
    expect((await h.post(H_V1_CREATE.path, H_V1_CREATE.body, A)).status).toBe(200);
    expect((await h.post(MADRID_CREATE.path, MADRID_CREATE.body, B)).status).toBe(200);

    h.clock.set("2026-11-28T14:59:59.500Z");
    expectCatalogueError(await h.post(NIRVANA_CREATE.path, NIRVANA_CREATE.body, A), "E-12", 1);

    h.clock.set("2026-11-28T15:00:30.000Z");
    expect((await h.post(NIRVANA_CREATE.path, NIRVANA_CREATE.body, C)).status).toBe(200);

    h.clock.set("2026-11-28T15:01:00.000Z");
    expect((await h.post(H_V1_CREATE.path, H_V1_CREATE.body, D)).status).toBe(200);
    expectCatalogueError(await h.post(MADRID_CREATE.path, MADRID_CREATE.body, C), "E-12", 3570);

    expect((await h.post(NIRVANA_CREATE.path, NIRVANA_CREATE.body, A)).status).toBe(200);
    expectCatalogueError(await h.post(MADRID_CREATE.path, MADRID_CREATE.body, A), "E-12", 3600);
    expect((await h.post(H_V1_CREATE.path, H_V1_CREATE.body, B)).status).toBe(200);
    expectCatalogueError(await h.post(NIRVANA_CREATE.path, NIRVANA_CREATE.body, B), "E-12", 3600);
    expect(h.log.allText()).not.toContain(D);
  });
});
