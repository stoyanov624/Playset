// The preview step with the cache in the injected records (AC-8 to AC-10, example P1).
// The Match search is a hand-made fake (or the run's fake services); no network.
import { describe, expect, it } from "vitest";
import { RunCancelledError, type Match, type MatchOutcome, type Performance } from "../../src/core/index.js";
import {
  createMemorySetlistPlaylistRecords,
  prepareSetlist,
  previewMatches,
  type RunServices,
  type SetlistPlaylistRecords,
} from "../../src/core/run/index.js";
import { captureError, deferred, flush, within, type Deferred } from "./fixtures/call-recorder";
import { fixtureR, makeFakeServices } from "./fixtures/fake-services";
import { fixtureA } from "./fixtures/setlists";
import { spotifySearchRateLimitError } from "./fixtures/typed-errors";
import {
  H_SETLIST_ID,
  H_V1,
  H_V1_NAME,
  H_V1_URIS,
  H_V2,
  H_V2_NAME,
  H_V2_URIS,
  HOST_TOKEN,
  cachePreview,
  fakeMatchSearch,
  fixtureHv1,
  fixtureHv2,
  hostOutcomes,
  spyRecords,
  variant,
} from "./fixtures/host-setlists";

interface Progress {
  n: number;
  total: number;
  performance: Performance;
}
const progressLog = () => {
  const reports: string[] = [];
  return { reports, onProgress: (p: Progress) => void reports.push(`${p.n}/${p.total} ${p.performance.title}`) };
};

const leaveOutTapes = { keepTape: async () => false };
const keepEveryTape = { keepTape: async () => true };

// ---------------------------------------------------------------- AC-9 (and AC-8 on the second call)

describe("previewMatches with records — no cached preview yet (P1)", () => {
  it("AC-9: records empty → 3 searches, (1 of 3)…(3 of 3), the result saved under 2bf1c8e4 + g4bd1a2f6", async () => {
    const records = createMemorySetlistPlaylistRecords();
    const search = fakeMatchSearch(hostOutcomes);
    const log = progressLog();
    const prepared = await prepareSetlist(fixtureHv1(), leaveOutTapes);
    const preview = await previewMatches(search.services, prepared, HOST_TOKEN, { onProgress: log.onProgress, records });
    expect(search.searched).toEqual([
      { title: "Release", accessToken: HOST_TOKEN },
      { title: "Even Flow", accessToken: HOST_TOKEN },
      { title: "Alive", accessToken: HOST_TOKEN },
    ]);
    expect(log.reports).toEqual(["1/3 Release", "2/3 Even Flow", "3/3 Alive"]);
    expect(preview.rows).toHaveLength(3);
    expect(preview.matches.map((m: Match) => m.uri)).toEqual(H_V1_URIS);
    expect(preview.misses).toEqual([]);
    expect(preview.playlistName).toBe(H_V1_NAME);
    expect(await records.findPreview(H_SETLIST_ID, H_V1)).toEqual(preview);
  });

  it("AC-9: the result equals what the step returns without records", async () => {
    const prepared = await prepareSetlist(fixtureHv1(), leaveOutTapes);
    const withRecords = await previewMatches(fakeMatchSearch(hostOutcomes).services, prepared, HOST_TOKEN, {
      records: createMemorySetlistPlaylistRecords(),
    });
    const without = await previewMatches(fakeMatchSearch(hostOutcomes).services, prepared, HOST_TOKEN, {});
    expect(withRecords).toEqual(without);
  });

  it("AC-8: the same call again with the same records → 0 searches, no progress, equal to the first result, cache unchanged", async () => {
    const records = createMemorySetlistPlaylistRecords();
    const prepared = await prepareSetlist(fixtureHv1(), leaveOutTapes);
    const first = await previewMatches(fakeMatchSearch(hostOutcomes).services, prepared, HOST_TOKEN, { records });
    const again = fakeMatchSearch(hostOutcomes);
    const log = progressLog();
    const spy = spyRecords(records);
    const second = await previewMatches(again.services, prepared, HOST_TOKEN, { onProgress: log.onProgress, records: spy.records });
    expect(again.searched).toEqual([]);
    expect(log.reports).toEqual([]);
    expect(second).toEqual(first);
    expect(spy.calls).toEqual([`findPreview:${H_SETLIST_ID}:${H_V1}`]);
    expect(await records.findPreview(H_SETLIST_ID, H_V1)).toEqual(first);
  });

  it("AC-9: the cache holds a v1 preview and the prepared Setlist is H v2 → 5 searches, (1 of 5)…(5 of 5); both previews stored", async () => {
    const records = createMemorySetlistPlaylistRecords();
    const previewV1 = await cachePreview(records, fixtureHv1(), hostOutcomes);
    const search = fakeMatchSearch(hostOutcomes);
    const log = progressLog();
    const preview = await previewMatches(search.services, await prepareSetlist(fixtureHv2(), leaveOutTapes), HOST_TOKEN, {
      onProgress: log.onProgress,
      records,
    });
    expect(search.searched.map((s) => s.title)).toEqual(["Release", "Even Flow", "Corduroy", "Alive", "Yellow Ledbetter"]);
    expect(log.reports).toEqual([
      "1/5 Release",
      "2/5 Even Flow",
      "3/5 Corduroy",
      "4/5 Alive",
      "5/5 Yellow Ledbetter",
    ]);
    expect(preview.matches.map((m: Match) => m.uri)).toEqual(H_V2_URIS);
    expect(preview.playlistName).toBe(H_V2_NAME);
    expect(await records.findPreview(H_SETLIST_ID, H_V1)).toEqual(previewV1);
    expect(await records.findPreview(H_SETLIST_ID, H_V2)).toEqual(preview);
  });

  it("AC-9: a preview where every search is a Miss is saved too", async () => {
    const records = createMemorySetlistPlaylistRecords();
    const preview = await previewMatches(
      fakeMatchSearch({}).services,
      await prepareSetlist(fixtureHv1(), leaveOutTapes),
      HOST_TOKEN,
      { records },
    );
    expect(preview.matches).toEqual([]);
    expect(preview.misses.map((m: { title: string }) => m.title)).toEqual(["Release", "Even Flow", "Alive"]);
    expect(await records.findPreview(H_SETLIST_ID, H_V1)).toEqual(preview);
  });
});

