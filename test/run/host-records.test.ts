// The in-memory records store and the find step (PRD 0014 AC-4 to AC-7). The find step never asks
// Spotify or setlist.fm: it is given only the records, so the routed fake fetch below must stay empty.
import { describe, expect, it } from "vitest";
import {
  createMemorySetlistPlaylistRecords,
  findSetlistPlaylist,
  type SetlistPlaylistRecord,
} from "../../src/core/run/index.js";
import {
  H_SETLIST_ID,
  H_V1,
  H_V2,
  PLAYLIST_ID,
  SHARE_URL,
  fixtureHv1,
  fixtureHv2,
  h1Record,
  hostOutcomes,
  makeHostSpotify,
  spyRecords,
  cachePreview,
} from "./fixtures/host-setlists";

const r1Record: SetlistPlaylistRecord = {
  setlistId: "2bf1c8e4",
  playlistId: "5PqRsTuVwXyZaBcDeFgHiJ",
  shareUrl: "https://open.spotify.com/playlist/5PqRsTuVwXyZaBcDeFgHiJ",
  versionId: "g4bd1a2f6",
  createdAt: "2026-11-27T18:04:05.000Z",
};

// ---------------------------------------------------------------- AC-4

describe("in-memory records — records (R1)", () => {
  it("AC-4: an empty store has no record for 2bf1c8e4", async () => {
    const records = createMemorySetlistPlaylistRecords();
    expect(await records.findRecord("2bf1c8e4")).toBeUndefined();
  });

  it("AC-4: a saved record comes back with every field as saved; another setlist id gives none", async () => {
    const records = createMemorySetlistPlaylistRecords();
    await records.saveRecord(r1Record);
    expect(await records.findRecord("2bf1c8e4")).toEqual(r1Record);
    expect(await records.findRecord("3bf1a7c2")).toBeUndefined();
  });

  it("AC-4: a second record for the same setlist id replaces the first", async () => {
    const records = createMemorySetlistPlaylistRecords();
    await records.saveRecord(r1Record);
    await records.saveRecord({ ...r1Record, versionId: "g2b5e7c19" });
    expect(await records.findRecord("2bf1c8e4")).toEqual({ ...r1Record, versionId: "g2b5e7c19" });
  });

  it("AC-4: a record with no version (versionId null) keeps the null", async () => {
    const records = createMemorySetlistPlaylistRecords();
    await records.saveRecord({ ...r1Record, versionId: null });
    expect(await records.findRecord("2bf1c8e4")).toEqual({ ...r1Record, versionId: null });
  });

  it("AC-4: every method answers with a Promise", () => {
    const records = createMemorySetlistPlaylistRecords();
    expect(records.findRecord("2bf1c8e4")).toBeInstanceOf(Promise);
    expect(records.saveRecord(r1Record)).toBeInstanceOf(Promise);
    expect(records.findPreview("2bf1c8e4", "g4bd1a2f6")).toBeInstanceOf(Promise);
  });
});

// ---------------------------------------------------------------- AC-5

