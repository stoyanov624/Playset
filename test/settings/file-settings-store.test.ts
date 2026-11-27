import { chmod, mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFileSettingsStore, type SpotifyTokens } from "../../src/core/settings/index.js";
import {
  CONFIG_FILE,
  ENV_API_KEY,
  ENV_CLIENT_ID,
  FILE_API_KEY,
  FILE_CLIENT_ID,
  NEWER_TOKENS,
  TOKENS,
  TOKEN_CACHE_FILE,
  canTestPermissions,
  captureRejection,
  exists,
  fileMode,
  makeTempRoot,
  readConfigFileRaw,
  readTokenCacheRaw,
  removeTempRoot,
  writeConfigFile,
  writeTokenCacheFile,
} from "./fixtures/temp-config";

let root: string;
let configDir: string;

beforeEach(async () => {
  root = await makeTempRoot();
  configDir = join(root, "nested", "playset");
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await removeTempRoot(root);
});

describe("file settings store: Spotify client id", () => {
  it("uses SPOTIFY_CLIENT_ID from the environment even when the config file also holds a client id", async () => {
    await writeConfigFile(configDir, JSON.stringify({ spotifyClientId: FILE_CLIENT_ID }));
    const store = createFileSettingsStore({ env: { SPOTIFY_CLIENT_ID: ENV_CLIENT_ID }, configDir });
    expect((await store.readSettings()).spotifyClientId).toBe(ENV_CLIENT_ID);
  });

  it("uses SPOTIFY_CLIENT_ID from the environment when there is no config file", async () => {
    const store = createFileSettingsStore({ env: { SPOTIFY_CLIENT_ID: ENV_CLIENT_ID }, configDir });
    expect((await store.readSettings()).spotifyClientId).toBe(ENV_CLIENT_ID);
  });

  it("falls back to spotifyClientId in config.json when SPOTIFY_CLIENT_ID is unset", async () => {
    await writeConfigFile(configDir, JSON.stringify({ spotifyClientId: FILE_CLIENT_ID }));
    const store = createFileSettingsStore({ env: {}, configDir });
    expect((await store.readSettings()).spotifyClientId).toBe(FILE_CLIENT_ID);
  });

  it("falls back to spotifyClientId in config.json when SPOTIFY_CLIENT_ID is empty", async () => {
    await writeConfigFile(configDir, JSON.stringify({ spotifyClientId: FILE_CLIENT_ID }));
    const store = createFileSettingsStore({ env: { SPOTIFY_CLIENT_ID: "" }, configDir });
    expect((await store.readSettings()).spotifyClientId).toBe(FILE_CLIENT_ID);
  });

  it("falls back to spotifyClientId in config.json when SPOTIFY_CLIENT_ID is only whitespace", async () => {
    await writeConfigFile(configDir, JSON.stringify({ spotifyClientId: FILE_CLIENT_ID }));
    const store = createFileSettingsStore({ env: { SPOTIFY_CLIENT_ID: "   " }, configDir });
    expect((await store.readSettings()).spotifyClientId).toBe(FILE_CLIENT_ID);
  });
});

describe("file settings store: setlist.fm API key", () => {
  it("uses SETLISTFM_API_KEY from the environment even when the config file also holds a key", async () => {
    await writeConfigFile(configDir, JSON.stringify({ setlistfmApiKey: FILE_API_KEY }));
    const store = createFileSettingsStore({ env: { SETLISTFM_API_KEY: ENV_API_KEY }, configDir });
    expect((await store.readSettings()).setlistfmApiKey).toBe(ENV_API_KEY);
  });

  it("uses SETLISTFM_API_KEY from the environment when there is no config file", async () => {
    const store = createFileSettingsStore({ env: { SETLISTFM_API_KEY: ENV_API_KEY }, configDir });
    expect((await store.readSettings()).setlistfmApiKey).toBe(ENV_API_KEY);
  });

  it("falls back to setlistfmApiKey in config.json when SETLISTFM_API_KEY is unset", async () => {
    await writeConfigFile(configDir, JSON.stringify({ setlistfmApiKey: FILE_API_KEY }));
    const store = createFileSettingsStore({ env: {}, configDir });
    expect((await store.readSettings()).setlistfmApiKey).toBe(FILE_API_KEY);
  });

  it("falls back to setlistfmApiKey in config.json when SETLISTFM_API_KEY is empty", async () => {
    await writeConfigFile(configDir, JSON.stringify({ setlistfmApiKey: FILE_API_KEY }));
    const store = createFileSettingsStore({ env: { SETLISTFM_API_KEY: "" }, configDir });
    expect((await store.readSettings()).setlistfmApiKey).toBe(FILE_API_KEY);
  });
});

