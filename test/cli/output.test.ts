// PRD 0007 — what `playset` asks and prints during a run (transcripts T1, T2, E1–E13, E16).
// Wording may differ from the PRD's transcripts; every fact named by an AC must be present.
import { describe, expect, it } from "vitest";
import { browserCommandFor, main } from "../../src/cli/main.js";
import { makeFakeIo, positionOf, type FakeIoOptions } from "./fixtures/fake-io";
import {
  AUTHORIZE_URL,
  CREATED_SHARE_URL,
  DUPLICATE,
  fixtureRWithoutMisses,
} from "../run/fixtures/fake-services";
import {
  ARCTIC_MONKEYS_CANDIDATES,
  E2_URL,
  FIXTURE_A_PLAYLIST_NAME,
  FIXTURE_A_URL,
  GENESIS_CANDIDATES,
  announcedBerlinShow,
  fixtureC,
  fixtureF,
  museRomeSetlist,
  onlyTapeSetlist,
  pearlJamSetlist,
  tooLongDescriptionSetlist,
} from "../run/fixtures/setlists";
import { PARTLY_CREATED_SHARE_URL, partlyCreatedPlaylistError, spotifySearchError } from "../run/fixtures/typed-errors";

/** T1: `playset arctic monkey`, ambiguous Artist, full login, one duplicate; Artist #1, Tapes y/n, confirm y. */
function t1(overrides: FakeIoOptions = {}) {
  return makeFakeIo({
    selectAnswers: [0],
    confirmAnswers: [true, false, true],
    ...overrides,
    services: { candidates: ARCTIC_MONKEYS_CANDIDATES, fullLogin: true, duplicates: [DUPLICATE], ...overrides.services },
  });
}

const T1_ARGV = ["arctic", "monkey"];

/** Index of the first stdout line that satisfies `test` (−1 if none). */
function lineIndex(lines: string[], test: (line: string) => boolean, from = 0): number {
  for (let i = from; i < lines.length; i++) if (test(lines[i]!)) return i;
  return -1;
}

const hasAll = (line: string, ...parts: string[]) => parts.every((p) => line.includes(p));

// ---------------------------------------------------------------- Artist

describe("playset — choosing the Artist", () => {
  it("AC-8: shows one select list with the candidates in order as 'name (disambiguation)' or the name alone (T1)", async () => {
    const fake = t1();
    await main(T1_ARGV, fake.io);
    expect(fake.selectQuestions).toHaveLength(1);
    expect(fake.selectQuestions[0]!.choices.map((c) => c.name)).toEqual([
      "Arctic Monkeys (English rock band from Sheffield)",
      "Arctic Monkeys Tribute",
      "The Arctic Monkeys Experience",
    ]);
    expect(fake.calls.chooserAnswers.map((a) => a?.mbid)).toEqual([ARCTIC_MONKEYS_CANDIDATES[0]!.mbid]);
  });

  it("AC-8: picking the second Genesis uses its mbid for the Latest Setlist search (E1)", async () => {
    const fake = makeFakeIo({
      services: { candidates: GENESIS_CANDIDATES },
      selectAnswers: [1],
      confirmAnswers: [],
    });
    await main(["Genesis", "--no-tapes", "--yes"], fake.io);
    expect(fake.selectQuestions[0]!.choices.map((c) => c.name)).toEqual([
      "Genesis (English rock band)",
      "Genesis (US psychedelic rock band)",
      "Genesis Owusu",
    ]);
    expect(fake.events).toContain("setlistfm:setlists:2f4b1c6e-7a8d-4e9f-b0a1-c2d3e4f5a6b7");
  });

  it("AC-8: when setlist.fm picks the Artist automatically, no select list is shown (E1)", async () => {
    const fake = makeFakeIo({ confirmAnswers: [] });
    await main(["Arctic", "Monkeys", "--no-tapes", "--yes"], fake.io);
    expect(fake.selectQuestions).toEqual([]);
  });
});

// ---------------------------------------------------------------- Show

