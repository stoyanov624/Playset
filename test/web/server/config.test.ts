// The web server's config, read from an env object (X1), and the entry file refusing to start
// on a bad config. readWebConfig's result is what createApp is given.
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { WebConfigError, readWebConfig } from "../../../src/web/server/index.js";
import { CLIENT_ID, COOKIE_SECRET, HOST_ID, REQUIRED_ENV, SETLISTFM_KEY } from "./fixtures/harness";

const defaults = {
  setlistFmApiKey: SETLISTFM_KEY,
  spotifyClientId: CLIENT_ID,
  hostSpotifyId: HOST_ID,
  cookieSecret: COOKIE_SECRET,
  port: 3000,
  dataFile: "./data/playset.db",
  previewLimit: 30,
  createLimit: 10,
  dailyLimit: 200,
  trustProxy: false,
};

function configError(env: Record<string, string>): WebConfigError {
  try {
    readWebConfig(env);
  } catch (err) {
    expect(err).toBeInstanceOf(WebConfigError);
    return err as WebConfigError;
  }
  throw new Error("expected readWebConfig to throw");
}

describe("readWebConfig — values and defaults (AC-1)", () => {
  it("AC-1: only the four required values → port 3000, ./data/playset.db, limits 30 / 10 / 200, trust proxy off", () => {
    expect(readWebConfig({ ...REQUIRED_ENV })).toStrictEqual(defaults);
  });

  it("AC-1: every optional value set → those values", () => {
    const config = readWebConfig({
      ...REQUIRED_ENV,
      PLAYSET_WEB_PORT: "8080",
      PLAYSET_PREVIEW_LIMIT: "5",
      PLAYSET_CREATE_LIMIT: "2",
      PLAYSET_DAILY_LIMIT: "50",
      PLAYSET_WEB_DATA: "/var/lib/playset/web.db",
      PLAYSET_TRUST_PROXY: "1",
    });
    expect(config).toStrictEqual({
      ...defaults,
      port: 8080,
      previewLimit: 5,
      createLimit: 2,
      dailyLimit: 50,
      dataFile: "/var/lib/playset/web.db",
      trustProxy: true,
    });
  });

  it('AC-1: values are trimmed: PLAYSET_WEB_PORT=" 8080 " → 8080, a padded key → the key', () => {
    const config = readWebConfig({
      ...REQUIRED_ENV,
      SETLISTFM_API_KEY: `  ${SETLISTFM_KEY}\n`,
      PLAYSET_WEB_PORT: " 8080 ",
      PLAYSET_DAILY_LIMIT: " 7 ",
    });
    expect(config.port).toBe(8080);
    expect(config.setlistFmApiKey).toBe(SETLISTFM_KEY);
    expect(config.dailyLimit).toBe(7);
  });

  it.each([
    ["empty", ""],
    ["whitespace-only", "   "],
  ])("AC-1: an %s optional value takes its default", (_why, value) => {
    const config = readWebConfig({
      ...REQUIRED_ENV,
      PLAYSET_WEB_PORT: value,
      PLAYSET_WEB_DATA: value,
      PLAYSET_PREVIEW_LIMIT: value,
      PLAYSET_CREATE_LIMIT: value,
      PLAYSET_DAILY_LIMIT: value,
      PLAYSET_TRUST_PROXY: value,
    });
    expect(config).toStrictEqual(defaults);
  });

  it("AC-1: a cookie secret of exactly 32 characters after trimming is accepted", () => {
    const secret = "a".repeat(32);
    expect(readWebConfig({ ...REQUIRED_ENV, PLAYSET_COOKIE_SECRET: ` ${secret} ` }).cookieSecret).toBe(secret);
  });

  it("AC-1: the edges of the whole-number rules are accepted (port 1 and 65535, limits of 1)", () => {
    expect(readWebConfig({ ...REQUIRED_ENV, PLAYSET_WEB_PORT: "1" }).port).toBe(1);
    expect(readWebConfig({ ...REQUIRED_ENV, PLAYSET_WEB_PORT: "65535" }).port).toBe(65535);
    const config = readWebConfig({
      ...REQUIRED_ENV,
      PLAYSET_PREVIEW_LIMIT: "1",
      PLAYSET_CREATE_LIMIT: "1",
      PLAYSET_DAILY_LIMIT: "1",
    });
    expect([config.previewLimit, config.createLimit, config.dailyLimit]).toEqual([1, 1, 1]);
  });

  it("AC-1: env keys the server doesn't know are ignored", () => {
    expect(readWebConfig({ ...REQUIRED_ENV, PLAYSET_AUTH_PORT: "8888", HOME: "/home/visitor" })).toStrictEqual(defaults);
  });
});

