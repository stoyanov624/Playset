// The stateless Spotify login calls the web server uses (PRD 0017 X1): code exchange, refresh and
// the account fetch (/me). They read and write nothing and reach Spotify only through the injected fetch.
import { describe, expect, it, vi } from "vitest";
import { PlaysetError } from "../../src/core/http/index.js";
import {
  RateLimitError,
  SpotifyAccountError,
  TokenError,
  exchangeAuthorizationCode,
  fetchSpotifyAccount,
  refreshAccessToken,
  type TokenGrant,
} from "../../src/core/spotify-auth";
import { TOKEN_ENDPOINT, captureError, errorText, jsonResponse, makeFakeFetch, rateLimited } from "./helpers";

// The PRD 0017 examples.
const CLIENT_ID = "3f9c2a7e5b1d4c8fa6e0b2d4c6a8e1f3";
const REDIRECT_URI = "http://127.0.0.1:3000/admin/callback";
const CODE = "AQDx9-test-code";
const VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const HOST_ACCESS_TOKEN = "BQDhost-test-token";
const HOST_REFRESH_TOKEN = "AQChost-refresh-token";
const NOW = 1795876200000; // 2026-11-28T14:30:00.000Z
const SCOPE = "playlist-modify-private playlist-modify-public playlist-read-private";
const ME_URL = "https://api.spotify.com/v1/me";

const SECRETS = [HOST_ACCESS_TOKEN, HOST_REFRESH_TOKEN, CODE, VERIFIER];

type Script = Parameters<typeof makeFakeFetch>[0];

function setup(script: Script) {
  const fake = makeFakeFetch(script);
  const sleep = vi.fn(async (_ms: number) => {});
  const deps = { fetch: fake.fetch, sleep, now: () => NOW };
  return { deps, sleep, ...fake };
}

function expectNoSecrets(err: unknown) {
  const text = errorText(err);
  for (const secret of SECRETS) expect(text).not.toContain(secret);
}

const hostGrantAnswer = jsonResponse(200, {
  access_token: HOST_ACCESS_TOKEN,
  token_type: "Bearer",
  scope: SCOPE,
  expires_in: 3600,
  refresh_token: HOST_REFRESH_TOKEN,
});
const grantWithoutRefresh = jsonResponse(200, {
  access_token: HOST_ACCESS_TOKEN,
  token_type: "Bearer",
  scope: SCOPE,
  expires_in: 3600,
});
const invalidCode = jsonResponse(400, { error: "invalid_grant", error_description: "Invalid authorization code" });
const unavailable = () => new Response("", { status: 503 });
const networkFailure = () => Promise.reject(new TypeError("fetch failed"));
const refreshedKept = jsonResponse(200, { access_token: "BQDhost-refreshed", token_type: "Bearer", expires_in: 3600 });
const refreshedRotated = jsonResponse(200, {
  access_token: "BQDhost-refreshed",
  token_type: "Bearer",
  expires_in: 3600,
  refresh_token: "AQChost-rotated",
});
const refreshRevoked = jsonResponse(400, { error: "invalid_grant", error_description: "Refresh token revoked" });
const invalidClient = jsonResponse(400, { error: "invalid_client", error_description: "Invalid client" });
const hostMe = jsonResponse(200, {
  id: "31abcxyzhost",
  display_name: "playset-host",
  type: "user",
  uri: "spotify:user:31abcxyzhost",
  country: "DE",
  product: "premium",
});

const exchange = (deps: ReturnType<typeof setup>["deps"]) =>
  exchangeAuthorizationCode(deps, { clientId: CLIENT_ID, redirectUri: REDIRECT_URI, code: CODE, codeVerifier: VERIFIER });
const refresh = (deps: ReturnType<typeof setup>["deps"]) =>
  refreshAccessToken(deps, { clientId: CLIENT_ID, refreshToken: HOST_REFRESH_TOKEN });

// ---------------------------------------------------------------- code exchange

