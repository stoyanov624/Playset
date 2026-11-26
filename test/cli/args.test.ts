// PRD 0007 — the `playset` command line: input, flags, usage errors, help and version.
// main(argv, io) is driven with a fake terminal (test/cli/fixtures/fake-io.ts) and fake services.
import { describe, expect, it } from "vitest";
import { main } from "../../src/cli/main.js";
import { makeFakeIo } from "./fixtures/fake-io";
import { ARCTIC_MONKEYS_CANDIDATES, FIXTURE_A_SETLIST_ID, FIXTURE_A_URL } from "../run/fixtures/setlists";
import { missingIdLink, notASetlistPageLink, setlistLinkError } from "../run/fixtures/typed-errors";

const USAGE_LINE = "Usage: playset [options] <setlist.fm link | Artist name...>";

/** No service was called: no setlist.fm and no Spotify request, no browser. */
function expectNoRequests(fake: ReturnType<typeof makeFakeIo>) {
  expect(fake.events.filter((e) => !e.startsWith("prompt:"))).toEqual([]);
}

function expectUsageError(fake: ReturnType<typeof makeFakeIo>, code: number) {
  expect(code).toBe(2);
  expect(fake.stderrLines()).toContain(USAGE_LINE);
  const otherLines = fake.stderrLines().filter((l) => l.trim() !== "" && l !== USAGE_LINE);
  expect(otherLines.length).toBeGreaterThan(0);
  expect(fake.selectQuestions).toEqual([]);
  expect(fake.confirmQuestions).toEqual([]);
  expectNoRequests(fake);
}

describe("playset — input", () => {
  for (const argv of [["Arctic", "Monkeys"], ["Arctic Monkeys"]]) {
    it(`AC-1: ${JSON.stringify(argv)} uses "Arctic Monkeys" as the Artist name for the Latest Setlist search`, async () => {
      const fake = makeFakeIo();
      const code = await main([...argv, "--no-tapes", "--yes"], fake.io);
      expect(code).toBe(0);
      expect(fake.calls.findLatest).toEqual(["Arctic Monkeys"]);
      expect(fake.calls.getSetlist).toEqual([]);
    });
  }

  it("AC-1: an Artist name with punctuation is passed on as typed", async () => {
    const fake = makeFakeIo();
    await main(["Panic!", "at", "the", "Disco", "--no-tapes", "--yes"], fake.io);
    expect(fake.calls.findLatest).toEqual(["Panic! at the Disco"]);
  });

  it("AC-2: one setlist.fm link fetches that Setlist by id, with no Artist search and no Artist question", async () => {
    const fake = makeFakeIo({ services: { candidates: ARCTIC_MONKEYS_CANDIDATES } });
    const code = await main([FIXTURE_A_URL, "--no-tapes", "--yes"], fake.io);
    expect(code).toBe(0);
    expect(fake.calls.getSetlist).toEqual([FIXTURE_A_SETLIST_ID]);
    expect(fake.calls.findLatest).toEqual([]);
    expect(fake.selectQuestions).toEqual([]);
  });

  for (const [reason, link] of [
    ["not-a-setlist-page", notASetlistPageLink],
    ["missing-id", missingIdLink],
  ] as const) {
    it(`AC-3: a setlist.fm link rejected as ${reason} prints PRD 0001's message and the usage line, exit 2, no request`, async () => {
      const expected = await setlistLinkError(link);
      const fake = makeFakeIo();
      const code = await main([link], fake.io);
      expectUsageError(fake, code);
      expect(fake.stderr()).toContain(expected.message);
    });
  }
});

