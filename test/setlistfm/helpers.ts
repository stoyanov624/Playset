// Shared fixtures and fakes for the setlistfm tests (PRD 0005).
// Response shapes follow the setlist.fm REST API 1.0 as given in the PRD examples.
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { vi } from "vitest";
import type { SetlistFmSetlist } from "../../src/core/performances";
import { createSetlistFmClient, type ArtistCandidate, type ArtistChooser } from "../../src/core/setlistfm";

export type Env = Record<string, string | undefined>;

// ---------------------------------------------------------------- constants

export const API_KEY = "sfm-test-key-0f3c9a";
export const ENV_KEY = "sfm-env-key-111";
export const FILE_KEY = "sfm-file-key-222";
export const SPOTIFY_CLIENT_ID = "3f9a0c2e7b4d4e1f8a6b5c4d3e2f1a0b";
export const CONFIG_FILE = "config.json";
export const API_BASE = "https://api.setlist.fm/rest/1.0";

/** Clock start used in the PRD examples. */
export const T0 = 1795716000000;

export const ARCTIC_MONKEYS_MBID = "ada7a83c-e3e1-40f1-93f9-3e73dbfd2c7c";
export const GENESIS_UK_MBID = "8e3fcd7d-bda1-4ca0-b987-b8528d2ee74e";
export const GENESIS_US_MBID = "2f4b1c6e-7a8d-4e9f-b0a1-c2d3e4f5a6b7";
export const GENESIS_OWUSU_MBID = "4a5b6c7d-8e9f-4a0b-9c1d-2e3f4a5b6c7d";

export const ARCTIC_MONKEYS: ArtistCandidate = { name: "Arctic Monkeys", mbid: ARCTIC_MONKEYS_MBID };

// ---------------------------------------------------------------- fixtures

const here = dirname(fileURLToPath(import.meta.url));

/** Fresh copy of a JSON fixture under test/setlistfm/fixtures/. */
export function loadFixture<T = any>(file: string): T {
  return JSON.parse(readFileSync(join(here, "fixtures", file), "utf8")) as T;
}

/** Fresh copy of Fixture A of PRD 0002 (GET /setlist/63a5e2b7). */
export function loadFixtureA(): SetlistFmSetlist {
  return JSON.parse(
    readFileSync(join(here, "..", "fixtures", "performances", "fixture-a-full-show.json"), "utf8"),
  ) as SetlistFmSetlist;
}

type SetlistSets = SetlistFmSetlist["sets"];

/** A setlist.fm setlist for Arctic Monkeys with the given id and sets. */
export function makeSetlist(id: string, sets: unknown, artistName = "Arctic Monkeys", mbid = ARCTIC_MONKEYS_MBID): SetlistFmSetlist {
  return {
    id,
    eventDate: "23-08-2025",
    artist: { mbid, name: artistName },
    venue: {
      id: "6bd6ca6e",
      name: "Ziggo Dome",
      city: { id: "2759794", name: "Amsterdam", country: { code: "NL", name: "Netherlands" } },
    },
    url: `https://www.setlist.fm/setlist/arctic-monkeys/2025/ziggo-dome-amsterdam-netherlands-${id}.html`,
    sets: sets as SetlistSets,
  } as unknown as SetlistFmSetlist;
}

/** An announced future Show: no songs. */
export function emptySetlist(id: string): SetlistFmSetlist {
  return makeSetlist(id, { set: [] });
}

/** A setlist.fm "artist setlists" page. */
export function setlistsPage(page: number, total: number, setlists: SetlistFmSetlist[], itemsPerPage = 20) {
  return { type: "setlists", itemsPerPage, page, total, setlist: setlists };
}

/** A page of `count` empty setlists, ids derived from the page number. */
export function emptySetlistsPage(page: number, total: number, count = 20, itemsPerPage = 20) {
  const setlists = Array.from({ length: count }, (_, i) => emptySetlist(`e${page}${String(i).padStart(2, "0")}aa`));
  return setlistsPage(page, total, setlists, itemsPerPage);
}

// ---------------------------------------------------------------- responses

export type ResponseFactory = () => Response | Promise<Response>;

export function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): ResponseFactory {
  return () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json", ...headers },
    });
}

export const ok = (body: unknown): ResponseFactory => jsonResponse(200, body);

export const notFound: ResponseFactory = jsonResponse(404, {
  code: 404,
  status: "Not Found",
  message: "not found",
  timestamp: "2026-11-26T18:00:00.000+0000",
});

