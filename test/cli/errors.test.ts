// PRD 0007 — how `playset` reports errors, cancellation and exit codes (E14–E17).
// The typed errors are the real ones from PRDs 0001–0006, produced with fakes (no network).
import { describe, expect, it, vi } from "vitest";
import { main } from "../../src/cli/main.js";
import { makeFakeIo, type FakeIo, type FakeIoOptions } from "./fixtures/fake-io";
import {
  CREATED_SHARE_URL,
  DUPLICATE,
  REFRESH_TOKEN,
  SETLISTFM_API_KEY,
  TOKEN,
} from "../run/fixtures/fake-services";
import { ARCTIC_MONKEYS_CANDIDATES, FIXTURE_A_URL } from "../run/fixtures/setlists";
import {
  PARTLY_CREATED_SHARE_URL,
  accessDeniedError,
  artistChoiceCancelledError,
  artistNotFoundError,
  invalidPortError,
  missingClientIdError,
  missingSetlistFmApiKeyError,
  noSetlistError,
  partlyCreatedPlaylistError,
  playlistRateLimitError,
  portInUseError,
  setlistFmRateLimitError,
  setlistFmRequestError,
  setlistNotFoundError,
  spotifyPlaylistError,
  spotifySearchError,
  spotifySearchRateLimitError,
  tokenError,
} from "../run/fixtures/typed-errors";

const SECRETS = [SETLISTFM_API_KEY, TOKEN, REFRESH_TOKEN];
const STACK_FRAME = /^\s+at\s/m;

function expectNoSecrets(fake: FakeIo) {
  const all = fake.transcript.map((e) => e.text).join("\n");
  for (const secret of SECRETS) expect(all).not.toContain(secret);
}

function expectNoStackOrClassName(fake: FakeIo, err?: Error) {
  expect(fake.output()).not.toMatch(STACK_FRAME);
  if (err && err.constructor.name !== "Error") expect(fake.output()).not.toContain(err.constructor.name);
}

/** Every non-empty hint line of the error appears on standard error. */
function expectHintLines(fake: FakeIo, err: Error) {
  const hint = (err as { hint?: unknown }).hint;
  if (typeof hint !== "string") return;
  for (const line of hint.split("\n").map((l) => l.trim()).filter((l) => l !== "")) {
    expect(fake.stderr()).toContain(line);
  }
}

type Placement = (err: Error) => { argv: string[]; options: FakeIoOptions };

const atGetSetlist: Placement = (err) => ({
  argv: [FIXTURE_A_URL, "--no-tapes", "--yes"],
  options: { services: { fail: { getSetlist: err } } },
});
const atArtistLookup: Placement = (err) => ({
  argv: ["Xyzzq", "Nonexistent", "--no-tapes", "--yes"],
  options: { services: { fail: { findLatestSetlistByArtistName: err } } },
});
const atLogin: Placement = (err) => ({
  argv: [FIXTURE_A_URL, "--no-tapes", "--yes"],
  options: { services: { fail: { getAccessToken: err } } },
});
const atCreate: Placement = (err) => ({
  argv: [FIXTURE_A_URL, "--no-tapes", "--yes"],
  options: { services: { fail: { createSetlistPlaylist: err } } },
});
const atSearch: Placement = (err) => ({
  argv: [FIXTURE_A_URL, "--no-tapes", "--yes"],
  options: { services: { failMatchOn: { Brianstorm: err } } },
});

const ERROR_ROWS: [string, () => Promise<Error>, Placement][] = [
  ["missing setlist.fm API key", missingSetlistFmApiKeyError, atGetSetlist],
  ["missing Spotify client id", missingClientIdError, atLogin],
  ["invalid auth port", invalidPortError, atLogin],
  ["auth port in use", portInUseError, atLogin],
  ["Spotify login declined", accessDeniedError, atLogin],
  ["other Spotify login error", tokenError, atLogin],
  ["Artist not found", artistNotFoundError, atArtistLookup],
  ["no Setlist for the Artist", noSetlistError, atArtistLookup],
  ["Setlist not found by id", setlistNotFoundError, atGetSetlist],
  ["setlist.fm rate limit", setlistFmRateLimitError, atGetSetlist],
  ["Spotify rate limit on create", playlistRateLimitError, atCreate],
  ["Spotify rate limit on search", spotifySearchRateLimitError, atSearch],
  ["setlist.fm request error", setlistFmRequestError, atGetSetlist],
  ["Spotify error on create", spotifyPlaylistError, atCreate],
  ["Spotify search error", spotifySearchError, atSearch],
];

async function runWithError(make: () => Promise<Error>, placement: Placement, env: Record<string, string> = {}) {
  const err = await make();
  const { argv, options } = placement(err);
  const fake = makeFakeIo({ ...options, env });
  const code = await main(argv, fake.io);
  return { err, fake, code };
}

