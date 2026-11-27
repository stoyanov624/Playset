// Fakes for createRunServices (the real setlist.fm and Spotify modules wired together):
// a fake clock and sleep, a routing fake fetch that records every request with the fake time,
// and fake Spotify login callback receivers that can answer, hang until closed, and record closes.
// Response shapes follow setlist.fm REST 1.0 and the Spotify Web API / Accounts service.
// Nothing here reaches the network or opens a port.

export const NOW = 1795716000000;
export const SPOTIFY_CLIENT_ID = "3f9a0c2e7b4d4e1f8a6b5c4d3e2f1a0b";
export const SETLISTFM_API_KEY = "sfm-test-key-0f3c9a";
export const ACCESS_TOKEN = "BQDj8Zk2...access";
export const REFRESH_TOKEN = "AQCr7Yh1...refresh";
export const AUTH_CODE = "AQD3x9kLp2...Zq";
export const SCOPE = "playlist-modify-private playlist-modify-public playlist-read-private";

export const TOKEN_ENDPOINT = "https://accounts.spotify.com/api/token";

// ---------------------------------------------------------------- clock

export function makeFakeClock(start = NOW) {
  let time = start;
  const sleeps: number[] = [];
  return {
    now: () => time,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      time += ms;
    },
    advance(ms: number) {
      time += ms;
    },
    sleeps,
  };
}

// ---------------------------------------------------------------- fetch

export interface RecordedRequest {
  url: URL;
  method: string;
  headers: Headers;
  body: string | undefined;
  /** Fake clock time when the request was sent. */
  at: number;
}

export type Route = (request: RecordedRequest) => Response | Promise<Response>;

export const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });

/** A fake fetch that answers every request through `route` and records it. */
export function makeRoutedFetch(route: Route, clock: { now(): number }) {
  const requests: RecordedRequest[] = [];
  const fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
    const body = init?.body == null ? undefined : String(init.body);
    const request = { url, method, headers, body, at: clock.now() };
    requests.push(request);
    return route(request);
  };
  return { fetch, requests };
}

/** A route that fails the test on any request: nothing should be sent. */
export const noRequestExpected: Route = (request) => {
  throw new Error(`fake fetch: unexpected request to ${request.url}`);
};

// ---------------------------------------------------------------- Spotify responses

export function spotifyTrack(id: string, name: string, artist: string, album: string) {
  return {
    uri: `spotify:track:${id}`,
    id,
    name,
    artists: [{ name: artist }],
    album: { name: album },
  };
}

export const searchPayload = (...items: ReturnType<typeof spotifyTrack>[]) => ({ tracks: { items } });

export const codeExchangeBody = {
  access_token: ACCESS_TOKEN,
  token_type: "Bearer",
  scope: SCOPE,
  expires_in: 3600,
  refresh_token: REFRESH_TOKEN,
};

// ---------------------------------------------------------------- login receivers

export interface FakeReceiver {
  index: number;
  redirectUri: string;
  closed: boolean;
  closeCalls: number;
  /** Was every receiver started before this one already closed when this one started? */
  earlierAllClosedAtStart: boolean;
  waitForCallback(): Promise<Record<string, string>>;
  close(): Promise<void>;
}

/**
 * Fake `startCallbackReceiver`. `behaviour(i)` decides, per started receiver (0-based), whether it
 * answers like Spotify after the user approves ("approve": the code plus the state from the last
 * opened authorize URL) or "hang"s until it is closed (then its wait rejects, as a real receiver's does).
 */
export function makeFakeReceivers(behaviour: (index: number) => "approve" | "hang") {
  const receivers: FakeReceiver[] = [];
  const openedUrls: string[] = [];

  const openAuthorizeUrl = async (url: string) => {
    openedUrls.push(url);
  };

  const startCallbackReceiver = async (redirectUri: string): Promise<FakeReceiver> => {
    const index = receivers.length;
    let rejectWait: ((err: unknown) => void) | undefined;
    const receiver: FakeReceiver = {
      index,
      redirectUri,
      closed: false,
      closeCalls: 0,
      earlierAllClosedAtStart: receivers.every((r) => r.closed),
      waitForCallback: () => {
        if (receiver.closed) return Promise.reject(new Error("fake receiver: closed"));
        if (behaviour(index) === "approve") {
          const last = openedUrls.at(-1);
          const state = last ? new URL(last).searchParams.get("state") : null;
          return Promise.resolve({ code: AUTH_CODE, ...(state === null ? {} : { state }) });
        }
        return new Promise((_, reject) => {
          rejectWait = reject;
        });
      },
      close: async () => {
        receiver.closeCalls++;
        receiver.closed = true;
        rejectWait?.(new Error("fake receiver: closed while waiting"));
      },
    };
    receivers.push(receiver);
    return receiver;
  };

  return { receivers, openedUrls, openAuthorizeUrl, startCallbackReceiver };
}
