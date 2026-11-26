/**
 * Hand-written fakes and fixtures for the Setlist Playlist tests (PRD 0006).
 * Shapes follow Spotify's Web API (`GET /v1/me/playlists`, `POST /v1/me/playlists`,
 * `POST /v1/playlists/{id}/items`) and PRD 0002's Show details / PRD 0003's Match.
 */
import type { Match } from "../../../src/core/matching";
import type { Show } from "../../../src/core/performances";

export const TOKEN = "BQD-test-token";

/** Fixture S — Show details (from PRD 0002, Fixture A). */
export const fixtureS: Show = {
  artist: "Arctic Monkeys",
  date: "2025-08-23",
  city: "Amsterdam",
  venue: "Ziggo Dome",
  url: "https://www.setlist.fm/setlist/arctic-monkeys/2025/ziggo-dome-amsterdam-netherlands-63a5e2b7.html",
};

export const FIXTURE_S_NAME = "Arctic Monkeys – 2025-08-23 – Amsterdam";
export const FIXTURE_S_DESCRIPTION =
  "Setlist from setlist.fm: https://www.setlist.fm/setlist/arctic-monkeys/2025/ziggo-dome-amsterdam-netherlands-63a5e2b7.html";

export function show(overrides: Partial<Show>): Show {
  return { ...fixtureS, ...overrides };
}

/** Builds a Match; only `uri` matters for this feature. */
export function match(uri: string, name = "Some Song"): Match {
  const id = uri.split(":").pop() ?? uri;
  return { kind: "match", uri, id, name, artists: ["Arctic Monkeys"], album: "Some Album", live: false };
}

/** E6 — four Matches in played order, with 505 played twice. */
export const e6Matches: Match[] = [
  match("spotify:track:4LRPiXqCikLlN15c3yImP7", "Sculptures of Anything Goes"),
  match("spotify:track:2x8evxqUlF0eRabbW2JBJd", "505"),
  match("spotify:track:5FVd6KXrgO9B3JPmC8OPst", "I Wanna Be Yours"),
  match("spotify:track:2x8evxqUlF0eRabbW2JBJd", "505"),
];

/** `spotify:track:T001` … `spotify:track:T<n>`; E7 sets Match 180 to repeat T007. */
export function numberedMatches(count: number, repeats: Record<number, number> = {}): Match[] {
  const matches: Match[] = [];
  for (let position = 1; position <= count; position++) {
    const source = repeats[position] ?? position;
    matches.push(match(`spotify:track:T${String(source).padStart(3, "0")}`));
  }
  return matches;
}

export const e7Matches = (): Match[] => numberedMatches(250, { 180: 7 });

export const E6_PLAYLIST_ID = "7GhIjKlMnOpQrStUvWxYzA";
export const E7_PLAYLIST_ID = "8HiJkLmNoPqRsTuVwXyZaB";

export function createdPlaylistBody(id: string, opts: { withExternalUrls?: boolean; isPublic?: boolean } = {}) {
  const body: Record<string, unknown> = {
    id,
    name: FIXTURE_S_NAME,
    description: FIXTURE_S_DESCRIPTION,
    public: opts.isPublic ?? false,
    collaborative: false,
    uri: `spotify:playlist:${id}`,
    href: `https://api.spotify.com/v1/playlists/${id}`,
    snapshot_id: "AAAAAQAAAAA",
  };
  if (opts.withExternalUrls ?? true) body.external_urls = { spotify: `https://open.spotify.com/playlist/${id}` };
  return body;
}

export const SNAPSHOT = { snapshot_id: "AAAAAgAAAAA" };

function playlistItem(id: string, name: string) {
  return { id, name, external_urls: { spotify: `https://open.spotify.com/playlist/${id}` } };
}

/** E3 — page 1 of the user's playlists. */
export const e3Page1 = {
  href: "https://api.spotify.com/v1/me/playlists?offset=0&limit=50",
  limit: 50,
  offset: 0,
  total: 53,
  next: "https://api.spotify.com/v1/me/playlists?offset=50&limit=50",
  previous: null,
  items: [
    playlistItem("37i9dQZF1DXcBWIGoYBM5M", "Today's Top Hits"),
    playlistItem("1AbCdEfGhIjKlMnOpQrStU", "Arctic Monkeys – 2025-08-23 – Amsterdam"),
    null,
    playlistItem("2BcDeFgHiJkLmNoPqRsTuV", "arctic monkeys – 2025-08-23 – amsterdam"),
    playlistItem("3CdEfGhIjKlMnOpQrStUvW", "Arctic Monkeys - 2025-08-23 - Amsterdam"),
  ],
};

