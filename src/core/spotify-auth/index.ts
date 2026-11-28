// Spotify login with Authorization Code + PKCE (no client secret): the client id and redirect URI, the
// cached and refreshed access token, the callback receiver on 127.0.0.1, and the same login as separate
// stateless calls for front-ends that run the login themselves.
export { resolveClientId, resolveRedirectUri, type Env } from "./config.js";
export {
  CODE_CHALLENGE_METHOD,
  buildAuthorizeUrl,
  computeCodeChallenge,
  generateCodeVerifier,
  generateState,
} from "./pkce.js";
export type { AuthorizationResult, CallbackReceiver } from "./login.js";
export { getAccessToken, type SpotifyAuthDeps } from "./access-token.js";
export { startLoopbackReceiver } from "./loopback-receiver.js";
export {
  exchangeAuthorizationCode,
  fetchSpotifyAccount,
  refreshAccessToken,
  type SpotifyAccount,
  type TokenGrant,
} from "./stateless.js";
export {
  AccessDeniedError,
  AuthorizationError,
  InvalidPortError,
  MissingClientIdError,
  PortInUseError,
  RateLimitError,
  SpotifyAccountError,
  StateMismatchError,
  TokenError,
} from "./errors.js";