describe("exchangeAuthorizationCode (AC-1, AC-2)", () => {
  it("AC-1: sends exactly one form-encoded POST to the token endpoint with the five fields and no client secret", async () => {
    const { deps, requests, fetch } = setup([hostGrantAnswer]);
    await exchange(deps);
    expect(fetch).toHaveBeenCalledTimes(1);
    const req = requests[0]!;
    expect(req.url).toBe(TOKEN_ENDPOINT);
    expect(req.method).toBe("POST");
    expect(req.headers.get("content-type")).toMatch(/^application\/x-www-form-urlencoded/);
    expect(req.headers.has("authorization")).toBe(false);
    expect(req.rawBody.toLowerCase()).not.toContain("secret");
    expect(Object.fromEntries(req.body)).toEqual({
      grant_type: "authorization_code",
      code: CODE,
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      code_verifier: VERIFIER,
    });
    expect([...req.body.keys()]).toHaveLength(5);
  });

  it("AC-1: on 200 resolves { accessToken, refreshToken, expiresAt } with expiresAt = response time + expires_in", async () => {
    const { deps } = setup([hostGrantAnswer]);
    const grant: TokenGrant = await exchange(deps);
    expect(grant).toStrictEqual({
      accessToken: HOST_ACCESS_TOKEN,
      refreshToken: HOST_REFRESH_TOKEN,
      expiresAt: 1795879800000,
    });
  });

  it("AC-1: expiresAt is worked out from the time the response arrives", async () => {
    const { deps } = setup([hostGrantAnswer]);
    let clock = NOW;
    const slowFetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const res = await deps.fetch(input, init);
      clock = NOW + 5_000;
      return res;
    });
    const grant = await exchangeAuthorizationCode(
      { ...deps, fetch: slowFetch, now: () => clock },
      { clientId: CLIENT_ID, redirectUri: REDIRECT_URI, code: CODE, codeVerifier: VERIFIER },
    );
    expect(grant.expiresAt).toBe(NOW + 5_000 + 3_600_000);
  });

  it("AC-2: a 200 without refresh_token rejects with a token error", async () => {
    const { deps } = setup([grantWithoutRefresh]);
    const err = await captureError(exchange(deps));
    expect(err).toBeInstanceOf(TokenError);
    expect((err as TokenError).spotifyError).toBeUndefined();
    expect(errorText(err)).not.toMatch(/invalid_(grant|client|request)/);
    expectNoSecrets(err);
  });

  for (const [label, answer] of [
    ["a non-JSON body", () => new Response("<html>oops</html>", { status: 200 })],
    ["an empty body", () => new Response("", { status: 200 })],
    ["no access_token", jsonResponse(200, { token_type: "Bearer", expires_in: 3600, refresh_token: HOST_REFRESH_TOKEN })],
    ["an empty access_token", jsonResponse(200, { access_token: "", expires_in: 3600, refresh_token: HOST_REFRESH_TOKEN })],
    ["no expires_in", jsonResponse(200, { access_token: HOST_ACCESS_TOKEN, refresh_token: HOST_REFRESH_TOKEN })],
  ] as const) {
    it(`AC-2: a 200 with ${label} rejects with a token error naming no Spotify error`, async () => {
      const { deps } = setup([answer]);
      const err = await captureError(exchange(deps));
      expect(err).toBeInstanceOf(TokenError);
      expect((err as TokenError).spotifyError).toBeUndefined();
      expect(errorText(err)).not.toMatch(/invalid_(grant|client|request)/);
      expectNoSecrets(err);
    });
  }

  it("AC-2: a 400 OAuth error rejects with a token error naming invalid_grant and its description", async () => {
    const { deps } = setup([invalidCode]);
    const err = await captureError(exchange(deps));
    expect(err).toBeInstanceOf(TokenError);
    expect(err).toBeInstanceOf(PlaysetError);
    expect(errorText(err)).toContain("invalid_grant");
    expect(errorText(err)).toContain("Invalid authorization code");
    expectNoSecrets(err);
  });

  for (const status of [401, 403] as const) {
    it(`AC-2: a ${status} OAuth error rejects with a token error naming Spotify's error`, async () => {
      const { deps } = setup([jsonResponse(status, { error: "invalid_client", error_description: "Invalid client" })]);
      const err = await captureError(exchange(deps));
      expect(err).toBeInstanceOf(TokenError);
      expect(errorText(err)).toContain("invalid_client");
      expectNoSecrets(err);
    });
  }

  for (const [label, answer] of [
    ["a 503 with an empty body", unavailable],
    ["a network failure", networkFailure],
  ] as const) {
    it(`AC-2: ${label} rejects with a token error naming no Spotify error`, async () => {
      const { deps } = setup([answer]);
      const err = await captureError(exchange(deps));
      expect(err).toBeInstanceOf(TokenError);
      expect(err).not.toBeInstanceOf(RateLimitError);
      expect(errorText(err)).not.toMatch(/invalid_(grant|client|request)/);
      expectNoSecrets(err);
    });
  }

  it("AC-2: 429 with Retry-After: 2, then 200 → the sleeper waits 2 s and the grant resolves", async () => {
    const { deps, sleep, fetch } = setup([rateLimited(2), hostGrantAnswer]);
    expect((await exchange(deps)).accessToken).toBe(HOST_ACCESS_TOKEN);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(2000);
  });

  it("AC-2: 429 three times → the core's rate-limit error after exactly 3 requests", async () => {
    const { deps, fetch, sleep } = setup([rateLimited(1), rateLimited(1), rateLimited(1), hostGrantAnswer]);
    const err = await captureError(exchange(deps));
    expect(err).toBeInstanceOf(RateLimitError);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toEqual([[1000], [1000]]);
    expectNoSecrets(err);
  });
});