describe("playset — typed errors (E14)", () => {
  for (const [label, make, placement] of ERROR_ROWS) {
    it(`AC-38: ${label} prints the error's message and hint lines on standard error; exit 1`, async () => {
      const { err, fake, code } = await runWithError(make, placement);
      expect(code).toBe(1);
      expect(fake.stderr()).toContain(err.message);
      expectHintLines(fake, err);
      expect(fake.stdout()).not.toContain(err.message);
      expect(fake.calls.create.length === 0 || placement === atCreate).toBe(true);
    });

    it(`AC-40: ${label} is reported without a stack trace or an error class name`, async () => {
      const { err, fake } = await runWithError(make, placement);
      expectNoStackOrClassName(fake, err);
    });

    it(`AC-43: ${label} never shows the API key or a Spotify token, even with PLAYSET_DEBUG=1`, async () => {
      for (const env of [{}, { PLAYSET_DEBUG: "1" }]) {
        const { fake } = await runWithError(make, placement, env);
        expectNoSecrets(fake);
      }
    });
  }

  it("AC-38: the missing-API-key hint names where to get a key and SETLISTFM_API_KEY", async () => {
    const { fake } = await runWithError(missingSetlistFmApiKeyError, atGetSetlist);
    expect(fake.stderr()).toContain("https://www.setlist.fm/settings/api");
    expect(fake.stderr()).toContain("SETLISTFM_API_KEY");
  });

  it("AC-38: the missing-client-id hint names SPOTIFY_CLIENT_ID and the redirect URI to register", async () => {
    const { fake } = await runWithError(missingClientIdError, atLogin);
    expect(fake.stderr()).toContain("SPOTIFY_CLIENT_ID");
    expect(fake.stderr()).toContain("http://127.0.0.1:8888/callback");
  });

  it("AC-38: the message comes before its hint lines", async () => {
    const { err, fake } = await runWithError(portInUseError, atLogin);
    const stderr = fake.stderr();
    const hint = (err as { hint?: string }).hint!.split("\n")[0]!.trim();
    expect(stderr.indexOf(err.message)).toBeLessThan(stderr.indexOf(hint));
  });
});

describe("playset — partly created playlist (E16)", () => {
  it("AC-39: says the playlist was only partly created with tracks added out of the total, prints the share link last; exit 1", async () => {
    const partly = await partlyCreatedPlaylistError();
    const fake = makeFakeIo({ services: { fail: { createSetlistPlaylist: partly } } });
    const code = await main([FIXTURE_A_URL, "--no-tapes", "--yes"], fake.io);
    expect(code).toBe(1);
    expect(fake.stderr()).toMatch(/partly/i);
    expect(fake.stderr()).toMatch(/\b100\b/);
    expect(fake.stderr()).toMatch(/\b250\b/);
    expect(fake.lastStdoutLine()).toBe(PARTLY_CREATED_SHARE_URL);
    expectNoStackOrClassName(fake, partly);
  });
});

describe("playset — PLAYSET_DEBUG", () => {
  it("AC-40: with PLAYSET_DEBUG=1 the message is followed on standard error by the error's details and stack trace (E14, setlist.fm 503)", async () => {
    const { err, fake, code } = await runWithError(setlistFmRequestError, atGetSetlist, { PLAYSET_DEBUG: "1" });
    expect(code).toBe(1);
    const stderr = fake.stderr();
    expect(stderr).toContain(err.message);
    expect(stderr).toMatch(STACK_FRAME);
    expect(stderr.indexOf(err.message)).toBeLessThan(stderr.search(STACK_FRAME));
    expect(fake.stdout()).not.toMatch(STACK_FRAME);
  });

  it("AC-40: with PLAYSET_DEBUG=1 the underlying cause is printed too", async () => {
    const err = new Error("Spotify answered strangely", { cause: new Error("socket hang up while reading") });
    const fake = makeFakeIo({ services: { fail: { getSetlist: err } }, env: { PLAYSET_DEBUG: "1" } });
    await main([FIXTURE_A_URL, "--no-tapes", "--yes"], fake.io);
    expect(fake.stderr()).toContain("socket hang up while reading");
    expect(fake.stderr()).toMatch(STACK_FRAME);
  });

  for (const value of [undefined, "0", "true", ""]) {
    it(`AC-40: PLAYSET_DEBUG=${JSON.stringify(value)} prints no stack trace and no underlying cause details`, async () => {
      const err = new Error("Spotify answered strangely", { cause: new Error("socket hang up while reading") });
      const env = value === undefined ? {} : { PLAYSET_DEBUG: value };
      const fake = makeFakeIo({ services: { fail: { getSetlist: err } }, env });
      await main([FIXTURE_A_URL, "--no-tapes", "--yes"], fake.io);
      expect(fake.output()).not.toMatch(STACK_FRAME);
    });
  }
});

