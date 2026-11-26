import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MissingSetlistFmApiKeyError, resolveSetlistFmApiKey } from "../../src/core/setlistfm";
import {
  API_KEY,
  CONFIG_FILE,
  ENV_KEY,
  FILE_KEY,
  SPOTIFY_CLIENT_ID,
  captureError,
  emptySetlist,
  errorText,
  makeChooser,
  makeClient,
  makeFakes,
  makeTempRoot,
  ok,
  removeTempRoot,
  writeConfigFile,
} from "./helpers";

let root: string;
let configDir: string;

beforeEach(async () => {
  root = await makeTempRoot();
  configDir = join(root, "playset");
});

afterEach(async () => {
  await removeTempRoot(root);
});

describe("setlist.fm API key", () => {
  it("AC-1: uses SETLISTFM_API_KEY from the environment even when the config file also holds a key", async () => {
    await writeConfigFile(configDir, JSON.stringify({ setlistfmApiKey: FILE_KEY }));
    const key = await resolveSetlistFmApiKey({ env: { SETLISTFM_API_KEY: ENV_KEY }, configDir });
    expect(key).toBe(ENV_KEY);
  });

  it("AC-1: uses SETLISTFM_API_KEY from the environment when there is no config file", async () => {
    const key = await resolveSetlistFmApiKey({ env: { SETLISTFM_API_KEY: ENV_KEY }, configDir });
    expect(key).toBe(ENV_KEY);
  });

  it("AC-1: a client sends the environment key, not the config file key", async () => {
    await writeConfigFile(configDir, JSON.stringify({ setlistfmApiKey: FILE_KEY }));
    const fakes = makeFakes([ok(emptySetlist("63a5e2b7"))]);
    const client = makeClient(fakes, { env: { SETLISTFM_API_KEY: ENV_KEY }, configDir });
    await client.getSetlist("63a5e2b7");
    expect(fakes.requests[0]?.headers.get("x-api-key")).toBe(ENV_KEY);
  });

  it("AC-2: uses setlistfmApiKey from the config file when SETLISTFM_API_KEY is unset, ignoring other keys", async () => {
    await writeConfigFile(
      configDir,
      JSON.stringify({ setlistfmApiKey: FILE_KEY, spotifyClientId: SPOTIFY_CLIENT_ID }),
    );
    const key = await resolveSetlistFmApiKey({ env: {}, configDir });
    expect(key).toBe(FILE_KEY);
  });

  it("AC-2: uses setlistfmApiKey from the config file when SETLISTFM_API_KEY is empty", async () => {
    await writeConfigFile(configDir, JSON.stringify({ setlistfmApiKey: FILE_KEY }));
    const key = await resolveSetlistFmApiKey({ env: { SETLISTFM_API_KEY: "" }, configDir });
    expect(key).toBe(FILE_KEY);
  });

  it("AC-2: leaves the config file, including spotifyClientId, unchanged", async () => {
    const content = JSON.stringify({ setlistfmApiKey: FILE_KEY, spotifyClientId: SPOTIFY_CLIENT_ID });
    await writeConfigFile(configDir, content);
    await resolveSetlistFmApiKey({ env: {}, configDir });
    const fakes = makeFakes([ok(emptySetlist("63a5e2b7"))]);
    await makeClient(fakes, { env: {}, configDir }).getSetlist("63a5e2b7");
    expect(await readFile(join(configDir, CONFIG_FILE), "utf8")).toBe(content);
  });

  it("AC-2: a client sends the config file key when the environment has none", async () => {
    await writeConfigFile(configDir, JSON.stringify({ setlistfmApiKey: FILE_KEY }));
    const fakes = makeFakes([ok(emptySetlist("63a5e2b7"))]);
    await makeClient(fakes, { env: {}, configDir }).getSetlist("63a5e2b7");
    expect(fakes.requests[0]?.headers.get("x-api-key")).toBe(FILE_KEY);
  });

  const missingCases: Array<[string, string | null]> = [
    ["the config file is missing", null],
    ["the config file has no setlistfmApiKey", JSON.stringify({ spotifyClientId: SPOTIFY_CLIENT_ID })],
    ["the config file has an empty setlistfmApiKey", JSON.stringify({ setlistfmApiKey: "" })],
    ["the config file is not valid JSON", "{not json"],
  ];

  for (const [label, content] of missingCases) {
    it(`AC-3: raises a missing-API-key error when SETLISTFM_API_KEY is unset and ${label}`, async () => {
      if (content !== null) await writeConfigFile(configDir, content);
      const err = await captureError(resolveSetlistFmApiKey({ env: {}, configDir }));
      expect(err).toBeInstanceOf(MissingSetlistFmApiKeyError);
    });
  }

  it("AC-3: fetching a Setlist without a key raises the missing-API-key error before any request", async () => {
    const fakes = makeFakes([ok(emptySetlist("63a5e2b7"))]);
    const err = await captureError(makeClient(fakes, { env: {}, configDir }).getSetlist("63a5e2b7"));
    expect(err).toBeInstanceOf(MissingSetlistFmApiKeyError);
    expect(fakes.fetch).not.toHaveBeenCalled();
  });

  it("AC-3: looking up an Artist without a key raises the missing-API-key error before any request", async () => {
    const fakes = makeFakes([]);
    const { chooser } = makeChooser(0);
    const client = makeClient(fakes, { env: { SETLISTFM_API_KEY: "" }, configDir });
    const err1 = await captureError(client.findArtist("Arctic Monkeys", chooser));
    expect(err1).toBeInstanceOf(MissingSetlistFmApiKeyError);
    const err2 = await captureError(client.findLatestSetlistByArtistName("Arctic Monkeys", chooser));
    expect(err2).toBeInstanceOf(MissingSetlistFmApiKeyError);
    expect(fakes.fetch).not.toHaveBeenCalled();
    expect(chooser).not.toHaveBeenCalled();
  });

  it("AC-3: the missing-API-key hint names where to get a key, SETLISTFM_API_KEY and the config file with setlistfmApiKey", async () => {
    const err = await captureError(resolveSetlistFmApiKey({ env: {}, configDir }));
    expect(err).toBeInstanceOf(MissingSetlistFmApiKeyError);
    const hint = (err as MissingSetlistFmApiKeyError).hint;
    expect(typeof hint).toBe("string");
    expect(hint).toContain("https://www.setlist.fm/settings/api");
    expect(hint).toContain("SETLISTFM_API_KEY");
    expect(hint).toContain(join(configDir, CONFIG_FILE));
    expect(hint).toContain("setlistfmApiKey");
  });

  it("AC-4: reads only <configDir>/config.json from the supplied config directory", async () => {
    const otherDir = join(root, "other");
    await writeConfigFile(otherDir, JSON.stringify({ setlistfmApiKey: "sfm-other-key-999" }));
    await writeConfigFile(configDir, JSON.stringify({ setlistfmApiKey: FILE_KEY }));
    expect(await resolveSetlistFmApiKey({ env: {}, configDir })).toBe(FILE_KEY);
    expect(await resolveSetlistFmApiKey({ env: {}, configDir: otherDir })).toBe("sfm-other-key-999");
  });

  it("AC-4: with a supplied config directory and no key there, the hint points at that directory, not ~/.config/playset", async () => {
    const err = await captureError(resolveSetlistFmApiKey({ env: {}, configDir }));
    const text = errorText(err);
    expect(text).toContain(join(configDir, CONFIG_FILE));
    expect(text).not.toContain(join(".config", "playset", CONFIG_FILE));
  });

  it("AC-11: the missing-API-key error never contains a key", async () => {
    await writeConfigFile(configDir, JSON.stringify({ setlistfmApiKey: "" }));
    const err = await captureError(resolveSetlistFmApiKey({ env: { SETLISTFM_API_KEY: "" }, configDir }));
    expect(err).toBeInstanceOf(MissingSetlistFmApiKeyError);
    expect(errorText(err)).not.toContain(API_KEY);
  });
});
