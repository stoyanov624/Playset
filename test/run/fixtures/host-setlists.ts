// Fixtures and fakes for the Host steps: Fixture H (Pearl Jam, Portland, two versions),
// the 230-Performance Setlist of example H4, a fake Spotify behind the core's own service wiring
// (createRunServices over a routed fake fetch and a fake sleep), a clock for `createdAt`, a
// records spy and a helper that stores a cached preview. Shapes follow setlist.fm REST 1.0 and the
// Spotify Web API (create playlist, replace / add items, change details, search). No network.
import {
  createMemorySettingsStore,
  createRunServices,
  type Match,
  type MatchOutcome,
  type Miss,
  type Performance,
  type SetlistFmSetlist,
} from "../../../src/core/index.js";
import {
  prepareSetlist,
  previewMatches,
  type RunServices,
  type SetlistPlaylistRecord,
  type SetlistPlaylistRecords,
} from "../../../src/core/run/index.js";
import { match } from "./fake-services";
import { json, makeFakeClock, makeRoutedFetch, searchPayload, spotifyTrack, type RecordedRequest } from "./real-service-fakes";

// ---------------------------------------------------------------- constants

export const HOST_TOKEN = "BQDhost-test-token";
export const NOW_ISO = "2026-11-27T18:04:05.000Z";
export const LATER_ISO = "2026-11-28T09:00:00.000Z";
/** A clock (ms since the epoch, like Date.now) that always reads `iso`. */
export const clockAt = (iso: string) => () => Date.parse(iso);

export const H_SETLIST_ID = "2bf1c8e4";
export const H_V1 = "g4bd1a2f6";
export const H_V2 = "g2b5e7c19";
export const H_URL = "https://www.setlist.fm/setlist/pearl-jam/2026/moda-center-portland-or-2bf1c8e4.html";
export const H_DESCRIPTION = `Setlist from setlist.fm: ${H_URL}`;
export const H_V1_NAME = "Pearl Jam – 2026-11-22 – Portland";
export const H_V2_NAME = "Pearl Jam – 2026-11-21 – Portland";

export const PLAYLIST_ID = "5PqRsTuVwXyZaBcDeFgHiJ";
export const SHARE_URL = `https://open.spotify.com/playlist/${PLAYLIST_ID}`;
export const NEW_PLAYLIST_ID = "6QrStUvWxYzAbCdEfGhIjK";
export const NEW_SHARE_URL = `https://open.spotify.com/playlist/${NEW_PLAYLIST_ID}`;

const PEARL_JAM_MBID = "83b9cbe7-9857-49e2-ab8e-b57b01038103";

// ---------------------------------------------------------------- Fixture H

/** Fixture H version 1 (`GET /setlist/2bf1c8e4`): Release, Even Flow, an Unknown Song, Alive. */
export function fixtureHv1(): SetlistFmSetlist {
  return {
    id: H_SETLIST_ID,
    versionId: H_V1,
    eventDate: "22-11-2026",
    lastUpdated: "2026-11-23T08:12:44.000+0000",
    artist: { mbid: PEARL_JAM_MBID, name: "Pearl Jam" },
    venue: { name: "Moda Center", city: { name: "Portland", country: { name: "United States" } } },
    url: H_URL,
    sets: { set: [{ song: [{ name: "Release" }, { name: "Even Flow" }, { name: "" }, { name: "Alive" }] }] },
  } as unknown as SetlistFmSetlist;
}

/** Fixture H version 2: the same id after an edit — a Tape, Corduroy and an Encore added, the date moved. */
export function fixtureHv2(): SetlistFmSetlist {
  return {
    id: H_SETLIST_ID,
    versionId: H_V2,
    eventDate: "21-11-2026",
    lastUpdated: "2026-11-26T21:40:02.000+0000",
    artist: { mbid: PEARL_JAM_MBID, name: "Pearl Jam" },
    venue: { name: "Moda Center", city: { name: "Portland", country: { name: "United States" } } },
    url: H_URL,
    sets: {
      set: [
        {
          song: [
            { name: "Master/Slave", tape: true },
            { name: "Release" },
            { name: "Even Flow" },
            { name: "Corduroy" },
            { name: "Alive" },
          ],
        },
        { encore: 1, song: [{ name: "Yellow Ledbetter" }] },
      ],
    },
  } as unknown as SetlistFmSetlist;
}

