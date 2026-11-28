import { HttpError, createRequester, type FetchLike, type Sleep } from "../http/index.js";
import { RateLimitError, TokenError } from "./errors.js";

const TOKEN_ENDPOINT = "https://accounts.spotify.com/api/token";
const MAX_TOKEN_ATTEMPTS = 3;
/** OAuth errors: Spotify explains them in the body's `error` and `error_description`. */
const OAUTH_ERROR_STATUSES = [400, 401, 403];
/** Form fields that must never appear in an error. */
const SECRET_FIELDS = ["code", "code_verifier", "refresh_token"];

export interface TokenEndpointDeps {
  fetch: FetchLike;
  sleep: Sleep;
  now: () => number;
}

/** What the token endpoint gave: a code exchange always carries a refresh token, a refresh may not. */
export interface TokenAnswer {
  accessToken: string;
  refreshToken?: string;
  /** Absolute expiry, epoch ms: time of response + expires_in. */
  expiresAt: number;
}

/**
 * One form-encoded POST to Spotify's token endpoint (no client secret, no Authorization header).
 * Retries on 429 honouring Retry-After, at most MAX_TOKEN_ATTEMPTS in total.
 */
export async function requestToken(deps: TokenEndpointDeps, form: Record<string, string>): Promise<TokenAnswer> {
  const request = createRequester(
    {
      name: "Spotify's token endpoint",
      maxAttempts: MAX_TOKEN_ATTEMPTS,
      secrets: () => SECRET_FIELDS.map((field) => form[field] ?? ""),
      passThroughStatuses: OAUTH_ERROR_STATUSES,
    },
    deps,
  );

  let response: Response;
  try {
    response = await request(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(form).toString(),
    });
  } catch (err) {
    throw toTokenError(err);
  }
  const receivedAt = deps.now();

  const payload = await readJson(response);
  if (!response.ok) throw tokenErrorFrom(response.status, payload);
  return toGrant(payload, receivedAt);
}

function toTokenError(err: unknown): unknown {
  if (!(err instanceof HttpError)) return err;
  if (err.kind === "rate-limited") return new RateLimitError(MAX_TOKEN_ATTEMPTS, { cause: err });
  if (err.kind === "status" && err.status !== undefined) return tokenErrorFrom(err.status, null, err);
  return new TokenError("Could not reach Spotify's token endpoint (network error).", undefined, { cause: err });
}

async function readJson(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const parsed: unknown = JSON.parse(await response.text());
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function tokenErrorFrom(status: number, payload: Record<string, unknown> | null, cause?: HttpError): TokenError {
  const error = typeof payload?.error === "string" ? payload.error : undefined;
  const description = typeof payload?.error_description === "string" ? payload.error_description : undefined;
  const detail = [error, description].filter(Boolean).join(": ");
  return new TokenError(`Spotify's token endpoint answered HTTP ${status}${detail ? ` (${detail})` : ""}.`, error, {
    cause,
  });
}

function toGrant(payload: Record<string, unknown> | null, receivedAt: number): TokenAnswer {
  const accessToken = payload?.access_token;
  const expiresIn = payload?.expires_in;
  if (typeof accessToken !== "string" || accessToken === "" || typeof expiresIn !== "number") {
    throw new TokenError("Spotify's token endpoint sent an unexpected response.");
  }
  const grant: TokenAnswer = { accessToken, expiresAt: receivedAt + expiresIn * 1000 };
  if (typeof payload?.refresh_token === "string" && payload.refresh_token !== "") {
    grant.refreshToken = payload.refresh_token;
  }
  return grant;
}
