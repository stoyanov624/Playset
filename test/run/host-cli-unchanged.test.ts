// The CLI's run is unchanged by the Host steps (AC-22, example Z1): runPlayset over the
// real services the core builds (routed fake fetch, fake sleep, a cached Spotify token) sends the
// same requests in the same order whether or not the Setlist has a versionId, makes a new private
// Setlist Playlist after the duplicate-name check, and asks no Tape question. The rest of AC-22 is
// every existing run, CLI and shell test, unchanged and green.
//
// What these tests can NOT show: that the CLI "reads and writes no records and uses no cached
// preview". runPlayset takes no records at all, so there is no store here that it could touch; that
// part of AC-22 holds by construction (the type), not by anything asserted below. What is asserted is
// its visible consequence: every run sends its own Match searches, duplicate check and create.
import { describe, expect, it } from "vitest";
import { createMemorySettingsStore, createRunServices, type SetlistFmSetlist } from "../../src/core/index.js";
import { runPlayset } from "../../src/core/run/index.js";
import { makeFakeFrontEnd } from "./fixtures/fake-services";
import {
  NOW,
  REFRESH_TOKEN,
  SETLISTFM_API_KEY,
  SPOTIFY_CLIENT_ID,
  json,
  makeFakeClock,
  makeRoutedFetch,
  searchPayload,
  type Route,
} from "./fixtures/real-service-fakes";
import { H_DESCRIPTION, H_URL, H_V1_NAME, H_V1_URIS, PLAYLIST_ID, SHARE_URL, fixtureHv1, hostTracks, variant } from "./fixtures/host-setlists";

const CLI_TOKEN = "BQDcli-user-token";

function cliRun(setlist: SetlistFmSetlist) {
  const clock = makeFakeClock();
  const route: Route = (request) => {
    const path = request.url.pathname;
    if (request.url.hostname === "api.setlist.fm" && path === "/rest/1.0/setlist/2bf1c8e4") return json(200, setlist);
    if (path === "/v1/search") {
      const title = /track:"([^"]*)"/.exec(request.url.searchParams.get("q") ?? "")?.[1] ?? "";
      const track = hostTracks[title];
      return json(200, track ? searchPayload(track) : searchPayload());
    }
    if (path === "/v1/me/playlists" && request.method === "GET") {
      return json(200, { href: "https://api.spotify.com/v1/me/playlists?offset=0&limit=50", limit: 50, offset: 0, total: 0, items: [], next: null, previous: null });
    }
    if (path === "/v1/me/playlists" && request.method === "POST") {
      return json(201, { id: PLAYLIST_ID, name: H_V1_NAME, public: false, uri: `spotify:playlist:${PLAYLIST_ID}`, external_urls: { spotify: SHARE_URL } });
    }
    if (path === `/v1/playlists/${PLAYLIST_ID}/items` && request.method === "POST") return json(201, { snapshot_id: "AAAAAgAAAAA" });
    return json(404, { error: { status: 404, message: "Resource not found" } });
  };
  const http = makeRoutedFetch(route, clock);
  const services = createRunServices({
    fetch: http.fetch,
    sleep: clock.sleep,
    now: clock.now,
    env: {},
    settings: createMemorySettingsStore({
      settings: { setlistfmApiKey: SETLISTFM_API_KEY, spotifyClientId: SPOTIFY_CLIENT_ID },
      tokens: { refreshToken: REFRESH_TOKEN, accessToken: CLI_TOKEN, expiresAt: NOW + 3_600_000 },
    }),
    startCallbackReceiver: async () => {
      throw new Error("no login expected");
    },
  });
  const events: string[] = [];
  const ui = makeFakeFrontEnd({ confirm: true, tapeAnswers: [] }, events);
  const run = () =>
    runPlayset({
      input: H_URL,
      options: { tapes: "ask", confirm: "ask", public: false, dryRun: false },
      frontEnd: ui.frontEnd,
      services,
    });
  return { run, http, events, record: ui.record };
}

