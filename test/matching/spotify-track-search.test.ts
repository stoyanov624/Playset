import { describe, expect, it } from "vitest";
import { createSpotifyTrackSearch } from "../../src/core/matching";
import { payload, track } from "./fixtures/fake-track-search";

interface RecordedRequest {
  url: URL;
  method: string;
  headers: Headers;
}

type FakeAnswer = { status: number; body?: unknown; headers?: Record<string, string> };

/** A fake fetch that answers from a queue of canned responses and records each request. */
function fakeFetch(answers: FakeAnswer[]) {
  const requests: RecordedRequest[] = [];
  const queue = [...answers];
  const fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    requests.push({ url, method, headers });
    const answer = queue.shift();
    if (!answer) throw new Error("fake fetch: no more canned responses");
    return new Response(answer.body === undefined ? null : JSON.stringify(answer.body), {
      status: answer.status,
      headers: { "Content-Type": "application/json", ...(answer.headers ?? {}) },
    });
  };
  return { fetch, requests };
}

/** A fake sleeper that records requested waits (in milliseconds) and resolves at once. */
function fakeSleep() {
  const waits: number[] = [];
  const sleep = async (ms: number): Promise<void> => {
    waits.push(ms);
  };
  return { sleep, waits };
}

const QUERY = 'track:"Mr. Brightside" artist:"The Killers"';
const TOKEN = "BQD-test-token";

const brightside = track("003vvx7Niy0yvhvHt4a68B", "Mr. Brightside", "The Killers", "Hot Fuss");

describe("createSpotifyTrackSearch — request shape", () => {
  it("AC-19: sends one GET to the Spotify search endpoint with q, type=track, limit=10 and a Bearer token (E16)", async () => {
    const { fetch, requests } = fakeFetch([{ status: 200, body: payload() }]);
    const { sleep } = fakeSleep();
    const search = createSpotifyTrackSearch({ accessToken: TOKEN, fetch, sleep });

    await search.searchTracks(QUERY, 10);

    expect(requests).toHaveLength(1);
    const [request] = requests;
    expect(request!.method).toBe("GET");
    expect(`${request!.url.origin}${request!.url.pathname}`).toBe("https://api.spotify.com/v1/search");
    expect(request!.url.searchParams.get("q")).toBe(QUERY);
    expect(request!.url.searchParams.get("type")).toBe("track");
    expect(request!.url.searchParams.get("limit")).toBe("10");
    expect(request!.headers.get("Authorization")).toBe("Bearer BQD-test-token");
  });

  it("AC-19: URL-encodes the query in q so quotes, colons and spaces survive", async () => {
    const { fetch, requests } = fakeFetch([{ status: 200, body: payload() }]);
    const search = createSpotifyTrackSearch({ accessToken: TOKEN, fetch, sleep: fakeSleep().sleep });

    await search.searchTracks('track:"AC/DC & Friends?" artist:"Simon & Garfunkel"', 10);

    const rawSearch = requests[0]!.url.search;
    expect(rawSearch).not.toContain('"');
    expect(rawSearch).not.toMatch(/q=[^&]*&[^=&]*Friends/);
    expect(requests[0]!.url.searchParams.get("q")).toBe('track:"AC/DC & Friends?" artist:"Simon & Garfunkel"');
  });

  it("AC-19: returns the track results in Spotify's order", async () => {
    const second = track("1aaaaaaaaaaaaaaaaaaaaa", "Mr. Brightside - Live", "The Killers", "Live");
    const { fetch } = fakeFetch([{ status: 200, body: payload(brightside, second) }]);
    const search = createSpotifyTrackSearch({ accessToken: TOKEN, fetch, sleep: fakeSleep().sleep });

    const results = await search.searchTracks(QUERY, 10);

    expect(results).toEqual([brightside, second]);
  });

  it("AC-19: returns no results when tracks.items is empty (E16)", async () => {
    const { fetch } = fakeFetch([{ status: 200, body: { tracks: { items: [] } } }]);
    const search = createSpotifyTrackSearch({ accessToken: TOKEN, fetch, sleep: fakeSleep().sleep });

    expect(await search.searchTracks(QUERY, 10)).toEqual([]);
  });
});

