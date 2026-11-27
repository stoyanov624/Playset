import { createFileSettingsStore, type Env, type SettingsStore } from "../settings/index.js";
import { InvalidPortError, MissingClientIdError } from "./errors";

export type { Env };

export const DEFAULT_AUTH_PORT = 8888;

/** Where to put the client id when the settings do not come from a config file. */
const NO_CONFIG_FILE_HINT = "your Playset settings";

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

export interface ClientIdOptions {
  /** Names the redirect URI in the missing-client-id hint; also read for settings when no `settings` store is given. */
  env: Env;
  /** Defaults to ~/.config/playset/; used only when no `settings` store is given. */
  configDir?: string;
  /** Where the client id is read from. Defaults to the file store built from `env` and `configDir`. */
  settings?: SettingsStore;
}

/** The settings store for these options: the given one, or the file store over `env` and `configDir`. */
export function settingsStoreFor(opts: ClientIdOptions): SettingsStore {
  return (
    opts.settings ??
    createFileSettingsStore({ env: opts.env, ...(opts.configDir === undefined ? {} : { configDir: opts.configDir }) })
  );
}

/** SPOTIFY_CLIENT_ID first, then `spotifyClientId` in `<configDir>/config.json` (or the given SettingsStore). */
export async function resolveClientId(opts: ClientIdOptions): Promise<string> {
  const settings = settingsStoreFor(opts);
  const { spotifyClientId } = await settings.readSettings();
  if (spotifyClientId) return spotifyClientId;
  throw new MissingClientIdError(settings.configFilePath ?? NO_CONFIG_FILE_HINT, resolveRedirectUri(opts.env));
}
