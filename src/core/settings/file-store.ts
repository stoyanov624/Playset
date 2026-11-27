import { randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Env, Settings, SettingsStore, SpotifyTokens } from "./types.js";

const CONFIG_FILE_NAME = "config.json";
const TOKEN_CACHE_FILE_NAME = "spotify-token.json";

/** Each setting: its environment variable (checked first) and its key in config.json. */
const SOURCES: Record<keyof Settings, { envVar: string; configKey: string }> = {
  spotifyClientId: { envVar: "SPOTIFY_CLIENT_ID", configKey: "spotifyClientId" },
  setlistfmApiKey: { envVar: "SETLISTFM_API_KEY", configKey: "setlistfmApiKey" },
};

/** `~/.config/playset`, computed at call time. */
export function defaultConfigDir(): string {
  return join(homedir(), ".config", "playset");
}

/** The process environment; the default wherever no Env is supplied. */
export function processEnv(): Env {
  return process.env;
}

/**
 * Settings from the environment first, then `<configDir>/config.json` (read-only, never written);
 * Spotify tokens in `<configDir>/spotify-token.json`, written owner-only and atomically.
 */
export function createFileSettingsStore(options: { env?: Env; configDir?: string } = {}): SettingsStore {
  const env = options.env ?? processEnv();
  const configDir = options.configDir ?? defaultConfigDir();
  const configFilePath = join(configDir, CONFIG_FILE_NAME);
  const tokenCachePath = join(configDir, TOKEN_CACHE_FILE_NAME);

  return {
    configFilePath,

    async readSettings() {
      const config = await readJsonObject(configFilePath);
      const settings: Settings = {};
      for (const name of Object.keys(SOURCES) as Array<keyof Settings>) {
        const { envVar, configKey } = SOURCES[name];
        const value = present(env[envVar]) ?? present(config?.[configKey]);
        if (value !== undefined) settings[name] = value;
      }
      return settings;
    },

    async readSpotifyTokens() {
      const cache = await readJsonObject(tokenCachePath);
      if (!cache) return undefined;
      const { refreshToken, accessToken, expiresAt } = cache;
      if (typeof refreshToken !== "string" || refreshToken === "") return undefined;
      // Without a usable access token or expiry the tokens count as expired, so the refresh token gets used.
      const usableAccess = typeof accessToken === "string" && typeof expiresAt === "number" && Number.isFinite(expiresAt);
      return usableAccess ? { refreshToken, accessToken, expiresAt } : { refreshToken, accessToken: "", expiresAt: 0 };
    },

    async writeSpotifyTokens(tokens) {
      // Serialise first: a value that cannot be written must not touch the disk.
      const content = JSON.stringify(
        { refreshToken: tokens.refreshToken, accessToken: tokens.accessToken, expiresAt: tokens.expiresAt },
        null,
        2,
      );
      await mkdir(configDir, { recursive: true, mode: 0o700 });
      const temp = `${tokenCachePath}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
      try {
        await writeFile(temp, content, { mode: 0o600 });
        await chmod(temp, 0o600);
        await rename(temp, tokenCachePath);
      } catch (err) {
        await rm(temp, { force: true }).catch(() => {});
        throw err;
      }
    },
  };
}

/** The parsed JSON object in a file; undefined when it is missing, unreadable, not JSON, or not an object. */
async function readJsonObject(file: string): Promise<Record<string, unknown> | undefined> {
  try {
    const parsed: unknown = JSON.parse(await readFile(file, "utf8"));
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

/** A trimmed, non-blank string; anything else is absent. */
function present(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}