describe("createSpotifyTrackSearch — rate limiting", () => {
  it("AC-20: on 429 with Retry-After: 2 waits 2 seconds and resends the same request (E17)", async () => {
    const { fetch, requests } = fakeFetch([
      { status: 429, headers: { "Retry-After": "2" } },
      { status: 200, body: payload(brightside) },
    ]);
    const { sleep, waits } = fakeSleep();
    const search = createSpotifyTrackSearch({ accessToken: TOKEN, fetch, sleep });

    const results = await search.searchTracks(QUERY, 10);

    expect(results).toEqual([brightside]);
    expect(requests).toHaveLength(2);
    expect(waits).toEqual([2000]);
    expect(requests[1]!.url.toString()).toBe(requests[0]!.url.toString());
    expect(requests[1]!.headers.get("Authorization")).toBe("Bearer BQD-test-token");
  });

  it("AC-20: on 429 without Retry-After waits 1 second (E17)", async () => {
    const { fetch, requests } = fakeFetch([{ status: 429 }, { status: 200, body: payload(brightside) }]);
    const { sleep, waits } = fakeSleep();
    const search = createSpotifyTrackSearch({ accessToken: TOKEN, fetch, sleep });

    expect(await search.searchTracks(QUERY, 10)).toEqual([brightside]);
    expect(waits).toEqual([1000]);
    expect(requests).toHaveLength(2);
  });

  it("AC-20: on 429 with an unreadable Retry-After waits 1 second (E17)", async () => {
    const { fetch, requests } = fakeFetch([
      { status: 429, headers: { "Retry-After": "abc" } },
      { status: 200, body: payload(brightside) },
    ]);
    const { sleep, waits } = fakeSleep();
    const search = createSpotifyTrackSearch({ accessToken: TOKEN, fetch, sleep });

    expect(await search.searchTracks(QUERY, 10)).toEqual([brightside]);
    expect(waits).toEqual([1000]);
    expect(requests).toHaveLength(2);
  });

  it("AC-20: after 3 retries still answered with 429 fails with a rate-limit error, 4 requests total (E17)", async () => {
    const limited = { status: 429, headers: { "Retry-After": "1" } };
    const { fetch, requests } = fakeFetch([limited, limited, limited, limited, { status: 200, body: payload() }]);
    const { sleep, waits } = fakeSleep();
    const search = createSpotifyTrackSearch({ accessToken: TOKEN, fetch, sleep });

    await expect(search.searchTracks(QUERY, 10)).rejects.toThrow(/rate[- ]?limit/i);
    expect(requests).toHaveLength(4);
    expect(waits).toEqual([1000, 1000, 1000]);
  });
});

describe("createSpotifyTrackSearch — other HTTP failures", () => {
  it("AC-21: a 401 fails at once with an error mentioning 401, without retrying (E18)", async () => {
    const { fetch, requests } = fakeFetch([
      { status: 401, body: { error: { status: 401, message: "The access token expired" } } },
      { status: 200, body: payload(brightside) },
    ]);
    const { sleep, waits } = fakeSleep();
    const search = createSpotifyTrackSearch({ accessToken: TOKEN, fetch, sleep });

    await expect(search.searchTracks(QUERY, 10)).rejects.toThrow(/401/);
    expect(requests).toHaveLength(1);
    expect(waits).toEqual([]);
  });

  it("AC-21: a 500 fails at once with an error mentioning 500, without retrying (E18)", async () => {
    const { fetch, requests } = fakeFetch([{ status: 500 }, { status: 200, body: payload(brightside) }]);
    const { sleep, waits } = fakeSleep();
    const search = createSpotifyTrackSearch({ accessToken: TOKEN, fetch, sleep });

    await expect(search.searchTracks(QUERY, 10)).rejects.toThrow(/500/);
    expect(requests).toHaveLength(1);
    expect(waits).toEqual([]);
  });
});