describe("playset — the Show", () => {
  it("AC-9: prints the Show line (Artist, date, venue, city), the URL and the Performance and Tape counts before any Tape question and login (T1)", async () => {
    const fake = t1();
    await main(T1_ARGV, fake.io);
    const out = fake.stdout();
    const lines = fake.stdoutLines();
    expect(lineIndex(lines, (l) => hasAll(l, "Arctic Monkeys", "2025-08-23", "Ziggo Dome", "Amsterdam"))).toBeGreaterThanOrEqual(0);
    expect(out).toContain(FIXTURE_A_URL);
    expect(out).toMatch(/11 Performances/);
    expect(out).toMatch(/2 Tapes/);
    const showAt = positionOf(fake, "Ziggo Dome", "stdout");
    const firstTape = fake.transcript.findIndex((e) => e.stream === "prompt" && e.text.includes("I Want It All"));
    expect(showAt).toBeGreaterThanOrEqual(0);
    expect(showAt).toBeLessThan(firstTape);
    expect(showAt).toBeLessThan(positionOf(fake, AUTHORIZE_URL));
  });

  it("AC-10: a Setlist with no Performances prints the Show line, then a message that it has no Performances yet; exit 1, no question, no Spotify request (E2)", async () => {
    const fake = makeFakeIo({ services: { setlist: announcedBerlinShow() } });
    const code = await main([E2_URL], fake.io);
    expect(code).toBe(1);
    expect(fake.stdout()).toContain("Mercedes-Benz Arena");
    expect(fake.stdout()).toMatch(/0 Performances/);
    expect(fake.stderr()).toMatch(/no Performances/i);
    expect(fake.confirmQuestions).toEqual([]);
    expect(fake.calls.getAccessToken).toBe(0);
    expect(fake.events.filter((e) => e.startsWith("spotify:"))).toEqual([]);
  });

  it("AC-11: a too-long description stops after the Show line with PRD 0006's message; exit 1, no Tape question, no Spotify request (E3)", async () => {
    const fake = makeFakeIo({ services: { setlist: tooLongDescriptionSetlist() } });
    const code = await main([FIXTURE_A_URL], fake.io);
    expect(code).toBe(1);
    expect(fake.stdout()).toContain("Ziggo Dome");
    expect(fake.stderr()).toMatch(/301/);
    expect(fake.stderr()).toMatch(/300/);
    expect(fake.confirmQuestions).toEqual([]);
    expect(fake.calls.getAccessToken).toBe(0);
  });
});

// ---------------------------------------------------------------- Tapes

