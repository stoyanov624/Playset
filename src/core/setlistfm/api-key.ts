import { settingsStoreFor, type Env, type SettingsStore } from "../settings/index.js";
import { MissingSetlistFmApiKeyError } from "./errors.js";

export type { Env };

/** Where to put the key when the settings do not come from a config file. */
const NO_CONFIG_FILE_HINT = "your Playset settings";

export interface SetlistFmApiKeyOptions {
  /** Defaults to process.env; used only when no `settings` store is given. */
  env?: Env;
  /** Defaults to ~/.config/playset/; used only when no `settings` store is given. */
  configDir?: string;
  /** Where the key is read from. Defaults to the file store built from `env` and `configDir`. */
  settings?: SettingsStore;
}

/**
 * The setlist.fm API key: `SETLISTFM_API_KEY` first, then `setlistfmApiKey` in `<configDir>/config.json`
 * (or whatever the given SettingsStore holds). Read-only; never writes the config file.
 */
export async function resolveSetlistFmApiKey(opts: SetlistFmApiKeyOptions): Promise<string> {
  const settings = settingsStoreFor(opts);
  const { setlistfmApiKey } = await settings.readSettings();
  if (setlistfmApiKey) return setlistfmApiKey;
  throw new MissingSetlistFmApiKeyError(settings.configFilePath ?? NO_CONFIG_FILE_HINT);
}
