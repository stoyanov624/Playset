// createRunServices: the core builds the real RunServices (setlist.fm client, Spotify login,
// Match search, duplicate check, creation) from injected fetch / sleep / clock / settings store /
// callback receiver, so every front-end wires them the same way. Fakes only: no network, no port,
// no real config dir (every test passes an empty env and a memory settings store).
import { describe, expect, it, vi } from "vitest";
import {
  PlaysetError,
  createMemorySettingsStore,
  createRunServices,
  type ArtistCandidate,
  type Performance,
  type Show,
} from "../../src/core/index.js";
import { fixtureA, fixtureAShow, FIXTURE_A_PLAYLIST_NAME } from "./fixtures/setlists";
import { missingSetlistFmApiKeyError } from "./fixtures/typed-errors";
import { captureError } from "./fixtures/call-recorder";
import {
  ACCESS_TOKEN,
  NOW,
  REFRESH_TOKEN,
  SETLISTFM_API_KEY,
  SPOTIFY_CLIENT_ID,
  TOKEN_ENDPOINT,
  codeExchangeBody,
  json,
  makeFakeClock,
  makeFakeReceivers,
  makeRoutedFetch,
  noRequestExpected,
  searchPayload,
  spotifyTrack,
  type Route,
} from "./fixtures/real-service-fakes";

const TOKEN = "BQD-test-token";

const brianstorm = {
  position: 3,
  title: "Brianstorm",
  artist: "Arctic Monkeys",
  setLabel: "main",
  isTape: false,
} as unknown as Performance;

const untitled = {
  position: 1,
  title: "Untitled New Song",
  artist: "Muse",
  setLabel: "main",
  isTape: false,
} as unknown as Performance;

function setup(opts: {
  route?: Route;
  settings?: Parameters<typeof createMemorySettingsStore>[0];
  receivers?: (index: number) => "approve" | "hang";
} = {}) {
  const clock = makeFakeClock();
  const http = makeRoutedFetch(opts.route ?? noRequestExpected, clock);
  const login = makeFakeReceivers(opts.receivers ?? (() => "approve"));
  const settings = createMemorySettingsStore(opts.settings);
  const startCallbackReceiver = vi.fn(login.startCallbackReceiver);
  const build = () =>
    createRunServices({
      fetch: http.fetch,
      sleep: clock.sleep,
      now: clock.now,
      env: {},
      settings,
      startCallbackReceiver,
    });
  return { build, clock, http, login, settings, startCallbackReceiver };
}

const setlistFmRoute: Route = (request) => {
  if (request.url.hostname === "api.setlist.fm" && request.url.pathname.startsWith("/rest/1.0/setlist/")) {
    return json(200, fixtureA());
  }
  return json(404, { code: 404, status: "Not Found", message: "not found" });
};

// ---------------------------------------------------------------- setlist.fm

describe("createRunServices — the setlist.fm client", () => {
  it("building the services with no setlist.fm API key anywhere throws nothing and sends nothing", () => {
    const t = setup();
    expect(() => t.build()).not.toThrow();
    expect(t.http.requests).toEqual([]);
  });

  it("the missing-API-key error appears only when getSetlist is first called, with no request sent", async () => {
    const expected = await missingSetlistFmApiKeyError();
    const t = setup();
    const services = t.build();
    const err = await captureError(services.getSetlist("63a5e2b7"));
    expect(err).toBeInstanceOf(PlaysetError);
    expect((err as Error).constructor).toBe(expected.constructor);
    expect((err as Error).message).toBe(expected.message);
    expect(t.http.requests).toEqual([]);
  });

  it("the missing-API-key error appears only when the Artist lookup is first called, with no request sent", async () => {
    const expected = await missingSetlistFmApiKeyError();
    const t = setup();
    const services = t.build();
    const err = await captureError(services.findLatestSetlistByArtistName("Arctic Monkeys", async (c: ArtistCandidate[]) => c[0] ?? null));
    expect((err as Error).constructor).toBe(expected.constructor);
    expect(t.http.requests).toEqual([]);
  });

  it("uses the API key from the settings store and fetches the Setlist by id", async () => {
    const t = setup({ route: setlistFmRoute, settings: { settings: { setlistfmApiKey: SETLISTFM_API_KEY } } });
    const services = t.build();
    const setlist = await services.getSetlist("63a5e2b7");
    expect((setlist as unknown as { id: string }).id).toBe("63a5e2b7");
    expect(t.http.requests).toHaveLength(1);
    expect(t.http.requests[0]!.url.pathname).toBe("/rest/1.0/setlist/63a5e2b7");
    expect(t.http.requests[0]!.headers.get("x-api-key")).toBe(SETLISTFM_API_KEY);
  });

  it("two calls share one client: their setlist.fm requests are at least 500 ms apart on the fake clock", async () => {
    const t = setup({ route: setlistFmRoute, settings: { settings: { setlistfmApiKey: SETLISTFM_API_KEY } } });
    const services = t.build();
    await services.getSetlist("63a5e2b7");
    await services.getSetlist("63a5e2b7");
    const times = t.http.requests.map((r) => r.at);
    expect(times).toHaveLength(2);
    expect(times[0]).toBe(NOW);
    expect(times[1]! - times[0]!).toBeGreaterThanOrEqual(500);
  });

});