const requestLines = (requests: ReturnType<typeof cliRun>["http"]["requests"]) =>
  requests.map((r) => `${r.method} ${r.url.origin}${r.url.pathname}${r.url.search} ${r.body ?? ""}`);

describe("the CLI run is unchanged (Z1)", () => {
  it("AC-22: Fixture H v1 by link → GET setlist, 3 Match searches, the duplicate check, a private create, add items; no Tape question", async () => {
    const t = cliRun(fixtureHv1());
    const outcome = await t.run();
    if (outcome.kind !== "created") throw new Error(`expected a created Setlist Playlist, got "${outcome.kind}"`);
    expect(outcome.playlist).toEqual({ id: PLAYLIST_ID, shareUrl: SHARE_URL, name: H_V1_NAME, trackCount: 3 });
    expect(t.record.tapeQuestions).toEqual([]);

    const requests = t.http.requests;
    expect(`${requests[0]!.method} ${requests[0]!.url.origin}${requests[0]!.url.pathname}`).toBe(
      "GET https://api.setlist.fm/rest/1.0/setlist/2bf1c8e4",
    );
    const spotify = requests.slice(1).filter((r) => r.url.pathname !== "/v1/search");
    const lastSearch = requests.map((r) => r.url.pathname).lastIndexOf("/v1/search");
    const firstPlaylist = requests.findIndex((r) => r.url.hostname === "api.spotify.com" && r.url.pathname !== "/v1/search");
    expect(lastSearch).toBeLessThan(firstPlaylist);
    const searched = requests
      .filter((r) => r.url.pathname === "/v1/search")
      .map((r) => /track:"([^"]*)"/.exec(r.url.searchParams.get("q") ?? "")?.[1]);
    expect(searched.filter((title, i) => title !== searched[i - 1])).toEqual(["Release", "Even Flow", "Alive"]);

    expect(spotify.map((r) => `${r.method} ${r.url.pathname}`)).toEqual([
      "GET /v1/me/playlists",
      "POST /v1/me/playlists",
      `POST /v1/playlists/${PLAYLIST_ID}/items`,
    ]);
    expect(spotify[0]!.url.searchParams.get("limit")).toBe("50");
    expect(JSON.parse(spotify[1]!.body!)).toEqual({ name: H_V1_NAME, description: H_DESCRIPTION, public: false });
    expect(JSON.parse(spotify[2]!.body!)).toEqual({ uris: H_V1_URIS });
    for (const r of spotify) expect(r.headers.get("Authorization")).toBe(`Bearer ${CLI_TOKEN}`);
    expect(requests.some((r) => r.method === "PUT")).toBe(false);
  });

  it("AC-22: the same Setlist without a versionId gives the same requests, front-end calls and outcome", async () => {
    const withVersion = cliRun(fixtureHv1());
    const withoutVersion = cliRun(variant(fixtureHv1(), { versionId: undefined }));
    const a = await withVersion.run();
    const b = await withoutVersion.run();
    expect(b).toEqual(a);
    expect(requestLines(withoutVersion.http.requests)).toEqual(requestLines(withVersion.http.requests));
    expect(withoutVersion.events).toEqual(withVersion.events);
  });

  it("AC-22: two runs of the same Setlist make two new Setlist Playlists: each run searches again and sends its own duplicate check and create", async () => {
    const t = cliRun(fixtureHv1());
    await t.run();
    await t.run();
    const creates = t.http.requests.filter((r) => r.method === "POST" && r.url.pathname === "/v1/me/playlists");
    const checks = t.http.requests.filter((r) => r.method === "GET" && r.url.pathname === "/v1/me/playlists");
    const searches = t.http.requests.filter((r) => r.url.pathname === "/v1/search");
    expect(creates).toHaveLength(2);
    expect(checks).toHaveLength(2);
    // Nothing of the first run's preview is reused by the second.
    expect(searches).toHaveLength(6);
  });
});
