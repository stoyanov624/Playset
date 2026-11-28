// The Host token store (X2): the memory one and the SQLite one on :memory: keep exactly one
// stored Host token; the SQLite file holds tokens in one table, one row at most. And readUsage
// gives the same numbers from the memory and the SQLite usage events (X7).
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { createMemoryHostTokenStore, createMemoryUsageEvents, createSqliteStore } from "../../../src/web/server/index.js";
import {
  CODE,
  OTHER_ACCESS,
  OTHER_GRANT,
  OTHER_ID,
  T,
  makeAdminHarness,
  tokenError,
  type HostTokenStoreLike,
} from "./fixtures/admin";
import { A, B, C, HOST_TOKEN } from "./fixtures/harness";

const stores: Array<[string, () => HostTokenStoreLike]> = [
  ["memory", () => createMemoryHostTokenStore()],
  ["SQLite on :memory:", () => createSqliteStore(new Database(":memory:")).hostTokenStore],
];

function dumpTables(db: Database.Database): Array<{ table: string; rows: unknown[] }> {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>;
  return tables.map((t) => ({ table: t.name, rows: db.prepare(`SELECT * FROM "${t.name}"`).all() }));
}

describe.each(stores)("the %s Host token store (AC-7)", (_label, makeStore) => {
  it("AC-7: X2 — undefined, saved and equal, replaced (displayName key omitted), cleared", async () => {
    const store = makeStore();
    expect(await store.read()).toBeUndefined();
    await store.save(T);
    expect(await store.read()).toStrictEqual(T);
    const { displayName: _dropped, ...noName } = T;
    await store.save({ ...noName, accessToken: "BQDhost-second" });
    const second = await store.read();
    expect(second).toStrictEqual({
      accountId: "31abcxyzhost",
      accessToken: "BQDhost-second",
      refreshToken: "AQChost-refresh-token",
      expiresAt: 1795879800000,
    });
    expect(second !== undefined && "displayName" in second).toBe(false);
    await store.clear();
    expect(await store.read()).toBeUndefined();
  });

  it("AC-7: clear on an empty store is fine; save after clear works", async () => {
    const store = makeStore();
    await store.clear();
    expect(await store.read()).toBeUndefined();
    await store.save(T);
    expect(await store.read()).toStrictEqual(T);
  });

  it("AC-7: values with ', ; and -- are stored and read back unchanged", async () => {
    const store = makeStore();
    const tricky = { ...T, displayName: "O'Brien; DROP TABLE x; --", accessToken: "BQD'; --", refreshToken: "AQC;'--" };
    await store.save(tricky);
    expect(await store.read()).toStrictEqual(tricky);
  });

  it("AC-7: read gives a copy: changing it does not change the stored Host token", async () => {
    const store = makeStore();
    await store.save(T);
    const read = await store.read();
    if (read) read.accessToken = "BQDchanged";
    expect(await store.read()).toStrictEqual(T);
  });
});

describe("the SQLite Host token store (AC-7, AC-8)", () => {
  it("AC-7: createSqliteStore twice on the same database keeps the stored Host token and fails nothing", async () => {
    const db = new Database(":memory:");
    await createSqliteStore(db).hostTokenStore.save(T);
    const again = createSqliteStore(db);
    expect(await again.hostTokenStore.read()).toStrictEqual(T);
  });

  it("AC-7: two memory stores share nothing", async () => {
    const one = createMemoryHostTokenStore();
    const two = createMemoryHostTokenStore();
    await one.save(T);
    expect(await two.read()).toBeUndefined();
  });

  it("AC-8: after logins, a refused account, failures and a refresh, only one table holds a token, with one row, and no address", async () => {
    const db = new Database(":memory:");
    const sqlite = createSqliteStore(db);
    const a = makeAdminHarness({ hostTokenStore: sqlite.hostTokenStore, now: "2026-11-28T14:30:00.000Z" });

    // Two successful Host logins.
    await a.loginAsHost();
    await a.loginAsHost();
    // Another account refused.
    a.login.state.grant = OTHER_GRANT;
    a.login.state.account = { id: OTHER_ID };
    let s = await a.startLogin();
    await a.callback(`?code=${CODE}&state=${encodeURIComponent(s.state)}`, s.cookie);
    // An exchange failure.
    a.login.state.exchangeFails = await tokenError("invalid_grant");
    s = await a.startLogin();
    await a.callback(`?code=${CODE}&state=${encodeURIComponent(s.state)}`, s.cookie);
    // A refresh, through a preview an hour later.
    a.clock.set("2026-11-28T15:30:00.000Z");
    a.login.state.refreshWith = { grant: { accessToken: "BQDhost-refreshed", refreshToken: "AQChost-rotated", expiresAt: 1795883400000 } };
    await a.get("/api/setlists/73a1b2c5/preview", B);

    const dump = dumpTables(db);
    const withToken = dump.filter((t) => JSON.stringify(t.rows).includes("BQDhost-") || JSON.stringify(t.rows).includes("AQChost-"));
    expect(withToken).toHaveLength(1);
    expect(withToken[0]!.rows).toHaveLength(1);
    const all = JSON.stringify(dump);
    expect(all).not.toContain(OTHER_ACCESS);
    expect(all).not.toContain(OTHER_ID);
    expect(all).not.toContain(CODE);
    for (const address of [A, B, C]) expect(all).not.toContain(address);
    expect(await sqlite.hostTokenStore.read()).toStrictEqual({
      ...T,
      accessToken: "BQDhost-refreshed",
      refreshToken: "AQChost-rotated",
      expiresAt: 1795883400000,
    });
    expect(all).not.toContain(HOST_TOKEN);
  });

  it("AC-8: the tables hold no column for an address", () => {
    const db = new Database(":memory:");
    createSqliteStore(db);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>;
    for (const table of tables) {
      const columns = db.prepare(`PRAGMA table_info("${table.name}")`).all() as Array<{ name: string }>;
      for (const column of columns) expect(column.name.toLowerCase()).not.toMatch(/(^|_)ip($|_)|address/);
    }
  });
});

