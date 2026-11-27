// PRD 0009 — the interactive shell: `playset` with no arguments in a terminal opens a session.
// Driven through main([], io) with a fake terminal (test/cli/fixtures/fake-shell-io.ts):
// scripted Lines, Ctrl-C and end-of-input events, fake questions, fake RunServices,
// captured stdout/stderr. No real terminal, no network.
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { main } from "../../src/cli/main.js";
import { makeFakeIo } from "./fixtures/fake-io";
import {
  CTRL_C,
  CTRL_D,
  SHELL_PROMPT,
  ctrlCWhileTyping,
  makeFakeShellIo,
  nonEmptyLines,
  requestEvents,
  type FakeShell,
  type FakeShellIoOptions,
  type ScriptEntry,
} from "./fixtures/fake-shell-io";
import {
  AUTHORIZE_URL,
  CREATED_SHARE_URL,
  REFRESH_TOKEN,
  SETLISTFM_API_KEY,
  TOKEN,
} from "../run/fixtures/fake-services";
import {
  ARCTIC_MONKEYS_CANDIDATES,
  E2_URL,
  FIXTURE_A_PLAYLIST_NAME,
  FIXTURE_A_SETLIST_ID,
  FIXTURE_A_URL,
  announcedBerlinShow,
  museRomeSetlist,
  onlyTapeSetlist,
  tooLongDescriptionSetlist,
} from "../run/fixtures/setlists";
import {
  PARTLY_CREATED_SHARE_URL,
  artistNotFoundError,
  missingClientIdError,
  missingIdLink,
  missingSetlistFmApiKeyError,
  notASetlistPageLink,
  partlyCreatedPlaylistError,
  setlistFmRateLimitError,
  setlistLinkError,
  setlistNotFoundError,
  spotifySearchError,
} from "../run/fixtures/typed-errors";
import {
  API_KEY,
  T0,
  loadFixture,
  loadFixtureA,
  makeClient,
  makeFakes,
  makeTempRoot,
  notFound,
  ok,
  removeTempRoot,
  setlistsPage,
  writeConfigFile,
} from "../setlistfm/helpers";

type ServiceOverride = NonNullable<FakeShellIoOptions["overrideServices"]>;

const USAGE_LINE = "Usage: playset [options] <setlist.fm link | Artist name...>";
const BANNER_1 = "Playset 0.1.0";
const BANNER_2 = "Type a setlist.fm link or an Artist name. Type help for commands, exit to leave.";
const SHELL_HINT = "Type help to see the options.";
const LEAVE_HINT = "(To leave, type exit or press Ctrl-C again.)";
const STACK_FRAME = /^\s+at\s/m;
const SECRETS = [SETLISTFM_API_KEY, TOKEN, REFRESH_TOKEN];

/** Opens a session: `playset` with no arguments, stdin and stdout both terminals. */
async function session(script: ScriptEntry[], opts: FakeShellIoOptions = {}) {
  const fake = makeFakeShellIo(script, opts);
  const code = await main([], fake.io);
  return { fake, code };
}

const countLines = (text: string, line: string) => nonEmptyLines(text).filter((l) => l.trim() === line).length;

function expectPromptShownAgainAfter(fake: FakeShell, k: number) {
  expect(fake.readLineCalls.length, `a prompt after Line #${k}`).toBeGreaterThan(k + 1);
}

function expectNoRequestsAfter(fake: FakeShell, k: number) {
  expect(requestEvents(fake.eventsAfterLine(k))).toEqual([]);
}

function expectNoSecrets(fake: FakeShell) {
  const all = fake.transcript.map((e) => e.text).join("\n");
  for (const secret of SECRETS) expect(all).not.toContain(secret);
}

/** PRD 0007's --help description of each option, read from `playset --help`. */
async function cliHelpDescriptions(): Promise<Record<string, string>> {
  const cli = makeFakeIo();
  await main(["--help"], cli.io);
  const out: Record<string, string> = {};
  for (const flag of ["--tapes", "--no-tapes", "--yes", "--public", "--dry-run", "--version", "--help"]) {
    const line = cli.stdoutLines().find((l) => new RegExp(`^\\s*${flag}\\s`).test(l));
    if (!line) throw new Error(`no --help line for ${flag}`);
    out[flag] = line.replace(flag, "").trim();
  }
  return out;
}

/** The overrides that make "Xyzzq Nonexistent" unknown on setlist.fm while other names work. */
function unknownXyzzq(err: Error): ServiceOverride {
  return (inner, controls) => ({
    async findLatestSetlistByArtistName(name: string, chooser: unknown) {
      if (name === "Xyzzq Nonexistent") {
        controls.events.push(`setlistfm:findLatest:${name}`);
        throw err;
      }
      return inner.findLatestSetlistByArtistName!(name, chooser);
    },
  });
}

// ---------------------------------------------------------------- starting a session

