// The SQLite store on a :memory: database (X17), the in-memory usage events and the rate-limit
// hit counter. Records behave as the core's in-memory records do.
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import type { SetlistPlaylistRecord } from "../../../src/core/index.js";
import { prepareSetlist, previewMatches } from "../../../src/core/run/index.js";
import {
  createMemoryUsageEvents,
  createRateLimitHitCounter,
  createSqliteStore,
} from "../../../src/web/server/index.js";
import { HOST_TOKEN, fakeMatchSearch, fixtureHv1, fixtureHv2, hostOutcomes } from "../../run/fixtures/host-setlists";

const r1Record: SetlistPlaylistRecord = {
  setlistId: "2bf1c8e4",
  playlistId: "5PqRsTuVwXyZaBcDeFgHiJ",
  shareUrl: "https://open.spotify.com/playlist/5PqRsTuVwXyZaBcDeFgHiJ",
  versionId: "g4bd1a2f6",
  createdAt: "2026-11-27T18:04:05.000Z",
};

const bigRecord: SetlistPlaylistRecord = {
  setlistId: "9ac1e5d3",
  playlistId: "8HiJkLmNoPqRsTuVwXyZaB",
  shareUrl: "https://open.spotify.com/playlist/8HiJkLmNoPqRsTuVwXyZaB",
  versionId: null,
  createdAt: "2026-11-27T18:04:05.000Z",
};

/** A preview of `setlist` (every Tape left out): Match URIs, and Alive a Miss with its queries. */
async function previewOf(setlist: ReturnType<typeof fixtureHv1>) {
  const prepared = await prepareSetlist(setlist, { keepTape: async () => false });
  const outcomes = { ...hostOutcomes, Alive: "miss" as const };
  return previewMatches(fakeMatchSearch(outcomes).services, prepared, HOST_TOKEN, {});
}

const store = () => {
  const db = new Database(":memory:");
  return { db, ...createSqliteStore(db) };
};

type UsageEvents = {
  recordEvent(event: { kind: "created" | "updated" | "opened"; setlistId: string; artist: string; day: string }): Promise<void>;
  countPlaylistsMade(day: string): Promise<number>;
};

async function recordX17Events(events: UsageEvents) {
  await events.recordEvent({ kind: "created", setlistId: "2bf1c8e4", artist: "Pearl Jam", day: "2026-11-28" });
  await events.recordEvent({ kind: "updated", setlistId: "2bf1c8e4", artist: "Pearl Jam", day: "2026-11-28" });
  await events.recordEvent({ kind: "opened", setlistId: "2bf1c8e4", artist: "Pearl Jam", day: "2026-11-28" });
  await events.recordEvent({ kind: "created", setlistId: "1bd5a2c8", artist: "Guns N' Roses", day: "2026-11-27" });
}

// ---------------------------------------------------------------- AC-35