describe("file settings store: both settings together", () => {
  it("reads both settings from one config.json", async () => {
    await writeConfigFile(
      configDir,
      JSON.stringify({ spotifyClientId: FILE_CLIENT_ID, setlistfmApiKey: FILE_API_KEY }),
    );
    const store = createFileSettingsStore({ env: {}, configDir });
    expect(await store.readSettings()).toEqual({ spotifyClientId: FILE_CLIENT_ID, setlistfmApiKey: FILE_API_KEY });
  });

  it("resolves each setting independently: one from the environment, the other from config.json", async () => {
    await writeConfigFile(
      configDir,
      JSON.stringify({ spotifyClientId: FILE_CLIENT_ID, setlistfmApiKey: FILE_API_KEY }),
    );
    const store = createFileSettingsStore({ env: { SETLISTFM_API_KEY: ENV_API_KEY }, configDir });
    expect(await store.readSettings()).toEqual({ spotifyClientId: FILE_CLIENT_ID, setlistfmApiKey: ENV_API_KEY });
  });

  it("trims surrounding whitespace from environment and config file values", async () => {
    await writeConfigFile(configDir, JSON.stringify({ setlistfmApiKey: `  ${FILE_API_KEY}\n` }));
    const store = createFileSettingsStore({ env: { SPOTIFY_CLIENT_ID: ` ${ENV_CLIENT_ID} ` }, configDir });
    expect(await store.readSettings()).toEqual({ spotifyClientId: ENV_CLIENT_ID, setlistfmApiKey: FILE_API_KEY });
  });

  const absentCases: Array<[string, string | null]> = [
    ["config.json is missing", null],
    ["config.json is not valid JSON", "{not json"],
    ["config.json has neither key", JSON.stringify({ somethingElse: "x" })],
    ["config.json has empty values", JSON.stringify({ spotifyClientId: "", setlistfmApiKey: "" })],
    ["config.json has whitespace-only values", JSON.stringify({ spotifyClientId: "  ", setlistfmApiKey: "\t" })],
    ["config.json holds JSON null", "null"],
    ["config.json holds a JSON array", "[]"],
    ["config.json holds non-string values", JSON.stringify({ spotifyClientId: 42, setlistfmApiKey: true })],
  ];

  for (const [label, content] of absentCases) {
    it(`reports both settings as absent, without throwing, when the environment is empty and ${label}`, async () => {
      if (content !== null) await writeConfigFile(configDir, content);
      const store = createFileSettingsStore({ env: {}, configDir });
      const settings = await store.readSettings();
      expect(settings.spotifyClientId).toBeUndefined();
      expect(settings.setlistfmApiKey).toBeUndefined();
    });
  }

  it("reports a setting as absent when its key is missing even though the other key is present", async () => {
    await writeConfigFile(configDir, JSON.stringify({ spotifyClientId: FILE_CLIENT_ID }));
    const store = createFileSettingsStore({ env: {}, configDir });
    const settings = await store.readSettings();
    expect(settings.spotifyClientId).toBe(FILE_CLIENT_ID);
    expect(settings.setlistfmApiKey).toBeUndefined();
  });

  it("reads the settings again on every call, so a key added to config.json later is picked up", async () => {
    const store = createFileSettingsStore({ env: {}, configDir });
    expect((await store.readSettings()).setlistfmApiKey).toBeUndefined();

    await writeConfigFile(configDir, JSON.stringify({ setlistfmApiKey: FILE_API_KEY }));
    expect((await store.readSettings()).setlistfmApiKey).toBe(FILE_API_KEY);

    await writeConfigFile(configDir, JSON.stringify({ setlistfmApiKey: "sfm-file-key-333" }));
    expect((await store.readSettings()).setlistfmApiKey).toBe("sfm-file-key-333");
  });
});