describe("shell — starting a session", () => {
  it("AC-1: with no arguments and both stdin and stdout terminals, prints the banner, then shows the prompt and waits for a Line", async () => {
    const { fake, code } = await session([CTRL_D]);
    expect(code).toBe(0);
    const banner = nonEmptyLines(fake.beforeFirstPrompt().stdout);
    expect(banner).toEqual([BANNER_1, BANNER_2]);
    expect(fake.beforeFirstPrompt().stderr).toBe("");
    expect(fake.readLineCalls).toHaveLength(1);
    expect(fake.readLineCalls[0]!.prompt).toBe(SHELL_PROMPT);
  });

  it("AC-1: no request, no Spotify login and no browser before the first prompt", async () => {
    const { fake } = await session([CTRL_D], { services: { fullLogin: true } });
    expect(fake.readLineCalls).toHaveLength(1);
    expect(fake.events).toEqual([]);
    expect(fake.calls.getAccessToken).toBe(0);
    expect(fake.openedUrls).toEqual([]);
  });

  it("AC-1: a missing setlist.fm API key or Spotify client id does not stop the banner or the prompt", async () => {
    const { fake, code } = await session([CTRL_D], {
      env: { SETLISTFM_API_KEY: undefined, SPOTIFY_CLIENT_ID: undefined },
    });
    expect(code).toBe(0);
    expect(nonEmptyLines(fake.beforeFirstPrompt().stdout)).toEqual([BANNER_1, BANNER_2]);
    expect(fake.beforeFirstPrompt().stderr).toBe("");
    expect(fake.readLineCalls).toHaveLength(1);
  });

  for (const [label, terminals] of [
    ["stdin is a pipe", { stdinIsTerminal: false, stdoutIsTerminal: true }],
    ["stdout is a file", { stdinIsTerminal: true, stdoutIsTerminal: false }],
    ["neither is a terminal", { stdinIsTerminal: false, stdoutIsTerminal: false }],
  ] as const) {
    it(`AC-2: no arguments when ${label} opens no session: PRD 0007 AC-4's message and usage line, exit 2, no request`, async () => {
      const fake = makeFakeShellIo(["Radiohead"], terminals);
      const code = await main([], fake.io);
      expect(code).toBe(2);
      expect(fake.readLineCalls).toEqual([]);
      expect(fake.stdout()).not.toContain(BANNER_1);
      expect(fake.stderrLines()).toContain(USAGE_LINE);
      expect(fake.stderr()).toMatch(/setlist\.fm link/i);
      expect(fake.stderr()).toMatch(/Artist name/i);
      expect(fake.events).toEqual([]);
    });
  }

  for (const [label, argv] of [
    ["only whitespace", ["   "]],
    ["flags but no input", ["--yes"]],
  ] as const) {
    it(`AC-2: with ${label} in a terminal no session opens: message and usage line, exit 2`, async () => {
      const fake = makeFakeShellIo(["Radiohead"]);
      const code = await main([...argv], fake.io);
      expect(code).toBe(2);
      expect(fake.readLineCalls).toEqual([]);
      expect(fake.stdout()).not.toContain(BANNER_1);
      expect(fake.stderrLines()).toContain(USAGE_LINE);
      expect(fake.events).toEqual([]);
    });
  }

  it("AC-2: with an input in a terminal, one PRD 0007 run is done and its exit code returned; no banner, no prompt", async () => {
    const fake = makeFakeShellIo(["exit"]);
    const code = await main(["Arctic", "Monkeys", "--no-tapes", "--yes"], fake.io);
    expect(code).toBe(0);
    expect(fake.readLineCalls).toEqual([]);
    expect(fake.stdout()).not.toContain(BANNER_1);
    expect(fake.calls.findLatest).toEqual(["Arctic Monkeys"]);
    expect(fake.lastStdoutLine()).toBe(CREATED_SHARE_URL);
  });

  it("AC-2: a failing run given as arguments in a terminal still exits with PRD 0007's code (1), no session", async () => {
    const fake = makeFakeShellIo(["exit"], { services: { setlist: announcedBerlinShow() } });
    const code = await main([E2_URL], fake.io);
    expect(code).toBe(1);
    expect(fake.readLineCalls).toEqual([]);
  });

  it("AC-2: --version in a terminal prints 0.1.0, exit 0, no session", async () => {
    const fake = makeFakeShellIo(["exit"]);
    const code = await main(["--version"], fake.io);
    expect(code).toBe(0);
    expect(fake.stdout().trim()).toBe("0.1.0");
    expect(fake.readLineCalls).toEqual([]);
  });

  it("AC-3: --help prints PRD 0007's help text plus a line saying playset with no arguments opens an interactive session; exit 0", async () => {
    const fake = makeFakeShellIo(["exit"]);
    const code = await main(["--help"], fake.io);
    expect(code).toBe(0);
    expect(fake.readLineCalls).toEqual([]);
    const lines = fake.stdoutLines();
    expect(lines).toContain(USAGE_LINE);
    const sessionLine = lines.find((l) => /no arguments/i.test(l) && /interactive session/i.test(l));
    expect(sessionLine, "help line about the interactive session").toBeDefined();
    for (const flag of ["--tapes", "--no-tapes", "--yes", "--public", "--dry-run", "--version", "--help"]) {
      expect(lines.some((l) => new RegExp(`^\\s*${flag}\\s`).test(l)), flag).toBe(true);
    }
    expect(fake.events).toEqual([]);
  });
});

// ---------------------------------------------------------------- Lines

