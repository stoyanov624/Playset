// PRD 0008 — what `playset` prints for medleys: the `Medley` marker in the preview (P1, P2),
// the "Not added" section, Tape questions per Tape part, the counts, and no medley option (P3).
// PRD 0010 replaced P1 by "P1 revisited" (only " / " splits; "+" stays in titles): 13 Performances,
// 12 kept, 9 tracks, 3 Misses. Tests whose expectations changed for that reason cite the PRD 0010 AC.
import { describe, expect, it } from "vitest";
import { main } from "../../src/cli/main.js";
import { makeFakeIo, type FakeIoOptions } from "./fixtures/fake-io";
import { CREATED_SHARE_URL, fixtureMOutcomes } from "../run/fixtures/fake-services";
import { ARCTIC_MONKEYS_CANDIDATES, FIXTURE_A_URL, FIXTURE_M_URL, fixtureM } from "../run/fixtures/setlists";

const USAGE_LINE = "Usage: playset [options] <setlist.fm link | Artist name...>";

/** P1: Fixture M by link, cached token, no duplicate; Tape answers y then n, confirm y. */
function p1(overrides: FakeIoOptions = {}) {
  return makeFakeIo({
    confirmAnswers: [true, false, true],
    ...overrides,
    services: { setlist: fixtureM(), outcomes: fixtureMOutcomes, ...overrides.services },
  });
}

/** P2: PRD 0007's T1 set-up (ambiguous Artist, Fixture A), Tapes y/n, confirm y. */
function p2(overrides: FakeIoOptions = {}) {
  return makeFakeIo({
    selectAnswers: [0],
    confirmAnswers: [true, false, true],
    ...overrides,
    services: { candidates: ARCTIC_MONKEYS_CANDIDATES, ...overrides.services },
  });
}

const trimmedLines = (fake: ReturnType<typeof makeFakeIo>) => fake.stdoutLines().map((l) => l.trim());

/** Asserts that `block` appears as consecutive (trimmed) lines of standard output. */
function expectBlock(fake: ReturnType<typeof makeFakeIo>, block: string[]) {
  const lines = trimmedLines(fake);
  const start = lines.indexOf(block[0]!);
  expect(start, `first line "${block[0]}" in:\n${lines.join("\n")}`).toBeGreaterThanOrEqual(0);
  expect(lines.slice(start, start + block.length)).toEqual(block);
}

/** The trimmed, non-empty lines of the "Not added:" section (up to the next empty line). */
function notAddedSection(fake: ReturnType<typeof makeFakeIo>): string[] | undefined {
  const lines = trimmedLines(fake);
  const heading = lines.findIndex((l) => /^not added:?$/i.test(l));
  if (heading < 0) return undefined;
  const end = lines.findIndex((l, i) => i > heading && l === "");
  return lines.slice(heading + 1, end < 0 ? undefined : end);
}

/** PRD 0010 "P1 revisited": the preview block of P1. */
const P1_PREVIEW = [
  "main",
  "1. Interstellar Overdrive [Tape, Medley, Cover of Pink Floyd]",
  "→ Interstellar Overdrive — Pink Floyd · The Piper at the Gates of Dawn",
  "2. Release",
  "→ Release — Pearl Jam · Ten",
  "3. Daughter [Medley]",
  "→ Daughter — Pearl Jam · Vs.",
  "4. W.M.A. [Medley]",
  "→ W.M.A. — Pearl Jam · Vs.",
  "5. Even Flow + Alive [Medley]",
  "→ Miss",
  "6. Black [Medley]",
  "→ Black — Pearl Jam · Ten",
  "7. Jeremy [Medley]",
  "→ Jeremy — Pearl Jam · Ten",
  "8. Love/Hate",
  "→ Miss",
  "Encore 1",
  "9. Baba O'Riley [Medley, Cover of The Who]",
  "→ Baba O'Riley — The Who · Who's Next",
  "10. Won't Get Fooled Again [Medley, Cover of The Who]",
  "→ Won't Get Fooled Again — The Who · Who's Next",
  "11. Black",
  "→ Black — Pearl Jam · Ten",
  "12. Porch + Yellow Ledbetter [Medley]",
  "→ Miss",
];

// ---------------------------------------------------------------- AC-10

