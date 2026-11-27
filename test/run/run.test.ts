// PRD 0007 — the front-end-agnostic run (src/core/run).
// Every service (setlist.fm, Spotify token, Match search, duplicate check, creation) and every
// question/report of the front-end is a fake. No terminal, no network.
import { describe, expect, it } from "vitest";
import { DescriptionTooLongError } from "../../src/core/setlist-playlist";
import { runPlayset, type RunOptions } from "../../src/core/run/index.js";
import {
  AUTHORIZE_URL,
  CREATED_SHARE_URL,
  DUPLICATE,
  ExitPromptError,
  T1_URIS,
  TOKEN,
  fixtureRWithoutMisses,
  makeFakeFrontEnd,
  makeFakeServices,
  spotifyEvents,
  type FakeFrontEndOptions,
  type FakeServicesOptions,
} from "./fixtures/fake-services";
import {
  ARCTIC_MONKEYS_CANDIDATES,
  FIXTURE_A_PLAYLIST_NAME,
  FIXTURE_A_SETLIST_ID,
  FIXTURE_A_URL,
  GENESIS_CANDIDATES,
  announcedBerlinShow,
  bigSetlist,
  fixtureAShow,
  fixtureC,
  fixtureF,
  museRomeSetlist,
  onlyTapeSetlist,
  tooLongDescriptionSetlist,
} from "./fixtures/setlists";
import {
  PARTLY_CREATED_SHARE_URL,
  artistChoiceCancelledError,
  partlyCreatedPlaylistError,
  setlistFmRequestError,
  setlistNotFoundError,
  spotifySearchError,
} from "./fixtures/typed-errors";

const DEFAULT_OPTIONS: RunOptions = { tapes: "ask", confirm: "ask", public: false, dryRun: false };

interface SetupOptions {
  input?: string;
  options?: Partial<RunOptions>;
  services?: FakeServicesOptions;
  frontEnd?: FakeFrontEndOptions;
}

/** T1's set-up by default: ambiguous "arctic monkey", Fixture A, full login, one duplicate. */
function setup(opts: SetupOptions = {}) {
  const events: string[] = [];
  const fake = makeFakeServices(
    { candidates: ARCTIC_MONKEYS_CANDIDATES, fullLogin: true, duplicates: [DUPLICATE], ...opts.services },
    events,
  );
  const ui = makeFakeFrontEnd({ artistPick: 0, tapeAnswers: [true, false], confirm: true, ...opts.frontEnd }, events);
  const run = () =>
    runPlayset({
      input: opts.input ?? "arctic monkey",
      options: { ...DEFAULT_OPTIONS, ...opts.options },
      frontEnd: ui.frontEnd,
      services: fake.services,
    });
  return { run, events, calls: fake.calls, stats: fake.stats, record: ui.record };
}

async function captureError(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  throw new Error("Expected the run to fail, but it finished");
}

const indexOf = (events: string[], event: string) => {
  const i = events.indexOf(event);
  expect(i, `event "${event}" in ${JSON.stringify(events)}`).toBeGreaterThanOrEqual(0);
  return i;
};
const lastIndexOf = (events: string[], prefix: string) => {
  let last = -1;
  events.forEach((e, i) => {
    if (e.startsWith(prefix)) last = i;
  });
  return last;
};
const firstIndexOf = (events: string[], prefix: string) => events.findIndex((e) => e.startsWith(prefix));

// T1's kept Performances under PRD 0008 (P2): Fixture A's medley parts are kept Performances.
const T1_KEPT_TITLES = [
  "I Want It All",
  "Sculptures of Anything Goes",
  "Brianstorm",
  "Don't Sit Down 'Cause I've Moved Your Chair",
  "505",
  "Mardy Bum",
  "Teddy Picker",
  "Crying Lightning",
  "Cornerstone",
  "I Wanna Be Yours",
  "505",
  "Baby, I'm Yours",
  "R U Mine?",
];

// ---------------------------------------------------------------- input

