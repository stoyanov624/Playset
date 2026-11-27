// The steps with the run's services, and the run rebuilt on the steps:
// - the real services the core builds also search Artists without a chooser and fetch one Setlist
//   page (AC-1, AC-3, AC-4, AC-6);
// - getSetlist and findLatestSetlist need only their own service and pass their inputs on exactly
//   (AC-9, AC-10);
// - runPlayset works with only today's services, keeps its cancellation and its errors (AC-19);
// - the `playset` command prints, asks and exits exactly as before (AC-20). The transcripts below
//   were captured from the code on main and are byte-for-byte what the command printed there.
// The rest of AC-19 to AC-21 is the existing run, CLI and shell suites, unchanged and green.
import { describe, expect, it } from "vitest";
import { main } from "../../src/cli/main.js";
import {
  createMemorySettingsStore,
  createRunServices,
  type ArtistCandidate,
  type ArtistChooser,
  type SetlistFmSetlist,
} from "../../src/core/index.js";
import {
  RunCancelledError,
  findArtists,
  findLatestSetlist,
  getSetlist,
  listSetlists,
  runPlayset,
  type RunServices,
} from "../../src/core/run/index.js";
import { makeFakeIo } from "../cli/fixtures/fake-io";
import { captureError, deferred, flush, makeAbort, makeCallRecorder, within } from "./fixtures/call-recorder";
import { CREATED_SHARE_URL, ExitPromptError, TOKEN, makeFakeFrontEnd, makeFakeServices } from "./fixtures/fake-services";
import {
  PORTLAND_URIS,
  pearlJamOutcomes,
  pearlJamPortland,
  pearlJamVancouver,
  portlandShow,
} from "./fixtures/incomplete-setlists";
import { FIXTURE_A_URL, setlistUrlOfLength, withFixtureAShow } from "./fixtures/setlists";
import { DescriptionTooLongError } from "../../src/core/setlist-playlist";
import { missingSetlistFmApiKeyError } from "./fixtures/typed-errors";
import { NOW, SETLISTFM_API_KEY, json, makeFakeClock, makeRoutedFetch, type Route } from "./fixtures/real-service-fakes";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const setlistFmFixtures = join(dirname(fileURLToPath(import.meta.url)), "..", "setlistfm", "fixtures");
const readSetlistFm = (file: string) => JSON.parse(readFileSync(join(setlistFmFixtures, file), "utf8"));

const PEARL_JAM_MBID = "83b9cbe7-9857-49e2-ab8e-b57b01038103";

function realServices(route: Route, apiKey: string | null = SETLISTFM_API_KEY) {
  const clock = makeFakeClock();
  const http = makeRoutedFetch(route, clock);
  const services = createRunServices({
    fetch: http.fetch,
    sleep: clock.sleep,
    now: clock.now,
    env: {},
    settings: createMemorySettingsStore(apiKey === null ? undefined : { settings: { setlistfmApiKey: apiKey } }),
    startCallbackReceiver: async () => {
      throw new Error("no login expected");
    },
  });
  return { services, http };
}

const pearlJamRoute: Route = (request) => {
  if (request.url.pathname === "/rest/1.0/search/artists") return json(200, readSetlistFm("search-pearl-jam.json"));
  if (request.url.pathname === `/rest/1.0/artist/${PEARL_JAM_MBID}/setlists`) {
    return json(200, readSetlistFm("setlists-pearl-jam-p1.json"));
  }
  return json(404, { code: 404, status: "Not Found", message: "not found" });
};

// ---------------------------------------------------------------- the real services

