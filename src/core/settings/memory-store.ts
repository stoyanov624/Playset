import type { Settings, SettingsStore, SpotifyTokens } from "./types.js";

/** A SettingsStore held in memory, for tests and front-ends that keep settings elsewhere. */
export function createMemorySettingsStore(initial: { settings?: Settings; tokens?: SpotifyTokens } = {}): SettingsStore {
  const settings: Settings = { ...initial.settings };
  let tokens: SpotifyTokens | undefined = initial.tokens && { ...initial.tokens };
  return {
    readSettings: async () => ({ ...settings }),
    readSpotifyTokens: async () => tokens && { ...tokens },
    writeSpotifyTokens: async (next) => {
      tokens = { ...next };
    },
  };
}