describe("playset — Tapes", () => {
  it("AC-12: asks one yes/no question per Tape with its title and Original Artist, default No (T1)", async () => {
    const fake = t1();
    await main(T1_ARGV, fake.io);
    const tapeQuestions = fake.confirmQuestions.slice(0, 2);
    expect(tapeQuestions[0]!.message).toContain("I Want It All");
    expect(tapeQuestions[0]!.message).toContain("Queen");
    expect(tapeQuestions[1]!.message).toContain("Mr. Blue Sky");
    expect(tapeQuestions[1]!.message).toContain("Electric Light Orchestra");
    for (const q of tapeQuestions) expect(q.default).toBe(false);
    expect(fake.calls.findMatch.map((c) => c.performance.title)).toContain("I Want It All");
    expect(fake.calls.findMatch.map((c) => c.performance.title)).not.toContain("Mr. Blue Sky");
  });

  it("AC-12: pressing Enter at a Tape question counts as No (E4)", async () => {
    const fake = t1({ confirmAnswers: ["default", "default", true] });
    await main(T1_ARGV, fake.io);
    const titles = fake.calls.findMatch.map((c) => c.performance.title);
    expect(titles).not.toContain("I Want It All");
    expect(titles).not.toContain("Mr. Blue Sky");
  });

  it("AC-12: a Tape played twice is asked about twice (Fixture F)", async () => {
    const fake = makeFakeIo({ services: { setlist: fixtureF() }, confirmAnswers: [true, false] });
    await main([FIXTURE_A_URL, "--yes"], fake.io);
    expect(fake.confirmQuestions.map((q) => q.message.includes("Baba O'Riley"))).toEqual([true, true]);
    expect(fake.calls.findMatch.map((c) => [c.performance.position, c.performance.title])).toEqual([
      [1, "Baba O'Riley"],
      [2, "Alive"],
    ]);
  });

  it("AC-13: --tapes keeps every Tape and asks no Tape question (E4)", async () => {
    const fake = makeFakeIo({ confirmAnswers: [] });
    const code = await main([FIXTURE_A_URL, "--tapes", "--yes"], fake.io);
    expect(code).toBe(0);
    expect(fake.confirmQuestions).toEqual([]);
    expect(fake.calls.findMatch).toHaveLength(11);
  });

  it("AC-14: --no-tapes leaves out every Tape and asks no Tape question (T2)", async () => {
    const fake = makeFakeIo({ confirmAnswers: [] });
    const code = await main([FIXTURE_A_URL, "--no-tapes", "--yes"], fake.io);
    expect(code).toBe(0);
    expect(fake.confirmQuestions).toEqual([]);
    expect(fake.calls.findMatch.map((c) => c.performance.isTape)).not.toContain(true);
  });

  for (const flags of [[], ["--tapes"], ["--no-tapes"]]) {
    it(`AC-15: a Setlist with no Tapes asks no Tape question (${flags.join(" ") || "no flags"}, Fixture C)`, async () => {
      const fake = makeFakeIo({ services: { setlist: fixtureC() }, confirmAnswers: [] });
      await main([FIXTURE_A_URL, ...flags, "--yes"], fake.io);
      expect(fake.confirmQuestions).toEqual([]);
    });
  }

  it("AC-16: --yes still asks the Tape questions and only skips the final confirmation (E4, E12)", async () => {
    const fake = t1({ confirmAnswers: [false, false] });
    const code = await main([...T1_ARGV, "--yes"], fake.io);
    expect(code).toBe(0);
    expect(fake.confirmQuestions).toHaveLength(2);
    expect(fake.confirmQuestions.map((q) => q.message)).toEqual([
      expect.stringContaining("I Want It All"),
      expect.stringContaining("Mr. Blue Sky"),
    ]);
    expect(fake.calls.create).toHaveLength(1);
  });

  for (const [label, flags, answers] of [
    ["--no-tapes", ["--no-tapes"], []],
    ["answer n", [], [false]],
  ] as const) {
    it(`AC-17: with nothing left to add (${label}) a message says so; exit 1, no Spotify login or request (E5)`, async () => {
      const fake = makeFakeIo({ services: { setlist: onlyTapeSetlist() }, confirmAnswers: [...answers] });
      const code = await main([FIXTURE_A_URL, ...flags], fake.io);
      expect(code).toBe(1);
      expect(fake.stderr()).toMatch(/nothing to add/i);
      expect(fake.calls.getAccessToken).toBe(0);
      expect(fake.events.filter((e) => e.startsWith("spotify:"))).toEqual([]);
    });
  }
});

// ---------------------------------------------------------------- login

describe("playset — Spotify login", () => {
  it("AC-18: the token is requested once, after the last Tape answer and before any search", async () => {
    const fake = t1();
    await main(T1_ARGV, fake.io);
    expect(fake.calls.getAccessToken).toBe(1);
    const lastTape = fake.events.lastIndexOf(fake.events.filter((e) => e.startsWith("prompt:confirm:"))[1]!);
    const firstSpotify = fake.events.findIndex((e) => e.startsWith("spotify:"));
    expect(fake.events[firstSpotify]).toBe("spotify:getAccessToken");
    expect(firstSpotify).toBeGreaterThan(lastTape);
  });

  it("AC-19: a full login tries to open the authorize URL in the browser and prints it once with a line to open it by hand", async () => {
    const fake = t1();
    const code = await main(T1_ARGV, fake.io);
    expect(code).toBe(0);
    expect(fake.openedUrls).toEqual([AUTHORIZE_URL]);
    expect(fake.stdout().split(AUTHORIZE_URL)).toHaveLength(2);
    const urlLine = lineIndex(fake.stdoutLines(), (l) => l.includes(AUTHORIZE_URL));
    const around = fake.stdoutLines().slice(Math.max(0, urlLine - 2), urlLine + 1).join("\n");
    expect(around).toMatch(/open/i);
    expect(around).toMatch(/browser/i);
  });

  it("AC-19: the browser is opened with `open` on macOS, `xdg-open` on Linux and `start` on Windows", () => {
    expect(browserCommandFor("darwin")).toBe("open");
    expect(browserCommandFor("linux")).toBe("xdg-open");
    expect(browserCommandFor("win32")).toBe("start");
  });

  it("AC-20: when the browser can't be opened, the URL is still printed, no error is shown, and the run goes on (E6)", async () => {
    const fake = t1({ openBrowserFails: true });
    const code = await main(T1_ARGV, fake.io);
    expect(code).toBe(0);
    expect(fake.stdout().split(AUTHORIZE_URL)).toHaveLength(2);
    expect(fake.stderr()).toBe("");
    expect(fake.output()).not.toMatch(/ENOENT|xdg-open/);
    expect(fake.calls.findMatch).toHaveLength(10);
  });

  it("AC-21: a cached or refreshed token opens no browser and prints no authorize URL (T2)", async () => {
    const fake = t1({ services: { fullLogin: false } });
    await main(T1_ARGV, fake.io);
    expect(fake.openedUrls).toEqual([]);
    expect(fake.output()).not.toContain("accounts.spotify.com");
  });
});

