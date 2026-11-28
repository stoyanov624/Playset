// Visitor addresses are never stored or logged (X15), and setlist.fm and Spotify are reached only
// through the services the app was built with (X16).
import Database from "better-sqlite3";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSqliteStore } from "../../../src/web/server/index.js";
import { expectCatalogueError } from "./fixtures/catalogue";
import {
  A,
  ADDRESSES,
  B,
  C,
  flush,
  makeGate,
  makeHarness,
  spotifyStatus,
  waitUntil,
  type HarnessOptions,
} from "./fixtures/harness";
import { H_ID, H_V1, H_V2, MADRID_ID, MADRID_VERSION, NIRVANA_ID, NIRVANA_VERSION, fixtureHv2 } from "./fixtures/setlists";

afterEach(() => {
  vi.unstubAllGlobals();
});

/** A busy afternoon: previews (cached, limited), creates and updates (limited, failing, shared), opens and errors. */
async function busyAfternoon(opts: HarnessOptions) {
  const h = makeHarness({ env: { PLAYSET_PREVIEW_LIMIT: "2", PLAYSET_CREATE_LIMIT: "2", PLAYSET_DAILY_LIMIT: "4" }, ...opts });
  h.clock.set("2026-11-28T14:00:00.000Z");
  await h.getStream(`/api/setlists/${MADRID_ID}/preview`, A);
  await h.getStream(`/api/setlists/${MADRID_ID}/preview`, A);
  await h.getStream(`/api/setlists/${H_ID}/preview`, A);
  await h.get(`/api/setlists/${NIRVANA_ID}/preview`, A);
  await h.getStream(`/api/setlists/${NIRVANA_ID}/preview`, B);

  await h.post(`/api/setlists/${H_ID}/playlist`, { versionId: H_V1 }, A);
  h.setlists[H_ID] = fixtureHv2();
  await h.post(`/api/setlists/${H_ID}/playlist`, { versionId: H_V2 }, A);
  await h.post(`/api/setlists/${MADRID_ID}/playlist`, { versionId: MADRID_VERSION }, A);
  h.spotify.playlistAnswers[h.playlistRequests().length] = spotifyStatus(500);
  await h.post(`/api/setlists/${MADRID_ID}/playlist`, { versionId: MADRID_VERSION }, B);

  const gate = makeGate();
  h.spotify.createGate = gate;
  const first = Promise.resolve(h.post(`/api/setlists/${MADRID_ID}/playlist`, { versionId: MADRID_VERSION }, B));
  await waitUntil(() => gate.state.waiting === 1, "the create to wait");
  const askedBefore = h.host.asked;
  const second = Promise.resolve(h.post(`/api/setlists/${MADRID_ID}/playlist`, { versionId: MADRID_VERSION }, C));
  await waitUntil(() => h.host.asked === askedBefore + 1, "the second create to reach the server");
  await flush();
  gate.release();
  await Promise.all([first, second]);

  await h.post(`/api/setlists/${NIRVANA_ID}/playlist`, { versionId: NIRVANA_VERSION }, C);
  await h.get(`/api/setlists/${H_ID}`, C);
  await h.get(`/api/setlists/00000000`, C);
  h.overrides.getSetlist = async () => {
    throw new Error("boom");
  };
  await h.get(`/api/setlists/${H_ID}`, C);
  return h;
}

// ---------------------------------------------------------------- AC-33

describe("Visitor addresses are never stored (AC-33)", () => {
  it("AC-33: after a busy afternoon on a SQLite store, no row of any table and no log line holds an address", async () => {
    const db = new Database(":memory:");
    const { records, events } = createSqliteStore(db);
    const h = await busyAfternoon({ records, events });

    expect(await events.countPlaylistsMade("2026-11-28")).toBeGreaterThanOrEqual(2);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>;
    expect(tables.length).toBeGreaterThanOrEqual(1);
    const dump = JSON.stringify(tables.map((t) => db.prepare(`SELECT * FROM "${t.name}"`).all()));
    expect(dump).toContain("2bf1c8e4");
    for (const address of ADDRESSES) {
      expect(dump).not.toContain(address);
      expect(h.log.allText()).not.toContain(address);
    }
  }, 20_000);

  it("AC-33: no usage event holds an address", async () => {
    const h = await busyAfternoon({});
    expect(h.usage.recorded.length).toBeGreaterThanOrEqual(3);
    const events = JSON.stringify(h.usage.recorded);
    for (const address of ADDRESSES) expect(events).not.toContain(address);
    for (const event of h.usage.recorded) expect(Object.keys(event).sort()).toEqual(["artist", "day", "kind", "setlistId"]);
  }, 20_000);
});