// ---------------------------------------------------------------- Match search

describe("createRunServices — findMatch", () => {
  it("searches Spotify with the given access token and returns the Match", async () => {
    const t = setup({
      route: (request) =>
        request.url.pathname === "/v1/search"
          ? json(200, searchPayload(spotifyTrack("2PYNLpcbVSE1hzFg4Ofmd9", "Brianstorm", "Arctic Monkeys", "Favourite Worst Nightmare")))
          : json(404, undefined),
    });
    const outcome = await t.build().findMatch(brianstorm, TOKEN);
    expect(outcome).toMatchObject({ kind: "match", uri: "spotify:track:2PYNLpcbVSE1hzFg4Ofmd9", name: "Brianstorm" });
    expect(t.http.requests.length).toBeGreaterThan(0);
    for (const request of t.http.requests) {
      expect(request.url.origin + request.url.pathname).toBe("https://api.spotify.com/v1/search");
      expect(request.headers.get("Authorization")).toBe(`Bearer ${TOKEN}`);
    }
    expect(t.http.requests[0]!.url.searchParams.get("q")).toBe('track:"Brianstorm" artist:"Arctic Monkeys"');
  });

  it("returns a Miss when Spotify finds nothing, still sending the given token", async () => {
    const t = setup({ route: () => json(200, searchPayload()) });
    const outcome = await t.build().findMatch(untitled, "BQD-other-token");
    expect(outcome.kind).toBe("miss");
    expect(t.http.requests.length).toBeGreaterThan(0);
    for (const request of t.http.requests) expect(request.headers.get("Authorization")).toBe("Bearer BQD-other-token");
  });
});

// ---------------------------------------------------------------- duplicate check and creation

describe("createRunServices — findPlaylistsNamed and createSetlistPlaylist", () => {
  it("findPlaylistsNamed lists the user's playlists with the given token and returns those with the name", async () => {
    const t = setup({
      route: (request) =>
        request.url.pathname === "/v1/me/playlists" && request.method === "GET"
          ? json(200, {
              items: [
                { id: "37i9dQZF1DXcBWIGoYBM5M", name: "Today's Top Hits", external_urls: { spotify: "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M" } },
                { id: "1AbCdEfGhIjKlMnOpQrStU", name: FIXTURE_A_PLAYLIST_NAME, external_urls: { spotify: "https://open.spotify.com/playlist/1AbCdEfGhIjKlMnOpQrStU" } },
              ],
              next: null,
            })
          : json(404, undefined),
    });
    const found = await t.build().findPlaylistsNamed(FIXTURE_A_PLAYLIST_NAME, TOKEN);
    expect(found.map((p: { id: string }) => p.id)).toEqual(["1AbCdEfGhIjKlMnOpQrStU"]);
    expect(t.http.requests).toHaveLength(1);
    expect(t.http.requests[0]!.headers.get("Authorization")).toBe(`Bearer ${TOKEN}`);
  });

  it("createSetlistPlaylist creates the playlist with the given token and visibility, adds the Matches and returns the share link", async () => {
    const id = "7GhIjKlMnOpQrStUvWxYzA";
    const t = setup({
      route: (request) => {
        if (request.url.pathname === "/v1/me/playlists" && request.method === "POST") {
          return json(201, {
            id,
            name: FIXTURE_A_PLAYLIST_NAME,
            public: false,
            uri: `spotify:playlist:${id}`,
            external_urls: { spotify: `https://open.spotify.com/playlist/${id}` },
          });
        }
        if (request.url.pathname === `/v1/playlists/${id}/items` && request.method === "POST") {
          return json(201, { snapshot_id: "AAAAAgAAAAA" });
        }
        return json(404, undefined);
      },
    });
    const matches = [
      { kind: "match", uri: "spotify:track:2PYNLpcbVSE1hzFg4Ofmd9", id: "2PYNLpcbVSE1hzFg4Ofmd9", name: "Brianstorm", artists: ["Arctic Monkeys"], album: "Favourite Worst Nightmare", live: false },
    ];
    const playlist = await t.build().createSetlistPlaylist(fixtureAShow as Show, matches as never, { accessToken: TOKEN, public: false });
    expect(playlist.shareUrl).toBe(`https://open.spotify.com/playlist/${id}`);
    const create = t.http.requests[0]!;
    expect(create.method).toBe("POST");
    expect(create.url.pathname).toBe("/v1/me/playlists");
    expect(create.headers.get("Authorization")).toBe(`Bearer ${TOKEN}`);
    expect(JSON.parse(create.body!)).toMatchObject({ name: FIXTURE_A_PLAYLIST_NAME, public: false });
    for (const request of t.http.requests) expect(request.headers.get("Authorization")).toBe(`Bearer ${TOKEN}`);
  });
});