describe("playset — unexpected errors (E15)", () => {
  it("AC-41: an unexpected error prints 'something went wrong' with its message and a hint to set PLAYSET_DEBUG=1; exit 1, nothing created", async () => {
    const err = new TypeError("Cannot read properties of undefined (reading 'items')");
    const fake = makeFakeIo({
      services: { fail: { findPlaylistsNamed: err }, duplicates: [DUPLICATE] },
    });
    const code = await main([FIXTURE_A_URL, "--no-tapes", "--yes"], fake.io);
    expect(code).toBe(1);
    const lines = fake.stderrLines();
    const wrong = lines.find((l) => /something went wrong/i.test(l));
    expect(wrong).toBeDefined();
    expect(wrong).toContain("Cannot read properties of undefined (reading 'items')");
    expect(fake.stderr()).toContain("PLAYSET_DEBUG=1");
    expect(fake.output()).not.toContain("TypeError");
    expect(fake.output()).not.toMatch(STACK_FRAME);
    expect(fake.calls.create).toEqual([]);
  });
});

// ---------------------------------------------------------------- Ctrl-C (E17)

function t1(overrides: FakeIoOptions = {}) {
  return makeFakeIo({
    selectAnswers: [0],
    confirmAnswers: [true, false, true],
    ...overrides,
    services: { candidates: ARCTIC_MONKEYS_CANDIDATES, fullLogin: true, duplicates: [DUPLICATE], ...overrides.services },
  });
}

function expectCancelled(fake: FakeIo, code: number) {
  expect(code).toBe(130);
  const lines = fake.output().split("\n").map((l) => l.trim()).filter((l) => l !== "");
  expect(lines.filter((l) => l === "Cancelled.")).toHaveLength(1);
  expect(fake.output()).not.toMatch(STACK_FRAME);
  expect(fake.output()).not.toContain("ExitPromptError");
  expect(fake.calls.create).toEqual([]);
}

describe("playset — Ctrl-C", () => {
  it("AC-42: Ctrl-C at the Artist question prints 'Cancelled.'; exit 130, no setlists request", async () => {
    const fake = t1({ selectAnswers: ["cancel"], confirmAnswers: [] });
    const code = await main(["arctic", "monkey"], fake.io);
    expectCancelled(fake, code);
    expect(fake.events.some((e) => e.startsWith("setlistfm:setlists:"))).toBe(false);
  });

  it("AC-42: Ctrl-C at the second Tape question prints 'Cancelled.'; exit 130, no Spotify request", async () => {
    const fake = t1({ confirmAnswers: [true, "cancel"] });
    const code = await main(["arctic", "monkey"], fake.io);
    expectCancelled(fake, code);
    expect(fake.events.filter((e) => e.startsWith("spotify:"))).toEqual([]);
  });

  it("AC-42: Ctrl-C while waiting for the Spotify login prints 'Cancelled.'; exit 130, no search", async () => {
    const fake = t1({ services: { loginNeverFinishes: true } });
    const running = main(["arctic", "monkey"], fake.io);
    await vi.waitFor(() => expect(fake.openedUrls).toHaveLength(1));
    expect(fake.hasInterruptHandler()).toBe(true);
    fake.interrupt();
    const code = await running;
    expectCancelled(fake, code);
    expect(fake.calls.findMatch).toEqual([]);
  });

  it("AC-42: Ctrl-C at the confirmation prints 'Cancelled.'; exit 130, nothing created", async () => {
    const fake = t1({ confirmAnswers: [true, false, "cancel"] });
    const code = await main(["arctic", "monkey"], fake.io);
    expectCancelled(fake, code);
    expect(fake.output()).not.toContain(CREATED_SHARE_URL);
  });

  it("AC-42: a cancelled Artist chooser (PRD 0005 AC-17) prints 'Cancelled.'; exit 130", async () => {
    const cancelled = await artistChoiceCancelledError();
    const fake = makeFakeIo({ services: { fail: { findLatestSetlistByArtistName: cancelled } } });
    const code = await main(["Genesis", "--no-tapes", "--yes"], fake.io);
    expectCancelled(fake, code);
    expect(fake.output()).not.toContain(cancelled.constructor.name);
  });
});

describe("playset — secrets", () => {
  it("AC-43: a whole run (T1) with PLAYSET_DEBUG=1 never prints the API key, the access token or the refresh token", async () => {
    const fake = t1({ env: { PLAYSET_DEBUG: "1" } });
    const code = await main(["arctic", "monkey"], fake.io);
    expect(code).toBe(0);
    expectNoSecrets(fake);
  });
});
