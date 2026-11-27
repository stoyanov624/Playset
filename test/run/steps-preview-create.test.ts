// PRD 0012 — the preview step (AC-15 to AC-17) and the create step (AC-18). Spotify is a fake:
// either the run's fake services, a hand-made services object with only the needed service, or the
// real services the core builds over a routed fake fetch. No network.
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
import { createSetlistPlaylist, prepareSetlist, previewMatches } from "../../src/core/run/index.js";
import { captureError, deferred, flush, within, type Deferred } from "./fixtures/call-recorder";
import { CREATED_SHARE_URL, makeFakeServices, match, type MatchSpec } from "./fixtures/fake-services";
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
import { partlyCreatedPlaylistError } from "./fixtures/typed-errors";
import { json, makeFakeClock, makeRoutedFetch, type Route } from "./fixtures/real-service-fakes";
import type { SetlistFmSetlist } from "../../src/core/performances";

const ACCESS_TOKEN = "BQD3kx-test-token";

const keepEveryTape = async () => true;
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

  it("AC-15: a services object with only the Match search is enough", async () => {
    const searched: string[] = [];
    const services = {
      async findMatch(performance: Performance, accessToken: string): Promise<MatchOutcome> {
        searched.push(`${performance.title}|${accessToken}`);
        return pearlJamOutcomes[performance.title] as Match;
      },
    };
    const preview = await previewMatches(services as never, await prepare(pearlJamPortland()), ACCESS_TOKEN, {
      onProgress: () => {},
    });
    expect(searched).toEqual([`Release|${ACCESS_TOKEN}`, `Even Flow|${ACCESS_TOKEN}`, `Alive|${ACCESS_TOKEN}`]);
    expect(preview.matches.map((m: Match) => m.uri)).toEqual(PORTLAND_URIS);
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
    expect(preview.rows).toHaveLength(2);
    expect(preview.matches.map((m: Match) => m.uri)).toEqual([
      "spotify:track:2JUVKZaRwH8L3h5eKq7EvC",
      "spotify:track:2JUVKZaRwH8L3h5eKq7EvC",
    ]);
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
  return { services: services as never, pending };
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
const portlandMatches = (): Match[] => ["Release", "Even Flow", "Alive"].map((t) => pearlJamOutcomes[t] as Match);

function realSpotify() {
  const clock = makeFakeClock();
  const route: Route = (request) => {
    if (request.url.pathname === "/v1/me/playlists" && request.method === "POST") {
      return json(201, {
        id: PLAYLIST_ID,
        name: PORTLAND_PLAYLIST_NAME,
        public: false,
        uri: `spotify:playlist:${PLAYLIST_ID}`,
        external_urls: { spotify: SHARE_URL },
      });
    }
    if (request.url.pathname === `/v1/playlists/${PLAYLIST_ID}/items` && request.method === "POST") {
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
  } as never);
  return { services, http };
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

  it("AC-18: a services object with only the create service is enough; its result gives the share link and track count", async () => {
    const fake = makeFakeServices({ setlist: pearlJamPortland() });
    const services = { createSetlistPlaylist: (fake.services as unknown as Record<string, unknown>).createSetlistPlaylist };
    const created = await createSetlistPlaylist(services as never, portlandShow, portlandMatches(), {
      accessToken: ACCESS_TOKEN,
      public: false,
    });
    expect(created.shareUrl).toBe(CREATED_SHARE_URL);
    expect(created.trackCount).toBe(3);
    expect(fake.calls.create).toHaveLength(1);
    expect(fake.calls.create[0]!.show).toEqual(portlandShow);
    expect(fake.calls.create[0]!.matches.map((m) => m.uri)).toEqual(PORTLAND_URIS);
    expect(fake.calls.create[0]!.options).toEqual({ accessToken: ACCESS_TOKEN, public: false });
  });

  it("AC-18: a partly-created error from creation is passed on unchanged", async () => {
    const partly = await partlyCreatedPlaylistError();
    const fake = makeFakeServices({ setlist: pearlJamPortland(), fail: { createSetlistPlaylist: partly } });
    const err = await captureError(
      createSetlistPlaylist(fake.services, portlandShow, portlandMatches(), { accessToken: ACCESS_TOKEN, public: false }),
    );
    expect(err).toBe(partly);
  });
});