describe("the real services the core builds — the new setlist.fm services", () => {
  it("AC-1: findArtists works on createRunServices: one Artist search, candidates and autoPick", async () => {
    const { services, http } = realServices(pearlJamRoute);
    const result = await findArtists(services, "Pearl Jam");
    expect(result.candidates).toStrictEqual([
      { name: "Pearl Jam", mbid: PEARL_JAM_MBID },
      { name: "Pearl Jam Tribute", mbid: "6c3b9f2e-1a4d-4e8b-9f0a-2b3c4d5e6f70" },
    ]);
    expect(result.autoPick).toStrictEqual({ name: "Pearl Jam", mbid: PEARL_JAM_MBID });
    expect(http.requests).toHaveLength(1);
    const [search] = http.requests;
    expect(search!.method).toBe("GET");
    expect(`${search!.url.origin}${search!.url.pathname}`).toBe("https://api.setlist.fm/rest/1.0/search/artists");
    expect(search!.url.search).toBe("?artistName=Pearl%20Jam&sort=relevance&p=1");
    expect(search!.headers.get("x-api-key")).toBe(SETLISTFM_API_KEY);
    expect(search!.headers.get("Accept")).toBe("application/json");
  });

  it("AC-4: listSetlists works on createRunServices: one page request, setlist.fm's rules (key header, 500 ms apart)", async () => {
    const { services, http } = realServices(pearlJamRoute);
    await findArtists(services, "Pearl Jam");
    const page = await listSetlists(services, PEARL_JAM_MBID, 1);
    expect(page.setlists.map((s: { id: string }) => s.id)).toEqual(["2bf1c8e4", "6bf1b3d0", "3bf1a7c2"]);
    expect(page.hasMore).toBe(true);
    expect(http.requests.map((r) => `${r.url.pathname}${r.url.search}`)).toEqual([
      expect.stringMatching(/^\/rest\/1\.0\/search\/artists\?/),
      `/rest/1.0/artist/${PEARL_JAM_MBID}/setlists?p=1`,
    ]);
    expect(http.requests[1]!.method).toBe("GET");
    expect(http.requests[1]!.url.origin).toBe("https://api.setlist.fm");
    expect(http.requests[1]!.headers.get("x-api-key")).toBe(SETLISTFM_API_KEY);
    expect(http.requests[1]!.headers.get("Accept")).toBe("application/json");
    expect(http.requests[0]!.at).toBe(NOW);
    expect(http.requests[1]!.at - http.requests[0]!.at).toBeGreaterThanOrEqual(500);
  });

  it("AC-3, AC-6: without an API key the new services raise the missing-API-key error on first use, with no request", async () => {
    const expected = await missingSetlistFmApiKeyError();
    const { services, http } = realServices(pearlJamRoute, null);
    const findErr = await captureError(findArtists(services, "Pearl Jam"));
    expect((findErr as Error).constructor).toBe(expected.constructor);
    expect((findErr as Error).message).toBe(expected.message);
    const listErr = await captureError(listSetlists(services, PEARL_JAM_MBID, 1));
    expect((listErr as Error).constructor).toBe(expected.constructor);
    expect((listErr as Error).message).toBe(expected.message);
    expect(http.requests).toEqual([]);
  });
});

// ---------------------------------------------------------------- AC-9, AC-10 with only their own service

describe("getSetlist and findLatestSetlist pass their inputs on to their one service", () => {
  it("AC-9: a services object with only getSetlist is enough; it gets exactly the setlist id, once, and its Setlist comes back unchanged", async () => {
    const asked: string[] = [];
    const answer = pearlJamPortland();
    const onlyGetSetlist: Pick<RunServices, "getSetlist"> = {
      async getSetlist(setlistId) {
        asked.push(setlistId);
        return answer;
      },
    };
    const setlist = await getSetlist(onlyGetSetlist, "2bf1c8e4");
    expect(asked).toEqual(["2bf1c8e4"]);
    expect(setlist).toBe(answer);
    expect(setlist).toEqual(pearlJamPortland());
  });

  it("AC-10: the lookup gets the typed name, the very chooser given and the complete-alternative option, and its result comes back", async () => {
    const asked: Array<{ name: string; chooser: ArtistChooser; options: unknown }> = [];
    const onlyLookup: Pick<RunServices, "findLatestSetlistByArtistName"> = {
      async findLatestSetlistByArtistName(name, chooser, options) {
        asked.push({ name, chooser, options });
        const completeAlternative: SetlistFmSetlist | null =
          options?.wantCompleteAlternative === true ? pearlJamVancouver() : null;
        return { artist: { name: "Pearl Jam", mbid: PEARL_JAM_MBID }, setlist: pearlJamPortland(), completeAlternative };
      },
    };
    const chooser: ArtistChooser = async (c: ArtistCandidate[]) => c[0] ?? null;

    const result = await findLatestSetlist(onlyLookup, "  Pearl Jam ", chooser, { wantCompleteAlternative: true });
    expect(asked).toHaveLength(1);
    expect(asked[0]!.name).toBe("  Pearl Jam ");
    expect(asked[0]!.chooser).toBe(chooser);
    expect(asked[0]!.options).toEqual({ wantCompleteAlternative: true });
    expect(result).toEqual({
      artist: { name: "Pearl Jam", mbid: PEARL_JAM_MBID },
      setlist: pearlJamPortland(),
      completeAlternative: pearlJamVancouver(),
    });

    const without = await findLatestSetlist(onlyLookup, "Pearl Jam", chooser, { wantCompleteAlternative: false });
    expect(asked[1]!.options).toEqual({ wantCompleteAlternative: false });
    expect(without.completeAlternative).toBeNull();
  });
});