// ---------------------------------------------------------------- readUsage parity

type Kind = "created" | "updated" | "opened";
interface UsageEventsLike {
  recordEvent(event: { kind: Kind; setlistId: string; artist: string; day: string }): Promise<void>;
  readUsage(today: string): Promise<unknown> | unknown;
}

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
  ["2026-11-28", "created", "1a000001", "Robert'); DROP TABLE events;--"],
];

async function recordAll(events: UsageEventsLike) {
  for (const [day, kind, setlistId, artist] of X7_EVENTS) await events.recordEvent({ kind, setlistId, artist, day });
}

describe("readUsage (AC-23, AC-24)", () => {
  it("AC-24: the memory and SQLite usage events give the same readUsage for the same events", async () => {
    const memory: UsageEventsLike = createMemoryUsageEvents();
    const sqlite: UsageEventsLike = createSqliteStore(new Database(":memory:")).events;
    await recordAll(memory);
    await recordAll(sqlite);
    for (const today of ["2026-11-28", "2026-11-29", "2026-10-29", "2025-01-01"]) {
      expect(await sqlite.readUsage(today)).toStrictEqual(await memory.readUsage(today));
    }
  });

  it("AC-23, AC-24: the SQLite readUsage for 2026-11-28 is X7's usage (plus one tricky Artist name kept exactly)", async () => {
    const sqlite: UsageEventsLike = createSqliteStore(new Database(":memory:")).events;
    await recordAll(sqlite);
    const usage = (await sqlite.readUsage("2026-11-28")) as {
      playlistsMade: number;
      opens: number;
      perDay: Array<{ date: string; created: number; updated: number; opened: number }>;
      topArtists: Array<{ artist: string; playlistCount: number }>;
    };
    expect(usage.playlistsMade).toBe(7);
    expect(usage.opens).toBe(5);
    expect(usage.perDay).toHaveLength(30);
    expect(usage.perDay[0]).toStrictEqual({ date: "2026-11-28", created: 3, updated: 1, opened: 3 });
    expect(usage.perDay[1]).toStrictEqual({ date: "2026-11-27", created: 1, updated: 0, opened: 1 });
    expect(usage.perDay[2]).toStrictEqual({ date: "2026-11-26", created: 0, updated: 0, opened: 0 });
    expect(usage.perDay[29]).toStrictEqual({ date: "2026-10-30", created: 1, updated: 0, opened: 0 });
    expect(usage.topArtists).toStrictEqual([
      { artist: "Arctic Monkeys", playlistCount: 3 },
      { artist: "Guns N' Roses", playlistCount: 1 },
      { artist: "Pearl Jam", playlistCount: 1 },
      { artist: "Robert'); DROP TABLE events;--", playlistCount: 1 },
    ]);
  });

  it("AC-23: readUsage leaves the events unchanged (countPlaylistsMade before and after)", async () => {
    const sqlite = createSqliteStore(new Database(":memory:")).events;
    await recordAll(sqlite);
    const before = await sqlite.countPlaylistsMade("2026-11-28");
    await sqlite.readUsage("2026-11-28");
    expect(await sqlite.countPlaylistsMade("2026-11-28")).toBe(before);
  });
});
