// PRD 0011 — what `playset` prints and asks for Unknown Songs and Incomplete Setlists:
// the warning after the Show line, the offer question, the "Not added" entries, the preview
// warning line and the Note line in the summary. Wording may differ from the PRD's examples;
// every fact an AC names must be present. Fake terminal, fake services, no network.
import { describe, expect, it } from "vitest";
import { main } from "../../src/cli/main.js";
import { makeFakeIo, positionOf, type FakeIo, type FakeIoOptions } from "./fixtures/fake-io";
import { CREATED_SHARE_URL } from "../run/fixtures/fake-services";
import { FIXTURE_A_URL, fixtureA, fixtureC, withFixtureAShow } from "../run/fixtures/setlists";
import { partlyCreatedPlaylistError, spotifySearchError } from "../run/fixtures/typed-errors";
import {
  NIRVANA_PLAYLIST_NAME,
  NIRVANA_URIS,
  NIRVANA_URL,
  PORTLAND_PLAYLIST_NAME,
  PORTLAND_URL,
  RADIOHEAD_URL,
  VANCOUVER_PLAYLIST_NAME,
  VANCOUVER_URL,
  nirvanaOutcomes,
  nirvanaTacoma,
  pearlJamOutcomes,
  pearlJamPortland,
  pearlJamVancouver,
  portlandOnlyUnknownSongs,
  radioheadNoteIncomplete,
  vancouverShow,
  withSongs,
} from "../run/fixtures/incomplete-setlists";
import {
  loadFixture,
  loadFixtureA,
  makeClient,
  makeFakes,
  ok,
  paths,
  setlistsPage,
} from "../setlistfm/helpers";

const STACK_FRAME = /^\s+at\s/m;
const ONE_UNKNOWN = /\b1 Unknown Song\b(?!s)/;

/** L1 by Artist name: Latest = Portland (incomplete), newest complete = Vancouver. */
function pearlJam(overrides: FakeIoOptions = {}) {
  return makeFakeIo({
    confirmAnswers: [],
    ...overrides,
    services: {
      setlist: pearlJamPortland(),
      completeAlternative: pearlJamVancouver(),
      outcomes: pearlJamOutcomes,
      ...overrides.services,
    },
  });
}

/** T1 (PRD 0011): Nirvana by link. */
function nirvana(overrides: FakeIoOptions = {}) {
  return makeFakeIo({
    confirmAnswers: [true],
    ...overrides,
    services: { setlist: nirvanaTacoma(), outcomes: nirvanaOutcomes, ...overrides.services },
  });
}

const trimmed = (fake: FakeIo) => fake.stdoutLines().map((l) => l.trim());
const hasAll = (line: string, ...parts: string[]) => parts.every((p) => line.includes(p));

function lineIndex(lines: string[], test: (line: string) => boolean, from = 0): number {
  for (let i = from; i < lines.length; i++) if (test(lines[i]!)) return i;
  return -1;
}

/** The lines of the incomplete warning that follows the counts line (up to the next empty line). */
function showWarning(fake: FakeIo, countsLine: string | RegExp): { at: number; lines: string[] } {
  const lines = trimmed(fake);
  const counts = typeof countsLine === "string" ? lines.indexOf(countsLine) : lines.findIndex((l) => countsLine.test(l));
  expect(counts, `counts line "${countsLine}" in:\n${lines.join("\n")}`).toBeGreaterThanOrEqual(0);
  const end = lines.findIndex((l, i) => i > counts && l === "");
  return { at: counts + 1, lines: lines.slice(counts + 1, end < 0 ? undefined : end) };
}

function expectShowWarning(fake: FakeIo, countsLine: string | RegExp, ...reasons: (string | RegExp)[]) {
  const warning = showWarning(fake, countsLine);
  expect(warning.lines.length, "a warning right after the counts line").toBeGreaterThan(0);
  expect(warning.lines[0]).toMatch(/incomplete/i);
  const text = warning.lines.join("\n");
  for (const reason of reasons) {
    if (typeof reason === "string") expect(text).toContain(reason);
    else expect(text).toMatch(reason);
  }
  expect(text).toMatch(/not be the full Show/i);
}