describe("file settings store: the config file is never written", () => {
  it("leaves an existing config.json byte-for-byte unchanged after reading settings and writing Spotify tokens", async () => {
    const content = JSON.stringify({ setlistfmApiKey: FILE_API_KEY, spotifyClientId: FILE_CLIENT_ID, extra: 1 });
    await writeConfigFile(configDir, content);
    const store = createFileSettingsStore({ env: {}, configDir });
    await store.readSettings();
    await store.writeSpotifyTokens(TOKENS);
    await store.readSettings();
    expect(await readConfigFileRaw(configDir)).toBe(content);
  });

  it("does not create config.json or the config directory when settings are read", async () => {
    const store = createFileSettingsStore({ env: {}, configDir });
    await store.readSettings();
    expect(await exists(configDir)).toBe(false);
  });

  it("does not create config.json when Spotify tokens are written", async () => {
    const store = createFileSettingsStore({ env: {}, configDir });
    await store.writeSpotifyTokens(TOKENS);
    expect(await readdir(configDir)).toEqual([TOKEN_CACHE_FILE]);
  });
});

describe("file settings store: where it reads from", () => {
  it("exposes configFilePath as <configDir>/config.json", () => {
    const store = createFileSettingsStore({ env: {}, configDir });
    expect(store.configFilePath).toBe(join(configDir, CONFIG_FILE));
  });

  it("uses only the injected env, not process.env, when env is supplied", async () => {
    vi.stubEnv("SPOTIFY_CLIENT_ID", "process-env-client-id");
    vi.stubEnv("SETLISTFM_API_KEY", "process-env-api-key");
    const store = createFileSettingsStore({ env: {}, configDir });
    expect(await store.readSettings()).toEqual({});
  });

  it("falls back to process.env when no env is supplied", async () => {
    vi.stubEnv("SPOTIFY_CLIENT_ID", ENV_CLIENT_ID);
    vi.stubEnv("SETLISTFM_API_KEY", ENV_API_KEY);
    const store = createFileSettingsStore({ configDir });
    expect(await store.readSettings()).toEqual({ spotifyClientId: ENV_CLIENT_ID, setlistfmApiKey: ENV_API_KEY });
  });

  it("reads and writes only under the injected config directory, never the HOME directory", async () => {
    const fakeHome = join(root, "home");
    await mkdir(fakeHome);
    vi.stubEnv("HOME", fakeHome);
    vi.stubEnv("USERPROFILE", fakeHome);
    await writeConfigFile(configDir, JSON.stringify({ spotifyClientId: FILE_CLIENT_ID }));

    const store = createFileSettingsStore({ env: { HOME: fakeHome }, configDir });
    expect((await store.readSettings()).spotifyClientId).toBe(FILE_CLIENT_ID);
    await store.writeSpotifyTokens(TOKENS);
    expect(await store.readSpotifyTokens()).toEqual(TOKENS);

    expect(await readdir(fakeHome)).toEqual([]);
    expect((await readdir(root)).sort()).toEqual(["home", "nested"]);
    expect(await readdir(join(root, "nested"))).toEqual(["playset"]);
    expect((await readdir(configDir)).sort()).toEqual([CONFIG_FILE, TOKEN_CACHE_FILE]);
  });
});