// ---------------------------------------------------------------- AC-34

describe("setlist.fm and Spotify only through the given services (AC-34)", () => {
  it("AC-34: through previews, creates, updates and opens the global fetch is never called; every request goes to setlist.fm's or Spotify's API", async () => {
    const globalFetch = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", globalFetch);
    const h = await busyAfternoon({});
    expect(globalFetch).not.toHaveBeenCalled();
    expect(h.http.requests.length).toBeGreaterThan(0);
    for (const r of h.http.requests) {
      expect(["https://api.setlist.fm", "https://api.spotify.com"]).toContain(r.url.origin);
    }
  }, 20_000);

  it("AC-34: reading a setlist.fm link makes no call at all", async () => {
    const globalFetch = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", globalFetch);
    const h = makeHarness();
    const res = await h.get(
      "/api/setlist-links?url=https://www.setlist.fm/setlist/pearl-jam/2026/moda-center-portland-or-2bf1c8e4.html",
    );
    expect(res.status).toBe(200);
    expect(h.http.requests).toEqual([]);
    expect(globalFetch).not.toHaveBeenCalled();
    expect(h.host.asked).toBe(0);
  });

  it("AC-34: setlist.fm is asked for the Setlist by id, never at the link a Visitor could send", async () => {
    const h = makeHarness();
    await h.get(`/api/setlists/${H_ID}`);
    expect(h.setlistFmRequests().map((r) => r.url.href)).toEqual([`https://api.setlist.fm/rest/1.0/setlist/${H_ID}`]);
  });
});

// ---------------------------------------------------------------- AC-1: the Visitor address behind one trusted proxy

describe("the Visitor address with PLAYSET_TRUST_PROXY=1 (AC-1)", () => {
  const create = (id: string, versionId: string) => ({ path: `/api/setlists/${id}/playlist`, body: { versionId } });
  const H_CREATE = create(H_ID, H_V1);
  const MADRID_CREATE = create(MADRID_ID, MADRID_VERSION);
  const NIRVANA_CREATE = create(NIRVANA_ID, NIRVANA_VERSION);

  it("AC-1: without X-Forwarded-For the connection's address is the Visitor's: two such requests share one limit, a forwarded address has its own", async () => {
    const h = makeHarness({ env: { PLAYSET_CREATE_LIMIT: "1" } });
    const bare = (t: { path: string; body: object }) => request(h.app).post(t.path).send(t.body);
    expect((await bare(H_CREATE)).status).toBe(200);
    expectCatalogueError(await bare(MADRID_CREATE), "E-12", 3600);
    expect((await h.post(MADRID_CREATE.path, MADRID_CREATE.body, A)).status).toBe(200);
  });

  it("AC-1: with several hops the last entry is the Visitor's (one proxy hop trusted)", async () => {
    const h = makeHarness({ env: { PLAYSET_CREATE_LIMIT: "1" } });
    expect((await h.post(H_CREATE.path, H_CREATE.body, `${C}, ${B}, ${A}`)).status).toBe(200);
    // A has used its one create; B and C, earlier in the chain, have not.
    expectCatalogueError(await h.post(MADRID_CREATE.path, MADRID_CREATE.body, A), "E-12", 3600);
    expect((await h.post(MADRID_CREATE.path, MADRID_CREATE.body, B)).status).toBe(200);
    expect((await h.post(NIRVANA_CREATE.path, NIRVANA_CREATE.body, C)).status).toBe(200);
  });

  it("AC-1: a spoofed leading entry is ignored: a Visitor can't spend another address's limit, nor escape its own", async () => {
    const h = makeHarness({ env: { PLAYSET_CREATE_LIMIT: "1" } });
    expect((await h.post(H_CREATE.path, H_CREATE.body, B)).status).toBe(200);
    // B claims to be A in front: still B, still at its limit.
    expectCatalogueError(await h.post(MADRID_CREATE.path, MADRID_CREATE.body, `${A}, ${B}`), "E-12", 3600);
    // A's own limit was never touched by the spoofed entry.
    expect((await h.post(MADRID_CREATE.path, MADRID_CREATE.body, A)).status).toBe(200);
    for (const address of ADDRESSES) expect(h.log.allText()).not.toContain(address);
  });
});