function expectNoShowWarning(fake: FakeIo, countsLine: string) {
  const warning = showWarning(fake, countsLine);
  expect(warning.lines.join("\n")).not.toMatch(/incomplete/i);
}

/** The trimmed lines of the "Not added:" section (up to the next empty line). */
function notAddedSection(fake: FakeIo): string[] | undefined {
  const lines = trimmed(fake);
  const heading = lines.findIndex((l) => /^not added:?$/i.test(l));
  if (heading < 0) return undefined;
  const end = lines.findIndex((l, i) => i > heading && l === "");
  return lines.slice(heading + 1, end < 0 ? undefined : end);
}

/** Index of the preview's playlist name line (name + private/public). */
const playlistLine = (fake: FakeIo, name: string) =>
  lineIndex(trimmed(fake), (l) => l.includes(name) && /\b(private|public)\b/.test(l));

/** Index of the preview's incomplete warning line: after the last progress line, before the playlist line. */
function previewWarningIndex(fake: FakeIo, name: string): number {
  const lines = trimmed(fake);
  const lastProgress = lines.map((l) => l.startsWith("Finding Matches")).lastIndexOf(true);
  const nameAt = playlistLine(fake, name);
  expect(nameAt).toBeGreaterThan(lastProgress);
  for (let i = nameAt - 1; i > lastProgress; i--) if (/incomplete/i.test(lines[i]!)) return i;
  return -1;
}

/** Index of the summary's Note line: the last line mentioning "incomplete" after the preview's playlist line. */
function noteIndex(fake: FakeIo, name: string): number {
  const lines = trimmed(fake);
  const nameAt = playlistLine(fake, name);
  for (let i = lines.length - 1; i > nameAt; i--) if (/incomplete/i.test(lines[i]!)) return i;
  return -1;
}

/** stdout lines written after the transcript entry at `index`. */
function stdoutAfter(fake: FakeIo, index: number): string[] {
  return fake.transcript
    .slice(index + 1)
    .filter((e) => e.stream === "stdout")
    .map((e) => e.text)
    .join("")
    .split("\n")
    .map((l) => l.trim());
}

const promptIndex = (fake: FakeIo, re: RegExp) => fake.transcript.findIndex((e) => e.stream === "prompt" && re.test(e.text));

// ---------------------------------------------------------------- O1, O2 — the offer

