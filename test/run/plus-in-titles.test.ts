// PRD 0010 — a "+" in a song name stays part of the title, through the front-end-agnostic run
// (src/core/run): Tape questions, preview rows and counts. Fakes only; no terminal, no network.
import { describe, expect, it } from "vitest";
import { runPlayset, type RunOptions } from "../../src/core/run/index.js";
import { makeFakeFrontEnd, makeFakeServices, match, type FakeFrontEndOptions, type MatchSpec } from "./fixtures/fake-services";
import { FIXTURE_M_URL, fixtureM } from "./fixtures/setlists";
import type { SetlistFmSetlist } from "../../src/core/index.js";

const DEFAULT_OPTIONS: RunOptions = { tapes: "ask", confirm: "ask", public: false, dryRun: false };

/** Fixture M's Show (Pearl Jam, Amsterdam) with a "+" Tape, a "+" song, a "+" info-only medley and a " / " medley. */
function plusSetlist(): SetlistFmSetlist {
  return {
    ...(fixtureM() as unknown as Record<string, unknown>),
    sets: {
      set: [
        {
          song: [
            { name: "Intro + Release", tape: true },
            { name: "Love + Hate" },
            { name: "Porch + Yellow Ledbetter", info: "Medley" },
            { name: "Dumpweed / M+M's" },
          ],
        },
      ],
    },
  } as unknown as SetlistFmSetlist;
}

const outcomes: Record<string, MatchSpec> = {
  "Intro + Release": match("2aaaaaaaaaaaaaaaaaaaaa", "Intro + Release", "Pearl Jam", "Some Album"),
  "Love + Hate": match("1kLqvSbhE2uUuS5WkzYcXy", "Love & Hate", "Pearl Jam", "Love & Hate"),
  "Porch + Yellow Ledbetter": "miss",
  Dumpweed: match("3bbbbbbbbbbbbbbbbbbbbb", "Dumpweed", "Pearl Jam", "Some Album"),
  "M+M's": match("6gLqSwvK3pRzzWZGOS3e4W", "M&M's", "Pearl Jam", "Cheshire Cat"),
};

function setup(options: Partial<RunOptions> = {}, frontEnd: FakeFrontEndOptions = { tapeAnswers: [true], confirm: true }) {
  const events: string[] = [];
  const fake = makeFakeServices({ setlist: plusSetlist(), outcomes, duplicates: [] }, events);
  const ui = makeFakeFrontEnd(frontEnd, events);
  const run = () =>
    runPlayset({
      input: FIXTURE_M_URL,
      options: { ...DEFAULT_OPTIONS, ...options },
      frontEnd: ui.frontEnd,
      services: fake.services,
    });
  return { run, events, calls: fake.calls, record: ui.record };
}

const rowMedley = (row: any): string | undefined => row.performance.medley;

describe("run — a '+' Tape (PRD 0010)", () => {
  it("AC-5: exactly one Tape question is asked for 'Intro + Release', with its full title", async () => {
    const t = setup();
    await t.run();
    expect(t.record.tapeQuestions.map((p) => p.title)).toEqual(["Intro + Release"]);
    expect(t.events.filter((e) => e.startsWith("ask:"))).toEqual(["ask:tape:Intro + Release", "ask:confirm"]);
  });

  it("AC-5: answering No leaves out the whole '+' Tape, listed once in 'not added' under its full title", async () => {
    const t = setup({}, { tapeAnswers: [false], confirm: true });
    await t.run();
    expect(t.record.previews[0].notAdded).toEqual([{ name: "Intro + Release", reason: "tape" }]);
    const matched = t.calls.findMatch.map((c) => c.performance.title);
    for (const title of ["Intro + Release", "Intro", "Release"]) expect(matched).not.toContain(title);
  });
});

describe("run — preview rows and counts with '+' titles (PRD 0010)", () => {
  it("AC-6: a '+' song's row shows its full title with no medley marker; '+' info-only medleys and ' / ' parts carry their medley name", async () => {
    const t = setup();
    await t.run();
    const rows = t.record.previews[0].rows;
    expect(rows.map((r: any) => [r.number, r.performance.title, rowMedley(r)])).toEqual([
      [1, "Intro + Release", undefined],
      [2, "Love + Hate", undefined],
      [3, "Porch + Yellow Ledbetter", "Porch + Yellow Ledbetter"],
      [4, "Dumpweed", "Dumpweed / M+M's"],
      [5, "M+M's", "Dumpweed / M+M's"],
    ]);
  });

  it("AC-6: every count treats a '+' song as one Performance (Performances, Tapes, progress, tracks, Misses)", async () => {
    const t = setup();
    const outcome = await t.run();
    expect(t.record.shows[0].performanceCount).toBe(5);
    expect(t.record.shows[0].tapeCount).toBe(1);
    expect(t.record.progress.map((p) => [p.n, p.total, p.performance.title])).toEqual([
      [1, 5, "Intro + Release"],
      [2, 5, "Love + Hate"],
      [3, 5, "Porch + Yellow Ledbetter"],
      [4, 5, "Dumpweed"],
      [5, 5, "M+M's"],
    ]);
    const preview = t.record.previews[0];
    expect(preview.trackCount).toBe(4);
    expect(preview.missCount).toBe(1);
    expect(t.calls.create[0]!.matches.map((m) => m.uri)).toEqual([
      "spotify:track:2aaaaaaaaaaaaaaaaaaaaa",
      "spotify:track:1kLqvSbhE2uUuS5WkzYcXy",
      "spotify:track:3bbbbbbbbbbbbbbbbbbbbb",
      "spotify:track:6gLqSwvK3pRzzWZGOS3e4W",
    ]);
    const created = outcome as { misses: { title: string; artist: string }[] };
    expect(created.misses.map((m) => [m.title, m.artist])).toEqual([["Porch + Yellow Ledbetter", "Pearl Jam"]]);
  });

  it("AC-6: with Tapes 'all' the '+' Tape is kept without asking and counted once", async () => {
    const t = setup({ tapes: "all", confirm: "skip" }, { tapeAnswers: [] });
    await t.run();
    expect(t.record.tapeQuestions).toEqual([]);
    expect(t.calls.findMatch.filter((c) => c.performance.title === "Intro + Release")).toHaveLength(1);
  });
});
