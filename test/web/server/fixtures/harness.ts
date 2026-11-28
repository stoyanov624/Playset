// The web app under test, built with createApp and fakes of everything it is given:
// - the core's real services (createRunServices) over a routed fake fetch that plays setlist.fm
//   REST 1.0 and the Spotify Web API, with a fake sleep, so every core rule and error is the real one;
//   the Match search is wrapped so tests can count it, hold it at a gate or replace one answer;
// - the core's in-memory records, a fake usage-event store and a fake rate-limit hit counter;
// - a Host token source that is connected, not connected or failing;
// - a settable clock and a logger that keeps every call.
// Nothing here reaches the network: the only fetch is the routed fake one.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { request as httpRequest, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { afterAll, expect } from "vitest";
import {
  createMemorySetlistPlaylistRecords,
  createMemorySettingsStore,
  createRunServices,
  type MatchOutcome,
  type Performance,
  type SetlistFmSetlist,
  type SetlistPlaylistRecords,
} from "../../../../src/core/index.js";
import { HttpError, createRequester, type RequestPolicy } from "../../../../src/core/http/index.js";
import { createApp, readWebConfig, type WebServices } from "../../../../src/web/server/index.js";
import { makeFakeClock, makeRoutedFetch, type RecordedRequest } from "../../../run/fixtures/real-service-fakes";
import {
  PARTLY_ID,
  PLAYLIST_ID,
  NEW_PLAYLIST_ID,
  defaultSetlists,
  defaultTracks,
  type SpotifyTrack,
} from "./setlists";

// ---------------------------------------------------------------- secrets, env, addresses

export const SETLISTFM_KEY = "sfm-test-key-0f3c9a";
export const CLIENT_ID = "3f9c2a7e5b1d4c8fa6e0b2d4c6a8e1f3";
export const HOST_ID = "31abcxyzhost";
export const COOKIE_SECRET = "test-cookie-secret-7d1f0c9b2e8a4f6d5c3b1a09";
export const HOST_TOKEN = "BQDhost-test-token";

export const REQUIRED_ENV = {
  SETLISTFM_API_KEY: SETLISTFM_KEY,
  SPOTIFY_CLIENT_ID: CLIENT_ID,
  PLAYSET_HOST_SPOTIFY_ID: HOST_ID,
  PLAYSET_COOKIE_SECRET: COOKIE_SECRET,
};

/** The examples' env: the four required values and one trusted proxy hop (so tests set addresses). */
export const BASE_ENV: Record<string, string> = { ...REQUIRED_ENV, PLAYSET_TRUST_PROXY: "1" };

export const A = "203.0.113.7";
export const B = "198.51.100.4";
export const C = "192.0.2.44";
export const ADDRESSES = [A, B, C];

/** Strings that may never reach a Visitor: secrets, env names, stack frames, Spotify URIs, Miss queries. */
export const NEVER_SENT = [
  SETLISTFM_KEY,
  CLIENT_ID,
  COOKIE_SECRET,
  HOST_ID,
  HOST_TOKEN,
  "SETLISTFM_API_KEY",
  "SPOTIFY_CLIENT_ID",
  "PLAYSET_",
  "at Object.",
  "spotify:track:",
  "queries",
];

export const SECRETS = [SETLISTFM_KEY, CLIENT_ID, COOKIE_SECRET, HOST_ID, HOST_TOKEN];

export const TODAY = "2026-11-28";
export const NOW_ISO = "2026-11-28T14:30:00.000Z";

// ---------------------------------------------------------------- fake HTTP answers

export type Answer = () => Response | Promise<Response>;

export const json = (status: number, body?: unknown, headers: Record<string, string> = {}) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
export const answer = (status: number, body?: unknown, headers: Record<string, string> = {}): Answer => () =>
  json(status, body, headers);
export const networkFailure: Answer = () =>
  Promise.reject(
    Object.assign(new TypeError("fetch failed"), {
      cause: Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" }),
    }),
  );
export const setlistFmNotFound: Answer = answer(404, { code: 404, status: "Not Found", message: "not found" });
export const setlistFmRateLimited: Answer = answer(429, { code: 429, status: "Too Many Requests" }, { "Retry-After": "1" });
export const spotifyRateLimited: Answer = answer(
  429,
  { error: { status: 429, message: "API rate limit exceeded" } },
  { "Retry-After": "2" },
);
export const spotifyStatus = (status: number, message = "Server error"): Answer => answer(status, { error: { status, message } });

