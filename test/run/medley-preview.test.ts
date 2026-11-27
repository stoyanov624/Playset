// PRD 0008 — medley parts in the front-end-agnostic run (src/core/run): P1 (Fixture M) and P2
// (Fixture A revisited) through the core with fakes. No terminal, no network.
import { describe, expect, it } from "vitest";
import { runPlayset, type RunOptions } from "../../src/core/run/index.js";
import {
  CREATED_SHARE_URL,
  P1_URIS,
  T1_URIS,
  fixtureMOutcomes,
  fixtureR,
  makeFakeFrontEnd,
  makeFakeServices,
  type FakeFrontEndOptions,
  type FakeServicesOptions,
} from "./fixtures/fake-services";
import {
  FIXTURE_A_URL,
  FIXTURE_M_PLAYLIST_NAME,
  FIXTURE_M_SETLIST_ID,
  FIXTURE_M_URL,
  fixtureA,
  fixtureM,
  fixtureMShow,
  withFixtureAShow,
} from "./fixtures/setlists";

const DEFAULT_OPTIONS: RunOptions = { tapes: "ask", confirm: "ask", public: false, dryRun: false };

interface SetupOptions {
  input?: string;
  options?: Partial<RunOptions>;
  services?: FakeServicesOptions;
  frontEnd?: FakeFrontEndOptions;
}

/** P1's set-up by default: Fixture M by link, cached token, no duplicate; Tapes y/n, confirm y. */
function setup(opts: SetupOptions = {}) {
  const events: string[] = [];
  const fake = makeFakeServices(
    { setlist: fixtureM(), outcomes: fixtureMOutcomes, fullLogin: false, duplicates: [], ...opts.services },
    events,
  );
  const ui = makeFakeFrontEnd({ tapeAnswers: [true, false], confirm: true, ...opts.frontEnd }, events);
  const run = () =>
    runPlayset({
      input: opts.input ?? FIXTURE_M_URL,
      options: { ...DEFAULT_OPTIONS, ...opts.options },
      frontEnd: ui.frontEnd,
      services: fake.services,
    });
  return { run, events, calls: fake.calls, record: ui.record };
}

/** The medley name a preview row carries for its Performance (undefined = none). */
const rowMedley = (row: any): string | undefined => row.performance.medley;

/** P1's 14 kept Performances (Astronomy Domine left out), in played order. */
const P1_KEPT_TITLES = [
  "Interstellar Overdrive",
  "Release",
  "Daughter",
  "W.M.A.",
  "Even Flow",
  "Alive",
  "Black",
  "Jeremy",
  "Love/Hate",
  "Baba O'Riley",
  "Won't Get Fooled Again",
  "Black",
  "Porch",
  "Yellow Ledbetter",
];

// ---------------------------------------------------------------- AC-11

describe("run — medley name in the preview rows (P1)", () => {
  it("AC-11: each preview row carries its Performance's medley name, or none", async () => {
    const t = setup();
    await t.run();
    expect(t.calls.getSetlist).toEqual([FIXTURE_M_SETLIST_ID]);
    const rows = t.record.previews[0].rows;
    expect(rows.map((r: any) => [r.number, r.performance.title, rowMedley(r)])).toEqual([
      [1, "Interstellar Overdrive", "Interstellar Overdrive / Astronomy Domine"],
      [2, "Release", undefined],
      [3, "Daughter", "Daughter / W.M.A."],
      [4, "W.M.A.", "Daughter / W.M.A."],
      [5, "Even Flow", "Even Flow + Alive / Black"],
      [6, "Alive", "Even Flow + Alive / Black"],
      [7, "Black", "Even Flow + Alive / Black"],
      [8, "Jeremy", "Jeremy"],
      [9, "Love/Hate", undefined],
      [10, "Baba O'Riley", "Baba O'Riley / Won't Get Fooled Again"],
      [11, "Won't Get Fooled Again", "Baba O'Riley / Won't Get Fooled Again"],
      [12, "Black", undefined],
      [13, "Porch", "Porch + Yellow Ledbetter"],
      [14, "Yellow Ledbetter", "Porch + Yellow Ledbetter"],
    ]);
  });

  it("AC-11: row 3 carries 'Daughter / W.M.A.', row 8 carries 'Jeremy', and rows 2, 9 and 12 carry none", async () => {
    const t = setup();
    await t.run();
    const rows = t.record.previews[0].rows;
    expect(rowMedley(rows[2])).toBe("Daughter / W.M.A.");
    expect(rowMedley(rows[7])).toBe("Jeremy");
    for (const i of [1, 8, 11]) expect(rowMedley(rows[i])).toBeUndefined();
  });

  it("AC-11: the medley parts of Fixture A (P2) carry their medley names in the preview", async () => {
    const t = setup({
      input: FIXTURE_A_URL,
      services: { setlist: fixtureA(), outcomes: fixtureR },
    });
    await t.run();
    const rows = t.record.previews[0].rows;
    expect(rows.slice(5, 10).map((r: any) => [r.number, r.performance.title, rowMedley(r)])).toEqual([
      [6, "Mardy Bum", undefined],
      [7, "Teddy Picker", "Teddy Picker / Crying Lightning"],
      [8, "Crying Lightning", "Teddy Picker / Crying Lightning"],
      [9, "Cornerstone", "Cornerstone"],
      [10, "I Wanna Be Yours", undefined],
    ]);
  });
});

