// The preview step (AC-15 to AC-17) and the create step (AC-18). Spotify is a fake: either the run's
// fake services, a hand-made services object with only the needed service, or the real services the
// core builds over a routed fake fetch. No network.
import { getEventListeners } from "node:events";
import { describe, expect, it } from "vitest";
import {
  NothingToAddError,
  RunCancelledError,
  createMemorySettingsStore,
  createRunServices,
  type Match,
  type MatchOutcome,
  type Performance,
} from "../../src/core/index.js";
import {
  createSetlistPlaylist,
  prepareSetlist,
  previewMatches,
  type RunServices,
} from "../../src/core/run/index.js";
import {
  PartlyCreatedPlaylistError,
  PlaylistRateLimitError,
  SpotifyPlaylistError,
} from "../../src/core/setlist-playlist";
import { captureError, deferred, flush, within, type Deferred } from "./fixtures/call-recorder";
import { makeFakeServices, match, type MatchSpec } from "./fixtures/fake-services";
import {
  NIRVANA_KEPT_TITLES,
  NIRVANA_PLAYLIST_NAME,
  NIRVANA_URIS,
  PORTLAND_PLAYLIST_NAME,
  PORTLAND_URIS,
  PORTLAND_URL,
  nirvanaOutcomes,
  nirvanaTacoma,
  pearlJamOutcomes,
  pearlJamPortland,
  portlandOnlyUnknownSongs,
  portlandShow,
  withSongs,
} from "./fixtures/incomplete-setlists";
import { json, makeFakeClock, makeRoutedFetch, type Route } from "./fixtures/real-service-fakes";
import type { SetlistFmSetlist } from "../../src/core/performances";

const ACCESS_TOKEN = "BQD3kx-test-token";

const keepEveryTape = async () => true;
const portlandMatches = (): Match[] => ["Release", "Even Flow", "Alive"].map((t) => pearlJamOutcomes[t] as Match);
const prepare = (setlist: SetlistFmSetlist) => prepareSetlist(setlist, { keepTape: keepEveryTape });

interface Progress {
  n: number;
  total: number;
  performance: Performance;
}

function progressLog() {
  const reports: Progress[] = [];
  return { reports, onProgress: (p: Progress) => void reports.push({ ...p }) };
}

const progressText = (reports: Progress[]) => reports.map((p) => `${p.n}/${p.total} ${p.performance.title}`);

// ---------------------------------------------------------------- AC-15