describe("shell — Lines", () => {
  it("AC-4: an empty Line or a Line of only spaces prints nothing, makes no request and shows the prompt again", async () => {
    const { fake, code } = await session(["", "     ", "exit"]);
    expect(code).toBe(0);
    expect(fake.readLineCalls).toHaveLength(3);
    for (const k of [0, 1]) {
      expect(fake.afterLine(k).output).toBe("");
      expect(fake.afterLine(k).entries).toEqual([]);
      expectNoRequestsAfter(fake, k);
    }
    for (const call of fake.readLineCalls) expect(call.prompt).toBe(SHELL_PROMPT);
  });

  for (const [line, artistName] of [
    ["arctic monkeys --dry-run --no-tapes", "arctic monkeys"],
    ['"Arctic Monkeys" --dry-run --no-tapes', "Arctic Monkeys"],
    ["Guns N' Roses --dry-run --no-tapes", "Guns N' Roses"],
    ["--no-tapes Arctic --dry-run Monkeys", "Arctic Monkeys"],
    ['--dry-run "Guns N\' Roses" --no-tapes', "Guns N' Roses"],
  ] as const) {
    it(`AC-5: the run Line ${JSON.stringify(line)} uses the Artist name ${JSON.stringify(artistName)}`, async () => {
      const { fake, code } = await session([line, "exit"]);
      expect(code).toBe(0);
      expect(fake.calls.findLatest).toEqual([artistName]);
      expect(fake.calls.create).toEqual([]);
      expect(fake.confirmQuestions).toEqual([]);
    });
  }

  it("AC-5: Sinéad O'Connor --public --yes --no-tapes: the apostrophe is ordinary and --public applies", async () => {
    const { fake } = await session(["Sinéad O'Connor --public --yes --no-tapes", "exit"]);
    expect(fake.calls.findLatest).toEqual(["Sinéad O'Connor"]);
    expect(fake.calls.create).toHaveLength(1);
    expect(fake.calls.create[0]!.options.public).toBe(true);
  });

  it("AC-5: a setlist.fm link on a Line fetches the Setlist by id, with no Artist search", async () => {
    const { fake } = await session([`--dry-run ${FIXTURE_A_URL} --no-tapes`, "exit"]);
    expect(fake.calls.getSetlist).toEqual([FIXTURE_A_SETLIST_ID]);
    expect(fake.calls.findLatest).toEqual([]);
  });

  it("AC-5: a run Line goes through the whole PRD 0007 flow (Show, Tape questions, login, progress, preview, confirmation, Misses, share link), then the prompt is shown again", async () => {
    const { fake, code } = await session(["Arctic Monkeys", "exit"], {
      services: { fullLogin: true },
      confirmAnswers: [true, false, true],
    });
    expect(code).toBe(0);
    const out = fake.afterLine(0).stdout;
    const at = (needle: string) => out.indexOf(needle);
    expect(at("Ziggo Dome")).toBeGreaterThanOrEqual(0);
    expect(at(AUTHORIZE_URL)).toBeGreaterThan(at("Ziggo Dome"));
    expect(out).toMatch(/1\/13/);
    expect(at("R U Mine? — Arctic Monkeys · AM")).toBeGreaterThan(at(AUTHORIZE_URL));
    expect(at("Baby, I'm Yours — Arctic Monkeys (Cover of Barbara Lewis)")).toBeGreaterThan(at("R U Mine? — Arctic Monkeys · AM"));
    expect(nonEmptyLines(out).at(-1)).toBe(CREATED_SHARE_URL);
    expect(fake.confirmQuestions).toHaveLength(3);
    expect(fake.calls.create).toHaveLength(1);
    expect(fake.readLineCalls).toHaveLength(2);
    expect(fake.readLineCalls[1]!.prompt).toBe(SHELL_PROMPT);
  });

  it("AC-6: flags on one run Line do not apply to the next (--dry-run --no-tapes --public, then no flags)", async () => {
    const { fake, code } = await session(
      ["Arctic Monkeys --dry-run --no-tapes --public", "Arctic Monkeys", "exit"],
      { confirmAnswers: [true, false, true] },
    );
    expect(code).toBe(0);
    expect(fake.calls.create).toHaveLength(1);
    expect(fake.calls.create[0]!.options.public).toBe(false);
    // second Line: two Tape questions and the confirmation are asked
    expect(fake.confirmQuestions).toHaveLength(3);
    expect(fake.confirmQuestions[2]!.message).toMatch(/create/i);
    expect(fake.calls.findMatch.map((c) => c.performance.title)).toContain("I Want It All");
  });

  it("AC-6: --yes and --public on one Line do not apply to the next: the confirmation is asked and the playlist is private", async () => {
    const { fake } = await session(
      ["Arctic Monkeys --yes --public --no-tapes", "Arctic Monkeys --no-tapes", "exit"],
      { confirmAnswers: [true] },
    );
    expect(fake.calls.create.map((c) => c.options.public)).toEqual([true, false]);
    expect(fake.confirmQuestions).toHaveLength(1);
    expect(fake.confirmQuestions[0]!.message).toMatch(/create/i);
  });

  const usageRows: [string, string, () => Promise<RegExp | string>][] = [
    ["flags with no input", "--dry-run", async () => /setlist\.fm link.*Artist name|Artist name.*setlist\.fm link/i],
    ["an unknown option", "--publik Radiohead", async () => "--publik"],
    ["--tapes with --no-tapes", "--tapes --no-tapes Radiohead", async () => /--tapes.*--no-tapes|--no-tapes.*--tapes/],
    ["a link plus other words", `${FIXTURE_A_URL} Radiohead`, async () => /link/i],
    ["a link that is not a Setlist page", notASetlistPageLink, async () => (await setlistLinkError(notASetlistPageLink)).message],
    ["a link with no setlist id", missingIdLink, async () => (await setlistLinkError(missingIdLink)).message],
    ["an unclosed double quote", '"Arctic Monkeys --yes', async () => "A double quote is not closed."],
  ];

  for (const [label, line, expected] of usageRows) {
    it(`AC-7: ${label} (${JSON.stringify(line)}) prints PRD 0007's message and the shell hint on stderr, no usage line, no question, no request; the session goes on`, async () => {
      const { fake, code } = await session([line, "exit"]);
      expect(code).toBe(0);
      const seg = fake.afterLine(0);
      const message = await expected();
      if (typeof message === "string") expect(seg.stderr).toContain(message);
      else expect(seg.stderr).toMatch(message);
      expect(nonEmptyLines(seg.stderr).at(-1)).toBe(SHELL_HINT);
      expect(seg.output).not.toContain("Usage: playset");
      expect(seg.stdout.trim()).toBe("");
      expect(fake.selectQuestions).toEqual([]);
      expect(fake.confirmQuestions).toEqual([]);
      expect(fake.events).toEqual([]);
      expectPromptShownAgainAfter(fake, 0);
    });
  }

  it("AC-8: --help on a run Line prints the session help and runs nothing, whatever else is on the Line", async () => {
    const { fake, code } = await session(["help", "Radiohead --help", "Radiohead --help --version", "exit"]);
    expect(code).toBe(0);
    const sessionHelp = fake.afterLine(0).stdout;
    expect(sessionHelp.trim()).not.toBe("");
    expect(fake.afterLine(1).stdout).toBe(sessionHelp);
    expect(fake.afterLine(2).stdout).toBe(sessionHelp);
    expect(fake.events).toEqual([]);
    expect(fake.readLineCalls).toHaveLength(4);
  });

  it("AC-8: --version on a run Line (without --help) prints only 0.1.0 and runs nothing", async () => {
    const { fake, code } = await session(["--version", "Radiohead --version --dry-run", "exit"]);
    expect(code).toBe(0);
    for (const k of [0, 1]) {
      expect(fake.afterLine(k).stdout.trim()).toBe("0.1.0");
      expect(fake.afterLine(k).stderr).toBe("");
    }
    expect(fake.events).toEqual([]);
    expect(fake.readLineCalls).toHaveLength(3);
  });
});

// ---------------------------------------------------------------- built-in commands

