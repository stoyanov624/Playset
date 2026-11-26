import { describe, expect, it } from "vitest";
import {
  PlaylistRateLimitError,
  SpotifyPlaylistError,
  createSetlistPlaylist,
  findPlaylistsNamed,
} from "../../src/core/setlist-playlist";
import {
  E6_PLAYLIST_ID,
  FIXTURE_S_NAME,
  SNAPSHOT,
  TOKEN,
  captureError,
  createdPlaylistBody,
  e3Page1,
  e3Page2,
  e6Matches,
  errorText,
  fakeFetch,
  fakeSleep,
  findInChain,
  fixtureS,
} from "./fixtures/fake-spotify";

const FIRST_PAGE_URL = "https://api.spotify.com/v1/me/playlists?limit=50";

describe("Duplicate check — paging", () => {
  it("AC-5: GETs /v1/me/playlists?limit=50 with a Bearer token, then follows next exactly as given (E3)", async () => {
    const { fetch, requests } = fakeFetch([
      { status: 200, body: e3Page1 },
      { status: 200, body: e3Page2 },
    ]);
    const { sleep } = fakeSleep();

    await findPlaylistsNamed(FIXTURE_S_NAME, { accessToken: TOKEN, fetch, sleep });

    expect(requests).toHaveLength(2);
    expect(requests[0]!.method).toBe("GET");
    expect(requests[0]!.url).toBe(FIRST_PAGE_URL);
    expect(requests[0]!.headers.get("Authorization")).toBe("Bearer BQD-test-token");
    expect(requests[1]!.method).toBe("GET");
    expect(requests[1]!.url).toBe("https://api.spotify.com/v1/me/playlists?offset=50&limit=50");
    expect(requests[1]!.headers.get("Authorization")).toBe("Bearer BQD-test-token");
  });

  it("AC-5: stops after the first page whose next is null", async () => {
    const { fetch, requests } = fakeFetch([
      { status: 200, body: { items: [], next: null } },
      { status: 200, body: e3Page2 },
    ]);

    await findPlaylistsNamed(FIXTURE_S_NAME, { accessToken: TOKEN, fetch, sleep: fakeSleep().sleep });

    expect(requests).toHaveLength(1);
  });

  it("AC-5: stops after the first page whose next is missing (E4)", async () => {
    const { fetch, requests } = fakeFetch([
      { status: 200, body: { items: [{ id: "x1", name: "Other", external_urls: { spotify: "https://open.spotify.com/playlist/x1" } }] } },
      { status: 200, body: e3Page2 },
    ]);

    const result = await findPlaylistsNamed(FIXTURE_S_NAME, { accessToken: TOKEN, fetch, sleep: fakeSleep().sleep });

    expect(requests).toHaveLength(1);
    expect(result).toEqual([]);
  });

  it("AC-5: follows three pages one after another, never in parallel", async () => {
    const page = (next: string | null) => ({ items: [], next });
    const { fetch, requests, stats } = fakeFetch([
      { status: 200, body: page("https://api.spotify.com/v1/me/playlists?offset=50&limit=50") },
      { status: 200, body: page("https://api.spotify.com/v1/me/playlists?offset=100&limit=50") },
      { status: 200, body: page(null) },
    ]);

    await findPlaylistsNamed(FIXTURE_S_NAME, { accessToken: TOKEN, fetch, sleep: fakeSleep().sleep });

    expect(requests.map((r) => r.url)).toEqual([
      FIRST_PAGE_URL,
      "https://api.spotify.com/v1/me/playlists?offset=50&limit=50",
      "https://api.spotify.com/v1/me/playlists?offset=100&limit=50",
    ]);
    expect(stats.maxInFlight).toBe(1);
  });
});

