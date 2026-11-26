// Real typed errors from PRDs 0001–0006, produced by calling the merged modules with fakes
// (fake fetch, fake sleep, empty temp config dirs, a blocked loopback port). Nothing here
// reaches the network: every fetch is answered by a canned Spotify / setlist.fm response.
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readSetlistId } from "../../../src/core/setlist-link/index.js";
import { createSpotifyTrackSearch } from "../../../src/core/matching";
import { createSetlistPlaylist } from "../../../src/core/setlist-playlist";
import { createSetlistFmClient, resolveSetlistFmApiKey } from "../../../src/core/setlistfm";
import {
  getAccessToken,
  resolveClientId,
  resolveRedirectUri,
  startLoopbackReceiver,
} from "../../../src/core/spotify-auth";
import { GENESIS_CANDIDATES, fixtureAShow } from "./setlists";
import { SETLISTFM_API_KEY, SPOTIFY_CLIENT_ID, TOKEN, match } from "./fake-services";

type Answer = () => Response;

const json = (status: number, body: unknown, headers: Record<string, string> = {}): Answer => () =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });

/** A fake fetch: answers from the script in order, repeating the last answer when it runs out. */
function scriptedFetch(script: Answer[]) {
  let i = 0;
  return async (_input: string | URL | Request, _init?: RequestInit): Promise<Response> => {
    const answer = script[Math.min(i, script.length - 1)];
    i++;
    if (!answer) throw new Error("fake fetch: no answer");
    return answer();
  };
}

const noSleep = async (_ms: number): Promise<void> => {};
const fixedNow = () => 1795716000000;

async function capture(work: () => unknown): Promise<Error> {
  try {
    await work();
  } catch (err) {
    return err as Error;
  }
  throw new Error("expected the call to fail, but it succeeded");
}

