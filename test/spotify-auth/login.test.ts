import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AccessDeniedError,
  AuthorizationError,
  StateMismatchError,
  TokenError,
  getAccessToken,
  type AuthorizationResult,
} from "../../src/core/spotify-auth";
import {
  ACCESS_TOKEN,
  AUTHORIZE_ENDPOINT,
  AUTH_CODE,
  CLIENT_ID,
  DEFAULT_REDIRECT_URI,
  NOW,
  REFRESH_TOKEN,
  RFC_CHALLENGE,
  RFC_VERIFIER,
  STATE,
  TOKEN_ENDPOINT,
  base64urlSha256,
  captureError,
  codeExchangeInvalidGrant,
  codeExchangeSuccess,
  errorText,
  makeFakeFetch,
  makeFakeLoginHooks,
  makeTempRoot,
  readTokenCache,
  readTokenCacheRaw,
  removeTempRoot,
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

function setup(
  script: Parameters<typeof makeFakeFetch>[0],
  respond?: (sentState: string | null) => AuthorizationResult,
  extra: { generateCodeVerifier?: () => string; generateState?: () => string } = {},
) {
  const fake = makeFakeFetch(script);
  const hooks = makeFakeLoginHooks(respond);
  const deps = {
    configDir,
    env: { SPOTIFY_CLIENT_ID: CLIENT_ID },
    fetch: fake.fetch,
    sleep: vi.fn(async (_ms: number) => {}),
    now: () => NOW,
    openAuthorizeUrl: hooks.openAuthorizeUrl,
    startCallbackReceiver: hooks.startCallbackReceiver,
    ...extra,
  };
  return { deps, hooks, ...fake };
}

describe("full login", () => {
  it("AC-11: passes the authorize URL to the show/open URL hook exactly once, then awaits the callback receiver", async () => {
    const { deps, hooks } = setup([codeExchangeSuccess]);
    await getAccessToken(deps);
    expect(hooks.openAuthorizeUrl).toHaveBeenCalledTimes(1);
    const url = hooks.openAuthorizeUrl.mock.calls[0]![0];
    expect(url.startsWith(`${AUTHORIZE_ENDPOINT}?`)).toBe(true);
    expect(hooks.waitForCallback).toHaveBeenCalledTimes(1);
    expect(hooks.events.indexOf("open")).toBeLessThan(hooks.events.indexOf("wait"));
  });

  it("AC-11: starts the callback receiver for the redirect URI before showing the authorize URL", async () => {
    const { deps, hooks } = setup([codeExchangeSuccess]);
    await getAccessToken(deps);
    expect(hooks.startCallbackReceiver).toHaveBeenCalledTimes(1);
    expect(hooks.receiverRedirectUris).toEqual([DEFAULT_REDIRECT_URI]);
    expect(hooks.events.slice(0, 3)).toEqual(["start", "open", "wait"]);
  });

  it("AC-12: exchanges the code with one form-encoded POST to the token endpoint, with no client secret or Authorization header", async () => {
    const { deps, hooks, fetch, requests } = setup([codeExchangeSuccess]);
    await getAccessToken(deps);

    expect(fetch).toHaveBeenCalledTimes(1);
    const req = requests[0]!;
    expect(req.url).toBe(TOKEN_ENDPOINT);
    expect(req.method).toBe("POST");
    expect(req.headers.get("content-type")).toMatch(/^application\/x-www-form-urlencoded/);
    expect(req.headers.has("authorization")).toBe(false);
    expect(req.rawBody.toLowerCase()).not.toContain("secret");

    const authorize = new URL(hooks.openedUrls[0]!);
    expect([...req.body.keys()].sort()).toEqual(
      ["client_id", "code", "code_verifier", "grant_type", "redirect_uri"].sort(),
    );
    expect(req.body.get("grant_type")).toBe("authorization_code");
    expect(req.body.get("code")).toBe(AUTH_CODE);
    expect(req.body.get("client_id")).toBe(CLIENT_ID);
    expect(req.body.get("redirect_uri")).toBe(authorize.searchParams.get("redirect_uri"));
    expect(req.body.get("redirect_uri")).toBe(DEFAULT_REDIRECT_URI);
    // the verifier sent is the one whose challenge was in the authorize URL
    expect(base64urlSha256(req.body.get("code_verifier")!)).toBe(authorize.searchParams.get("code_challenge"));
  });

  it("AC-12: sends the PRD example token request body for the RFC 7636 verifier and the example state", async () => {
    const { deps, hooks, requests } = setup([codeExchangeSuccess], undefined, {
      generateCodeVerifier: () => RFC_VERIFIER,
      generateState: () => STATE,
    });
    await getAccessToken(deps);

    const authorize = new URL(hooks.openedUrls[0]!);
    expect(authorize.searchParams.get("state")).toBe(STATE);
    expect(authorize.searchParams.get("code_challenge")).toBe(RFC_CHALLENGE);

    expect(Object.fromEntries(requests[0]!.body)).toEqual({
      grant_type: "authorization_code",
      code: AUTH_CODE,
      redirect_uri: DEFAULT_REDIRECT_URI,
      client_id: CLIENT_ID,
      code_verifier: RFC_VERIFIER,
    });
  });

  it("AC-13: raises a state-mismatch error and makes no token request when the callback state differs", async () => {
    const { deps, fetch } = setup([codeExchangeSuccess], () => ({ code: AUTH_CODE, state: "WRONGstate0000000000" }));
    const err = await captureError(getAccessToken(deps));
    expect(err).toBeInstanceOf(StateMismatchError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("AC-13: raises a state-mismatch error and makes no token request when the callback has no state", async () => {
    const { deps, fetch } = setup([codeExchangeSuccess], () => ({ code: AUTH_CODE }));
    const err = await captureError(getAccessToken(deps));
    expect(err).toBeInstanceOf(StateMismatchError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("AC-14: raises an access-denied error saying the Spotify login was declined, with no token request", async () => {
    const { deps, fetch } = setup([codeExchangeSuccess], (state) => ({
      error: "access_denied",
      ...(state === null ? {} : { state }),
    }));
    const err = await captureError(getAccessToken(deps));
    expect(err).toBeInstanceOf(AccessDeniedError);
    expect(errorText(err)).toMatch(/declined/i);
    expect(errorText(err)).toMatch(/spotify/i);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("AC-14: raises an authorization error that includes any other error value, with no token request", async () => {
    const { deps, fetch } = setup([codeExchangeSuccess], (state) => ({
      error: "server_error",
      ...(state === null ? {} : { state }),
    }));
    const err = await captureError(getAccessToken(deps));
    expect(err).toBeInstanceOf(AuthorizationError);
    expect(err).not.toBeInstanceOf(AccessDeniedError);
    expect(errorText(err)).toContain("server_error");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("AC-15: raises an authorization error with no token request when the callback has neither code nor error", async () => {
    const { deps, fetch } = setup([codeExchangeSuccess], (state) => (state === null ? {} : { state }));
    const err = await captureError(getAccessToken(deps));
    expect(err).toBeInstanceOf(AuthorizationError);
    expect(err).not.toBeInstanceOf(AccessDeniedError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("AC-16: returns the access token from a successful code exchange and writes the token cache", async () => {
    const { deps } = setup([codeExchangeSuccess]);
    const token = await getAccessToken(deps);
    expect(token).toBe(ACCESS_TOKEN);
    const cache = await readTokenCache(configDir);
    expect(cache).toEqual({ refreshToken: REFRESH_TOKEN, accessToken: ACCESS_TOKEN, expiresAt: NOW + 3600 * 1000 });
  });

  it("AC-17: raises a token error with Spotify's error and error_description when the code exchange is rejected", async () => {
    const { deps } = setup([codeExchangeInvalidGrant]);
    const err = await captureError(getAccessToken(deps));
    expect(err).toBeInstanceOf(TokenError);
    expect(errorText(err)).toContain("invalid_grant");
    expect(errorText(err)).toContain("Invalid authorization code");
  });

  it("AC-17: leaves a missing token cache missing when the code exchange is rejected", async () => {
    const { deps } = setup([codeExchangeInvalidGrant]);
    await captureError(getAccessToken(deps));
    expect(await readTokenCacheRaw(configDir)).toBeNull();
  });

  it("AC-17: leaves an existing token cache byte-for-byte unchanged when the code exchange is rejected", async () => {
    await writeTokenCache(configDir, "not json");
    const before = await readTokenCacheRaw(configDir);
    const { deps } = setup([codeExchangeInvalidGrant]);
    const err = await captureError(getAccessToken(deps));
    expect(err).toBeInstanceOf(TokenError);
    expect(await readTokenCacheRaw(configDir)).toBe(before);
  });
});
