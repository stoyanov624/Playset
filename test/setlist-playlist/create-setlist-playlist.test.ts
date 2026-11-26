import { describe, expect, it } from "vitest";
import {
  NothingToAddError,
  PartlyCreatedPlaylistError,
  PlaylistRateLimitError,
  SpotifyPlaylistError,
  createSetlistPlaylist,
  findPlaylistsNamed,
} from "../../src/core/setlist-playlist";
import {
  E6_PLAYLIST_ID,
  E7_PLAYLIST_ID,
  FIXTURE_S_DESCRIPTION,
  FIXTURE_S_NAME,
  SNAPSHOT,
  TOKEN,
  captureError,
  createdPlaylistBody,
  e3Page1,
  e3Page2,
  e6Matches,
  e7Matches,
  errorText,
  fakeFetch,
  fakeSleep,
  findInChain,
  fixtureS,
  jsonBody,
  numberedMatches,
  type FakeAnswer,
  type RecordedRequest,
} from "./fixtures/fake-spotify";

const CREATE_URL = "https://api.spotify.com/v1/me/playlists";
const itemsUrl = (id: string) => `https://api.spotify.com/v1/playlists/${id}/items`;
const created = (id: string): FakeAnswer => ({ status: 201, body: createdPlaylistBody(id) });
const added: FakeAnswer = { status: 201, body: SNAPSHOT };
const limited: FakeAnswer = { status: 429, headers: { "Retry-After": "1" } };

const urisOf = (request: RecordedRequest | undefined) => (jsonBody(request) as { uris: string[] }).uris;

describe("Creating the Setlist Playlist", () => {
  it("AC-11: sends exactly one POST /v1/me/playlists first, with Bearer token, JSON content type and name/description/public (E6)", async () => {
    const { fetch, requests } = fakeFetch([created(E6_PLAYLIST_ID), added]);

    await createSetlistPlaylist(fixtureS, e6Matches, { accessToken: TOKEN, fetch, sleep: fakeSleep().sleep });

    const createRequests = requests.filter((r) => r.url === CREATE_URL);
    expect(createRequests).toHaveLength(1);
    const [first] = requests;
    expect(first!.method).toBe("POST");
    expect(first!.url).toBe(CREATE_URL);
    expect(first!.headers.get("Authorization")).toBe("Bearer BQD-test-token");
    expect(first!.headers.get("Content-Type")).toMatch(/^application\/json/);
    expect(jsonBody(first)).toEqual({
      name: FIXTURE_S_NAME,
      description: FIXTURE_S_DESCRIPTION,
      public: false,
    });
  });

  it("AC-12: is private when no public option is given (E6)", async () => {
    const { fetch, requests } = fakeFetch([created(E6_PLAYLIST_ID), added]);

    await createSetlistPlaylist(fixtureS, e6Matches, { accessToken: TOKEN, fetch, sleep: fakeSleep().sleep });

    expect((jsonBody(requests[0]) as { public: unknown }).public).toBe(false);
  });

  it("AC-12: is private when the public option is no", async () => {
    const { fetch, requests } = fakeFetch([created(E6_PLAYLIST_ID), added]);

    await createSetlistPlaylist(fixtureS, e6Matches, {
      accessToken: TOKEN,
      fetch,
      sleep: fakeSleep().sleep,
      public: false,
    });

    expect((jsonBody(requests[0]) as { public: unknown }).public).toBe(false);
  });

  it("AC-12: is public when the public option is yes (E6)", async () => {
    const { fetch, requests } = fakeFetch([created(E6_PLAYLIST_ID), added]);

    await createSetlistPlaylist(fixtureS, e6Matches, {
      accessToken: TOKEN,
      fetch,
      sleep: fakeSleep().sleep,
      public: true,
    });

    expect(jsonBody(requests[0])).toEqual({
      name: FIXTURE_S_NAME,
      description: FIXTURE_S_DESCRIPTION,
      public: true,
    });
  });
});

