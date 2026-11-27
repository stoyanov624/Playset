// PRD 0011 AC-18 (and AC-13 in a session) — Incomplete Setlists in the interactive shell (PRD 0009).
// Driven through main([], io) with the fake terminal of test/cli/fixtures/fake-shell-io.ts.
import { describe, expect, it } from "vitest";
import { main } from "../../src/cli/main.js";
import {
  CTRL_C,
  makeFakeShellIo,
  nonEmptyLines,
  requestEvents,
  type FakeShellIoOptions,
  type ScriptEntry,
} from "./fixtures/fake-shell-io";
import { CREATED_SHARE_URL } from "../run/fixtures/fake-services";
import { pearlJamOutcomes, pearlJamPortland, pearlJamVancouver } from "../run/fixtures/incomplete-setlists";
import { loadFixture, loadFixtureA, makeClient, makeFakes, ok, setlistsPage } from "../setlistfm/helpers";

const LEAVE_HINT = "(To leave, type exit or press Ctrl-C again.)";
const STACK_FRAME = /^\s+at\s/m;

async function session(script: ScriptEntry[], opts: FakeShellIoOptions = {}) {
  const fake = makeFakeShellIo(script, opts);
  const code = await main([], fake.io);
  return { fake, code };
}

/** L1's fakes: Latest = Portland (incomplete), newest complete = Vancouver. */
const PEARL_JAM_SERVICES = () => ({
  setlist: pearlJamPortland(),
  completeAlternative: pearlJamVancouver(),
  outcomes: pearlJamOutcomes,
});

describe("shell — Incomplete Setlists in a session (S1)", () => {
  it("AC-18: 'Pearl Jam --dry-run' asks the offer; Yes switches to Vancouver and ends with the dry-run line, then the prompt again", async () => {
    const { fake, code } = await session(["Pearl Jam --dry-run", "Pearl Jam --yes", "exit"], {
      services: PEARL_JAM_SERVICES(),
      confirmAnswers: [true],
    });
    expect(code).toBe(0);
    expect(fake.readLineCalls).toHaveLength(3);
    const first = fake.afterLine(0);
    expect(first.stdout).toContain("Moda Center");
    expect(first.stdout).toMatch(/incomplete/i);
    expect(first.stdout).toMatch(/\b1 Unknown Song\b/);
    expect(fake.confirmQuestions).toHaveLength(1);
    expect(fake.confirmQuestions[0]!.message).toContain("Vancouver");
    expect(fake.confirmQuestions[0]!.message).toContain("Portland");
    expect(first.stdout).toContain("Rogers Arena");
    const firstLines = nonEmptyLines(first.stdout);
    expect(firstLines.at(-1)).toMatch(/dry run/i);
    // Vancouver is complete: nothing after its Show line mentions "incomplete"
    const vancouverAt = firstLines.findIndex((l) => l.includes("Rogers Arena"));
    expect(firstLines.slice(vancouverAt).join("\n")).not.toMatch(/incomplete/i);
  });

  it("AC-18: a following 'Pearl Jam --yes' doesn't remember the earlier answer: no offer, Portland with the warning, the Note line and the share link last", async () => {
    const { fake } = await session(["Pearl Jam --dry-run", "Pearl Jam --yes", "exit"], {
      services: PEARL_JAM_SERVICES(),
      confirmAnswers: [true],
    });
    const second = fake.afterLine(1);
    expect(second.stdout).toContain("Moda Center");
    expect(second.stdout).not.toContain("Rogers Arena");
    expect(fake.eventsAfterLine(1).filter((e) => e.startsWith("prompt:"))).toEqual([]);
    const lines = nonEmptyLines(second.stdout);
    expect(lines.at(-1)).toBe(CREATED_SHARE_URL);
    expect(lines.at(-2)).toMatch(/incomplete/i);
    expect(lines.at(-2)).toMatch(/full Show/i);
    expect(fake.calls.create).toHaveLength(1);
    expect(fake.calls.create[0]!.show.city).toBe("Portland");
    expect(fake.calls.findLatestOptions.map((o) => o?.wantCompleteAlternative ?? false)).toEqual([true, false]);
  });

  it("AC-18: a run Line's preview lists the Unknown Song and carries the warning line, as outside a session", async () => {
    const { fake } = await session(["Pearl Jam --dry-run", "exit"], {
      services: PEARL_JAM_SERVICES(),
      confirmAnswers: [false],
    });
    const lines = nonEmptyLines(fake.afterLine(0).stdout).map((l) => l.trim());
    expect(lines).toContain("(Unknown song) after #1 — New song, title not yet known");
    const nameAt = lines.findIndex((l) => l.includes("Pearl Jam – 2026-11-22 – Portland") && /private/.test(l));
    expect(nameAt).toBeGreaterThan(0);
    expect(lines.slice(lines.findIndex((l) => /^not added:?$/i.test(l)), nameAt).join("\n")).toMatch(/incomplete/i);
    expect(lines.at(-1)).toMatch(/dry run/i);
    expect(lines.at(-2)).toMatch(/incomplete/i);
  });

  it("AC-18: an Artist name without --yes in a session asks setlist.fm for page 2 when the Latest Setlist is incomplete (S1's first Line)", async () => {
    const sfm = makeFakes([
      ok(loadFixture("search-arctic-monkeys.json")),
      ok(setlistsPage(1, 1047, [loadFixtureA()])),
      ok(setlistsPage(2, 1047, [])),
    ]);
    const client = makeClient(sfm) as unknown as {
      getSetlist(id: string): Promise<unknown>;
      findLatestSetlistByArtistName(...args: unknown[]): Promise<unknown>;
    };
    const { fake, code } = await session(["Arctic Monkeys --dry-run --no-tapes", "exit"], {
      overrideServices: () => ({
        getSetlist: (id: string) => client.getSetlist(id),
        findLatestSetlistByArtistName: (...args: unknown[]) => client.findLatestSetlistByArtistName(...args),
      }),
    });
    expect(code).toBe(0);
    expect(sfm.requests.map((r) => r.parsed.searchParams.get("p"))).toEqual(["1", "1", "2"]);
    for (let i = 1; i < sfm.requests.length; i++) {
      expect(sfm.requests[i]!.at - sfm.requests[i - 1]!.at).toBeGreaterThanOrEqual(500);
    }
    expect(fake.confirmQuestions).toEqual([]);
    expect(fake.afterLine(0).stdout).toMatch(/incomplete/i);
    expect(nonEmptyLines(fake.afterLine(0).stdout).at(-1)).toMatch(/dry run/i);
  });
});