// ---------------------------------------------------------------- gates and small helpers

/** Holds every caller at `pass()` until the test calls `release()`. */
export function makeGate() {
  let open = false;
  let release!: () => void;
  const opened = new Promise<void>((resolve) => {
    release = resolve;
  });
  const state = { waiting: 0, passed: 0 };
  return {
    state,
    async pass() {
      if (!open) {
        state.waiting++;
        await opened;
        state.waiting--;
      }
      state.passed++;
    },
    release() {
      open = true;
      release();
    },
  };
}
export type Gate = ReturnType<typeof makeGate>;

/** Lets pending callbacks run (real time). */
export const flush = (ms = 30) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Waits (real time) until `check` is true. */
export async function waitUntil(check: () => boolean, what: string, ms = 3000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > ms) throw new Error(`timed out waiting for ${what}`);
    await flush(5);
  }
}

/** Everything a log call carries as text: message, details, errors with their stacks and causes. */
export function textOf(value: unknown, depth = 0): string {
  if (depth > 8 || value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (value instanceof Error) {
    const hint = (value as { hint?: unknown }).hint;
    return [
      value.name,
      value.message,
      value.stack ?? "",
      typeof hint === "string" ? hint : "",
      textOf((value as { cause?: unknown }).cause, depth + 1),
      JSON.stringify(Object.fromEntries(Object.entries(value))),
    ].join("\n");
  }
  try {
    return JSON.stringify(value, (_key, v: unknown) => (v instanceof Error ? textOf(v, depth + 1) : v)) ?? String(value);
  } catch {
    return String(value);
  }
}

// ---------------------------------------------------------------- logger

export type LogLevel = "info" | "warn" | "error";
export interface LogCall {
  level: LogLevel;
  message: string;
  details: unknown;
}

export function makeLogger() {
  const calls: LogCall[] = [];
  const at = (level: LogLevel) => (message: string, details?: unknown) => {
    calls.push({ level, message, details });
  };
  return {
    logger: { info: at("info"), warn: at("warn"), error: at("error") },
    calls,
    of: (level: LogLevel) => calls.filter((c) => c.level === level),
    textOf: (call: LogCall) => `${call.message}\n${textOf(call.details)}`,
    allText: () => calls.map((c) => `${c.message}\n${textOf(c.details)}`).join("\n"),
  };
}

// ---------------------------------------------------------------- usage events and hit counter fakes

export interface UsageEvent {
  kind: "created" | "updated" | "opened";
  setlistId: string;
  artist: string;
  day: string;
}

export function makeFakeEvents() {
  const recorded: UsageEvent[] = [];
  return {
    recorded,
    events: {
      async recordEvent(event: UsageEvent): Promise<void> {
        recorded.push({ ...event });
      },
      async countPlaylistsMade(day: string): Promise<number> {
        return recorded.filter((e) => e.day === day && (e.kind === "created" || e.kind === "updated")).length;
      },
    },
  };
}

export function makeFakeHits() {
  const added: string[] = [];
  return {
    added,
    add(day: string): void {
      added.push(day);
    },
    count(day: string): number {
      return added.filter((d) => d === day).length;
    },
  };
}

// ---------------------------------------------------------------- client folder

let defaultClientDir: string | undefined;

/** Every temporary folder a test file made; removed once the file's tests have run. */
const tempDirs: string[] = [];
afterAll(() => {
  while (tempDirs.length > 0) rmSync(tempDirs.pop()!, { recursive: true, force: true });
  defaultClientDir = undefined;
});

/** An empty temporary folder (a client folder with no build in it), removed after the file's tests. */
export function makeEmptyDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "playset-web-empty-"));
  tempDirs.push(dir);
  return dir;
}

export const INDEX_HTML =
  '<!doctype html><html><head><script type="module" src="/assets/index-4f2a9c1b.js"></script></head><body><div id="root"></div></body></html>';
export const ASSET_JS = 'console.log("playset")';