// ---------------------------------------------------------------- AC-8

describe("previewMatches with records — a cached preview (P1)", () => {
  it("AC-8: a cached preview for the setlist id and version is returned unchanged, with no search and no progress", async () => {
    const records = createMemorySetlistPlaylistRecords();
    // A cached preview that a fresh search could not produce: every Performance a Miss.
    const cached = await cachePreview(records, fixtureHv1(), {});
    const search = fakeMatchSearch(hostOutcomes);
    const log = progressLog();
    const preview = await previewMatches(search.services, await prepareSetlist(fixtureHv1(), leaveOutTapes), HOST_TOKEN, {
      onProgress: log.onProgress,
      records,
    });
    expect(preview).toEqual(cached);
    expect(preview.matches).toEqual([]);
    expect(search.searched).toEqual([]);
    expect(log.reports).toEqual([]);
  });

  it("AC-8: a cache hit with a signal already aborted still ends with the run-cancelled error; the cache is unchanged", async () => {
    const records = createMemorySetlistPlaylistRecords();
    const cached = await cachePreview(records, fixtureHv1(), hostOutcomes);
    const controller = new AbortController();
    controller.abort();
    const search = fakeMatchSearch(hostOutcomes);
    const log = progressLog();
    const err = await captureError(
      previewMatches(search.services, await prepareSetlist(fixtureHv1(), leaveOutTapes), HOST_TOKEN, {
        onProgress: log.onProgress,
        signal: controller.signal,
        records,
      }),
    );
    expect(err).toBeInstanceOf(RunCancelledError);
    expect(search.searched).toEqual([]);
    expect(log.reports).toEqual([]);
    expect(await records.findPreview(H_SETLIST_ID, H_V1)).toEqual(cached);
  });

  it("AC-8: a cache hit where the signal aborts while the cached preview is being looked up → the run-cancelled error, not the preview", async () => {
    const store = createMemorySetlistPlaylistRecords();
    const cached = await cachePreview(store, fixtureHv1(), hostOutcomes);
    const controller = new AbortController();
    const lookups: string[] = [];
    // The Visitor cancels while the store is still answering.
    const records: SetlistPlaylistRecords = {
      findRecord: (setlistId) => store.findRecord(setlistId),
      saveRecord: (record) => store.saveRecord(record),
      findPreview: async (setlistId, versionId) => {
        lookups.push(`${setlistId}:${versionId}`);
        const preview = await store.findPreview(setlistId, versionId);
        controller.abort();
        return preview;
      },
      savePreview: (setlistId, versionId, preview) => store.savePreview(setlistId, versionId, preview),
    };
    const search = fakeMatchSearch(hostOutcomes);
    const log = progressLog();
    const err = await captureError(
      previewMatches(search.services, await prepareSetlist(fixtureHv1(), leaveOutTapes), HOST_TOKEN, {
        onProgress: log.onProgress,
        signal: controller.signal,
        records,
      }),
    );
    expect(err).toBeInstanceOf(RunCancelledError);
    expect(lookups).toEqual([`${H_SETLIST_ID}:${H_V1}`]);
    expect(search.searched).toEqual([]);
    expect(log.reports).toEqual([]);
    expect(await store.findPreview(H_SETLIST_ID, H_V1)).toEqual(cached);
  });

  it("AC-10: a cache miss where the signal aborts while the store is being looked up → the run-cancelled error; no search, nothing saved", async () => {
    const store = createMemorySetlistPlaylistRecords();
    const spy = spyRecords(store);
    const controller = new AbortController();
    const records: SetlistPlaylistRecords = {
      ...spy.records,
      findPreview: async (setlistId, versionId) => {
        const preview = await spy.records.findPreview(setlistId, versionId);
        controller.abort();
        return preview;
      },
    };
    const search = fakeMatchSearch(hostOutcomes);
    const err = await captureError(
      previewMatches(search.services, await prepareSetlist(fixtureHv1(), leaveOutTapes), HOST_TOKEN, {
        signal: controller.signal,
        records,
      }),
    );
    expect(err).toBeInstanceOf(RunCancelledError);
    expect(search.searched).toEqual([]);
    expect(spy.calls).toEqual([`findPreview:${H_SETLIST_ID}:${H_V1}`]);
    expect(await store.findPreview(H_SETLIST_ID, H_V1)).toBeUndefined();
  });
});

