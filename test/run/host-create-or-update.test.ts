// The create-or-update Host step (PRD 0014 AC-11 to AC-21, examples H1 to H7). Spotify is a fake
// behind the core's own service wiring (createRunServices over a routed fake fetch and a fake sleep),
// so the request sequence below is the one the real code sends. Records are a fresh in-memory store.
import { describe, expect, it } from "vitest";
import { NothingToAddError, PlaysetError, type SetlistFmSetlist } from "../../src/core/index.js";
import {
  MissingSetlistVersionError,
  PartlyUpdatedPlaylistError,
  SetlistChangedError,
  createMemorySetlistPlaylistRecords,
  createOrUpdateSetlistPlaylist,
  findSetlistPlaylist,
  type SetlistPlaylistRecord,
} from "../../src/core/run/index.js";
import {
  DescriptionTooLongError,
  PartlyCreatedPlaylistError,
  PlaylistRateLimitError,
  SpotifyPlaylistError,
} from "../../src/core/setlist-playlist";
import { captureError } from "./fixtures/call-recorder";
import { fixtureA, setlistUrlOfLength } from "./fixtures/setlists";
import {
  BIG_NAME,
  BIG_RECORDED_ID,
  BIG_SETLIST_ID,
  BIG_VERSION,
  H_DESCRIPTION,
  H_SETLIST_ID,
  H_V1,
  H_V1_NAME,
  H_V1_URIS,
  H_V2,
  H_V2_NAME,
  H_V2_URIS,
  HOST_TOKEN,
  LATER_ISO,
  NEW_PLAYLIST_ID,
  NEW_SHARE_URL,
  NOW_ISO,
  PARTLY_ID,
  PARTLY_SHARE_URL,
  PLAYLIST_ID,
  SHARE_URL,
  answer,
  bigOutcomes,
  bigSetlist,
  bigUris,
  bodyOf,
  cachePreview,
  clockAt,
  errorText,
  findInChain,
  fixtureHv1,
  fixtureHv2,
  h1Record,
  hostOutcomes,
  makeHostSpotify,
  networkFailure,
  rateLimited,
  spyRecords,
  variant,
  type HostSpotifyOptions,
} from "./fixtures/host-setlists";

const API = "https://api.spotify.com";
const items = (id: string) => `${API}/v1/playlists/${id}/items`;
const details = (id: string) => `${API}/v1/playlists/${id}`;
const CREATE = `${API}/v1/me/playlists`;

interface Setup {
  record?: SetlistPlaylistRecord;
  /** Setlists whose preview (every Tape left out, Fixture H's Matches) is cached first. */
  cached?: SetlistFmSetlist[];
  spotify?: HostSpotifyOptions;
}

async function setup(opts: Setup = {}) {
  const store = createMemorySetlistPlaylistRecords();
  if (opts.record) await store.saveRecord(opts.record);
  for (const setlist of opts.cached ?? []) {
    const id = (setlist as unknown as { id: string }).id;
    await cachePreview(store, setlist, id === BIG_SETLIST_ID ? bigOutcomes() : hostOutcomes);
  }
  const spy = spyRecords(store);
  const spotify = makeHostSpotify(opts.spotify);
  const run = (setlist: SetlistFmSetlist, previewedVersionId: string, nowIso = NOW_ISO) =>
    createOrUpdateSetlistPlaylist(spotify.services, setlist, previewedVersionId, {
      accessToken: HOST_TOKEN,
      records: spy.records,
      now: clockAt(nowIso),
    });
  return { store, spy, spotify, run };
}

const saves = (calls: string[]) => calls.filter((c) => c.startsWith("save"));

/** Every request the Host steps sent stays within the allowed Spotify API (AC-21). */
function expectAllowedRequests(requests: Array<{ url: URL; method: string }>) {
  for (const r of requests) {
    expect(r.url.origin).toBe(API);
    expect(r.url.pathname).not.toContain("/v1/users/");
    expect(r.url.pathname.endsWith("/tracks")).toBe(false);
    expect(r.url.pathname).not.toContain("/v1/me/library");
    expect(r.url.pathname).not.toContain("/followers");
    if (r.method === "GET") expect(r.url.pathname).toBe("/v1/search");
  }
}

// ---------------------------------------------------------------- AC-11