describe("run — input", () => {
  it("AC-1: an Artist name is used for the Artist lookup and Latest Setlist search", async () => {
    const t = setup({ input: "Arctic Monkeys", services: { candidates: undefined } });
    await t.run();
    expect(t.calls.findLatest).toEqual(["Arctic Monkeys"]);
    expect(t.calls.getSetlist).toEqual([]);
  });

  it("AC-2: a setlist.fm link fetches that Setlist by id, with no Artist search and no Artist question", async () => {
    const t = setup({ input: FIXTURE_A_URL });
    await t.run();
    expect(t.calls.getSetlist).toEqual([FIXTURE_A_SETLIST_ID]);
    expect(t.calls.findLatest).toEqual([]);
    expect(t.record.artistQuestions).toEqual([]);
  });

  it("AC-3: a setlist.fm link that is not a Setlist page is rejected before any service is called", async () => {
    const t = setup({ input: "https://www.setlist.fm/setlists/arctic-monkeys-63d6a6b7.html" });
    const err = await captureError(t.run());
    expect((err as Error).message).toMatch(/not a Setlist/i);
    expect(t.events.filter((e) => e.startsWith("setlistfm:") || e.startsWith("spotify:"))).toEqual([]);
  });
});

// ---------------------------------------------------------------- choosing the Artist

describe("run — choosing the Artist", () => {
  it("AC-8: the front-end is asked once with the candidates in setlist.fm's order, and the pick is used", async () => {
    const t = setup({ frontEnd: { artistPick: 0 } });
    await t.run();
    expect(t.record.artistQuestions).toEqual([ARCTIC_MONKEYS_CANDIDATES]);
    expect(t.calls.chooserAnswers).toEqual([ARCTIC_MONKEYS_CANDIDATES[0]]);
    expect(t.events).toContain(`setlistfm:setlists:${ARCTIC_MONKEYS_CANDIDATES[0]!.mbid}`);
  });

  it("AC-8: picking the second Genesis uses its mbid for the Latest Setlist search (E1)", async () => {
    const t = setup({ input: "Genesis", services: { candidates: GENESIS_CANDIDATES }, frontEnd: { artistPick: 1 } });
    await t.run();
    expect(t.calls.chooserAnswers).toEqual([GENESIS_CANDIDATES[1]]);
    expect(t.events).toContain("setlistfm:setlists:2f4b1c6e-7a8d-4e9f-b0a1-c2d3e4f5a6b7");
  });

  it("AC-8: when setlist.fm picks the Artist automatically, the front-end is not asked", async () => {
    const t = setup({ input: "Arctic Monkeys", services: { candidates: undefined } });
    await t.run();
    expect(t.record.artistQuestions).toEqual([]);
  });
});

// ---------------------------------------------------------------- the Show

describe("run — the Show", () => {
  it("AC-9: the Show (Artist, date, venue, city, URL) and the Performance and Tape counts are given to the front-end before any Tape question or login", async () => {
    const t = setup();
    await t.run();
    expect(t.record.shows).toHaveLength(1);
    const summary = t.record.shows[0];
    expect(summary.show).toEqual(fixtureAShow);
    expect(summary.performanceCount).toBe(14);
    expect(summary.tapeCount).toBe(2);
    const shown = indexOf(t.events, "show:show");
    expect(shown).toBeLessThan(firstIndexOf(t.events, "ask:tape:"));
    expect(shown).toBeLessThan(indexOf(t.events, "spotify:getAccessToken"));
  });

  it("AC-10: a Setlist with no Performances gives 'no-performances' after the Show, with no Tape question and no Spotify call (E2)", async () => {
    const t = setup({ input: "https://www.setlist.fm/setlist/arctic-monkeys/2027/mercedes-benz-arena-berlin-germany-1bd2f5a8.html", services: { setlist: announcedBerlinShow() } });
    const outcome = await t.run();
    expect(outcome.kind).toBe("no-performances");
    expect(t.record.shows).toHaveLength(1);
    expect(t.record.shows[0].performanceCount).toBe(0);
    expect(t.record.shows[0].tapeCount).toBe(0);
    expect(t.record.tapeQuestions).toEqual([]);
    expect(t.calls.getAccessToken).toBe(0);
    expect(spotifyEvents(t.events)).toEqual([]);
  });

  it("AC-11: a too-long playlist description stops the run after the Show with PRD 0006's error, before any Tape question or Spotify call (E3)", async () => {
    const t = setup({ input: FIXTURE_A_URL, services: { setlist: tooLongDescriptionSetlist() } });
    const err = await captureError(t.run());
    expect(err).toBeInstanceOf(DescriptionTooLongError);
    expect(t.record.shows).toHaveLength(1);
    expect(t.record.tapeQuestions).toEqual([]);
    expect(t.calls.getAccessToken).toBe(0);
    expect(spotifyEvents(t.events)).toEqual([]);
  });
});