// ---------------------------------------------------------------- AC-10

/** Match search whose answers the test releases by hand. */
function controlledSearch() {
  const pending: Array<{ title: string; answer: Deferred<MatchOutcome> }> = [];
  const services: Pick<RunServices, "findMatch"> = {
    findMatch(performance: Performance): Promise<MatchOutcome> {
      const answer = deferred<MatchOutcome>();
      pending.push({ title: performance.title, answer });
      return answer.promise;
    },
  };
  return { services, pending };
}

describe("previewMatches with records — nothing cached (P1)", () => {
  it("AC-10: an abort while search 2 is in flight → the run-cancelled error after 2 searches; nothing saved", async () => {
    const records = createMemorySetlistPlaylistRecords();
    const search = controlledSearch();
    const controller = new AbortController();
    const log = progressLog();
    const outcome = captureError(
      previewMatches(search.services, await prepareSetlist(fixtureHv1(), leaveOutTapes), HOST_TOKEN, {
        onProgress: log.onProgress,
        signal: controller.signal,
        records,
      }),
    );
    await flush();
    search.pending[0]!.answer.resolve(hostOutcomes.Release!);
    await flush();
    expect(search.pending.map((p) => p.title)).toEqual(["Release", "Even Flow"]);
    controller.abort();
    expect(await within(outcome, 1000)).toBeInstanceOf(RunCancelledError);
    search.pending[1]!.answer.resolve(hostOutcomes["Even Flow"]!);
    await flush();
    expect(log.reports).toEqual(["1/3 Release", "2/3 Even Flow"]);
    expect(await records.findPreview(H_SETLIST_ID, H_V1)).toBeUndefined();
  });

  it("AC-10: search 2 fails with the Spotify search rate-limit error → that error; nothing saved", async () => {
    const rateLimit = await spotifySearchRateLimitError();
    const records = createMemorySetlistPlaylistRecords();
    const fake = makeFakeServices({ setlist: fixtureHv1(), outcomes: hostOutcomes, failMatchOn: { "Even Flow": rateLimit } });
    const log = progressLog();
    const err = await captureError(
      previewMatches(fake.services, await prepareSetlist(fixtureHv1(), leaveOutTapes), HOST_TOKEN, {
        onProgress: log.onProgress,
        records,
      }),
    );
    expect(err).toBe(rateLimit);
    expect(fake.calls.findMatch.map((c) => c.performance.title)).toEqual(["Release", "Even Flow"]);
    expect(log.reports).toEqual(["1/3 Release", "2/3 Even Flow"]);
    expect(await records.findPreview(H_SETLIST_ID, H_V1)).toBeUndefined();
  });

  it("AC-10: a prepared Setlist without a version (Fixture A) → searches as today; nothing read or saved", async () => {
    const store = createMemorySetlistPlaylistRecords();
    const spy = spyRecords(store);
    const prepared = await prepareSetlist(fixtureA(), leaveOutTapes);
    const withRecords = makeFakeServices({ outcomes: fixtureR });
    const without = makeFakeServices({ outcomes: fixtureR });
    const preview = await previewMatches(withRecords.services, prepared, HOST_TOKEN, { records: spy.records });
    const expected = await previewMatches(without.services, prepared, HOST_TOKEN, {});
    expect(preview).toEqual(expected);
    expect(withRecords.calls.findMatch.map((c) => c.performance)).toEqual(prepared.keptPerformances);
    expect(spy.calls).toEqual([]);
  });

  it("AC-10: a prepared Setlist without a setlist id → searches as today; nothing read or saved", async () => {
    const spy = spyRecords(createMemorySetlistPlaylistRecords());
    const search = fakeMatchSearch(hostOutcomes);
    const prepared = await prepareSetlist(variant(fixtureHv1(), { id: undefined }), leaveOutTapes);
    const preview = await previewMatches(search.services, prepared, HOST_TOKEN, { records: spy.records });
    expect(search.searched.map((s) => s.title)).toEqual(["Release", "Even Flow", "Alive"]);
    expect(preview.matches.map((m: Match) => m.uri)).toEqual(H_V1_URIS);
    expect(spy.calls).toEqual([]);
  });

  it("AC-3: a Setlist with an empty id gives no setlistId, and the preview is neither read from nor written to the cache", async () => {
    const spy = spyRecords(createMemorySetlistPlaylistRecords());
    const search = fakeMatchSearch(hostOutcomes);
    const prepared = await prepareSetlist(variant(fixtureHv1(), { id: "" }), leaveOutTapes);
    expect("setlistId" in prepared).toBe(false);
    expect(prepared.versionId).toBe(H_V1);
    const preview = await previewMatches(search.services, prepared, HOST_TOKEN, { records: spy.records });
    const expected = await previewMatches(fakeMatchSearch(hostOutcomes).services, prepared, HOST_TOKEN, {});
    expect(search.searched.map((s) => s.title)).toEqual(["Release", "Even Flow", "Alive"]);
    expect(preview.matches.map((m: Match) => m.uri)).toEqual(H_V1_URIS);
    expect(preview.playlistName).toBe(H_V1_NAME);
    expect(preview).toEqual(expected);
    expect(spy.calls).toEqual([]);
  });

  it("AC-10: H v2 with the Tape kept (Master/Slave) → 6 searches; a cached v2 preview is neither read nor replaced", async () => {
    const store = createMemorySetlistPlaylistRecords();
    const cachedV2 = await cachePreview(store, fixtureHv2(), hostOutcomes);
    const spy = spyRecords(store);
    const search = fakeMatchSearch(hostOutcomes);
    const log = progressLog();
    const prepared = await prepareSetlist(fixtureHv2(), keepEveryTape);
    const preview = await previewMatches(search.services, prepared, HOST_TOKEN, { onProgress: log.onProgress, records: spy.records });
    expect(search.searched.map((s) => s.title)).toEqual([
      "Master/Slave",
      "Release",
      "Even Flow",
      "Corduroy",
      "Alive",
      "Yellow Ledbetter",
    ]);
    expect(log.reports[0]).toBe("1/6 Master/Slave");
    expect(preview.rows).toHaveLength(6);
    expect(spy.calls).toEqual([]);
    expect(await store.findPreview(H_SETLIST_ID, H_V2)).toEqual(cachedV2);
  });

  it("AC-10: no records at all → as before: one search per kept Performance, progress, nothing else", async () => {
    const search = fakeMatchSearch(hostOutcomes);
    const log = progressLog();
    const preview = await previewMatches(search.services, await prepareSetlist(fixtureHv1(), leaveOutTapes), HOST_TOKEN, {
      onProgress: log.onProgress,
    });
    expect(search.searched.map((s) => s.title)).toEqual(["Release", "Even Flow", "Alive"]);
    expect(log.reports).toEqual(["1/3 Release", "2/3 Even Flow", "3/3 Alive"]);
    expect(preview.playlistName).toBe(H_V1_NAME);
  });
});