describe("createOrUpdateSetlistPlaylist — checks before Spotify (H6)", () => {
  it("AC-11: H v2 previewed as g4bd1a2f6 → the Setlist-changed error with both versions; 0 requests; nothing saved", async () => {
    const t = await setup();
    const err = await captureError(t.run(fixtureHv2(), H_V1));
    expect(err).toBeInstanceOf(SetlistChangedError);
    expect(err).toBeInstanceOf(PlaysetError);
    const changed = err as SetlistChangedError;
    expect(changed.message).toBe("This Setlist was changed on setlist.fm after the preview.");
    expect(changed.hint).toBe("Load a fresh preview, then create the Setlist Playlist again.");
    expect(changed.previewedVersionId).toBe(H_V1);
    expect(changed.currentVersionId).toBe(H_V2);
    expect(t.spotify.http.requests).toEqual([]);
    expect(saves(t.spy.calls)).toEqual([]);
    expect(await t.store.findPreview(H_SETLIST_ID, H_V2)).toBeUndefined();
  });

  it("AC-11: the Setlist-changed check comes even with a record and a cached preview: no request, record unchanged", async () => {
    const t = await setup({ record: h1Record(), cached: [fixtureHv2()] });
    const err = await captureError(t.run(fixtureHv2(), H_V1));
    expect(err).toBeInstanceOf(SetlistChangedError);
    expect(t.spotify.http.requests).toEqual([]);
    expect(saves(t.spy.calls)).toEqual([]);
    expect(await t.store.findRecord(H_SETLIST_ID)).toEqual(h1Record());
  });

  it("AC-11: Fixture A (no versionId) → the no-version error naming 63a5e2b7; 0 requests; nothing saved", async () => {
    const t = await setup();
    const err = await captureError(t.run(fixtureA(), "g6bd2a6f2"));
    expect(err).toBeInstanceOf(MissingSetlistVersionError);
    expect(err).toBeInstanceOf(PlaysetError);
    expect((err as MissingSetlistVersionError).setlistId).toBe("63a5e2b7");
    expect((err as Error).message).toContain("63a5e2b7");
    expect(t.spotify.http.requests).toEqual([]);
    expect(saves(t.spy.calls)).toEqual([]);
  });

  it("AC-11: H v1 with versionId \"\" previewed as \"\" → the no-version error naming 2bf1c8e4, not the Setlist-changed error", async () => {
    const t = await setup();
    const err = await captureError(t.run(variant(fixtureHv1(), { versionId: "" }), ""));
    expect(err).toBeInstanceOf(MissingSetlistVersionError);
    expect((err as Error).message).toContain(H_SETLIST_ID);
    expect(t.spotify.http.requests).toEqual([]);
    expect(saves(t.spy.calls)).toEqual([]);
  });

  it("AC-11: a Setlist without an id → the no-version error naming \"unknown\"", async () => {
    const t = await setup();
    const err = await captureError(t.run(variant(fixtureHv1(), { id: undefined }), H_V1));
    expect(err).toBeInstanceOf(MissingSetlistVersionError);
    expect((err as Error).message).toContain("unknown");
    expect(t.spotify.http.requests).toEqual([]);
    expect(saves(t.spy.calls)).toEqual([]);
  });

  it("AC-11: no version and a different previewed version → the no-version check comes first", async () => {
    const t = await setup();
    const err = await captureError(t.run(fixtureA(), "g0000000"));
    expect(err).toBeInstanceOf(MissingSetlistVersionError);
    expect(err).not.toBeInstanceOf(SetlistChangedError);
  });

  it("AC-11: a changed Setlist whose description would be too long → the Setlist-changed error comes first", async () => {
    const t = await setup();
    const err = await captureError(t.run(variant(fixtureHv2(), { url: setlistUrlOfLength(276) }), H_V1));
    expect(err).toBeInstanceOf(SetlistChangedError);
    expect(t.spotify.http.requests).toEqual([]);
  });
});

// ---------------------------------------------------------------- AC-12, AC-13, AC-15

