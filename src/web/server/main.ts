// Starts the web server: reads the config (from `.env` in the working directory too, where a variable
// already set wins), opens the SQLite file, builds the core's services once so every Visitor shares
// setlist.fm's and Spotify's request spacing, and listens on 127.0.0.1 only.
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import Database from "better-sqlite3";
import { createMemorySettingsStore, createRunServices } from "../../core/index.js";
import {
  WebConfigError,
  createApp,
  createRateLimitHitCounter,
  createSqliteStore,
  notConnectedHostTokenSource,
  readWebConfig,
  type Logger,
  type WebConfig,
} from "./index.js";

const HOST = "127.0.0.1";
const CLIENT_DIR = fileURLToPath(new URL("../../../dist/web/", import.meta.url));

function environment(): Record<string, string | undefined> {
  const dotEnvFile = resolve(".env");
  const dotEnv = existsSync(dotEnvFile) ? parseEnv(readFileSync(dotEnvFile, "utf8")) : {};
  return { ...dotEnv, ...process.env };
}

const logger: Logger = {
  info: (message, details) => console.info(message, ...(details === undefined ? [] : [details])),
  warn: (message, details) => console.warn(message, ...(details === undefined ? [] : [details])),
  error: (message, details) => console.error(message, ...(details === undefined ? [] : [details])),
};

function start(config: WebConfig): void {
  mkdirSync(dirname(resolve(config.dataFile)), { recursive: true });
  const { records, events } = createSqliteStore(new Database(config.dataFile));
  const services = createRunServices({
    env: {},
    settings: createMemorySettingsStore({
      settings: { setlistfmApiKey: config.setlistFmApiKey, spotifyClientId: config.spotifyClientId },
    }),
    // The Host Account logs in through the admin pages, never through a loopback login on this machine.
    startCallbackReceiver: async () => {
      throw new Error("The web server has no Spotify loopback login.");
    },
  });
  const app = createApp({
    config,
    services,
    records,
    events,
    hostTokens: notConnectedHostTokenSource,
    rateLimitHits: createRateLimitHitCounter(),
    now: Date.now,
    logger,
    clientDir: CLIENT_DIR,
  });
  // Express hands a listen failure to this callback too. A port already in use is a setup problem, so it
  // gets one clear line instead of a stack.
  const server = app.listen(config.port, HOST, (error?: NodeJS.ErrnoException) => {
    if (error !== undefined) {
      const reason = error.code === "EADDRINUSE" ? `port ${config.port} is already in use` : error.message;
      logger.error(`Playset can't start: ${reason}.`);
      process.exitCode = 1;
      return;
    }
    logger.info(`Playset web is running at http://${HOST}:${config.port}`);
  });
  // A service manager stops the server with SIGTERM: let running requests finish, then exit.
  process.once("SIGTERM", () => {
    server.close();
  });
}

try {
  start(readWebConfig(environment()));
} catch (error) {
  if (!(error instanceof WebConfigError)) throw error;
  logger.error(error.message);
  process.exitCode = 1;
}
