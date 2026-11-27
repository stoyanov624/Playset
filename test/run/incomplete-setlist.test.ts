// PRD 0011 — Unknown Songs and Incomplete Setlists in the front-end-agnostic run (src/core/run).
// Every service and every question/report of the front-end is a fake. No terminal, no network.
import { describe, expect, it } from "vitest";
import { DescriptionTooLongError } from "../../src/core/setlist-playlist";
import { runPlayset, type RunOptions } from "../../src/core/run/index.js";
import {
  ExitPromptError,
  makeFakeFrontEnd,
  makeFakeServices,
  spotifyEvents,
  type FakeFrontEndOptions,
  type FakeServicesOptions,
} from "./fixtures/fake-services";
import { FIXTURE_A_URL, fixtureA, setlistUrlOfLength, withFixtureAShow } from "./fixtures/setlists";
import {
  NIRVANA_KEPT_TITLES,
  NIRVANA_SETLIST_ID,
  NIRVANA_URIS,
  NIRVANA_URL,
  PORTLAND_PLAYLIST_NAME,
  PORTLAND_URIS,
  PORTLAND_URL,
  RADIOHEAD_URL,
  VANCOUVER_PLAYLIST_NAME,
  VANCOUVER_URIS,
  nirvanaOutcomes,
  nirvanaShow,
  nirvanaTacoma,
  pearlJamOutcomes,
  pearlJamPortland,
  pearlJamVancouver,
  portlandOnlyUnknownSongs,
  portlandShow,
  radioheadNoteIncomplete,
  vancouverShow,
  withSongs,
} from "./fixtures/incomplete-setlists";

const DEFAULT_OPTIONS: RunOptions = { tapes: "ask", confirm: "ask", public: false, dryRun: false };

interface SetupOptions {
  input?: string;
  options?: Partial<RunOptions>;
  services?: FakeServicesOptions;
  frontEnd?: FakeFrontEndOptions;
}

function setup(opts: SetupOptions = {}) {
  const events: string[] = [];
  const fake = makeFakeServices({ duplicates: [], ...opts.services }, events);
  const ui = makeFakeFrontEnd({ confirm: true, tapeAnswers: [], ...opts.frontEnd }, events);
  const run = () =>
    runPlayset({
      input: opts.input ?? "Pearl Jam",
      options: { ...DEFAULT_OPTIONS, ...opts.options },
      frontEnd: ui.frontEnd,
      services: fake.services,
    });
  return { run, events, calls: fake.calls, record: ui.record };
}

/** L1 by Artist name: Latest = Portland (incomplete), newest complete = Vancouver. */
function pearlJam(opts: SetupOptions = {}) {
  return setup({
    ...opts,
    input: opts.input ?? "Pearl Jam",
    services: {
      setlist: pearlJamPortland(),
      completeAlternative: pearlJamVancouver(),
      outcomes: pearlJamOutcomes,
      ...opts.services,
    },
  });
}