describe("playset — usage errors", () => {
  for (const [label, argv] of [
    ["no arguments", []],
    ["only whitespace", ["   "]],
    ["only flags", ["--yes", "--public"]],
  ] as const) {
    it(`AC-4: ${label} prints a message and the usage line, exit 2, no request`, async () => {
      const fake = makeFakeIo();
      const code = await main([...argv], fake.io);
      expectUsageError(fake, code);
      expect(fake.stderr()).toMatch(/setlist\.fm link/i);
      expect(fake.stderr()).toMatch(/Artist name/i);
    });
  }

  for (const argv of [
    [FIXTURE_A_URL, "Radiohead"],
    ["Radiohead", FIXTURE_A_URL],
    [FIXTURE_A_URL, FIXTURE_A_URL],
  ]) {
    it(`AC-4: more than one argument with a setlist.fm link (${argv.length} args) is a usage error, exit 2, no request`, async () => {
      const fake = makeFakeIo();
      const code = await main(argv, fake.io);
      expectUsageError(fake, code);
    });
  }

  it("AC-5: --tapes together with --no-tapes names both flags, prints the usage line, exit 2, no question, no request (T3)", async () => {
    const fake = makeFakeIo();
    const code = await main(["--tapes", "--no-tapes", "Radiohead"], fake.io);
    expectUsageError(fake, code);
    expect(fake.stderr()).toContain("--tapes");
    expect(fake.stderr()).toContain("--no-tapes");
  });

  it("AC-5: an unknown option is named in the message with the usage line, exit 2, no request (T3)", async () => {
    const fake = makeFakeIo();
    const code = await main(["--publik", "Radiohead"], fake.io);
    expectUsageError(fake, code);
    expect(fake.stderr()).toContain("--publik");
  });

  it("AC-5: usage errors go to standard error, not standard output", async () => {
    const fake = makeFakeIo();
    await main(["--publik", "Radiohead"], fake.io);
    expect(fake.stdout()).not.toContain("--publik");
  });
});

describe("playset — help and version", () => {
  it("AC-6: --help prints the usage line, says the input is a setlist.fm link or an Artist name, and lists every option with a description; exit 0, no request", async () => {
    const fake = makeFakeIo();
    const code = await main(["--help"], fake.io);
    expect(code).toBe(0);
    const help = fake.stdout();
    expect(fake.stdoutLines()).toContain(USAGE_LINE);
    expect(help).toMatch(/setlist\.fm/i);
    expect(help).toMatch(/Artist name/i);
    for (const flag of ["--tapes", "--no-tapes", "--yes", "--public", "--dry-run", "--help", "--version"]) {
      const line = fake.stdoutLines().find((l) => new RegExp(`(^|\\s|,)${flag}(\\s|,|$)`).test(l));
      expect(line, `help line for ${flag}`).toBeDefined();
      const description = line!.replace(flag, "").replace(/-[\w-]+/g, "").trim();
      expect(description.length, `description for ${flag}`).toBeGreaterThan(5);
    }
    expectNoRequests(fake);
  });

  it("AC-6: --help works with an input too, and still makes no request", async () => {
    const fake = makeFakeIo();
    const code = await main(["Radiohead", "--help"], fake.io);
    expect(code).toBe(0);
    expect(fake.stdoutLines()).toContain(USAGE_LINE);
    expectNoRequests(fake);
  });

  it("AC-6: --version prints only 0.1.0; exit 0, no request", async () => {
    const fake = makeFakeIo();
    const code = await main(["--version"], fake.io);
    expect(code).toBe(0);
    expect(fake.stdout().trim()).toBe("0.1.0");
    expect(fake.stderr()).toBe("");
    expectNoRequests(fake);
  });
});

describe("playset — flags anywhere", () => {
  for (const argv of [
    ["--public", "arctic", "monkey", "--no-tapes", "--yes"],
    ["arctic", "--public", "monkey", "--no-tapes", "--yes"],
    ["arctic", "monkey", "--no-tapes", "--yes", "--public"],
  ]) {
    it(`AC-7: flags before, between or after the words are recognised: ${argv.join(" ")}`, async () => {
      const fake = makeFakeIo();
      const code = await main(argv, fake.io);
      expect(code).toBe(0);
      expect(fake.calls.findLatest).toEqual(["arctic monkey"]);
      expect(fake.calls.create).toHaveLength(1);
      expect(fake.calls.create[0]!.options.public).toBe(true);
      expect(fake.confirmQuestions).toEqual([]);
    });
  }
});