/** A built client folder: index.html and assets/index-4f2a9c1b.js. */
export function makeClientDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "playset-web-client-"));
  tempDirs.push(dir);
  writeFileSync(join(dir, "index.html"), INDEX_HTML);
  mkdirSync(join(dir, "assets"));
  writeFileSync(join(dir, "assets", "index-4f2a9c1b.js"), ASSET_JS);
  return dir;
}

export function sharedClientDir(): string {
  defaultClientDir ??= makeClientDir();
  return defaultClientDir;
}

// ---------------------------------------------------------------- the harness

export type HostMode = { kind: "connected"; token: string } | { kind: "absent" } | { kind: "rejects"; error: unknown };

type SetlistSource = SetlistFmSetlist | Answer;

export interface HarnessOptions {
  /** Extra env on top of BASE_ENV (or instead, with `replaceEnv`). */
  env?: Record<string, string>;
  setlists?: Record<string, SetlistSource>;
  records?: SetlistPlaylistRecords;
  events?: ReturnType<typeof makeFakeEvents>["events"];
  now?: string;
  clientDir?: string;
  /** null: the core's services have no setlist.fm key. */
  setlistFmKey?: string | null;
  host?: HostMode;
}

export function makeHarness(opts: HarnessOptions = {}) {
  const config = readWebConfig({ ...BASE_ENV, ...opts.env });

  // setlist.fm
  const setlists: Record<string, SetlistSource> = { ...defaultSetlists(), ...opts.setlists };
  const artistSearches: Record<string, unknown> = {};
  const setlistPages: Record<string, unknown> = {};

  // Spotify
  const spotify = {
    tracks: defaultTracks() as Record<string, SpotifyTrack>,
    /** Answers for Match searches of a title (every search request for that title). */
    failSearch: {} as Record<string, Answer>,
    /** Answers by index among the playlist requests (every Spotify request but searches), 0-based. */
    playlistAnswers: {} as Record<number, Answer>,
    createdIds: [PLAYLIST_ID, NEW_PLAYLIST_ID, PARTLY_ID],
    deleted: new Set<string>(),
    /** When set, every create request (POST /v1/me/playlists) waits here. */
    createGate: undefined as Gate | undefined,
  };
  let playlistIndex = 0;

  const coreClock = makeFakeClock();
  const route = async (r: RecordedRequest): Promise<Response> => {
    const path = r.url.pathname;
    if (r.url.hostname === "api.setlist.fm") {
      const setlistMatch = /^\/rest\/1\.0\/setlist\/([^/]+)$/.exec(path);
      if (setlistMatch) {
        const source = setlists[setlistMatch[1]!];
        if (typeof source === "function") return source();
        return source === undefined ? setlistFmNotFound() : json(200, structuredClone(source));
      }
      if (path === "/rest/1.0/search/artists") {
        const source = artistSearches[r.url.searchParams.get("artistName") ?? ""];
        if (typeof source === "function") return (source as Answer)();
        return source === undefined ? setlistFmNotFound() : json(200, structuredClone(source));
      }
      const pageMatch = /^\/rest\/1\.0\/artist\/([^/]+)\/setlists$/.exec(path);
      if (pageMatch) {
        const source = setlistPages[`${pageMatch[1]}?p=${r.url.searchParams.get("p") ?? "1"}`];
        if (typeof source === "function") return (source as Answer)();
        return source === undefined ? setlistFmNotFound() : json(200, structuredClone(source));
      }
      return setlistFmNotFound();
    }
    if (r.url.hostname === "api.spotify.com") {
      if (path === "/v1/search") {
        const q = r.url.searchParams.get("q") ?? "";
        const title = /track:"([^"]*)"/.exec(q)?.[1];
        const artist = /artist:"([^"]*)"/.exec(q)?.[1];
        if (title !== undefined) {
          const failure = spotify.failSearch[title];
          if (failure) return failure();
        }
        const track = title !== undefined && artist !== undefined ? spotify.tracks[`${artist}|${title}`] : undefined;
        return json(200, { tracks: { items: track ? [track] : [] } });
      }
      const scripted = spotify.playlistAnswers[playlistIndex++];
      if (path === "/v1/me/playlists" && r.method === "POST") {
        if (spotify.createGate) await spotify.createGate.pass();
        if (scripted) return scripted();
        const id = spotify.createdIds.shift() ?? "9ZzZzZzZzZzZzZzZzZzZzZ";
        const body = JSON.parse(r.body ?? "{}") as { name?: string; public?: boolean };
        return json(201, {
          id,
          name: body.name,
          public: body.public,
          collaborative: false,
          uri: `spotify:playlist:${id}`,
          href: `https://api.spotify.com/v1/playlists/${id}`,
          external_urls: { spotify: `https://open.spotify.com/playlist/${id}` },
          snapshot_id: "AAAAAQAAAAA",
        });
      }
      if (scripted) return scripted();
      const items = /^\/v1\/playlists\/([^/]+)\/items$/.exec(path);
      if (items) {
        const id = items[1]!;
        if (r.method === "PUT") {
          return spotify.deleted.has(id)
            ? json(404, { error: { status: 404, message: "Resource not found" } })
            : json(200, { snapshot_id: "AAAAAwAAAAA" });
        }
        if (r.method === "POST") {
          return spotify.deleted.has(id)
            ? json(502, { error: { status: 502, message: "Bad gateway" } })
            : json(201, { snapshot_id: "AAAAAgAAAAA" });
        }
      }
      const details = /^\/v1\/playlists\/([^/]+)$/.exec(path);
      if (details && r.method === "PUT") {
        return spotify.deleted.has(details[1]!)
          ? json(404, { error: { status: 404, message: "Resource not found" } })
          : new Response(null, { status: 200 });
      }
      return json(400, { error: { status: 400, message: `fake Spotify: unexpected ${r.method} ${path}` } });
    }
    throw new Error(`fake fetch: unexpected request to ${r.url.href}`);
  };
  const http = makeRoutedFetch(route, coreClock);

  const settingsKey = opts.setlistFmKey === undefined ? SETLISTFM_KEY : opts.setlistFmKey;
  const core = createRunServices({
    fetch: http.fetch,
    sleep: coreClock.sleep,
    now: coreClock.now,
    env: {},
    settings: createMemorySettingsStore({
      settings: settingsKey === null ? { spotifyClientId: CLIENT_ID } : { setlistfmApiKey: settingsKey, spotifyClientId: CLIENT_ID },
    }),
    startCallbackReceiver: async () => {
      throw new Error("no Spotify login expected on the web server");
    },
  });

  // The Match search, counted, held at a gate from the n-th search on, or replaced for one test.
  const matchSearches: Array<{ title: string; accessToken: string }> = [];
  const matching = {
    gate: undefined as Gate | undefined,
    /** 1-based: searches from this one on wait at the gate. */
    gateFrom: 1,
    replace: undefined as ((performance: Performance) => MatchOutcome | undefined) | undefined,
  };
  const realFindMatch = (core as unknown as Record<string, (...args: unknown[]) => Promise<MatchOutcome>>).findMatch!;
  const findMatch = async (performance: Performance, accessToken: string, ...rest: unknown[]): Promise<MatchOutcome> => {
    matchSearches.push({ title: performance.title, accessToken });
    if (matching.gate && matchSearches.length >= matching.gateFrom) await matching.gate.pass();
    const replaced = matching.replace?.(performance);
    if (replaced !== undefined) return replaced;
    return realFindMatch.call(core, performance, accessToken, ...rest);
  };
  const overrides: {
    getSetlist?: (setlistId: string) => Promise<SetlistFmSetlist>;
    /** When set, every service but the Match search rejects with this (an error no catalogue row names). */
    everyServiceThrows?: unknown;
  } = {};
  const services = new Proxy(core as object, {
    get(target, prop) {
      if (prop === "findMatch") return findMatch;
      if (prop === "getSetlist" && overrides.getSetlist) return overrides.getSetlist;
      const value: unknown = Reflect.get(target, prop, target);
      if (overrides.everyServiceThrows !== undefined && typeof value === "function") {
        const failure = overrides.everyServiceThrows;
        return async () => {
          throw failure;
        };
      }
      return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(target) : value;
    },
  }) as WebServices;

  // Host token source
  const host = {
    mode: opts.host ?? ({ kind: "connected", token: HOST_TOKEN } as HostMode),
    asked: 0,
    /** When set, every Host token ask waits here before answering. */
    gate: undefined as Gate | undefined,
  };
  const hostTokens = {
    async getAccessToken(): Promise<string | undefined> {
      host.asked++;
      if (host.gate) await host.gate.pass();
      const mode = host.mode;
      if (mode.kind === "connected") return mode.token;
      if (mode.kind === "absent") return undefined;
      throw mode.error;
    },
  };

  const clock = {
    ms: Date.parse(opts.now ?? NOW_ISO),
    set(iso: string) {
      clock.ms = Date.parse(iso);
    },
  };

  const records = opts.records ?? createMemorySetlistPlaylistRecords();
  const fakeEvents = makeFakeEvents();
  const events = opts.events ?? fakeEvents.events;
  const hits = makeFakeHits();
  const log = makeLogger();
  const clientDir = opts.clientDir ?? sharedClientDir();

  const app = createApp({
    config,
    services,
    records,
    events,
    hostTokens,
    rateLimitHits: hits,
    now: () => clock.ms,
    logger: log.logger,
    clientDir,
  });

  const isSetlistFm = (r: RecordedRequest) => r.url.hostname === "api.setlist.fm";
  const isSpotify = (r: RecordedRequest) => r.url.hostname === "api.spotify.com";

  return {
    app,
    config,
    services,
    core,
    records,
    usage: fakeEvents,
    hits,
    log,
    clock,
    host,
    setlists,
    artistSearches,
    setlistPages,
    spotify,
    matching,
    matchSearches,
    overrides,
    http,
    setlistFmRequests: () => http.requests.filter(isSetlistFm),
    spotifyRequests: () => http.requests.filter(isSpotify),
    playlistRequests: () => http.requests.filter((r) => isSpotify(r) && r.url.pathname !== "/v1/search"),
    /** "METHOD path" of every Spotify playlist request. */
    playlistCalls: () =>
      http.requests.filter((r) => isSpotify(r) && r.url.pathname !== "/v1/search").map((r) => `${r.method} ${r.url.pathname}`),
    get: (path: string, address = A) => request(app).get(path).set("X-Forwarded-For", address),
    /** GET a preview stream to its end, buffered. */
    getStream: (path: string, address = A) =>
      request(app)
        .get(path)
        .set("X-Forwarded-For", address)
        .buffer(true)
        .parse((res, done) => {
          let text = "";
          res.setEncoding("utf8");
          res.on("data", (chunk: string) => {
            text += chunk;
          });
          res.on("end", () => done(null, text));
        }),
    post: (path: string, body: unknown, address = A) =>
      request(app).post(path).set("X-Forwarded-For", address).send(body as object),
  };
}