// ---------------------------------------------------------------- matching

describe("playset — matching", () => {
  it("AC-22: each kept Performance is matched once in played order; 505 is matched twice", async () => {
    const fake = t1();
    await main(T1_ARGV, fake.io);
    const titles = fake.calls.findMatch.map((c) => c.performance.title);
    expect(titles).toHaveLength(10);
    expect(titles.filter((t) => t === "505")).toHaveLength(2);
  });

  it("AC-23: shows progress n/N with the title for each Performance, in order (T1)", async () => {
    const fake = t1();
    await main(T1_ARGV, fake.io);
    const lines = fake.stdoutLines();
    const titles = fake.calls.findMatch.map((c) => c.performance.title);
    let from = 0;
    titles.forEach((title, i) => {
      const at = lineIndex(lines, (l) => hasAll(l, `${i + 1}/10`, title), from);
      expect(at, `progress ${i + 1}/10 ${title}`).toBeGreaterThanOrEqual(0);
      from = at + 1;
    });
  });

  it("AC-24: a failing search stops the run with that error's message; exit 1, no further search, nothing created (E8)", async () => {
    const searchError = await spotifySearchError();
    const fake = t1({ services: { failMatchOn: { "Don't Sit Down 'Cause I've Moved Your Chair": searchError } } });
    const code = await main(T1_ARGV, fake.io);
    expect(code).toBe(1);
    expect(fake.stdout()).toMatch(/4\/10/);
    expect(fake.stderr()).toContain(searchError.message);
    expect(fake.calls.findMatch).toHaveLength(4);
    expect(fake.calls.findPlaylistsNamed).toEqual([]);
    expect(fake.calls.create).toEqual([]);
  });

  for (const flags of [[], ["--dry-run"], ["--yes"]]) {
    it(`AC-25: every Performance a Miss lists the Misses, then says no playlist was created; exit 1, no confirmation (${flags.join(" ") || "no flags"}, E9)`, async () => {
      const fake = makeFakeIo({ services: { setlist: museRomeSetlist() }, confirmAnswers: [] });
      const code = await main(["Muse", ...flags], fake.io);
      expect(code).toBe(1);
      const lines = fake.stdoutLines();
      expect(lineIndex(lines, (l) => /2 Misses/.test(l))).toBeGreaterThanOrEqual(0);
      expect(lineIndex(lines, (l) => hasAll(l, "Untitled New Song", "Muse"))).toBeGreaterThanOrEqual(0);
      expect(lineIndex(lines, (l) => hasAll(l, "Another New Song", "Muse"))).toBeGreaterThanOrEqual(0);
      expect(fake.stderr()).toMatch(/no Match/i);
      expect(fake.stderr()).toMatch(/no playlist/i);
      expect(fake.confirmQuestions).toEqual([]);
      expect(fake.calls.findPlaylistsNamed).toEqual([]);
      expect(fake.calls.create).toEqual([]);
    });
  }
});

// ---------------------------------------------------------------- preview