/** A copy of a setlist.fm Setlist with some fields replaced (or removed, with `undefined`). */
export function variant(setlist: SetlistFmSetlist, changes: Record<string, unknown>): SetlistFmSetlist {
  const copy: Record<string, unknown> = { ...(structuredClone(setlist) as unknown as Record<string, unknown>) };
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined) delete copy[key];
    else copy[key] = value;
  }
  return copy as unknown as SetlistFmSetlist;
}

/** Spotify tracks of Fixture H, by Performance title (fake ids). */
export const hostTracks: Record<string, ReturnType<typeof spotifyTrack>> = {
  Release: spotifyTrack("4xGvbS8NnKtwKw5CXGkmA9", "Release", "Pearl Jam", "Ten"),
  "Even Flow": spotifyTrack("2pN3kBT1hYiA4bBydDMYv4", "Even Flow", "Pearl Jam", "Ten"),
  Corduroy: spotifyTrack("0yA1cVWJ4UjaQvSFbJxbpb", "Corduroy", "Pearl Jam", "Vitalogy"),
  Alive: spotifyTrack("3VbM2t6DQHmPWdbTvKrNKz", "Alive", "Pearl Jam", "Ten"),
  "Yellow Ledbetter": spotifyTrack("1QRVyV9SWw0pYxB6hn3HCS", "Yellow Ledbetter", "Pearl Jam", "Lost Dogs"),
};

/** The same Matches as Match outcomes, for a hand-made Match search. */
export const hostOutcomes: Record<string, Match> = Object.fromEntries(
  Object.entries(hostTracks).map(([title, t]) => [title, match(t.id, t.name, "Pearl Jam", t.album.name)]),
);

export const H_V1_URIS = [
  "spotify:track:4xGvbS8NnKtwKw5CXGkmA9",
  "spotify:track:2pN3kBT1hYiA4bBydDMYv4",
  "spotify:track:3VbM2t6DQHmPWdbTvKrNKz",
];
export const H_V2_URIS = [
  "spotify:track:4xGvbS8NnKtwKw5CXGkmA9",
  "spotify:track:2pN3kBT1hYiA4bBydDMYv4",
  "spotify:track:0yA1cVWJ4UjaQvSFbJxbpb",
  "spotify:track:3VbM2t6DQHmPWdbTvKrNKz",
  "spotify:track:1QRVyV9SWw0pYxB6hn3HCS",
];

/** The record H1 saves. */
export const h1Record = (changes: Partial<SetlistPlaylistRecord> = {}): SetlistPlaylistRecord => ({
  setlistId: H_SETLIST_ID,
  playlistId: PLAYLIST_ID,
  shareUrl: SHARE_URL,
  versionId: H_V1,
  createdAt: NOW_ISO,
  ...changes,
});

// ---------------------------------------------------------------- H4 — 230 Performances

export const BIG_SETLIST_ID = "9ac1e5d3";
export const BIG_VERSION = "g1f0e9d8c";
export const BIG_RECORDED_ID = "7RsTuVwXyZaBcDeFgHiJkL";
export const PARTLY_ID = "8HiJkLmNoPqRsTuVwXyZaB";
export const PARTLY_SHARE_URL = `https://open.spotify.com/playlist/${PARTLY_ID}`;

const pad3 = (n: number) => String(n).padStart(3, "0");

/**
 * A Setlist with `count` kept Performances "Song 1" … "Song n"; Performance 150 is "Song 7" played
 * again (so Match 150 repeats T007).
 */
