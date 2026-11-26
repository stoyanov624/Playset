import { RateLimitError, TokenError } from "./errors";

export const TOKEN_ENDPOINT = "https://accounts.spotify.com/api/token";
export const MAX_TOKEN_ATTEMPTS = 3;
const DEFAULT_RETRY_AFTER_SECONDS = 1;

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface TokenEndpointDeps {
  fetch: FetchLike;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
}

export interface TokenGrant {
  accessToken: string;
  refreshToken?: string;
  /** Absolute expiry, epoch ms: time of response + expires_in. */
  expiresAt: number;
}

/**
 * One form-encoded POST to Spotify's token endpoint (no client secret, no Authorization header).
 * Retries on 429 honouring Retry-After, at most MAX_TOKEN_ATTEMPTS in total.
 */
export async function requestToken(deps: TokenEndpointDeps, form: Record<string, string>): Promise<TokenGrant> {
  const body = new URLSearchParams(form).toString();
  for (let attempt = 1; ; attempt++) {
    let response: Response;
    try {
      response = await deps.fetch(TOKEN_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
    } catch {
      throw new TokenError("Could not reach Spotify's token endpoint (network error).");
    }
    const receivedAt = deps.now();

    if (response.status === 429) {
      if (attempt >= MAX_TOKEN_ATTEMPTS) throw new RateLimitError(attempt);
      await deps.sleep(retryAfterMs(response.headers.get("Retry-After")));
      continue;
    }

    const payload = await readJson(response);
    if (!response.ok) throw tokenErrorFrom(response.status, payload);
    return toGrant(payload, receivedAt);
  }
}

function retryAfterMs(header: string | null): number {
  const seconds = header === null ? NaN : Number(header);
  return (Number.isFinite(seconds) && seconds >= 0 ? seconds : DEFAULT_RETRY_AFTER_SECONDS) * 1000;
}

async function readJson(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const parsed: unknown = JSON.parse(await response.text());
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function tokenErrorFrom(status: number, payload: Record<string, unknown> | null): TokenError {
  const error = typeof payload?.error === "string" ? payload.error : undefined;
  const description = typeof payload?.error_description === "string" ? payload.error_description : undefined;
  const detail = [error, description].filter(Boolean).join(": ");
  return new TokenError(`Spotify's token endpoint answered HTTP ${status}${detail ? ` (${detail})` : ""}.`, error);
}

function toGrant(payload: Record<string, unknown> | null, receivedAt: number): TokenGrant {
  const accessToken = payload?.access_token;
  const expiresIn = payload?.expires_in;
  if (typeof accessToken !== "string" || accessToken === "" || typeof expiresIn !== "number") {
    throw new TokenError("Spotify's token endpoint sent an unexpected response.");
  }
  const grant: TokenGrant = { accessToken, expiresAt: receivedAt + expiresIn * 1000 };
  if (typeof payload?.refresh_token === "string" && payload.refresh_token !== "") {
    grant.refreshToken = payload.refresh_token;
  }
  return grant;
}