describe("playset — the offer of the newest complete Setlist (L1)", () => {
  it("AC-10: the Portland Show line is followed right away by the warning: 1 Unknown Song, may not be the full Show (O1)", async () => {
    const fake = pearlJam({ confirmAnswers: [true, true] });
    await main(["Pearl", "Jam"], fake.io);
    const lines = trimmed(fake);
    expect(lineIndex(lines, (l) => hasAll(l, "Pearl Jam", "2026-11-22", "Moda Center", "Portland"))).toBeGreaterThanOrEqual(0);
    expect(fake.stdout()).toContain(PORTLAND_URL);
    expectShowWarning(fake, "3 Performances, 0 Tapes", ONE_UNKNOWN);
  });

  it("AC-11: one yes/no question gives both dates and cities, default No, after the warning (O1)", async () => {
    const fake = pearlJam({ confirmAnswers: [true, true] });
    await main(["Pearl", "Jam"], fake.io);
    const offer = fake.confirmQuestions[0]!;
    for (const part of ["2026-11-22", "Portland", "2026-11-18", "Vancouver"]) expect(offer.message).toContain(part);
    expect(offer.default).toBe(false);
    const offerAt = promptIndex(fake, /Vancouver/);
    expect(offerAt).toBeGreaterThan(positionOf(fake, "3 Performances", "stdout"));
    expect(offerAt).toBeGreaterThan(fake.transcript.findIndex((e) => e.stream === "stdout" && /incomplete/i.test(e.text)));
    expect(fake.events.findIndex((e) => e.startsWith("spotify:"))).toBeGreaterThan(
      fake.events.findIndex((e) => e.startsWith("prompt:confirm:") && e.includes("Vancouver")),
    );
  });

  it("AC-11: answer Yes prints the Vancouver Show line with no incomplete warning and builds the Setlist Playlist from it (O1)", async () => {
    const fake = pearlJam({ confirmAnswers: [true, true] });
    const code = await main(["Pearl", "Jam"], fake.io);
    expect(code).toBe(0);
    const after = stdoutAfter(fake, promptIndex(fake, /Vancouver/));
    expect(lineIndex(after, (l) => hasAll(l, "Pearl Jam", "2026-11-18", "Rogers Arena", "Vancouver"))).toBeGreaterThanOrEqual(0);
    expect(after).toContain(VANCOUVER_URL);
    expect(after).toContain("6 Performances, 0 Tapes");
    expect(after.join("\n")).not.toMatch(/incomplete/i);
    expect(after.filter((l) => l.startsWith("Finding Matches"))).toHaveLength(6);
    expect(playlistLine(fake, VANCOUVER_PLAYLIST_NAME)).toBeGreaterThanOrEqual(0);
    expect(notAddedSection(fake)).toBeUndefined();
    expect(fake.calls.create[0]!.show).toEqual(vancouverShow);
    expect(fake.stdout()).toMatch(/every Performance has a Match/i);
    expect(fake.lastStdoutLine()).toBe(CREATED_SHARE_URL);
  });

  for (const answer of [false, "default"] as const) {
    it(`AC-11: answer ${answer === false ? "n" : "Enter"} keeps Portland as the Setlist in use (O2)`, async () => {
      const fake = pearlJam({ confirmAnswers: [answer, true] });
      const code = await main(["Pearl", "Jam"], fake.io);
      expect(code).toBe(0);
      expect(fake.calls.findMatch.map((c) => c.performance.title)).toEqual(["Release", "Even Flow", "Alive"]);
      expect(playlistLine(fake, PORTLAND_PLAYLIST_NAME)).toBeGreaterThanOrEqual(0);
      expect(fake.stdout()).not.toContain("Rogers Arena");
      expect(fake.calls.create[0]!.show.city).toBe("Portland");
    });
  }

  it("AC-14, AC-15, AC-16, AC-17: O2 lists the Unknown Song after #1, warns before the playlist line, adds the Note line before the share link; 3 progress steps", async () => {
    const fake = pearlJam({ confirmAnswers: [false, true] });
    await main(["Pearl", "Jam"], fake.io);
    const lines = trimmed(fake);
    expect(lines.filter((l) => l.startsWith("Finding Matches"))).toHaveLength(3);
    expect(notAddedSection(fake)).toEqual(["(Unknown song) after #1 — New song, title not yet known"]);
    const warn = previewWarningIndex(fake, PORTLAND_PLAYLIST_NAME);
    expect(warn).toBeGreaterThanOrEqual(0);
    expect(lines[warn]).toMatch(ONE_UNKNOWN);
    expect(lineIndex(lines, (l) => /\b3 tracks\b/.test(l))).toBeGreaterThanOrEqual(0);
    const every = lineIndex(lines, (l) => /every Performance has a Match/i.test(l));
    const note = noteIndex(fake, PORTLAND_PLAYLIST_NAME);
    expect(note).toBeGreaterThan(every);
    expect(lines[note]).toMatch(/full Show/i);
    expect(note).toBeLessThan(lines.lastIndexOf(CREATED_SHARE_URL));
    expect(fake.lastStdoutLine()).toBe(CREATED_SHARE_URL);
  });
});

// ---------------------------------------------------------------- AC-12