describe("Filling the Setlist Playlist", () => {
  it("AC-13: adds the Matches with POST /v1/playlists/<id>/items, both headers and a {uris} body (E6)", async () => {
    const { fetch, requests } = fakeFetch([created(E6_PLAYLIST_ID), added]);

    await createSetlistPlaylist(fixtureS, e6Matches, { accessToken: TOKEN, fetch, sleep: fakeSleep().sleep });

    expect(requests).toHaveLength(2);
    const add = requests[1]!;
    expect(add.method).toBe("POST");
    expect(add.url).toBe(itemsUrl(E6_PLAYLIST_ID));
    expect(add.headers.get("Authorization")).toBe("Bearer BQD-test-token");
    expect(add.headers.get("Content-Type")).toMatch(/^application\/json/);
    expect(jsonBody(add)).toEqual({
      uris: [
        "spotify:track:4LRPiXqCikLlN15c3yImP7",
        "spotify:track:2x8evxqUlF0eRabbW2JBJd",
        "spotify:track:5FVd6KXrgO9B3JPmC8OPst",
        "spotify:track:2x8evxqUlF0eRabbW2JBJd",
      ],
    });
  });

  it("AC-13: 250 Matches go in three batches of 100, 100 and 50, in played order (E7)", async () => {
    const matches = e7Matches();
    const { fetch, requests } = fakeFetch([created(E7_PLAYLIST_ID), added, added, added]);

    const result = await createSetlistPlaylist(fixtureS, matches, { accessToken: TOKEN, fetch, sleep: fakeSleep().sleep });

    expect(requests).toHaveLength(4);
    expect(requests.slice(1).map((r) => r.url)).toEqual([
      itemsUrl(E7_PLAYLIST_ID),
      itemsUrl(E7_PLAYLIST_ID),
      itemsUrl(E7_PLAYLIST_ID),
    ]);
    const batches = requests.slice(1).map(urisOf);
    expect(batches.map((b) => b.length)).toEqual([100, 100, 50]);
    expect(batches[0]![0]).toBe("spotify:track:T001");
    expect(batches[0]![99]).toBe("spotify:track:T100");
    expect(batches[1]![79]).toBe("spotify:track:T007");
    expect(batches[2]![0]).toBe("spotify:track:T201");
    expect(batches[2]![49]).toBe("spotify:track:T250");
    expect(batches.flat()).toEqual(matches.map((m) => m.uri));
    expect(result.trackCount).toBe(250);
  });

  it("AC-13: sends the add-items requests one after another, never in parallel (E7)", async () => {
    const { fetch, stats } = fakeFetch([created(E7_PLAYLIST_ID), added, added, added]);

    await createSetlistPlaylist(fixtureS, e7Matches(), { accessToken: TOKEN, fetch, sleep: fakeSleep().sleep });

    expect(stats.maxInFlight).toBe(1);
  });

  it("AC-13: exactly 100 Matches go in one request of 100 URIs (E7 boundary)", async () => {
    const { fetch, requests } = fakeFetch([created(E7_PLAYLIST_ID), added, added]);

    await createSetlistPlaylist(fixtureS, numberedMatches(100), { accessToken: TOKEN, fetch, sleep: fakeSleep().sleep });

    expect(requests).toHaveLength(2);
    expect(urisOf(requests[1])).toHaveLength(100);
  });

  it("AC-13: 101 Matches go in two requests of 100 and 1 URIs (E7 boundary)", async () => {
    const { fetch, requests } = fakeFetch([created(E7_PLAYLIST_ID), added, added, added]);

    await createSetlistPlaylist(fixtureS, numberedMatches(101), { accessToken: TOKEN, fetch, sleep: fakeSleep().sleep });

    expect(requests).toHaveLength(3);
    expect(urisOf(requests[1])).toHaveLength(100);
    expect(urisOf(requests[2])).toEqual(["spotify:track:T101"]);
  });

  it("AC-14: a song played twice is added twice, in its played positions (E6)", async () => {
    const { fetch, requests } = fakeFetch([created(E6_PLAYLIST_ID), added]);

    await createSetlistPlaylist(fixtureS, e6Matches, { accessToken: TOKEN, fetch, sleep: fakeSleep().sleep });

    const uris = urisOf(requests[1]);
    expect(uris).toHaveLength(4);
    expect(uris[1]).toBe("spotify:track:2x8evxqUlF0eRabbW2JBJd");
    expect(uris[3]).toBe("spotify:track:2x8evxqUlF0eRabbW2JBJd");
  });

  it("AC-14: the same track URI in consecutive positions is not collapsed", async () => {
    const same = e6Matches[1]!;
    const { fetch, requests } = fakeFetch([created(E6_PLAYLIST_ID), added]);

    const result = await createSetlistPlaylist(fixtureS, [same, same, same], {
      accessToken: TOKEN,
      fetch,
      sleep: fakeSleep().sleep,
    });

    expect(urisOf(requests[1])).toEqual([same.uri, same.uri, same.uri]);
    expect(result.trackCount).toBe(3);
  });

  it("AC-15: returns the id, share link, name and track count (repeats included) (E6)", async () => {
    const { fetch } = fakeFetch([created(E6_PLAYLIST_ID), added]);

    const result = await createSetlistPlaylist(fixtureS, e6Matches, { accessToken: TOKEN, fetch, sleep: fakeSleep().sleep });

    expect(result).toEqual({
      id: E6_PLAYLIST_ID,
      shareUrl: "https://open.spotify.com/playlist/7GhIjKlMnOpQrStUvWxYzA",
      name: FIXTURE_S_NAME,
      trackCount: 4,
    });
  });

  it("AC-15: falls back to https://open.spotify.com/playlist/<id> when external_urls is missing (E6)", async () => {
    const { fetch } = fakeFetch([
      { status: 201, body: createdPlaylistBody(E6_PLAYLIST_ID, { withExternalUrls: false }) },
      added,
    ]);

    const result = await createSetlistPlaylist(fixtureS, e6Matches, { accessToken: TOKEN, fetch, sleep: fakeSleep().sleep });

    expect(result.shareUrl).toBe("https://open.spotify.com/playlist/7GhIjKlMnOpQrStUvWxYzA");
  });

  it("AC-15: uses the share link from the create response when present", async () => {
    const body = createdPlaylistBody(E6_PLAYLIST_ID);
    body.external_urls = { spotify: "https://open.spotify.com/playlist/7GhIjKlMnOpQrStUvWxYzA?si=abc" };
    const { fetch } = fakeFetch([{ status: 201, body }, added]);

    const result = await createSetlistPlaylist(fixtureS, e6Matches, { accessToken: TOKEN, fetch, sleep: fakeSleep().sleep });

    expect(result.shareUrl).toBe("https://open.spotify.com/playlist/7GhIjKlMnOpQrStUvWxYzA?si=abc");
  });

  it("AC-16: an empty list of Matches raises a typed 'nothing to add' error and sends no request (E8)", async () => {
    const { fetch, requests } = fakeFetch([created(E6_PLAYLIST_ID), added]);

    const err = await captureError(
      createSetlistPlaylist(fixtureS, [], { accessToken: TOKEN, fetch, sleep: fakeSleep().sleep }),
    );

    expect(err).toBeInstanceOf(NothingToAddError);
    expect(requests).toHaveLength(0);
  });
});