// ---------------------------------------------------------------- AC-19: runPlayset on the steps

const TODAYS_SERVICES = [
  "getSetlist",
  "findLatestSetlistByArtistName",
  "getAccessToken",
  "findMatch",
  "findPlaylistsNamed",
  "createSetlistPlaylist",
];

describe("runPlayset on the steps", () => {
  it("AC-19: with only today's services the whole run completes with C1's records, in today's order, touching no other service", async () => {
    const events: string[] = [];
    const fake = makeFakeServices(
      { setlist: pearlJamPortland(), completeAlternative: pearlJamVancouver(), outcomes: pearlJamOutcomes, duplicates: [] },
      events,
    );
    const touched = new Set<string>();
    const services = new Proxy(fake.services, {
      get(target, prop, receiver) {
        if (typeof prop === "string") touched.add(prop);
        return Reflect.get(target, prop, receiver);
      },
    });
    const ui = makeFakeFrontEnd({ offer: false, confirm: true, tapeAnswers: [] }, events);

    const outcome = await runPlayset({
      input: "Pearl Jam",
      options: { tapes: "ask", confirm: "ask", public: false, dryRun: false },
      frontEnd: ui.frontEnd,
      services,
    });

    if (outcome.kind !== "created") throw new Error(`expected a created Setlist Playlist, got "${outcome.kind}"`);
    expect(outcome.playlist).toEqual({
      id: "7GhIjKlMnOpQrStUvWxYzA",
      shareUrl: CREATED_SHARE_URL,
      name: "Pearl Jam – 2026-11-22 – Portland",
      trackCount: 3,
    });
    expect(outcome.misses).toEqual([]);
    expect(outcome.incompleteStatus).toEqual({ isIncomplete: true, unknownSongCount: 1 });
    expect([...touched].filter((name) => !TODAYS_SERVICES.includes(name) && name !== "then")).toEqual([]);
    expect(events).toEqual([
      "setlistfm:findLatest:Pearl Jam",
      "show:show",
      "ask:offer",
      "spotify:getAccessToken",
      "spotify:token",
      "show:progress:1/3",
      "spotify:findMatch:Release",
      "show:progress:2/3",
      "spotify:findMatch:Even Flow",
      "show:progress:3/3",
      "spotify:findMatch:Alive",
      "spotify:findPlaylistsNamed",
      "show:preview",
      "ask:confirm",
      "spotify:createSetlistPlaylist",
    ]);
    expect(fake.calls.findLatestOptions).toEqual([{ wantCompleteAlternative: true }]);
    expect(fake.calls.findMatch.map((c) => c.accessToken)).toEqual([TOKEN, TOKEN, TOKEN]);
    expect(fake.calls.findPlaylistsNamed).toEqual([{ name: "Pearl Jam – 2026-11-22 – Portland", accessToken: TOKEN }]);
    expect(fake.calls.create).toHaveLength(1);
    expect(fake.calls.create[0]!.show).toEqual(portlandShow);
    expect(fake.calls.create[0]!.matches.map((m) => m.uri)).toEqual(PORTLAND_URIS);
    expect(fake.calls.create[0]!.options).toEqual({ accessToken: TOKEN, public: false });
  });

  /** Fixture A by link through the call recorder, with a signal. */
  function recordedRun(
    overrides: { tapeAnswers?: boolean[]; askTape?: () => Promise<boolean>; createSetlistPlaylist?: RunServices["createSetlistPlaylist"]; onProgress?: (n: number) => void } = {},
  ) {
    const recorder = makeCallRecorder();
    const abort = makeAbort(recorder);
    const fake = makeFakeServices({ duplicates: [] });
    const ui = makeFakeFrontEnd({ tapeAnswers: overrides.tapeAnswers ?? [true, false], confirm: true });
    const services: RunServices = {
      ...fake.services,
      ...(overrides.createSetlistPlaylist ? { createSetlistPlaylist: overrides.createSetlistPlaylist } : {}),
    };
    const frontEnd = {
      ...ui.frontEnd,
      ...(overrides.askTape ? { askTape: overrides.askTape } : {}),
      ...(overrides.onProgress
        ? {
            showProgress: (p: Parameters<typeof ui.frontEnd.showProgress>[0]) => {
              ui.frontEnd.showProgress(p);
              overrides.onProgress!(p.n);
            },
          }
        : {}),
    };
    const running = runPlayset({
      input: FIXTURE_A_URL,
      options: { tapes: "ask", confirm: "ask", public: false, dryRun: false },
      frontEnd: recorder.wrapFrontEnd(frontEnd),
      services: recorder.wrapServices(services),
      signal: abort.signal,
    });
    return { running, abort, recorder, calls: fake.calls };
  }

  it("AC-19: an abort while a Tape question is open ends the run promptly; no further question and no service call", async () => {
    const answer = deferred<boolean>();
    const t = recordedRun({ askTape: () => answer.promise });
    await flush();
    expect(t.recorder.calls).toEqual(["service:getSetlist", "frontEnd:showShow", "frontEnd:askTape"]);

    t.abort.abort();
    expect(await captureError(within(t.running))).toBeInstanceOf(RunCancelledError);
    answer.resolve(true);
    await flush();
    expect(t.recorder.callsAfterAbort()).toEqual([]);
  });

  it("AC-19: an abort from the progress report of the second Match search → that search is never made; nothing after it", async () => {
    let abort = () => {};
    const t = recordedRun({ onProgress: (n) => n === 2 && abort() });
    abort = t.abort.abort;
    expect(await captureError(within(t.running))).toBeInstanceOf(RunCancelledError);
    await flush();
    expect(t.calls.findMatch.map((c) => c.performance.title)).toEqual(["I Want It All"]);
    expect(t.recorder.callsAfterAbort()).toEqual([]);
    expect(t.calls.findPlaylistsNamed).toEqual([]);
    expect(t.calls.create).toEqual([]);
  });

  it("AC-19: an abort once the create request is sent is ignored: the run waits for it and resolves created", async () => {
    const createAnswer = deferred<Awaited<ReturnType<RunServices["createSetlistPlaylist"]>>>();
    const t = recordedRun({ createSetlistPlaylist: () => createAnswer.promise });
    await flush(50);
    expect(t.recorder.calls.at(-1)).toBe("service:createSetlistPlaylist");

    t.abort.abort();
    await flush();
    createAnswer.resolve({ id: "7GhIjKlMnOpQrStUvWxYzA", shareUrl: CREATED_SHARE_URL, name: "Arctic Monkeys – 2025-08-23 – Amsterdam", trackCount: 12 });
    const outcome = await within(t.running);
    expect(outcome.kind).toBe("created");
    expect(t.recorder.callsAfterAbort()).toEqual([]);
  });

  it("AC-19: a Match search that fails passes its error on unchanged; no further search, no duplicate check, no creation", async () => {
    const searchFailed = new Error("Spotify search failed with HTTP 503");
    const events: string[] = [];
    const fake = makeFakeServices({ duplicates: [], failMatchOn: { Brianstorm: searchFailed } }, events);
    const ui = makeFakeFrontEnd({ tapeAnswers: [true, false], confirm: true }, events);
    const err = await captureError(
      runPlayset({
        input: FIXTURE_A_URL,
        options: { tapes: "ask", confirm: "ask", public: false, dryRun: false },
        frontEnd: ui.frontEnd,
        services: fake.services,
      }),
    );
    expect(err).toBe(searchFailed);
    expect(fake.calls.findMatch.map((c) => c.performance.title)).toEqual([
      "I Want It All",
      "Sculptures of Anything Goes",
      "Brianstorm",
    ]);
    expect(events.at(-1)).toBe("spotify:findMatch:Brianstorm");
    expect(fake.calls.findPlaylistsNamed).toEqual([]);
    expect(fake.calls.create).toEqual([]);
    expect(ui.record.previews).toEqual([]);
  });

  it("AC-19: a Ctrl-C at the first Tape question passes the prompt's error on unchanged; no Spotify call", async () => {
    const ctrlC = new ExitPromptError();
    const events: string[] = [];
    const fake = makeFakeServices({ duplicates: [] }, events);
    const ui = makeFakeFrontEnd({ tapeAnswers: [{ throws: ctrlC }] }, events);
    const err = await captureError(
      runPlayset({
        input: FIXTURE_A_URL,
        options: { tapes: "ask", confirm: "ask", public: false, dryRun: false },
        frontEnd: ui.frontEnd,
        services: fake.services,
      }),
    );
    expect(err).toBe(ctrlC);
    expect(events).toEqual(["setlistfm:getSetlist:63a5e2b7", "show:show", "ask:tape:I Want It All"]);
  });
});