export type Harness = ReturnType<typeof makeHarness>;

// ---------------------------------------------------------------- leak and contract checks

interface AnyResponse {
  text?: string;
  body?: unknown;
  headers: Record<string, unknown>;
}

/** No answer body, event or header holds a secret, an env name, a stack frame, a URI or Miss queries. */
export function expectNoLeaks(res: AnyResponse | string) {
  const text =
    typeof res === "string"
      ? res
      : `${res.text ?? ""}\n${typeof res.body === "string" ? res.body : JSON.stringify(res.body ?? null)}\n${JSON.stringify(res.headers)}`;
  for (const forbidden of NEVER_SENT) expect(text).not.toContain(forbidden);
}

/** Checks a value against a contract schema and gives a readable failure. */
export function expectContract(schema: { safeParse(value: unknown): { success: boolean; error?: unknown } }, value: unknown) {
  const result = schema.safeParse(value);
  expect(result.success, `contract rejected: ${JSON.stringify(result.error)}`).toBe(true);
}

// ---------------------------------------------------------------- preview streams

export interface SseFrame {
  event: string;
  data: unknown;
  /** The data line exactly as sent. */
  rawData: string;
}

/**
 * Parses an event stream: blocks separated by a blank line; `event: <name>` and exactly one
 * `data: <json>` line per event; comment lines (starting with ":") are skipped.
 */