describe("playset — when the offer question is skipped (AC-12)", () => {
  it("AC-12: --yes prints the warning but asks no offer and looks for no alternative; the Note line is printed (O3)", async () => {
    const fake = pearlJam();
    const code = await main(["Pearl", "Jam", "--yes"], fake.io);
    expect(code).toBe(0);
    expect(fake.confirmQuestions).toEqual([]);
    expect(fake.calls.findLatestOptions[0]?.wantCompleteAlternative ?? false).toBe(false);
    expectShowWarning(fake, "3 Performances, 0 Tapes", ONE_UNKNOWN);
    expect(fake.calls.create[0]!.show.city).toBe("Portland");
    expect(noteIndex(fake, PORTLAND_PLAYLIST_NAME)).toBeGreaterThanOrEqual(0);
    expect(fake.lastStdoutLine()).toBe(CREATED_SHARE_URL);
  });

  it("AC-12, AC-16: --dry-run still asks the offer; with n the output ends with the Note line, then the dry-run line (O4)", async () => {
    const fake = pearlJam({ confirmAnswers: [false] });
    const code = await main(["Pearl", "Jam", "--dry-run"], fake.io);
    expect(code).toBe(0);
    expect(fake.confirmQuestions).toHaveLength(1);
    expect(fake.confirmQuestions[0]!.message).toContain("Vancouver");
    const lines = trimmed(fake).filter((l) => l !== "");
    expect(lines.at(-1)).toMatch(/dry run/i);
    expect(lines.at(-2)).toMatch(/incomplete/i);
    expect(lines.at(-2)).toMatch(/full Show/i);
    expect(fake.calls.create).toEqual([]);
  });

  it("AC-12: --dry-run --yes asks no offer question", async () => {
    const fake = pearlJam();
    const code = await main(["Pearl", "Jam", "--dry-run", "--yes"], fake.io);
    expect(code).toBe(0);
    expect(fake.confirmQuestions).toEqual([]);
    expect(fake.calls.findLatestOptions[0]?.wantCompleteAlternative ?? false).toBe(false);
  });

  for (const flag of ["--tapes", "--no-tapes", "--public"]) {
    it(`AC-12: ${flag} doesn't skip the offer question`, async () => {
      const fake = pearlJam({ confirmAnswers: [false, true] });
      await main(["Pearl", "Jam", flag], fake.io);
      expect(fake.confirmQuestions[0]!.message).toContain("Vancouver");
      expect(fake.confirmQuestions).toHaveLength(2);
    });
  }

  it("AC-12: an Artist name whose Latest Setlist is incomplete with no complete Setlist found gets only the warning, no question", async () => {
    const fake = pearlJam({ confirmAnswers: [true], services: { completeAlternative: undefined } });
    const code = await main(["Pearl", "Jam"], fake.io);
    expect(code).toBe(0);
    expectShowWarning(fake, "3 Performances, 0 Tapes", ONE_UNKNOWN);
    expect(fake.confirmQuestions).toHaveLength(1);
    expect(fake.confirmQuestions[0]!.message).toMatch(/create/i);
  });

  it("AC-12 (PRD 0007 T1): Arctic Monkeys by name without --yes requests setlists page 2, which has no setlists; warning only, no offer", async () => {
    const sfm = makeFakes([
      ok(loadFixture("search-arctic-monkeys.json")),
      ok(setlistsPage(1, 1047, [loadFixtureA()])),
      ok(setlistsPage(2, 1047, [])),
    ]);
    const client = makeClient(sfm) as unknown as {
      getSetlist(id: string): Promise<unknown>;
      findLatestSetlistByArtistName(...args: unknown[]): Promise<unknown>;
    };
    const fake = makeFakeIo({ confirmAnswers: [] });
    const base = fake.io as unknown as Record<string, unknown>;
    const io = {
      ...base,
      services: {
        ...(base.services as Record<string, unknown>),
        getSetlist: (id: string) => client.getSetlist(id),
        findLatestSetlistByArtistName: (...args: unknown[]) => client.findLatestSetlistByArtistName(...args),
      },
    } as unknown as typeof fake.io;
    const code = await main(["Arctic", "Monkeys", "--dry-run", "--no-tapes"], io);
    expect(code).toBe(0);
    const setlistsPath = "/rest/1.0/artist/ada7a83c-e3e1-40f1-93f9-3e73dbfd2c7c/setlists";
    expect(paths(sfm.requests)).toEqual(["/rest/1.0/search/artists", setlistsPath, setlistsPath]);
    expect(sfm.requests.map((r) => r.parsed.searchParams.get("p"))).toEqual(["1", "1", "2"]);
    expect(fake.confirmQuestions).toEqual([]);
    expectShowWarning(fake, "14 Performances, 2 Tapes", ONE_UNKNOWN);
  });
});