describe("shell — Ctrl-C at the offer question (O5)", () => {
  it("AC-13: the run ends with 'Cancelled.' and the prompt is shown again; no Spotify request", async () => {
    const { fake, code } = await session(["Pearl Jam", "exit"], {
      services: PEARL_JAM_SERVICES(),
      confirmAnswers: ["cancel"],
    });
    expect(code).toBe(0);
    const seg = fake.afterLine(0);
    expect(nonEmptyLines(seg.output).filter((l) => l.trim() === "Cancelled.")).toHaveLength(1);
    expect(seg.output).not.toMatch(STACK_FRAME);
    expect(seg.output).not.toContain("ExitPromptError");
    expect(seg.output).not.toContain(LEAVE_HINT);
    expect(fake.readLineCalls).toHaveLength(2);
    expect(requestEvents(fake.eventsAfterLine(0)).filter((e) => e.startsWith("spotify:"))).toEqual([]);
    expect(fake.calls.create).toEqual([]);
  });

  it("AC-13: that Ctrl-C doesn't count toward leaving: one following ^C at the empty prompt prints only the leave hint, and the session goes on", async () => {
    const { fake, code } = await session(["Pearl Jam", CTRL_C, "exit"], {
      services: PEARL_JAM_SERVICES(),
      confirmAnswers: ["cancel"],
    });
    expect(code).toBe(0);
    expect(fake.readLineCalls).toHaveLength(3);
    expect(nonEmptyLines(fake.afterLine(1).output).map((l) => l.trim())).toEqual([LEAVE_HINT]);
  });
});