describe("Duplicate check — name comparison", () => {
  it("AC-6: returns exact-name playlists (trimmed), in Spotify's order, with id, name as given and share link (E3)", async () => {
    const { fetch } = fakeFetch([
      { status: 200, body: e3Page1 },
      { status: 200, body: e3Page2 },
    ]);

    const result = await findPlaylistsNamed(FIXTURE_S_NAME, { accessToken: TOKEN, fetch, sleep: fakeSleep().sleep });

    expect(result).toEqual([
      {
        id: "1AbCdEfGhIjKlMnOpQrStU",
        name: "Arctic Monkeys – 2025-08-23 – Amsterdam",
        shareUrl: "https://open.spotify.com/playlist/1AbCdEfGhIjKlMnOpQrStU",
      },
      {
        id: "4DeFgHiJkLmNoPqRsTuVwX",
        name: "Arctic Monkeys – 2025-08-23 – Amsterdam ",
        shareUrl: "https://open.spotify.com/playlist/4DeFgHiJkLmNoPqRsTuVwX",
      },
    ]);
  });

  it("AC-6: does not count a different letter case, hyphens instead of en dashes, or a different date (E3)", async () => {
    const { fetch } = fakeFetch([
      { status: 200, body: e3Page1 },
      { status: 200, body: e3Page2 },
    ]);

    const ids = (await findPlaylistsNamed(FIXTURE_S_NAME, { accessToken: TOKEN, fetch, sleep: fakeSleep().sleep })).map(
      (p) => p.id,
    );

    expect(ids).not.toContain("2BcDeFgHiJkLmNoPqRsTuV");
    expect(ids).not.toContain("3CdEfGhIjKlMnOpQrStUvW");
    expect(ids).not.toContain("6FgHiJkLmNoPqRsTuVwXyZ");
  });

  it("AC-6: trims whitespace around the checked name too", async () => {
    const { fetch } = fakeFetch([
      { status: 200, body: e3Page1 },
      { status: 200, body: e3Page2 },
    ]);

    const result = await findPlaylistsNamed(`  ${FIXTURE_S_NAME}\t`, { accessToken: TOKEN, fetch, sleep: fakeSleep().sleep });

    expect(result.map((p) => p.id)).toEqual(["1AbCdEfGhIjKlMnOpQrStU", "4DeFgHiJkLmNoPqRsTuVwX"]);
  });

  it("AC-6: returns an empty list when no playlist has the name", async () => {
    const { fetch } = fakeFetch([
      { status: 200, body: e3Page1 },
      { status: 200, body: e3Page2 },
    ]);

    const result = await findPlaylistsNamed("Arctic Monkeys – 2025-08-23 – Berlin", {
      accessToken: TOKEN,
      fetch,
      sleep: fakeSleep().sleep,
    });

    expect(result).toEqual([]);
  });
});

