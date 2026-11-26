// AC-4 default: with no config directory supplied, the key is read from ~/.config/playset/config.json.
// The home directory is redirected to a temp dir so the user's real ~/.config is never touched.
import { rmSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Created before any import so a default computed at module load also sees the fake home.
const fake = await vi.hoisted(async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const base = process.env.TMPDIR || "/tmp";
  return { home: fs.mkdtempSync(path.join(base, "playset-home-")) };
});

vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  const homedir = () => fake.home;
  return { ...actual, default: { ...actual, homedir }, homedir };
});
vi.mock("os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("os")>();
  const homedir = () => fake.home;
  return { ...actual, default: { ...actual, homedir }, homedir };
});

import { MissingSetlistFmApiKeyError, resolveSetlistFmApiKey } from "../../src/core/setlistfm";
import { FILE_KEY, captureError, writeConfigFile } from "./helpers";

beforeAll(() => {
  vi.stubEnv("HOME", fake.home);
  vi.stubEnv("USERPROFILE", fake.home);
});

afterAll(() => {
  vi.unstubAllEnvs();
  rmSync(fake.home, { recursive: true, force: true });
});

describe("setlist.fm API key: default config directory", () => {
  it("AC-4: with no config directory supplied, the missing-API-key hint names ~/.config/playset/config.json", async () => {
    const err = await captureError(resolveSetlistFmApiKey({ env: {} }));
    expect(err).toBeInstanceOf(MissingSetlistFmApiKeyError);
    expect((err as MissingSetlistFmApiKeyError).hint).toContain(join(fake.home, ".config", "playset", "config.json"));
  });

  it("AC-4: with no config directory supplied, the key is read from ~/.config/playset/config.json", async () => {
    await writeConfigFile(join(fake.home, ".config", "playset"), JSON.stringify({ setlistfmApiKey: FILE_KEY }));
    expect(await resolveSetlistFmApiKey({ env: {} })).toBe(FILE_KEY);
  });
});