// ---------------------------------------------------------------- Tapes

describe("run — Tapes", () => {
  it("AC-12: asks about each Tape in played order with its title and Original Artist; a Yes keeps it at its played position", async () => {
    const t = setup({ frontEnd: { tapeAnswers: [true, false] } });
    await t.run();
    expect(t.record.tapeQuestions.map((p) => [p.title, p.originalArtist])).toEqual([
      ["I Want It All", "Queen"],
      ["Mr. Blue Sky", "Electric Light Orchestra"],
    ]);
    expect(t.calls.findMatch.map((c) => c.performance.title)).toEqual(T1_KEPT_TITLES);
  });

  it("AC-12: a Tape played twice is asked about twice; only the one answered Yes is kept (Fixture F)", async () => {
    const t = setup({ input: FIXTURE_A_URL, services: { setlist: fixtureF() }, frontEnd: { tapeAnswers: [true, false] } });
    await t.run();
    expect(t.record.tapeQuestions.map((p) => p.title)).toEqual(["Baba O'Riley", "Baba O'Riley"]);
    expect(t.record.tapeQuestions.map((p) => p.originalArtist)).toEqual(["The Who", "The Who"]);
    expect(t.calls.findMatch.map((c) => [c.performance.position, c.performance.title])).toEqual([
      [1, "Baba O'Riley"],
      [2, "Alive"],
    ]);
  });

  it("AC-13: with Tapes 'all', every Tape is kept and no Tape question is asked", async () => {
    const t = setup({ options: { tapes: "all" }, frontEnd: { tapeAnswers: [] } });
    await t.run();
    expect(t.record.tapeQuestions).toEqual([]);
    expect(t.calls.findMatch.map((c) => c.performance.title)).toEqual([...T1_KEPT_TITLES, "Mr. Blue Sky"]);
  });

  it("AC-14: with Tapes 'none', every Tape is left out and no Tape question is asked", async () => {
    const t = setup({ options: { tapes: "none" }, frontEnd: { tapeAnswers: [] } });
    await t.run();
    expect(t.record.tapeQuestions).toEqual([]);
    expect(t.calls.findMatch.map((c) => c.performance.title)).toEqual(T1_KEPT_TITLES.slice(1));
  });

  for (const tapes of ["ask", "all", "none"] as const) {
    it(`AC-15: a Setlist with no Tapes asks no Tape question (Tapes '${tapes}', Fixture C)`, async () => {
      const t = setup({ input: FIXTURE_A_URL, options: { tapes }, services: { setlist: fixtureC() }, frontEnd: { tapeAnswers: [] } });
      await t.run();
      expect(t.record.tapeQuestions).toEqual([]);
    });
  }

  it("AC-16: skipping the confirmation still asks the Tape questions", async () => {
    const t = setup({ options: { confirm: "skip" }, frontEnd: { tapeAnswers: [false, false] } });
    await t.run();
    expect(t.record.tapeQuestions.map((p) => p.title)).toEqual(["I Want It All", "Mr. Blue Sky"]);
    expect(t.record.confirmQuestions).toEqual([]);
  });

  it("AC-17: when every Performance is a Tape that was left out, the outcome is 'nothing-to-add' and the token getter is never called (E5)", async () => {
    for (const variant of [
      { options: { tapes: "none" as const }, frontEnd: { tapeAnswers: [] } },
      { options: { tapes: "ask" as const }, frontEnd: { tapeAnswers: [false] } },
    ]) {
      const t = setup({ input: FIXTURE_A_URL, services: { setlist: onlyTapeSetlist() }, ...variant });
      const outcome = await t.run();
      expect(outcome.kind).toBe("nothing-to-add");
      expect(t.calls.getAccessToken).toBe(0);
      expect(spotifyEvents(t.events)).toEqual([]);
    }
  });

  it("AC-17: with Tapes 'all', the only Tape is matched as usual (E5)", async () => {
    const t = setup({ input: FIXTURE_A_URL, options: { tapes: "all" }, services: { setlist: onlyTapeSetlist() } });
    await t.run();
    expect(t.calls.findMatch.map((c) => c.performance.title)).toEqual(["Intro"]);
  });
});