describe("Duplicate check — odd pages and names", () => {
  it("AC-7: skips null entries and entries without a name without error (E3)", async () => {
    const { fetch } = fakeFetch([
      { status: 200, body: e3Page1 },
      { status: 200, body: e3Page2 },
    ]);

    const result = await findPlaylistsNamed(FIXTURE_S_NAME, { accessToken: TOKEN, fetch, sleep: fakeSleep().sleep });

    expect(result.map((p) => p.id)).not.toContain("5EfGhIjKlMnOpQrStUvWxY");
    expect(result).toHaveLength(2);
  });

  it("AC-7: a page with empty items has no candidates (E4)", async () => {
    const { fetch, requests } = fakeFetch([{ status: 200, body: { items: [], next: null } }]);

    const result = await findPlaylistsNamed(FIXTURE_S_NAME, { accessToken: TOKEN, fetch, sleep: fakeSleep().sleep });

    expect(result).toEqual([]);
    expect(requests).toHaveLength(1);
  });

  it.each([[""], ["   "]])("AC-8: checked name %j returns empty and sends no request (E4)", async (name) => {
    const { fetch, requests } = fakeFetch([{ status: 200, body: e3Page1 }]);

    const result = await findPlaylistsNamed(name, { accessToken: TOKEN, fetch, sleep: fakeSleep().sleep });

    expect(result).toEqual([]);
    expect(requests).toHaveLength(0);
  });

  it("AC-9: a next URL on another host is never requested and raises a typed Spotify error (E4)", async () => {
    const { fetch, requests } = fakeFetch([
      { status: 200, body: { items: [], next: "https://evil.example.com/v1/me/playlists?offset=50" } },
      { status: 200, body: { items: [], next: null } },
    ]);

    const err = await captureError(
      findPlaylistsNamed(FIXTURE_S_NAME, { accessToken: TOKEN, fetch, sleep: fakeSleep().sleep }),
    );

    expect(findInChain(err, SpotifyPlaylistError)).toBeDefined();
    expect(requests).toHaveLength(1);
    expect(requests.some((r) => r.url.includes("evil.example.com"))).toBe(false);
    expect(errorText(err)).not.toContain(TOKEN);
  });

  it("AC-9: a next URL that only looks like Spotify (http, or a lookalike host) is never requested", async () => {
    for (const next of [
      "http://api.spotify.com/v1/me/playlists?offset=50&limit=50",
      "https://api.spotify.com.evil.example.com/v1/me/playlists?offset=50",
    ]) {
      const { fetch, requests } = fakeFetch([
        { status: 200, body: { items: [], next } },
        { status: 200, body: { items: [], next: null } },
      ]);

      const err = await captureError(
        findPlaylistsNamed(FIXTURE_S_NAME, { accessToken: TOKEN, fetch, sleep: fakeSleep().sleep }),
      );

      expect(findInChain(err, SpotifyPlaylistError)).toBeDefined();
      expect(requests).toHaveLength(1);
    }
  });
});

describe("Duplicate check — errors and rate limits", () => {
  it("AC-17: on 429 with an unreadable Retry-After waits 1 second and resends page 1 (E9)", async () => {
    const { fetch, requests } = fakeFetch([
      { status: 429, headers: { "Retry-After": "abc" } },
      { status: 200, body: { items: [], next: null } },
    ]);
    const { sleep, waits } = fakeSleep();

    expect(await findPlaylistsNamed(FIXTURE_S_NAME, { accessToken: TOKEN, fetch, sleep })).toEqual([]);
    expect(waits).toEqual([1000]);
    expect(requests).toHaveLength(2);
    expect(requests[1]!.url).toBe(requests[0]!.url);
    expect(requests[1]!.headers.get("Authorization")).toBe("Bearer BQD-test-token");
  });

  it("AC-17: on 429 with Retry-After: 3 waits 3 seconds", async () => {
    const { fetch } = fakeFetch([
      { status: 429, headers: { "Retry-After": "3" } },
      { status: 200, body: { items: [], next: null } },
    ]);
    const { sleep, waits } = fakeSleep();

    await findPlaylistsNamed(FIXTURE_S_NAME, { accessToken: TOKEN, fetch, sleep });

    expect(waits).toEqual([3000]);
  });

  it("AC-17: four 429s on one page raise a typed rate-limit error after 4 requests", async () => {
    const limited = { status: 429, headers: { "Retry-After": "1" } };
    const { fetch, requests } = fakeFetch([limited, limited, limited, limited, { status: 200, body: { items: [] } }]);
    const { sleep, waits } = fakeSleep();

    const err = await captureError(findPlaylistsNamed(FIXTURE_S_NAME, { accessToken: TOKEN, fetch, sleep }));

    expect(findInChain(err, PlaylistRateLimitError)).toBeDefined();
    expect(errorText(err)).toMatch(/rate[- ]?limit/i);
    expect(requests).toHaveLength(4);
    expect(waits).toEqual([1000, 1000, 1000]);
  });

  it("AC-17: each page has its own budget of 3 retries", async () => {
    const limited = { status: 429, headers: { "Retry-After": "1" } };
    const { fetch, requests } = fakeFetch([
      limited,
      limited,
      limited,
      { status: 200, body: { items: [], next: "https://api.spotify.com/v1/me/playlists?offset=50&limit=50" } },
      limited,
      limited,
      limited,
      { status: 200, body: { items: [], next: null } },
    ]);
    const { sleep } = fakeSleep();

    expect(await findPlaylistsNamed(FIXTURE_S_NAME, { accessToken: TOKEN, fetch, sleep })).toEqual([]);
    expect(requests).toHaveLength(8);
  });

  it("AC-18: a 500 on page 2 raises a typed Spotify error with the status, without retrying (E10)", async () => {
    const { fetch, requests } = fakeFetch([
      { status: 200, body: e3Page1 },
      { status: 500 },
      { status: 200, body: e3Page2 },
    ]);
    const { sleep, waits } = fakeSleep();

    const err = await captureError(findPlaylistsNamed(FIXTURE_S_NAME, { accessToken: TOKEN, fetch, sleep }));

    const spotifyError = findInChain(err, SpotifyPlaylistError);
    expect(spotifyError).toBeDefined();
    expect(spotifyError!.status).toBe(500);
    expect(errorText(err)).toMatch(/500/);
    expect(requests).toHaveLength(2);
    expect(waits).toEqual([]);
  });

  it("AC-18: a 401 includes Spotify's error.message", async () => {
    const { fetch, requests } = fakeFetch([
      { status: 401, body: { error: { status: 401, message: "The access token expired" } } },
    ]);

    const err = await captureError(
      findPlaylistsNamed(FIXTURE_S_NAME, { accessToken: TOKEN, fetch, sleep: fakeSleep().sleep }),
    );

    expect(findInChain(err, SpotifyPlaylistError)?.status).toBe(401);
    expect(errorText(err)).toMatch(/401/);
    expect(errorText(err)).toContain("The access token expired");
    expect(requests).toHaveLength(1);
  });

  it("AC-21: duplicate-check errors never contain the access token", async () => {
    const limited = { status: 429, headers: { "Retry-After": "1" } };
    const scenarios: Array<Parameters<typeof fakeFetch>[0]> = [
      [{ status: 401, body: { error: { status: 401, message: "The access token expired" } } }],
      [{ status: 500 }],
      [limited, limited, limited, limited],
      [{ status: 200, body: { items: [], next: "https://evil.example.com/v1/me/playlists?offset=50" } }],
      [{ throws: new TypeError("network unreachable") }],
    ];
    for (const answers of scenarios) {
      const { fetch } = fakeFetch(answers);
      const err = await captureError(
        findPlaylistsNamed(FIXTURE_S_NAME, { accessToken: TOKEN, fetch, sleep: fakeSleep().sleep }),
      );
      expect(errorText(err)).not.toContain(TOKEN);
    }
  });
});