// ---------------------------------------------------------------- Spotify login

const tokenRoute: Route = (request) =>
  request.url.toString() === TOKEN_ENDPOINT ? json(200, codeExchangeBody) : json(404, undefined);

describe("createRunServices — getAccessToken", () => {
  it("returns a still-valid cached token from the settings store without a login or a request", async () => {
    const t = setup({
      settings: {
        settings: { spotifyClientId: SPOTIFY_CLIENT_ID },
        tokens: { refreshToken: REFRESH_TOKEN, accessToken: ACCESS_TOKEN, expiresAt: NOW + 3_600_000 },
      },
    });
    const openAuthorizeUrl = vi.fn();
    const token = await t.build().getAccessToken({ openAuthorizeUrl, signal: undefined });
    expect(token).toBe(ACCESS_TOKEN);
    expect(openAuthorizeUrl).not.toHaveBeenCalled();
    expect(t.startCallbackReceiver).not.toHaveBeenCalled();
    expect(t.http.requests).toEqual([]);
  });

  it("does a full login with the client id from the settings store, closes the receiver and caches the tokens in the store", async () => {
    const t = setup({ route: tokenRoute, settings: { settings: { spotifyClientId: SPOTIFY_CLIENT_ID } } });
    const token = await t.build().getAccessToken({ openAuthorizeUrl: t.login.openAuthorizeUrl, signal: undefined });
    expect(token).toBe(ACCESS_TOKEN);
    expect(t.login.openedUrls).toHaveLength(1);
    expect(new URL(t.login.openedUrls[0]!).searchParams.get("client_id")).toBe(SPOTIFY_CLIENT_ID);
    expect(t.login.receivers).toHaveLength(1);
    expect(t.login.receivers[0]!.redirectUri).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/callback$/);
    expect(t.login.receivers[0]!.closed).toBe(true);
    expect((await t.settings.readSpotifyTokens())?.refreshToken).toBe(REFRESH_TOKEN);
  });

  it("a login aborted through the signal closes its receiver and rejects, with no token request", async () => {
    const t = setup({ route: tokenRoute, settings: { settings: { spotifyClientId: SPOTIFY_CLIENT_ID } }, receivers: () => "hang" });
    const controller = new AbortController();
    const pending = t.build().getAccessToken({ openAuthorizeUrl: t.login.openAuthorizeUrl, signal: controller.signal });
    const outcome = captureError(pending);
    await vi.waitFor(() => expect(t.login.openedUrls).toHaveLength(1));
    expect(t.login.receivers[0]!.closed).toBe(false);

    controller.abort();
    await vi.waitFor(() => expect(t.login.receivers[0]!.closed).toBe(true));
    expect(await outcome).toBeDefined();
    expect(t.http.requests).toEqual([]);
  });

  it("before a new login starts, a receiver still open from an earlier login is closed, so the port can be used again", async () => {
    const t = setup({
      route: tokenRoute,
      settings: { settings: { spotifyClientId: SPOTIFY_CLIENT_ID } },
      receivers: (index) => (index === 0 ? "hang" : "approve"),
    });
    const services = t.build();
    // The first login is left waiting (its caller went away without aborting).
    const first = captureError(services.getAccessToken({ openAuthorizeUrl: t.login.openAuthorizeUrl, signal: undefined }));
    await vi.waitFor(() => expect(t.login.openedUrls).toHaveLength(1));
    expect(t.login.receivers[0]!.closed).toBe(false);

    const token = await services.getAccessToken({ openAuthorizeUrl: t.login.openAuthorizeUrl, signal: undefined });
    expect(token).toBe(ACCESS_TOKEN);
    expect(t.login.receivers).toHaveLength(2);
    expect(t.login.receivers[0]!.closed).toBe(true);
    expect(t.login.receivers[1]!.earlierAllClosedAtStart).toBe(true);
    expect(t.login.receivers[1]!.redirectUri).toBe(t.login.receivers[0]!.redirectUri);
    expect(t.login.openedUrls).toHaveLength(2);
    await first;
  });

  it("after an aborted login, the next login on the same services starts normally", async () => {
    const t = setup({
      route: tokenRoute,
      settings: { settings: { spotifyClientId: SPOTIFY_CLIENT_ID } },
      receivers: (index) => (index === 0 ? "hang" : "approve"),
    });
    const services = t.build();
    const controller = new AbortController();
    const first = captureError(services.getAccessToken({ openAuthorizeUrl: t.login.openAuthorizeUrl, signal: controller.signal }));
    await vi.waitFor(() => expect(t.login.openedUrls).toHaveLength(1));
    controller.abort();
    await first;

    const token = await services.getAccessToken({ openAuthorizeUrl: t.login.openAuthorizeUrl, signal: undefined });
    expect(token).toBe(ACCESS_TOKEN);
    expect(t.login.receivers[1]!.earlierAllClosedAtStart).toBe(true);
  });
});