describe("Creating — rate limits", () => {
  it("AC-17: create answered 429 Retry-After: 2 waits 2 s, resends the same create, then adds items (E9)", async () => {
    const { fetch, requests } = fakeFetch([
      { status: 429, headers: { "Retry-After": "2" } },
      created(E6_PLAYLIST_ID),
      added,
    ]);
    const { sleep, waits } = fakeSleep();

    const result = await createSetlistPlaylist(fixtureS, e6Matches, { accessToken: TOKEN, fetch, sleep });

    expect(waits).toEqual([2000]);
    expect(requests).toHaveLength(3);
    expect(requests[1]!.url).toBe(CREATE_URL);
    expect(requests[1]!.method).toBe("POST");
    expect(jsonBody(requests[1])).toEqual(jsonBody(requests[0]));
    expect(requests[1]!.headers.get("Authorization")).toBe("Bearer BQD-test-token");
    expect(requests[2]!.url).toBe(itemsUrl(E6_PLAYLIST_ID));
    expect(result.id).toBe(E6_PLAYLIST_ID);
  });

  it("AC-17: add-items batch 2 answered 429 without Retry-After waits 1 s, resends the same URIs, then continues (E9)", async () => {
    const { fetch, requests } = fakeFetch([created(E7_PLAYLIST_ID), added, { status: 429 }, added, added]);
    const { sleep, waits } = fakeSleep();

    const result = await createSetlistPlaylist(fixtureS, e7Matches(), { accessToken: TOKEN, fetch, sleep });

    expect(waits).toEqual([1000]);
    expect(requests).toHaveLength(5);
    expect(urisOf(requests[3])).toEqual(urisOf(requests[2]));
    expect(urisOf(requests[4])).toHaveLength(50);
    expect(result.trackCount).toBe(250);
  });

  it("AC-17: each add-items batch has its own budget of 3 retries (E9)", async () => {
    const { fetch, requests } = fakeFetch([
      created(E7_PLAYLIST_ID),
      limited,
      added,
      limited,
      limited,
      limited,
      added,
      added,
    ]);
    const { sleep, waits } = fakeSleep();

    const result = await createSetlistPlaylist(fixtureS, e7Matches(), { accessToken: TOKEN, fetch, sleep });

    expect(result.trackCount).toBe(250);
    expect(requests).toHaveLength(8);
    expect(waits).toEqual([1000, 1000, 1000, 1000]);
  });

  it("AC-17: create answered 429 four times raises a rate-limit error after 4 requests; no add-items (E9)", async () => {
    const { fetch, requests } = fakeFetch([limited, limited, limited, limited, created(E6_PLAYLIST_ID), added]);
    const { sleep, waits } = fakeSleep();

    const err = await captureError(createSetlistPlaylist(fixtureS, e6Matches, { accessToken: TOKEN, fetch, sleep }));

    expect(findInChain(err, PlaylistRateLimitError)).toBeDefined();
    expect(errorText(err)).toMatch(/rate[- ]?limit/i);
    expect(requests).toHaveLength(4);
    expect(requests.every((r) => r.url === CREATE_URL)).toBe(true);
    expect(waits).toEqual([1000, 1000, 1000]);
  });
});