export function parseSse(text: string): { frames: SseFrame[]; comments: string[] } {
  const frames: SseFrame[] = [];
  const comments: string[] = [];
  for (const block of text.split("\n\n")) {
    const lines = block.split("\n").filter((l) => l !== "");
    const fields = lines.filter((l) => {
      if (l.startsWith(":")) {
        comments.push(l);
        return false;
      }
      return true;
    });
    if (fields.length === 0) continue;
    const eventLines = fields.filter((l) => l.startsWith("event: "));
    const dataLines = fields.filter((l) => l.startsWith("data: "));
    if (eventLines.length !== 1 || dataLines.length !== 1 || fields.length !== 2) {
      throw new Error(`malformed event block: ${JSON.stringify(block)}`);
    }
    const rawData = dataLines[0]!.slice("data: ".length);
    frames.push({ event: eventLines[0]!.slice("event: ".length), data: JSON.parse(rawData), rawData });
  }
  return { frames, comments };
}

/** The frames as "progress n/total", "preview" or "error CODE". */
export function frameNames(frames: SseFrame[]): string[] {
  return frames.map((f) => {
    if (f.event === "progress") {
      const d = f.data as { n: number; total: number };
      return `progress ${d.n}/${d.total}`;
    }
    if (f.event === "error") return `error ${(f.data as { code: string }).code}`;
    return f.event;
  });
}

