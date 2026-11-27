// PRD 0009 AC-25 — the session loop takes its Lines and output from the caller:
// runShell(io) can be driven directly with a fake terminal, fake questions and fake services.
import { describe, expect, it } from "vitest";
import { runShell } from "../../src/cli/shell.js";
import { CTRL_C, CTRL_D, SHELL_PROMPT, makeFakeShellIo, nonEmptyLines } from "./fixtures/fake-shell-io";
import { CREATED_SHARE_URL } from "../run/fixtures/fake-services";

describe("runShell — the session loop with injected io", () => {
  it("AC-25: runs scripted Lines with fake services and a captured output, and reports the session's exit code", async () => {
    const fake = makeFakeShellIo([
      "Arctic Monkeys --dry-run --no-tapes",
      "--publik Radiohead",
      "Arctic Monkeys --yes",
      "exit",
    ], { confirmAnswers: [true, false] });
    const code = await runShell(fake.io);
    expect(code).toBe(0);
    expect(nonEmptyLines(fake.beforeFirstPrompt().stdout)).toEqual([
      "Playset 0.1.0",
      "Type a setlist.fm link or an Artist name. Type help for commands, exit to leave.",
    ]);
    expect(fake.readLineCalls.map((c) => c.prompt)).toEqual([SHELL_PROMPT, SHELL_PROMPT, SHELL_PROMPT, SHELL_PROMPT]);
    expect(nonEmptyLines(fake.afterLine(0).stdout).at(-1)).toMatch(/dry run/i);
    expect(fake.afterLine(1).stderr).toContain("--publik");
    expect(nonEmptyLines(fake.afterLine(2).stdout).at(-1)).toBe(CREATED_SHARE_URL);
    expect(fake.calls.create).toHaveLength(1);
  });

  it("AC-25: Ctrl-C twice and end of input are scripted events; the exit code is 0", async () => {
    for (const script of [[CTRL_C, CTRL_C], [CTRL_D], []]) {
      const fake = makeFakeShellIo(script);
      expect(await runShell(fake.io)).toBe(0);
      expect(fake.events).toEqual([]);
    }
  });
});