describe("SQLite records (AC-35)", () => {
  it("AC-35: R1 — none, saved and equal, another id none, saved again replaces", async () => {
    const { records } = store();
    expect(await records.findRecord("2bf1c8e4")).toBeUndefined();
    await records.saveRecord(r1Record);
    expect(await records.findRecord("2bf1c8e4")).toStrictEqual(r1Record);
    expect(await records.findRecord("3bf1a7c2")).toBeUndefined();
    await records.saveRecord({ ...r1Record, versionId: "g2b5e7c19" });
    expect(await records.findRecord("2bf1c8e4")).toStrictEqual({ ...r1Record, versionId: "g2b5e7c19" });
  });

  it("AC-35: a record with versionId null comes back with null and every other field equal", async () => {
    const { records } = store();
    await records.saveRecord(bigRecord);
    expect(await records.findRecord("9ac1e5d3")).toStrictEqual(bigRecord);
  });

  it("AC-35: cached previews — deeply equal (Match URIs, Miss queries) only for their setlist id and version; saving again replaces; another version keeps both", async () => {
    const { records } = store();
    const previewV1 = await previewOf(fixtureHv1());
    const previewV2 = await previewOf(fixtureHv2());
    expect(JSON.stringify(previewV1)).toContain("spotify:track:4xGvbS8NnKtwKw5CXGkmA9");
    expect(JSON.stringify(previewV1)).toContain("queries");

    await records.savePreview("2bf1c8e4", "g4bd1a2f6", previewV1);
    expect(await records.findPreview("2bf1c8e4", "g4bd1a2f6")).toEqual(previewV1);
    expect(await records.findPreview("2bf1c8e4", "g2b5e7c19")).toBeUndefined();
    expect(await records.findPreview("3bf1a7c2", "g4bd1a2f6")).toBeUndefined();

    await records.savePreview("2bf1c8e4", "g2b5e7c19", previewV2);
    expect(await records.findPreview("2bf1c8e4", "g4bd1a2f6")).toEqual(previewV1);
    expect(await records.findPreview("2bf1c8e4", "g2b5e7c19")).toEqual(previewV2);

    await records.savePreview("2bf1c8e4", "g4bd1a2f6", previewV2);
    expect(await records.findPreview("2bf1c8e4", "g4bd1a2f6")).toEqual(previewV2);
  });

  it("AC-35: setlist id and version are kept apart (no joined key)", async () => {
    const { records } = store();
    const previewV1 = await previewOf(fixtureHv1());
    const previewV2 = await previewOf(fixtureHv2());
    await records.savePreview("2bf1c8e4:g4", "bd1a2f6", previewV1);
    await records.savePreview("2bf1c8e4", "g4:bd1a2f6", previewV2);
    expect(await records.findPreview("2bf1c8e4:g4", "bd1a2f6")).toEqual(previewV1);
    expect(await records.findPreview("2bf1c8e4", "g4:bd1a2f6")).toEqual(previewV2);
    expect(await records.findPreview("2bf1c8e4", "g4bd1a2f6")).toBeUndefined();
  });

  it("AC-35: every method answers with a Promise", async () => {
    const { records } = store();
    const results = [
      records.findRecord("2bf1c8e4"),
      records.saveRecord(r1Record),
      records.findPreview("2bf1c8e4", "g4bd1a2f6"),
    ];
    for (const result of results) expect(result).toBeInstanceOf(Promise);
    await Promise.all(results);
  });
});

// ---------------------------------------------------------------- AC-36

describe("SQLite usage events and safety (AC-36)", () => {
  it("AC-36: X17 events → 2 playlists made on 2026-11-28, 1 on 2026-11-27, 0 on 2026-11-26 (opens never count)", async () => {
    const { events } = store();
    await recordX17Events(events);
    expect(await events.countPlaylistsMade("2026-11-28")).toBe(2);
    expect(await events.countPlaylistsMade("2026-11-27")).toBe(1);
    expect(await events.countPlaylistsMade("2026-11-26")).toBe(0);
  });

  it("AC-36: createSqliteStore run again on the same database keeps every row and fails nothing", async () => {
    const db = new Database(":memory:");
    const first = createSqliteStore(db);
    await first.records.saveRecord(bigRecord);
    const previewV1 = await previewOf(fixtureHv1());
    await first.records.savePreview("2bf1c8e4", "g4bd1a2f6", previewV1);
    await recordX17Events(first.events);

    const second = createSqliteStore(db);
    expect(await second.events.countPlaylistsMade("2026-11-28")).toBe(2);
    expect(await second.records.findRecord("9ac1e5d3")).toStrictEqual(bigRecord);
    expect(await second.records.findPreview("2bf1c8e4", "g4bd1a2f6")).toEqual(previewV1);
  });

  it("AC-36: values with ', ; and -- are stored and read back unchanged (parameters, never SQL text)", async () => {
    const { db, records, events } = store();
    const tricky: SetlistPlaylistRecord = { ...r1Record, setlistId: "1bd5a2c8", versionId: "g1'; DROP TABLE x; --" };
    await records.saveRecord(tricky);
    expect(await records.findRecord("1bd5a2c8")).toStrictEqual(tricky);
    const preview = await previewOf(fixtureHv1());
    await records.savePreview("1bd5a2c8", "g1'; DROP TABLE x; --", preview);
    expect(await records.findPreview("1bd5a2c8", "g1'; DROP TABLE x; --")).toEqual(preview);

    await events.recordEvent({ kind: "created", setlistId: "1bd5a2c8", artist: "Guns N' Roses", day: "2026-11-27" });
    await events.recordEvent({ kind: "updated", setlistId: "x'; --", artist: "Robert'); DROP TABLE events;--", day: "2026-11-27" });
    expect(await events.countPlaylistsMade("2026-11-27")).toBe(2);
    expect(await events.countPlaylistsMade("2026-11-27' OR '1'='1")).toBe(0);

    const dump = JSON.stringify(
      (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>).map((t) =>
        db.prepare(`SELECT * FROM "${t.name}"`).all(),
      ),
    );
    expect(dump).toContain("Guns N' Roses");
    expect(dump).toContain("Robert'); DROP TABLE events;--");
    expect(await records.findRecord("1bd5a2c8")).toStrictEqual(tricky);
  });

  it("AC-36: the tables hold no column for an address", () => {
    const { db } = store();
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>;
    expect(tables.length).toBeGreaterThanOrEqual(1);
    for (const table of tables) {
      const columns = db.prepare(`PRAGMA table_info("${table.name}")`).all() as Array<{ name: string }>;
      for (const column of columns) expect(column.name.toLowerCase()).not.toMatch(/(^|_)ip($|_)|address/);
    }
  });
});