export function bigSetlist(count = 230, id = BIG_SETLIST_ID, versionId = BIG_VERSION): SetlistFmSetlist {
  const songs = Array.from({ length: count }, (_, i) => ({ name: i + 1 === 150 ? "Song 7" : `Song ${i + 1}` }));
  return {
    id,
    versionId,
    eventDate: "12-12-2026",
    artist: { mbid: PEARL_JAM_MBID, name: "Pearl Jam" },
    venue: { name: "Moda Center", city: { name: "Portland", country: { name: "United States" } } },
    url: `https://www.setlist.fm/setlist/pearl-jam/2026/moda-center-portland-or-${id}.html`,
    sets: { set: [{ song: songs }] },
  } as unknown as SetlistFmSetlist;
}
export const BIG_NAME = "Pearl Jam – 2026-12-12 – Portland";

/** Matches of the big Setlist, by title: "Song n" → spotify:track:T00n. */
export const bigOutcomes = (count = 230): Record<string, Match> =>
  Object.fromEntries(
    Array.from({ length: count }, (_, i) => [`Song ${i + 1}`, match(`T${pad3(i + 1)}`, `Song ${i + 1}`, "Pearl Jam", "Some Album")]),
  );

/** The big Setlist's Match URIs in played order (position 150 is T007). */
export const bigUris = (count = 230): string[] =>
  Array.from({ length: count }, (_, i) => `spotify:track:T${pad3(i + 1 === 150 ? 7 : i + 1)}`);

// ---------------------------------------------------------------- a hand-made Match search

/**
 * A Match search answering from `outcomes` by title (a Miss for any other title); it records every search.
 * A Miss carries the two queries the real Match search tries for an Artist: the filtered one, then plain text.
 */
export function fakeMatchSearch(outcomes: Record<string, Match | "miss">) {
  const searched: Array<{ title: string; accessToken: string }> = [];
  const services: Pick<RunServices, "findMatch"> = {
    async findMatch(performance: Performance, accessToken: string): Promise<MatchOutcome> {
      searched.push({ title: performance.title, accessToken });
      const outcome = outcomes[performance.title];
      if (outcome === undefined || outcome === "miss") {
        const miss: Miss = {
          kind: "miss",
          title: performance.title,
          artist: performance.artist,
          queries: [
            `track:"${performance.title}" artist:"${performance.artist}"`,
            `${performance.title} ${performance.artist}`,
          ],
        };
        return miss;
      }
      return outcome;
    },
  };
  return { services, searched };
}

/** Prepares `setlist` with every Tape left out, previews it with a hand-made search and caches the preview. */
export async function cachePreview(
  records: SetlistPlaylistRecords,
  setlist: SetlistFmSetlist,
  outcomes: Record<string, Match | "miss">,
) {
  const prepared = await prepareSetlist(setlist, { keepTape: async () => false });
  const preview = await previewMatches(fakeMatchSearch(outcomes).services, prepared, HOST_TOKEN, {});
  const s = setlist as unknown as { id: string; versionId: string };
  await records.savePreview(s.id, s.versionId, preview);
  return preview;
}

// ---------------------------------------------------------------- records spy

/** Wraps a records store and logs every call as "<method>:<args>". */
export function spyRecords(inner: SetlistPlaylistRecords) {
  const calls: string[] = [];
  const records: SetlistPlaylistRecords = {
    findRecord: (setlistId) => {
      calls.push(`findRecord:${setlistId}`);
      return inner.findRecord(setlistId);
    },
    saveRecord: (record) => {
      calls.push(`saveRecord:${record.setlistId}`);
      return inner.saveRecord(record);
    },
    findPreview: (setlistId, versionId) => {
      calls.push(`findPreview:${setlistId}:${versionId}`);
      return inner.findPreview(setlistId, versionId);
    },
    savePreview: (setlistId, versionId, preview) => {
      calls.push(`savePreview:${setlistId}:${versionId}`);
      return inner.savePreview(setlistId, versionId, preview);
    },
  };
  return { records, calls };
}

// ---------------------------------------------------------------- fake Spotify behind createRunServices

export type Answer = () => Response | Promise<Response>;

