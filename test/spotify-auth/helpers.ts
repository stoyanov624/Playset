// Shared fixtures and fakes for the spotify-auth tests (PRD 0004).
// Shapes follow Spotify's Accounts service responses as documented in the PRD examples.
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { vi } from "vitest";
import type { AuthorizationResult } from "../../src/core/spotify-auth";

export type Env = Record<string, string | undefined>;

// ---------------------------------------------------------------- constants

export const CLIENT_ID = "3f9a0c2e7b4d4e1f8a6b5c4d3e2f1a0b";
export const CONFIG_FILE_CLIENT_ID = "aaaabbbbccccdddd0000111122223333";
export const DEFAULT_REDIRECT_URI = "http://127.0.0.1:8888/callback";
export const AUTHORIZE_ENDPOINT = "https://accounts.spotify.com/authorize";
export const TOKEN_ENDPOINT = "https://accounts.spotify.com/api/token";
export const SCOPE = "playlist-modify-private playlist-modify-public playlist-read-private";

/** Fixed clock: 2026-11-26T18:00:00Z */
export const NOW = 1795716000000;

export const ACCESS_TOKEN = "BQDj8Zk2...access";
export const REFRESH_TOKEN = "AQCr7Yh1...refresh";
export const AUTH_CODE = "AQD3x9kLp2...Zq";
export const STATE = "q8Zr1xV0bT3kLmN9pQ2s";

/** RFC 7636 Appendix B test vector */
export const RFC_VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
export const RFC_CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

export const SECRETS = [ACCESS_TOKEN, REFRESH_TOKEN, RFC_VERIFIER, AUTH_CODE];

export const TOKEN_CACHE_FILE = "spotify-token.json";
export const CONFIG_FILE = "config.json";

// ---------------------------------------------------------------- Spotify responses

type ResponseFactory = () => Response | Promise<Response>;

export function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): ResponseFactory {
  return () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json", ...headers },
    });
}

export const codeExchangeSuccess = jsonResponse(200, {
  access_token: ACCESS_TOKEN,
  token_type: "Bearer",
  scope: SCOPE,
  expires_in: 3600,
  refresh_token: REFRESH_TOKEN,
});

export const codeExchangeInvalidGrant = jsonResponse(400, {
  error: "invalid_grant",
  error_description: "Invalid authorization code",
});

export const refreshWithoutNewRefreshToken = jsonResponse(200, {
  access_token: "BQNew111...access",
  token_type: "Bearer",
  scope: SCOPE,
  expires_in: 3600,
});

export const refreshWithRotatedRefreshToken = jsonResponse(200, {
  access_token: "BQNew222...access",
  token_type: "Bearer",
  scope: SCOPE,
  expires_in: 3600,
  refresh_token: "AQRotated...refresh",
});

export const refreshRevoked = jsonResponse(400, {
  error: "invalid_grant",
  error_description: "Refresh token revoked",
});

export const refreshInvalidClient = jsonResponse(400, {
  error: "invalid_client",
  error_description: "Invalid client",
});

export const serviceUnavailable: ResponseFactory = () => new Response("", { status: 503 });

export const networkFailure: ResponseFactory = () => Promise.reject(new TypeError("fetch failed"));

export function rateLimited(retryAfterSeconds = 2): ResponseFactory {
  return () =>
    new Response(JSON.stringify({ error: "rate_limited" }), {
      status: 429,
      headers: { "Content-Type": "application/json", "Retry-After": String(retryAfterSeconds) },
    });
}

// ---------------------------------------------------------------- fake fetch

export interface RecordedRequest {
  url: string;
  method: string;
  headers: Headers;
  body: URLSearchParams;
  rawBody: string;
}

export function makeFakeFetch(script: ResponseFactory[]) {
  const requests: RecordedRequest[] = [];
  let i = 0;
  const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const rawBody = init?.body == null ? "" : String(init.body);
    requests.push({
      url,
      method: (init?.method ?? "GET").toUpperCase(),
      headers: new Headers(init?.headers),
      body: new URLSearchParams(rawBody),
      rawBody,
    });
    const next = script[i++];
    if (!next) throw new Error(`Unexpected fetch #${i} to ${url}`);
    return next();
  });
  return { fetch, requests };
}

// ---------------------------------------------------------------- fake login hooks

/**
 * Fake "show/open URL" hook and fake callback receiver.
 * By default the receiver echoes back AUTH_CODE and the `state` found in the opened authorize URL,
 * which is what Spotify does after the user approves.
 */
export function makeFakeLoginHooks(
  respond: (sentState: string | null) => AuthorizationResult = (sentState) =>
    sentState === null ? { code: AUTH_CODE } : { code: AUTH_CODE, state: sentState },
) {
  const events: string[] = [];
  const openedUrls: string[] = [];
  const receiverRedirectUris: string[] = [];

  const openAuthorizeUrl = vi.fn(async (url: string) => {
    events.push("open");
    openedUrls.push(url);
  });

  const waitForCallback = vi.fn(async (): Promise<AuthorizationResult> => {
    events.push("wait");
    const last = openedUrls[openedUrls.length - 1];
    const sentState = last ? new URL(last).searchParams.get("state") : null;
    return respond(sentState);
  });

  const close = vi.fn(async () => {
    events.push("close");
  });

  const startCallbackReceiver = vi.fn(async (redirectUri: string) => {
    events.push("start");
    receiverRedirectUris.push(redirectUri);
    return { waitForCallback, close };
  });

  return { openAuthorizeUrl, startCallbackReceiver, waitForCallback, close, events, openedUrls, receiverRedirectUris };
}

// ---------------------------------------------------------------- temp config dir

export async function makeTempRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), "playset-test-"));
}

export async function removeTempRoot(root: string): Promise<void> {
  await rm(root, { recursive: true, force: true });
}

export async function writeConfigFile(configDir: string, content: string): Promise<void> {
  await mkdir(configDir, { recursive: true });
  await writeFile(join(configDir, CONFIG_FILE), content);
}

export interface CachedTokens {
  refreshToken?: string;
  accessToken?: string;
  expiresAt?: number;
}

export async function writeTokenCache(configDir: string, content: CachedTokens | string, mode = 0o600): Promise<void> {
  await mkdir(configDir, { recursive: true, mode: 0o700 });
  const file = join(configDir, TOKEN_CACHE_FILE);
  await writeFile(file, typeof content === "string" ? content : JSON.stringify(content, null, 2));
  await chmod(file, mode);
}

export async function readTokenCacheRaw(configDir: string): Promise<string | null> {
  try {
    return await readFile(join(configDir, TOKEN_CACHE_FILE), "utf8");
  } catch {
    return null;
  }
}

export async function readTokenCache(configDir: string): Promise<CachedTokens | null> {
  const raw = await readTokenCacheRaw(configDir);
  return raw === null ? null : (JSON.parse(raw) as CachedTokens);
}

export async function fileMode(path: string): Promise<number> {
  return (await stat(path)).mode & 0o777;
}

// ---------------------------------------------------------------- misc

export function base64urlSha256(input: string): string {
  return createHash("sha256").update(input).digest("base64url");
}

/** Everything a front-end might show the user for an error. */
export function errorText(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const hint = (err as { hint?: unknown }).hint;
  return [err.name, err.message, typeof hint === "string" ? hint : "", String(err)].join("\n");
}

export async function captureError(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  throw new Error("Expected the promise to reject, but it resolved");
}

export function captureSyncError(fn: () => unknown): unknown {
  try {
    fn();
  } catch (err) {
    return err;
  }
  throw new Error("Expected the function to throw, but it returned");
}