describe("previewMatches — M1 (Pearl Jam, Portland)", () => {
  it("AC-15: one Match search per kept Performance, in played order, with the given token", async () => {
    const fake = makeFakeServices({ setlist: pearlJamPortland(), outcomes: pearlJamOutcomes });
    const prepared = await prepare(pearlJamPortland());
    const log = progressLog();
    await previewMatches(fake.services, prepared, ACCESS_TOKEN, { onProgress: log.onProgress });
    expect(fake.calls.findMatch.map((c) => [c.performance.title, c.accessToken])).toEqual([
      ["Release", ACCESS_TOKEN],
      ["Even Flow", ACCESS_TOKEN],
      ["Alive", ACCESS_TOKEN],
    ]);
    expect(fake.calls.findMatch.map((c) => c.performance)).toEqual(prepared.keptPerformances);
    expect(log.reports.map((r) => r.performance)).toEqual(prepared.keptPerformances);
  });

  it("AC-15: progress is reported before each search: (1 of 3, Release), (2 of 3, Even Flow), (3 of 3, Alive)", async () => {
    const events: string[] = [];
    const fake = makeFakeServices({ setlist: pearlJamPortland(), outcomes: pearlJamOutcomes }, events);
    const prepared = await prepare(pearlJamPortland());
    const log = progressLog();
    await previewMatches(fake.services, prepared, ACCESS_TOKEN, {
      onProgress: (p: Progress) => {
        events.push(`progress:${p.n}`);
        log.onProgress(p);
      },
    });
    expect(progressText(log.reports)).toEqual(["1/3 Release", "2/3 Even Flow", "3/3 Alive"]);
    expect(events).toEqual([
      "progress:1",
      "spotify:findMatch:Release",
      "progress:2",
      "spotify:findMatch:Even Flow",
      "progress:3",
      "spotify:findMatch:Alive",
    ]);
  });

  it("AC-15: the result has numbered rows with their Match, the Matches, no Misses and the playlist name", async () => {
    const fake = makeFakeServices({ setlist: pearlJamPortland(), outcomes: pearlJamOutcomes });
    const prepared = await prepare(pearlJamPortland());
    const preview = await previewMatches(fake.services, prepared, ACCESS_TOKEN, { onProgress: () => {} });
    expect(
      preview.rows.map((r: { number: number; performance: Performance; outcome: MatchOutcome }) => [
        r.number,
        r.performance.title,
        r.outcome,
      ]),
    ).toEqual([
      [1, "Release", pearlJamOutcomes.Release],
      [2, "Even Flow", pearlJamOutcomes["Even Flow"]],
      [3, "Alive", pearlJamOutcomes.Alive],
    ]);
    expect(preview.rows.map((r: { performance: Performance }) => r.performance)).toEqual(prepared.keptPerformances);
    expect(preview.matches.map((m: Match) => m.uri)).toEqual(PORTLAND_URIS);
    expect(preview.misses).toEqual([]);
    expect(preview.playlistName).toBe(PORTLAND_PLAYLIST_NAME);
  });

  it("AC-15: no duplicate-name check, no token request and no creation", async () => {
    const events: string[] = [];
    const fake = makeFakeServices({ setlist: pearlJamPortland(), outcomes: pearlJamOutcomes }, events);
    const prepared = await prepare(pearlJamPortland());
    await previewMatches(fake.services, prepared, ACCESS_TOKEN, { onProgress: () => {} });
    expect(events.filter((e) => !e.startsWith("spotify:findMatch:"))).toEqual([]);
    expect(fake.calls.findPlaylistsNamed).toEqual([]);
    expect(fake.calls.create).toEqual([]);
    expect(fake.calls.getAccessToken).toBe(0);
  });

  it("AC-15: a services object with only the Match search is enough; each search gets the kept Performance itself and the token", async () => {
    const prepared = await prepare(pearlJamPortland());
    const searched: Array<{ performance: Performance; accessToken: string }> = [];
    const onlyMatchSearch: Pick<RunServices, "findMatch"> = {
      async findMatch(performance, accessToken) {
        searched.push({ performance, accessToken });
        return pearlJamOutcomes[performance.title] as Match;
      },
    };
    const preview = await previewMatches(onlyMatchSearch, prepared, ACCESS_TOKEN, {});
    expect(searched).toEqual(prepared.keptPerformances.map((performance) => ({ performance, accessToken: ACCESS_TOKEN })));
    expect(preview.matches).toEqual(portlandMatches());
    expect(preview.misses).toEqual([]);
    expect(preview.playlistName).toBe(PORTLAND_PLAYLIST_NAME);
  });

  it("AC-15: without onProgress the step still runs every search and gives the same result", async () => {
    const withProgress = makeFakeServices({ setlist: pearlJamPortland(), outcomes: pearlJamOutcomes });
    const withoutProgress = makeFakeServices({ setlist: pearlJamPortland(), outcomes: pearlJamOutcomes });
    const prepared = await prepare(pearlJamPortland());
    const expected = await previewMatches(withProgress.services, prepared, ACCESS_TOKEN, { onProgress: () => {} });
    const preview = await previewMatches(withoutProgress.services, prepared, ACCESS_TOKEN, {});
    expect(withoutProgress.calls.findMatch.map((c) => c.performance.title)).toEqual(["Release", "Even Flow", "Alive"]);
    expect(preview).toEqual(expected);
  });

  it("AC-15: Nirvana U1 → 9 rows, Spank Thru a Miss, 8 Matches in played order", async () => {
    const fake = makeFakeServices({ setlist: nirvanaTacoma(), outcomes: nirvanaOutcomes });
    const preview = await previewMatches(fake.services, await prepare(nirvanaTacoma()), ACCESS_TOKEN, {
      onProgress: () => {},
    });
    expect(preview.rows.map((r: { number: number; performance: Performance }) => [r.number, r.performance.title])).toEqual(
      NIRVANA_KEPT_TITLES.map((t, i) => [i + 1, t]),
    );
    expect(preview.rows[5]!.outcome.kind).toBe("miss");
    expect(preview.matches.map((m: Match) => m.uri)).toEqual(NIRVANA_URIS);
    expect(preview.misses.map((m: { title: string; artist: string }) => [m.title, m.artist])).toEqual([
      ["Spank Thru", "Nirvana"],
    ]);
    expect(preview.playlistName).toBe(NIRVANA_PLAYLIST_NAME);
  });

  it("AC-15: a song played twice is searched twice and its Match is listed twice", async () => {
    const brianstorm = match("2JUVKZaRwH8L3h5eKq7EvC", "Brianstorm", "Pearl Jam", "Some Album");
    const setlist = withSongs(pearlJamPortland(), [{ name: "Brianstorm" }, { name: "Brianstorm" }]);
    const fake = makeFakeServices({ setlist, outcomes: { Brianstorm: brianstorm } });
    const preview = await previewMatches(fake.services, await prepare(setlist), ACCESS_TOKEN, { onProgress: () => {} });
    expect(fake.calls.findMatch.map((c) => c.performance.title)).toEqual(["Brianstorm", "Brianstorm"]);
    expect(preview.rows.map((r) => [r.number, r.performance.title, r.performance.position, r.outcome])).toEqual([
      [1, "Brianstorm", 1, brianstorm],
      [2, "Brianstorm", 2, brianstorm],
    ]);
    expect(preview.matches).toEqual([brianstorm, brianstorm]);
    expect(preview.matches[0]!.uri).toBe("spotify:track:2JUVKZaRwH8L3h5eKq7EvC");
    expect(preview.misses).toEqual([]);
  });
});

