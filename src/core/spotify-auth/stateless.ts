// The Spotify login as separate calls, for a front-end that runs the login itself (the web server's
// admin login): exchange the code, refresh, and ask Spotify who logged in. They read and write nothing;
// the caller keeps the tokens.
import { HttpError, createRequester } from "../http/index.js";
import { SpotifyAccountError, TokenError } from "./errors.js";
import { requestToken, type TokenEndpointDeps } from "./token-endpoint.js";

const ME_ENDPOINT = "https://api.spotify.com/v1/me";
const MAX_ACCOUNT_ATTEMPTS = 3;

/** A complete login: the refresh token is always there. */
export interface TokenGrant {
  accessToken: string;
  refreshToken: string;
  /** Absolute expiry, epoch ms: time of response + expires_in. */
  expiresAt: number;
}

/** The Spotify account an access token belongs to. */
export interface SpotifyAccount {
  id: string;
  displayName?: string;
}

/** Exchanges an authorization code (Authorization Code + PKCE, no client secret) for a grant. */
export async function exchangeAuthorizationCode(
  deps: TokenEndpointDeps,
  p: { clientId: string; redirectUri: string; code: string; codeVerifier: string },
): Promise<TokenGrant> {
  const answer = await requestToken(deps, {
    grant_type: "authorization_code",
    code: p.code,
    redirect_uri: p.redirectUri,
    client_id: p.clientId,
    code_verifier: p.codeVerifier,
  });
  if (!answer.refreshToken) throw new TokenError("Spotify's token endpoint sent no refresh token.");
  return { accessToken: answer.accessToken, refreshToken: answer.refreshToken, expiresAt: answer.expiresAt };
}

/** Refreshes an access token; Spotify may rotate the refresh token, else the given one stays valid. */
export async function refreshAccessToken(
  deps: TokenEndpointDeps,
  p: { clientId: string; refreshToken: string },
): Promise<TokenGrant> {
  const answer = await requestToken(deps, {
    grant_type: "refresh_token",
    refresh_token: p.refreshToken,
    client_id: p.clientId,
  });
  return {
    accessToken: answer.accessToken,
    refreshToken: answer.refreshToken ?? p.refreshToken,
    expiresAt: answer.expiresAt,
  };
}

/** Who the access token belongs to (`GET /v1/me`). */
export async function fetchSpotifyAccount(deps: TokenEndpointDeps, accessToken: string): Promise<SpotifyAccount> {
  const request = createRequester(
    {
      name: "Spotify's account endpoint",
      maxAttempts: MAX_ACCOUNT_ATTEMPTS,
      secrets: () => [accessToken],
      allowedUrlPrefixes: [ME_ENDPOINT],
    },
    deps,
  );

  let payload: unknown;
  try {
    const response = await request(ME_ENDPOINT, { headers: { Authorization: `Bearer ${accessToken}` } });
    payload = await response.json();
  } catch (err) {
    if (err instanceof HttpError) {
      throw new SpotifyAccountError(`Spotify couldn't say who logged in: ${err.message}`, {
        status: err.status,
        cause: err,
      });
    }
    throw new SpotifyAccountError("Spotify's account endpoint sent an unexpected response.", { cause: err });
  }

  const { id, display_name: displayName } = (payload ?? {}) as { id?: unknown; display_name?: unknown };
  if (typeof id !== "string" || id === "") {
    throw new SpotifyAccountError("Spotify's account endpoint sent no account id.");
  }
  return typeof displayName === "string" && displayName !== "" ? { id, displayName } : { id };
}
