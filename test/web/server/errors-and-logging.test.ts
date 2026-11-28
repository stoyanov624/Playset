// Errors, logging and leaks (X3): Visitor wording only, every secret redacted in the log, no
// Visitor address in the log, and answers the contract rejects turned into INTERNAL.
import request from "supertest";
import { describe, expect, it } from "vitest";
import {
  createMemorySetlistPlaylistRecords,
  createOrUpdateSetlistPlaylist,
  prepareSetlist,
  type Match,
} from "../../../src/core/index.js";
import { bareError, expectCatalogueError } from "./fixtures/catalogue";
import {
  A,
  CLIENT_ID,
  COOKIE_SECRET,
  HOST_ID,
  HOST_TOKEN,
  SECRETS,
  SETLISTFM_KEY,
  expectNoLeaks,
  frameNames,
  httpError,
  makeHarness,
  networkFailure,
  parseSse,
  setlistFmRateLimited,
  spotifyRateLimited,
  spotifyStatus,
  type Harness,
} from "./fixtures/harness";
import type { CatalogueId } from "./fixtures/catalogue";
import {
  FIXTURE_A_ID,
  H_ID,
  H_URL,
  H_V1,
  H_V2,
  MADRID_ID,
  MADRID_VERSION,
  PLAYLIST_ID,
  SHARE_URL,
  fixtureHv1,
  fixtureHv2,
  madridSetlist,
  tooLongDescription,
  variant,
} from "./fixtures/setlists";

async function captureError(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (err) {
    return err as Error;
  }
  throw new Error("expected a failure");
}

async function previewText(h: ReturnType<typeof makeHarness>, id: string) {
  const res = await h.getStream(`/api/setlists/${id}/preview`);
  return { res, text: typeof res.body === "string" ? res.body : res.text };
}

// ---------------------------------------------------------------- AC-7

describe("error answers carry the catalogue only (AC-7)", () => {
  it("AC-7: X3 — a plain Error naming a URL, the key and the token → 500 E-25 with nothing of the error in the answer", async () => {
    const h = makeHarness();
    h.overrides.getSetlist = async () => {
      throw new Error(`boom at https://api.setlist.fm/rest/1.0/setlist/2bf1c8e4 key=${SETLISTFM_KEY} token=${HOST_TOKEN}`);
    };
    const res = await h.get(`/api/setlists/${H_ID}`);
    expectCatalogueError(res, "E-25");
    expect(res.body).toStrictEqual({
      error: { code: "INTERNAL", message: "Something went wrong on our side.", hint: "Please try again in a minute." },
    });
    expect(res.text).not.toContain("boom");
    expect(res.text).not.toContain("api.setlist.fm");
    expectNoLeaks(res);
  });

  it("AC-7: a core error's own message and hint are never sent (setlist not found)", async () => {
    const h = makeHarness();
    const res = await h.get("/api/setlists/00000000");
    expectCatalogueError(res, "E-9");
    const coreError = await captureError(h.core.getSetlist("00000000"));
    expect(res.text).not.toContain(coreError.message);
    const hint = (coreError as { hint?: string }).hint;
    if (hint !== undefined) expect(res.text).not.toContain(hint);
  });

  it("AC-7: an upstream status and body are never sent (setlist.fm 503 with a body)", async () => {
    const h = makeHarness({
      setlists: {
        [H_ID]: () =>
          new Response(JSON.stringify({ code: 503, status: "Service Unavailable", message: "maintenance window /var/lib" }), {
            status: 503,
            headers: { "Content-Type": "application/json" },
          }),
      },
    });
    const res = await h.get(`/api/setlists/${H_ID}`);
    expectCatalogueError(res, "E-16");
    for (const s of ["503", "maintenance", "/var/lib", "Service Unavailable"]) expect(res.text).not.toContain(s);
  });

  it("AC-7: the Setlist-changed answer names neither version", async () => {
    const h = makeHarness({ setlists: { [H_ID]: fixtureHv2() } });
    const res = await h.post(`/api/setlists/${H_ID}/playlist`, { versionId: H_V1 });
    expectCatalogueError(res, "E-24");
    expect(res.text).not.toContain(H_V1);
    expect(res.text).not.toContain(H_V2);
  });

  it("AC-7: the partly-updated answer names no playlist id, count or status", async () => {
    const h = makeHarness({ setlists: { [H_ID]: fixtureHv2() } });
    await h.records.saveRecord({ setlistId: H_ID, playlistId: PLAYLIST_ID, shareUrl: SHARE_URL, versionId: H_V1, createdAt: "2026-11-27T18:04:05.000Z" });
    h.spotify.playlistAnswers[1] = spotifyStatus(404, "Resource not found");
    const res = await h.post(`/api/setlists/${H_ID}/playlist`, { versionId: H_V2 });
    expectCatalogueError(res, "E-19");
    for (const s of [PLAYLIST_ID, "404", "5 of 5", "Resource not found"]) expect(res.text).not.toContain(s);
  });
});

