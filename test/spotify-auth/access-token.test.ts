import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RateLimitError, TokenError, getAccessToken } from "../../src/core/spotify-auth";
import {
  ACCESS_TOKEN,
  CLIENT_ID,
  NOW,
  REFRESH_TOKEN,
  TOKEN_ENDPOINT,
  captureError,
  codeExchangeSuccess,
  makeFakeFetch,
  makeFakeLoginHooks,
  makeTempRoot,
  networkFailure,
  rateLimited,
  readTokenCache,
  readTokenCacheRaw,
  refreshInvalidClient,
  refreshRevoked,
  refreshWithRotatedRefreshToken,
  refreshWithoutNewRefreshToken,
  removeTempRoot,
  serviceUnavailable,
  writeTokenCache,
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

function setup(script: Parameters<typeof makeFakeFetch>[0]) {
  const fake = makeFakeFetch(script);
  const hooks = makeFakeLoginHooks();
  const sleep = vi.fn(async (_ms: number) => {});
  const deps = {
    configDir,
    env: { SPOTIFY_CLIENT_ID: CLIENT_ID },
    fetch: fake.fetch,
    sleep,
    now: () => NOW,
    openAuthorizeUrl: hooks.openAuthorizeUrl,
    startCallbackReceiver: hooks.startCallbackReceiver,
  };
  return { deps, hooks, sleep, ...fake };
}

const STALE_CACHE = {
  refreshToken: REFRESH_TOKEN,
  accessToken: ACCESS_TOKEN,
  expiresAt: NOW + 30_000,
};

describe("cached access token", () => {
  for (const [label, expiresAt] of [
    ["one hour away", NOW + 3_600_000],
    ["100 seconds away", NOW + 100_000],
  ] as const) {
    it(`AC-18: returns the cached access token with no network request when expiry is ${label}`, async () => {
      await writeTokenCache(configDir, { refreshToken: REFRESH_TOKEN, accessToken: ACCESS_TOKEN, expiresAt });
      const { deps, fetch, hooks } = setup([]);
      expect(await getAccessToken(deps)).toBe(ACCESS_TOKEN);
      expect(fetch).not.toHaveBeenCalled();
      expect(hooks.openAuthorizeUrl).not.toHaveBeenCalled();
    });
  }
});

describe("refresh", () => {
  for (const [label, expiresAt] of [
    ["expires within 60 seconds", NOW + 30_000],
    ["has already expired", NOW - 100_000],
  ] as const) {
    it(`AC-19: refreshes with one form-encoded POST when the cached access token ${label}`, async () => {
      await writeTokenCache(configDir, { refreshToken: REFRESH_TOKEN, accessToken: ACCESS_TOKEN, expiresAt });
      const { deps, fetch, requests, hooks } = setup([refreshWithoutNewRefreshToken]);

      const token = await getAccessToken(deps);

      expect(token).toBe("BQNew111...access");
      expect(fetch).toHaveBeenCalledTimes(1);
      const req = requests[0]!;
      expect(req.url).toBe(TOKEN_ENDPOINT);
      expect(req.method).toBe("POST");
      expect(req.headers.get("content-type")).toMatch(/^application\/x-www-form-urlencoded/);
      expect(req.headers.has("authorization")).toBe(false);
      expect(req.rawBody.toLowerCase()).not.toContain("secret");
      expect(Object.fromEntries(req.body)).toEqual({
        grant_type: "refresh_token",
        refresh_token: REFRESH_TOKEN,
        client_id: CLIENT_ID,
      });
      expect(hooks.openAuthorizeUrl).not.toHaveBeenCalled();
    });
  }

  it("AC-19: updates the token cache after a successful refresh", async () => {
    await writeTokenCache(configDir, STALE_CACHE);
    const { deps } = setup([refreshWithoutNewRefreshToken]);
    await getAccessToken(deps);
    const cache = await readTokenCache(configDir);
    expect(cache?.accessToken).toBe("BQNew111...access");
    expect(cache?.expiresAt).toBe(NOW + 3_600_000);
  });

  it("AC-20: keeps the previous refresh token when the refresh response has none", async () => {
    await writeTokenCache(configDir, STALE_CACHE);
    const { deps } = setup([refreshWithoutNewRefreshToken]);
    await getAccessToken(deps);
    expect(await readTokenCache(configDir)).toEqual({
      refreshToken: REFRESH_TOKEN,
      accessToken: "BQNew111...access",
      expiresAt: NOW + 3_600_000,
    });
  });

  it("AC-20: stores the rotated refresh token when the refresh response has one", async () => {
    await writeTokenCache(configDir, STALE_CACHE);
    const { deps } = setup([refreshWithRotatedRefreshToken]);
    expect(await getAccessToken(deps)).toBe("BQNew222...access");
    expect(await readTokenCache(configDir)).toEqual({
      refreshToken: "AQRotated...refresh",
      accessToken: "BQNew222...access",
      expiresAt: NOW + 3_600_000,
    });
  });
});

describe("token cache contents", () => {
  it("AC-21: after a login the cache holds the refresh token, the access token and expiresAt = response time + expires_in", async () => {
    const { deps } = setup([codeExchangeSuccess]);
    await getAccessToken(deps);
    expect(await readTokenCache(configDir)).toEqual({
      refreshToken: REFRESH_TOKEN,
      accessToken: ACCESS_TOKEN,
      expiresAt: 1795719600000,
    });
  });

  it("AC-21: expiresAt is worked out from the time the response arrives", async () => {
    await writeTokenCache(configDir, STALE_CACHE);
    const { deps } = setup([refreshWithoutNewRefreshToken]);
    let clock = NOW;
    const fetch = deps.fetch;
    const laterFetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const res = await fetch(input, init);
      clock = NOW + 5_000; // response arrives 5 s later
      return res;
    });
    await getAccessToken({ ...deps, fetch: laterFetch, now: () => clock });
    expect((await readTokenCache(configDir))?.expiresAt).toBe(NOW + 5_000 + 3_600_000);
  });
});