describe("playset — preview", () => {
  it("AC-26: numbers every kept Performance in played order under its Set heading, with Tape/Cover markers and its Match (T1)", async () => {
    const fake = t1();
    await main(T1_ARGV, fake.io);
    const lines = fake.stdoutLines();
    const trimmed = lines.map((l) => l.trim());

    const mainAt = trimmed.indexOf("main");
    const acousticAt = trimmed.indexOf("Acoustic");
    const encore1At = trimmed.indexOf("Encore 1");
    const encore2At = trimmed.indexOf("Encore 2");
    expect(mainAt).toBeGreaterThanOrEqual(0);
    expect(mainAt).toBeLessThan(acousticAt);
    expect(acousticAt).toBeLessThan(encore1At);
    expect(encore1At).toBeLessThan(encore2At);

    const row = (n: number, title: string) => lineIndex(lines, (l) => new RegExp(`^\\s*${n}\\.\\s`).test(l) && l.includes(title));
    const first = row(1, "I Want It All");
    expect(first).toBeGreaterThan(mainAt);
    expect(lines[first]).toContain("Tape");
    expect(lines[first]).toContain("Cover of Queen");
    expect(row(6, "Mardy Bum")).toBeGreaterThan(acousticAt);
    expect(row(7, "I Wanna Be Yours")).toBeGreaterThan(encore1At);
    expect(row(10, "R U Mine?")).toBeGreaterThan(encore2At);
    expect(lines[row(2, "Sculptures of Anything Goes")]).not.toContain("Tape");

    const out = fake.stdout();
    expect(out).toContain("I Want It All - Remastered 2011 — Queen · The Miracle (2011 Remaster)");
    expect(out).toContain("Mardy Bum — Arctic Monkeys · Whatever People Say I Am, That's What I'm Not");
    expect(out).toContain("R U Mine? — Arctic Monkeys · AM");

    const missRow = row(9, "Baby, I'm Yours");
    expect(lines[missRow]).toContain("Cover of Barbara Lewis");
    const missRowAndNext = `${lines[missRow]}\n${lines[missRow + 1]}`;
    expect(missRowAndNext).toMatch(/\bMiss\b/);
  });

  it("AC-26: a live Match ends with (live); several artists are joined with ', '; a Miss says Miss (E7)", async () => {
    const fake = makeFakeIo({ services: { setlist: pearlJamSetlist() }, confirmAnswers: [] });
    await main(["Pearl", "Jam", "--yes"], fake.io);
    const out = fake.stdout();
    expect(out).toContain("Crown of Thorns — Pearl Jam · Live on Two Legs (live)");
    expect(out).toContain("Déjà Vu (feat. Jay-Z) — Beyoncé, JAY-Z · B'Day Deluxe Edition");
    const lines = fake.stdoutLines();
    const untitled = lineIndex(lines, (l) => /^\s*2\.\s/.test(l) && l.includes("Untitled New Song"));
    expect(`${lines[untitled]}\n${lines[untitled + 1]}`).toMatch(/\bMiss\b/);
  });

  it("AC-27: a 'Not added' section lists snippets, medleys and left-out Tapes in played order (T1)", async () => {
    const fake = t1();
    await main(T1_ARGV, fake.io);
    const lines = fake.stdoutLines();
    const heading = lineIndex(lines, (l) => /not added/i.test(l));
    expect(heading).toBeGreaterThanOrEqual(0);
    const heyJude = lineIndex(lines, (l) => hasAll(l, "Hey Jude", "snippet"), heading);
    const teddy = lineIndex(lines, (l) => hasAll(l, "Teddy Picker / Crying Lightning", "medley"), heading);
    const cornerstone = lineIndex(lines, (l) => hasAll(l, "Cornerstone", "medley"), heading);
    const blueSky = lineIndex(lines, (l) => hasAll(l, "Mr. Blue Sky", "Tape, left out"), heading);
    expect([heyJude, teddy, cornerstone, blueSky].every((i) => i > heading)).toBe(true);
    expect([heyJude, teddy, cornerstone, blueSky]).toEqual([...[heyJude, teddy, cornerstone, blueSky]].sort((a, b) => a - b));
  });

  it("AC-27: with --no-tapes, the first Tape is listed before the snippet (T2)", async () => {
    const fake = makeFakeIo({ confirmAnswers: [] });
    await main(["--dry-run", "--no-tapes", FIXTURE_A_URL], fake.io);
    const lines = fake.stdoutLines();
    const heading = lineIndex(lines, (l) => /not added/i.test(l));
    const wantItAll = lineIndex(lines, (l) => hasAll(l, "I Want It All", "Tape, left out"), heading);
    const heyJude = lineIndex(lines, (l) => hasAll(l, "Hey Jude", "snippet"), heading);
    expect(wantItAll).toBeGreaterThan(heading);
    expect(wantItAll).toBeLessThan(heyJude);
  });

  it("AC-27: with nothing left out there is no 'Not added' section", async () => {
    const fake = makeFakeIo({ services: { setlist: pearlJamSetlist() }, confirmAnswers: [] });
    await main(["Pearl", "Jam", "--yes"], fake.io);
    expect(fake.stdout()).not.toMatch(/not added/i);
  });

  it("AC-28: shows the playlist name, private, the number of tracks and the number of Misses (T1)", async () => {
    const fake = t1();
    await main(T1_ARGV, fake.io);
    const lines = fake.stdoutLines();
    expect(lineIndex(lines, (l) => hasAll(l, FIXTURE_A_PLAYLIST_NAME, "private"))).toBeGreaterThanOrEqual(0);
    expect(fake.stdout()).toMatch(/\b9 tracks\b/);
    expect(fake.stdout()).toMatch(/\b1 Miss\b/);
  });

  it("AC-29: warns about each playlist with the same name, with its name and share link, and says a new one is created anyway (T1)", async () => {
    const fake = t1();
    await main(T1_ARGV, fake.io);
    const lines = fake.stdoutLines();
    const warning = lineIndex(lines, (l) => /already/i.test(l) || /warning/i.test(l));
    expect(warning).toBeGreaterThanOrEqual(0);
    expect(lineIndex(lines, (l) => hasAll(l, DUPLICATE.name, DUPLICATE.shareUrl), warning)).toBeGreaterThanOrEqual(0);
    expect(fake.stdout()).toMatch(/new playlist/i);
    expect(fake.calls.findPlaylistsNamed).toHaveLength(1);
  });

  it("AC-29: no playlist with the same name means no warning (E10)", async () => {
    const fake = t1({ services: { duplicates: [] } });
    await main(T1_ARGV, fake.io);
    expect(fake.output()).not.toMatch(/warning/i);
    expect(fake.output()).not.toContain(DUPLICATE.shareUrl);
  });

  it("AC-30: the whole preview, with the duplicate warning, is shown before the confirmation question (T1, E11)", async () => {
    const fake = t1();
    await main(T1_ARGV, fake.io);
    const confirmAt = fake.transcript.findIndex((e) => e.stream === "prompt" && /create/i.test(e.text));
    expect(confirmAt).toBeGreaterThan(0);
    for (const needle of ["R U Mine? — Arctic Monkeys · AM", "Mr. Blue Sky", "9 tracks", DUPLICATE.shareUrl]) {
      const at = positionOf(fake, needle, "stdout");
      expect(at, needle).toBeGreaterThanOrEqual(0);
      expect(at, needle).toBeLessThan(confirmAt);
    }
  });
});