// ---------------------------------------------------------------- AC-12

describe("run — 'not added' never lists a medley", () => {
  it("AC-12: 'not added' lists the left-out Tape part and the snippet, in played order (P1)", async () => {
    const t = setup();
    await t.run();
    expect(t.record.previews[0].notAdded).toEqual([
      { name: "Astronomy Domine", reason: "tape" },
      { name: "Kashmir / Whole Lotta Love", reason: "snippet" },
    ]);
  });

  it("AC-12: with Tapes 'none', each left-out Tape part is listed on its own (P1 --no-tapes)", async () => {
    const t = setup({ options: { tapes: "none" }, frontEnd: { tapeAnswers: [] } });
    await t.run();
    expect(t.record.previews[0].notAdded).toEqual([
      { name: "Interstellar Overdrive", reason: "tape" },
      { name: "Astronomy Domine", reason: "tape" },
      { name: "Kashmir / Whole Lotta Love", reason: "snippet" },
    ]);
  });

  it("AC-12: with Tapes 'all', 'not added' lists only the snippet (P1 --tapes)", async () => {
    const t = setup({ options: { tapes: "all" }, frontEnd: { tapeAnswers: [] } });
    await t.run();
    expect(t.record.previews[0].notAdded).toEqual([{ name: "Kashmir / Whole Lotta Love", reason: "snippet" }]);
  });

  it("AC-12: a Setlist whose only song is a medley (no snippet, no Tape) has an empty 'not added'", async () => {
    const t = setup({
      input: FIXTURE_A_URL,
      services: {
        setlist: withFixtureAShow({ set: [{ song: [{ name: "Dead Star + In Your World" }, { name: "Hysteria", info: "Medley" }] }] }),
      },
      frontEnd: { tapeAnswers: [] },
    });
    await t.run();
    expect(t.record.previews[0].notAdded).toEqual([]);
    expect(t.record.previews[0].rows.map((r: any) => r.performance.title)).toEqual(["Dead Star", "In Your World", "Hysteria"]);
  });

  it("AC-12: no 'not added' entry ever has the reason 'medley' (P1, Fixture A)", async () => {
    for (const variant of [setup(), setup({ input: FIXTURE_A_URL, services: { setlist: fixtureA(), outcomes: fixtureR } })]) {
      await variant.run();
      const reasons = variant.record.previews[0].notAdded.map((n: any) => n.reason);
      expect(reasons).not.toContain("medley");
    }
  });
});

// ---------------------------------------------------------------- AC-13

describe("run — Tape medley parts", () => {
  it("AC-13: one Tape question per Tape part, in played order, with its title and Original Artist; each answer decides only that part", async () => {
    const t = setup({ frontEnd: { tapeAnswers: [true, false] } });
    await t.run();
    expect(t.record.tapeQuestions.map((p) => [p.title, p.originalArtist])).toEqual([
      ["Interstellar Overdrive", "Pink Floyd"],
      ["Astronomy Domine", "Pink Floyd"],
    ]);
    const matched = t.calls.findMatch.map((c) => c.performance.title);
    expect(matched).toContain("Interstellar Overdrive");
    expect(matched).not.toContain("Astronomy Domine");
  });

  it("AC-13: answering No then Yes keeps only the second Tape part, at its played position", async () => {
    const t = setup({ frontEnd: { tapeAnswers: [false, true] } });
    await t.run();
    expect(t.calls.findMatch.slice(0, 2).map((c) => [c.performance.position, c.performance.title])).toEqual([
      [2, "Astronomy Domine"],
      [3, "Release"],
    ]);
    expect(t.record.previews[0].notAdded[0]).toEqual({ name: "Interstellar Overdrive", reason: "tape" });
  });

  it("AC-13: Tapes 'all' keeps every Tape part without asking; Astronomy Domine is kept Performance #2", async () => {
    const t = setup({ options: { tapes: "all" }, frontEnd: { tapeAnswers: [] } });
    await t.run();
    expect(t.record.tapeQuestions).toEqual([]);
    const row2 = t.record.previews[0].rows[1];
    expect(row2.number).toBe(2);
    expect(row2.performance).toMatchObject({ title: "Astronomy Domine", isTape: true, originalArtist: "Pink Floyd" });
    expect(rowMedley(row2)).toBe("Interstellar Overdrive / Astronomy Domine");
  });

  it("AC-13: Tapes 'none' leaves out every Tape part without asking", async () => {
    const t = setup({ options: { tapes: "none" }, frontEnd: { tapeAnswers: [] } });
    await t.run();
    expect(t.record.tapeQuestions).toEqual([]);
    const matched = t.calls.findMatch.map((c) => c.performance.title);
    expect(matched).not.toContain("Interstellar Overdrive");
    expect(matched).not.toContain("Astronomy Domine");
  });
});