// ---------------------------------------------------------------- AC-16

describe("previewMatches — nothing to search, or every search a Miss", () => {
  it("AC-16: no kept Performances → no search, no progress; no rows, Matches or Misses; the playlist name", async () => {
    const fake = makeFakeServices({ setlist: portlandOnlyUnknownSongs() });
    const log = progressLog();
    const preview = await previewMatches(fake.services, await prepare(portlandOnlyUnknownSongs()), ACCESS_TOKEN, {
      onProgress: log.onProgress,
    });
    expect(fake.calls.findMatch).toEqual([]);
    expect(log.reports).toEqual([]);
    expect(preview.rows).toEqual([]);
    expect(preview.matches).toEqual([]);
    expect(preview.misses).toEqual([]);
    expect(preview.playlistName).toBe(PORTLAND_PLAYLIST_NAME);
  });

  it("AC-16: every search a Miss → 3 rows, no Matches, 3 Misses in played order, no error", async () => {
    const allMiss: Record<string, MatchSpec> = { Release: "miss", "Even Flow": "miss", Alive: "miss" };
    const fake = makeFakeServices({ setlist: pearlJamPortland(), outcomes: allMiss });
    const preview = await previewMatches(fake.services, await prepare(pearlJamPortland()), ACCESS_TOKEN, {
      onProgress: () => {},
    });
    expect(preview.rows).toHaveLength(3);
    expect(preview.rows.map((r: { outcome: MatchOutcome }) => r.outcome.kind)).toEqual(["miss", "miss", "miss"]);
    expect(preview.matches).toEqual([]);
    expect(preview.misses.map((m: { title: string }) => m.title)).toEqual(["Release", "Even Flow", "Alive"]);
  });
});

// ---------------------------------------------------------------- AC-17

/** Match search whose answers the test releases by hand, one deferred per search. */
function controlledSearch() {
  const pending: Array<{ title: string; answer: Deferred<MatchOutcome> }> = [];
  const services = {
    findMatch(performance: Performance, _accessToken: string): Promise<MatchOutcome> {
      const answer = deferred<MatchOutcome>();
      pending.push({ title: performance.title, answer });
      return answer.promise;
    },
  };
  const typed: Pick<RunServices, "findMatch"> = services;
  return { services: typed, pending };
}