/** T1 (PRD 0011): Nirvana by link. */
function nirvana(opts: SetupOptions = {}) {
  return setup({
    ...opts,
    input: NIRVANA_URL,
    services: { setlist: nirvanaTacoma(), outcomes: nirvanaOutcomes, ...opts.services },
  });
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
const firstIndexOf = (events: string[], prefix: string) => events.findIndex((e) => e.startsWith(prefix));

const INCOMPLETE_1 = { isIncomplete: true, unknownSongCount: 1 };
const COMPLETE = { isIncomplete: false, unknownSongCount: 0 };
const RADIOHEAD_STATUS = {
  isIncomplete: true,
  unknownSongCount: 0,
  matchedPhrase: "incomplete",
  setlistNote: "Setlist incomplete",
};

// ---------------------------------------------------------------- AC-10, AC-19: the Show report

describe("run — the incomplete status with the Show", () => {
  it("AC-10: a link to an Incomplete Setlist reports the Show with its incomplete status (1 Unknown Song)", async () => {
    const t = nirvana();
    await t.run();
    expect(t.record.shows).toHaveLength(1);
    expect(t.record.shows[0].show).toEqual(nirvanaShow);
    expect(t.record.shows[0].incompleteStatus).toEqual(INCOMPLETE_1);
  });

  it("AC-10: a link to a note-only Incomplete Setlist reports the matched phrase and the Setlist note (T1b)", async () => {
    const t = setup({ input: RADIOHEAD_URL, services: { setlist: radioheadNoteIncomplete() } });
    await t.run();
    expect(t.record.shows[0].incompleteStatus).toEqual(RADIOHEAD_STATUS);
  });

  it("AC-10: a complete Setlist reports incomplete no with an Unknown Song count of 0", async () => {
    const t = setup({ input: "Pearl Jam", services: { setlist: pearlJamVancouver(), outcomes: pearlJamOutcomes } });
    await t.run();
    expect(t.record.shows[0].incompleteStatus).toEqual(COMPLETE);
  });

  it("AC-10: a link never asks the offer question and makes no request beyond fetching that Setlist", async () => {
    const t = nirvana({ services: { completeAlternative: pearlJamVancouver() } });
    await t.run();
    expect(t.record.offerQuestions).toEqual([]);
    expect(t.calls.getSetlist).toEqual([NIRVANA_SETLIST_ID]);
    expect(t.calls.findLatest).toEqual([]);
    expect(t.events.filter((e) => e.startsWith("setlistfm:"))).toEqual([`setlistfm:getSetlist:${NIRVANA_SETLIST_ID}`]);
  });

  it("AC-10: a link to a Setlist whose only songs are Unknown Songs reports 0 Performances and 2 Unknown Songs, then 'no-performances' with no Spotify call (T1d)", async () => {
    const t = setup({
      input: PORTLAND_URL,
      services: { setlist: portlandOnlyUnknownSongs() },
    });
    const outcome = await t.run();
    expect(outcome.kind).toBe("no-performances");
    expect(t.record.shows).toHaveLength(1);
    expect(t.record.shows[0].performanceCount).toBe(0);
    expect(t.record.shows[0].incompleteStatus).toEqual({ isIncomplete: true, unknownSongCount: 2 });
    expect(spotifyEvents(t.events)).toEqual([]);
  });
});

// ---------------------------------------------------------------- AC-11: the offer

describe("run — offering the newest complete Setlist", () => {
  it("AC-11: an Artist name without skipped confirmation asks the lookup for a complete alternative", async () => {
    const t = pearlJam({ frontEnd: { offer: false } });
    await t.run();
    expect(t.calls.findLatest).toEqual(["Pearl Jam"]);
    expect(t.calls.findLatestOptions[0]?.wantCompleteAlternative).toBe(true);
  });

  it("AC-11: one offer question with both Setlists' dates and cities, after the Show report and before any Tape question or Spotify call", async () => {
    const t = pearlJam({ frontEnd: { offer: false } });
    await t.run();
    expect(t.record.offerQuestions).toHaveLength(1);
    const offer = t.record.offerQuestions[0];
    expect(offer.latest).toMatchObject({ date: "2026-11-22", city: "Portland" });
    expect(offer.complete).toMatchObject({ date: "2026-11-18", city: "Vancouver" });
    const asked = indexOf(t.events, "ask:offer");
    expect(asked).toBeGreaterThan(indexOf(t.events, "show:show"));
    expect(asked).toBeLessThan(firstIndexOf(t.events, "spotify:"));
  });

  it("AC-11: answer No keeps the Latest Setlist as the Setlist in use (O2)", async () => {
    const t = pearlJam({ frontEnd: { offer: false } });
    const outcome = await t.run();
    expect(t.record.shows).toHaveLength(1);
    expect(t.record.shows[0].show).toEqual(portlandShow);
    expect(t.calls.findMatch.map((c) => c.performance.title)).toEqual(["Release", "Even Flow", "Alive"]);
    expect(t.record.previews[0].playlistName).toBe(PORTLAND_PLAYLIST_NAME);
    expect(t.calls.create[0]!.show).toEqual(portlandShow);
    expect(t.calls.create[0]!.matches.map((m) => m.uri)).toEqual(PORTLAND_URIS);
    expect(outcome.kind).toBe("created");
  });

  it("AC-11: answer Yes makes the newest complete Setlist the Setlist in use: a second Show report (Vancouver, not incomplete), its Performances, name and preview (O1)", async () => {
    const t = pearlJam({ frontEnd: { offer: true } });
    const outcome = await t.run();
    expect(t.record.shows).toHaveLength(2);
    expect(t.record.shows[0].show).toEqual(portlandShow);
    expect(t.record.shows[1].show).toEqual(vancouverShow);
    expect(t.record.shows[1].performanceCount).toBe(6);
    expect(t.record.shows[1].tapeCount).toBe(0);
    expect(t.record.shows[1].incompleteStatus).toEqual(COMPLETE);
    expect(indexOf(t.events, "ask:offer")).toBeLessThan(t.events.lastIndexOf("show:show"));
    expect(t.record.progress.map((p) => `${p.n}/${p.total}`)).toEqual(["1/6", "2/6", "3/6", "4/6", "5/6", "6/6"]);
    const preview = t.record.previews[0];
    expect(preview.playlistName).toBe(VANCOUVER_PLAYLIST_NAME);
    expect(preview.notAdded).toEqual([]);
    expect(preview.incompleteStatus).toEqual(COMPLETE);
    expect(t.calls.create[0]!.show).toEqual(vancouverShow);
    expect(t.calls.create[0]!.matches.map((m) => m.uri)).toEqual(VANCOUVER_URIS);
    expect(outcome.kind).toBe("created");
    expect((outcome as { incompleteStatus?: unknown }).incompleteStatus).toEqual(COMPLETE);
  });

  it("AC-11: answer Yes asks the Tape questions of the Setlist in use, not those of the Latest Setlist", async () => {
    const latest = withSongs(pearlJamPortland(), [{ name: "Wash", tape: true }, { name: "Release" }, { name: "" }]);
    const older = withSongs(pearlJamVancouver(), [{ name: "Master/Slave", tape: true }, { name: "Alive" }]);
    const yes = pearlJam({ services: { setlist: latest, completeAlternative: older }, frontEnd: { offer: true, tapeAnswers: [true] } });
    await yes.run();
    expect(yes.record.tapeQuestions.map((p) => p.title)).toEqual(["Master/Slave"]);
    expect(indexOf(yes.events, "ask:offer")).toBeLessThan(indexOf(yes.events, "ask:tape:Master/Slave"));

    const no = pearlJam({ services: { setlist: latest, completeAlternative: older }, frontEnd: { offer: false, tapeAnswers: [true] } });
    await no.run();
    expect(no.record.tapeQuestions.map((p) => p.title)).toEqual(["Wash"]);
  });

  it("AC-11: the description check applies to the Setlist in use after the offer — a too-long URL on the Latest Setlist fails only when it is kept", async () => {
    const longLatest = withSongs(pearlJamPortland(), [{ name: "Release" }, { name: "" }], { url: setlistUrlOfLength(276) });

    const kept = pearlJam({ services: { setlist: longLatest }, frontEnd: { offer: false } });
    const err = await captureError(kept.run());
    expect(err).toBeInstanceOf(DescriptionTooLongError);
    expect(kept.record.offerQuestions).toHaveLength(1);
    expect(spotifyEvents(kept.events)).toEqual([]);

    const switched = pearlJam({ services: { setlist: longLatest }, frontEnd: { offer: true } });
    const outcome = await switched.run();
    expect(outcome.kind).toBe("created");
    expect(switched.calls.create[0]!.show).toEqual(vancouverShow);
  });

  it("AC-11: a too-long URL on the newest complete Setlist fails after a Yes, before any Tape question or Spotify call", async () => {
    const longOlder = withSongs(pearlJamVancouver(), [{ name: "Intro", tape: true }, { name: "Alive" }], { url: setlistUrlOfLength(276) });
    const t = pearlJam({ services: { completeAlternative: longOlder }, frontEnd: { offer: true } });
    const err = await captureError(t.run());
    expect(err).toBeInstanceOf(DescriptionTooLongError);
    expect(t.record.tapeQuestions).toEqual([]);
    expect(spotifyEvents(t.events)).toEqual([]);
  });
});

// ---------------------------------------------------------------- AC-12

describe("run — when the offer question is not asked", () => {
  it("AC-12: with the confirmation skipped (--yes) no offer is asked and no alternative is looked for; the Latest Setlist is used (O3)", async () => {
    const t = pearlJam({ options: { confirm: "skip" } });
    const outcome = await t.run();
    expect(t.record.offerQuestions).toEqual([]);
    expect(t.calls.findLatestOptions[0]?.wantCompleteAlternative ?? false).toBe(false);
    expect(t.record.shows).toHaveLength(1);
    expect(t.record.shows[0].incompleteStatus).toEqual(INCOMPLETE_1);
    expect(t.calls.create[0]!.show).toEqual(portlandShow);
    expect(outcome.kind).toBe("created");
  });

  it("AC-12: dry run with the confirmation skipped asks no offer and looks for no alternative", async () => {
    const t = pearlJam({ options: { confirm: "skip", dryRun: true } });
    const outcome = await t.run();
    expect(outcome.kind).toBe("dry-run");
    expect(t.record.offerQuestions).toEqual([]);
    expect(t.calls.findLatestOptions[0]?.wantCompleteAlternative ?? false).toBe(false);
  });

  for (const [label, options] of [
    ["Tapes all", { tapes: "all" }],
    ["Tapes none", { tapes: "none" }],
    ["public", { public: true }],
    ["dry run", { dryRun: true }],
  ] as const) {
    it(`AC-12: ${label} doesn't skip the offer question (O4)`, async () => {
      const t = pearlJam({ options, frontEnd: { offer: false } });
      await t.run();
      expect(t.record.offerQuestions).toHaveLength(1);
    });
  }

  it("AC-12: when no complete Setlist is found, no offer is asked; the Show still reports incomplete", async () => {
    const t = pearlJam({ services: { completeAlternative: undefined } });
    const outcome = await t.run();
    expect(t.record.offerQuestions).toEqual([]);
    expect(t.record.shows[0].incompleteStatus).toEqual(INCOMPLETE_1);
    expect(outcome.kind).toBe("created");
  });
});

// ---------------------------------------------------------------- AC-13

describe("run — Ctrl-C at the offer question", () => {
  it("AC-13: Ctrl-C at the offer ends the run with that error; no Tape question, no token request, no Spotify call (C1 cancel)", async () => {
    const ctrlC = new ExitPromptError();
    const t = pearlJam({ frontEnd: { offer: { throws: ctrlC } } });
    expect(await captureError(t.run())).toBe(ctrlC);
    expect(t.calls.getAccessToken).toBe(0);
    expect(t.record.tapeQuestions).toEqual([]);
    expect(spotifyEvents(t.events)).toEqual([]);
    expect(t.calls.create).toEqual([]);
  });
});

// ---------------------------------------------------------------- AC-14, AC-15: the preview

describe("run — Unknown Songs and the warning in the preview", () => {
  it("AC-14: the Portland preview lists the Unknown Song after #1 with its info text (O2)", async () => {
    const t = pearlJam({ frontEnd: { offer: false } });
    await t.run();
    expect(t.record.previews[0].notAdded).toEqual([
      { reason: "unknown", after: 1, info: "New song, title not yet known" },
    ]);
  });

  it("AC-14: the Nirvana preview lists the Unknown Song after #7 (T1)", async () => {
    const t = nirvana();
    await t.run();
    expect(t.record.previews[0].notAdded).toEqual([
      { reason: "unknown", after: 7, info: "Written as 'Dope Hippie' on the setlist" },
    ]);
  });

  it("AC-14: Fixture A with 'I Want It All' kept lists Hey Jude, the Unknown Song after #9 (Cornerstone), Mr. Blue Sky (T2)", async () => {
    const t = setup({ input: FIXTURE_A_URL, services: { setlist: fixtureA() }, frontEnd: { tapeAnswers: [true, false] } });
    await t.run();
    expect(t.record.previews[0].notAdded).toEqual([
      { name: "Hey Jude", reason: "snippet" },
      { reason: "unknown", after: 9 },
      { name: "Mr. Blue Sky", reason: "tape" },
    ]);
  });

  it("AC-14: Fixture A with every Tape left out numbers Cornerstone #8, so the Unknown Song is after #8 (T2 --no-tapes)", async () => {
    const t = setup({ input: FIXTURE_A_URL, options: { tapes: "none", dryRun: true }, services: { setlist: fixtureA() } });
    await t.run();
    expect(t.record.previews[0].notAdded).toEqual([
      { name: "I Want It All", reason: "tape" },
      { name: "Hey Jude", reason: "snippet" },
      { reason: "unknown", after: 8 },
      { name: "Mr. Blue Sky", reason: "tape" },
    ]);
  });

  it("AC-14: an Unknown Song before the first kept Performance is 'at the start' (after 0), with its info text", async () => {
    const t = setup({
      input: FIXTURE_A_URL,
      services: { setlist: withFixtureAShow({ set: [{ song: [{ name: "", info: "Intro jam" }, { name: "Brianstorm" }] }] }) },
    });
    await t.run();
    expect(t.record.previews[0].notAdded).toEqual([{ reason: "unknown", after: 0, info: "Intro jam" }]);
  });

  it("AC-14: when only left-out Tapes come before it, the Unknown Song is 'at the start'; with the Tape kept it is after #1", async () => {
    const setlist = () =>
      withFixtureAShow({ set: [{ song: [{ name: "Intro", tape: true }, { name: "" }, { name: "Brianstorm" }] }] });
    const left = setup({ input: FIXTURE_A_URL, options: { tapes: "none" }, services: { setlist: setlist() } });
    await left.run();
    expect(left.record.previews[0].notAdded).toEqual([
      { name: "Intro", reason: "tape" },
      { reason: "unknown", after: 0 },
    ]);

    const kept = setup({ input: FIXTURE_A_URL, options: { tapes: "all" }, services: { setlist: setlist() } });
    await kept.run();
    expect(kept.record.previews[0].notAdded).toEqual([{ reason: "unknown", after: 1 }]);
  });

  it("AC-15: the preview carries the incomplete status of the Setlist in use", async () => {
    const t = nirvana();
    await t.run();
    expect(t.record.previews[0].incompleteStatus).toEqual(INCOMPLETE_1);

    const note = setup({ input: RADIOHEAD_URL, services: { setlist: radioheadNoteIncomplete() } });
    await note.run();
    expect(note.record.previews[0].incompleteStatus).toEqual(RADIOHEAD_STATUS);
    expect(note.record.previews[0].notAdded).toEqual([]);
  });

  it("AC-15: a complete Setlist's preview says not incomplete", async () => {
    const t = setup({ input: "Pearl Jam", services: { setlist: pearlJamVancouver(), outcomes: pearlJamOutcomes } });
    await t.run();
    expect(t.record.previews[0].incompleteStatus).toEqual(COMPLETE);
  });
});

// ---------------------------------------------------------------- AC-16: the outcome

describe("run — the incomplete status in the outcome", () => {
  it("AC-16: the 'created' outcome says the Setlist in use is incomplete", async () => {
    const t = nirvana();
    const outcome = await t.run();
    expect(outcome.kind).toBe("created");
    expect((outcome as { incompleteStatus?: unknown }).incompleteStatus).toEqual(INCOMPLETE_1);
  });

  it("AC-16: the 'dry-run' outcome says the Setlist in use is incomplete (O4)", async () => {
    const t = pearlJam({ options: { dryRun: true }, frontEnd: { offer: false } });
    const outcome = await t.run();
    expect(outcome.kind).toBe("dry-run");
    expect((outcome as { incompleteStatus?: unknown }).incompleteStatus).toEqual(INCOMPLETE_1);
  });

  it("AC-16: a complete Setlist's 'created' outcome says not incomplete", async () => {
    const t = setup({ input: "Pearl Jam", services: { setlist: pearlJamVancouver(), outcomes: pearlJamOutcomes } });
    const outcome = await t.run();
    expect((outcome as { incompleteStatus?: unknown }).incompleteStatus).toEqual(COMPLETE);
  });
});

// ---------------------------------------------------------------- AC-17: counts

describe("run — Unknown Songs are never searched or counted", () => {
  it("AC-17: the Unknown Song is never searched; 9 progress steps, 9 searches, 8 URIs, and only Spank Thru is a Miss (T1)", async () => {
    const t = nirvana();
    const outcome = await t.run();
    expect(t.calls.findMatch.map((c) => c.performance.title)).toEqual(NIRVANA_KEPT_TITLES);
    expect(t.record.progress.map((p) => `${p.n}/${p.total}`)).toEqual(
      Array.from({ length: 9 }, (_, i) => `${i + 1}/9`),
    );
    expect(t.record.shows[0].performanceCount).toBe(9);
    expect(t.record.shows[0].tapeCount).toBe(0);
    const preview = t.record.previews[0];
    expect(preview.rows).toHaveLength(9);
    expect(preview.trackCount).toBe(8);
    expect(preview.missCount).toBe(1);
    expect(t.calls.create[0]!.matches.map((m) => m.uri)).toEqual(NIRVANA_URIS);
    const created = outcome as { misses: { title: string }[]; playlist: { trackCount: number } };
    expect(created.misses.map((m) => m.title)).toEqual(["Spank Thru"]);
    expect(created.playlist.trackCount).toBe(8);
  });

  it("AC-17: Fixture A's counts are the same as without its Unknown Song (14 Performances, 2 Tapes, 13 searches, 12 tracks)", async () => {
    const t = setup({ input: FIXTURE_A_URL, services: { setlist: fixtureA() }, frontEnd: { tapeAnswers: [true, false] } });
    await t.run();
    expect(t.record.shows[0].performanceCount).toBe(14);
    expect(t.record.shows[0].tapeCount).toBe(2);
    expect(t.calls.findMatch).toHaveLength(13);
    expect(t.record.previews[0].trackCount).toBe(12);
    expect(t.record.previews[0].missCount).toBe(1);
  });
});

// ---------------------------------------------------------------- AC-19: C1

describe("run — C1, the core with fakes", () => {
  it("AC-19: offer No — one Show report (Portland, incomplete), one offer, 3 progress steps, preview with the Unknown Song, 'created' with 3 tracks, 0 Misses, incomplete", async () => {
    const t = pearlJam({ frontEnd: { offer: false, confirm: true } });
    const outcome = await t.run();

    expect(t.record.shows).toHaveLength(1);
    expect(t.record.shows[0].show).toMatchObject({ city: "Portland" });
    expect(t.record.shows[0].incompleteStatus).toEqual(INCOMPLETE_1);
    expect(t.record.offerQuestions).toHaveLength(1);
    expect(t.record.offerQuestions[0].latest).toMatchObject({ date: "2026-11-22", city: "Portland" });
    expect(t.record.offerQuestions[0].complete).toMatchObject({ date: "2026-11-18", city: "Vancouver" });
    expect(t.record.progress).toHaveLength(3);
    const preview = t.record.previews[0];
    expect(preview.rows).toHaveLength(3);
    expect(preview.notAdded).toEqual([{ reason: "unknown", after: 1, info: "New song, title not yet known" }]);
    expect(preview.incompleteStatus).toEqual(INCOMPLETE_1);
    expect(outcome.kind).toBe("created");
    const created = outcome as { playlist: { trackCount: number }; misses: unknown[]; incompleteStatus?: unknown };
    expect(created.playlist.trackCount).toBe(3);
    expect(created.misses).toEqual([]);
    expect(created.incompleteStatus).toEqual(INCOMPLETE_1);
  });

  it("AC-19: the reports and questions come in the order of the run: Show, offer, progress, preview, confirmation, creation", async () => {
    const t = pearlJam({ frontEnd: { offer: false } });
    await t.run();
    const order = [
      indexOf(t.events, "setlistfm:findLatest:Pearl Jam"),
      indexOf(t.events, "show:show"),
      indexOf(t.events, "ask:offer"),
      indexOf(t.events, "spotify:getAccessToken"),
      indexOf(t.events, "show:progress:1/3"),
      indexOf(t.events, "show:preview"),
      indexOf(t.events, "ask:confirm"),
      indexOf(t.events, "spotify:createSetlistPlaylist"),
    ];
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("AC-19: offer Yes — a second Show report (Vancouver, not incomplete), 6 progress steps, 'created' not incomplete", async () => {
    const t = pearlJam({ frontEnd: { offer: true } });
    const outcome = await t.run();
    expect(t.record.shows.map((s) => s.show.city)).toEqual(["Portland", "Vancouver"]);
    expect(t.record.shows[1].incompleteStatus).toEqual(COMPLETE);
    expect(t.record.progress).toHaveLength(6);
    expect(outcome.kind).toBe("created");
    expect((outcome as { incompleteStatus?: unknown }).incompleteStatus).toEqual(COMPLETE);
  });

  it("AC-19: confirm 'skip' — no offer question and no alternative looked for", async () => {
    const t = pearlJam({ options: { confirm: "skip" } });
    await t.run();
    expect(t.record.offerQuestions).toEqual([]);
    expect(t.calls.findLatestOptions[0]?.wantCompleteAlternative ?? false).toBe(false);
  });

  it("AC-19: the core makes no real network request", async () => {
    const original = globalThis.fetch;
    let realFetches = 0;
    globalThis.fetch = (async () => {
      realFetches++;
      throw new Error("no network in tests");
    }) as typeof fetch;
    try {
      await pearlJam({ frontEnd: { offer: true } }).run();
    } finally {
      globalThis.fetch = original;
    }
    expect(realFetches).toBe(0);
  });
});