/** E3 — page 2 (last) of the user's playlists. */
export const e3Page2 = {
  href: "https://api.spotify.com/v1/me/playlists?offset=50&limit=50",
  limit: 50,
  offset: 50,
  total: 53,
  next: null,
  previous: "https://api.spotify.com/v1/me/playlists?offset=0&limit=50",
  items: [
    playlistItem("4DeFgHiJkLmNoPqRsTuVwX", "Arctic Monkeys – 2025-08-23 – Amsterdam "),
    { id: "5EfGhIjKlMnOpQrStUvWxY" },
    playlistItem("6FgHiJkLmNoPqRsTuVwXyZ", "Arctic Monkeys – 2025-08-24 – Amsterdam"),
  ],
};

export interface RecordedRequest {
  url: string;
  method: string;
  headers: Headers;
  body: string | undefined;
}

export type FakeAnswer =
  | { status: number; body?: unknown; headers?: Record<string, string> }
  | { throws: Error };

/**
 * A fake fetch that answers from a queue of canned responses and records each request.
 * It also tracks how many requests were in flight at once (to prove requests are sequential).
 */
export function fakeFetch(answers: FakeAnswer[]) {
  const requests: RecordedRequest[] = [];
  const queue = [...answers];
  let inFlight = 0;
  const stats = { maxInFlight: 0 };
  const fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = input instanceof Request ? input.url : String(input);
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    const body = typeof init?.body === "string" ? init.body : init?.body == null ? undefined : String(init.body);
    requests.push({ url, method, headers, body });
    inFlight++;
    stats.maxInFlight = Math.max(stats.maxInFlight, inFlight);
    try {
      // Yield a few times so overlapping requests would be observed.
      for (let i = 0; i < 3; i++) await Promise.resolve();
      const answer = queue.shift();
      if (!answer) throw new Error("fake fetch: no more canned responses");
      if ("throws" in answer) throw answer.throws;
      return new Response(answer.body === undefined ? null : JSON.stringify(answer.body), {
        status: answer.status,
        headers: { "Content-Type": "application/json", ...(answer.headers ?? {}) },
      });
    } finally {
      inFlight--;
    }
  };
  return { fetch, requests, stats };
}

/** A fake sleeper that records requested waits (in milliseconds) and resolves at once. */
export function fakeSleep() {
  const waits: number[] = [];
  const sleep = async (ms: number): Promise<void> => {
    waits.push(ms);
  };
  return { sleep, waits };
}

export function jsonBody(request: RecordedRequest | undefined): unknown {
  if (!request?.body) return undefined;
  return JSON.parse(request.body);
}

/** Message, hint and the whole cause chain, joined — everything a user could see. */
export function errorText(err: unknown): string {
  const parts: string[] = [];
  let current: unknown = err;
  for (let depth = 0; current !== undefined && current !== null && depth < 10; depth++) {
    if (current instanceof Error) {
      const hint = (current as { hint?: unknown }).hint;
      parts.push(current.name, current.message, typeof hint === "string" ? hint : "", String(current));
      current = (current as { cause?: unknown }).cause;
    } else {
      parts.push(String(current));
      break;
    }
  }
  return parts.join("\n");
}

/** Finds the first error in the cause chain that is an instance of `type`. */
export function findInChain<T>(err: unknown, type: abstract new (...args: never[]) => T): T | undefined {
  let current: unknown = err;
  for (let depth = 0; current instanceof Error && depth < 10; depth++) {
    if (current instanceof type) return current as T;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

export async function captureError(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  throw new Error("Expected the promise to reject, but it resolved");
}

export function captureSyncError(run: () => unknown): unknown {
  try {
    run();
  } catch (err) {
    return err;
  }
  throw new Error("Expected the call to throw, but it returned");
}
