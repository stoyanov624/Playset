// Fake terminal for the CLI tests (PRD 0007): captured stdout/stderr, scripted answers for
// the @inquirer/prompts-style `select` and `confirm`, a fake browser opener, a fake Ctrl-C
// (interrupt) source, and the fake run services from test/run. No real terminal, browser or network.
import type { CliIo } from "../../../src/cli/main.js";
import {
  ExitPromptError,
  SETLISTFM_API_KEY,
  SPOTIFY_CLIENT_ID,
  makeFakeServices,
  type FakeServicesOptions,
} from "../../run/fixtures/fake-services";

export type SelectAnswer = number | "cancel";
export type ConfirmAnswer = boolean | "default" | "cancel";

export interface SelectQuestion {
  message: string;
  choices: { name: string; value: unknown }[];
}
export interface ConfirmQuestion {
  message: string;
  default?: boolean;
}

export interface FakeIoOptions {
  services?: FakeServicesOptions;
  /** Answers to `select` (the Artist question): a choice index, or "cancel" for Ctrl-C. */
  selectAnswers?: SelectAnswer[];
  /** Answers to `confirm` (Tape questions, then the final confirmation), in order. */
  confirmAnswers?: ConfirmAnswer[];
  /** Extra environment variables (PLAYSET_DEBUG, …). */
  env?: Record<string, string | undefined>;
  /** The browser can't be opened: the opener rejects. */
  openBrowserFails?: boolean;
}

export interface TranscriptEntry {
  stream: "stdout" | "stderr" | "prompt";
  text: string;
}

export function makeFakeIo(opts: FakeIoOptions = {}) {
  const events: string[] = [];
  const fake = makeFakeServices(opts.services ?? {}, events);
  const transcript: TranscriptEntry[] = [];
  const selectAnswers = [...(opts.selectAnswers ?? [])];
  const confirmAnswers = [...(opts.confirmAnswers ?? [])];
  const selectQuestions: SelectQuestion[] = [];
  const confirmQuestions: ConfirmQuestion[] = [];
  const openedUrls: string[] = [];
  let interruptHandler: (() => void) | undefined;

  const prompts = {
    async select(question: SelectQuestion): Promise<unknown> {
      events.push("prompt:select");
      transcript.push({ stream: "prompt", text: question.message });
      selectQuestions.push({ message: question.message, choices: question.choices.map((c) => ({ ...c })) });
      const answer = selectAnswers.shift();
      if (answer === undefined) throw new Error(`fake select: unexpected question "${question.message}"`);
      if (answer === "cancel") throw new ExitPromptError();
      const choice = question.choices[answer];
      if (!choice) throw new Error(`fake select: no choice at ${answer}`);
      return choice.value;
    },
    async confirm(question: ConfirmQuestion): Promise<boolean> {
      events.push(`prompt:confirm:${question.message}`);
      transcript.push({ stream: "prompt", text: question.message });
      confirmQuestions.push({ ...question });
      const answer = confirmAnswers.shift();
      if (answer === undefined) throw new Error(`fake confirm: unexpected question "${question.message}"`);
      if (answer === "cancel") throw new ExitPromptError();
      if (answer === "default") return question.default ?? false;
      return answer;
    },
  };

  const io = {
    stdout: {
      write(text: string) {
        transcript.push({ stream: "stdout", text });
        return true;
      },
    },
    stderr: {
      write(text: string) {
        transcript.push({ stream: "stderr", text });
        return true;
      },
    },
    env: { SETLISTFM_API_KEY, SPOTIFY_CLIENT_ID, ...(opts.env ?? {}) },
    prompts,
    async openBrowser(url: string): Promise<void> {
      events.push("browser:open");
      openedUrls.push(url);
      if (opts.openBrowserFails) throw Object.assign(new Error("spawn xdg-open ENOENT"), { code: "ENOENT" });
    },
    services: fake.services,
    onInterrupt(handler: () => void): () => void {
      interruptHandler = handler;
      return () => {
        if (interruptHandler === handler) interruptHandler = undefined;
      };
    },
  };

  const text = (stream: "stdout" | "stderr") =>
    transcript
      .filter((e) => e.stream === stream)
      .map((e) => e.text)
      .join("");
  const lines = (stream: "stdout" | "stderr") => text(stream).split("\n").map((l) => l.replace(/\s+$/, ""));

  return {
    io: io as unknown as CliIo,
    events,
    calls: fake.calls,
    transcript,
    selectQuestions,
    confirmQuestions,
    openedUrls,
    stdout: () => text("stdout"),
    stderr: () => text("stderr"),
    output: () => transcript.filter((e) => e.stream !== "prompt").map((e) => e.text).join(""),
    stdoutLines: () => lines("stdout"),
    stderrLines: () => lines("stderr"),
    /** The last non-empty line of standard output. */
    lastStdoutLine: () => lines("stdout").filter((l) => l.trim() !== "").at(-1),
    /** Simulates Ctrl-C (SIGINT) outside a prompt, e.g. while waiting for the Spotify login. */
    interrupt: () => {
      if (!interruptHandler) throw new Error("fake io: no interrupt handler registered");
      interruptHandler();
    },
    hasInterruptHandler: () => interruptHandler !== undefined,
  };
}

export type FakeIo = ReturnType<typeof makeFakeIo>;

/** Position of the first transcript entry whose text includes `needle` (−1 if none). */
export function positionOf(fake: FakeIo, needle: string, stream?: TranscriptEntry["stream"]): number {
  return fake.transcript.findIndex((e) => (stream === undefined || e.stream === stream) && e.text.includes(needle));
}
