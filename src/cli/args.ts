import { Command, CommanderError } from "commander";
import type { RunOptions } from "../core/run/index.js";

export const VERSION = "0.1.0";
export const USAGE_LINE = "Usage: playset [options] <setlist.fm link | Artist name...>";

/** The options with their one-line descriptions, shared by `--help` and the shell's help so they never differ. */
export const OPTIONS_HELP = `Options:
  --tapes      add every Tape without asking
  --no-tapes   leave out every Tape without asking
  --yes        create the playlist without asking for confirmation
  --public     make the playlist public (default: private)
  --dry-run    show the preview with Matches, but don't create anything
  --version    print the version number
  --help       show this help
`;

const HELP_TEXT = `${USAGE_LINE}

Turn a setlist.fm Setlist into a Spotify Setlist Playlist.
Give a setlist.fm Setlist link, or an Artist name to use their Latest Setlist.
Run playset with no arguments to open an interactive session.

${OPTIONS_HELP}`;

export type ParsedArgs =
  | { kind: "run"; words: string[]; options: RunOptions }
  /** `--help` or `--version` was printed. */
  | { kind: "done" }
  | { kind: "usage-error"; message: string };

/** Reads the command line. Flags may come before, between or after the words of the input. */
export function parseArgs(argv: readonly string[], write: (text: string) => void): ParsedArgs {
  const program = new Command()
    .name("playset")
    .argument("[input...]")
    .option("--tapes")
    .option("--no-tapes")
    .option("--yes")
    .option("--public")
    .option("--dry-run")
    .helpOption("--help")
    .version(VERSION, "--version")
    .configureHelp({ formatHelp: () => HELP_TEXT })
    .configureOutput({ writeOut: write, writeErr: () => {}, outputError: () => {} })
    .exitOverride();

  const tapeFlags = new Set<string>();
  program.on("option:tapes", () => tapeFlags.add("--tapes"));
  program.on("option:no-tapes", () => tapeFlags.add("--no-tapes"));

  try {
    program.parse([...argv], { from: "user" });
  } catch (err) {
    if (!(err instanceof CommanderError)) throw err;
    if (err.code === "commander.helpDisplayed" || err.code === "commander.version") return { kind: "done" };
    return { kind: "usage-error", message: usageMessageOf(err) };
  }

  if (tapeFlags.size > 1) {
    return { kind: "usage-error", message: "--tapes and --no-tapes can't be used together." };
  }

  const flags = program.opts<{ tapes?: boolean; yes?: boolean; public?: boolean; dryRun?: boolean }>();
  return {
    kind: "run",
    words: program.args,
    options: {
      tapes: flags.tapes === true ? "all" : flags.tapes === false ? "none" : "ask",
      confirm: flags.yes ? "skip" : "ask",
      public: flags.public === true,
      dryRun: flags.dryRun === true,
    },
  };
}

function usageMessageOf(err: CommanderError): string {
  const flag = /'([^']+)'/.exec(err.message)?.[1];
  if (err.code === "commander.unknownOption" && flag) return `Unknown option \`${flag}\`.`;
  const text = err.message.replace(/^error:\s*/i, "");
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}