// ---------------------------------------------------------------- refresh

describe("refreshAccessToken (AC-3, AC-4)", () => {
  it("AC-3: sends exactly one form-encoded POST with grant_type=refresh_token, refresh_token and client_id (no secret)", async () => {
    const { deps, requests, fetch } = setup([refreshedKept]);
    await refresh(deps);
    expect(fetch).toHaveBeenCalledTimes(1);
    const req = requests[0]!;
    expect(req.url).toBe(TOKEN_ENDPOINT);
    expect(req.method).toBe("POST");
    expect(req.headers.get("content-type")).toMatch(/^application\/x-www-form-urlencoded/);
    expect(req.headers.has("authorization")).toBe(false);
    expect(req.rawBody.toLowerCase()).not.toContain("secret");
    expect(Object.fromEntries(req.body)).toEqual({
      grant_type: "refresh_token",
      refresh_token: HOST_REFRESH_TOKEN,
      client_id: CLIENT_ID,
    });
    expect([...req.body.keys()]).toHaveLength(3);
  });

  it("AC-3: without a refresh_token in the answer the given refresh token is kept", async () => {
    const { deps } = setup([refreshedKept]);
    expect(await refresh(deps)).toStrictEqual({
      accessToken: "BQDhost-refreshed",
      refreshToken: HOST_REFRESH_TOKEN,
      expiresAt: 1795879800000,
    });
  });

  it("AC-3: a rotated refresh_token in the answer is the grant's refresh token", async () => {
    const { deps } = setup([refreshedRotated]);
    expect(await refresh(deps)).toStrictEqual({
      accessToken: "BQDhost-refreshed",
      refreshToken: "AQChost-rotated",
      expiresAt: 1795879800000,
    });
  });

  it("AC-4: 400 invalid_grant rejects with a token error naming invalid_grant", async () => {
    const { deps } = setup([refreshRevoked]);
    const err = await captureError(refresh(deps));
    expect(err).toBeInstanceOf(TokenError);
    expect(errorText(err)).toContain("invalid_grant");
    expectNoSecrets(err);
  });

  it("AC-4: 400 invalid_client rejects with a token error naming invalid_client, not invalid_grant", async () => {
    const { deps } = setup([invalidClient]);
    const err = await captureError(refresh(deps));
    expect(err).toBeInstanceOf(TokenError);
    expect(errorText(err)).toContain("invalid_client");
    expect(errorText(err)).not.toContain("invalid_grant");
    expectNoSecrets(err);
  });

  for (const [label, answer] of [
    ["a network error from the fake fetch", networkFailure],
    ["a 503", unavailable],
  ] as const) {
    it(`AC-4: ${label} rejects with a token error naming no Spotify error`, async () => {
      const { deps } = setup([answer]);
      const err = await captureError(refresh(deps));
      expect(err).toBeInstanceOf(TokenError);
      expect(errorText(err)).not.toMatch(/invalid_(grant|client|request)/);
      expectNoSecrets(err);
    });
  }

  it("AC-4: 429 Retry-After: 2 then 200 → waits 2 s once and resolves", async () => {
    const { deps, fetch, sleep } = setup([rateLimited(2), refreshedKept]);
    expect((await refresh(deps)).accessToken).toBe("BQDhost-refreshed");
    expect(sleep.mock.calls).toEqual([[2000]]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("AC-4: 429 three times → rate-limit error after 3 requests and exactly 2 waits", async () => {
    const { deps, fetch, sleep } = setup([rateLimited(1), rateLimited(1), rateLimited(1), refreshedKept]);
    const err = await captureError(refresh(deps));
    expect(err).toBeInstanceOf(RateLimitError);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toEqual([[1000], [1000]]);
    expectNoSecrets(err);
  });

  it("AC-4: a 200 with a non-JSON body rejects with a token error naming no Spotify error", async () => {
    const { deps } = setup([() => new Response("not json", { status: 200 })]);
    const err = await captureError(refresh(deps));
    expect(err).toBeInstanceOf(TokenError);
    expect((err as TokenError).spotifyError).toBeUndefined();
    expectNoSecrets(err);
  });
});

// ---------------------------------------------------------------- account fetch

describe("fetchSpotifyAccount (AC-5, AC-6)", () => {
  it("AC-5: sends exactly one GET /v1/me with the Bearer token and resolves { id, displayName }", async () => {
    const { deps, requests, fetch } = setup([hostMe]);
    const account = await fetchSpotifyAccount(deps, HOST_ACCESS_TOKEN);
    expect(account).toStrictEqual({ id: "31abcxyzhost", displayName: "playset-host" });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(requests[0]!.url).toBe(ME_URL);
    expect(requests[0]!.method).toBe("GET");
    expect(requests[0]!.headers.get("authorization")).toBe(`Bearer ${HOST_ACCESS_TOKEN}`);
  });

  for (const [label, body] of [
    ["null", { id: "31abcxyzhost", display_name: null }],
    ["empty", { id: "31abcxyzhost", display_name: "" }],
    ["missing", { id: "31abcxyzhost" }],
  ] as const) {
    it(`AC-5: display_name ${label} → { id } with no displayName key`, async () => {
      const { deps } = setup([jsonResponse(200, body)]);
      const account = await fetchSpotifyAccount(deps, HOST_ACCESS_TOKEN);
      expect(account).toStrictEqual({ id: "31abcxyzhost" });
      expect(Object.keys(account)).toEqual(["id"]);
    });
  }

  for (const [label, body] of [
    ["no id", { display_name: "playset-host" }],
    ["an empty id", { id: "", display_name: "playset-host" }],
    ["a non-string id", { id: 31, display_name: "playset-host" }],
  ] as const) {
    it(`AC-5: an answer with ${label} rejects with a SpotifyAccountError without status`, async () => {
      const { deps } = setup([jsonResponse(200, body)]);
      const err = await captureError(fetchSpotifyAccount(deps, HOST_ACCESS_TOKEN));
      expect(err).toBeInstanceOf(SpotifyAccountError);
      expect((err as SpotifyAccountError).status).toBeUndefined();
      expectNoSecrets(err);
    });
  }

  for (const status of [401, 403, 500] as const) {
    it(`AC-6: HTTP ${status} rejects with a SpotifyAccountError of status ${status}, a PlaysetError`, async () => {
      const body =
        status === 403
          ? {
              error: {
                status: 403,
                message: "Check settings on developer.spotify.com/dashboard, the user may not be registered.",
              },
            }
          : { error: { status, message: "nope" } };
      const { deps, fetch } = setup([jsonResponse(status, body)]);
      const err = await captureError(fetchSpotifyAccount(deps, HOST_ACCESS_TOKEN));
      expect(err).toBeInstanceOf(SpotifyAccountError);
      expect(err).toBeInstanceOf(PlaysetError);
      expect((err as SpotifyAccountError).status).toBe(status);
      expect(fetch).toHaveBeenCalledTimes(1);
      expectNoSecrets(err);
    });
  }

  it("AC-6: 429 three times → SpotifyAccountError of status 429 after exactly 3 requests, Retry-After honoured", async () => {
    const { deps, fetch, sleep } = setup([rateLimited(2), rateLimited(2), rateLimited(2), hostMe]);
    const err = await captureError(fetchSpotifyAccount(deps, HOST_ACCESS_TOKEN));
    expect(err).toBeInstanceOf(SpotifyAccountError);
    expect((err as SpotifyAccountError).status).toBe(429);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toEqual([[2000], [2000]]);
    expectNoSecrets(err);
  });

  it("AC-6: 429 once then 200 → waits Retry-After and resolves the account", async () => {
    const { deps, fetch, sleep } = setup([rateLimited(2), hostMe]);
    expect(await fetchSpotifyAccount(deps, HOST_ACCESS_TOKEN)).toStrictEqual({
      id: "31abcxyzhost",
      displayName: "playset-host",
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(sleep.mock.calls).toEqual([[2000]]);
  });

  for (const [label, answer] of [
    ["a non-JSON body", () => new Response("<html>oops</html>", { status: 200 })],
    ["an empty body", () => new Response("", { status: 200 })],
    ["a JSON null body", jsonResponse(200, null)],
  ] as const) {
    it(`AC-5: a 200 /me with ${label} rejects with a SpotifyAccountError without status`, async () => {
      const { deps } = setup([answer]);
      const err = await captureError(fetchSpotifyAccount(deps, HOST_ACCESS_TOKEN));
      expect(err).toBeInstanceOf(SpotifyAccountError);
      expect((err as SpotifyAccountError).status).toBeUndefined();
      expectNoSecrets(err);
    });
  }

  it("AC-6: a network failure rejects with a SpotifyAccountError without status", async () => {
    const { deps } = setup([networkFailure]);
    const err = await captureError(fetchSpotifyAccount(deps, HOST_ACCESS_TOKEN));
    expect(err).toBeInstanceOf(SpotifyAccountError);
    expect((err as SpotifyAccountError).status).toBeUndefined();
    expectNoSecrets(err);
  });
});
