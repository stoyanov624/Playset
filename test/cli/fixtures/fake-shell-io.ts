// Fake terminal for the interactive shell tests (PRD 0009). Builds on the PRD 0007 fake io
// (test/cli/fixtures/fake-io.ts: captured stdout/stderr, scripted select/confirm answers,
// fake browser, fake RunServices) and adds what a session needs:
//   - `stdinIsTerminal` / `stdoutIsTerminal` flags,
//   - `readLine({ prompt, history })`: scripted Lines, Ctrl-C and end-of-input events,
//   - `clearScreen()`,
//   - a stack-based `onInterrupt` so Ctrl-C can be simulated in the middle of a run.
// No real terminal, no browser, no network.
import type { CliIo } from "../../../src/cli/main.js";
import { makeFakeIo, type FakeIoOptions, type TranscriptEntry } from "./fake-io";

/** What one `readLine` call resolves to (the contract the shell implements against). */
export type LineEvent =
  | { kind: "line"; text: string }
  /** Ctrl-C at the prompt. `typed` is the text that was on the prompt line (discarded). */
  | { kind: "interrupt"; typed: string }
  /** Ctrl-D on an empty prompt, or the end of standard input. */
  | { kind: "end" };

export interface ReadLineRequest {
  /** Always `playset › ` (with a trailing space). */
  prompt: string;
  /** Earlier non-empty Lines of this session, newest first (what the up arrow walks through). */
  history: readonly string[];
}

/** Ctrl-C on an empty prompt. */
export const CTRL_C: LineEvent = { kind: "interrupt", typed: "" };
/** Ctrl-C with some text typed at the prompt. */
export const ctrlCWhileTyping = (typed: string): LineEvent => ({ kind: "interrupt", typed });
/** Ctrl-D / end of standard input. */
export const CTRL_D: LineEvent = { kind: "end" };

/** A scripted entry: a Line, an event, or a step run just before the Line is read (returns the entry). */
export type ScriptEntry = string | LineEvent | (() => ScriptEntry | Promise<ScriptEntry>);

export interface FakeShellIoOptions extends FakeIoOptions {
  /** Default: both true (a real terminal). */
  stdinIsTerminal?: boolean;
  stdoutIsTerminal?: boolean;
  /** Override some RunServices methods; receives the PRD 0007 fake services and this fake. */
  overrideServices?: (inner: Record<string, (...args: any[]) => any>, controls: ShellControls) => Record<string, unknown>;
}

/** What a service override may do to the session: press Ctrl-C mid-run, look at the events. */
export interface ShellControls {
  interrupt(): void;
  hasInterruptHandler(): boolean;
  events: string[];
}

export interface ReadLineCall {
  prompt: string;
  history: string[];
  /** Transcript index of this prompt's echo entry. */
  at: number;
  event: LineEvent;
}

export interface Segment {
  stdout: string;
  stderr: string;
  /** stdout + stderr in order (no question prompts). */
  output: string;
  entries: TranscriptEntry[];
}

export const SHELL_PROMPT = "playset › ";

export function makeFakeShellIo(script: ScriptEntry[], opts: FakeShellIoOptions = {}) {
  const base = makeFakeIo(opts);
  const queue = [...script];
  const readLineCalls: ReadLineCall[] = [];
  const clearScreenCalls: number[] = [];
  const handlers: (() => void)[] = [];

  const resolveEntry = async (entry: ScriptEntry | undefined): Promise<LineEvent> => {
    if (entry === undefined) return CTRL_D;
    if (typeof entry === "function") return resolveEntry(await entry());
    if (typeof entry === "string") return { kind: "line", text: entry };
    return entry;
  };

  const fake = {
    ...base,
    readLineCalls,
    clearScreenCalls,
    /** Simulates Ctrl-C (SIGINT) while a run is going (not at a question, not at the prompt). */
    interrupt: () => {
      const handler = handlers.at(-1);
      if (!handler) throw new Error("fake shell io: no interrupt handler registered");
      handler();
    },
    hasInterruptHandler: () => handlers.length > 0,
    /** Output written before the first prompt (the banner). */
    beforeFirstPrompt: (): Segment => segmentOf(base.transcript.slice(0, readLineCalls[0]?.at ?? base.transcript.length)),
    /** Output written after the k-th Line was read (0-based) and before the next prompt. */
    afterLine: (k: number): Segment => {
      const call = readLineCalls[k];
      if (!call) throw new Error(`fake shell io: no Line #${k}`);
      const end = readLineCalls[k + 1]?.at ?? base.transcript.length;
      return segmentOf(base.transcript.slice(call.at + 1, end));
    },
    /** Service and question events recorded after the k-th Line was read and before the next prompt. */
    eventsAfterLine: (k: number): string[] => {
      const call = eventMarks[k];
      if (call === undefined) throw new Error(`fake shell io: no Line #${k}`);
      return base.events.slice(call, eventMarks[k + 1] ?? base.events.length);
    },
  };
  const eventMarks: number[] = [];

  const ioBase = base.io as unknown as Record<string, unknown>;
  const inner = ioBase.services as Record<string, (...args: any[]) => any>;
  const services = opts.overrideServices ? { ...inner, ...opts.overrideServices(inner, fake) } : inner;

  const io = {
    ...ioBase,
    services,
    stdinIsTerminal: opts.stdinIsTerminal ?? true,
    stdoutIsTerminal: opts.stdoutIsTerminal ?? true,
    onInterrupt(handler: () => void): () => void {
      handlers.push(handler);
      return () => {
        const i = handlers.lastIndexOf(handler);
        if (i >= 0) handlers.splice(i, 1);
      };
    },
    async readLine(request: ReadLineRequest): Promise<LineEvent> {
      if (readLineCalls.length >= 200) throw new Error("fake shell io: readLine called too often (endless loop?)");
      const event = await resolveEntry(queue.shift());
      const at = base.transcript.length;
      // Echo what the terminal would show: the prompt and what was typed.
      const typed = event.kind === "line" ? event.text : event.kind === "interrupt" ? `${event.typed}^C` : "^D";
      base.transcript.push({ stream: "stdout", text: `${request.prompt}${typed}\n` });
      readLineCalls.push({ prompt: request.prompt, history: [...request.history], at, event });
      eventMarks.push(base.events.length);
      return event;
    },
    clearScreen(): void {
      base.events.push("terminal:clear");
      clearScreenCalls.push(readLineCalls.length);
    },
  };

  return { ...fake, io: io as unknown as CliIo };
}

export type FakeShell = ReturnType<typeof makeFakeShellIo>;

function segmentOf(entries: TranscriptEntry[]): Segment {
  const join = (pred: (e: TranscriptEntry) => boolean) => entries.filter(pred).map((e) => e.text).join("");
  return {
    stdout: join((e) => e.stream === "stdout"),
    stderr: join((e) => e.stream === "stderr"),
    output: join((e) => e.stream !== "prompt"),
    entries,
  };
}

/** Non-empty, right-trimmed lines of a text. */
export const nonEmptyLines = (text: string) =>
  text
    .split("\n")
    .map((l) => l.replace(/\s+$/, ""))
    .filter((l) => l.trim() !== "");

/** Service events only (no questions, no terminal events). */
export const requestEvents = (events: string[]) =>
  events.filter((e) => e.startsWith("setlistfm:") || e.startsWith("spotify:") || e.startsWith("browser:"));