describe("file settings store: Spotify token cache", () => {
  it("returns undefined when there is no token cache", async () => {
    const store = createFileSettingsStore({ env: {}, configDir });
    expect(await store.readSpotifyTokens()).toBeUndefined();
  });

  it("reads a valid token cache from <configDir>/spotify-token.json", async () => {
    await writeTokenCacheFile(configDir, TOKENS);
    const store = createFileSettingsStore({ env: {}, configDir });
    expect(await store.readSpotifyTokens()).toEqual(TOKENS);
  });

  const unusable: Array<[string, string]> = [
    ["is not valid JSON", "not json"],
    ["is empty", ""],
    ["has no refresh token", JSON.stringify({ accessToken: "x" })],
    ["has an empty refresh token", JSON.stringify({ ...TOKENS, refreshToken: "" })],
    ["holds JSON null", "null"],
    ["holds a JSON array", "[]"],
  ];

  for (const [label, content] of unusable) {
    it(`returns undefined, without throwing, when the token cache ${label}`, async () => {
      await writeTokenCacheFile(configDir, content);
      const store = createFileSettingsStore({ env: {}, configDir });
      expect(await store.readSpotifyTokens()).toBeUndefined();
    });
  }

  it("writes the tokens as JSON {refreshToken, accessToken, expiresAt} to <configDir>/spotify-token.json", async () => {
    const store = createFileSettingsStore({ env: {}, configDir });
    await store.writeSpotifyTokens(TOKENS);
    const raw = await readTokenCacheRaw(configDir);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!)).toEqual(TOKENS);
  });

  it("round-trips written tokens through a new store on the same config directory", async () => {
    await createFileSettingsStore({ env: {}, configDir }).writeSpotifyTokens(TOKENS);
    const later = createFileSettingsStore({ env: {}, configDir });
    expect(await later.readSpotifyTokens()).toEqual(TOKENS);
  });

  it("replaces an existing token cache with the newly written tokens", async () => {
    await writeTokenCacheFile(configDir, TOKENS);
    const store = createFileSettingsStore({ env: {}, configDir });
    await store.writeSpotifyTokens(NEWER_TOKENS);
    expect(await store.readSpotifyTokens()).toEqual(NEWER_TOKENS);
    expect(JSON.parse((await readTokenCacheRaw(configDir))!)).toEqual(NEWER_TOKENS);
  });

  it("replaces a corrupt token cache when tokens are written", async () => {
    await writeTokenCacheFile(configDir, "not json");
    const store = createFileSettingsStore({ env: {}, configDir });
    await store.writeSpotifyTokens(TOKENS);
    expect(await store.readSpotifyTokens()).toEqual(TOKENS);
  });

  it("reads the token cache again on every call, so a change on disk is picked up", async () => {
    const store = createFileSettingsStore({ env: {}, configDir });
    expect(await store.readSpotifyTokens()).toBeUndefined();
    await writeTokenCacheFile(configDir, TOKENS);
    expect(await store.readSpotifyTokens()).toEqual(TOKENS);
    await writeTokenCacheFile(configDir, NEWER_TOKENS);
    expect(await store.readSpotifyTokens()).toEqual(NEWER_TOKENS);
  });

  it("leaves no temporary or extra files in the config directory after a write", async () => {
    const store = createFileSettingsStore({ env: {}, configDir });
    await store.writeSpotifyTokens(TOKENS);
    await store.writeSpotifyTokens(NEWER_TOKENS);
    expect(await readdir(configDir)).toEqual([TOKEN_CACHE_FILE]);
  });
});

describe.skipIf(!canTestPermissions)("file settings store: token cache permissions", () => {
  it("creates a missing config directory with mode 0700 and the token cache with mode 0600", async () => {
    const store = createFileSettingsStore({ env: {}, configDir });
    await store.writeSpotifyTokens(TOKENS);
    expect(await fileMode(configDir)).toBe(0o700);
    expect(await fileMode(join(configDir, TOKEN_CACHE_FILE))).toBe(0o600);
  });

  it("tightens an existing 0644 token cache to 0600 when it is overwritten", async () => {
    await writeTokenCacheFile(configDir, TOKENS, 0o644);
    expect(await fileMode(join(configDir, TOKEN_CACHE_FILE))).toBe(0o644);
    const store = createFileSettingsStore({ env: {}, configDir });
    await store.writeSpotifyTokens(NEWER_TOKENS);
    expect(await fileMode(join(configDir, TOKEN_CACHE_FILE))).toBe(0o600);
    expect(await store.readSpotifyTokens()).toEqual(NEWER_TOKENS);
  });

  it("never leaves a half-written token cache: when a write fails, the previous cache survives intact", async () => {
    await writeTokenCacheFile(configDir, TOKENS);
    const before = await readTokenCacheRaw(configDir);
    // A read-only directory refuses new files, so an atomic write (temp file + rename) has to fail.
    await chmod(configDir, 0o500);
    try {
      const store = createFileSettingsStore({ env: {}, configDir });
      const err = await captureRejection(store.writeSpotifyTokens(NEWER_TOKENS));
      expect(err).toBeInstanceOf(Error);
      expect(await readTokenCacheRaw(configDir)).toBe(before);
      expect(await store.readSpotifyTokens()).toEqual(TOKENS);
      expect(await readdir(configDir)).toEqual([TOKEN_CACHE_FILE]);
    } finally {
      await chmod(configDir, 0o700);
    }
  });
});

describe("file settings store: a write that throws before touching the disk", () => {
  it("keeps the existing valid token cache when the tokens cannot be serialised", async () => {
    await writeTokenCacheFile(configDir, TOKENS);
    const before = await readTokenCacheRaw(configDir);
    const store = createFileSettingsStore({ env: {}, configDir });
    const unserialisable = { ...NEWER_TOKENS, expiresAt: BigInt(1) } as unknown as SpotifyTokens;
    const err = await captureRejection(store.writeSpotifyTokens(unserialisable));
    expect(err).toBeInstanceOf(Error);
    expect(await readTokenCacheRaw(configDir)).toBe(before);
    expect(await store.readSpotifyTokens()).toEqual(TOKENS);
  });
});