describe("a core error's own words never reach the Visitor (AC-7)", () => {
  const leaveOutTapes = { keepTape: async () => false };
  const hostOptions = () => ({ accessToken: HOST_TOKEN, records: createMemorySetlistPlaylistRecords(), now: () => Date.parse("2026-11-28T14:30:00.000Z") });

  /** The answer holds neither the core error's message nor its hint. */
  function expectNoCoreWords(res: { text: string }, coreError: Error) {
    expect(coreError.message.length).toBeGreaterThan(0);
    expect(res.text).not.toContain(coreError.message);
    const hint = (coreError as { hint?: unknown }).hint;
    if (typeof hint === "string" && hint !== "") expect(res.text).not.toContain(hint);
  }

  it("AC-7: E-7 (nothing to add) sends the catalogue's words, not the core's", async () => {
    const h = makeHarness();
    h.spotify.tracks = {};
    const res = await h.post(`/api/setlists/${H_ID}/playlist`, { versionId: H_V1 });
    expectCatalogueError(res, "E-7");
    const coreError = await captureError(createOrUpdateSetlistPlaylist(h.core, fixtureHv1(), H_V1, hostOptions()));
    expect(coreError.constructor.name).toBe("NothingToAddError");
    expectNoCoreWords(res, coreError);
  });

  it("AC-7: E-8 (description too long) sends the catalogue's words, not the core's", async () => {
    const h = makeHarness({ setlists: { [FIXTURE_A_ID]: tooLongDescription() } });
    const res = await h.get(`/api/setlists/${FIXTURE_A_ID}`);
    expectCatalogueError(res, "E-8");
    const coreError = await captureError(prepareSetlist(tooLongDescription(), leaveOutTapes));
    expect(coreError.constructor.name).toBe("DescriptionTooLongError");
    expectNoCoreWords(res, coreError);
  });

  it("AC-7: E-20 (no version) on a create sends the catalogue's words, not the core's", async () => {
    const h = makeHarness();
    const res = await h.post(`/api/setlists/${FIXTURE_A_ID}/playlist`, { versionId: "g6bd2a6f2" });
    expectCatalogueError(res, "E-20");
    const fixtureA = await h.core.getSetlist(FIXTURE_A_ID);
    const coreError = await captureError(createOrUpdateSetlistPlaylist(h.core, fixtureA, "g6bd2a6f2", hostOptions()));
    expect(coreError.constructor.name).toBe("MissingSetlistVersionError");
    expectNoCoreWords(res, coreError);
    expect(res.text).not.toContain(FIXTURE_A_ID);
  });
});

describe("the core's generic request error (AC-7)", () => {
  it.each([
    ["rate-limited", "E-21"],
    ["status", "E-22"],
    ["network", "E-22"],
  ] as const)("AC-7: a generic request error of kind %s → %s", async (kind, id) => {
    const error = await httpError(kind);
    const h = makeHarness();
    h.overrides.getSetlist = async () => {
      throw error;
    };
    const res = await h.get(`/api/setlists/${H_ID}`);
    expectCatalogueError(res, id);
    expect(res.text).not.toContain(error.message);
    expectNoLeaks(res);
    if (id === "E-21") {
      expect(h.log.of("warn")).toHaveLength(1);
      expect(h.log.of("error")).toEqual([]);
      expect(h.hits.added).toEqual([]);
    } else {
      expect(h.log.of("error")).toHaveLength(1);
    }
  });

  it.each([
    ["rate-limited", "E-21"],
    ["status", "E-22"],
    ["network", "E-22"],
  ] as const)("AC-7: a generic request error of kind %s on a create → %s, no event, nothing counted against the limits", async (kind, id) => {
    const error = await httpError(kind);
    const h = makeHarness();
    h.overrides.getSetlist = async () => {
      throw error;
    };
    const res = await h.post(`/api/setlists/${H_ID}/playlist`, { versionId: H_V1 });
    expectCatalogueError(res, id);
    expect(res.text).not.toContain(error.message);
    expect(h.usage.recorded).toEqual([]);
    expect(h.hits.added).toEqual([]);
    expectNoLeaks(res);
  });
});