// ---------------------------------------------------------------- AC-13

describe("playset — Ctrl-C at the offer question", () => {
  it("AC-13: prints one 'Cancelled.' line, no stack trace, no Spotify request; exit 130 (O5)", async () => {
    const fake = pearlJam({ confirmAnswers: ["cancel"] });
    const code = await main(["Pearl", "Jam"], fake.io);
    expect(code).toBe(130);
    const lines = fake.output().split("\n").map((l) => l.trim()).filter((l) => l !== "");
    expect(lines.filter((l) => l === "Cancelled.")).toHaveLength(1);
    expect(fake.output()).not.toMatch(STACK_FRAME);
    expect(fake.output()).not.toContain("ExitPromptError");
    expect(fake.events.filter((e) => e.startsWith("spotify:"))).toEqual([]);
    expect(fake.calls.findLatest).toEqual(["Pearl Jam"]);
  });
});

// ---------------------------------------------------------------- T1 — a link: warn only

describe("playset — a link to an Incomplete Setlist (T1)", () => {
  it("AC-10: the Nirvana Show line is followed by the warning (1 Unknown Song); no offer question; only that Setlist is fetched", async () => {
    const fake = nirvana({ services: { completeAlternative: pearlJamVancouver() } });
    const code = await main([NIRVANA_URL], fake.io);
    expect(code).toBe(0);
    const lines = trimmed(fake);
    expect(lineIndex(lines, (l) => hasAll(l, "Nirvana", "1987-04-18", "Community World Theater", "Tacoma"))).toBeGreaterThanOrEqual(0);
    expectShowWarning(fake, "9 Performances, 0 Tapes", ONE_UNKNOWN);
    expect(fake.confirmQuestions).toHaveLength(1);
    expect(fake.confirmQuestions[0]!.message).toMatch(/create/i);
    expect(fake.calls.getSetlist).toEqual(["53d60349"]);
    expect(fake.calls.findLatest).toEqual([]);
  });

  it("AC-10: the warning is on standard output and comes before the first progress line", async () => {
    const fake = nirvana();
    await main([NIRVANA_URL], fake.io);
    const warnAt = fake.transcript.findIndex((e) => e.stream === "stdout" && /incomplete/i.test(e.text));
    expect(warnAt).toBeGreaterThanOrEqual(0);
    expect(warnAt).toBeLessThan(positionOf(fake, "Finding Matches", "stdout"));
    expect(fake.stderr()).not.toMatch(/incomplete/i);
  });

  it("AC-14, AC-17: 9 progress steps; 'Not added' holds only the Unknown Song after #7 with its info text", async () => {
    const fake = nirvana();
    await main([NIRVANA_URL], fake.io);
    const progress = trimmed(fake).filter((l) => l.startsWith("Finding Matches"));
    expect(progress).toHaveLength(9);
    expect(progress[0]).toMatch(/1\/9.*Love Buzz/);
    expect(progress[8]).toMatch(/9\/9.*Paper Cuts/);
    expect(notAddedSection(fake)).toEqual(["(Unknown song) after #7 — Written as 'Dope Hippie' on the setlist"]);
    expect(trimmed(fake)).toContain("8. Pen Cap Chew");
  });

  it("AC-15: the preview warning line (1 Unknown Song) comes before the playlist line", async () => {
    const fake = nirvana();
    await main([NIRVANA_URL], fake.io);
    const lines = trimmed(fake);
    const warn = previewWarningIndex(fake, NIRVANA_PLAYLIST_NAME);
    expect(warn).toBeGreaterThan(lineIndex(lines, (l) => /^not added:?$/i.test(l)));
    expect(lines[warn]).toMatch(ONE_UNKNOWN);
    expect(lines).toContain("8 tracks, 1 Miss");
  });

  it("AC-16, AC-17: created line, the one Miss (not the Unknown Song), then the Note line, then the share link last", async () => {
    const fake = nirvana();
    const code = await main([NIRVANA_URL], fake.io);
    expect(code).toBe(0);
    const lines = trimmed(fake);
    const created = lineIndex(lines, (l) => l.includes(NIRVANA_PLAYLIST_NAME) && /\b8 tracks\b/.test(l) && /created|added/i.test(l));
    const missHeading = lineIndex(lines, (l) => /\b1 Miss\b/.test(l), created + 1);
    const missLine = lineIndex(lines, (l) => l === "Spank Thru — Nirvana", missHeading + 1);
    const note = noteIndex(fake, NIRVANA_PLAYLIST_NAME);
    const link = lines.lastIndexOf(CREATED_SHARE_URL);
    expect(created).toBeGreaterThan(0);
    expect(missHeading).toBeGreaterThan(created);
    expect(missLine).toBeGreaterThan(missHeading);
    expect(note).toBeGreaterThan(missLine);
    expect(lines[note]).toMatch(/full Show/i);
    expect(link).toBeGreaterThan(note);
    expect(fake.lastStdoutLine()).toBe(CREATED_SHARE_URL);
    expect(lines.slice(missHeading, note).join("\n")).not.toMatch(/unknown/i);
    expect(fake.calls.create[0]!.matches.map((m) => m.uri)).toEqual(NIRVANA_URIS);
  });

  it("AC-10, AC-15, AC-16: a note-only Incomplete Setlist warns with the Setlist note in quotes; no 'Not added' section (T1b)", async () => {
    const fake = makeFakeIo({ confirmAnswers: [true], services: { setlist: radioheadNoteIncomplete() } });
    const code = await main([RADIOHEAD_URL], fake.io);
    expect(code).toBe(0);
    expectShowWarning(fake, "3 Performances, 0 Tapes", '"Setlist incomplete"');
    expect(showWarning(fake, "3 Performances, 0 Tapes").lines.join("\n")).not.toMatch(/Unknown Song/);
    expect(notAddedSection(fake)).toBeUndefined();
    const name = "Radiohead – 2026-06-14 – London";
    const warn = previewWarningIndex(fake, name);
    expect(warn).toBeGreaterThanOrEqual(0);
    expect(trimmed(fake)[warn]).toContain('"Setlist incomplete"');
    expect(noteIndex(fake, name)).toBeLessThan(trimmed(fake).lastIndexOf(CREATED_SHARE_URL));
    expect(noteIndex(fake, name)).toBeGreaterThan(playlistLine(fake, name));
  });

  it("AC-10: both reasons are given: 2 Unknown Songs and the Setlist note (T1c)", async () => {
    const setlist = withSongs(
      radioheadNoteIncomplete(),
      [{ name: "Airbag" }, { name: "" }, { name: "Karma Police" }, { name: "" }],
      { info: "Rest of the set unknown." },
    );
    const fake = makeFakeIo({ confirmAnswers: [true], services: { setlist } });
    await main([RADIOHEAD_URL], fake.io);
    expectShowWarning(fake, "2 Performances, 0 Tapes", /\b2 Unknown Songs\b/, '"Rest of the set unknown."');
  });

  it("AC-10: a link whose only songs are Unknown Songs prints the Show line, 0 Performances, the warning (2 Unknown Songs), then the no-Performances message; exit 1 (T1d)", async () => {
    const fake = makeFakeIo({ services: { setlist: portlandOnlyUnknownSongs() } });
    const code = await main([PORTLAND_URL], fake.io);
    expect(code).toBe(1);
    expectShowWarning(fake, "0 Performances, 0 Tapes", /\b2 Unknown Songs\b/);
    expect(fake.stderr()).toMatch(/no Performances/i);
    const warnAt = fake.transcript.findIndex((e) => e.stream === "stdout" && /incomplete/i.test(e.text));
    const noPerfAt = fake.transcript.findIndex((e) => e.stream === "stderr" && /no Performances/i.test(e.text));
    expect(warnAt).toBeLessThan(noPerfAt);
    expect(fake.confirmQuestions).toEqual([]);
    expect(fake.events.filter((e) => e.startsWith("spotify:"))).toEqual([]);
  });

  it("AC-10: the warning comes before the Tape questions", async () => {
    const setlist = withSongs(nirvanaTacoma(), [{ name: "Intro", tape: true }, { name: "" }, { name: "Downer" }]);
    const fake = makeFakeIo({ confirmAnswers: [false, true], services: { setlist, outcomes: nirvanaOutcomes } });
    await main([NIRVANA_URL], fake.io);
    const warnAt = fake.transcript.findIndex((e) => e.stream === "stdout" && /incomplete/i.test(e.text));
    const tapeAt = promptIndex(fake, /Intro/);
    expect(warnAt).toBeGreaterThanOrEqual(0);
    expect(warnAt).toBeLessThan(tapeAt);
  });
});