// ---------------------------------------------------------------- Spotify login

describe("run — Spotify login", () => {
  it("AC-18: the token is requested once, after the last Tape answer and before the first search; no Spotify call comes earlier", async () => {
    const t = setup();
    await t.run();
    expect(t.calls.getAccessToken).toBe(1);
    const firstSpotify = firstIndexOf(t.events, "spotify:");
    expect(t.events[firstSpotify]).toBe("spotify:getAccessToken");
    expect(firstSpotify).toBeGreaterThan(lastIndexOf(t.events, "ask:tape:"));
    expect(firstSpotify).toBeLessThan(firstIndexOf(t.events, "spotify:findMatch:"));
  });

  it("AC-18: the one token is used for every search, the duplicate check and the creation", async () => {
    const t = setup();
    await t.run();
    expect(new Set(t.calls.findMatch.map((c) => c.accessToken))).toEqual(new Set([TOKEN]));
    expect(t.calls.findPlaylistsNamed.map((c) => c.accessToken)).toEqual([TOKEN]);
    expect(t.calls.create.map((c) => c.options.accessToken)).toEqual([TOKEN]);
  });

  it("AC-19: when a full login is needed, the authorize URL is handed to the front-end to show", async () => {
    const t = setup({ services: { fullLogin: true } });
    await t.run();
    expect(t.record.authorizeUrls).toEqual([AUTHORIZE_URL]);
    expect(indexOf(t.events, "show:authorizeUrl")).toBeGreaterThan(indexOf(t.events, "spotify:getAccessToken"));
  });

  it("AC-21: a cached or refreshed token shows no authorize URL", async () => {
    const t = setup({ services: { fullLogin: false } });
    await t.run();
    expect(t.record.authorizeUrls).toEqual([]);
  });
});

// ---------------------------------------------------------------- matching