describe("playset — the Medley marker in the preview", () => {
  it("AC-6 (PRD 0010), PRD 0008 AC-10: P1 revisited's preview marks each medley Performance with Medley, in the order Tape, Medley, Cover of …; '+' titles shown whole", async () => {
    const fake = p1();
    const code = await main([FIXTURE_M_URL], fake.io);
    expect(code).toBe(0);
    expectBlock(fake, P1_PREVIEW);
  });

  it("AC-6 (PRD 0010), PRD 0008 AC-10: a row with no markers has no brackets (Release #2, Love/Hate #8, the second Black #11)", async () => {
    const fake = p1();
    await main([FIXTURE_M_URL], fake.io);
    const lines = trimmedLines(fake);
    for (const row of ["2. Release", "8. Love/Hate", "11. Black"]) {
      expect(lines).toContain(row);
      expect(lines.find((l) => l.startsWith(row))).toBe(row);
    }
  });

  it("AC-10: with --tapes, Astronomy Domine is kept Performance #2 with [Tape, Medley, Cover of Pink Floyd]", async () => {
    const fake = p1({ confirmAnswers: [] });
    const code = await main([FIXTURE_M_URL, "--tapes", "--yes"], fake.io);
    expect(code).toBe(0);
    expect(trimmedLines(fake)).toContain("2. Astronomy Domine [Tape, Medley, Cover of Pink Floyd]");
  });

  it("AC-10: P2's preview marks Teddy Picker, Crying Lightning and Cornerstone with Medley (Fixture A)", async () => {
    const fake = p2();
    const code = await main(["arctic", "monkey"], fake.io);
    expect(code).toBe(0);
    expectBlock(fake, [
      "Acoustic",
      "6. Mardy Bum",
      "→ Mardy Bum — Arctic Monkeys · Whatever People Say I Am, That's What I'm Not",
      "7. Teddy Picker [Medley]",
      "→ Teddy Picker — Arctic Monkeys · Favourite Worst Nightmare",
      "8. Crying Lightning [Medley]",
      "→ Crying Lightning — Arctic Monkeys · Humbug",
      "9. Cornerstone [Medley]",
      "→ Cornerstone — Arctic Monkeys · Humbug",
      "Encore 1",
      "10. I Wanna Be Yours",
      "→ I Wanna Be Yours — Arctic Monkeys · AM",
      "11. 505",
      "→ 505 — Arctic Monkeys · Favourite Worst Nightmare",
      "12. Baby, I'm Yours [Cover of Barbara Lewis]",
      "→ Miss",
      "Encore 2",
      "13. R U Mine?",
      "→ R U Mine? — Arctic Monkeys · AM",
    ]);
    expect(trimmedLines(fake)).toContain("1. I Want It All [Tape, Cover of Queen]");
  });
});

// ---------------------------------------------------------------- AC-12

describe("playset — 'Not added' without medleys", () => {
  it("AC-12: P1 lists the left-out Tape part and the snippet, in played order", async () => {
    const fake = p1();
    await main([FIXTURE_M_URL], fake.io);
    expect(notAddedSection(fake)).toEqual([
      "Astronomy Domine (Tape, left out)",
      "Kashmir / Whole Lotta Love (snippet)",
    ]);
  });

  it("AC-12: P1 with --no-tapes lists each Tape part on its own line", async () => {
    const fake = p1({ confirmAnswers: [] });
    await main([FIXTURE_M_URL, "--no-tapes", "--yes"], fake.io);
    expect(notAddedSection(fake)).toEqual([
      "Interstellar Overdrive (Tape, left out)",
      "Astronomy Domine (Tape, left out)",
      "Kashmir / Whole Lotta Love (snippet)",
    ]);
  });

  it("AC-12: P1 with --tapes lists only the snippet", async () => {
    const fake = p1({ confirmAnswers: [] });
    await main([FIXTURE_M_URL, "--tapes", "--yes"], fake.io);
    expect(notAddedSection(fake)).toEqual(["Kashmir / Whole Lotta Love (snippet)"]);
  });

  it("AC-12: P2 lists Hey Jude (snippet) and Mr. Blue Sky (Tape, left out), and no medley", async () => {
    const fake = p2();
    await main(["arctic", "monkey"], fake.io);
    expect(notAddedSection(fake)).toEqual(["Hey Jude (snippet)", "Mr. Blue Sky (Tape, left out)"]);
    expect(fake.stdout()).not.toContain("(medley)");
  });

  it("AC-12: T2 under PRD 0008 (--dry-run --no-tapes) lists I Want It All, Hey Jude, Mr. Blue Sky", async () => {
    const fake = makeFakeIo({ confirmAnswers: [] });
    await main(["--dry-run", "--no-tapes", FIXTURE_A_URL], fake.io);
    expect(notAddedSection(fake)).toEqual([
      "I Want It All (Tape, left out)",
      "Hey Jude (snippet)",
      "Mr. Blue Sky (Tape, left out)",
    ]);
  });

  it("AC-12: with only medleys and no snippet or left-out Tape, there is no 'Not added' section", async () => {
    const fake = makeFakeIo({
      confirmAnswers: [],
      services: {
        setlist: {
          ...(fixtureM() as unknown as Record<string, unknown>),
          sets: { set: [{ song: [{ name: "Daughter / W.M.A." }, { name: "Jeremy", info: "Medley" }] }] },
        } as never,
        outcomes: fixtureMOutcomes,
      },
    });
    const code = await main([FIXTURE_M_URL, "--yes"], fake.io);
    expect(code).toBe(0);
    expect(trimmedLines(fake)).toContain("3. Jeremy [Medley]");
    expect(fake.stdout()).not.toMatch(/not added/i);
  });
});

