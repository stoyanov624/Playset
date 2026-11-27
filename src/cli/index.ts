// The real `playset` entry: wires the terminal, the browser and the real setlist.fm/Spotify adapters to main().
import { spawn } from "node:child_process";
import { clearScreenDown, createInterface, cursorTo } from "node:readline";
import { confirm, select } from "@inquirer/prompts";
import {
  createSetlistFmClient,
  createSetlistPlaylist,
  createSpotifyTrackSearch,
  findPlaylistsNamed,
  getAccessToken,
  matchPerformance,
  startLoopbackReceiver,
  type CallbackReceiver,
} from "../core/index.js";
import type { RunServices } from "../core/run/index.js";
import { EXIT_CANCELLED, browserCommandFor, main, opensSession, type CliIo, type LineEvent } from "./main.js";

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const now = () => Date.now();
const env = process.env;

function openBrowser(url: string): Promise<void> {
  const command = browserCommandFor(process.platform);
  // `start` is a cmd.exe built-in; its first quoted argument is the window title.
  const [file, args] = command === "start" ? ["cmd", ["/c", "start", '""', url]] : [command, [url]];
  try {
    const child = spawn(file, args, { detached: true, stdio: "ignore", windowsHide: true });
    child.on("error", () => {});
    child.unref();
  } catch {
    // The URL is printed anyway.
  }
  return Promise.resolve();
}

/** Login callback receivers that are still listening (a login cancelled with Ctrl-C never closes its own). */
const openReceivers = new Set<CallbackReceiver>();

async function startTrackedReceiver(redirectUri: string): Promise<CallbackReceiver> {
  const receiver = await startLoopbackReceiver(redirectUri);
  openReceivers.add(receiver);
  return {
    waitForCallback: () => receiver.waitForCallback(),
    close: () => {
      openReceivers.delete(receiver);
      return receiver.close();
    },
  };
}

/** Frees the login port so the next run's login can listen on it again (PRD 0009 AC-21). */
async function closeOpenReceivers(): Promise<void> {
  const receivers = [...openReceivers];
  openReceivers.clear();
  await Promise.all(receivers.map((receiver) => receiver.close().catch(() => {})));
}

/**
 * Built once per process, so every run of a shell session shares the setlist.fm request spacing and the
 * Spotify token. Settings (API key, client id) are read on each use until found, so one added mid-session works.
 */
function realServices(): RunServices {
  let setlistFm: ReturnType<typeof createSetlistFmClient> | undefined;
  // Created on first use, so a missing API key is reported only when setlist.fm is needed.
  const setlistFmClient = () => (setlistFm ??= createSetlistFmClient({ fetch, sleep, now, env }));

  return {
    getSetlist: (setlistId) => setlistFmClient().getSetlist(setlistId),
    findLatestSetlistByArtistName: (name, chooser, options) =>
      setlistFmClient().findLatestSetlistByArtistName(name, chooser, options),
    async getAccessToken({ openAuthorizeUrl }) {
      await closeOpenReceivers();
      return getAccessToken({ fetch, sleep, now, env, openAuthorizeUrl, startCallbackReceiver: startTrackedReceiver });
    },
    findMatch: (performance, accessToken) => matchPerformance(performance, createSpotifyTrackSearch({ accessToken })),
    findPlaylistsNamed: (name, accessToken) => findPlaylistsNamed(name, { accessToken }),
    createSetlistPlaylist: (show, matches, options) => createSetlistPlaylist(show, matches, options),
  };
}

/** One Line at the prompt, with in-memory history; Ctrl-C and end of input are reported as events. */
function readLine({ prompt, history }: { prompt: string; history: readonly string[] }): Promise<LineEvent> {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
      history: [...history],
      historySize: history.length + 1,
      removeHistoryDuplicates: false,
    });
    let settled = false;
    const finish = (event: LineEvent) => {
      if (settled) return;
      settled = true;
      rl.close();
      resolve(event);
    };
    rl.on("line", (text) => finish({ kind: "line", text }));
    rl.on("SIGINT", () => {
      const typed = rl.line;
      process.stdout.write("^C\n");
      finish({ kind: "interrupt", typed });
    });
    rl.on("close", () => {
      if (!settled) process.stdout.write("\n");
      finish({ kind: "end" });
    });
    rl.setPrompt(prompt);
    rl.prompt();
  });
}

const io: CliIo = {
  stdout: process.stdout,
  stderr: process.stderr,
  stdinIsTerminal: process.stdin.isTTY === true,
  stdoutIsTerminal: process.stdout.isTTY === true,
  env,
  prompts: {
    select: (question) => select(question),
    confirm: (question) => confirm(question),
  },
  openBrowser,
  services: realServices(),
  onInterrupt(handler) {
    const onSigint = () => {
      void closeOpenReceivers();
      handler();
    };
    process.on("SIGINT", onSigint);
    return () => process.off("SIGINT", onSigint);
  },
  readLine,
  clearScreen() {
    cursorTo(process.stdout, 0, 0);
    clearScreenDown(process.stdout);
  },
};

const argv = process.argv.slice(2);
const code = await main(argv, io);
process.exitCode = code;
// After a Ctrl-C the login's callback receiver may still be listening; don't wait for it.
// A session may leave a cancelled run's work behind; leave when the session ends.
if (code === EXIT_CANCELLED || opensSession(argv, io)) process.exit(code);