// ---------------------------------------------------------------- AC-8

describe("logging (AC-8)", () => {
  it("AC-8: X3 — the INTERNAL error is logged once through logger.error, every secret replaced by [redacted], no address", async () => {
    const h = makeHarness();
    h.overrides.getSetlist = async () => {
      throw new Error(`boom at https://api.setlist.fm/rest/1.0/setlist/2bf1c8e4 key=${SETLISTFM_KEY} token=${HOST_TOKEN}`);
    };
    await h.get(`/api/setlists/${H_ID}`);
    const errors = h.log.of("error");
    expect(errors).toHaveLength(1);
    const text = h.log.textOf(errors[0]!);
    expect(text).toContain("boom at https://api.setlist.fm/rest/1.0/setlist/2bf1c8e4 key=[redacted] token=[redacted]");
    const all = h.log.allText();
    for (const secret of SECRETS) expect(all).not.toContain(secret);
    expect(all).not.toContain(A);
  });

  it("AC-8: every secret is redacted, also in the error's cause", async () => {
    const h = makeHarness();
    h.overrides.getSetlist = async () => {
      throw new Error(`outer ${CLIENT_ID}`, {
        cause: new Error(`inner ${COOKIE_SECRET} ${HOST_ID} ${SETLISTFM_KEY} ${HOST_TOKEN}`),
      });
    };
    await h.get(`/api/setlists/${H_ID}`);
    expect(h.log.of("error")).toHaveLength(1);
    const text = h.log.textOf(h.log.of("error")[0]!);
    expect(text).toContain("outer [redacted]");
    expect(text).toContain("inner [redacted] [redacted] [redacted] [redacted]");
    for (const secret of SECRETS) expect(h.log.allText()).not.toContain(secret);
  });

  it("AC-8: an UPSTREAM_UNAVAILABLE answer (setlist.fm network failure) is logged once as an error with the core error's message and cause", async () => {
    const h = makeHarness({ setlists: { [H_ID]: networkFailure } });
    expectCatalogueError(await h.get(`/api/setlists/${H_ID}`), "E-16");
    const errors = h.log.of("error");
    expect(errors).toHaveLength(1);
    const coreError = await captureError(h.core.getSetlist(H_ID));
    const text = h.log.textOf(errors[0]!);
    expect(text).toContain(coreError.message);
    const cause = (coreError as { cause?: unknown }).cause;
    if (cause instanceof Error) expect(text).toContain(cause.message);
    expect(h.log.of("warn")).toEqual([]);
  });

  it("AC-8: the missing-setlist.fm-key error (E-25) is logged once as an error", async () => {
    const h = makeHarness({ setlistFmKey: null });
    expectCatalogueError(await h.get("/api/artists?name=Genesis"), "E-25");
    expect(h.log.of("error")).toHaveLength(1);
  });

  it("AC-8: an upstream rate limit (E-14) is logged once as a warning, not as an error", async () => {
    const h = makeHarness({ setlists: { [H_ID]: setlistFmRateLimited } });
    expectCatalogueError(await h.get(`/api/setlists/${H_ID}`), "E-14");
    expect(h.log.of("warn")).toHaveLength(1);
    expect(h.log.of("error")).toEqual([]);
  });

  it("AC-8: a Spotify 401 on create (E-23) is logged once as a warning", async () => {
    const h = makeHarness();
    h.spotify.playlistAnswers[0] = spotifyStatus(401, "The access token expired");
    expectCatalogueError(await h.post(`/api/setlists/${H_ID}/playlist`, { versionId: H_V1 }), "E-23");
    expect(h.log.of("warn")).toHaveLength(1);
    expect(h.log.of("error")).toEqual([]);
    expect(h.log.allText()).not.toContain(HOST_TOKEN);
  });

  it("AC-8: a partly-created playlist (E-18) is logged once as an error", async () => {
    const h = makeHarness();
    h.spotify.playlistAnswers[1] = spotifyStatus(500);
    const res = await h.post(`/api/setlists/${H_ID}/playlist`, { versionId: H_V1 });
    expect(res.status).toBe(502);
    expect(h.log.of("error")).toHaveLength(1);
  });

  // One row per catalogue entry the AC names a log level for, on the route that most often meets it.
  const levelCases: Array<[string, CatalogueId, "warn" | "error", (h: Harness) => Promise<{ status: number; body: unknown; headers: Record<string, string | string[] | undefined> }>, Partial<Parameters<typeof makeHarness>[0]>?]> = [
    ["setlist.fm busy on a create", "E-14", "warn", (h) => h.post(`/api/setlists/${H_ID}/playlist`, { versionId: H_V1 }), { setlists: { [H_ID]: setlistFmRateLimited } }],
    [
      "Spotify busy on a create (the replace answers 429 four times)",
      "E-15",
      "warn",
      async (h) => {
        await h.records.saveRecord({ setlistId: H_ID, playlistId: PLAYLIST_ID, shareUrl: SHARE_URL, versionId: H_V1, createdAt: "2026-11-27T18:04:05.000Z" });
        for (let i = 0; i < 4; i++) h.spotify.playlistAnswers[i] = spotifyRateLimited;
        return h.post(`/api/setlists/${H_ID}/playlist`, { versionId: H_V2 });
      },
      { setlists: { [H_ID]: fixtureHv2() } },
    ],
    ["setlist.fm down on a create", "E-16", "error", (h) => h.post(`/api/setlists/${H_ID}/playlist`, { versionId: H_V1 }), { setlists: { [H_ID]: networkFailure } }],
    [
      "Spotify down on a create (403)",
      "E-17",
      "error",
      (h) => {
        h.spotify.playlistAnswers[0] = spotifyStatus(403, "Insufficient client scope");
        return h.post(`/api/setlists/${H_ID}/playlist`, { versionId: H_V1 });
      },
    ],
    [
      "partly updated on a create (the rename answers 404)",
      "E-19",
      "error",
      async (h) => {
        await h.records.saveRecord({ setlistId: H_ID, playlistId: PLAYLIST_ID, shareUrl: SHARE_URL, versionId: H_V1, createdAt: "2026-11-27T18:04:05.000Z" });
        h.spotify.playlistAnswers[1] = spotifyStatus(404, "Resource not found");
        return h.post(`/api/setlists/${H_ID}/playlist`, { versionId: H_V2 });
      },
      { setlists: { [H_ID]: fixtureHv2() } },
    ],
    ["no version on a create (Fixture A)", "E-20", "error", (h) => h.post(`/api/setlists/${FIXTURE_A_ID}/playlist`, { versionId: "g6bd2a6f2" })],
    ["no version on a preview (Madrid)", "E-20", "error", (h) => h.get(`/api/setlists/${MADRID_ID}/preview`), { setlists: { [MADRID_ID]: madridSetlist(null) } }],
    [
      "a music service busy on a create",
      "E-21",
      "warn",
      async (h) => {
        const error = await httpError("rate-limited");
        h.overrides.getSetlist = async () => {
          throw error;
        };
        return h.post(`/api/setlists/${H_ID}/playlist`, { versionId: H_V1 });
      },
    ],
    [
      "a music service down on a create",
      "E-22",
      "error",
      async (h) => {
        const error = await httpError("network");
        h.overrides.getSetlist = async () => {
          throw error;
        };
        return h.post(`/api/setlists/${H_ID}/playlist`, { versionId: H_V1 });
      },
    ],
    [
      "an unknown error on a create",
      "E-25",
      "error",
      (h) => {
        h.overrides.getSetlist = async () => {
          throw new Error(`boom ${SETLISTFM_KEY}`);
        };
        return h.post(`/api/setlists/${H_ID}/playlist`, { versionId: H_V1 });
      },
    ],
  ];

  it.each(levelCases)("AC-8: %s (%s) is logged once through logger.%s, and at no other level", async (_why, id, level, act, opts) => {
    const h = makeHarness(opts);
    const atBuild = h.log.calls.length;
    expectCatalogueError(await act(h), id);
    const calls = h.log.calls.slice(atBuild);
    expect(calls.map((c) => c.level)).toEqual([level]);
    const all = h.log.allText();
    for (const secret of SECRETS) expect(all).not.toContain(secret);
    expect(all).not.toContain(A);
  });

  it("AC-8: the logged line carries the core error's message and its cause (a music service down on a create)", async () => {
    const error = await httpError("network");
    const h = makeHarness();
    h.overrides.getSetlist = async () => {
      throw error;
    };
    expectCatalogueError(await h.post(`/api/setlists/${H_ID}/playlist`, { versionId: H_V1 }), "E-22");
    const text = h.log.textOf(h.log.of("error")[0]!);
    expect(text).toContain(error.message);
    const cause = (error as { cause?: unknown }).cause;
    if (cause instanceof Error) expect(text).toContain(cause.message);
  });

  it("AC-8: E-6 (too large), E-8 (description too long) and E-13 (daily limit) are not logged at all", async () => {
    const h = makeHarness({ env: { PLAYSET_DAILY_LIMIT: "1" }, setlists: { [FIXTURE_A_ID]: tooLongDescription() } });
    const atBuild = h.log.calls.length;
    const big = `{"versionId":"g4bd1a2f6","pad":"${"x".repeat(10_300)}"}`;
    expectCatalogueError(
      await request(h.app).post(`/api/setlists/${H_ID}/playlist`).set("X-Forwarded-For", A).set("Content-Type", "application/json").send(big),
      "E-6",
    );
    expectCatalogueError(await h.get(`/api/setlists/${FIXTURE_A_ID}`), "E-8");
    expect((await h.post(`/api/setlists/${H_ID}/playlist`, { versionId: H_V1 })).status).toBe(200);
    expectCatalogueError(await h.post(`/api/setlists/${MADRID_ID}/playlist`, { versionId: MADRID_VERSION }, "198.51.100.4"), "E-13", 34200);
    expect(h.log.calls.slice(atBuild)).toEqual([]);
  });

  it("AC-8: Visitor errors E-1 to E-13 and E-24 are not logged as errors", async () => {
    const h = makeHarness({ env: { PLAYSET_PREVIEW_LIMIT: "1", PLAYSET_CREATE_LIMIT: "1", PLAYSET_DAILY_LIMIT: "5" } });
    await h.get("/api/artists"); // E-1
    await h.get("/api/artists/83b9cbe7/setlists"); // E-2
    await h.get("/api/setlist-links?url=https://example.com/x"); // E-3
    await h.get("/api/setlists/63a5e2bz"); // E-4
    await h.post(`/api/setlists/${H_ID}/playlist`, {}); // E-5
    await h.get("/api/setlists/00000000"); // E-9
    await h.get("/api/nope"); // E-10
    await h.getStream(`/api/setlists/${MADRID_ID}/preview`);
    await h.get(`/api/setlists/${H_ID}/preview`); // E-11
    h.setlists[H_ID] = fixtureHv2();
    await h.post(`/api/setlists/${H_ID}/playlist`, { versionId: H_V1 }); // E-24
    await h.post(`/api/setlists/${MADRID_ID}/playlist`, { versionId: MADRID_VERSION }); // E-12
    h.spotify.tracks = {};
    await h.post(`/api/setlists/${H_ID}/playlist`, { versionId: H_V2 }, "198.51.100.4"); // E-7
    expect(h.log.of("error")).toEqual([]);
    expect(h.log.allText()).not.toContain(A);
    expect(h.log.allText()).not.toContain("198.51.100.4");
  });

  it("AC-8: no access log: a successful request logs nothing", async () => {
    const h = makeHarness();
    const atBuild = h.log.calls.length;
    await h.get(`/api/setlists/${H_ID}`);
    await h.get("/api/setlist-links?url=https://www.setlist.fm/setlist/pearl-jam/2026/moda-center-portland-or-2bf1c8e4.html");
    expect(h.log.calls.slice(atBuild)).toEqual([]);
  });
});

