// PRD 0012 — the steps with the run's services: the real services the core builds also search
// Artists without a chooser and fetch one Setlist page (AC-1, AC-4); getSetlist and
// findLatestSetlist need only their own service (AC-9, AC-10); and runPlayset still works with
// services that have only today's services (AC-19 to AC-21). The rest of AC-19 to AC-21 is covered
// by the existing run, CLI and shell suites, which must stay green and unchanged.
import { describe, expect, it } from "vitest";
import {
  createMemorySettingsStore,
  createRunServices,
  type ArtistCandidate,
} from "../../src/core/index.js";
import { findArtists, findLatestSetlist, getSetlist, listSetlists, runPlayset } from "../../src/core/run/index.js";
import { captureError } from "./fixtures/call-recorder";
import { makeFakeFrontEnd, makeFakeServices } from "./fixtures/fake-services";
import {
  PORTLAND_URIS,
  pearlJamOutcomes,
  pearlJamPortland,
  pearlJamVancouver,
  portlandShow,
} from "./fixtures/incomplete-setlists";
import { artistNotFoundError, missingSetlistFmApiKeyError } from "./fixtures/typed-errors";
import { NOW, SETLISTFM_API_KEY, json, makeFakeClock, makeRoutedFetch, type Route } from "./fixtures/real-service-fakes";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const setlistFmFixtures = join(dirname(fileURLToPath(import.meta.url)), "..", "setlistfm", "fixtures");
const readSetlistFm = (file: string) => JSON.parse(readFileSync(join(setlistFmFixtures, file), "utf8"));

const PEARL_JAM_MBID = "83b9cbe7-9857-49e2-ab8e-b57b01038103";

function realServices(route: Route, apiKey: string | undefined = SETLISTFM_API_KEY) {
  const clock = makeFakeClock();
  const http = makeRoutedFetch(route, clock);
  const services = createRunServices({
    fetch: http.fetch,
    sleep: clock.sleep,
    now: clock.now,
    env: {},
    settings: createMemorySettingsStore(apiKey === undefined ? undefined : { settings: { setlistfmApiKey: apiKey } }),
    startCallbackReceiver: async () => {
      throw new Error("no login expected");
    },
  } as never);
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
    expect(http.requests.map((r) => r.url.pathname)).toEqual(["/rest/1.0/search/artists"]);
    expect(http.requests[0]!.headers.get("x-api-key")).toBe(SETLISTFM_API_KEY);
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
    expect(http.requests[1]!.headers.get("x-api-key")).toBe(SETLISTFM_API_KEY);
    expect(http.requests[0]!.at).toBe(NOW);
    expect(http.requests[1]!.at - http.requests[0]!.at).toBeGreaterThanOrEqual(500);
  });

  it("AC-3, AC-6: without an API key the new services raise the missing-API-key error on first use, with no request", async () => {
    const expected = await missingSetlistFmApiKeyError();
    const { services, http } = realServices(pearlJamRoute, undefined);
    const findErr = await captureError(findArtists(services, "Pearl Jam"));
    expect((findErr as Error).constructor).toBe(expected.constructor);
    const listErr = await captureError(listSetlists(services, PEARL_JAM_MBID, 1));
    expect((listErr as Error).constructor).toBe(expected.constructor);
    expect(http.requests).toEqual([]);
  });
});

// ---------------------------------------------------------------- AC-9, AC-10 with only their own service

describe("getSetlist and findLatestSetlist with fake services", () => {
  it("AC-9: a services object with only getSetlist is enough; the Setlist comes back unchanged", async () => {
    const fake = makeFakeServices({ setlist: pearlJamPortland() });
    const services = { getSetlist: (fake.services as unknown as Record<string, unknown>).getSetlist };
    const setlist = await getSetlist(services as never, "2bf1c8e4");
    expect(setlist).toEqual(pearlJamPortland());
    expect(fake.calls.getSetlist).toEqual(["2bf1c8e4"]);
  });

  it("AC-10: passes the name, the chooser and the complete-alternative option to the lookup and returns its result", async () => {
    const fake = makeFakeServices({ setlist: pearlJamPortland(), completeAlternative: pearlJamVancouver() });
    const services = {
      findLatestSetlistByArtistName: (fake.services as unknown as Record<string, unknown>).findLatestSetlistByArtistName,
    };
    const chooser = async (c: ArtistCandidate[]) => c[0] ?? null;
    const result = await findLatestSetlist(services as never, "Pearl Jam", chooser, { wantCompleteAlternative: true });
    expect(fake.calls.findLatest).toEqual(["Pearl Jam"]);
    expect(fake.calls.findLatestOptions[0]?.wantCompleteAlternative).toBe(true);
    expect(result.artist).toEqual({ name: "Pearl Jam", mbid: PEARL_JAM_MBID });
    expect(result.setlist).toEqual(pearlJamPortland());
    expect(result.completeAlternative).toEqual(pearlJamVancouver());

    const without = await findLatestSetlist(services as never, "Pearl Jam", chooser, { wantCompleteAlternative: false });
    expect(without.completeAlternative ?? null).toBeNull();
  });

  it("AC-10: an error from the lookup is passed on unchanged", async () => {
    const notFound = await artistNotFoundError();
    const fake = makeFakeServices({ fail: { findLatestSetlistByArtistName: notFound } });
    const err = await captureError(findLatestSetlist(fake.services, "Xyzzq Nonexistent", async () => null, {}));
    expect(err).toBe(notFound);
  });
});

// ---------------------------------------------------------------- AC-19 to AC-21

describe("runPlayset on the steps (Z1)", () => {
  it("AC-19, AC-20, AC-21: a whole core run with only today's services completes with C1's records and touches no other service", async () => {
    const events: string[] = [];
    const fake = makeFakeServices(
      { setlist: pearlJamPortland(), completeAlternative: pearlJamVancouver(), outcomes: pearlJamOutcomes, duplicates: [] },
      events,
    );
    const todays = new Set([
      "getSetlist",
      "findLatestSetlistByArtistName",
      "getAccessToken",
      "findMatch",
      "findPlaylistsNamed",
      "createSetlistPlaylist",
    ]);
    const touched = new Set<string>();
    const services = new Proxy(fake.services as unknown as Record<string, unknown>, {
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
      services: services as never,
    });

    expect(outcome.kind).toBe("created");
    const created = outcome as unknown as { playlist: { trackCount: number }; misses: unknown[]; incompleteStatus: unknown };
    expect(created.playlist.trackCount).toBe(3);
    expect(created.misses).toEqual([]);
    expect(created.incompleteStatus).toEqual({ isIncomplete: true, unknownSongCount: 1 });
    expect([...touched].filter((name) => !todays.has(name) && name !== "then")).toEqual([]);
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
    expect(fake.calls.create[0]!.show).toEqual(portlandShow);
    expect(fake.calls.create[0]!.matches.map((m) => m.uri)).toEqual(PORTLAND_URIS);
  });
});