export const answer = (status: number, body?: unknown, headers: Record<string, string> = {}): Answer => () =>
  json(status, body, headers);
export const emptyOk: Answer = () => new Response(null, { status: 200 });
export const rateLimited: Answer = answer(429, { error: { status: 429, message: "API rate limit exceeded" } }, { "Retry-After": "2" });
export const networkFailure: Answer = () =>
  Promise.reject(Object.assign(new TypeError("fetch failed"), { cause: Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" }) }));

export interface HostSpotifyOptions {
  /** Ids given to successive created playlists (default: PLAYLIST_ID, then NEW_PLAYLIST_ID, …). */
  createdIds?: string[];
  /** Playlists the Host Account no longer holds (deleted = unfollowed): replace and rename 404, add 502. */
  deleted?: string[];
  /** Answers by index among the playlist requests (every request but searches), 0-based. */
  answers?: Record<number, Answer>;
  /** Spotify tracks by title for the Match search (default: Fixture H's). */
  tracks?: Record<string, ReturnType<typeof spotifyTrack>>;
}

/** The real services the core builds, over a fake Spotify. Every request is recorded. */
export function makeHostSpotify(opts: HostSpotifyOptions = {}) {
  const clock = makeFakeClock();
  const createdIds = [...(opts.createdIds ?? [PLAYLIST_ID, NEW_PLAYLIST_ID, PARTLY_ID])];
  const deleted = new Set(opts.deleted ?? []);
  const tracks = opts.tracks ?? hostTracks;
  let playlistIndex = 0;

  const route = (request: RecordedRequest): Response | Promise<Response> => {
    const path = request.url.pathname;
    if (request.url.hostname === "api.spotify.com" && path === "/v1/search") {
      const q = request.url.searchParams.get("q") ?? "";
      const title = /track:"([^"]*)"/.exec(q)?.[1] ?? "";
      const track = tracks[title];
      const artistOk = /artist:"Pearl Jam"/.test(q);
      return json(200, track && artistOk ? searchPayload(track) : searchPayload());
    }
    const scripted = opts.answers?.[playlistIndex++];
    if (scripted) return scripted();

    if (path === "/v1/me/playlists" && request.method === "POST") {
      const id = createdIds.shift() ?? "9ZzZzZzZzZzZzZzZzZzZzZ";
      const body = JSON.parse(request.body ?? "{}") as { name?: string; public?: boolean };
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
    const items = /^\/v1\/playlists\/([^/]+)\/items$/.exec(path);
    if (items) {
      const id = items[1]!;
      if (request.method === "PUT") {
        return deleted.has(id)
          ? json(404, { error: { status: 404, message: "Resource not found" } })
          : json(200, { snapshot_id: "AAAAAwAAAAA" });
      }
      if (request.method === "POST") {
        return deleted.has(id)
          ? json(502, { error: { status: 502, message: "Bad gateway" } })
          : json(201, { snapshot_id: "AAAAAgAAAAA" });
      }
    }
    const details = /^\/v1\/playlists\/([^/]+)$/.exec(path);
    if (details && request.method === "PUT") {
      return deleted.has(details[1]!) ? json(404, { error: { status: 404, message: "Resource not found" } }) : emptyOk();
    }
    return json(400, { error: { status: 400, message: `fake Spotify: unexpected ${request.method} ${path}` } });
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
  });
  const isSearch = (r: RecordedRequest) => r.url.pathname === "/v1/search";
  return {
    services,
    http,
    clock,
    /** Every request but the Match searches. */
    playlistRequests: () => http.requests.filter((r) => !isSearch(r)),
    searchRequests: () => http.requests.filter(isSearch),
    /** The playlist requests as "METHOD url-without-query". */
    playlistCalls: () => http.requests.filter((r) => !isSearch(r)).map((r) => `${r.method} ${r.url.origin}${r.url.pathname}`),
  };
}

/** Parsed JSON body of a recorded request. */
export const bodyOf = (request: RecordedRequest | undefined): unknown =>
  request?.body === undefined ? undefined : JSON.parse(request.body);

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