describe("readWebConfig — refusing a bad config (AC-2)", () => {
  it("AC-2: an empty env → WebConfigError listing the four missing values in table order", () => {
    const err = configError({});
    expect(err.message).toBe(
      "Playset can't start: Missing SETLISTFM_API_KEY. Missing SPOTIFY_CLIENT_ID. Missing PLAYSET_HOST_SPOTIFY_ID. Missing PLAYSET_COOKIE_SECRET.",
    );
  });

  it.each([
    ["SETLISTFM_API_KEY", "   ", "Missing SETLISTFM_API_KEY."],
    ["SPOTIFY_CLIENT_ID", "", "Missing SPOTIFY_CLIENT_ID."],
    ["PLAYSET_HOST_SPOTIFY_ID", " \t", "Missing PLAYSET_HOST_SPOTIFY_ID."],
    ["PLAYSET_COOKIE_SECRET", "short-secret", "PLAYSET_COOKIE_SECRET must be at least 32 characters."],
    ["PLAYSET_COOKIE_SECRET", ` ${"b".repeat(31)} `, "PLAYSET_COOKIE_SECRET must be at least 32 characters."],
    ["PLAYSET_WEB_PORT", "0", "PLAYSET_WEB_PORT must be a whole number from 1 to 65535."],
    ["PLAYSET_WEB_PORT", "65536", "PLAYSET_WEB_PORT must be a whole number from 1 to 65535."],
    ["PLAYSET_WEB_PORT", "80a", "PLAYSET_WEB_PORT must be a whole number from 1 to 65535."],
    ["PLAYSET_WEB_PORT", "8080.5", "PLAYSET_WEB_PORT must be a whole number from 1 to 65535."],
    ["PLAYSET_WEB_PORT", "+8080", "PLAYSET_WEB_PORT must be a whole number from 1 to 65535."],
    ["PLAYSET_WEB_PORT", "1e3", "PLAYSET_WEB_PORT must be a whole number from 1 to 65535."],
    ["PLAYSET_PREVIEW_LIMIT", "0", "PLAYSET_PREVIEW_LIMIT must be a whole number of 1 or more."],
    ["PLAYSET_PREVIEW_LIMIT", "-1", "PLAYSET_PREVIEW_LIMIT must be a whole number of 1 or more."],
    ["PLAYSET_PREVIEW_LIMIT", "ten", "PLAYSET_PREVIEW_LIMIT must be a whole number of 1 or more."],
    ["PLAYSET_CREATE_LIMIT", "1.5", "PLAYSET_CREATE_LIMIT must be a whole number of 1 or more."],
    ["PLAYSET_DAILY_LIMIT", "abc", "PLAYSET_DAILY_LIMIT must be a whole number of 1 or more."],
    ["PLAYSET_TRUST_PROXY", "yes", "PLAYSET_TRUST_PROXY must be 0 or 1."],
    ["PLAYSET_TRUST_PROXY", "2", "PLAYSET_TRUST_PROXY must be 0 or 1."],
  ])("AC-2: %s=%j → %s", (name, value, sentence) => {
    const err = configError({ ...REQUIRED_ENV, [name]: value });
    expect(err.message).toBe(`Playset can't start: ${sentence}`);
    if (value.trim() !== "") expect(err.message).not.toContain(value.trim());
  });

  it("AC-2: two problems → both sentences in the table's order; no value from the env in the message", () => {
    const err = configError({ ...REQUIRED_ENV, PLAYSET_WEB_PORT: "0", PLAYSET_COOKIE_SECRET: "short-secret" });
    expect(err.message).toBe(
      "Playset can't start: PLAYSET_COOKIE_SECRET must be at least 32 characters. PLAYSET_WEB_PORT must be a whole number from 1 to 65535.",
    );
    expect(err.message).not.toContain("short-secret");
    expect(err.message).not.toContain(SETLISTFM_KEY);
    expect(err.message).not.toContain(CLIENT_ID);
    expect(err.message).not.toContain(HOST_ID);
  });

  it("AC-2: every problem at once, in the table's order", () => {
    const err = configError({
      SPOTIFY_CLIENT_ID: CLIENT_ID,
      PLAYSET_COOKIE_SECRET: "short-secret",
      PLAYSET_WEB_PORT: "65536",
      PLAYSET_PREVIEW_LIMIT: "0",
      PLAYSET_CREATE_LIMIT: "1.5",
      PLAYSET_DAILY_LIMIT: "abc",
      PLAYSET_TRUST_PROXY: "yes",
    });
    expect(err.message).toBe(
      "Playset can't start: Missing SETLISTFM_API_KEY. Missing PLAYSET_HOST_SPOTIFY_ID. " +
        "PLAYSET_COOKIE_SECRET must be at least 32 characters. " +
        "PLAYSET_WEB_PORT must be a whole number from 1 to 65535. " +
        "PLAYSET_PREVIEW_LIMIT must be a whole number of 1 or more. " +
        "PLAYSET_CREATE_LIMIT must be a whole number of 1 or more. " +
        "PLAYSET_DAILY_LIMIT must be a whole number of 1 or more. " +
        "PLAYSET_TRUST_PROXY must be 0 or 1.",
    );
    expect(err.message).not.toContain(CLIENT_ID);
  });

  it("AC-2: WebConfigError is an Error", () => {
    expect(configError({})).toBeInstanceOf(Error);
  });
});

