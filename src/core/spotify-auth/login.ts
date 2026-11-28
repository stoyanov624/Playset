import { AccessDeniedError, AuthorizationError, StateMismatchError, TokenError } from "./errors.js";
import { buildAuthorizeUrl, computeCodeChallenge, generateCodeVerifier, generateState } from "./pkce.js";
import { requestToken, type TokenEndpointDeps, type TokenAnswer } from "./token-endpoint.js";

/** What the redirect URI received from Spotify. */
export interface AuthorizationResult {
  code?: string;
  state?: string;
  error?: string;
}

/** Receives the single authorization callback. Owned by the front-end (timeouts, cancellation). */
export interface CallbackReceiver {
  waitForCallback(): Promise<AuthorizationResult>;
  close(): Promise<void>;
}

export interface LoginDeps extends TokenEndpointDeps {
  openAuthorizeUrl: (url: string) => void | Promise<void>;
  startCallbackReceiver: (redirectUri: string) => Promise<CallbackReceiver>;
  generateCodeVerifier?: () => string;
  generateState?: () => string;
}

/** Full Authorization Code + PKCE login: start receiver → show authorize URL → await callback → exchange code. */
export async function runLogin(deps: LoginDeps, clientId: string, redirectUri: string): Promise<TokenAnswer> {
  const codeVerifier = (deps.generateCodeVerifier ?? generateCodeVerifier)();
  const state = (deps.generateState ?? generateState)();
  const authorizeUrl = buildAuthorizeUrl({
    clientId,
    redirectUri,
    state,
    codeChallenge: computeCodeChallenge(codeVerifier),
  });

  const receiver = await deps.startCallbackReceiver(redirectUri);
  let result: AuthorizationResult;
  try {
    await deps.openAuthorizeUrl(authorizeUrl);
    result = await receiver.waitForCallback();
  } finally {
    await receiver.close();
  }

  const code = checkCallback(result, state);
  const grant = await requestToken(deps, {
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    code_verifier: codeVerifier,
  });
  if (!grant.refreshToken) throw new TokenError("Spotify's token endpoint sent no refresh token.");
  return grant;
}

/**
 * Returns the authorization code. A reported error wins; then the state must be ours (else the callback
 * may come from someone else's login); only then is a code looked for.
 */
function checkCallback(result: AuthorizationResult, expectedState: string): string {
  if (result.error !== undefined) {
    if (result.error === "access_denied") throw new AccessDeniedError();
    throw new AuthorizationError(`The Spotify login failed: ${result.error}.`);
  }
  if (result.state !== expectedState) throw new StateMismatchError();
  if (!result.code) throw new AuthorizationError("The Spotify login callback carried no authorization code.");
  return result.code;
}
