// PRD 0008 — medley parts in the front-end-agnostic run (src/core/run): P1 (Fixture M) and P2
// (Fixture A revisited) through the core with fakes. No terminal, no network.
// PRD 0010 replaced P1 by "P1 revisited" (only " / " splits): 13 Performances, 12 kept, 9 tracks,
// 3 Misses. Tests whose expectations changed for that reason cite the PRD 0010 AC.
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

/** P1 revisited (PRD 0010): the 12 kept Performances (Astronomy Domine left out), in played order. */
const P1_KEPT_TITLES = [
  "Interstellar Overdrive",
  "Release",
  "Daughter",
  "W.M.A.",
  "Even Flow + Alive",
  "Black",
  "Jeremy",
  "Love/Hate",
  "Baba O'Riley",
  "Won't Get Fooled Again",
  "Black",
  "Porch + Yellow Ledbetter",
];

// ---------------------------------------------------------------- AC-11

describe("run — medley name in the preview rows (P1)", () => {
  it("AC-6 (PRD 0010), PRD 0008 AC-11: each preview row of P1 revisited carries its Performance's medley name, or none", async () => {
    const t = setup();
    await t.run();
    expect(t.calls.getSetlist).toEqual([FIXTURE_M_SETLIST_ID]);
    const rows = t.record.previews[0].rows;
    expect(rows.map((r: any) => [r.number, r.performance.title, rowMedley(r)])).toEqual([
      [1, "Interstellar Overdrive", "Interstellar Overdrive / Astronomy Domine"],
      [2, "Release", undefined],
      [3, "Daughter", "Daughter / W.M.A."],
      [4, "W.M.A.", "Daughter / W.M.A."],
      [5, "Even Flow + Alive", "Even Flow + Alive / Black"],
      [6, "Black", "Even Flow + Alive / Black"],
      [7, "Jeremy", "Jeremy"],
      [8, "Love/Hate", undefined],
      [9, "Baba O'Riley", "Baba O'Riley / Won't Get Fooled Again"],
      [10, "Won't Get Fooled Again", "Baba O'Riley / Won't Get Fooled Again"],
      [11, "Black", undefined],
      [12, "Porch + Yellow Ledbetter", "Porch + Yellow Ledbetter"],
    ]);
  });

  it("AC-6 (PRD 0010), PRD 0008 AC-11: row 3 carries 'Daughter / W.M.A.', row 5 'Even Flow + Alive / Black', row 7 'Jeremy', row 12 'Porch + Yellow Ledbetter', and rows 2, 8 and 11 carry none", async () => {
    const t = setup();
    await t.run();
    const rows = t.record.previews[0].rows;
    expect(rowMedley(rows[2])).toBe("Daughter / W.M.A.");
    expect(rowMedley(rows[4])).toBe("Even Flow + Alive / Black");
    expect(rowMedley(rows[6])).toBe("Jeremy");
    expect(rowMedley(rows[11])).toBe("Porch + Yellow Ledbetter");
    for (const i of [1, 7, 10]) expect(rowMedley(rows[i])).toBeUndefined();
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

  it("AC-2 (PRD 0010), PRD 0008 AC-12: a Setlist of a '+' song and an info-only medley (no snippet, no Tape) has an empty 'not added'", async () => {
    const t = setup({
      input: FIXTURE_A_URL,
      services: {
        setlist: withFixtureAShow({ set: [{ song: [{ name: "Dead Star + In Your World" }, { name: "Hysteria", info: "Medley" }] }] }),
      },
      frontEnd: { tapeAnswers: [] },
    });
    await t.run();
    expect(t.record.previews[0].notAdded).toEqual([]);
    expect(t.record.previews[0].rows.map((r: any) => r.performance.title)).toEqual(["Dead Star + In Your World", "Hysteria"]);
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
  it("AC-6 (PRD 0010), PRD 0008 AC-14: the Show summary counts 13 Performances and 2 Tapes", async () => {
    const t = setup();
    await t.run();
    expect(t.record.shows[0].show).toEqual(fixtureMShow);
    expect(t.record.shows[0].performanceCount).toBe(13);
    expect(t.record.shows[0].tapeCount).toBe(2);
  });

  it("AC-6 (PRD 0010), PRD 0008 AC-14: matching runs once per kept Performance, in played order, with progress 1/12 … 12/12", async () => {
    const t = setup();
    await t.run();
    expect(t.calls.findMatch.map((c) => c.performance.title)).toEqual(P1_KEPT_TITLES);
    expect(t.record.progress.map((p) => [p.n, p.total, p.performance.title])).toEqual(
      P1_KEPT_TITLES.map((title, i) => [i + 1, 12, title]),
    );
  });

  it("AC-6 (PRD 0010), PRD 0008 AC-14: the preview counts 9 tracks and 3 Misses and has 12 rows", async () => {
    const t = setup();
    await t.run();
    const preview = t.record.previews[0];
    expect(preview.playlistName).toBe(FIXTURE_M_PLAYLIST_NAME);
    expect(preview.rows).toHaveLength(12);
    expect(preview.rows.map((r: any) => r.number)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
    expect(preview.trackCount).toBe(9);
    expect(preview.missCount).toBe(3);
  });

  it("AC-6 (PRD 0010), PRD 0008 AC-14: the Setlist Playlist gets the 9 Matches in played order, the repeated Black twice; the Misses are the two '+' Performances and Love/Hate", async () => {
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
    expect(created.playlist.trackCount).toBe(9);
    expect(created.misses.map((m) => [m.title, m.artist, m.originalArtist])).toEqual([
      ["Even Flow + Alive", "Pearl Jam", undefined],
      ["Love/Hate", "Pearl Jam", undefined],
      ["Porch + Yellow Ledbetter", "Pearl Jam", undefined],
    ]);
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
