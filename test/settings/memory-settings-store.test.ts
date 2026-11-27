import { describe, expect, it } from "vitest";
import { createMemorySettingsStore, type SettingsStore } from "../../src/core/settings/index.js";
import { ENV_API_KEY, ENV_CLIENT_ID, NEWER_TOKENS, TOKENS } from "./fixtures/temp-config";

describe("memory settings store", () => {
  it("returns empty settings and no Spotify tokens when created with nothing", async () => {
    const store = createMemorySettingsStore();
    const settings = await store.readSettings();
    expect(settings.spotifyClientId).toBeUndefined();
    expect(settings.setlistfmApiKey).toBeUndefined();
    expect(await store.readSpotifyTokens()).toBeUndefined();
  });

  it("returns the settings it was given", async () => {
    const store = createMemorySettingsStore({
      settings: { spotifyClientId: ENV_CLIENT_ID, setlistfmApiKey: ENV_API_KEY },
    });
    expect(await store.readSettings()).toEqual({ spotifyClientId: ENV_CLIENT_ID, setlistfmApiKey: ENV_API_KEY });
  });

  it("returns only the setting it was given when the other is left out", async () => {
    const store = createMemorySettingsStore({ settings: { setlistfmApiKey: ENV_API_KEY } });
    const settings = await store.readSettings();
    expect(settings.setlistfmApiKey).toBe(ENV_API_KEY);
    expect(settings.spotifyClientId).toBeUndefined();
  });

  it("returns the Spotify tokens it was given", async () => {
    const store = createMemorySettingsStore({ tokens: TOKENS });
    expect(await store.readSpotifyTokens()).toEqual(TOKENS);
  });

  it("round-trips Spotify tokens: what is written is what is read back", async () => {
    const store = createMemorySettingsStore();
    await store.writeSpotifyTokens(TOKENS);
    expect(await store.readSpotifyTokens()).toEqual(TOKENS);
  });

  it("replaces earlier Spotify tokens with the newly written ones", async () => {
    const store = createMemorySettingsStore({ tokens: TOKENS });
    await store.writeSpotifyTokens(NEWER_TOKENS);
    expect(await store.readSpotifyTokens()).toEqual(NEWER_TOKENS);
  });

  it("keeps the settings unchanged when Spotify tokens are written", async () => {
    const store = createMemorySettingsStore({ settings: { spotifyClientId: ENV_CLIENT_ID } });
    await store.writeSpotifyTokens(TOKENS);
    expect((await store.readSettings()).spotifyClientId).toBe(ENV_CLIENT_ID);
  });

  it("keeps separate stores independent of each other", async () => {
    const a = createMemorySettingsStore();
    const b = createMemorySettingsStore();
    await a.writeSpotifyTokens(TOKENS);
    expect(await b.readSpotifyTokens()).toBeUndefined();
  });

  it("has no config file path, since nothing lives on disk", () => {
    const store: SettingsStore = createMemorySettingsStore();
    expect(store.configFilePath).toBeUndefined();
  });
});