describe("shell — built-in commands", () => {
  it("AC-9: help explains the Line (setlist.fm link or Artist name for the Latest Setlist) and that options apply to that Line only", async () => {
    const { fake } = await session(["help", "exit"]);
    const help = fake.afterLine(0).stdout;
    expect(help).toMatch(/setlist\.fm/i);
    expect(help).toMatch(/Artist name/i);
    expect(help).toMatch(/Latest Setlist/i);
    expect(help).toMatch(/(that|this|one) line only|only (to )?(that|this|the) line/i);
    expect(fake.events).toEqual([]);
    expectPromptShownAgainAfter(fake, 0);
  });

  it("AC-9: help lists every option with the same one-line description as `playset --help`", async () => {
    const descriptions = await cliHelpDescriptions();
    const { fake } = await session(["help", "exit"]);
    const lines = nonEmptyLines(fake.afterLine(0).stdout);
    for (const [flag, description] of Object.entries(descriptions)) {
      const line = lines.find((l) => new RegExp(`^\\s*${flag}\\s`).test(l));
      expect(line, `session help line for ${flag}`).toBeDefined();
      expect(line).toContain(description);
    }
  });

  it("AC-9: help lists the commands help, clear and exit / quit, each with a description, and how to look up an Artist named like a command", async () => {
    const { fake } = await session(["help", "exit"]);
    const lines = nonEmptyLines(fake.afterLine(0).stdout);
    for (const words of [["help"], ["clear"], ["exit", "quit"]]) {
      const line = lines.find((l) => words.every((w) => new RegExp(`(^|[\\s,/])${w}([\\s,/]|$)`).test(l)) && !/^\s*--/.test(l));
      expect(line, `command line for ${words.join("/")}`).toBeDefined();
      const description = line!.replace(/\b(help|clear|exit|quit)\b/g, "").replace(/[,/]/g, "").trim();
      expect(description.length, `description for ${words.join("/")}`).toBeGreaterThan(5);
    }
    const quoting = lines.find((l) => /double quote|quotes/i.test(l));
    expect(quoting, "a line about quoting an Artist named like a command").toBeDefined();
  });

  for (const line of ["exit", "quit", "Quit", "  EXIT  ", "qUiT"]) {
    it(`AC-10: ${JSON.stringify(line)} ends the session with exit code 0 and runs nothing else`, async () => {
      const { fake, code } = await session([line, "Arctic Monkeys --dry-run --no-tapes"]);
      expect(code).toBe(0);
      expect(fake.readLineCalls).toHaveLength(1);
      expect(fake.events).toEqual([]);
      expect(fake.afterLine(0).stderr).toBe("");
    });
  }

  it("AC-11: clear clears the terminal screen, makes no request, and shows the prompt again", async () => {
    const { fake, code } = await session(["clear", "exit"]);
    expect(code).toBe(0);
    expect(fake.clearScreenCalls).toEqual([1]);
    expect(requestEvents(fake.events)).toEqual([]);
    expect(fake.readLineCalls).toHaveLength(2);
    expect(fake.readLineCalls[1]!.prompt).toBe(SHELL_PROMPT);
    expect(fake.afterLine(0).stderr).toBe("");
  });

  it("AC-11: clear keeps the session's history (S6)", async () => {
    const { fake } = await session(["Arctic Monkeys --dry-run --no-tapes", "clear", "exit"]);
    expect(fake.clearScreenCalls).toEqual([2]);
    expect(fake.readLineCalls[2]!.history.map((h) => h.trim())).toEqual(["clear", "Arctic Monkeys --dry-run --no-tapes"]);
  });

  it("AC-11: the screen is not cleared for any other Line", async () => {
    const { fake } = await session(["help", "clear --dry-run --no-tapes", '"clear" --dry-run --no-tapes', "exit"]);
    expect(fake.readLineCalls).toHaveLength(4);
    expect(fake.calls.findLatest).toEqual(["clear", "clear"]);
    expect(fake.clearScreenCalls).toEqual([]);
  });

  for (const line of ["help", "  HELP  ", "Help", "hElP"]) {
    it(`AC-12: ${JSON.stringify(line)} is the built-in help (no request)`, async () => {
      const { fake } = await session([line, "exit"]);
      expect(fake.afterLine(0).stdout).toMatch(/--dry-run/);
      expect(fake.events).toEqual([]);
    });
  }

  for (const [line, artistName] of [
    ['"help" --dry-run --no-tapes', "help"],
    ["help --dry-run", "help"],
    ['"Exit" --dry-run --no-tapes', "Exit"],
    ["exit now --dry-run --no-tapes", "exit now"],
    ["Help --dry-run --no-tapes", "Help"],
    ["clear --no-tapes --dry-run", "clear"],
    ['"quit" --dry-run --no-tapes', "quit"],
  ] as const) {
    it(`AC-12: ${JSON.stringify(line)} is a run Line for the Artist name ${JSON.stringify(artistName)}`, async () => {
      const { fake, code } = await session([line, "exit"], { confirmAnswers: [false, false] });
      expect(code).toBe(0);
      expect(fake.calls.findLatest).toEqual([artistName]);
      expect(fake.readLineCalls).toHaveLength(2);
    });
  }

  it("AC-12: a bare quoted \"help\" asks the Tape questions and the confirmation like any run Line", async () => {
    const { fake } = await session(['"help"', "exit"], { confirmAnswers: [false, false, false] });
    expect(fake.calls.findLatest).toEqual(["help"]);
    expect(fake.confirmQuestions).toHaveLength(3);
    expect(fake.calls.create).toEqual([]);
  });
});

// ---------------------------------------------------------------- results of a run

type ErrorRow = [label: string, line: string, make: () => Promise<Error>, options: (err: Error) => FakeShellIoOptions];

const errorRows: ErrorRow[] = [
  ["Artist not found", "Xyzzq Nonexistent", artistNotFoundError, (err) => ({ overrideServices: unknownXyzzq(err) })],
  [
    "Setlist not found by id",
    "https://www.setlist.fm/setlist/x/2025/y-deadbeef.html",
    setlistNotFoundError,
    (err) => ({ services: { fail: { getSetlist: err } } }),
  ],
  ["setlist.fm rate limit", "Arctic Monkeys", setlistFmRateLimitError, (err) => ({ services: { fail: { findLatestSetlistByArtistName: err } } })],
  ["missing setlist.fm API key", "Arctic Monkeys", missingSetlistFmApiKeyError, (err) => ({ services: { fail: { findLatestSetlistByArtistName: err } } })],
  ["missing Spotify client id", "Arctic Monkeys --no-tapes", missingClientIdError, (err) => ({ services: { fail: { getAccessToken: err } } })],
  ["Spotify search failure", "Arctic Monkeys --yes --no-tapes", spotifySearchError, (err) => ({ services: { failMatchOn: { Brianstorm: err } } })],
];