// ---------------------------------------------------------------- T2 — "after #n" numbering

describe("playset — '(Unknown song) after #n' counts the preview numbering (T2)", () => {
  it("AC-14: Fixture A with 'I Want It All' kept: Hey Jude (snippet), (Unknown song) after #9, Mr. Blue Sky (Tape, left out)", async () => {
    const fake = makeFakeIo({ confirmAnswers: [true, false] });
    await main(["--dry-run", FIXTURE_A_URL], fake.io);
    expect(notAddedSection(fake)).toEqual([
      "Hey Jude (snippet)",
      "(Unknown song) after #9",
      "Mr. Blue Sky (Tape, left out)",
    ]);
  });

  it("AC-14: Fixture A with --no-tapes: the Unknown Song is after #8", async () => {
    const fake = makeFakeIo({ confirmAnswers: [] });
    await main(["--dry-run", "--no-tapes", FIXTURE_A_URL], fake.io);
    expect(notAddedSection(fake)).toEqual([
      "I Want It All (Tape, left out)",
      "Hey Jude (snippet)",
      "(Unknown song) after #8",
      "Mr. Blue Sky (Tape, left out)",
    ]);
  });

  it("AC-14: an Unknown Song before every kept Performance is '(Unknown song) at the start — Intro jam'", async () => {
    const setlist = withFixtureAShow({ set: [{ song: [{ name: "", info: "Intro jam" }, { name: "Brianstorm" }] }] });
    const fake = makeFakeIo({ confirmAnswers: [], services: { setlist } });
    await main(["--dry-run", FIXTURE_A_URL], fake.io);
    expect(notAddedSection(fake)).toEqual(["(Unknown song) at the start — Intro jam"]);
  });

  it("AC-14: when only left-out Tapes come before it, the Unknown Song is 'at the start'", async () => {
    const setlist = withFixtureAShow({ set: [{ song: [{ name: "Intro", tape: true }, { name: "" }, { name: "Brianstorm" }] }] });
    const fake = makeFakeIo({ confirmAnswers: [], services: { setlist } });
    await main(["--dry-run", "--no-tapes", FIXTURE_A_URL], fake.io);
    expect(notAddedSection(fake)).toEqual(["Intro (Tape, left out)", "(Unknown song) at the start"]);
  });
});