// ---------------------------------------------------------------- AC-9

describe("answers the contract rejects (AC-9)", () => {
  it("AC-9: a Show URL that isn't an https setlist.fm link → 500 E-25, logged; the URL never sent", async () => {
    const h = makeHarness({
      setlists: { [H_ID]: variant(fixtureHv1(), { url: "http://www.setlist.fm/setlist/pearl-jam/2026/moda-center-portland-or-2bf1c8e4.html" }) },
    });
    const res = await h.get(`/api/setlists/${H_ID}`);
    expectCatalogueError(res, "E-25");
    expect(res.text).not.toContain("http://www.setlist.fm");
    expect(h.log.of("error")).toHaveLength(1);
    expect(h.usage.recorded).toEqual([]);
  });

  it("AC-9: a Match with no artist during a preview → an error event with E-25; no preview event", async () => {
    const h = makeHarness();
    h.matching.replace = (performance) =>
      performance.title === "Release"
        ? ({
            kind: "match",
            uri: "spotify:track:4xGvbS8NnKtwKw5CXGkmA9",
            id: "4xGvbS8NnKtwKw5CXGkmA9",
            name: "Release",
            artists: [],
            album: "Ten",
            live: false,
          } as Match)
        : undefined;
    const { res, text } = await previewText(h, H_ID);
    expect(res.status).toBe(200);
    const { frames } = parseSse(text);
    expect(frameNames(frames).at(-1)).toBe("error INTERNAL");
    expect(frames.at(-1)!.data).toStrictEqual(bareError("E-25"));
    expect(frameNames(frames)).not.toContain("preview");
    expectNoLeaks(text);
    expect(h.log.of("error")).toHaveLength(1);
  });

  it("AC-9: a version longer than 64 characters is never sent: E-25 as JSON or as an error event", async () => {
    const longVersion = `g${"0".repeat(64)}`;
    const h = makeHarness({ setlists: { [H_ID]: variant(fixtureHv1(), { versionId: longVersion }) } });
    const { res, text } = await previewText(h, H_ID);
    expect(text).not.toContain(longVersion);
    if (res.status === 200) {
      const { frames } = parseSse(text);
      expect(frames.at(-1)!.data).toStrictEqual(bareError("E-25"));
      expect(frameNames(frames)).not.toContain("preview");
    } else {
      expectCatalogueError(res, "E-25");
    }
  });

  it("AC-9: a share link that isn't a plain open.spotify.com playlist link → 500 E-25 on the status route", async () => {
    const h = makeHarness();
    await h.records.saveRecord({
      setlistId: H_ID,
      playlistId: PLAYLIST_ID,
      shareUrl: `https://open.spotify.com/playlist/${PLAYLIST_ID}?si=abc`,
      versionId: H_V1,
      createdAt: "2026-11-27T18:04:05.000Z",
    });
    const res = await h.get(`/api/setlists/${H_ID}`);
    expectCatalogueError(res, "E-25");
    expect(res.text).not.toContain("?si=");
    expect(res.text).not.toContain(H_URL);
  });
});