describe("shell — errors from a run", () => {
  for (const [label, line, make, options] of errorRows) {
    it(`AC-13: ${label} prints PRD 0007's message and hint lines on stderr, no stack trace, then the prompt again; exit 0 at the end`, async () => {
      const err = await make();
      const { fake, code } = await session([line, "exit"], options(err));
      expect(code).toBe(0);
      const seg = fake.afterLine(0);
      expect(seg.stderr).toContain(err.message);
      const hint = (err as { hint?: unknown }).hint;
      if (typeof hint === "string") {
        for (const h of hint.split("\n").map((l) => l.trim()).filter((l) => l !== "")) expect(seg.stderr).toContain(h);
      }
      expect(seg.output).not.toMatch(STACK_FRAME);
      expect(seg.output).not.toContain(SHELL_HINT);
      expect(fake.calls.create).toEqual([]);
      expect(fake.readLineCalls).toHaveLength(2);
      expectNoSecrets(fake);
    });
  }

  it("AC-13: a Spotify search failure stops the run after #4 and sends no create request (S7)", async () => {
    const err = await spotifySearchError();
    const { fake } = await session(["Arctic Monkeys --yes", "exit"], {
      confirmAnswers: [true, false],
      services: { failMatchOn: { "Don't Sit Down 'Cause I've Moved Your Chair": err } },
    });
    expect(fake.afterLine(0).stdout).toMatch(/4\/13/);
    expect(fake.calls.findMatch).toHaveLength(4);
    expect(fake.calls.create).toEqual([]);
    expectPromptShownAgainAfter(fake, 0);
  });

  it("AC-13: every kept Performance a Miss lists the Misses and says no playlist was created, then the prompt again", async () => {
    const { fake, code } = await session(["Muse", "exit"], { services: { setlist: museRomeSetlist() } });
    expect(code).toBe(0);
    const seg = fake.afterLine(0);
    expect(seg.stdout).toContain("Untitled New Song");
    expect(seg.stderr).toMatch(/no Match/i);
    expect(seg.stderr).toMatch(/no playlist/i);
    expectPromptShownAgainAfter(fake, 0);
  });

  it("AC-13: nothing to add (Tape-only Setlist with --no-tapes) prints the message, then the prompt again; exit 0", async () => {
    const { fake, code } = await session([`${FIXTURE_A_URL} --no-tapes`, CTRL_D], { services: { setlist: onlyTapeSetlist() } });
    expect(code).toBe(0);
    expect(fake.afterLine(0).stderr).toMatch(/nothing to add/i);
    expect(requestEvents(fake.events).filter((e) => e.startsWith("spotify:"))).toEqual([]);
    expectPromptShownAgainAfter(fake, 0);
  });

  it("AC-13: a Setlist with no Performances prints the message, then the prompt again", async () => {
    const { fake, code } = await session([E2_URL, "exit"], { services: { setlist: announcedBerlinShow() } });
    expect(code).toBe(0);
    expect(fake.afterLine(0).stderr).toMatch(/no Performances/i);
    expectPromptShownAgainAfter(fake, 0);
  });

  it("AC-13: a too-long description prints PRD 0006's message, then the prompt again", async () => {
    const { fake, code } = await session([FIXTURE_A_URL, "exit"], { services: { setlist: tooLongDescriptionSetlist() } });
    expect(code).toBe(0);
    expect(fake.afterLine(0).stderr).toMatch(/301/);
    expectPromptShownAgainAfter(fake, 0);
  });

  it("AC-13: a partly created playlist prints the partly-created message and the share link, then the prompt again", async () => {
    const partly = await partlyCreatedPlaylistError();
    const { fake, code } = await session([`${FIXTURE_A_URL} --tapes --yes`, "exit"], {
      services: { fail: { createSetlistPlaylist: partly } },
    });
    expect(code).toBe(0);
    const seg = fake.afterLine(0);
    expect(seg.stderr).toMatch(/partly/i);
    expect(seg.stderr).toMatch(/\b100\b/);
    expect(seg.stderr).toMatch(/\b250\b/);
    expect(nonEmptyLines(seg.stdout).at(-1)).toBe(PARTLY_CREATED_SHARE_URL);
    expect(seg.output).not.toMatch(STACK_FRAME);
    expectPromptShownAgainAfter(fake, 0);
  });

  it("AC-13: an unexpected error prints 'something went wrong' with its message and the PLAYSET_DEBUG=1 hint, no stack trace; prompt again", async () => {
    const err = new TypeError("Cannot read properties of undefined (reading 'items')");
    const { fake, code } = await session(["Arctic Monkeys --yes --no-tapes", "exit"], {
      services: { fail: { findPlaylistsNamed: err } },
    });
    expect(code).toBe(0);
    const seg = fake.afterLine(0);
    const wrong = nonEmptyLines(seg.stderr).find((l) => /something went wrong/i.test(l));
    expect(wrong).toContain("Cannot read properties of undefined (reading 'items')");
    expect(seg.stderr).toContain("PLAYSET_DEBUG=1");
    expect(seg.output).not.toMatch(STACK_FRAME);
    expect(seg.output).not.toContain("TypeError");
    expectPromptShownAgainAfter(fake, 0);
  });

  it("AC-13: with PLAYSET_DEBUG=1 the error's details and stack trace follow on stderr, without any secret; prompt again", async () => {
    const err = new TypeError("Cannot read properties of undefined (reading 'items')");
    const { fake, code } = await session(["Arctic Monkeys --yes --no-tapes", "exit"], {
      services: { fail: { findPlaylistsNamed: err } },
      env: { PLAYSET_DEBUG: "1" },
    });
    expect(code).toBe(0);
    const seg = fake.afterLine(0);
    expect(seg.stderr).toMatch(/something went wrong/i);
    expect(seg.stderr).toMatch(STACK_FRAME);
    expect(seg.stdout).not.toMatch(STACK_FRAME);
    expectNoSecrets(fake);
    expectPromptShownAgainAfter(fake, 0);
  });
});

describe("shell — normal outcomes of a run", () => {
  it("AC-14: a created playlist ends its output with the share link, then the prompt again", async () => {
    const { fake, code } = await session(["Arctic Monkeys --yes --no-tapes", "exit"]);
    expect(code).toBe(0);
    const out = fake.afterLine(0).stdout;
    expect(out).toContain(FIXTURE_A_PLAYLIST_NAME);
    expect(nonEmptyLines(out).at(-1)).toBe(CREATED_SHARE_URL);
    expect(fake.readLineCalls).toHaveLength(2);
  });

  it("AC-14: a dry run ends with its dry-run line, then the prompt again", async () => {
    const { fake } = await session(["Arctic Monkeys --dry-run --no-tapes", "exit"]);
    const last = nonEmptyLines(fake.afterLine(0).stdout).at(-1);
    expect(last).toMatch(/dry run/i);
    expect(last).toMatch(/no playlist/i);
    expect(fake.calls.create).toEqual([]);
    expect(fake.readLineCalls).toHaveLength(2);
  });

  it("AC-14: a declined confirmation says no playlist was created, then the prompt again; Ctrl-D ends with exit 0 (S8)", async () => {
    const { fake, code } = await session(["Arctic Monkeys", CTRL_D], { confirmAnswers: [true, false, false] });
    expect(code).toBe(0);
    expect(fake.afterLine(0).output).toMatch(/no playlist (was )?created/i);
    expect(fake.calls.create).toEqual([]);
    expect(fake.readLineCalls).toHaveLength(2);
  });

  it("AC-14: the session's exit code is 0 whatever its runs did (usage error, failed run, created playlist)", async () => {
    const notFound = await artistNotFoundError();
    const { code, fake } = await session(
      ["--tapes --no-tapes Radiohead", "Xyzzq Nonexistent", "Arctic Monkeys --yes --no-tapes", "exit"],
      { overrideServices: unknownXyzzq(notFound) },
    );
    expect(code).toBe(0);
    expect(fake.readLineCalls).toHaveLength(4);
    expect(fake.calls.create).toHaveLength(1);
  });
});

// ---------------------------------------------------------------- Ctrl-C during a run

function expectCancelledRun(fake: FakeShell, k: number) {
  const seg = fake.afterLine(k);
  expect(countLines(seg.output, "Cancelled.")).toBe(1);
  expect(seg.output).not.toMatch(STACK_FRAME);
  expect(seg.output).not.toContain("ExitPromptError");
  expect(seg.output).not.toContain(LEAVE_HINT);
  expect(fake.calls.create).toEqual([]);
  expectPromptShownAgainAfter(fake, k);
}

