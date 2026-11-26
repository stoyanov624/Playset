// The real `playset` entry: wires the terminal, the browser and the real setlist.fm/Spotify adapters to main().
import { spawn } from "node:child_process";
import { confirm, select } from "@inquirer/prompts";
import {
  createSetlistFmClient,
  createSetlistPlaylist,
  createSpotifyTrackSearch,
  findPlaylistsNamed,
  getAccessToken,
  matchPerformance,
  startLoopbackReceiver,
} from "../core/index.js";
import type { RunServices } from "../core/run/index.js";
import { EXIT_CANCELLED, browserCommandFor, main, type CliIo } from "./main.js";

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

function realServices(): RunServices {
  let setlistFm: ReturnType<typeof createSetlistFmClient> | undefined;
  // Created on first use, so a missing API key is reported only when setlist.fm is needed.
  const setlistFmClient = () => (setlistFm ??= createSetlistFmClient({ fetch, sleep, now, env }));

  return {
    getSetlist: (setlistId) => setlistFmClient().getSetlist(setlistId),
    findLatestSetlistByArtistName: (name, chooser) => setlistFmClient().findLatestSetlistByArtistName(name, chooser),
    getAccessToken: ({ openAuthorizeUrl }) =>
      getAccessToken({ fetch, sleep, now, env, openAuthorizeUrl, startCallbackReceiver: startLoopbackReceiver }),
    findMatch: (performance, accessToken) => matchPerformance(performance, createSpotifyTrackSearch({ accessToken })),
    findPlaylistsNamed: (name, accessToken) => findPlaylistsNamed(name, { accessToken }),
    createSetlistPlaylist: (show, matches, options) => createSetlistPlaylist(show, matches, options),
  };
}

const io: CliIo = {
  stdout: process.stdout,
  stderr: process.stderr,
  env,
  prompts: {
    select: (question) => select(question),
    confirm: (question) => confirm(question),
  },
  openBrowser,
  services: realServices(),
  onInterrupt(handler) {
    process.on("SIGINT", handler);
    return () => process.off("SIGINT", handler);
  },
};

const code = await main(process.argv.slice(2), io);
process.exitCode = code;
// After a Ctrl-C the login's callback receiver may still be listening; don't wait for it.
if (code === EXIT_CANCELLED) process.exit(code);
