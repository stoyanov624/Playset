// Spotify login (PRD 0004): client id + redirect URI config, PKCE, token cache, and the loopback callback receiver.
export { resolveClientId, resolveRedirectUri, type Env } from "./config";
export {
  CODE_CHALLENGE_METHOD,
  buildAuthorizeUrl,
  computeCodeChallenge,
  generateCodeVerifier,
  generateState,
} from "./pkce";
export type { FetchLike } from "./token-endpoint";
export type { AuthorizationResult, CallbackReceiver } from "./login";
export { getAccessToken, type SpotifyAuthDeps } from "./access-token";
export { startLoopbackReceiver } from "./loopback-receiver";
export {
  AccessDeniedError,
  AuthorizationError,
  InvalidPortError,
  MissingClientIdError,
  PortInUseError,
  RateLimitError,
  StateMismatchError,
  TokenError,
} from "./errors";