describe("shell — Ctrl-C during a run", () => {
  it("AC-15: Ctrl-C at the Artist question cancels the run with 'Cancelled.', no setlists request, prompt again", async () => {
    const { fake, code } = await session(["arctic monkey", "exit"], {
      services: { candidates: ARCTIC_MONKEYS_CANDIDATES },
      selectAnswers: ["cancel"],
    });
    expect(code).toBe(0);
    expectCancelledRun(fake, 0);
    expect(fake.events.some((e) => e.startsWith("setlistfm:setlists:"))).toBe(false);
  });

  it("AC-15: Ctrl-C at the second Tape question cancels the run, no Spotify request, prompt again", async () => {
    const { fake, code } = await session(["Arctic Monkeys", "exit"], { confirmAnswers: [true, "cancel"] });
    expect(code).toBe(0);
    expectCancelledRun(fake, 0);
    expect(fake.events.filter((e) => e.startsWith("spotify:"))).toEqual([]);
  });

  it("AC-15: Ctrl-C at the confirmation cancels the run, nothing created, prompt again", async () => {
    const { fake, code } = await session(["Arctic Monkeys --no-tapes", "exit"], { confirmAnswers: ["cancel"] });
    expect(code).toBe(0);
    expectCancelledRun(fake, 0);
  });

  it("AC-15: Ctrl-C while waiting for the Spotify login cancels the run, no search, prompt again; the session goes on", async () => {
    const fake = makeFakeShellIo(["Arctic Monkeys --no-tapes", "Arctic Monkeys --dry-run --no-tapes", "exit"], {
      services: { loginNeverFinishes: true },
      overrideServices: (inner) => {
        let calls = 0;
        return {
          getAccessToken(hooks: unknown) {
            calls++;
            return calls === 1 ? inner.getAccessToken!(hooks) : Promise.resolve(TOKEN);
          },
        };
      },
    });
    const running = main([], fake.io);
    await vi.waitFor(() => expect(fake.openedUrls).toHaveLength(1));
    expect(fake.hasInterruptHandler()).toBe(true);
    fake.interrupt();
    const code = await running;
    expect(code).toBe(0);
    expectCancelledRun(fake, 0);
    expect(fake.eventsAfterLine(0).filter((e) => e.startsWith("spotify:findMatch"))).toEqual([]);
    // the next Line runs normally
    expect(fake.eventsAfterLine(1).some((e) => e.startsWith("spotify:findMatch"))).toBe(true);
    expect(fake.readLineCalls).toHaveLength(3);
  });

  it("AC-16: Ctrl-C while finding Matches cancels the run: no new search after the one in progress, no duplicate check, no create", async () => {
    let started = 0;
    let startedAtCtrlC = -1;
    const { fake, code } = await session(["Arctic Monkeys --yes --no-tapes", "exit"], {
      overrideServices: (inner, controls) => ({
        async findMatch(performance: unknown, token: string) {
          started++;
          if (started === 4) {
            startedAtCtrlC = started;
            controls.interrupt();
          }
          return inner.findMatch!(performance, token);
        },
      }),
    });
    expect(code).toBe(0);
    expect(startedAtCtrlC).toBe(4);
    expect(started).toBe(startedAtCtrlC);
    expect(fake.calls.findPlaylistsNamed).toEqual([]);
    expectCancelledRun(fake, 0);
  });

  it("AC-16: Ctrl-C during the duplicate check (--yes) cancels the run: no create request", async () => {
    const { fake, code } = await session(["Arctic Monkeys --yes --no-tapes", "exit"], {
      overrideServices: (inner, controls) => ({
        async findPlaylistsNamed(name: string, token: string) {
          controls.interrupt();
          return inner.findPlaylistsNamed!(name, token);
        },
      }),
    });
    expect(code).toBe(0);
    expectCancelledRun(fake, 0);
  });

  it("AC-17: Ctrl-C after the create request was sent does not stop the run: it prints the created line, the Miss and the share link, then the prompt", async () => {
    let interrupted = false;
    const { fake, code } = await session(["Arctic Monkeys --yes", "exit"], {
      confirmAnswers: [true, false],
      overrideServices: (inner, controls) => ({
        async createSetlistPlaylist(...args: unknown[]) {
          const result = inner.createSetlistPlaylist!(...args);
          if (controls.hasInterruptHandler()) {
            controls.interrupt();
            interrupted = true;
          }
          return result;
        },
      }),
    });
    expect(code).toBe(0);
    expect(fake.calls.create).toHaveLength(1);
    const seg = fake.afterLine(0);
    expect(seg.output).not.toContain("Cancelled.");
    expect(seg.stdout).toMatch(/created/i);
    expect(seg.stdout).toContain("Baby, I'm Yours — Arctic Monkeys (Cover of Barbara Lewis)");
    expect(nonEmptyLines(seg.stdout).at(-1)).toBe(CREATED_SHARE_URL);
    expectPromptShownAgainAfter(fake, 0);
    if (interrupted) expect(fake.hasInterruptHandler()).toBe(false);
  });
});

// ---------------------------------------------------------------- Ctrl-C and Ctrl-D at the prompt

describe("shell — Ctrl-C and Ctrl-D at the prompt", () => {
  it("AC-18: Ctrl-C on an empty prompt prints the leave hint and shows the prompt again; a second Ctrl-C ends the session with exit 0", async () => {
    const { fake, code } = await session([CTRL_C, CTRL_C, "Arctic Monkeys --dry-run --no-tapes"]);
    expect(code).toBe(0);
    expect(fake.readLineCalls).toHaveLength(2);
    expect(countLines(fake.afterLine(0).output, LEAVE_HINT)).toBe(1);
    expect(fake.afterLine(1).output).not.toContain(LEAVE_HINT);
    expect(fake.events).toEqual([]);
  });

  it("AC-18: Ctrl-C with text typed discards it and does not count; a Line in between resets the count (S10)", async () => {
    const { fake, code } = await session(
      [ctrlCWhileTyping("Arctic Mon"), CTRL_C, "Arctic Monkeys --dry-run --no-tapes", CTRL_C, CTRL_D],
    );
    expect(code).toBe(0);
    expect(fake.readLineCalls).toHaveLength(5);
    expect(fake.afterLine(0).output).toBe("");
    expect(countLines(fake.afterLine(1).output, LEAVE_HINT)).toBe(1);
    expect(countLines(fake.afterLine(3).output, LEAVE_HINT)).toBe(1);
    expect(fake.calls.findLatest).toEqual(["Arctic Monkeys"]);
    for (const call of fake.readLineCalls) expect(call.history).not.toContain("Arctic Mon");
  });

  it("AC-18: a Ctrl-C that cancelled a run does not count toward the two (S10)", async () => {
    const { fake, code } = await session(["Arctic Monkeys", CTRL_C, "exit"], { confirmAnswers: ["cancel"] });
    expect(code).toBe(0);
    expect(countLines(fake.afterLine(0).output, "Cancelled.")).toBe(1);
    expect(countLines(fake.afterLine(1).output, LEAVE_HINT)).toBe(1);
    expect(fake.readLineCalls).toHaveLength(3);
  });

  it("AC-18: a Ctrl-C during a run (not at a question) does not count either", async () => {
    const fake = makeFakeShellIo(["Arctic Monkeys --no-tapes", CTRL_C, "exit"], { services: { loginNeverFinishes: true } });
    const running = main([], fake.io);
    await vi.waitFor(() => expect(fake.openedUrls).toHaveLength(1));
    fake.interrupt();
    const code = await running;
    expect(code).toBe(0);
    expect(countLines(fake.afterLine(1).output, LEAVE_HINT)).toBe(1);
    expect(fake.readLineCalls).toHaveLength(3);
  });

  it("AC-19: Ctrl-D on an empty prompt ends the session with exit 0", async () => {
    const { fake, code } = await session([CTRL_D, "Arctic Monkeys --dry-run --no-tapes"]);
    expect(code).toBe(0);
    expect(fake.readLineCalls).toHaveLength(1);
    expect(fake.events).toEqual([]);
  });

  it("AC-19: when standard input ends after a Line, the run is done and the session ends with exit 0 (S10)", async () => {
    const { fake, code } = await session(["Radiohead --dry-run --no-tapes"]);
    expect(code).toBe(0);
    expect(fake.calls.findLatest).toEqual(["Radiohead"]);
    expect(fake.readLineCalls).toHaveLength(2);
    expect(fake.readLineCalls[1]!.event).toEqual(CTRL_D);
  });
});