describe("Creating — other failures", () => {
  it("AC-18: create answered 401 raises a typed Spotify error with status and Spotify's message, no retry (E10)", async () => {
    const { fetch, requests } = fakeFetch([
      { status: 401, body: { error: { status: 401, message: "The access token expired" } } },
      created(E6_PLAYLIST_ID),
      added,
    ]);
    const { sleep, waits } = fakeSleep();

    const err = await captureError(createSetlistPlaylist(fixtureS, e6Matches, { accessToken: TOKEN, fetch, sleep }));

    const spotifyError = findInChain(err, SpotifyPlaylistError);
    expect(spotifyError).toBeDefined();
    expect(spotifyError!.status).toBe(401);
    expect(errorText(err)).toMatch(/401/);
    expect(errorText(err)).toContain("The access token expired");
    expect(requests).toHaveLength(1);
    expect(waits).toEqual([]);
  });

  it.each([400, 404, 500])("AC-18: create answered %i raises a typed Spotify error at once, no retry", async (status) => {
    const { fetch, requests } = fakeFetch([{ status }, created(E6_PLAYLIST_ID), added]);

    const err = await captureError(
      createSetlistPlaylist(fixtureS, e6Matches, { accessToken: TOKEN, fetch, sleep: fakeSleep().sleep }),
    );

    expect(findInChain(err, SpotifyPlaylistError)?.status).toBe(status);
    expect(errorText(err)).toContain(String(status));
    expect(requests).toHaveLength(1);
  });

  it("AC-19: a 401 on create says no playlist was created; 1 request in total (E10)", async () => {
    const { fetch, requests } = fakeFetch([
      { status: 401, body: { error: { status: 401, message: "The access token expired" } } },
      created(E6_PLAYLIST_ID),
      added,
    ]);

    const err = await captureError(
      createSetlistPlaylist(fixtureS, e6Matches, { accessToken: TOKEN, fetch, sleep: fakeSleep().sleep }),
    );

    expect(errorText(err)).toMatch(/no playlist was created/i);
    expect(err).not.toBeInstanceOf(PartlyCreatedPlaylistError);
    expect(requests).toHaveLength(1);
  });

  it("AC-19: a 403 on create sends no add-items request (E10)", async () => {
    const { fetch, requests } = fakeFetch([
      { status: 403, body: { error: { status: 403, message: "Insufficient client scope" } } },
      created(E6_PLAYLIST_ID),
      added,
    ]);

    const err = await captureError(
      createSetlistPlaylist(fixtureS, e6Matches, { accessToken: TOKEN, fetch, sleep: fakeSleep().sleep }),
    );

    expect(findInChain(err, SpotifyPlaylistError)?.status).toBe(403);
    expect(errorText(err)).toMatch(/403/);
    expect(errorText(err)).toMatch(/no playlist was created/i);
    expect(requests.some((r) => r.url.endsWith("/items"))).toBe(false);
  });

  it("AC-19: a network failure on create says no playlist was created; no add-items request (E10)", async () => {
    const { fetch, requests } = fakeFetch([{ throws: new TypeError("network unreachable") }, created(E6_PLAYLIST_ID), added]);

    const err = await captureError(
      createSetlistPlaylist(fixtureS, e6Matches, { accessToken: TOKEN, fetch, sleep: fakeSleep().sleep }),
    );

    expect(err).toBeInstanceOf(Error);
    expect(errorText(err)).toMatch(/no playlist was created/i);
    expect(requests).toHaveLength(1);
  });

  it("AC-19: four 429s on create say no playlist was created (E9)", async () => {
    const { fetch } = fakeFetch([limited, limited, limited, limited]);

    const err = await captureError(
      createSetlistPlaylist(fixtureS, e6Matches, { accessToken: TOKEN, fetch, sleep: fakeSleep().sleep }),
    );

    expect(errorText(err)).toMatch(/no playlist was created/i);
  });

  it("AC-20: batch 2 answered 400 raises 'partly created' with id, share link, 100 added, 250 total and the cause (E11)", async () => {
    const { fetch, requests } = fakeFetch([
      created(E7_PLAYLIST_ID),
      added,
      { status: 400, body: { error: { status: 400, message: "Invalid base62 id" } } },
      added,
    ]);
    const { sleep, waits } = fakeSleep();

    const err = await captureError(createSetlistPlaylist(fixtureS, e7Matches(), { accessToken: TOKEN, fetch, sleep }));

    expect(err).toBeInstanceOf(PartlyCreatedPlaylistError);
    const partly = err as PartlyCreatedPlaylistError;
    expect(partly.playlistId).toBe(E7_PLAYLIST_ID);
    expect(partly.shareUrl).toBe("https://open.spotify.com/playlist/8HiJkLmNoPqRsTuVwXyZaB");
    expect(partly.tracksAdded).toBe(100);
    expect(partly.totalMatches).toBe(250);
    const cause = findInChain(partly.cause, SpotifyPlaylistError);
    expect(cause).toBeDefined();
    expect(cause!.status).toBe(400);
    expect(errorText(err)).toContain("Invalid base62 id");
    expect(requests).toHaveLength(3);
    expect(requests.some((r) => r.method === "DELETE")).toBe(false);
    expect(waits).toEqual([]);
  });

  it("AC-20: batch 1 answered 429 four times raises 'partly created' with 0 added and a rate-limit cause (E11)", async () => {
    const { fetch, requests } = fakeFetch([created(E7_PLAYLIST_ID), limited, limited, limited, limited, added, added]);
    const { sleep } = fakeSleep();

    const err = await captureError(createSetlistPlaylist(fixtureS, e7Matches(), { accessToken: TOKEN, fetch, sleep }));

    expect(err).toBeInstanceOf(PartlyCreatedPlaylistError);
    const partly = err as PartlyCreatedPlaylistError;
    expect(partly.tracksAdded).toBe(0);
    expect(partly.totalMatches).toBe(250);
    expect(partly.playlistId).toBe(E7_PLAYLIST_ID);
    expect(findInChain(partly.cause, PlaylistRateLimitError)).toBeDefined();
    expect(requests).toHaveLength(5);
  });

  it("AC-20: a network failure while adding items raises 'partly created' with the fallback share link", async () => {
    const { fetch, requests } = fakeFetch([
      { status: 201, body: createdPlaylistBody(E7_PLAYLIST_ID, { withExternalUrls: false }) },
      added,
      added,
      { throws: new TypeError("network unreachable") },
    ]);

    const err = await captureError(
      createSetlistPlaylist(fixtureS, e7Matches(), { accessToken: TOKEN, fetch, sleep: fakeSleep().sleep }),
    );

    expect(err).toBeInstanceOf(PartlyCreatedPlaylistError);
    const partly = err as PartlyCreatedPlaylistError;
    expect(partly.tracksAdded).toBe(200);
    expect(partly.totalMatches).toBe(250);
    expect(partly.shareUrl).toBe("https://open.spotify.com/playlist/8HiJkLmNoPqRsTuVwXyZaB");
    expect(partly.cause).toBeDefined();
    expect(requests).toHaveLength(4);
  });
});