// ---------------------------------------------------------------- confirm and create

describe("playset — confirming and creating", () => {
  it("AC-31: asks one yes/no question to create the playlist, default No; Yes creates it (T1)", async () => {
    const fake = t1();
    const code = await main(T1_ARGV, fake.io);
    expect(code).toBe(0);
    const finalQuestion = fake.confirmQuestions[2]!;
    expect(fake.confirmQuestions).toHaveLength(3);
    expect(finalQuestion.message).toMatch(/create/i);
    expect(finalQuestion.default).toBe(false);
    expect(fake.calls.create).toHaveLength(1);
  });

  for (const answer of [false, "default"] as const) {
    it(`AC-32: answering ${answer === false ? "n" : "Enter"} creates nothing, says no playlist was created; exit 0 (E11)`, async () => {
      const fake = t1({ confirmAnswers: [true, false, answer] });
      const code = await main(T1_ARGV, fake.io);
      expect(code).toBe(0);
      expect(fake.calls.create).toEqual([]);
      expect(fake.output()).toMatch(/no playlist (was )?created/i);
      expect(fake.output()).not.toContain(CREATED_SHARE_URL);
    });
  }

  it("AC-33: --yes asks no confirmation and creates the playlist (E12)", async () => {
    const fake = t1({ confirmAnswers: [true, false] });
    const code = await main([...T1_ARGV, "--yes"], fake.io);
    expect(code).toBe(0);
    expect(fake.confirmQuestions.filter((q) => /create/i.test(q.message))).toEqual([]);
    expect(fake.calls.create).toHaveLength(1);
    expect(fake.lastStdoutLine()).toBe(CREATED_SHARE_URL);
  });

  it("AC-34: --public creates a public playlist and the preview says public (T1)", async () => {
    const fake = t1();
    await main([...T1_ARGV, "--public"], fake.io);
    expect(fake.calls.create[0]!.options.public).toBe(true);
    expect(lineIndex(fake.stdoutLines(), (l) => hasAll(l, FIXTURE_A_PLAYLIST_NAME, "public"))).toBeGreaterThanOrEqual(0);
    expect(lineIndex(fake.stdoutLines(), (l) => hasAll(l, FIXTURE_A_PLAYLIST_NAME, "private"))).toBe(-1);
  });

  it("AC-34: without --public the playlist is created private", async () => {
    const fake = t1();
    await main(T1_ARGV, fake.io);
    expect(fake.calls.create[0]!.options.public).toBe(false);
  });

  for (const flags of [["--dry-run"], ["--dry-run", "--yes"]]) {
    it(`AC-35: ${flags.join(" ")} shows the preview and the Misses, ends with a dry-run line, asks nothing and creates nothing; exit 0 (T2)`, async () => {
      const fake = makeFakeIo({ confirmAnswers: [] });
      const code = await main([...flags, "--no-tapes", FIXTURE_A_URL], fake.io);
      expect(code).toBe(0);
      expect(fake.calls.findMatch).toHaveLength(9);
      expect(fake.calls.findPlaylistsNamed).toHaveLength(1);
      expect(fake.confirmQuestions).toEqual([]);
      expect(fake.calls.create).toEqual([]);
      const lines = fake.stdoutLines();
      expect(lineIndex(lines, (l) => hasAll(l, "Baby, I'm Yours", "Arctic Monkeys", "Cover of Barbara Lewis"))).toBeGreaterThanOrEqual(0);
      expect(fake.lastStdoutLine()).toMatch(/dry run/i);
      expect(fake.lastStdoutLine()).toMatch(/no playlist/i);
    });
  }
});