// ---------------------------------------------------------------- sharing across runs

/** A token getter that does a full login the first time and then answers from the cached token. */
function loginOnce(): ServiceOverride {
  let loggedIn = false;
  return (inner) => ({
    async getAccessToken(hooks: { openAuthorizeUrl(url: string): Promise<void> | void }) {
      if (!loggedIn) {
        await hooks.openAuthorizeUrl(AUTHORIZE_URL);
        loggedIn = true;
      }
      return inner.getAccessToken!(hooks);
    },
  });
}

describe("shell — sharing across runs", () => {
  it("AC-20: after a login in one run, a later run gets its token without a browser or an authorize URL; runs that end before the login make no Spotify request (S1)", async () => {
    const notFoundErr = await artistNotFoundError();
    const login = loginOnce();
    const { fake, code } = await session(
      ["Arctic Monkeys --dry-run --no-tapes", "--tapes --no-tapes Radiohead", "Xyzzq Nonexistent", "Arctic Monkeys --yes", "exit"],
      {
        confirmAnswers: [true, false],
        overrideServices: (inner, controls) => ({ ...unknownXyzzq(notFoundErr)(inner, controls), ...login(inner, controls) }),
      },
    );
    expect(code).toBe(0);
    expect(fake.openedUrls).toEqual([AUTHORIZE_URL]);
    expect(fake.stdout().split(AUTHORIZE_URL)).toHaveLength(2);
    expect(fake.afterLine(0).stdout).toContain(AUTHORIZE_URL);
    expect(fake.afterLine(3).output).not.toContain("accounts.spotify.com");
    expect(fake.eventsAfterLine(0)).toContain("spotify:getAccessToken");
    expect(fake.eventsAfterLine(1).filter((e) => e.startsWith("spotify:"))).toEqual([]);
    expect(fake.eventsAfterLine(2).filter((e) => e.startsWith("spotify:"))).toEqual([]);
    expect(fake.eventsAfterLine(3)).toContain("spotify:getAccessToken");
    expect(fake.calls.getAccessToken).toBe(2);
    expect(fake.calls.create).toHaveLength(1);
    expect(fake.calls.create[0]!.options.public).toBe(false);
  });

  it("AC-21: after a login cancelled with Ctrl-C, the next run's full login starts normally: authorize URL printed again, no port-in-use error", async () => {
    const fake = makeFakeShellIo(["Arctic Monkeys --no-tapes --dry-run", "Arctic Monkeys --no-tapes --dry-run", "exit"], {
      overrideServices: (inner) => {
        let calls = 0;
        return {
          async getAccessToken(hooks: { openAuthorizeUrl(url: string): Promise<void> | void }) {
            calls++;
            await hooks.openAuthorizeUrl(AUTHORIZE_URL);
            if (calls === 1) return new Promise<string>(() => {});
            return inner.getAccessToken!(hooks);
          },
        };
      },
    });
    const running = main([], fake.io);
    await vi.waitFor(() => expect(fake.openedUrls).toHaveLength(1));
    fake.interrupt();
    const code = await running;
    expect(code).toBe(0);
    expect(countLines(fake.afterLine(0).output, "Cancelled.")).toBe(1);
    const second = fake.afterLine(1);
    expect(second.stdout).toContain(AUTHORIZE_URL);
    expect(second.output).not.toMatch(/already in use/i);
    expect(second.output).not.toContain("Cancelled.");
    expect(fake.openedUrls).toEqual([AUTHORIZE_URL, AUTHORIZE_URL]);
    expect(fake.eventsAfterLine(1).some((e) => e.startsWith("spotify:findMatch"))).toBe(true);
    expect(fake.hasInterruptHandler()).toBe(false);
  });

  it("AC-22: setlist.fm requests of different runs in one session are spaced at least 500 ms apart; only the first is not delayed (S1)", async () => {
    const sfm = makeFakes([
      ok(loadFixture("search-arctic-monkeys.json")),
      ok(setlistsPage(1, 1, [loadFixtureA()])),
      notFound,
      ok(loadFixture("search-arctic-monkeys.json")),
      ok(setlistsPage(1, 1, [loadFixtureA()])),
    ]);
    const client = makeClient(sfm);
    const { fake, code } = await session(
      [
        "Arctic Monkeys --dry-run --no-tapes",
        "Xyzzq Nonexistent",
        () => {
          sfm.advance(200);
          return "Arctic Monkeys --dry-run --no-tapes";
        },
        "exit",
      ],
      {
        overrideServices: () => ({
          getSetlist: (id: string) => client.getSetlist(id),
          findLatestSetlistByArtistName: (name: string, chooser: Parameters<typeof client.findLatestSetlistByArtistName>[1]) =>
            client.findLatestSetlistByArtistName(name, chooser),
        }),
      },
    );
    expect(code).toBe(0);
    const times = sfm.requests.map((r) => r.at);
    expect(times).toHaveLength(5);
    expect(times[0]).toBe(T0);
    for (let i = 1; i < times.length; i++) expect(times[i]! - times[i - 1]!, `request #${i + 1}`).toBeGreaterThanOrEqual(500);
    expect(sfm.requests[2]!.parsed.searchParams.get("artistName")).toBe("Xyzzq Nonexistent");
    expect(fake.afterLine(1).stderr).toContain("Xyzzq Nonexistent");
    expect(fake.afterLine(2).stdout).toContain("Ziggo Dome");
  });

  describe("AC-23 — a setting added during the session", () => {
    let root: string | undefined;
    afterEach(async () => {
      if (root) await removeTempRoot(root);
      root = undefined;
    });

    it("AC-23: after a run fails for a missing setlist.fm API key, a later run reads the setting again and continues without a restart (S12)", async () => {
      root = await makeTempRoot();
      const configDir = join(root, "playset");
      const sfm = makeFakes([ok(loadFixture("search-arctic-monkeys.json")), ok(setlistsPage(1, 1, [loadFixtureA()]))]);
      const client = makeClient(sfm, { env: {}, configDir });
      const { fake, code } = await session(
        [
          "Arctic Monkeys --dry-run --no-tapes",
          async () => {
            await writeConfigFile(configDir, JSON.stringify({ setlistfmApiKey: API_KEY }));
            return "Arctic Monkeys --dry-run --no-tapes";
          },
          "exit",
        ],
        {
          env: { SETLISTFM_API_KEY: undefined },
          overrideServices: () => ({
            getSetlist: (id: string) => client.getSetlist(id),
            findLatestSetlistByArtistName: (name: string, chooser: Parameters<typeof client.findLatestSetlistByArtistName>[1]) =>
              client.findLatestSetlistByArtistName(name, chooser),
          }),
        },
      );
      expect(code).toBe(0);
      expect(fake.afterLine(0).stderr).toMatch(/setlist\.fm API key/i);
      expect(fake.afterLine(0).stderr).toContain("SETLISTFM_API_KEY");
      expect(sfm.requests).toHaveLength(2);
      expect(sfm.requests[0]!.headers.get("x-api-key")).toBe(API_KEY);
      expect(fake.afterLine(1).stdout).toContain("Ziggo Dome");
      expect(fake.readLineCalls).toHaveLength(3);
    });
  });
});

