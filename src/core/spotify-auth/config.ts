import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { InvalidPortError, MissingClientIdError } from "./errors";

export type Env = Record<string, string | undefined>;

export const DEFAULT_AUTH_PORT = 8888;
export const CONFIG_FILE_NAME = "config.json";

export function defaultConfigDir(): string {
  return join(homedir(), ".config", "playset");
}

/** `http://127.0.0.1:<port>/callback`; port from PLAYSET_AUTH_PORT (default 8888). Never `localhost`. */
export function resolveRedirectUri(env: Env): string {
  const raw = env.PLAYSET_AUTH_PORT;
  let port = DEFAULT_AUTH_PORT;
  if (raw !== undefined) {
    const parsed = /^\d+$/.test(raw) ? Number(raw) : NaN;
    if (!(parsed >= 1 && parsed <= 65535)) throw new InvalidPortError(raw);
    port = parsed;
  }
  return `http://127.0.0.1:${port}/callback`;
}

/** SPOTIFY_CLIENT_ID first, then `spotifyClientId` in `<configDir>/config.json`. */
export async function resolveClientId(opts: { env: Env; configDir: string }): Promise<string> {
  const fromEnv = opts.env.SPOTIFY_CLIENT_ID;
  if (fromEnv) return fromEnv;

  const configFile = join(opts.configDir, CONFIG_FILE_NAME);
  const fromFile = await readClientIdFromConfig(configFile);
  if (fromFile) return fromFile;

  throw new MissingClientIdError(configFile, resolveRedirectUri(opts.env));
}

async function readClientIdFromConfig(configFile: string): Promise<string | undefined> {
  try {
    const parsed: unknown = JSON.parse(await readFile(configFile, "utf8"));
    if (parsed && typeof parsed === "object") {
      const value = (parsed as { spotifyClientId?: unknown }).spotifyClientId;
      if (typeof value === "string" && value !== "") return value;
    }
  } catch {
    // missing or unreadable config → treated as "no client id"
  }
  return undefined;
}
