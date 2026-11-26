import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { MissingSetlistFmApiKeyError } from "./errors.js";

export type Env = Record<string, string | undefined>;

export const SETLISTFM_API_KEY_ENV = "SETLISTFM_API_KEY";
const CONFIG_FILE = "config.json";
const CONFIG_KEY = "setlistfmApiKey";

/** `~/.config/playset`, computed at call time. */
export function defaultConfigDir(): string {
  return join(homedir(), ".config", "playset");
}

/**
 * The setlist.fm API key: `SETLISTFM_API_KEY` first, then `setlistfmApiKey`
 * in `<configDir>/config.json`. Read-only; never writes the config file.
 */
export async function resolveSetlistFmApiKey(opts: { env: Env; configDir?: string }): Promise<string> {
  const fromEnv = opts.env[SETLISTFM_API_KEY_ENV];
  if (fromEnv) return fromEnv;

  const configFile = join(opts.configDir ?? defaultConfigDir(), CONFIG_FILE);
  const fromFile = await readKeyFromConfig(configFile);
  if (fromFile) return fromFile;

  throw new MissingSetlistFmApiKeyError(configFile);
}

async function readKeyFromConfig(configFile: string): Promise<string | undefined> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(configFile, "utf8"));
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null) return undefined;
  const value = (parsed as Record<string, unknown>)[CONFIG_KEY];
  return typeof value === "string" && value !== "" ? value : undefined;
}