describe("previewMatches — cancellation", () => {
  it("AC-17: a signal aborted before the step starts → no search, no progress, the run-cancelled error", async () => {
    const fake = makeFakeServices({ setlist: pearlJamPortland(), outcomes: pearlJamOutcomes });
    const controller = new AbortController();
    controller.abort();
    const log = progressLog();
    const err = await captureError(
      previewMatches(fake.services, await prepare(pearlJamPortland()), ACCESS_TOKEN, {
        onProgress: log.onProgress,
        signal: controller.signal,
      }),
    );
    expect(err).toBeInstanceOf(RunCancelledError);
    expect(fake.calls.findMatch).toEqual([]);
    expect(log.reports).toEqual([]);
  });

  it("AC-17: an abort while search 2 (Even Flow) is in flight ends promptly; Alive is never searched; the late answer is ignored", async () => {
    const search = controlledSearch();
    const controller = new AbortController();
    const log = progressLog();
    const running = previewMatches(search.services, await prepare(pearlJamPortland()), ACCESS_TOKEN, {
      onProgress: log.onProgress,
      signal: controller.signal,
    });
    const outcome = captureError(running);

    await flush();
    expect(search.pending.map((p) => p.title)).toEqual(["Release"]);
    search.pending[0]!.answer.resolve(pearlJamOutcomes.Release as Match);
    await flush();
    expect(search.pending.map((p) => p.title)).toEqual(["Release", "Even Flow"]);

    controller.abort();
    const err = await within(outcome, 1000);
    expect(err).toBeInstanceOf(RunCancelledError);

    search.pending[1]!.answer.resolve(pearlJamOutcomes["Even Flow"] as Match);
    await flush();
    expect(search.pending.map((p) => p.title)).toEqual(["Release", "Even Flow"]);
    expect(progressText(log.reports)).toEqual(["1/3 Release", "2/3 Even Flow"]);
  });

  it("AC-17: an abort while search 1 (Release) is in flight ends promptly; only (1 of 3) was reported; nothing more is searched", async () => {
    const search = controlledSearch();
    const controller = new AbortController();
    const log = progressLog();
    const outcome = captureError(
      previewMatches(search.services, await prepare(pearlJamPortland()), ACCESS_TOKEN, {
        onProgress: log.onProgress,
        signal: controller.signal,
      }),
    );
    await flush();
    expect(search.pending.map((p) => p.title)).toEqual(["Release"]);

    controller.abort();
    expect(await within(outcome, 1000)).toBeInstanceOf(RunCancelledError);
    search.pending[0]!.answer.resolve(pearlJamOutcomes.Release as Match);
    await flush();
    expect(search.pending.map((p) => p.title)).toEqual(["Release"]);
    expect(progressText(log.reports)).toEqual(["1/3 Release"]);
  });

  it("AC-17: an abort right after search 1 answers, with no search in flight → no search 2 and no (2 of 3) report", async () => {
    const search = controlledSearch();
    const controller = new AbortController();
    const log = progressLog();
    const outcome = captureError(
      previewMatches(search.services, await prepare(pearlJamPortland()), ACCESS_TOKEN, {
        onProgress: log.onProgress,
        signal: controller.signal,
      }),
    );
    await flush();
    search.pending[0]!.answer.resolve(pearlJamOutcomes.Release as Match);
    controller.abort();

    expect(await within(outcome, 1000)).toBeInstanceOf(RunCancelledError);
    await flush();
    expect(search.pending.map((p) => p.title)).toEqual(["Release"]);
    expect(progressText(log.reports)).toEqual(["1/3 Release"]);
  });

  it("AC-17: an abort from the progress report of search 2, before it is sent → search 2 is never made", async () => {
    const search = controlledSearch();
    const controller = new AbortController();
    const reports: string[] = [];
    const outcome = captureError(
      previewMatches(search.services, await prepare(pearlJamPortland()), ACCESS_TOKEN, {
        onProgress: (p) => {
          reports.push(`${p.n}/${p.total} ${p.performance.title}`);
          if (p.n === 2) controller.abort();
        },
        signal: controller.signal,
      }),
    );
    await flush();
    search.pending[0]!.answer.resolve(pearlJamOutcomes.Release as Match);

    expect(await within(outcome, 1000)).toBeInstanceOf(RunCancelledError);
    await flush();
    expect(search.pending.map((p) => p.title)).toEqual(["Release"]);
    expect(reports).toEqual(["1/3 Release", "2/3 Even Flow"]);
  });

  it("AC-17: an abort right after the last search answers, before the step returns → the run-cancelled error, no result", async () => {
    const search = controlledSearch();
    const controller = new AbortController();
    const log = progressLog();
    const outcome = captureError(
      previewMatches(search.services, await prepare(pearlJamPortland()), ACCESS_TOKEN, {
        onProgress: log.onProgress,
        signal: controller.signal,
      }),
    );
    for (const title of ["Release", "Even Flow"]) {
      await flush();
      search.pending.at(-1)!.answer.resolve(pearlJamOutcomes[title] as Match);
    }
    await flush();
    expect(search.pending.map((p) => p.title)).toEqual(["Release", "Even Flow", "Alive"]);
    search.pending[2]!.answer.resolve(pearlJamOutcomes.Alive as Match);
    controller.abort();

    expect(await within(outcome, 1000)).toBeInstanceOf(RunCancelledError);
    expect(progressText(log.reports)).toEqual(["1/3 Release", "2/3 Even Flow", "3/3 Alive"]);
  });

  it("AC-17: the step leaves no abort listener on the signal: at most one while a search is in flight, none after it ends", async () => {
    const controller = new AbortController();
    const listenersDuringSearch: number[] = [];
    const services: Pick<RunServices, "findMatch"> = {
      async findMatch(performance) {
        listenersDuringSearch.push(getEventListeners(controller.signal, "abort").length);
        return pearlJamOutcomes[performance.title] as Match;
      },
    };
    const preview = await previewMatches(services, await prepare(pearlJamPortland()), ACCESS_TOKEN, {
      signal: controller.signal,
    });
    expect(preview.matches).toEqual(portlandMatches());
    expect(listenersDuringSearch).toEqual([1, 1, 1]);
    expect(getEventListeners(controller.signal, "abort")).toEqual([]);
  });

  it("AC-17: with no signal the step runs to the end", async () => {
    const fake = makeFakeServices({ setlist: pearlJamPortland(), outcomes: pearlJamOutcomes });
    const preview = await previewMatches(fake.services, await prepare(pearlJamPortland()), ACCESS_TOKEN, {
      onProgress: () => {},
    });
    expect(preview.matches).toHaveLength(3);
    expect(fake.calls.findMatch).toHaveLength(3);
  });
});

