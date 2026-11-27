/** Environment variables, as in `process.env`. A key set to undefined counts as unset. */
export type Env = Record<string, string | undefined>;

/** The user's Playset settings. A setting that is missing or blank is absent. */
export interface Settings {
  spotifyClientId?: string;
  setlistfmApiKey?: string;
}

/** The cached Spotify tokens. `expiresAt` is the access token's absolute expiry in epoch milliseconds. */
export interface SpotifyTokens {
  refreshToken: string;
  accessToken: string;
  expiresAt: number;
}

/** Where Playset reads its settings and keeps the Spotify token cache. */
export interface SettingsStore {
  /** Reads the settings afresh on every call. Never throws for missing or unusable sources. */
  readSettings(): Promise<Settings>;
  /** The cached Spotify tokens; undefined when there is no usable cache (one without a refresh token). */
  readSpotifyTokens(): Promise<SpotifyTokens | undefined>;
  /** Replaces the cached Spotify tokens. Never writes the settings. */
  writeSpotifyTokens(tokens: SpotifyTokens): Promise<void>;
  /** The config file the settings come from; undefined when they do not live on disk. */
  readonly configFilePath?: string;
}
