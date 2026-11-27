// The interactive shell (PRD 0009): `playset` with no arguments in a terminal reads one Line after another.
// Each Line is a built-in command or a run with PRD 0007's arguments; a run's errors and Ctrl-C end only that run.
import { OPTIONS_HELP, VERSION, parseArgs } from "./args.js";
import type { CliIo } from "./main.js";
import { EXIT_OK, runCommand } from "./run-command.js";
import type { WriteLine } from "./terminal-front-end.js";

export const SHELL_PROMPT = "playset › ";
const SHELL_HINT = "Type help to see the options.";
const LEAVE_HINT = "(To leave, type exit or press Ctrl-C again.)";

const SESSION_HELP = `A line is a setlist.fm Setlist link, or an Artist name to use their Latest Setlist,
followed by any options. Options apply to that line only.

${OPTIONS_HELP}
Commands:
  help         show this help
  clear        clear the screen
  exit, quit   leave Playset

To look up an Artist named like a command, put the name in double quotes: "Help"
`;

type BuiltIn = "help" | "clear" | "exit";

/** Runs a session until `exit`/`quit`, Ctrl-C twice at an empty prompt, or the end of input; resolves to 0. */
export async function runShell(io: CliIo): Promise<number> {
  const out: WriteLine = (line = "") => io.stdout.write(`${line}\n`);
  out(`Playset ${VERSION}`);
  out("Type a setlist.fm link or an Artist name. Type help for commands, exit to leave.");
  out();

  const history: string[] = [];
  let leaveHintShown = false;

  for (;;) {
    const event = await io.readLine({ prompt: SHELL_PROMPT, history: [...history] });
    if (event.kind === "end") return EXIT_OK;
    if (event.kind === "interrupt") {
      // Ctrl-C with text typed only discards that text (AC-18).
      if (event.typed !== "") continue;
      if (leaveHintShown) return EXIT_OK;
      out(LEAVE_HINT);
      leaveHintShown = true;
      continue;
    }

    leaveHintShown = false;
    const line = event.text;
    if (line.trim() === "") continue;
    history.unshift(line);

    const builtIn = builtInOf(line);
    if (builtIn === "exit") return EXIT_OK;
    if (builtIn === "clear") io.clearScreen();
    else if (builtIn === "help") io.stdout.write(SESSION_HELP);
    else await runLine(line, io);
  }
}

/** A built-in only when the whole Line, trimmed, is one of the command words in any case (AC-12). */
function builtInOf(line: string): BuiltIn | undefined {
  const word = line.trim().toLowerCase();
  if (word === "help" || word === "clear") return word;
  if (word === "exit" || word === "quit") return "exit";
  return undefined;
}

/** A run Line: its words handled as PRD 0007's command-line arguments (AC-5 to AC-8). */
async function runLine(line: string, io: CliIo): Promise<void> {
  const err: WriteLine = (text = "") => io.stderr.write(`${text}\n`);
  const usageError = (message: string) => {
    err(message);
    err(SHELL_HINT);
    return EXIT_OK;
  };

  const words = splitLine(line);
  if (words === undefined) {
    usageError("A double quote is not closed.");
    return;
  }
  if (words.includes("--help")) {
    io.stdout.write(SESSION_HELP);
    return;
  }
  if (words.includes("--version")) {
    io.stdout.write(`${VERSION}\n`);
    return;
  }

  const parsed = parseArgs(words, () => {});
  if (parsed.kind === "usage-error") usageError(parsed.message);
  if (parsed.kind !== "run") return;
  await runCommand(parsed.words, parsed.options, io, { usageError });
}

/**
 * Splits a Line into words at whitespace; text inside a pair of double quotes is one word, quotes removed.
 * Every other character (an apostrophe too) is part of a word. Undefined when a double quote is not closed.
 */
export function splitLine(line: string): string[] | undefined {
  const words: string[] = [];
  let word: string | undefined;
  let quoted = false;
  for (const char of line) {
    if (char === '"') {
      quoted = !quoted;
      word ??= "";
    } else if (!quoted && /\s/.test(char)) {
      if (word !== undefined) words.push(word);
      word = undefined;
    } else {
      word = (word ?? "") + char;
    }
  }
  if (quoted) return undefined;
  if (word !== undefined) words.push(word);
  return words;
}