// ---------------------------------------------------------------- AC-18

const PLAYLIST_ID = "5PqRsTuVwXyZaBcDeFgHiJ";
const SHARE_URL = `https://open.spotify.com/playlist/${PLAYLIST_ID}`;

/** The real services the core builds, over a fake Spotify that answers create and add-items. */
function realSpotify(answers: { create?: () => Response; addItems?: () => Response } = {}) {
  const clock = makeFakeClock();
  const route: Route = (request) => {
    if (request.url.pathname === "/v1/me/playlists" && request.method === "POST") {
      if (answers.create) return answers.create();
      return json(201, {
        id: PLAYLIST_ID,
        name: PORTLAND_PLAYLIST_NAME,
        public: false,
        uri: `spotify:playlist:${PLAYLIST_ID}`,
        external_urls: { spotify: SHARE_URL },
      });
    }
    if (request.url.pathname === `/v1/playlists/${PLAYLIST_ID}/items` && request.method === "POST") {
      if (answers.addItems) return answers.addItems();
      return json(201, { snapshot_id: "AAAAAgAAAAA" });
    }
    return json(404, undefined);
  };
  const http = makeRoutedFetch(route, clock);
  const services = createRunServices({
    fetch: http.fetch,
    sleep: clock.sleep,
    now: clock.now,
    env: {},
    settings: createMemorySettingsStore(),
    startCallbackReceiver: async () => {
      throw new Error("no login expected");
    },
  });
  return { services, http, clock };
}