describe("Duplicate check never blocks creation", () => {
  it("AC-10: after a duplicate is found, creating a Setlist Playlist still creates and fills a new one (E5)", async () => {
    const check = fakeFetch([
      { status: 200, body: e3Page1 },
      { status: 200, body: e3Page2 },
    ]);
    const duplicates = await findPlaylistsNamed(FIXTURE_S_NAME, {
      accessToken: TOKEN,
      fetch: check.fetch,
      sleep: fakeSleep().sleep,
    });
    expect(duplicates.map((p) => p.id)).toContain("1AbCdEfGhIjKlMnOpQrStU");

    const create = fakeFetch([
      { status: 201, body: createdPlaylistBody(E6_PLAYLIST_ID) },
      { status: 201, body: SNAPSHOT },
    ]);
    const result = await createSetlistPlaylist(fixtureS, e6Matches.slice(0, 3), {
      accessToken: TOKEN,
      fetch: create.fetch,
      sleep: fakeSleep().sleep,
    });

    expect(create.requests).toHaveLength(2);
    expect(create.requests[0]!.method).toBe("POST");
    expect(create.requests[0]!.url).toBe("https://api.spotify.com/v1/me/playlists");
    expect(create.requests[1]!.url).toBe(`https://api.spotify.com/v1/playlists/${E6_PLAYLIST_ID}/items`);
    expect(result.id).toBe(E6_PLAYLIST_ID);
    expect(result.id).not.toBe("1AbCdEfGhIjKlMnOpQrStU");
  });
});