describe("runPlayset on the steps — the description check comes before the no-Performances outcome", () => {
  it("AC-19: a Setlist with no Performances whose playlist description would be too long fails with the description-too-long error, before the no-Performances outcome, and asks no Tape question", async () => {
    // Only Unknown Songs and a snippet: nothing becomes a Performance. The 276-character
    // setlist.fm URL makes the description 301 characters, one over Spotify's limit.
    const noPerformancesTooLong = withFixtureAShow(
      {
        set: [
          { song: [{ name: "" }, { name: "Fluorescent Adolescent", info: "snippet" }] },
          { encore: 1, song: [{ name: "   " }] },
        ],
      },
      { url: setlistUrlOfLength(276) },
    );
    const events: string[] = [];
    const fake = makeFakeServices({ setlist: noPerformancesTooLong, duplicates: [] }, events);
    const ui = makeFakeFrontEnd({ tapeAnswers: [], confirm: true }, events);

    const err = await captureError(
      runPlayset({
        input: FIXTURE_A_URL,
        options: { tapes: "ask", confirm: "ask", public: false, dryRun: false },
        frontEnd: ui.frontEnd,
        services: fake.services,
      }),
    );

    expect((err as Error).constructor).toBe(DescriptionTooLongError);
    expect(ui.record.tapeQuestions).toEqual([]);
    expect(fake.calls.getAccessToken).toBe(0);
    expect(fake.calls.findMatch).toEqual([]);
    expect(fake.calls.findPlaylistsNamed).toEqual([]);
    expect(fake.calls.create).toEqual([]);
    expect(events.filter((e) => e.startsWith("spotify:") || e.startsWith("ask:"))).toEqual([]);
  });
});

