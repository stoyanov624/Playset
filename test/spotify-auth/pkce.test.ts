import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CODE_CHALLENGE_METHOD,
  buildAuthorizeUrl,
  computeCodeChallenge,
  generateCodeVerifier,
  generateState,
  getAccessToken,
} from "../../src/core/spotify-auth";
import {
  AUTHORIZE_ENDPOINT,
  CLIENT_ID,
  DEFAULT_REDIRECT_URI,
  NOW,
  RFC_CHALLENGE,
  RFC_VERIFIER,
  SCOPE,
  STATE,
  base64urlSha256,
  codeExchangeSuccess,
  makeFakeFetch,
  makeFakeLoginHooks,
  makeTempRoot,
  removeTempRoot,
} from "./helpers";

const VERIFIER_PATTERN = /^[A-Za-z0-9\-._~]{43,128}$/;
const URL_SAFE_STATE_PATTERN = /^[A-Za-z0-9\-._~]{16,}$/;

let root: string;

beforeEach(async () => {
  root = await makeTempRoot();
});

afterEach(async () => {
  await removeTempRoot(root);
});

/** Runs two full logins (each in a fresh config dir) and returns what was sent to Spotify. */
async function runTwoLogins() {
  const runs: Array<{ verifier: string | null; state: string | null; challenge: string | null }> = [];
  for (const name of ["first", "second"]) {
    const { fetch, requests } = makeFakeFetch([codeExchangeSuccess]);
    const hooks = makeFakeLoginHooks();
    await getAccessToken({
      configDir: join(root, name),
      env: { SPOTIFY_CLIENT_ID: CLIENT_ID },
      fetch,
      sleep: async () => {},
      now: () => NOW,
      openAuthorizeUrl: hooks.openAuthorizeUrl,
      startCallbackReceiver: hooks.startCallbackReceiver,
    });
    const authorize = new URL(hooks.openedUrls[0]!);
    runs.push({
      verifier: requests[0]!.body.get("code_verifier"),
      state: authorize.searchParams.get("state"),
      challenge: authorize.searchParams.get("code_challenge"),
    });
  }
  return runs;
}

describe("PKCE code verifier", () => {
  it("AC-7: the code verifier is 43-128 unreserved characters", async () => {
    for (let i = 0; i < 20; i++) {
      const verifier = await generateCodeVerifier();
      expect(verifier).toMatch(VERIFIER_PATTERN);
    }
  });

  it("AC-7: the code verifier is different each time", async () => {
    const verifiers = new Set<string>();
    for (let i = 0; i < 20; i++) verifiers.add(await generateCodeVerifier());
    expect(verifiers.size).toBe(20);
  });

  it("AC-7: two logins in a row send two different valid code verifiers", async () => {
    const [first, second] = await runTwoLogins();
    expect(first!.verifier).toMatch(VERIFIER_PATTERN);
    expect(second!.verifier).toMatch(VERIFIER_PATTERN);
    expect(first!.verifier).not.toBe(second!.verifier);
  });
});

describe("PKCE code challenge", () => {
  it("AC-8: matches the RFC 7636 Appendix B test vector", async () => {
    expect(await computeCodeChallenge(RFC_VERIFIER)).toBe(RFC_CHALLENGE);
  });

  it("AC-8: is base64url without padding and the method is S256", async () => {
    expect(CODE_CHALLENGE_METHOD).toBe("S256");
    for (let i = 0; i < 20; i++) {
      const verifier = await generateCodeVerifier();
      const challenge = await computeCodeChallenge(verifier);
      expect(challenge).toBe(base64urlSha256(verifier));
      expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(challenge).not.toMatch(/[=+/]/);
    }
  });

  it("AC-8: the challenge sent in the authorize URL is the S256 challenge of the verifier sent to the token endpoint", async () => {
    const runs = await runTwoLogins();
    for (const run of runs) {
      expect(run.challenge).toBe(base64urlSha256(run.verifier!));
    }
  });
});

describe("state", () => {
  it("AC-9: the state is URL-safe and at least 16 characters", async () => {
    for (let i = 0; i < 20; i++) {
      expect(await generateState()).toMatch(URL_SAFE_STATE_PATTERN);
    }
  });

  it("AC-9: the state is different each time", async () => {
    const states = new Set<string>();
    for (let i = 0; i < 20; i++) states.add(await generateState());
    expect(states.size).toBe(20);
  });

  it("AC-9: two logins in a row send two different valid states", async () => {
    const [first, second] = await runTwoLogins();
    expect(first!.state).toMatch(URL_SAFE_STATE_PATTERN);
    expect(second!.state).toMatch(URL_SAFE_STATE_PATTERN);
    expect(first!.state).not.toBe(second!.state);
  });
});

describe("authorize URL", () => {
  it("AC-10: points at Spotify's authorize endpoint with exactly the required query parameters", () => {
    const url = buildAuthorizeUrl({
      clientId: CLIENT_ID,
      redirectUri: DEFAULT_REDIRECT_URI,
      state: STATE,
      codeChallenge: RFC_CHALLENGE,
    });
    const parsed = new URL(url);
    expect(`${parsed.origin}${parsed.pathname}`).toBe(AUTHORIZE_ENDPOINT);
    expect([...parsed.searchParams.keys()].sort()).toEqual(
      ["client_id", "code_challenge", "code_challenge_method", "redirect_uri", "response_type", "scope", "state"].sort(),
    );
    expect(Object.fromEntries(parsed.searchParams)).toEqual({
      client_id: CLIENT_ID,
      response_type: "code",
      redirect_uri: DEFAULT_REDIRECT_URI,
      scope: SCOPE,
      state: STATE,
      code_challenge_method: "S256",
      code_challenge: RFC_CHALLENGE,
    });
  });

  it("AC-10: URL-encodes the redirect URI and the scope", () => {
    const url = buildAuthorizeUrl({
      clientId: CLIENT_ID,
      redirectUri: DEFAULT_REDIRECT_URI,
      state: STATE,
      codeChallenge: RFC_CHALLENGE,
    });
    expect(url).toContain("redirect_uri=http%3A%2F%2F127.0.0.1%3A8888%2Fcallback");
    expect(url).toMatch(
      /scope=playlist-modify-private(\+|%20)playlist-modify-public(\+|%20)playlist-read-private(&|$)/,
    );
  });

  it("AC-10: contains no client secret", () => {
    const url = buildAuthorizeUrl({
      clientId: CLIENT_ID,
      redirectUri: DEFAULT_REDIRECT_URI,
      state: STATE,
      codeChallenge: RFC_CHALLENGE,
    });
    expect(url.toLowerCase()).not.toContain("secret");
  });
});