describe("createOrUpdateSetlistPlaylist — create, no record (H1)", () => {
  it("AC-13, AC-15: no record, no cached preview → 3 searches, then create (public) and add items; exactly that sequence", async () => {
    const t = await setup();
    await t.run(fixtureHv1(), H_V1);
    const requests = t.spotify.http.requests;
    const firstPlaylist = requests.findIndex((r) => r.url.pathname !== "/v1/search");
    const searches = requests.slice(0, firstPlaylist);
    expect(searches.length).toBeGreaterThanOrEqual(3);
    for (const s of searches) expect(s.headers.get("Authorization")).toBe(`Bearer ${HOST_TOKEN}`);
    const searchedTitles = searches.map((s) => /track:"([^"]*)"/.exec(s.url.searchParams.get("q") ?? "")?.[1]);
    expect(searchedTitles.filter((title, i) => title !== searchedTitles[i - 1])).toEqual(["Release", "Even Flow", "Alive"]);
    expect(requests.slice(firstPlaylist).every((r) => r.url.pathname !== "/v1/search")).toBe(true);

    expect(t.spotify.playlistCalls()).toEqual([`POST ${CREATE}`, `POST ${items(PLAYLIST_ID)}`]);
    const [create, add] = t.spotify.playlistRequests();
    expect(bodyOf(create)).toEqual({ name: H_V1_NAME, description: H_DESCRIPTION, public: true });
    expect(bodyOf(add)).toEqual({ uris: H_V1_URIS });
    for (const r of t.spotify.playlistRequests()) {
      expect(r.headers.get("Authorization")).toBe(`Bearer ${HOST_TOKEN}`);
      expect(r.headers.get("Content-Type")).toMatch(/^application\/json/);
    }
  });

  it("AC-15: the result is created with the playlist id, share link, name and 3 tracks; the record is saved exactly", async () => {
    const t = await setup();
    const result = await t.run(fixtureHv1(), H_V1);
    expect(result).toEqual({
      status: "created",
      playlist: { id: PLAYLIST_ID, shareUrl: SHARE_URL, name: H_V1_NAME, trackCount: 3 },
    });
    expect(await t.store.findRecord(H_SETLIST_ID)).toEqual({
      setlistId: "2bf1c8e4",
      playlistId: "5PqRsTuVwXyZaBcDeFgHiJ",
      shareUrl: "https://open.spotify.com/playlist/5PqRsTuVwXyZaBcDeFgHiJ",
      versionId: "g4bd1a2f6",
      createdAt: "2026-11-27T18:04:05.000Z",
    });
    expect(await findSetlistPlaylist(H_SETLIST_ID, H_V1, { records: t.store })).toEqual({
      kind: "current",
      playlistId: PLAYLIST_ID,
      shareUrl: SHARE_URL,
    });
  });

  it("AC-13: with no cached preview the step saves its result as the cached preview under 2bf1c8e4 + g4bd1a2f6", async () => {
    const t = await setup();
    await t.run(fixtureHv1(), H_V1);
    const cached = await t.store.findPreview(H_SETLIST_ID, H_V1);
    expect(cached?.matches.map((m) => m.uri)).toEqual(H_V1_URIS);
    expect(cached?.playlistName).toBe(H_V1_NAME);
    expect(cached?.misses).toEqual([]);
  });

  it("AC-15: no duplicate-name request (no GET /v1/me/playlists)", async () => {
    const t = await setup();
    await t.run(fixtureHv1(), H_V1);
    expect(t.spotify.http.requests.some((r) => r.method === "GET" && r.url.pathname === "/v1/me/playlists")).toBe(false);
  });

  it("AC-13: with the v1 preview cached → only create and add items; no Match search", async () => {
    const t = await setup({ cached: [fixtureHv1()] });
    const result = await t.run(fixtureHv1(), H_V1);
    expect(t.spotify.searchRequests()).toEqual([]);
    expect(t.spotify.playlistCalls()).toEqual([`POST ${CREATE}`, `POST ${items(PLAYLIST_ID)}`]);
    expect(t.spotify.http.requests).toHaveLength(2);
    expect(result.playlist.trackCount).toBe(3);
  });

  it("AC-13: a cached preview's Matches are used as they are, even when a search would now find something else", async () => {
    const store = createMemorySetlistPlaylistRecords();
    // Cached when Spotify had no "Even Flow": 2 Matches.
    const { ["Even Flow"]: _skipped, ...withoutEvenFlow } = hostOutcomes;
    await cachePreview(store, fixtureHv1(), withoutEvenFlow);
    const spotify = makeHostSpotify();
    const result = await createOrUpdateSetlistPlaylist(spotify.services, fixtureHv1(), H_V1, {
      accessToken: HOST_TOKEN,
      records: store,
      now: clockAt(NOW_ISO),
    });
    expect(spotify.searchRequests()).toEqual([]);
    expect(bodyOf(spotify.playlistRequests()[1])).toEqual({
      uris: ["spotify:track:4xGvbS8NnKtwKw5CXGkmA9", "spotify:track:3VbM2t6DQHmPWdbTvKrNKz"],
    });
    expect(result.playlist.trackCount).toBe(2);
  });

  it("AC-12: H v2 (a Tape) → Master/Slave is left out, no question; v2's name and description in the create body", async () => {
    const t = await setup();
    const result = await t.run(fixtureHv2(), H_V2);
    const searchedTitles = t.spotify
      .searchRequests()
      .map((s) => /track:"([^"]*)"/.exec(s.url.searchParams.get("q") ?? "")?.[1]);
    expect(searchedTitles).not.toContain("Master/Slave");
    const [create, add] = t.spotify.playlistRequests();
    expect(bodyOf(create)).toEqual({ name: H_V2_NAME, description: H_DESCRIPTION, public: true });
    expect(bodyOf(add)).toEqual({ uris: H_V2_URIS });
    expect(result).toEqual({
      status: "created",
      playlist: { id: PLAYLIST_ID, shareUrl: SHARE_URL, name: H_V2_NAME, trackCount: 5 },
    });
  });

  it("AC-12: a description that would be 301 characters → the description-too-long error before any request; nothing saved (H7)", async () => {
    const t = await setup();
    const longUrl = setlistUrlOfLength(276);
    const err = await captureError(t.run(variant(fixtureHv1(), { url: longUrl }), H_V1));
    expect(err).toBeInstanceOf(DescriptionTooLongError);
    expect(t.spotify.http.requests).toEqual([]);
    expect(saves(t.spy.calls)).toEqual([]);
  });

  it("AC-15: H4 create with no record → POST create, then POST 1–100, 101–200 (position 50 is T007), 201–230; 230 tracks", async () => {
    const t = await setup({ cached: [bigSetlist()], spotify: { createdIds: [BIG_RECORDED_ID] } });
    const result = await t.run(bigSetlist(), BIG_VERSION);
    const uris = bigUris();
    expect(t.spotify.playlistCalls()).toEqual([
      `POST ${CREATE}`,
      `POST ${items(BIG_RECORDED_ID)}`,
      `POST ${items(BIG_RECORDED_ID)}`,
      `POST ${items(BIG_RECORDED_ID)}`,
    ]);
    const [create, ...adds] = t.spotify.playlistRequests();
    expect(bodyOf(create)).toMatchObject({ name: BIG_NAME, public: true });
    expect(adds.map((r) => (bodyOf(r) as { uris: string[] }).uris)).toEqual([
      uris.slice(0, 100),
      uris.slice(100, 200),
      uris.slice(200, 230),
    ]);
    expect((bodyOf(adds[1]) as { uris: string[] }).uris[49]).toBe("spotify:track:T007");
    expect(result).toEqual({
      status: "created",
      playlist: {
        id: BIG_RECORDED_ID,
        shareUrl: `https://open.spotify.com/playlist/${BIG_RECORDED_ID}`,
        name: BIG_NAME,
        trackCount: 230,
      },
    });
  });
});

// ---------------------------------------------------------------- AC-14

describe("createOrUpdateSetlistPlaylist — nothing to add (H7)", () => {
  const h7 = (songs: unknown[]): SetlistFmSetlist =>
    variant(fixtureHv1(), { id: "4cf2a8b1", versionId: "g5c3d2e1f", sets: { set: songs.length ? [{ song: songs }] : [] } });

  it("AC-14: every Match search finds nothing → the nothing-to-add error after the searches only; no record; the 2-Miss preview is cached", async () => {
    const t = await setup({ spotify: { tracks: {} } });
    const err = await captureError(t.run(h7([{ name: "Release" }, { name: "Even Flow" }]), "g5c3d2e1f"));
    expect(err).toBeInstanceOf(NothingToAddError);
    expect(t.spotify.playlistRequests()).toEqual([]);
    expect(t.spotify.searchRequests().length).toBeGreaterThanOrEqual(2);
    expect(await t.store.findRecord("4cf2a8b1")).toBeUndefined();
    const cached = await t.store.findPreview("4cf2a8b1", "g5c3d2e1f");
    expect(cached?.matches).toEqual([]);
    expect(cached?.misses.map((m) => m.title)).toEqual(["Release", "Even Flow"]);
  });

  it("AC-14: only a Tape (Intro) → the nothing-to-add error; 0 requests; no record", async () => {
    const t = await setup();
    const err = await captureError(t.run(h7([{ name: "Intro", tape: true }]), "g5c3d2e1f"));
    expect(err).toBeInstanceOf(NothingToAddError);
    expect(t.spotify.http.requests).toEqual([]);
    expect(await t.store.findRecord("4cf2a8b1")).toBeUndefined();
  });

  it("AC-14: a Placeholder Setlist (no sets) → the nothing-to-add error; 0 requests; no record", async () => {
    const t = await setup();
    const err = await captureError(t.run(h7([]), "g5c3d2e1f"));
    expect(err).toBeInstanceOf(NothingToAddError);
    expect(t.spotify.http.requests).toEqual([]);
    expect(saves(t.spy.calls).filter((c) => c.startsWith("saveRecord"))).toEqual([]);
  });

  it("AC-14: a record exists and the new version is all Misses → nothing-to-add; searches only, no PUT; the record is unchanged", async () => {
    const record = h1Record({ setlistId: "4cf2a8b1", versionId: "g0a1b2c3d" });
    const t = await setup({ record, spotify: { tracks: {} } });
    const err = await captureError(t.run(h7([{ name: "Release" }, { name: "Even Flow" }]), "g5c3d2e1f"));
    expect(err).toBeInstanceOf(NothingToAddError);
    expect(t.spotify.playlistRequests()).toEqual([]);
    expect(await t.store.findRecord("4cf2a8b1")).toEqual(record);
  });
});