// ---------------------------------------------------------------- AC-37

describe("in-memory usage events (AC-37)", () => {
  it("AC-37: the same X17 events → 2, 1 and 0", async () => {
    const events = createMemoryUsageEvents();
    await recordX17Events(events);
    expect(await events.countPlaylistsMade("2026-11-28")).toBe(2);
    expect(await events.countPlaylistsMade("2026-11-27")).toBe(1);
    expect(await events.countPlaylistsMade("2026-11-26")).toBe(0);
  });

  it("AC-37: two in-memory stores share nothing", async () => {
    const first = createMemoryUsageEvents();
    const second = createMemoryUsageEvents();
    await first.recordEvent({ kind: "created", setlistId: "2bf1c8e4", artist: "Pearl Jam", day: "2026-11-28" });
    expect(await second.countPlaylistsMade("2026-11-28")).toBe(0);
  });

  it("AC-37: the SQLite and in-memory events agree on a longer mixed sequence", async () => {
    const memory = createMemoryUsageEvents();
    const { events: sqlite } = store();
    const kinds = ["created", "opened", "updated", "opened", "created", "updated", "opened"] as const;
    const days = ["2026-11-26", "2026-11-27", "2026-11-28"];
    for (let i = 0; i < 21; i++) {
      const event = { kind: kinds[i % kinds.length]!, setlistId: `${i}bf1c8e4`, artist: "Pearl Jam", day: days[i % days.length]! };
      await memory.recordEvent(event);
      await sqlite.recordEvent(event);
    }
    for (const day of [...days, "2026-11-29"]) {
      expect(await memory.countPlaylistsMade(day)).toBe(await sqlite.countPlaylistsMade(day));
    }
    expect(await memory.countPlaylistsMade("2026-11-28")).toBe(4);
  });
});

// ---------------------------------------------------------------- AC-32: the hit counter

describe("the rate-limit hit counter (AC-32)", () => {
  it("AC-32: counts additions per UTC day; a new counter starts at 0", () => {
    const hits = createRateLimitHitCounter();
    expect(hits.count("2026-11-28")).toBe(0);
    hits.add("2026-11-28");
    hits.add("2026-11-28");
    hits.add("2026-11-29");
    expect(hits.count("2026-11-28")).toBe(2);
    expect(hits.count("2026-11-29")).toBe(1);
    expect(hits.count("2026-11-27")).toBe(0);
    expect(createRateLimitHitCounter().count("2026-11-28")).toBe(0);
  });
});
