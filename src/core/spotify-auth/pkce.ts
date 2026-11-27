import { createHash, randomBytes } from "node:crypto";

export const CODE_CHALLENGE_METHOD = "S256" as const;
const AUTHORIZE_ENDPOINT = "https://accounts.spotify.com/authorize";
const SCOPES = ["playlist-modify-private", "playlist-modify-public", "playlist-read-private"] as const;

/** 86 base64url characters (a subset of RFC 7636's unreserved characters). */
export function generateCodeVerifier(): string {
  return randomBytes(64).toString("base64url");
}

/** base64url(SHA-256(verifier)), no padding. */
export function computeCodeChallenge(codeVerifier: string): string {
  return createHash("sha256").update(codeVerifier).digest("base64url");
}

/** 32 random URL-safe characters. */
export function generateState(): string {
  return randomBytes(24).toString("base64url");
}

export function buildAuthorizeUrl(p: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): string {
  const query = new URLSearchParams({
    client_id: p.clientId,
    response_type: "code",
    redirect_uri: p.redirectUri,
    scope: SCOPES.join(" "),
    state: p.state,
    code_challenge_method: CODE_CHALLENGE_METHOD,
    code_challenge: p.codeChallenge,
  });
  return `${AUTHORIZE_ENDPOINT}?${query.toString()}`;
}