// ---------------------------------------------------------------- AC-16

describe("createOrUpdateSetlistPlaylist — update in place (H2)", () => {
  it("AC-16: record v1, H v2 previewed g2b5e7c19 → PUT items (5 URIs), then PUT name and description; exactly 2 requests", async () => {
    const t = await setup({ record: h1Record(), cached: [fixtureHv2()] });
    await t.run(fixtureHv2(), H_V2, LATER_ISO);
    expect(t.spotify.http.requests.map((r) => `${r.method} ${r.url.origin}${r.url.pathname}`)).toEqual([
      `PUT ${items(PLAYLIST_ID)}`,
      `PUT ${details(PLAYLIST_ID)}`,
    ]);
    const [replace, rename] = t.spotify.http.requests;
    expect(bodyOf(replace)).toEqual({ uris: H_V2_URIS });
    expect(bodyOf(rename)).toEqual({ name: H_V2_NAME, description: H_DESCRIPTION });
    for (const r of t.spotify.http.requests) {
      expect(r.headers.get("Authorization")).toBe(`Bearer ${HOST_TOKEN}`);
      expect(r.headers.get("Content-Type")).toMatch(/^application\/json/);
    }
  });

  it("AC-16: the result is updated with the recorded id and link, v2's name and 5 tracks; the record keeps id, link and createdAt, gains g2b5e7c19", async () => {
    const t = await setup({ record: h1Record(), cached: [fixtureHv2()] });
    const result = await t.run(fixtureHv2(), H_V2, LATER_ISO);
    expect(result).toEqual({
      status: "updated",
      playlist: { id: PLAYLIST_ID, shareUrl: SHARE_URL, name: H_V2_NAME, trackCount: 5 },
    });
    expect(await t.store.findRecord(H_SETLIST_ID)).toEqual({
      setlistId: H_SETLIST_ID,
      playlistId: PLAYLIST_ID,
      shareUrl: SHARE_URL,
      versionId: H_V2,
      createdAt: NOW_ISO,
    });
    expect(await findSetlistPlaylist(H_SETLIST_ID, H_V2, { records: t.store })).toMatchObject({ kind: "current" });
  });

  it("AC-16: the rename body has no public setting", async () => {
    const t = await setup({ record: h1Record(), cached: [fixtureHv2()] });
    await t.run(fixtureHv2(), H_V2);
    expect(Object.keys(bodyOf(t.spotify.http.requests[1]) as object).sort()).toEqual(["description", "name"]);
  });

  it("AC-16: the same record and the same version (H v1) still update: PUT 3 URIs, then v1's name; status updated", async () => {
    const t = await setup({ record: h1Record(), cached: [fixtureHv1()] });
    const result = await t.run(fixtureHv1(), H_V1);
    expect(t.spotify.playlistCalls()).toEqual([`PUT ${items(PLAYLIST_ID)}`, `PUT ${details(PLAYLIST_ID)}`]);
    expect(bodyOf(t.spotify.http.requests[0])).toEqual({ uris: H_V1_URIS });
    expect(bodyOf(t.spotify.http.requests[1])).toEqual({ name: H_V1_NAME, description: H_DESCRIPTION });
    expect(result).toEqual({
      status: "updated",
      playlist: { id: PLAYLIST_ID, shareUrl: SHARE_URL, name: H_V1_NAME, trackCount: 3 },
    });
  });

  it("AC-16: a record with no version (null) is updated the same way and then holds the Setlist's version", async () => {
    const t = await setup({ record: h1Record({ versionId: null }), cached: [fixtureHv2()] });
    const result = await t.run(fixtureHv2(), H_V2);
    expect(t.spotify.playlistCalls()).toEqual([`PUT ${items(PLAYLIST_ID)}`, `PUT ${details(PLAYLIST_ID)}`]);
    expect(result.status).toBe("updated");
    expect(await t.store.findRecord(H_SETLIST_ID)).toEqual(h1Record({ versionId: H_V2 }));
  });

  it("AC-16: H4 update of 230 Matches → PUT 1–100, POST 101–200 (position 50 is T007), POST 201–230, then the rename", async () => {
    const record = h1Record({ setlistId: BIG_SETLIST_ID, playlistId: BIG_RECORDED_ID, shareUrl: `https://open.spotify.com/playlist/${BIG_RECORDED_ID}`, versionId: "g0f0f0f0f" });
    const t = await setup({ record, cached: [bigSetlist()] });
    const result = await t.run(bigSetlist(), BIG_VERSION);
    const uris = bigUris();
    expect(t.spotify.playlistCalls()).toEqual([
      `PUT ${items(BIG_RECORDED_ID)}`,
      `POST ${items(BIG_RECORDED_ID)}`,
      `POST ${items(BIG_RECORDED_ID)}`,
      `PUT ${details(BIG_RECORDED_ID)}`,
    ]);
    const bodies = t.spotify.playlistRequests().map((r) => bodyOf(r));
    expect(bodies.slice(0, 3)).toEqual([{ uris: uris.slice(0, 100) }, { uris: uris.slice(100, 200) }, { uris: uris.slice(200, 230) }]);
    expect((bodies[1] as { uris: string[] }).uris[49]).toBe("spotify:track:T007");
    expect(bodies[3]).toEqual({
      name: BIG_NAME,
      description: "Setlist from setlist.fm: https://www.setlist.fm/setlist/pearl-jam/2026/moda-center-portland-or-9ac1e5d3.html",
    });
    expect(result.status).toBe("updated");
    expect(result.playlist.trackCount).toBe(230);
  });

  it("AC-16: exactly 100 Matches → one PUT with 100 URIs, then the rename", async () => {
    const setlist = bigSetlist(100);
    const record = h1Record({ setlistId: BIG_SETLIST_ID, playlistId: BIG_RECORDED_ID, versionId: null });
    const store = createMemorySetlistPlaylistRecords();
    await store.saveRecord(record);
    await cachePreview(store, setlist, bigOutcomes(100));
    const spotify = makeHostSpotify();
    await createOrUpdateSetlistPlaylist(spotify.services, setlist, BIG_VERSION, { accessToken: HOST_TOKEN, records: store });
    expect(spotify.playlistCalls()).toEqual([`PUT ${items(BIG_RECORDED_ID)}`, `PUT ${details(BIG_RECORDED_ID)}`]);
    expect((bodyOf(spotify.http.requests[0]) as { uris: string[] }).uris).toEqual(bigUris(100));
  });

  it("AC-16: 101 Matches → PUT 100, POST 1, then the rename", async () => {
    const setlist = bigSetlist(101);
    const record = h1Record({ setlistId: BIG_SETLIST_ID, playlistId: BIG_RECORDED_ID, versionId: null });
    const store = createMemorySetlistPlaylistRecords();
    await store.saveRecord(record);
    await cachePreview(store, setlist, bigOutcomes(101));
    const spotify = makeHostSpotify();
    await createOrUpdateSetlistPlaylist(spotify.services, setlist, BIG_VERSION, { accessToken: HOST_TOKEN, records: store });
    expect(spotify.playlistCalls()).toEqual([
      `PUT ${items(BIG_RECORDED_ID)}`,
      `POST ${items(BIG_RECORDED_ID)}`,
      `PUT ${details(BIG_RECORDED_ID)}`,
    ]);
    expect(bodyOf(spotify.http.requests[1])).toEqual({ uris: ["spotify:track:T101"] });
  });

  it("AC-16: the default clock is Date.now (a create without `now` records an ISO 8601 UTC createdAt)", async () => {
    const store = createMemorySetlistPlaylistRecords();
    await cachePreview(store, fixtureHv1(), hostOutcomes);
    const spotify = makeHostSpotify();
    const before = Date.now();
    await createOrUpdateSetlistPlaylist(spotify.services, fixtureHv1(), H_V1, { accessToken: HOST_TOKEN, records: store });
    const after = Date.now();
    const createdAt = (await store.findRecord(H_SETLIST_ID))!.createdAt;
    expect(createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(Date.parse(createdAt)).toBeGreaterThanOrEqual(before);
    expect(Date.parse(createdAt)).toBeLessThanOrEqual(after);
  });
});

// ---------------------------------------------------------------- AC-17

describe("createOrUpdateSetlistPlaylist — the recorded playlist was deleted (H3)", () => {
  it("AC-17: PUT items 404 → a new public playlist with v2's 5 URIs; nothing more to the old id; the record replaced", async () => {
    const t = await setup({
      record: h1Record(),
      cached: [fixtureHv2()],
      spotify: { deleted: [PLAYLIST_ID], createdIds: [NEW_PLAYLIST_ID] },
    });
    const result = await t.run(fixtureHv2(), H_V2, LATER_ISO);
    expect(t.spotify.playlistCalls()).toEqual([`PUT ${items(PLAYLIST_ID)}`, `POST ${CREATE}`, `POST ${items(NEW_PLAYLIST_ID)}`]);
    const [replace, create, add] = t.spotify.playlistRequests();
    expect(bodyOf(replace)).toEqual({ uris: H_V2_URIS });
    expect(bodyOf(create)).toEqual({ name: H_V2_NAME, description: H_DESCRIPTION, public: true });
    expect(bodyOf(add)).toEqual({ uris: H_V2_URIS });
    expect(result).toEqual({
      status: "created",
      playlist: { id: NEW_PLAYLIST_ID, shareUrl: NEW_SHARE_URL, name: H_V2_NAME, trackCount: 5 },
    });
    expect(await t.store.findRecord(H_SETLIST_ID)).toEqual({
      setlistId: "2bf1c8e4",
      playlistId: "6QrStUvWxYzAbCdEfGhIjK",
      shareUrl: "https://open.spotify.com/playlist/6QrStUvWxYzAbCdEfGhIjK",
      versionId: "g2b5e7c19",
      createdAt: "2026-11-28T09:00:00.000Z",
    });
  });

  it("AC-17: a current record (H v1) whose playlist was deleted → 404 on the replace, then a new playlist; created", async () => {
    const t = await setup({
      record: h1Record(),
      cached: [fixtureHv1()],
      spotify: { deleted: [PLAYLIST_ID], createdIds: [NEW_PLAYLIST_ID] },
    });
    const result = await t.run(fixtureHv1(), H_V1, LATER_ISO);
    expect(t.spotify.playlistCalls()).toEqual([`PUT ${items(PLAYLIST_ID)}`, `POST ${CREATE}`, `POST ${items(NEW_PLAYLIST_ID)}`]);
    expect(result.status).toBe("created");
    expect(result.playlist.id).toBe(NEW_PLAYLIST_ID);
    expect(await t.store.findRecord(H_SETLIST_ID)).toEqual(
      h1Record({ playlistId: NEW_PLAYLIST_ID, shareUrl: NEW_SHARE_URL, createdAt: LATER_ISO }),
    );
  });

  it("AC-17, AC-20: 404 on the replace, then the create request fails (500) → the no-playlist-created error; the old record is unchanged", async () => {
    const t = await setup({
      record: h1Record(),
      cached: [fixtureHv2()],
      spotify: { answers: { 0: answer(404, { error: { status: 404, message: "Resource not found" } }), 1: answer(500, { error: { status: 500, message: "Server error" } }) } },
    });
    const err = await captureError(t.run(fixtureHv2(), H_V2, LATER_ISO));
    expect(findInChain(err, SpotifyPlaylistError)?.status).toBe(500);
    expect(errorText(err)).toMatch(/no playlist was created/i);
    expect(t.spotify.playlistCalls()).toEqual([`PUT ${items(PLAYLIST_ID)}`, `POST ${CREATE}`]);
    expect(await t.store.findRecord(H_SETLIST_ID)).toEqual(h1Record());
  });
});

// ---------------------------------------------------------------- AC-18

describe("createOrUpdateSetlistPlaylist — the first replace fails (H5)", () => {
  it.each([
    [500, { error: { status: 500, message: "Server error" } }],
    [401, { error: { status: 401, message: "The access token expired" } }],
    [403, { error: { status: 403, message: "Insufficient client scope" } }],
  ])("AC-18: PUT items answered %i → a Spotify playlist error with that status, saying not changed; 1 request; record unchanged", async (status, body) => {
    const t = await setup({ record: h1Record(), cached: [fixtureHv2()], spotify: { answers: { 0: answer(status, body) } } });
    const err = await captureError(t.run(fixtureHv2(), H_V2));
    expect(err).toBeInstanceOf(PlaysetError);
    expect(err).not.toBeInstanceOf(PartlyUpdatedPlaylistError);
    expect(findInChain(err, SpotifyPlaylistError)?.status).toBe(status);
    expect(errorText(err)).toMatch(/not changed/i);
    expect(t.spotify.http.requests).toHaveLength(1);
    expect(await t.store.findRecord(H_SETLIST_ID)).toEqual(h1Record());
  });

  it("AC-18: PUT items answered 429 four times → the rate-limit error, not changed; 4 requests; record unchanged", async () => {
    const t = await setup({
      record: h1Record(),
      cached: [fixtureHv2()],
      spotify: { answers: { 0: rateLimited, 1: rateLimited, 2: rateLimited, 3: rateLimited } },
    });
    const err = await captureError(t.run(fixtureHv2(), H_V2));
    expect(findInChain(err, SpotifyPlaylistError)?.status).toBe(429);
    expect(findInChain(err, PlaylistRateLimitError)).toBeInstanceOf(PlaylistRateLimitError);
    expect(errorText(err)).toMatch(/not changed/i);
    expect(t.spotify.playlistCalls()).toEqual(Array(4).fill(`PUT ${items(PLAYLIST_ID)}`));
    expect(t.spotify.clock.sleeps.filter((ms) => ms === 2000)).toHaveLength(3);
    expect(await t.store.findRecord(H_SETLIST_ID)).toEqual(h1Record());
  });

  it("AC-18: a network failure on PUT items → a Spotify playlist error saying not changed; 1 request; record unchanged", async () => {
    const t = await setup({ record: h1Record(), cached: [fixtureHv2()], spotify: { answers: { 0: networkFailure } } });
    const err = await captureError(t.run(fixtureHv2(), H_V2));
    expect(findInChain(err, SpotifyPlaylistError)).toBeInstanceOf(SpotifyPlaylistError);
    expect(errorText(err)).toMatch(/not changed/i);
    expect(t.spotify.http.requests).toHaveLength(1);
    expect(await t.store.findRecord(H_SETLIST_ID)).toEqual(h1Record());
  });
});

// ---------------------------------------------------------------- AC-19

describe("createOrUpdateSetlistPlaylist — partly updated (H5)", () => {
  it("AC-19: PUT items 200, rename 404 → the partly-updated error: 5 of 5 written, cause 404, the share link; 2 requests; record unchanged", async () => {
    const t = await setup({
      record: h1Record(),
      cached: [fixtureHv2()],
      spotify: { answers: { 1: answer(404, { error: { status: 404, message: "Resource not found" } }) } },
    });
    const err = await captureError(t.run(fixtureHv2(), H_V2));
    expect(err).toBeInstanceOf(PartlyUpdatedPlaylistError);
    expect(err).toBeInstanceOf(PlaysetError);
    const partly = err as PartlyUpdatedPlaylistError;
    expect([partly.playlistId, partly.shareUrl, partly.tracksWritten, partly.totalMatches]).toEqual([PLAYLIST_ID, SHARE_URL, 5, 5]);
    expect(findInChain(partly.cause, SpotifyPlaylistError)?.status).toBe(404);
    expect(partly.message).toMatch(/partly updated/i);
    expect(partly.message).toContain(SHARE_URL);
    expect(partly.message).toMatch(/\b5\b[^\n]*\b5\b/);
    expect(partly.hint).toBe("Try the update again: it replaces every track, so nothing is added twice.");
    expect(t.spotify.playlistCalls()).toEqual([`PUT ${items(PLAYLIST_ID)}`, `PUT ${details(PLAYLIST_ID)}`]);
    expect(await t.store.findRecord(H_SETLIST_ID)).toEqual(h1Record());
    expect(await findSetlistPlaylist(H_SETLIST_ID, H_V2, { records: t.store })).toEqual({
      kind: "outdated",
      playlistId: PLAYLIST_ID,
      shareUrl: SHARE_URL,
    });
  });

  it("AC-19: H4 update, PUT 200, first POST 502 → partly updated, 100 of 230 written, cause 502; no second POST, no rename", async () => {
    const record = h1Record({ setlistId: BIG_SETLIST_ID, playlistId: BIG_RECORDED_ID, shareUrl: `https://open.spotify.com/playlist/${BIG_RECORDED_ID}`, versionId: "g0f0f0f0f" });
    const t = await setup({
      record,
      cached: [bigSetlist()],
      spotify: { answers: { 1: answer(502, { error: { status: 502, message: "Bad gateway" } }) } },
    });
    const err = await captureError(t.run(bigSetlist(), BIG_VERSION));
    expect(err).toBeInstanceOf(PartlyUpdatedPlaylistError);
    const partly = err as PartlyUpdatedPlaylistError;
    expect([partly.playlistId, partly.tracksWritten, partly.totalMatches]).toEqual([BIG_RECORDED_ID, 100, 230]);
    expect(findInChain(partly.cause, SpotifyPlaylistError)?.status).toBe(502);
    expect(partly.message).toContain("100");
    expect(partly.message).toContain("230");
    expect(errorText(err)).toContain("Bad gateway");
    expect(t.spotify.playlistCalls()).toEqual([`PUT ${items(BIG_RECORDED_ID)}`, `POST ${items(BIG_RECORDED_ID)}`]);
    expect(await t.store.findRecord(BIG_SETLIST_ID)).toEqual(record);
  });

  it("AC-19: H4 update, the second POST fails → 200 of 230 written; no rename", async () => {
    const record = h1Record({ setlistId: BIG_SETLIST_ID, playlistId: BIG_RECORDED_ID, versionId: null });
    const t = await setup({
      record,
      cached: [bigSetlist()],
      spotify: { answers: { 2: answer(500, { error: { status: 500, message: "Server error" } }) } },
    });
    const err = await captureError(t.run(bigSetlist(), BIG_VERSION));
    expect((err as PartlyUpdatedPlaylistError).tracksWritten).toBe(200);
    expect(t.spotify.playlistRequests()).toHaveLength(3);
    expect(await t.store.findRecord(BIG_SETLIST_ID)).toEqual(record);
  });

  it("AC-19: the rename fails with 429 four times → partly updated with a rate-limit cause; nothing after", async () => {
    const t = await setup({
      record: h1Record(),
      cached: [fixtureHv2()],
      spotify: { answers: { 1: rateLimited, 2: rateLimited, 3: rateLimited, 4: rateLimited } },
    });
    const err = await captureError(t.run(fixtureHv2(), H_V2));
    expect(err).toBeInstanceOf(PartlyUpdatedPlaylistError);
    expect(findInChain((err as Error).cause, PlaylistRateLimitError)).toBeInstanceOf(PlaylistRateLimitError);
    expect(t.spotify.playlistCalls()).toEqual([`PUT ${items(PLAYLIST_ID)}`, ...Array(4).fill(`PUT ${details(PLAYLIST_ID)}`)]);
    expect(await t.store.findRecord(H_SETLIST_ID)).toEqual(h1Record());
  });

  it("AC-19: a network failure on the rename → partly updated, 5 of 5 written; record unchanged", async () => {
    const t = await setup({ record: h1Record(), cached: [fixtureHv2()], spotify: { answers: { 1: networkFailure } } });
    const err = await captureError(t.run(fixtureHv2(), H_V2));
    expect(err).toBeInstanceOf(PartlyUpdatedPlaylistError);
    expect((err as PartlyUpdatedPlaylistError).tracksWritten).toBe(5);
    expect(t.spotify.http.requests).toHaveLength(2);
    expect(await t.store.findRecord(H_SETLIST_ID)).toEqual(h1Record());
  });
});

// ---------------------------------------------------------------- AC-20

describe("createOrUpdateSetlistPlaylist — a create fails (H5)", () => {
  it("AC-20: no record, the create answered 403 → the existing no-playlist-created error; 1 request; still no record", async () => {
    const t = await setup({
      cached: [fixtureHv1()],
      spotify: { answers: { 0: answer(403, { error: { status: 403, message: "Insufficient client scope" } }) } },
    });
    const err = await captureError(t.run(fixtureHv1(), H_V1));
    expect(findInChain(err, SpotifyPlaylistError)?.status).toBe(403);
    expect(err).not.toBeInstanceOf(PartlyCreatedPlaylistError);
    expect(errorText(err)).toMatch(/no playlist was created/i);
    expect(t.spotify.http.requests).toHaveLength(1);
    expect(await t.store.findRecord(H_SETLIST_ID)).toBeUndefined();
  });

  it("AC-20: no record, 230 Matches, batch 2 answered 400 → partly created (100 of 230); a record with no version is saved", async () => {
    const t = await setup({
      cached: [bigSetlist()],
      spotify: {
        createdIds: [PARTLY_ID],
        answers: { 2: answer(400, { error: { status: 400, message: "Invalid base62 id" } }) },
      },
    });
    const err = await captureError(t.run(bigSetlist(), BIG_VERSION));
    expect(err).toBeInstanceOf(PartlyCreatedPlaylistError);
    const partly = err as PartlyCreatedPlaylistError;
    expect([partly.playlistId, partly.shareUrl, partly.tracksAdded, partly.totalMatches]).toEqual([PARTLY_ID, PARTLY_SHARE_URL, 100, 230]);
    expect(t.spotify.playlistCalls()).toEqual([`POST ${CREATE}`, `POST ${items(PARTLY_ID)}`, `POST ${items(PARTLY_ID)}`]);
    expect(await t.store.findRecord(BIG_SETLIST_ID)).toEqual({
      setlistId: "9ac1e5d3",
      playlistId: "8HiJkLmNoPqRsTuVwXyZaB",
      shareUrl: "https://open.spotify.com/playlist/8HiJkLmNoPqRsTuVwXyZaB",
      versionId: null,
      createdAt: "2026-11-27T18:04:05.000Z",
    });
    expect(await findSetlistPlaylist(BIG_SETLIST_ID, BIG_VERSION, { records: t.store })).toEqual({
      kind: "outdated",
      playlistId: PARTLY_ID,
      shareUrl: PARTLY_SHARE_URL,
    });
  });

  it("AC-20: then a create-or-update for 9ac1e5d3 updates that playlist (PUT, POST, POST, rename); updated, 230 tracks", async () => {
    const store = createMemorySetlistPlaylistRecords();
    await cachePreview(store, bigSetlist(), bigOutcomes());
    const first = makeHostSpotify({ createdIds: [PARTLY_ID], answers: { 2: answer(400, { error: { status: 400, message: "Invalid base62 id" } }) } });
    await captureError(
      createOrUpdateSetlistPlaylist(first.services, bigSetlist(), BIG_VERSION, { accessToken: HOST_TOKEN, records: store, now: clockAt(NOW_ISO) }),
    );
    const second = makeHostSpotify();
    const result = await createOrUpdateSetlistPlaylist(second.services, bigSetlist(), BIG_VERSION, {
      accessToken: HOST_TOKEN,
      records: store,
      now: clockAt(LATER_ISO),
    });
    expect(second.playlistCalls()).toEqual([
      `PUT ${items(PARTLY_ID)}`,
      `POST ${items(PARTLY_ID)}`,
      `POST ${items(PARTLY_ID)}`,
      `PUT ${details(PARTLY_ID)}`,
    ]);
    expect(result).toEqual({
      status: "updated",
      playlist: { id: PARTLY_ID, shareUrl: PARTLY_SHARE_URL, name: BIG_NAME, trackCount: 230 },
    });
    expect(await store.findRecord(BIG_SETLIST_ID)).toEqual({
      setlistId: BIG_SETLIST_ID,
      playlistId: PARTLY_ID,
      shareUrl: PARTLY_SHARE_URL,
      versionId: BIG_VERSION,
      createdAt: NOW_ISO,
    });
  });
});

// ---------------------------------------------------------------- AC-21

describe("createOrUpdateSetlistPlaylist — request rules (H5)", () => {
  it("AC-21: PUT items 429 with Retry-After 2, then 200; rename 200 → succeeds after sleeping 2 s; 3 requests; record v2", async () => {
    const t = await setup({ record: h1Record(), cached: [fixtureHv2()], spotify: { answers: { 0: rateLimited } } });
    const result = await t.run(fixtureHv2(), H_V2);
    expect(result.status).toBe("updated");
    expect(t.spotify.playlistCalls()).toEqual([`PUT ${items(PLAYLIST_ID)}`, `PUT ${items(PLAYLIST_ID)}`, `PUT ${details(PLAYLIST_ID)}`]);
    expect(t.spotify.clock.sleeps).toContain(2000);
    const [first, retry] = t.spotify.http.requests;
    expect(retry!.at - first!.at).toBeGreaterThanOrEqual(2000);
    expect(await t.store.findRecord(H_SETLIST_ID)).toEqual(h1Record({ versionId: H_V2 }));
  });

  it("AC-21: a 500 on the rename is not retried", async () => {
    const t = await setup({
      record: h1Record(),
      cached: [fixtureHv2()],
      spotify: { answers: { 1: answer(500, { error: { status: 500, message: "Server error" } }) } },
    });
    await captureError(t.run(fixtureHv2(), H_V2));
    expect(t.spotify.http.requests).toHaveLength(2);
    expect(t.spotify.clock.sleeps.filter((ms) => ms >= 1000)).toEqual([]);
  });

  type Scenario = [string, Setup, (s: SetlistFmSetlist) => SetlistFmSetlist, string];
  const failing: Scenario[] = [
    ["replace 401", { record: h1Record(), cached: [fixtureHv2()], spotify: { answers: { 0: answer(401, { error: { status: 401, message: "The access token expired" } }) } } }, () => fixtureHv2(), H_V2],
    ["replace 429 ×4", { record: h1Record(), cached: [fixtureHv2()], spotify: { answers: { 0: rateLimited, 1: rateLimited, 2: rateLimited, 3: rateLimited } } }, () => fixtureHv2(), H_V2],
    ["replace network failure", { record: h1Record(), cached: [fixtureHv2()], spotify: { answers: { 0: networkFailure } } }, () => fixtureHv2(), H_V2],
    ["rename 404", { record: h1Record(), cached: [fixtureHv2()], spotify: { answers: { 1: answer(404, { error: { status: 404, message: "Resource not found" } }) } } }, () => fixtureHv2(), H_V2],
    ["create 403", { cached: [fixtureHv1()], spotify: { answers: { 0: answer(403, { error: { status: 403, message: "Insufficient client scope" } }) } } }, () => fixtureHv1(), H_V1],
    ["add batch 2 400", { cached: [bigSetlist()], spotify: { answers: { 2: answer(400, { error: { status: 400, message: "Invalid base62 id" } }) } } }, () => bigSetlist(), BIG_VERSION],
  ];

  it.each(failing)("AC-21: %s → no error text, hint or cause holds the access token; every request goes to the allowed Spotify API", async (_label, opts, setlist, version) => {
    const t = await setup(opts);
    const err = await captureError(t.run(setlist(fixtureHv1()), version));
    expect(errorText(err)).not.toContain(HOST_TOKEN);
    expect(JSON.stringify(err, Object.getOwnPropertyNames(err))).not.toContain(HOST_TOKEN);
    expectAllowedRequests(t.spotify.http.requests);
  });

  it("AC-21: create, update, recreate after 404 and a searched create send only allowed requests; no GET /v1/playlists/<id>", async () => {
    const runs: Array<Awaited<ReturnType<typeof setup>>> = [];
    const created = await setup();
    await created.run(fixtureHv1(), H_V1);
    runs.push(created);
    const updated = await setup({ record: h1Record(), cached: [bigSetlist()] });
    await updated.run(bigSetlist(), BIG_VERSION);
    runs.push(updated);
    const recreated = await setup({ record: h1Record(), cached: [fixtureHv2()], spotify: { deleted: [PLAYLIST_ID], createdIds: [NEW_PLAYLIST_ID] } });
    await recreated.run(fixtureHv2(), H_V2);
    runs.push(recreated);
    for (const run of runs) {
      expectAllowedRequests(run.spotify.http.requests);
      for (const r of run.spotify.http.requests) expect(r.headers.get("Authorization")).toBe(`Bearer ${HOST_TOKEN}`);
    }
  });
});
