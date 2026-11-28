// Starts the web server: reads the config (from `.env` in the working directory too, where a variable
// already set and not empty wins), opens the SQLite file, builds the core's services once so every Visitor shares
// setlist.fm's and Spotify's request spacing, gives every preview and create the Host token kept in the
// SQLite file, and listens on 127.0.0.1 only.
import { chmodSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import Database from "better-sqlite3";
import {
  createMemorySettingsStore,
  createRunServices,
  exchangeAuthorizationCode,
  fetchSpotifyAccount,
  refreshAccessToken,
} from "../../core/index.js";
import {
  LISTEN_HOST,
  WebConfigError,
  createApp,
  createHostTokenSource,
  createRateLimitHitCounter,
  createSqliteStore,
  readWebConfig,
  type HostLogin,
  type Logger,
  type WebConfig,
} from "./index.js";

const CLIENT_DIR = fileURLToPath(new URL("../../../dist/web/", import.meta.url));

function environment(): Record<string, string | undefined> {
  const dotEnvFile = resolve(".env");
  const dotEnv = existsSync(dotEnvFile) ? parseEnv(readFileSync(dotEnvFile, "utf8")) : {};
  // A variable set but empty (as a service manager or `FOO= npm run web` leaves it) counts as unset, so
  // it never hides the value written in .env.
  const setInEnvironment = Object.entries(process.env).filter(([, value]) => value !== undefined && value !== "");
  return { ...dotEnv, ...Object.fromEntries(setInEnvironment) };
}

const logger: Logger = {
  info: (message, details) => console.info(message, ...(details === undefined ? [] : [details])),
  warn: (message, details) => console.warn(message, ...(details === undefined ? [] : [details])),
  error: (message, details) => console.error(message, ...(details === undefined ? [] : [details])),
};

function start(config: WebConfig): void {
  mkdirSync(dirname(resolve(config.dataFile)), { recursive: true });
  const { records, events, hostTokenStore } = createSqliteStore(new Database(config.dataFile));
  // The file holds the Host Account's refresh token: readable and writable by its owner only.
  chmodSync(config.dataFile, 0o600);
  const spotify = {
    fetch: (input: string, init?: RequestInit) => fetch(input, init),
    sleep: (ms: number) => new Promise<void>((done) => setTimeout(done, ms)),
    now: Date.now,
  };
  const clientId = config.spotifyClientId;
  const hostLogin: HostLogin = {
    exchangeCode: ({ code, codeVerifier, redirectUri }) =>
      exchangeAuthorizationCode(spotify, { clientId, redirectUri, code, codeVerifier }),
    fetchAccount: (accessToken) => fetchSpotifyAccount(spotify, accessToken),
    refresh: (refreshToken) => refreshAccessToken(spotify, { clientId, refreshToken }),
  };
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
    hostTokens: createHostTokenSource({
      store: hostTokenStore,
      login: hostLogin,
      hostAccountId: config.hostSpotifyId,
      now: Date.now,
      logger,
    }),
    rateLimitHits: createRateLimitHitCounter(),
    now: Date.now,
    logger,
    clientDir: CLIENT_DIR,
    hostTokenStore,
    hostLogin,
  });
  // Express hands a listen failure to this callback too. A port already in use is a setup problem, so it
  // gets one clear line instead of a stack.
  const server = app.listen(config.port, LISTEN_HOST, (error?: NodeJS.ErrnoException) => {
    if (error !== undefined) {
      const reason = error.code === "EADDRINUSE" ? `port ${config.port} is already in use` : error.message;
      logger.error(`Playset can't start: ${reason}.`);
      process.exitCode = 1;
      return;
    }
    logger.info(`Playset web is running at http://${LISTEN_HOST}:${config.port}`);
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