describe("in-memory records — cached previews (R1)", () => {
  it("AC-5: a cached preview comes back unchanged for the same setlist id and version only", async () => {
    const records = createMemorySetlistPlaylistRecords();
    const previewV1 = await cachePreview(records, fixtureHv1(), hostOutcomes);
    expect(await records.findPreview("2bf1c8e4", "g4bd1a2f6")).toEqual(previewV1);
    expect(await records.findPreview("2bf1c8e4", "g2b5e7c19")).toBeUndefined();
    expect(await records.findPreview("3bf1a7c2", "g4bd1a2f6")).toBeUndefined();
  });

  it("AC-5: saving under another version keeps both", async () => {
    const records = createMemorySetlistPlaylistRecords();
    const previewV1 = await cachePreview(records, fixtureHv1(), hostOutcomes);
    const previewV2 = await cachePreview(records, fixtureHv2(), hostOutcomes);
    expect(await records.findPreview("2bf1c8e4", "g4bd1a2f6")).toEqual(previewV1);
    expect(await records.findPreview("2bf1c8e4", "g2b5e7c19")).toEqual(previewV2);
    expect(previewV1.matches).toHaveLength(3);
    expect(previewV2.matches).toHaveLength(5);
  });

  it("AC-5: saving again under the same setlist id and version replaces it", async () => {
    const records = createMemorySetlistPlaylistRecords();
    await cachePreview(records, fixtureHv1(), hostOutcomes);
    const allMisses = await cachePreview(records, fixtureHv1(), {});
    expect(allMisses.matches).toEqual([]);
    expect(await records.findPreview("2bf1c8e4", "g4bd1a2f6")).toEqual(allMisses);
  });

  it("AC-5: a record and a cached preview under the same setlist id don't touch each other", async () => {
    const records = createMemorySetlistPlaylistRecords();
    await records.saveRecord(r1Record);
    const previewV1 = await cachePreview(records, fixtureHv1(), hostOutcomes);
    expect(await records.findRecord("2bf1c8e4")).toEqual(r1Record);
    expect(await records.findPreview("2bf1c8e4", "g4bd1a2f6")).toEqual(previewV1);
  });
});

// ---------------------------------------------------------------- AC-6, AC-7

describe("findSetlistPlaylist (F1)", () => {
  async function find(record: SetlistPlaylistRecord | undefined, versionId: string, deleted: string[] = []) {
    const spotify = makeHostSpotify({ deleted });
    const store = createMemorySetlistPlaylistRecords();
    if (record) await store.saveRecord(record);
    const spy = spyRecords(store);
    const result = await findSetlistPlaylist(H_SETLIST_ID, versionId, { records: spy.records });
    return { result, spy, spotify, store };
  }

  it("AC-6: no record → none; no request, nothing saved", async () => {
    const { result, spy, spotify } = await find(undefined, H_V1);
    expect(result).toEqual({ kind: "none" });
    expect(spotify.http.requests).toEqual([]);
    expect(spy.calls.filter((c) => c.startsWith("save"))).toEqual([]);
  });

  it("AC-6: a record with the same version → current, with the recorded playlist id and share link", async () => {
    const { result, spy, spotify } = await find(h1Record(), H_V1);
    expect(result).toEqual({ kind: "current", playlistId: PLAYLIST_ID, shareUrl: SHARE_URL });
    expect(spotify.http.requests).toEqual([]);
    expect(spy.calls.filter((c) => c.startsWith("save"))).toEqual([]);
  });

  it("AC-6: a record with another version → outdated, with the recorded playlist id and share link", async () => {
    const { result, spy, spotify, store } = await find(h1Record(), H_V2);
    expect(result).toEqual({ kind: "outdated", playlistId: PLAYLIST_ID, shareUrl: SHARE_URL });
    expect(spotify.http.requests).toEqual([]);
    expect(spy.calls.filter((c) => c.startsWith("save"))).toEqual([]);
    expect(await store.findRecord(H_SETLIST_ID)).toEqual(h1Record());
  });

  it("AC-6: a record with no version (null) → outdated, same id and link", async () => {
    const { result, spotify } = await find(h1Record({ versionId: null }), H_V1);
    expect(result).toEqual({ kind: "outdated", playlistId: PLAYLIST_ID, shareUrl: SHARE_URL });
    expect(spotify.http.requests).toEqual([]);
  });

  it("AC-6: a record of another Setlist doesn't count → none", async () => {
    const { result } = await find(h1Record({ setlistId: "3bf1a7c2" }), H_V1);
    expect(result).toEqual({ kind: "none" });
  });

  it("AC-7: a current record whose playlist the Host Account deleted is still current with the recorded share link; no request", async () => {
    const { result, spotify } = await find(h1Record(), H_V1, [PLAYLIST_ID]);
    expect(result).toEqual({ kind: "current", playlistId: PLAYLIST_ID, shareUrl: SHARE_URL });
    expect(spotify.http.requests).toEqual([]);
  });
});