// ---------------------------------------------------------------- not incomplete, and runs without the summary

describe("playset — no incomplete lines when they don't apply", () => {
  it("AC-10, AC-15, AC-16: a complete Setlist gets no warning, no preview warning line and no Note line", async () => {
    for (const [argv, setlist] of [
      [["Pearl", "Jam", "--yes"], pearlJamVancouver()],
      [[FIXTURE_A_URL, "--yes"], fixtureC()],
    ] as const) {
      const fake = makeFakeIo({ confirmAnswers: [], services: { setlist, outcomes: pearlJamOutcomes } });
      const code = await main([...argv], fake.io);
      expect(code).toBe(0);
      expect(fake.output()).not.toMatch(/incomplete/i);
      expect(fake.output()).not.toMatch(/Unknown song/i);
    }
  });

  it("AC-10: the Vancouver Show line has no warning", async () => {
    const fake = makeFakeIo({ confirmAnswers: [], services: { setlist: pearlJamVancouver(), outcomes: pearlJamOutcomes } });
    await main(["Pearl", "Jam", "--yes"], fake.io);
    expectNoShowWarning(fake, "6 Performances, 0 Tapes");
  });

  it("AC-16: confirmation declined — no Note line", async () => {
    const fake = nirvana({ confirmAnswers: [false] });
    const code = await main([NIRVANA_URL], fake.io);
    expect(code).toBe(0);
    expect(stdoutAfter(fake, promptIndex(fake, /create/i)).join("\n")).not.toMatch(/incomplete/i);
  });

  it("AC-16: every kept Performance a Miss — no Note line and no preview warning", async () => {
    const allMisses = Object.fromEntries(Object.keys(nirvanaOutcomes).map((k) => [k, "miss" as const]));
    const fake = nirvana({ confirmAnswers: [], services: { outcomes: allMisses } });
    const code = await main([NIRVANA_URL], fake.io);
    expect(code).toBe(1);
    const lines = trimmed(fake);
    const lastProgress = lines.map((l) => l.startsWith("Finding Matches")).lastIndexOf(true);
    expect(lines.slice(lastProgress + 1).join("\n")).not.toMatch(/incomplete/i);
  });

  it("AC-16: nothing to add — no Note line", async () => {
    const setlist = withSongs(nirvanaTacoma(), [{ name: "Intro", tape: true }, { name: "" }]);
    const fake = makeFakeIo({ confirmAnswers: [], services: { setlist } });
    const code = await main([NIRVANA_URL, "--no-tapes"], fake.io);
    expect(code).toBe(1);
    expect(fake.stderr()).toMatch(/nothing to add/i);
    const warning = showWarning(fake, /^1 Performances?, 1 Tapes?$/);
    expect(warning.lines[0]).toMatch(/incomplete/i);
    const lines = trimmed(fake);
    expect(lines.slice(warning.at + warning.lines.length).join("\n")).not.toMatch(/incomplete/i);
  });

  it("AC-16: a partly created playlist — no Note line", async () => {
    const partly = await partlyCreatedPlaylistError();
    const fake = nirvana({ confirmAnswers: [], services: { fail: { createSetlistPlaylist: partly } } });
    const code = await main([NIRVANA_URL, "--yes"], fake.io);
    expect(code).toBe(1);
    const lines = trimmed(fake);
    const nameAt = playlistLine(fake, NIRVANA_PLAYLIST_NAME);
    expect(lines.slice(nameAt + 1).join("\n")).not.toMatch(/incomplete/i);
  });

  it("AC-16: an error during matching — no Note line", async () => {
    const searchError = await spotifySearchError();
    const fake = nirvana({ confirmAnswers: [], services: { failMatchOn: { Downer: searchError } } });
    const code = await main([NIRVANA_URL, "--yes"], fake.io);
    expect(code).toBe(1);
    const lines = trimmed(fake);
    const lastProgress = lines.map((l) => l.startsWith("Finding Matches")).lastIndexOf(true);
    expect(lines.slice(lastProgress + 1).join("\n")).not.toMatch(/incomplete/i);
  });

  it("AC-17: Fixture A's Show line counts are unchanged by its Unknown Song (14 Performances, 2 Tapes; 12 tracks)", async () => {
    const fake = makeFakeIo({ confirmAnswers: [true, false], services: { setlist: fixtureA() } });
    await main(["--dry-run", FIXTURE_A_URL], fake.io);
    const lines = trimmed(fake);
    expect(lines).toContain("14 Performances, 2 Tapes");
    expect(lines.filter((l) => l.startsWith("Finding Matches"))).toHaveLength(13);
    expect(lines).toContain("12 tracks, 1 Miss");
  });
});