describe("Access token never leaks", () => {
  it("AC-21: no create/add error text contains the access token (E10, E11)", async () => {
    const scenarios: FakeAnswer[][] = [
      [{ status: 401, body: { error: { status: 401, message: "The access token expired" } } }],
      [{ status: 403, body: { error: { status: 403, message: "Insufficient client scope" } } }],
      [{ throws: new TypeError("network unreachable") }],
      [limited, limited, limited, limited],
      [created(E7_PLAYLIST_ID), added, { status: 400, body: { error: { status: 400, message: "Invalid base62 id" } } }],
      [created(E7_PLAYLIST_ID), limited, limited, limited, limited],
    ];
    for (const answers of scenarios) {
      const { fetch } = fakeFetch(answers);
      const err = await captureError(
        createSetlistPlaylist(fixtureS, e7Matches(), { accessToken: TOKEN, fetch, sleep: fakeSleep().sleep }),
      );
      expect(err).toBeInstanceOf(Error);
      expect(errorText(err)).not.toContain(TOKEN);
    }
  });

  it("AC-21: the 'nothing to add' error does not contain the access token", async () => {
    const err = await captureError(
      createSetlistPlaylist(fixtureS, [], { accessToken: TOKEN, fetch: fakeFetch([]).fetch, sleep: fakeSleep().sleep }),
    );
    expect(errorText(err)).not.toContain(TOKEN);
  });

  it("AC-21: the 'partly created' error's own fields never hold the access token", async () => {
    const { fetch } = fakeFetch([created(E7_PLAYLIST_ID), added, { status: 500 }]);
    const err = await captureError(
      createSetlistPlaylist(fixtureS, e7Matches(), { accessToken: TOKEN, fetch, sleep: fakeSleep().sleep }),
    );
    expect(JSON.stringify(err, Object.getOwnPropertyNames(err))).not.toContain(TOKEN);
  });
});