// ---------------------------------------------------------------- result

describe("playset — result", () => {
  it("AC-36: prints the created line, then the Misses under a heading with their count, then the share link last (T1)", async () => {
    const fake = t1();
    const code = await main(T1_ARGV, fake.io);
    expect(code).toBe(0);
    const lines = fake.stdoutLines();
    const lastPreviewRow = lineIndex(lines, (l) => hasAll(l, "R U Mine? — Arctic Monkeys · AM"));
    const created = lineIndex(lines, (l) => hasAll(l, FIXTURE_A_PLAYLIST_NAME) && /\b9 tracks\b/.test(l) && /created|added/i.test(l), lastPreviewRow + 1);
    const missHeading = lineIndex(lines, (l) => /\b1 Miss\b/.test(l), created + 1);
    const missLine = lineIndex(lines, (l) => l.includes("Baby, I'm Yours — Arctic Monkeys (Cover of Barbara Lewis)"), missHeading + 1);
    const link = lines.lastIndexOf(CREATED_SHARE_URL);
    expect(created).toBeGreaterThan(lastPreviewRow);
    expect(missHeading).toBeGreaterThan(created);
    expect(missLine).toBeGreaterThan(missHeading);
    expect(link).toBeGreaterThan(missLine);
    expect(fake.lastStdoutLine()).toBe(CREATED_SHARE_URL);
  });

  it("AC-36: with no Misses, a line says every Performance has a Match (E13)", async () => {
    const fake = makeFakeIo({ services: { outcomes: fixtureRWithoutMisses }, confirmAnswers: [] });
    const code = await main(["Arctic", "Monkeys", "--tapes", "--yes"], fake.io);
    expect(code).toBe(0);
    const lines = fake.stdoutLines();
    expect(lineIndex(lines, (l) => hasAll(l, FIXTURE_A_PLAYLIST_NAME) && /\b11 tracks\b/.test(l) && /created|added/i.test(l))).toBeGreaterThanOrEqual(0);
    expect(fake.stdout()).toMatch(/every Performance has a Match/i);
    expect(fake.lastStdoutLine()).toBe(CREATED_SHARE_URL);
  });

  it("AC-37: the share link is the last line of standard output when the playlist was created (T1)", async () => {
    const fake = t1();
    await main(T1_ARGV, fake.io);
    expect(fake.lastStdoutLine()).toBe(CREATED_SHARE_URL);
  });

  it("AC-37: the share link is the last line of standard output when the playlist was only partly created (E16)", async () => {
    const partly = await partlyCreatedPlaylistError();
    const fake = makeFakeIo({ services: { fail: { createSetlistPlaylist: partly } }, confirmAnswers: [] });
    const code = await main([FIXTURE_A_URL, "--tapes", "--yes"], fake.io);
    expect(code).toBe(1);
    expect(fake.lastStdoutLine()).toBe(PARTLY_CREATED_SHARE_URL);
  });
});