// ---------------------------------------------------------------- the entry file

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const entryFile = join(repoRoot, "src", "web", "server", "main.ts");
const tsx = join(repoRoot, "node_modules", ".bin", "tsx");

/** Runs the entry file in an empty folder with only `env` (and PATH); never waits more than 30 s. */
function runEntry(env: Record<string, string>, dotEnv?: string) {
  const cwd = mkdtempSync(join(tmpdir(), "playset-web-entry-"));
  if (dotEnv !== undefined) writeFileSync(join(cwd, ".env"), dotEnv);
  const result = spawnSync(tsx, [entryFile], {
    cwd,
    env: { PATH: process.env.PATH ?? "", HOME: cwd, ...env },
    encoding: "utf8",
    timeout: 30_000,
  });
  return { status: result.status, output: `${result.stdout}\n${result.stderr}`, stderr: result.stderr };
}

describe("the entry file with a bad config (AC-2)", () => {
  it("AC-2: no config at all → logs the WebConfigError message as an error and exits with code 1 without listening", () => {
    const run = runEntry({});
    expect(run.stderr).toContain(
      "Playset can't start: Missing SETLISTFM_API_KEY. Missing SPOTIFY_CLIENT_ID. Missing PLAYSET_HOST_SPOTIFY_ID. Missing PLAYSET_COOKIE_SECRET.",
    );
    expect(run.status).toBe(1);
    expect(run.output).not.toContain("Playset web is running at");
  }, 40_000);

  it("AC-2: .env in the working directory is read, and a variable already set wins over it", () => {
    const dotEnv = [
      `SETLISTFM_API_KEY=${SETLISTFM_KEY}`,
      `SPOTIFY_CLIENT_ID=${CLIENT_ID}`,
      `PLAYSET_HOST_SPOTIFY_ID=${HOST_ID}`,
      "PLAYSET_COOKIE_SECRET=short-secret",
      "PLAYSET_WEB_PORT=3000",
    ].join("\n");
    const run = runEntry({ PLAYSET_WEB_PORT: "0" }, dotEnv);
    expect(run.stderr).toContain(
      "Playset can't start: PLAYSET_COOKIE_SECRET must be at least 32 characters. PLAYSET_WEB_PORT must be a whole number from 1 to 65535.",
    );
    expect(run.status).toBe(1);
    expect(run.output).not.toContain("short-secret");
    expect(run.output).not.toContain(SETLISTFM_KEY);
    expect(run.output).not.toContain("Playset web is running at");
  }, 40_000);
});

describe("the entry file with variables set but empty (AC-2)", () => {
  it("AC-2: a variable set but empty in the environment counts as unset, so the .env value wins", () => {
    const dotEnv = [
      `SETLISTFM_API_KEY=${SETLISTFM_KEY}`,
      `SPOTIFY_CLIENT_ID=${CLIENT_ID}`,
      `PLAYSET_HOST_SPOTIFY_ID=${HOST_ID}`,
      "PLAYSET_COOKIE_SECRET=short-secret",
      "PLAYSET_WEB_PORT=0",
    ].join("\n");
    const run = runEntry({ SETLISTFM_API_KEY: "", PLAYSET_WEB_PORT: "" }, dotEnv);
    expect(run.stderr).toContain(
      "Playset can't start: PLAYSET_COOKIE_SECRET must be at least 32 characters. PLAYSET_WEB_PORT must be a whole number from 1 to 65535.",
    );
    expect(run.output).not.toContain("Missing SETLISTFM_API_KEY.");
    expect(run.status).toBe(1);
    expect(run.output).not.toContain("short-secret");
    expect(run.output).not.toContain(SETLISTFM_KEY);
    expect(run.output).not.toContain("Playset web is running at");
  }, 40_000);
});