async function withTempConfigDir<T>(work: (configDir: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), "playset-run-test-"));
  try {
    return await work(join(root, "playset"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function setlistFmClient(script: Answer[]) {
  return createSetlistFmClient({
    fetch: scriptedFetch(script),
    sleep: noSleep,
    now: fixedNow,
    env: { SETLISTFM_API_KEY },
  });
}

const genesisSearch = {
  type: "artists",
  itemsPerPage: 30,
  page: 1,
  total: 3,
  artist: GENESIS_CANDIDATES.map((c) => ({ ...c, sortName: c.name, url: "https://www.setlist.fm/setlists/x.html" })),
};

const arcticSearch = {
  type: "artists",
  itemsPerPage: 30,
  page: 1,
  total: 1,
  artist: [{ mbid: "ada7a83c-e3e1-40f1-93f9-3e73dbfd2c7c", name: "Arctic Monkeys", sortName: "Arctic Monkeys" }],
};

const setlistFmNotFound = json(404, { code: 404, status: "Not Found", message: "not found" });

// ---------------------------------------------------------------- PRD 0001

export const notASetlistPageLink = "https://www.setlist.fm/setlists/arctic-monkeys-63d6a6b7.html";
export const missingIdLink = "https://www.setlist.fm/setlist/radiohead/2025/o2-arena-london-england.html";

export const setlistLinkError = (link: string) => capture(() => readSetlistId(link));

// ---------------------------------------------------------------- PRD 0005

export const missingSetlistFmApiKeyError = () =>
  withTempConfigDir((configDir) => capture(() => resolveSetlistFmApiKey({ env: {}, configDir })));

export const artistNotFoundError = () =>
  capture(() =>
    setlistFmClient([setlistFmNotFound]).findLatestSetlistByArtistName("Xyzzq Nonexistent", async () => null),
  );

export const artistChoiceCancelledError = () =>
  capture(() => setlistFmClient([json(200, genesisSearch)]).findLatestSetlistByArtistName("Genesis", async () => null));

export const noSetlistError = () =>
  capture(() =>
    setlistFmClient([json(200, arcticSearch), setlistFmNotFound]).findLatestSetlistByArtistName(
      "Arctic Monkeys",
      async (c) => c[0] ?? null,
    ),
  );

export const setlistNotFoundError = () => capture(() => setlistFmClient([setlistFmNotFound]).getSetlist("deadbeef"));

export const setlistFmRateLimitError = () =>
  capture(() =>
    setlistFmClient([json(429, { code: 429, status: "Too Many Requests" }, { "Retry-After": "1" })]).getSetlist(
      "63a5e2b7",
    ),
  );

export const setlistFmRequestError = () =>
  capture(() => setlistFmClient([() => new Response("", { status: 503 })]).getSetlist("63a5e2b7"));

// ---------------------------------------------------------------- PRD 0004

export const missingClientIdError = () =>
  withTempConfigDir((configDir) => capture(() => resolveClientId({ env: {}, configDir })));

export const invalidPortError = () => capture(() => resolveRedirectUri({ PLAYSET_AUTH_PORT: "abc" }));

export async function portInUseError(): Promise<Error> {
  const blocker = createServer();
  await new Promise<void>((resolve) => blocker.listen(0, "127.0.0.1", () => resolve()));
  const port = (blocker.address() as AddressInfo).port;
  try {
    return await capture(() => startLoopbackReceiver(`http://127.0.0.1:${port}/callback`));
  } finally {
    await new Promise<void>((resolve) => blocker.close(() => resolve()));
  }
}

function loginDeps(configDir: string, fetchScript: Answer[], callback: (state: string | null) => Record<string, string>) {
  let openedUrl: string | null = null;
  return {
    configDir,
    env: { SPOTIFY_CLIENT_ID },
    fetch: scriptedFetch(fetchScript),
    sleep: noSleep,
    now: fixedNow,
    openAuthorizeUrl: async (url: string) => {
      openedUrl = url;
    },
    startCallbackReceiver: async (_redirectUri: string) => ({
      waitForCallback: async () => callback(openedUrl ? new URL(openedUrl).searchParams.get("state") : null),
      close: async () => {},
    }),
  };
}

export const accessDeniedError = () =>
  withTempConfigDir((configDir) =>
    capture(() =>
      getAccessToken(
        loginDeps(configDir, [json(200, {})], (state) => ({ error: "access_denied", ...(state ? { state } : {}) })) as never,
      ),
    ),
  );

export const tokenError = () =>
  withTempConfigDir((configDir) =>
    capture(() =>
      getAccessToken(
        loginDeps(
          configDir,
          [json(400, { error: "invalid_grant", error_description: "Invalid authorization code" })],
          (state) => ({ code: "AQD3x9kLp2...Zq", ...(state ? { state } : {}) }),
        ) as never,
      ),
    ),
  );

// ---------------------------------------------------------------- PRD 0003

export const spotifySearchError = () =>
  capture(() =>
    createSpotifyTrackSearch({ accessToken: TOKEN, fetch: scriptedFetch([json(500, undefined)]), sleep: noSleep }).searchTracks(
      'track:"Don\'t Sit Down \'Cause I\'ve Moved Your Chair" artist:"Arctic Monkeys"',
      10,
    ),
  );

export const spotifySearchRateLimitError = () =>
  capture(() =>
    createSpotifyTrackSearch({
      accessToken: TOKEN,
      fetch: scriptedFetch([json(429, { error: { status: 429 } }, { "Retry-After": "1" })]),
      sleep: noSleep,
    }).searchTracks('track:"505" artist:"Arctic Monkeys"', 10),
  );

// ---------------------------------------------------------------- PRD 0006

const oneMatch = [match("2x8evxqUlF0eRabbW2JBJd", "505", "Arctic Monkeys", "Favourite Worst Nightmare")];

export const playlistRateLimitError = () =>
  capture(() =>
    createSetlistPlaylist(fixtureAShow, oneMatch, {
      accessToken: TOKEN,
      fetch: scriptedFetch([json(429, undefined, { "Retry-After": "1" })]),
      sleep: noSleep,
    }),
  );

export const spotifyPlaylistError = () =>
  capture(() =>
    createSetlistPlaylist(fixtureAShow, oneMatch, {
      accessToken: TOKEN,
      fetch: scriptedFetch([json(401, { error: { status: 401, message: "The access token expired" } })]),
      sleep: noSleep,
    }),
  );

/** E16 — create succeeds, batch 1 (100) is added, batch 2 fails with 400 "Invalid base62 id". */
export const PARTLY_CREATED_ID = "8HiJkLmNoPqRsTuVwXyZaB";
export const PARTLY_CREATED_SHARE_URL = "https://open.spotify.com/playlist/8HiJkLmNoPqRsTuVwXyZaB";
export const partlyCreatedPlaylistError = () => {
  const matches = Array.from({ length: 250 }, (_, i) =>
    match(`T${String(i + 1).padStart(3, "0")}`, `Song ${i + 1}`, "Arctic Monkeys", "Some Album"),
  );
  const created = {
    id: PARTLY_CREATED_ID,
    name: "Arctic Monkeys – 2025-08-23 – Amsterdam",
    public: false,
    external_urls: { spotify: PARTLY_CREATED_SHARE_URL },
  };
  let i = 0;
  const answers = [
    json(201, created),
    json(201, { snapshot_id: "AAAAAgAAAAA" }),
    json(400, { error: { status: 400, message: "Invalid base62 id" } }),
  ];
  return capture(() =>
    createSetlistPlaylist(fixtureAShow, matches, {
      accessToken: TOKEN,
      fetch: async () => (answers[Math.min(i++, answers.length - 1)] as Answer)(),
      sleep: noSleep,
    }),
  );
};