export const forbidden: ResponseFactory = jsonResponse(403, { code: 403, status: "Forbidden", message: "Forbidden" });

export const unauthorized: ResponseFactory = jsonResponse(401, { code: 401, status: "Unauthorized", message: "Unauthorized" });

export const serverError: ResponseFactory = jsonResponse(500, {
  code: 500,
  status: "Internal Server Error",
  message: "Internal Server Error",
});

export const serviceUnavailable: ResponseFactory = () => new Response("", { status: 503 });

export const networkFailure: ResponseFactory = () =>
  Promise.reject(Object.assign(new TypeError("fetch failed"), { cause: Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" }) }));

/** HTTP 429. `retryAfter` null means no Retry-After header. */
export function tooManyRequests(retryAfter: string | null = "2"): ResponseFactory {
  return () =>
    new Response(
      JSON.stringify({
        code: 429,
        status: "Too Many Requests",
        message: "Too Many Requests",
        timestamp: "2026-11-26T18:00:00.123+0000",
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          ...(retryAfter === null ? {} : { "Retry-After": retryAfter }),
        },
      },
    );
}

// ---------------------------------------------------------------- fake clock, sleep, fetch

export interface RecordedRequest {
  url: string;
  parsed: URL;
  method: string;
  headers: Headers;
  /** Fake clock time at which the request started. */
  at: number;
}

/**
 * A fake clock that only moves when `sleep` is called (or when a test calls `advance`),
 * and a scripted fake fetch that records every request.
 */
export function makeFakes(script: ResponseFactory[] = []) {
  let time = T0;
  const sleeps: number[] = [];
  const requests: RecordedRequest[] = [];
  const queue = [...script];

  const now = vi.fn(() => time);
  const advance = (ms: number) => {
    time += ms;
  };
  const sleep = vi.fn(async (ms: number) => {
    sleeps.push(ms);
    time += ms;
  });

  const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
    requests.push({ url, parsed: new URL(url), method, headers, at: time });
    const next = queue.shift();
    if (!next) throw new Error(`Unexpected fetch #${requests.length} to ${url}`);
    return next();
  });

  /** Append more scripted responses. */
  const enqueue = (...more: ResponseFactory[]) => {
    queue.push(...more);
  };

  return { fetch, sleep, now, advance, sleeps, requests, enqueue };
}

export type Fakes = ReturnType<typeof makeFakes>;

/** A client with the test key in the environment and the given fakes. */
export function makeClient(fakes: Fakes, opts: { env?: Env; configDir?: string } = {}) {
  return createSetlistFmClient({
    fetch: fakes.fetch,
    sleep: fakes.sleep,
    now: fakes.now,
    env: opts.env ?? { SETLISTFM_API_KEY: API_KEY },
    ...(opts.configDir === undefined ? {} : { configDir: opts.configDir }),
  });
}

// ---------------------------------------------------------------- fake chooser

/** A chooser that picks the candidate at `index`, or cancels when `index` is null. */
export function makeChooser(index: number | null = 0) {
  const calls: ArtistCandidate[][] = [];
  const chooser: ArtistChooser = vi.fn(async (candidates: ArtistCandidate[]) => {
    calls.push(candidates.map((c) => ({ ...c })));
    if (index === null) return null;
    const picked = candidates[index];
    if (!picked) throw new Error(`Fake chooser: no candidate at ${index}`);
    return picked;
  });
  return { chooser, calls };
}

// ---------------------------------------------------------------- temp config dir

export async function makeTempRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), "playset-test-"));
}

export async function removeTempRoot(root: string): Promise<void> {
  await rm(root, { recursive: true, force: true });
}

export async function writeConfigFile(configDir: string, content: string): Promise<void> {
  await mkdir(configDir, { recursive: true });
  await writeFile(join(configDir, CONFIG_FILE), content);
}

// ---------------------------------------------------------------- errors

/** Everything a front-end might show the user for an error. */
export function errorText(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const hint = (err as { hint?: unknown }).hint;
  return [err.name, err.message, typeof hint === "string" ? hint : "", String(err)].join("\n");
}

export async function captureError(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  throw new Error("Expected the promise to reject, but it resolved");
}

/** Paths (without host) of the recorded requests, e.g. "/rest/1.0/setlist/63a5e2b7". */
export function paths(requests: RecordedRequest[]): string[] {
  return requests.map((r) => r.parsed.pathname);
}