// ---------------------------------------------------------------- AC-13

describe("playset — Tape questions for Tape medley parts", () => {
  it("AC-13: asks one Tape question per Tape part, in played order, with its title and Original Artist, default No", async () => {
    const fake = p1();
    await main([FIXTURE_M_URL], fake.io);
    const tapeQuestions = fake.confirmQuestions.slice(0, 2);
    expect(tapeQuestions.map((q) => q.message)).toEqual([
      'Add the Tape "Interstellar Overdrive" (Pink Floyd) to the playlist?',
      'Add the Tape "Astronomy Domine" (Pink Floyd) to the playlist?',
    ]);
    for (const q of tapeQuestions) expect(q.default).toBe(false);
    const matched = fake.calls.findMatch.map((c) => c.performance.title);
    expect(matched).toContain("Interstellar Overdrive");
    expect(matched).not.toContain("Astronomy Domine");
  });

  it("AC-13: --tapes and --no-tapes ask no Tape question", async () => {
    for (const flag of ["--tapes", "--no-tapes"]) {
      const fake = p1({ confirmAnswers: [] });
      const code = await main([FIXTURE_M_URL, flag, "--yes"], fake.io);
      expect(code).toBe(0);
      expect(fake.confirmQuestions).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------- AC-14

describe("playset — each part counts as one Performance", () => {
  it("AC-6 (PRD 0010), PRD 0008 AC-14: P1 revisited's Show line counts 13 Performances, 2 Tapes", async () => {
    const fake = p1();
    await main([FIXTURE_M_URL], fake.io);
    expectBlock(fake, [
      "Pearl Jam – 2026-07-08 – Johan Cruijff ArenA, Amsterdam",
      FIXTURE_M_URL,
      "13 Performances, 2 Tapes",
    ]);
  });

  it("AC-6 (PRD 0010), PRD 0008 AC-14: P1 revisited's progress runs 1/12 … 12/12, one step per kept Performance", async () => {
    const fake = p1();
    await main([FIXTURE_M_URL], fake.io);
    const progress = trimmedLines(fake).filter((l) => l.startsWith("Finding Matches"));
    expect(progress).toHaveLength(12);
    expect(progress[0]).toBe("Finding Matches 1/12: Interstellar Overdrive");
    expect(progress[1]).toBe("Finding Matches 2/12: Release");
    expect(progress[4]).toBe("Finding Matches 5/12: Even Flow + Alive");
    expect(progress[11]).toBe("Finding Matches 12/12: Porch + Yellow Ledbetter");
  });

  it("AC-6 (PRD 0010), PRD 0008 AC-14: P1 revisited's preview counts 9 tracks and 3 Misses; the created line says 9 tracks; the Miss list has the two '+' Performances and Love/Hate; the share link is last", async () => {
    const fake = p1();
    const code = await main([FIXTURE_M_URL], fake.io);
    expect(code).toBe(0);
    const lines = trimmedLines(fake);
    expect(lines).toContain("Playlist: Pearl Jam – 2026-07-08 – Amsterdam (private)");
    expect(lines).toContain("9 tracks, 3 Misses");
    expect(lines).toContain('Created "Pearl Jam – 2026-07-08 – Amsterdam" with 9 tracks.');
    expectBlock(fake, [
      "3 Misses (not in the playlist):",
      "Even Flow + Alive — Pearl Jam",
      "Love/Hate — Pearl Jam",
      "Porch + Yellow Ledbetter — Pearl Jam",
    ]);
    expect(fake.lastStdoutLine()).toBe(CREATED_SHARE_URL);
    expect(fake.calls.create[0]!.matches).toHaveLength(9);
  });

  it("AC-6 (PRD 0010), PRD 0008 AC-14: a Miss that came from a medley is listed with no medley marker (with Cover of … for a Cover)", async () => {
    const fake = p1({
      services: {
        outcomes: { ...fixtureMOutcomes, "W.M.A.": "miss", "Won't Get Fooled Again": "miss" },
      },
    });
    await main([FIXTURE_M_URL], fake.io);
    expectBlock(fake, [
      "5 Misses (not in the playlist):",
      "W.M.A. — Pearl Jam",
      "Even Flow + Alive — Pearl Jam",
      "Love/Hate — Pearl Jam",
      "Won't Get Fooled Again — Pearl Jam (Cover of The Who)",
      "Porch + Yellow Ledbetter — Pearl Jam",
    ]);
    const missList = trimmedLines(fake).slice(trimmedLines(fake).indexOf("5 Misses (not in the playlist):"));
    expect(missList.join("\n")).not.toMatch(/medley/i);
  });

  it("AC-14: P2 shows 14 Performances, progress 1/13 … 13/13 with the medley parts as steps 7–9, and 12 tracks", async () => {
    const fake = p2();
    await main(["arctic", "monkey"], fake.io);
    const lines = trimmedLines(fake);
    expect(lines).toContain("14 Performances, 2 Tapes");
    const progress = lines.filter((l) => l.startsWith("Finding Matches"));
    expect(progress).toHaveLength(13);
    expect(progress.slice(6, 10)).toEqual([
      "Finding Matches 7/13: Teddy Picker",
      "Finding Matches 8/13: Crying Lightning",
      "Finding Matches 9/13: Cornerstone",
      "Finding Matches 10/13: I Wanna Be Yours",
    ]);
    expect(progress[12]).toBe("Finding Matches 13/13: R U Mine?");
    expect(lines).toContain("12 tracks, 1 Miss");
    expect(lines).toContain('Created "Arctic Monkeys – 2025-08-23 – Amsterdam" with 12 tracks.');
    expectBlock(fake, ["1 Miss (not in the playlist):", "Baby, I'm Yours — Arctic Monkeys (Cover of Barbara Lewis)"]);
  });

  it("AC-14: T2 under PRD 0008 (--dry-run --no-tapes) shows 14 Performances, progress 1/12 … 12/12, 12 rows and 11 tracks", async () => {
    const fake = makeFakeIo({ confirmAnswers: [] });
    const code = await main(["--dry-run", "--no-tapes", FIXTURE_A_URL], fake.io);
    expect(code).toBe(0);
    const lines = trimmedLines(fake);
    expect(lines).toContain("14 Performances, 2 Tapes");
    const progress = lines.filter((l) => l.startsWith("Finding Matches"));
    expect(progress).toHaveLength(12);
    expect(progress[0]).toBe("Finding Matches 1/12: Sculptures of Anything Goes");
    expect(progress[11]).toBe("Finding Matches 12/12: R U Mine?");
    expect(lines).toContain("12. R U Mine?");
    expect(lines.some((l) => l.startsWith("13. "))).toBe(false);
    expect(lines).toContain("11 tracks, 1 Miss");
  });
});

// ---------------------------------------------------------------- AC-15

describe("playset — no medley option or question", () => {
  for (const option of ["--keep-medleys", "--no-split"]) {
    it(`AC-15: ${option} is an unknown option: named on standard error with the usage line, exit 2, no request (P3)`, async () => {
      const fake = makeFakeIo();
      const code = await main([option, "Pearl Jam"], fake.io);
      expect(code).toBe(2);
      expect(fake.stderr()).toContain(option);
      expect(fake.stderrLines()).toContain(USAGE_LINE);
      expect(fake.selectQuestions).toEqual([]);
      expect(fake.confirmQuestions).toEqual([]);
      expect(fake.events.filter((e) => !e.startsWith("prompt:"))).toEqual([]);
    });
  }

  it("AC-15: --help lists no medley option", async () => {
    const fake = makeFakeIo();
    const code = await main(["--help"], fake.io);
    expect(code).toBe(0);
    expect(fake.stdoutLines()).toContain(USAGE_LINE);
    expect(fake.stdout()).not.toMatch(/medley/i);
    expect(fake.stdout()).not.toMatch(/split/i);
  });

  it("AC-15: no question about medleys is asked in P1 or P2", async () => {
    const p1Run = p1();
    await main([FIXTURE_M_URL], p1Run.io);
    const p2Run = p2();
    await main(["arctic", "monkey"], p2Run.io);
    for (const fake of [p1Run, p2Run]) {
      const questions = fake.transcript.filter((e) => e.stream === "prompt").map((e) => e.text);
      expect(questions.length).toBeGreaterThan(0);
      for (const q of questions) expect(q).not.toMatch(/medley/i);
    }
    expect(p1Run.confirmQuestions).toHaveLength(3);
    expect(p2Run.confirmQuestions).toHaveLength(3);
  });
});

// ---------------------------------------------------------------- PRD 0010 AC-5, AC-6

/** A Pearl Jam Setlist (Fixture M's Show) with a "+" Tape, a "+" song and a "+" info-only medley. */
function plusSongsIo(confirmAnswers: (boolean | "default" | "cancel")[]) {
  return makeFakeIo({
    confirmAnswers,
    services: {
      setlist: {
        ...(fixtureM() as unknown as Record<string, unknown>),
        sets: {
          set: [
            {
              song: [
                { name: "Intro + Release", tape: true },
                { name: "Love + Hate" },
                { name: "Porch + Yellow Ledbetter", info: "Medley" },
              ],
            },
          ],
        },
      } as never,
      outcomes: { "Love + Hate": "miss", "Porch + Yellow Ledbetter": "miss" },
    },
  });
}

describe("playset — a '+' in a title (PRD 0010)", () => {
  it("AC-5: a Tape 'Intro + Release' gets exactly one Tape question showing its full title with '+', default No", async () => {
    const fake = plusSongsIo([true, true]);
    const code = await main([FIXTURE_M_URL], fake.io);
    expect(code).toBe(0);
    const tapeQuestions = fake.confirmQuestions.filter((q) => q.message.startsWith("Add the Tape"));
    expect(tapeQuestions.map((q) => q.message)).toEqual(['Add the Tape "Intro + Release" to the playlist?']);
    expect(tapeQuestions[0]!.default).toBe(false);
    expect(fake.calls.findMatch.map((c) => c.performance.title)).toEqual([
      "Intro + Release",
      "Love + Hate",
      "Porch + Yellow Ledbetter",
    ]);
  });

  it("AC-6: a '+' song's row shows its full title with no Medley marker; a '+' info-only medley's row shows Medley", async () => {
    const fake = plusSongsIo([true, true]);
    await main([FIXTURE_M_URL], fake.io);
    const lines = trimmedLines(fake);
    expect(lines).toContain("2. Love + Hate");
    expect(lines).toContain("3. Porch + Yellow Ledbetter [Medley]");
    const tapeRow = lines.find((l) => l.startsWith("1. "));
    expect(tapeRow).toMatch(/^1\. Intro \+ Release \[Tape\]$/);
    for (const part of ["Intro", "Release", "Love", "Hate", "Porch", "Yellow Ledbetter"]) {
      expect(lines.some((l) => new RegExp(`^\\d+\\. ${part}( \\[.*\\])?$`).test(l))).toBe(false);
    }
  });

  it("AC-6: each '+' song counts as one Performance in the Show line, progress, tracks and Misses", async () => {
    const fake = plusSongsIo([true, true]);
    await main([FIXTURE_M_URL], fake.io);
    const lines = trimmedLines(fake);
    expect(lines.some((l) => /^3 Performances, 1 Tapes?$/.test(l))).toBe(true);
    const progress = lines.filter((l) => l.startsWith("Finding Matches"));
    expect(progress).toEqual([
      "Finding Matches 1/3: Intro + Release",
      "Finding Matches 2/3: Love + Hate",
      "Finding Matches 3/3: Porch + Yellow Ledbetter",
    ]);
    expect(lines.some((l) => /^1 tracks?, 2 Misses$/.test(l))).toBe(true);
    expectBlock(fake, ["2 Misses (not in the playlist):", "Love + Hate — Pearl Jam", "Porch + Yellow Ledbetter — Pearl Jam"]);
  });
});