describe("the core's generic request error with status 401 (AC-7)", () => {
  it("AC-7: a bare HttpError with status 401 on create → 503 E-23, logged as a warning; no event", async () => {
    const error = await httpError("status", 401);
    const h = makeHarness();
    h.overrides.getSetlist = async () => {
      throw error;
    };
    const res = await h.post(`/api/setlists/${H_ID}/playlist`, { versionId: H_V1 });
    expectCatalogueError(res, "E-23");
    expect(res.text).not.toContain(error.message);
    expect(h.usage.recorded).toEqual([]);
    expect(h.log.of("warn")).toHaveLength(1);
    expect(h.log.of("error")).toEqual([]);
  });
});

describe("redacting Host tokens handed out long ago (AC-8)", () => {
  it("AC-8: a Host token given out 3 refreshes earlier (and never again) is still [redacted] in the log", async () => {
    const tokens = [
      "BQAold1Rf5kLmN0pQx-9sTuVwXyZ_aBcDeFgHiJkLmNoPqRsTuV",
      "BQBold2Rf5kLmN0pQx-9sTuVwXyZ_aBcDeFgHiJkLmNoPqRsTuV",
      "BQCold3Rf5kLmN0pQx-9sTuVwXyZ_aBcDeFgHiJkLmNoPqRsTuV",
      "BQDnew4Rf5kLmN0pQx-9sTuVwXyZ_aBcDeFgHiJkLmNoPqRsTuV",
    ];
    const h = makeHarness({ env: { PLAYSET_CREATE_LIMIT: "10" } });
    for (const token of tokens) {
      h.host.mode = { kind: "connected", token };
      expect((await h.post(`/api/setlists/${H_ID}/playlist`, { versionId: H_V1 })).status).toBe(200);
    }
    h.host.mode = { kind: "rejects", error: new Error(`refresh failed: invalid_grant for ${tokens[0]}`) };
    expectCatalogueError(await h.get(`/api/setlists/${H_ID}/preview`), "E-23");
    const warnings = h.log.of("warn");
    expect(warnings).toHaveLength(1);
    expect(h.log.textOf(warnings[0]!)).toContain("refresh failed: invalid_grant for [redacted]");
    for (const token of tokens) expect(h.log.allText()).not.toContain(token);
  });
});