// ---------------------------------------------------------------- history

describe("shell — history", () => {
  it("AC-24: the up arrow walks back through earlier non-empty Lines (run Lines and built-ins), newest first; question answers are not in it (S13)", async () => {
    const { fake } = await session(
      ["Arctic Monkeys --dry-run", "", "help", "   ", "Arctic Monkeys", CTRL_D],
      { confirmAnswers: [false, false, true, false, false] },
    );
    const history = (k: number) => fake.readLineCalls[k]!.history.map((h) => h.trim());
    expect(history(0)).toEqual([]);
    expect(history(1)).toEqual(["Arctic Monkeys --dry-run"]);
    expect(history(3)).toEqual(["help", "Arctic Monkeys --dry-run"]);
    expect(history(5)).toEqual(["Arctic Monkeys", "help", "Arctic Monkeys --dry-run"]);
    for (const answer of ["y", "n", "Y", "N", "yes", "no", ""]) expect(fake.readLineCalls[5]!.history).not.toContain(answer);
  });

  it("AC-24: Lines that ended in a usage error or Ctrl-C at a question are in the history too; text discarded with Ctrl-C at the prompt is not", async () => {
    const { fake } = await session(
      ["--publik Radiohead", "Arctic Monkeys", ctrlCWhileTyping("Radio"), CTRL_D],
      { confirmAnswers: ["cancel"] },
    );
    expect(fake.readLineCalls[3]!.history.map((h) => h.trim())).toEqual(["Arctic Monkeys", "--publik Radiohead"]);
  });

  it("AC-24: a new session starts with an empty history", async () => {
    await session(["Arctic Monkeys --dry-run --no-tapes", "help", "exit"]);
    const { fake } = await session(["exit"]);
    expect(fake.readLineCalls[0]!.history).toEqual([]);
  });
});

// ---------------------------------------------------------------- testing without a terminal

/** S14: S1's session carried out with fakes. */
async function s14Session() {
  const notFoundErr = await artistNotFoundError();
  const login = loginOnce();
  const script = [
    "Arctic Monkeys --dry-run --no-tapes",
    "--tapes --no-tapes Radiohead",
    "Xyzzq Nonexistent",
    "Arctic Monkeys --yes",
    "help",
    "exit",
  ];
  return makeFakeShellIo(script, {
    confirmAnswers: [true, false],
    overrideServices: (inner, controls) => ({ ...unknownXyzzq(notFoundErr)(inner, controls), ...login(inner, controls) }),
  });
}

function expectS14Transcript(fake: FakeShell, code: number) {
  expect(code).toBe(0);
  // banner, then one prompt per Line
  expect(nonEmptyLines(fake.beforeFirstPrompt().stdout)).toEqual([BANNER_1, BANNER_2]);
  expect(fake.readLineCalls.map((c) => c.prompt)).toEqual(Array(6).fill(SHELL_PROMPT));
  // dry run
  const dry = fake.afterLine(0);
  expect(dry.stdout).toContain("Ziggo Dome");
  expect(dry.stdout).toContain(AUTHORIZE_URL);
  expect(nonEmptyLines(dry.stdout).at(-1)).toMatch(/dry run/i);
  // usage error and shell hint
  expect(fake.afterLine(1).stderr).toMatch(/--tapes/);
  expect(nonEmptyLines(fake.afterLine(1).stderr).at(-1)).toBe(SHELL_HINT);
  // Artist not found
  expect(fake.afterLine(2).stderr).toContain("Xyzzq Nonexistent");
  // created, ending with the share link
  const created = fake.afterLine(3);
  expect(created.stdout).toContain("Ziggo Dome");
  expect(created.stdout).not.toContain(AUTHORIZE_URL);
  expect(nonEmptyLines(created.stdout).at(-1)).toBe(CREATED_SHARE_URL);
  // help
  expect(fake.afterLine(4).stdout).toMatch(/--dry-run/);
  expect(fake.afterLine(4).stdout).toMatch(/\bquit\b/);
  // the order in the captured output follows the Lines
  const all = fake.transcript.map((e) => e.text).join("");
  const order = [BANNER_1, "Ziggo Dome", SHELL_HINT, "Xyzzq Nonexistent", CREATED_SHARE_URL, "--dry-run"];
  let from = 0;
  for (const needle of order) {
    const at = all.indexOf(needle, from);
    expect(at, needle).toBeGreaterThanOrEqual(from);
    from = at + needle.length;
  }
  // the token getter is used by the first and fourth Lines only
  expect(fake.calls.getAccessToken).toBe(2);
  expect(fake.eventsAfterLine(0)).toContain("spotify:getAccessToken");
  expect(fake.eventsAfterLine(3)).toContain("spotify:getAccessToken");
}

describe("shell — testing without a terminal", () => {
  it("AC-25: S14's scripted session through main([]) completes with fakes; the captured output shows banner, prompts and each run's output in order; exit 0", async () => {
    const fake = await s14Session();
    const code = await main([], fake.io);
    expectS14Transcript(fake, code);
  });

  it("AC-25: a scripted Line followed by the end of input runs the dry run and reports exit 0 (S10)", async () => {
    const { fake, code } = await session(["Radiohead --dry-run --no-tapes"]);
    expect(code).toBe(0);
    expect(fake.calls.findLatest).toEqual(["Radiohead"]);
    expect(fake.afterLine(0).stdout).toMatch(/dry run/i);
  });
});