describe("createSetlistPlaylist — C1", () => {
  it("AC-18: creates the private Setlist Playlist with today's name and description, adds 3 URIs in one request, returns the share link and 3 tracks", async () => {
    const { services, http } = realSpotify();
    const created = await createSetlistPlaylist(services, portlandShow, portlandMatches(), {
      accessToken: ACCESS_TOKEN,
      public: false,
    });
    expect(created.shareUrl).toBe(SHARE_URL);
    expect(created.trackCount).toBe(3);

    expect(http.requests.map((r) => `${r.method} ${r.url.pathname}`)).toEqual([
      "POST /v1/me/playlists",
      `POST /v1/playlists/${PLAYLIST_ID}/items`,
    ]);
    expect(JSON.parse(http.requests[0]!.body!)).toMatchObject({
      name: PORTLAND_PLAYLIST_NAME,
      public: false,
      description: `Setlist from setlist.fm: ${PORTLAND_URL}`,
    });
    expect(JSON.parse(http.requests[1]!.body!).uris).toEqual(PORTLAND_URIS);
    for (const r of http.requests) expect(r.headers.get("Authorization")).toBe(`Bearer ${ACCESS_TOKEN}`);
  });

  it("AC-18: the public choice makes a public Setlist Playlist", async () => {
    const { services, http } = realSpotify();
    await createSetlistPlaylist(services, portlandShow, portlandMatches(), { accessToken: ACCESS_TOKEN, public: true });
    expect(JSON.parse(http.requests[0]!.body!)).toMatchObject({ name: PORTLAND_PLAYLIST_NAME, public: true });
  });

  it("AC-18: no Matches raises the existing nothing-to-add error and sends no request", async () => {
    const { services, http } = realSpotify();
    const err = await captureError(
      createSetlistPlaylist(services, portlandShow, [], { accessToken: ACCESS_TOKEN, public: false }),
    );
    expect(err).toBeInstanceOf(NothingToAddError);
    expect(http.requests).toEqual([]);
  });

  it("AC-18: a services object with only the create service of the real services is enough", async () => {
    const { services, http } = realSpotify();
    const onlyCreate: Pick<RunServices, "createSetlistPlaylist"> = { createSetlistPlaylist: services.createSetlistPlaylist };
    const created = await createSetlistPlaylist(onlyCreate, portlandShow, portlandMatches(), {
      accessToken: ACCESS_TOKEN,
      public: false,
    });
    expect(created).toEqual({ id: PLAYLIST_ID, shareUrl: SHARE_URL, name: PORTLAND_PLAYLIST_NAME, trackCount: 3 });
    expect(http.requests.map((r) => `${r.method} ${r.url.pathname}`)).toEqual([
      "POST /v1/me/playlists",
      `POST /v1/playlists/${PLAYLIST_ID}/items`,
    ]);
  });

  it("AC-18: create answered 429 four times → the existing \"no playlist was created\" error with a rate-limit cause, after 4 requests and no add-items", async () => {
    const { services, http, clock } = realSpotify({
      create: () => json(429, { error: { status: 429, message: "API rate limit exceeded" } }, { "Retry-After": "2" }),
    });
    const err = await captureError(
      createSetlistPlaylist(services, portlandShow, portlandMatches(), { accessToken: ACCESS_TOKEN, public: false }),
    );
    expect(err).toBeInstanceOf(SpotifyPlaylistError);
    expect(err).not.toBeInstanceOf(PartlyCreatedPlaylistError);
    expect((err as SpotifyPlaylistError).status).toBe(429);
    expect((err as Error).message).toMatch(/no playlist was created/);
    expect((err as Error).cause).toBeInstanceOf(PlaylistRateLimitError);
    expect(http.requests.map((r) => `${r.method} ${r.url.pathname}`)).toEqual(Array(4).fill("POST /v1/me/playlists"));
    expect(clock.sleeps.filter((ms) => ms === 2000)).toHaveLength(3);
  });

  it("AC-18: add-items answered 503 → the existing partly-created error with 0 of 3 added and the share link; no retry", async () => {
    const { services, http } = realSpotify({
      addItems: () => json(503, { error: { status: 503, message: "Service unavailable" } }),
    });
    const err = await captureError(
      createSetlistPlaylist(services, portlandShow, portlandMatches(), { accessToken: ACCESS_TOKEN, public: false }),
    );
    expect(err).toBeInstanceOf(PartlyCreatedPlaylistError);
    const partly = err as PartlyCreatedPlaylistError;
    expect([partly.playlistId, partly.shareUrl, partly.tracksAdded, partly.totalMatches]).toEqual([PLAYLIST_ID, SHARE_URL, 0, 3]);
    expect(partly.cause).toBeInstanceOf(SpotifyPlaylistError);
    expect((partly.cause as SpotifyPlaylistError).status).toBe(503);
    expect(http.requests.map((r) => `${r.method} ${r.url.pathname}`)).toEqual([
      "POST /v1/me/playlists",
      `POST /v1/playlists/${PLAYLIST_ID}/items`,
    ]);
  });

  it("AC-18: 101 Matches → two add-items requests (100, then 1); the second failing gives partly created with 100 of 101 added", async () => {
    const many = Array.from({ length: 101 }, (_, i) =>
      match(`T${String(i).padStart(21, "0")}`, `Song ${i + 1}`, "Pearl Jam", "Some Album"),
    );
    let addCalls = 0;
    const { services, http } = realSpotify({
      addItems: () => (++addCalls === 1 ? json(201, { snapshot_id: "AAAAAgAAAAA" }) : json(500, { error: { status: 500, message: "Server error" } })),
    });
    const err = await captureError(
      createSetlistPlaylist(services, portlandShow, many, { accessToken: ACCESS_TOKEN, public: false }),
    );
    expect(err).toBeInstanceOf(PartlyCreatedPlaylistError);
    const partly = err as PartlyCreatedPlaylistError;
    expect([partly.tracksAdded, partly.totalMatches, partly.shareUrl]).toEqual([100, 101, SHARE_URL]);
    const adds = http.requests.filter((r) => r.url.pathname.endsWith("/items"));
    expect(adds.map((r) => JSON.parse(r.body!).uris.length)).toEqual([100, 1]);
    expect(JSON.parse(adds[1]!.body!).uris).toEqual([many[100]!.uri]);
  });
});
