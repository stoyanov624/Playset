import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AccessDeniedError,
  MissingClientIdError,
  RateLimitError,
  StateMismatchError,
  TokenError,
  getAccessToken,
  resolveClientId,
  type AuthorizationResult,
} from "../../src/core/spotify-auth";
import {
  ACCESS_TOKEN,
  AUTH_CODE,
  CLIENT_ID,
  CONFIG_FILE_CLIENT_ID,
  NOW,
  REFRESH_TOKEN,
  RFC_VERIFIER,
  SECRETS,
  STATE,
  TOKEN_CACHE_FILE,
  captureError,
  codeExchangeInvalidGrant,
  codeExchangeSuccess,
  errorText,
  fileMode,
  makeFakeFetch,
  makeFakeLoginHooks,
  makeTempRoot,
  rateLimited,
  readTokenCache,
  refreshInvalidClient,
  refreshWithoutNewRefreshToken,
  removeTempRoot,
  serviceUnavailable,
  writeConfigFile,
  writeTokenCache,
} from "./helpers";

let root: string;
let configDir: string;

beforeEach(async () => {
  root = await makeTempRoot();
  configDir = join(root, "nested", "playset");
});

afterEach(async () => {
  await removeTempRoot(root);
});

function setup(
  script: Parameters<typeof makeFakeFetch>[0],
  respond?: (sentState: string | null) => AuthorizationResult,
  env: Record<string, string | undefined> = { SPOTIFY_CLIENT_ID: CLIENT_ID },
) {
  const fake = makeFakeFetch(script);
  const hooks = makeFakeLoginHooks(respond);
  const deps = {
    configDir,
    env,
    fetch: fake.fetch,
    sleep: vi.fn(async (_ms: number) => {}),
    now: () => NOW,
    openAuthorizeUrl: hooks.openAuthorizeUrl,
    startCallbackReceiver: hooks.startCallbackReceiver,
    generateCodeVerifier: () => RFC_VERIFIER,
    generateState: () => STATE,
  };
  return { deps, hooks, ...fake };
}

const STALE_CACHE = { refreshToken: REFRESH_TOKEN, accessToken: ACCESS_TOKEN, expiresAt: NOW + 30_000 };

describe("token cache file permissions", () => {
  it("AC-26: creates a missing config directory with 0700 and the token cache with 0600", async () => {
    const { deps } = setup([codeExchangeSuccess]);
    await getAccessToken(deps);
    expect(await fileMode(configDir)).toBe(0o700);
    expect(await fileMode(join(configDir, TOKEN_CACHE_FILE))).toBe(0o600);
  });

  it("AC-26: tightens an existing 0644 token cache to 0600 when it is overwritten", async () => {
    await writeTokenCache(configDir, STALE_CACHE, 0o644);
    expect(await fileMode(join(configDir, TOKEN_CACHE_FILE))).toBe(0o644);
    const { deps } = setup([refreshWithoutNewRefreshToken]);
    await getAccessToken(deps);
    expect((await readTokenCache(configDir))?.accessToken).toBe("BQNew111...access");
    expect(await fileMode(join(configDir, TOKEN_CACHE_FILE))).toBe(0o600);
  });
});

describe("injected config directory", () => {
  let savedHome: string | undefined;
  let fakeHome: string;

  beforeEach(async () => {
    savedHome = process.env.HOME;
    fakeHome = join(root, "home");
    await mkdir(fakeHome);
    process.env.HOME = fakeHome;
  });

  afterEach(() => {
    if (savedHome === undefined) delete process.env.HOME;
    else process.env.HOME = savedHome;
  });

  it("AC-27: reads the client id from the injected config directory only", async () => {
    await writeConfigFile(configDir, JSON.stringify({ spotifyClientId: CONFIG_FILE_CLIENT_ID }));
    expect(await resolveClientId({ env: { HOME: fakeHome }, configDir })).toBe(CONFIG_FILE_CLIENT_ID);
    expect(await readdir(fakeHome)).toEqual([]);
  });

  it("AC-27: reads and writes the token cache only under the injected config directory", async () => {
    // login writes the cache
    const first = setup([codeExchangeSuccess], undefined, { SPOTIFY_CLIENT_ID: CLIENT_ID, HOME: fakeHome });
    expect(await getAccessToken(first.deps)).toBe(ACCESS_TOKEN);
    expect(await readTokenCache(configDir)).not.toBeNull();

    // a later run reads the same cache from the injected directory (no network)
    const second = setup([], undefined, { SPOTIFY_CLIENT_ID: CLIENT_ID, HOME: fakeHome });
    expect(await getAccessToken(second.deps)).toBe(ACCESS_TOKEN);
    expect(second.fetch).not.toHaveBeenCalled();

    expect(await readdir(fakeHome)).toEqual([]);
    expect((await readdir(root)).sort()).toEqual(["home", "nested"]);
    expect(await readdir(join(root, "nested"))).toEqual(["playset"]);
  });
});

describe("secret hygiene", () => {
  function expectNoSecrets(err: unknown, extra: string[] = []) {
    expect(err).toBeInstanceOf(Error);
    const text = errorText(err);
    for (const secret of [...SECRETS, ...extra]) {
      expect(text).not.toContain(secret);
    }
  }

  it("AC-28: a state-mismatch error shows no code, verifier or token", async () => {
    const { deps } = setup([codeExchangeSuccess], () => ({ code: AUTH_CODE, state: "WRONGstate0000000000" }));
    const err = await captureError(getAccessToken(deps));
    expect(err).toBeInstanceOf(StateMismatchError);
    expectNoSecrets(err);
  });

  it("AC-28: an access-denied error shows no secrets", async () => {
    const { deps } = setup([], () => ({ error: "access_denied", state: STATE }));
    const err = await captureError(getAccessToken(deps));
    expect(err).toBeInstanceOf(AccessDeniedError);
    expectNoSecrets(err);
  });

  it("AC-28: a token error from a rejected code exchange shows no code, verifier or token", async () => {
    const { deps } = setup([codeExchangeInvalidGrant]);
    const err = await captureError(getAccessToken(deps));
    expect(err).toBeInstanceOf(TokenError);
    expectNoSecrets(err);
  });

  it("AC-28: a token error from a failed refresh shows no access or refresh token", async () => {
    await writeTokenCache(configDir, STALE_CACHE);
    for (const failure of [serviceUnavailable, refreshInvalidClient]) {
      const { deps } = setup([failure]);
      const err = await captureError(getAccessToken(deps));
      expect(err).toBeInstanceOf(TokenError);
      expectNoSecrets(err);
    }
  });

  it("AC-28: a rate-limit error shows no access or refresh token", async () => {
    await writeTokenCache(configDir, STALE_CACHE);
    const { deps } = setup([rateLimited(1), rateLimited(1), rateLimited(1)]);
    const err = await captureError(getAccessToken(deps));
    expect(err).toBeInstanceOf(RateLimitError);
    expectNoSecrets(err);
  });

  it("AC-28: a rate-limit error during a code exchange shows no code or verifier", async () => {
    const { deps } = setup([rateLimited(1), rateLimited(1), rateLimited(1)]);
    const err = await captureError(getAccessToken(deps));
    expect(err).toBeInstanceOf(RateLimitError);
    expectNoSecrets(err);
  });

  it("AC-28: a missing-client-id error shows no secrets", async () => {
    await writeTokenCache(configDir, STALE_CACHE);
    const { deps } = setup([], undefined, {});
    const err = await captureError(getAccessToken(deps));
    expect(err).toBeInstanceOf(MissingClientIdError);
    expectNoSecrets(err);
  });
});