export const progressNames = (total: number, upTo = total) =>
  Array.from({ length: upTo }, (_, i) => `progress ${i + 1}/${total}`);

// ---------------------------------------------------------------- a listening app, for streams read as they come

export async function listen(app: unknown): Promise<{ port: number; close(): Promise<void> }> {
  const server = (app as { listen(port: number, host: string, cb: () => void): Server }).listen(0, "127.0.0.1", () => {});
  await new Promise<void>((resolve) => {
    if (server.listening) resolve();
    else server.once("listening", () => resolve());
  });
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  return {
    port,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

export interface OpenStream {
  status: () => number | undefined;
  headers: () => Record<string, unknown>;
  raw: () => string;
  frames: () => SseFrame[];
  names: () => string[];
  ended: () => boolean;
  waitForFrames(count: number, ms?: number): Promise<void>;
  waitForEnd(ms?: number): Promise<void>;
  close(): void;
}

/** Opens a preview stream from `address` and reads its events as they come. */
export function openStream(port: number, path: string, address: string): OpenStream {
  let raw = "";
  let status: number | undefined;
  let headers: Record<string, unknown> = {};
  let ended = false;
  const req = httpRequest({ host: "127.0.0.1", port, path, method: "GET", headers: { "X-Forwarded-For": address } }, (res) => {
    status = res.statusCode;
    headers = res.headers;
    res.setEncoding("utf8");
    res.on("data", (chunk: string) => {
      raw += chunk;
    });
    res.on("end", () => {
      ended = true;
    });
    res.on("error", () => {
      ended = true;
    });
  });
  req.on("error", () => {
    ended = true;
  });
  req.end();
  const complete = () => raw.slice(0, raw.lastIndexOf("\n\n") + 2);
  const frames = () => (raw.includes("\n\n") ? parseSse(complete()).frames : []);
  return {
    status: () => status,
    headers: () => headers,
    raw: () => raw,
    frames,
    names: () => frameNames(frames()),
    ended: () => ended,
    waitForFrames: (count, ms) => waitUntil(() => frames().length >= count, `${count} events`, ms),
    waitForEnd: (ms) => waitUntil(() => ended, "the stream to end", ms),
    close: () => req.destroy(),
  };
}

// ---------------------------------------------------------------- the core's generic request error

/** A real HttpError of the given kind (and, for "status", the given HTTP status), made by the core's requester over a fake fetch. */
export async function httpError(kind: "rate-limited" | "status" | "network", status = 500): Promise<Error> {
  const fetch = async (): Promise<Response> => {
    if (kind === "network") throw new TypeError("fetch failed");
    return new Response("{}", { status: kind === "status" ? status : 429, headers: { "Retry-After": "1" } });
  };
  const request = createRequester({ name: "Spotify playlist", maxAttempts: 1 } as RequestPolicy, {
    fetch,
    sleep: async () => {},
    now: () => 0,
  });
  try {
    await request("https://api.spotify.com/v1/me/playlists");
  } catch (err) {
    if (err instanceof HttpError && err.kind === kind) return err;
    throw new Error(`expected an HttpError of kind ${kind}, got ${String(err)}`);
  }
  throw new Error("expected the request to fail");
}