describe("run — matching", () => {
  it("AC-22: each kept Performance is matched exactly once, in played order, one at a time; a song played twice is matched twice", async () => {
    const t = setup();
    await t.run();
    expect(t.calls.findMatch.map((c) => c.performance.title)).toEqual(T1_KEPT_TITLES);
    expect(t.calls.findMatch.map((c) => c.performance.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    expect(t.stats.maxInFlightMatches).toBe(1);
  });

  it("AC-23: progress n/N with the title is reported for n = 1 … N, each before that Performance is matched", async () => {
    const t = setup();
    await t.run();
    expect(t.record.progress.map((p) => [p.n, p.total, p.performance.title])).toEqual(
      T1_KEPT_TITLES.map((title, i) => [i + 1, 13, title]),
    );
    for (let n = 1; n <= 13; n++) {
      const progressAt = indexOf(t.events, `show:progress:${n}/13`);
      const matchEvents = t.events
        .map((e, i) => [e, i] as const)
        .filter(([e]) => e.startsWith("spotify:findMatch:"))
        .map(([, i]) => i);
      expect(progressAt).toBeLessThan(matchEvents[n - 1]!);
    }
  });

  it("AC-24: a failing search stops the run with that error: no further search, no duplicate check, no creation (E8)", async () => {
    const searchError = await spotifySearchError();
    const t = setup({ services: { failMatchOn: { "Don't Sit Down 'Cause I've Moved Your Chair": searchError } } });
    const err = await captureError(t.run());
    expect(err).toBe(searchError);
    expect(t.calls.findMatch.map((c) => c.performance.title)).toEqual(T1_KEPT_TITLES.slice(0, 4));
    expect(t.calls.findPlaylistsNamed).toEqual([]);
    expect(t.calls.create).toEqual([]);
    expect(t.record.previews).toEqual([]);
  });

  for (const variant of [
    { label: "no flags", options: {} },
    { label: "dry run", options: { dryRun: true } },
    { label: "confirm skipped", options: { confirm: "skip" as const } },
  ]) {
    it(`AC-25: every Performance a Miss gives 'all-misses' with the Misses, and no preview, duplicate check, confirmation or creation (${variant.label}, E9)`, async () => {
      const t = setup({ input: "Muse", options: variant.options, services: { setlist: museRomeSetlist(), candidates: undefined } });
      const outcome = await t.run();
      expect(outcome.kind).toBe("all-misses");
      expect((outcome as { misses: { title: string; artist: string }[] }).misses.map((m) => [m.title, m.artist])).toEqual([
        ["Untitled New Song", "Muse"],
        ["Another New Song", "Muse"],
      ]);
      expect(t.record.previews).toEqual([]);
      expect(t.calls.findPlaylistsNamed).toEqual([]);
      expect(t.record.confirmQuestions).toEqual([]);
      expect(t.calls.create).toEqual([]);
    });
  }
});

// ---------------------------------------------------------------- preview

describe("run — preview", () => {
  it("AC-26: the preview lists every kept Performance numbered 1 … N in played order, with its Set label, Tape flag, Original Artist and Match or Miss", async () => {
    const t = setup();
    await t.run();
    expect(t.record.previews).toHaveLength(1);
    const preview = t.record.previews[0];
    expect(preview.rows.map((r: any) => r.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    expect(preview.rows.map((r: any) => r.performance.title)).toEqual(T1_KEPT_TITLES);
    expect(preview.rows.map((r: any) => r.performance.setLabel)).toEqual([
      "main", "main", "main", "main", "main", "Acoustic", "Acoustic", "Acoustic", "Acoustic", "Encore 1", "Encore 1", "Encore 1", "Encore 2",
    ]);
    expect(preview.rows[0].performance.isTape).toBe(true);
    expect(preview.rows[0].performance.originalArtist).toBe("Queen");
    expect(preview.rows[0].outcome).toMatchObject({
      kind: "match",
      uri: "spotify:track:1d6ZfnbHbkHb1Gcz6Dcfbl",
      name: "I Want It All - Remastered 2011",
      artists: ["Queen"],
      album: "The Miracle (2011 Remaster)",
      live: false,
    });
    expect(preview.rows[11].outcome.kind).toBe("miss");
    expect(preview.rows[11].performance.originalArtist).toBe("Barbara Lewis");
  });

  it("AC-27: 'not added' lists noted snippets and left-out Tapes in played order with their reasons, no medleys (T1, PRD 0008 P2)", async () => {
    const t = setup();
    await t.run();
    expect(t.record.previews[0].notAdded).toEqual([
      { name: "Hey Jude", reason: "snippet" },
      { name: "Mr. Blue Sky", reason: "tape" },
    ]);
  });

  it("AC-27: with every Tape left out, the first Tape comes before the noted songs that follow it (T2)", async () => {
    const t = setup({ input: FIXTURE_A_URL, options: { tapes: "none", dryRun: true } });
    await t.run();
    expect(t.record.previews[0].notAdded).toEqual([
      { name: "I Want It All", reason: "tape" },
      { name: "Hey Jude", reason: "snippet" },
      { name: "Mr. Blue Sky", reason: "tape" },
    ]);
  });

  it("AC-27: a repeated Tape answered No appears once under 'not added' (Fixture F)", async () => {
    const t = setup({ input: FIXTURE_A_URL, services: { setlist: fixtureF() }, frontEnd: { tapeAnswers: [true, false] } });
    await t.run();
    expect(t.record.previews[0].notAdded).toEqual([{ name: "Baba O'Riley", reason: "tape" }]);
  });

  it("AC-27: with nothing left out, 'not added' is empty", async () => {
    const t = setup({ input: "Muse", options: { tapes: "all" }, services: { setlist: bigSetlist(3), candidates: undefined } });
    await t.run();
    expect(t.record.previews[0].notAdded).toEqual([]);
  });

  it("AC-28: the preview has the playlist name, private/public, the track count (repeats included) and the Miss count", async () => {
    const t = setup();
    await t.run();
    const preview = t.record.previews[0];
    expect(preview.playlistName).toBe(FIXTURE_A_PLAYLIST_NAME);
    expect(preview.public).toBe(false);
    expect(preview.trackCount).toBe(12);
    expect(preview.missCount).toBe(1);
  });

  it("AC-29: playlists with the same name are in the preview; the duplicate check runs once, after matching", async () => {
    const t = setup({ services: { duplicates: [DUPLICATE] } });
    await t.run();
    expect(t.record.previews[0].duplicates).toEqual([DUPLICATE]);
    expect(t.calls.findPlaylistsNamed).toEqual([{ name: FIXTURE_A_PLAYLIST_NAME, accessToken: TOKEN }]);
    expect(indexOf(t.events, "spotify:findPlaylistsNamed")).toBeGreaterThan(lastIndexOf(t.events, "spotify:findMatch:"));
  });

  it("AC-29: with no playlist of the same name, the preview has no duplicates (E10)", async () => {
    const t = setup({ services: { duplicates: [] } });
    await t.run();
    expect(t.record.previews[0].duplicates).toEqual([]);
  });

  it("AC-30: the whole preview is given before the confirmation question and before the creation", async () => {
    const t = setup();
    await t.run();
    const shown = indexOf(t.events, "show:preview");
    expect(shown).toBeLessThan(indexOf(t.events, "ask:confirm"));
    expect(shown).toBeLessThan(indexOf(t.events, "spotify:createSetlistPlaylist"));
  });
});

// ---------------------------------------------------------------- confirming and creating

describe("run — confirming and creating", () => {
  it("AC-31: asks once for confirmation; Yes creates the Setlist Playlist from the Show and the Matches in played order", async () => {
    const t = setup({ frontEnd: { confirm: true } });
    const outcome = await t.run();
    expect(t.record.confirmQuestions).toHaveLength(1);
    expect(t.calls.create).toHaveLength(1);
    expect(t.calls.create[0]!.show).toEqual(fixtureAShow);
    expect(t.calls.create[0]!.matches.map((m) => m.uri)).toEqual(T1_URIS);
    expect(outcome.kind).toBe("created");
  });

  it("AC-32: answering No creates nothing and gives the outcome 'declined' (E11)", async () => {
    const t = setup({ frontEnd: { confirm: false } });
    const outcome = await t.run();
    expect(outcome.kind).toBe("declined");
    expect(t.calls.create).toEqual([]);
  });

  it("AC-33: with the confirmation skipped, nothing is asked and the Setlist Playlist is created (E12)", async () => {
    const t = setup({ options: { confirm: "skip" } });
    const outcome = await t.run();
    expect(t.record.confirmQuestions).toEqual([]);
    expect(t.calls.create).toHaveLength(1);
    expect(outcome.kind).toBe("created");
  });

  it("AC-34: public creates a public playlist and the preview says public", async () => {
    const t = setup({ options: { public: true } });
    await t.run();
    expect(t.calls.create[0]!.options.public).toBe(true);
    expect(t.record.previews[0].public).toBe(true);
  });

  it("AC-34: without public the playlist is created private", async () => {
    const t = setup();
    await t.run();
    expect(t.calls.create[0]!.options.public).toBe(false);
  });

  for (const confirm of ["ask", "skip"] as const) {
    it(`AC-35: a dry run goes up to the preview, then gives 'dry-run' with the Misses, with no confirmation and no creation (confirm '${confirm}', T2)`, async () => {
      const t = setup({ input: FIXTURE_A_URL, options: { dryRun: true, tapes: "none", confirm }, services: { fullLogin: false, duplicates: [] } });
      const outcome = await t.run();
      expect(outcome.kind).toBe("dry-run");
      expect((outcome as { misses: { title: string }[] }).misses.map((m) => m.title)).toEqual(["Baby, I'm Yours"]);
      expect(t.calls.findMatch).toHaveLength(12);
      expect(t.calls.findPlaylistsNamed).toHaveLength(1);
      expect(t.record.previews).toHaveLength(1);
      expect(t.record.confirmQuestions).toEqual([]);
      expect(t.calls.create).toEqual([]);
    });
  }
});

// ---------------------------------------------------------------- result

describe("run — result", () => {
  it("AC-36: the 'created' outcome carries the share link, name, track count and the Misses in played order", async () => {
    const t = setup();
    const outcome = await t.run();
    expect(outcome.kind).toBe("created");
    const created = outcome as {
      playlist: { shareUrl: string; name: string; trackCount: number };
      misses: { title: string; artist: string; originalArtist?: string }[];
    };
    expect(created.playlist.shareUrl).toBe(CREATED_SHARE_URL);
    expect(created.playlist.name).toBe(FIXTURE_A_PLAYLIST_NAME);
    expect(created.playlist.trackCount).toBe(12);
    expect(created.misses.map((m) => [m.title, m.artist, m.originalArtist])).toEqual([
      ["Baby, I'm Yours", "Arctic Monkeys", "Barbara Lewis"],
    ]);
  });

  it("AC-36: with no Misses the 'created' outcome has an empty Miss list (E13)", async () => {
    const t = setup({ input: "Arctic Monkeys", options: { tapes: "all", confirm: "skip" }, services: { candidates: undefined, outcomes: fixtureRWithoutMisses } });
    const outcome = await t.run();
    expect(outcome.kind).toBe("created");
    expect((outcome as { misses: unknown[]; playlist: { trackCount: number } }).misses).toEqual([]);
    expect((outcome as { playlist: { trackCount: number } }).playlist.trackCount).toBe(14);
  });

  it("AC-37: a partly created playlist ends the run with PRD 0006's error, which carries the share link (E16)", async () => {
    const partly = await partlyCreatedPlaylistError();
    const t = setup({ input: FIXTURE_A_URL, options: { confirm: "skip" }, services: { setlist: bigSetlist(250), fail: { createSetlistPlaylist: partly } } });
    const err = await captureError(t.run());
    expect(err).toBe(partly);
    expect((err as { shareUrl: string }).shareUrl).toBe(PARTLY_CREATED_SHARE_URL);
  });
});

// ---------------------------------------------------------------- errors and cancellation

describe("run — errors and cancellation", () => {
  it("AC-38: a typed error from a service ends the run unchanged", async () => {
    const notFound = await setlistNotFoundError();
    const t = setup({ input: "https://www.setlist.fm/setlist/x/2025/y-deadbeef.html", services: { fail: { getSetlist: notFound } } });
    expect(await captureError(t.run())).toBe(notFound);
    expect(t.calls.getSetlist).toEqual(["deadbeef"]);
    expect(spotifyEvents(t.events)).toEqual([]);
  });

  it("AC-38: a setlist.fm request error during the Artist lookup ends the run unchanged", async () => {
    const requestError = await setlistFmRequestError();
    const t = setup({ services: { fail: { findLatestSetlistByArtistName: requestError } } });
    expect(await captureError(t.run())).toBe(requestError);
  });

  it("AC-39: a failure while adding tracks is passed on with tracks added and total, and nothing else is sent (E16)", async () => {
    const partly = await partlyCreatedPlaylistError();
    const t = setup({ input: FIXTURE_A_URL, options: { confirm: "skip" }, services: { setlist: bigSetlist(250), fail: { createSetlistPlaylist: partly } } });
    const err = (await captureError(t.run())) as { tracksAdded: number; totalMatches: number };
    expect(err.tracksAdded).toBe(100);
    expect(err.totalMatches).toBe(250);
    expect(t.calls.create).toHaveLength(1);
  });

  it("AC-42: a cancelled Artist question ends the run with the cancelled error and no setlists request", async () => {
    const cancelled = await artistChoiceCancelledError();
    const t = setup({ services: { choiceCancelledError: cancelled }, frontEnd: { artistPick: null } });
    expect(await captureError(t.run())).toBe(cancelled);
    expect(t.events.some((e) => e.startsWith("setlistfm:setlists:"))).toBe(false);
    expect(spotifyEvents(t.events)).toEqual([]);
  });

  it("AC-42: Ctrl-C at the second Tape question ends the run with that error and no Spotify call", async () => {
    const ctrlC = new ExitPromptError();
    const t = setup({ frontEnd: { tapeAnswers: [true, { throws: ctrlC }] } });
    expect(await captureError(t.run())).toBe(ctrlC);
    expect(spotifyEvents(t.events)).toEqual([]);
  });

  it("AC-42: Ctrl-C at the confirmation ends the run with that error and no creation", async () => {
    const ctrlC = new ExitPromptError();
    const t = setup({ frontEnd: { confirm: { throws: ctrlC } } });
    expect(await captureError(t.run())).toBe(ctrlC);
    expect(t.calls.create).toEqual([]);
  });
});

// ---------------------------------------------------------------- the core without a terminal

describe("run — the whole run through the core with fakes (E18)", () => {
  it("AC-44: completes with no terminal and no network, asking and reporting everything to the front-end", async () => {
    const t = setup();
    const outcome = await t.run();

    expect(t.record.artistQuestions).toHaveLength(1);
    expect(t.record.artistQuestions[0]).toHaveLength(3);
    expect(t.record.shows).toHaveLength(1);
    expect(t.record.shows[0].show).toEqual(fixtureAShow);
    expect(t.record.tapeQuestions.map((p) => p.title)).toEqual(["I Want It All", "Mr. Blue Sky"]);
    expect(t.record.authorizeUrls).toHaveLength(1);
    expect(t.record.progress.map((p) => `${p.n}/${p.total}`)).toEqual(
      Array.from({ length: 13 }, (_, i) => `${i + 1}/13`),
    );
    expect(t.record.previews).toHaveLength(1);
    const preview = t.record.previews[0];
    expect(preview.rows).toHaveLength(13);
    expect(preview.notAdded).toHaveLength(2);
    expect(preview.playlistName).toBe(FIXTURE_A_PLAYLIST_NAME);
    expect(preview.public).toBe(false);
    expect(preview.trackCount).toBe(12);
    expect(preview.missCount).toBe(1);
    expect(preview.duplicates).toHaveLength(1);
    expect(t.record.confirmQuestions).toHaveLength(1);

    expect(outcome.kind).toBe("created");
    const created = outcome as { playlist: { shareUrl: string; trackCount: number }; misses: unknown[] };
    expect(created.playlist.shareUrl).toBe(CREATED_SHARE_URL);
    expect(created.playlist.trackCount).toBe(12);
    expect(created.misses).toHaveLength(1);
  });

  it("AC-44: the questions and reports come in the order of the run", async () => {
    const t = setup();
    await t.run();
    const order = [
      indexOf(t.events, "ask:artist"),
      indexOf(t.events, "show:show"),
      indexOf(t.events, "ask:tape:I Want It All"),
      indexOf(t.events, "ask:tape:Mr. Blue Sky"),
      indexOf(t.events, "show:authorizeUrl"),
      indexOf(t.events, "show:progress:1/13"),
      indexOf(t.events, "show:progress:13/13"),
      indexOf(t.events, "show:preview"),
      indexOf(t.events, "ask:confirm"),
      indexOf(t.events, "spotify:createSetlistPlaylist"),
    ];
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("AC-44: confirm No gives 'declined'; dry run gives 'dry-run' with no confirmation; E9 gives 'all-misses'; E5 with Tapes none gives 'nothing-to-add'", async () => {
    const declined = setup({ frontEnd: { confirm: false } });
    expect((await declined.run()).kind).toBe("declined");
    expect(declined.calls.create).toEqual([]);

    const dry = setup({ options: { dryRun: true } });
    expect((await dry.run()).kind).toBe("dry-run");
    expect(dry.record.confirmQuestions).toEqual([]);
    expect(dry.calls.create).toEqual([]);

    const allMisses = setup({ input: "Muse", services: { setlist: museRomeSetlist(), candidates: undefined } });
    expect((await allMisses.run()).kind).toBe("all-misses");

    const nothing = setup({ input: FIXTURE_A_URL, options: { tapes: "none" }, services: { setlist: onlyTapeSetlist() } });
    expect((await nothing.run()).kind).toBe("nothing-to-add");
    expect(nothing.calls.getAccessToken).toBe(0);
  });

  it("AC-44: the run makes no real network request", async () => {
    const original = globalThis.fetch;
    let realFetches = 0;
    globalThis.fetch = (async () => {
      realFetches++;
      throw new Error("no network in tests");
    }) as typeof fetch;
    try {
      const t = setup();
      await t.run();
    } finally {
      globalThis.fetch = original;
    }
    expect(realFetches).toBe(0);
  });
});

