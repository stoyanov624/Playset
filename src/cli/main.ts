import type { RunServices } from "../core/run/index.js";
import { USAGE_LINE, parseArgs } from "./args.js";
import { EXIT_OK, EXIT_USAGE, runCommand } from "./run-command.js";
import { runShell } from "./shell.js";
import type { WriteLine } from "./terminal-front-end.js";

export { EXIT_CANCELLED, EXIT_ERROR, EXIT_OK, EXIT_USAGE } from "./run-command.js";

/** What one read of a Line at the shell prompt gives. */
export type LineEvent =
  | { kind: "line"; text: string }
  /** Ctrl-C at the prompt; `typed` is the text that was on the prompt line (discarded). */
  | { kind: "interrupt"; typed: string }
  /** Ctrl-D on an empty prompt, or the end of standard input. */
  | { kind: "end" };

export interface CliIo {
  stdout: { write(text: string): unknown };
  stderr: { write(text: string): unknown };
  /** Whether standard input / output is a terminal; the shell opens only when both are. */
  stdinIsTerminal?: boolean;
  stdoutIsTerminal?: boolean;
  env: Record<string, string | undefined>;
  prompts: {
    select<T>(question: { message: string; choices: { name: string; value: T }[] }): Promise<T>;
    confirm(question: { message: string; default?: boolean }): Promise<boolean>;
  };
  /** Tries to open the URL in the default browser. May reject; the CLI ignores that. */
  openBrowser(url: string): Promise<void>;
  /** Shared by every run of a process (and of a shell session). */
  services: RunServices;
  /** Registers a Ctrl-C handler for when no prompt is active; returns a function that removes it. */
  onInterrupt?(handler: () => void): () => void;
  /** Shows the prompt and reads one Line; `history` is the session's earlier Lines, newest first. */
  readLine(request: { prompt: string; history: readonly string[] }): Promise<LineEvent>;
  /** Clears the terminal screen. */
  clearScreen(): void;
}

export function browserCommandFor(platform: string): "open" | "xdg-open" | "start" {
  if (platform === "darwin") return "open";
  if (platform === "win32") return "start";
  return "xdg-open";
}

/** `playset` with no arguments at all, with a terminal on both standard input and output, opens a session. */
export function opensSession(argv: readonly string[], io: Pick<CliIo, "stdinIsTerminal" | "stdoutIsTerminal">): boolean {
  return argv.length === 0 && io.stdinIsTerminal === true && io.stdoutIsTerminal === true;
}

/** Runs `playset` with the given arguments (without `node` and the script); resolves to the exit code. */
export async function main(argv: string[], io: CliIo): Promise<number> {
  if (opensSession(argv, io)) return runShell(io);

  const err: WriteLine = (line = "") => io.stderr.write(`${line}\n`);
  const usageError = (message: string) => {
    err(message);
    err(USAGE_LINE);
    return EXIT_USAGE;
  };

  const parsed = parseArgs(argv, (text) => io.stdout.write(text));
  if (parsed.kind === "done") return EXIT_OK;
  if (parsed.kind === "usage-error") return usageError(parsed.message);
  return runCommand(parsed.words, parsed.options, io, { usageError });
}