// ---------------------------------------------------------------- AC-14

describe("run — each part counts as one Performance (P1)", () => {
  it("AC-14: the Show summary counts 15 Performances and 2 Tapes", async () => {
    const t = setup();
    await t.run();
    expect(t.record.shows[0].show).toEqual(fixtureMShow);
    expect(t.record.shows[0].performanceCount).toBe(15);
    expect(t.record.shows[0].tapeCount).toBe(2);
  });

  it("AC-14: matching runs once per kept part, in played order, with progress 1/14 … 14/14", async () => {
    const t = setup();
    await t.run();
    expect(t.calls.findMatch.map((c) => c.performance.title)).toEqual(P1_KEPT_TITLES);
    expect(t.record.progress.map((p) => [p.n, p.total, p.performance.title])).toEqual(
      P1_KEPT_TITLES.map((title, i) => [i + 1, 14, title]),
    );
  });

  it("AC-14: the preview counts 13 tracks and 1 Miss and has 14 rows", async () => {
    const t = setup();
    await t.run();
    const preview = t.record.previews[0];
    expect(preview.playlistName).toBe(FIXTURE_M_PLAYLIST_NAME);
    expect(preview.rows).toHaveLength(14);
    expect(preview.rows.map((r: any) => r.number)).toEqual(Array.from({ length: 14 }, (_, i) => i + 1));
    expect(preview.trackCount).toBe(13);
    expect(preview.missCount).toBe(1);
  });

  it("AC-14: the Setlist Playlist gets the 13 Matches in played order, the repeated Black twice", async () => {
    const t = setup();
    const outcome = await t.run();
    expect(t.calls.create).toHaveLength(1);
    expect(t.calls.create[0]!.show).toEqual(fixtureMShow);
    expect(t.calls.create[0]!.matches.map((m) => m.uri)).toEqual(P1_URIS);
    expect(outcome.kind).toBe("created");
    const created = outcome as {
      playlist: { shareUrl: string; trackCount: number };
      misses: { title: string; artist: string; originalArtist?: string }[];
    };
    expect(created.playlist.shareUrl).toBe(CREATED_SHARE_URL);
    expect(created.playlist.trackCount).toBe(13);
    expect(created.misses.map((m) => [m.title, m.artist, m.originalArtist])).toEqual([["Love/Hate", "Pearl Jam", undefined]]);
  });

  it("AC-14: T1 under PRD 0008 (P2) creates the playlist from 12 Matches, the 3 medley parts right after Mardy Bum", async () => {
    const t = setup({
      input: FIXTURE_A_URL,
      services: { setlist: fixtureA(), outcomes: fixtureR },
    });
    await t.run();
    const uris = t.calls.create[0]!.matches.map((m) => m.uri);
    expect(uris).toEqual(T1_URIS);
    const mardy = uris.indexOf("spotify:track:0kqA4Fm1Jj6GdW4Ws9bNXa");
    expect(uris.slice(mardy + 1, mardy + 4)).toEqual([
      "spotify:track:0BxE4FqsDD1Ot4YuBXwAPp",
      "spotify:track:4nDOavRzjNNwUcCkhnLkBX",
      "spotify:track:5bdQGzFFHSKZtIkwfP8BaN",
    ]);
  });
});

// ---------------------------------------------------------------- AC-15

describe("run — no medley question", () => {
  it("AC-15: the only questions asked are the Tape questions and the confirmation (P1)", async () => {
    const t = setup();
    await t.run();
    expect(t.events.filter((e) => e.startsWith("ask:"))).toEqual([
      "ask:tape:Interstellar Overdrive",
      "ask:tape:Astronomy Domine",
      "ask:confirm",
    ]);
  });

  it("AC-15: with Tapes 'all' and the confirmation skipped, nothing at all is asked (P1)", async () => {
    const t = setup({ options: { tapes: "all", confirm: "skip" }, frontEnd: { tapeAnswers: [] } });
    const outcome = await t.run();
    expect(t.events.filter((e) => e.startsWith("ask:"))).toEqual([]);
    expect(outcome.kind).toBe("created");
  });
});