// ---------------------------------------------------------------- AC-20: the command is unchanged

describe("the playset command on the rebuilt run", () => {
  const transcriptOf = (fake: ReturnType<typeof makeFakeIo>) => fake.transcript.map((e) => [e.stream, e.text]);

  it("AC-20: `playset Pearl Jam`, n to the offer, Yes to create → the same output, prompts, request order and exit code 0 as before", async () => {
    const fake = makeFakeIo({
      confirmAnswers: [false, true],
      services: { setlist: pearlJamPortland(), completeAlternative: pearlJamVancouver(), outcomes: pearlJamOutcomes },
    });
    const code = await main(["Pearl", "Jam"], fake.io);
    expect(code).toBe(0);
    expect(transcriptOf(fake)).toEqual([
      ["stdout", "\n"],
      ["stdout", "Pearl Jam – 2026-11-22 – Moda Center, Portland\n"],
      ["stdout", "https://www.setlist.fm/setlist/pearl-jam/2026/moda-center-portland-or-2bf1c8e4.html\n"],
      ["stdout", "3 Performances, 0 Tapes\n"],
      ["stdout", "Warning: this Setlist looks incomplete: 1 Unknown Song.\n"],
      ["stdout", "The Setlist Playlist may not be the full Show.\n"],
      ["stdout", "\n"],
      ["prompt", "The latest Setlist (2026-11-22, Portland) looks incomplete. Use the newest complete one (2026-11-18, Vancouver) instead?"],
      ["stdout", "\n"],
      ["stdout", "Finding Matches 1/3: Release\n"],
      ["stdout", "Finding Matches 2/3: Even Flow\n"],
      ["stdout", "Finding Matches 3/3: Alive\n"],
      ["stdout", "\n"],
      ["stdout", "main\n"],
      ["stdout", "   1. Release\n"],
      ["stdout", "      → Release — Pearl Jam · Ten\n"],
      ["stdout", "   2. Even Flow\n"],
      ["stdout", "      → Even Flow — Pearl Jam · Ten\n"],
      ["stdout", "   3. Alive\n"],
      ["stdout", "      → Alive — Pearl Jam · Ten\n"],
      ["stdout", "\n"],
      ["stdout", "Not added:\n"],
      ["stdout", "  (Unknown song) after #1 — New song, title not yet known\n"],
      ["stdout", "\n"],
      ["stdout", "Warning: this Setlist looks incomplete: 1 Unknown Song.\n"],
      ["stdout", "Playlist: Pearl Jam – 2026-11-22 – Portland (private)\n"],
      ["stdout", "3 tracks, 0 Misses\n"],
      ["stdout", "\n"],
      ["prompt", "Create this playlist?"],
      ["stdout", "\n"],
      ["stdout", 'Created "Pearl Jam – 2026-11-22 – Portland" with 3 tracks.\n'],
      ["stdout", "\n"],
      ["stdout", "Every Performance has a Match.\n"],
      ["stdout", "\n"],
      ["stdout", "Note: this Setlist is incomplete — the playlist may not be the full Show.\n"],
      ["stdout", "\n"],
      ["stdout", `${CREATED_SHARE_URL}\n`],
    ]);
    expect(fake.events).toEqual([
      "setlistfm:findLatest:Pearl Jam",
      "prompt:confirm:The latest Setlist (2026-11-22, Portland) looks incomplete. Use the newest complete one (2026-11-18, Vancouver) instead?",
      "spotify:getAccessToken",
      "spotify:token",
      "spotify:findMatch:Release",
      "spotify:findMatch:Even Flow",
      "spotify:findMatch:Alive",
      "spotify:findPlaylistsNamed",
      "prompt:confirm:Create this playlist?",
      "spotify:createSetlistPlaylist",
    ]);
  });

  it("AC-20: a Ctrl-C at the Tape question for \"I Want It All\" prints Cancelled., makes no Spotify request and exits 130, as before", async () => {
    const fake = makeFakeIo({ confirmAnswers: ["cancel"] });
    const code = await main([FIXTURE_A_URL], fake.io);
    expect(code).toBe(130);
    expect(transcriptOf(fake)).toEqual([
      ["stdout", "\n"],
      ["stdout", "Arctic Monkeys – 2025-08-23 – Ziggo Dome, Amsterdam\n"],
      ["stdout", "https://www.setlist.fm/setlist/arctic-monkeys/2025/ziggo-dome-amsterdam-netherlands-63a5e2b7.html\n"],
      ["stdout", "14 Performances, 2 Tapes\n"],
      ["stdout", "Warning: this Setlist looks incomplete: 1 Unknown Song.\n"],
      ["stdout", "The Setlist Playlist may not be the full Show.\n"],
      ["stdout", "\n"],
      ["prompt", 'Add the Tape "I Want It All" (Queen) to the playlist?'],
      ["stderr", "Cancelled.\n"],
    ]);
    expect(fake.events).toEqual([
      "setlistfm:getSetlist:63a5e2b7",
      'prompt:confirm:Add the Tape "I Want It All" (Queen) to the playlist?',
    ]);
  });
});