describe("Only allowed Spotify endpoints", () => {
  it("AC-22: every request across E3, E6, E7 and E11 goes to https://api.spotify.com/, never /v1/users/ or /tracks (E12)", async () => {
    const all: RecordedRequest[] = [];

    const e3 = fakeFetch([
      { status: 200, body: e3Page1 },
      { status: 200, body: e3Page2 },
    ]);
    await findPlaylistsNamed(FIXTURE_S_NAME, { accessToken: TOKEN, fetch: e3.fetch, sleep: fakeSleep().sleep });
    all.push(...e3.requests);

    const e6 = fakeFetch([created(E6_PLAYLIST_ID), added]);
    await createSetlistPlaylist(fixtureS, e6Matches, { accessToken: TOKEN, fetch: e6.fetch, sleep: fakeSleep().sleep });
    all.push(...e6.requests);

    const e7 = fakeFetch([created(E7_PLAYLIST_ID), added, added, added]);
    await createSetlistPlaylist(fixtureS, e7Matches(), { accessToken: TOKEN, fetch: e7.fetch, sleep: fakeSleep().sleep });
    all.push(...e7.requests);

    const e11 = fakeFetch([
      created(E7_PLAYLIST_ID),
      added,
      { status: 400, body: { error: { status: 400, message: "Invalid base62 id" } } },
    ]);
    await captureError(
      createSetlistPlaylist(fixtureS, e7Matches(), { accessToken: TOKEN, fetch: e11.fetch, sleep: fakeSleep().sleep }),
    );
    all.push(...e11.requests);

    expect(all.length).toBe(2 + 2 + 4 + 3);
    for (const request of all) {
      expect(request.url.startsWith("https://api.spotify.com/")).toBe(true);
      expect(request.url).not.toContain("/v1/users/");
      expect(new URL(request.url).pathname.endsWith("/tracks")).toBe(false);
      expect(
        request.url.startsWith("https://api.spotify.com/v1/me/playlists") ||
          /^https:\/\/api\.spotify\.com\/v1\/playlists\/[^/]+\/items$/.test(request.url),
      ).toBe(true);
    }
  });
});