describe("no usable cache", () => {
  const unusable: Array<[string, string | null]> = [
    ["the token cache is missing", null],
    ["the token cache has no refresh token", JSON.stringify({ accessToken: "x" })],
    ["the token cache is not valid JSON", "not json"],
  ];

  for (const [label, content] of unusable) {
    it(`AC-22: runs a full login and replaces the cache when ${label}`, async () => {
      if (content !== null) await writeTokenCache(configDir, content);
      const { deps, hooks, requests } = setup([codeExchangeSuccess]);

      expect(await getAccessToken(deps)).toBe(ACCESS_TOKEN);

      expect(hooks.openAuthorizeUrl).toHaveBeenCalledTimes(1);
      expect(requests).toHaveLength(1);
      expect(requests[0]!.body.get("grant_type")).toBe("authorization_code");
      expect(await readTokenCache(configDir)).toEqual({
        refreshToken: REFRESH_TOKEN,
        accessToken: ACCESS_TOKEN,
        expiresAt: NOW + 3_600_000,
      });
    });
  }
});

describe("refresh rejected", () => {
  it("AC-23: runs a full login when the refresh is rejected with invalid_grant, and its tokens replace the cache", async () => {
    await writeTokenCache(configDir, {
      refreshToken: "AQOld...refresh",
      accessToken: "BQOld...access",
      expiresAt: NOW - 1_000,
    });
    const { deps, hooks, requests } = setup([refreshRevoked, codeExchangeSuccess]);

    expect(await getAccessToken(deps)).toBe(ACCESS_TOKEN);

    expect(requests.map((r) => r.body.get("grant_type"))).toEqual(["refresh_token", "authorization_code"]);
    expect(hooks.openAuthorizeUrl).toHaveBeenCalledTimes(1);
    expect(await readTokenCache(configDir)).toEqual({
      refreshToken: REFRESH_TOKEN,
      accessToken: ACCESS_TOKEN,
      expiresAt: NOW + 3_600_000,
    });
  });

  const otherFailures = [
    ["HTTP 503 with an empty body", serviceUnavailable],
    ["a network error from fetch", networkFailure],
    ["HTTP 400 invalid_client", refreshInvalidClient],
  ] as const;

  for (const [label, failure] of otherFailures) {
    it(`AC-24: raises a token error, starts no login and leaves the cache unchanged on ${label}`, async () => {
      await writeTokenCache(configDir, STALE_CACHE);
      const before = await readTokenCacheRaw(configDir);
      const { deps, hooks, fetch } = setup([failure]);

      const err = await captureError(getAccessToken(deps));

      expect(err).toBeInstanceOf(TokenError);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(hooks.openAuthorizeUrl).not.toHaveBeenCalled();
      expect(hooks.startCallbackReceiver).not.toHaveBeenCalled();
      expect(await readTokenCacheRaw(configDir)).toBe(before);
    });
  }
});

describe("rate limit", () => {
  it("AC-25: waits Retry-After seconds through the sleeper and retries a refresh", async () => {
    await writeTokenCache(configDir, STALE_CACHE);
    const { deps, sleep, fetch } = setup([rateLimited(2), refreshWithoutNewRefreshToken]);

    expect(await getAccessToken(deps)).toBe("BQNew111...access");

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(2000);
  });

  it("AC-25: raises a rate-limit error after exactly 3 refresh attempts that all get 429", async () => {
    await writeTokenCache(configDir, STALE_CACHE);
    const before = await readTokenCacheRaw(configDir);
    const { deps, fetch, hooks } = setup([rateLimited(2), rateLimited(2), rateLimited(2), refreshWithoutNewRefreshToken]);

    const err = await captureError(getAccessToken(deps));

    expect(err).toBeInstanceOf(RateLimitError);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(hooks.openAuthorizeUrl).not.toHaveBeenCalled();
    expect(await readTokenCacheRaw(configDir)).toBe(before);
  });

  it("AC-25: waits Retry-After seconds through the sleeper and retries a code exchange", async () => {
    const { deps, sleep, fetch, requests } = setup([rateLimited(3), codeExchangeSuccess]);

    expect(await getAccessToken(deps)).toBe(ACCESS_TOKEN);

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(requests.every((r) => r.body.get("grant_type") === "authorization_code")).toBe(true);
    expect(sleep).toHaveBeenCalledWith(3000);
  });

  it("AC-25: raises a rate-limit error after exactly 3 code-exchange attempts that all get 429", async () => {
    const { deps, fetch } = setup([rateLimited(1), rateLimited(1), rateLimited(1), codeExchangeSuccess]);

    const err = await captureError(getAccessToken(deps));

    expect(err).toBeInstanceOf(RateLimitError);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(await readTokenCacheRaw(configDir)).toBeNull();
  });
});
