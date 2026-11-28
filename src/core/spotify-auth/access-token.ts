import { processEnv, settingsStoreFor, type SettingsStore, type SpotifyTokens } from "../settings/index.js";
import { resolveClientId, resolveRedirectUri, type Env } from "./config.js";
import { TokenError } from "./errors.js";
import { runLogin, type LoginDeps } from "./login.js";
import { requestToken, type TokenAnswer } from "./token-endpoint.js";

/** A cached access token is reused only while its expiry is more than this far away. */
const EXPIRY_MARGIN_MS = 60_000;

export interface SpotifyAuthDeps extends LoginDeps {
  /** Defaults to ~/.config/playset/; used only when no `settings` store is given. */
  configDir?: string;
  /** Defaults to process.env. Gives PLAYSET_AUTH_PORT, and the settings when no `settings` store is given. */
  env?: Env;
  /** Where the client id and the token cache live. Defaults to the file store built from `env` and `configDir`. */
  settings?: SettingsStore;
}

/** A valid Spotify access token: cached, refreshed, or from a full PKCE login. */
export async function getAccessToken(deps: SpotifyAuthDeps): Promise<string> {
  const env = deps.env ?? processEnv();
  const settings = settingsStoreFor({ ...deps, env });
  const clientId = await resolveClientId({ env, settings });
  const redirectUri = resolveRedirectUri(env);

  const cached = await settings.readSpotifyTokens();
  if (cached && isFresh(cached, deps.now())) return cached.accessToken;

  if (cached) {
    const refreshed = await refresh(deps, clientId, cached.refreshToken);
    if (refreshed) return keep(settings, refreshed, cached.refreshToken);
  }

  const grant = await runLogin(deps, clientId, redirectUri);
  return keep(settings, grant);
}

function isFresh(tokens: SpotifyTokens, now: number): boolean {
  return tokens.accessToken !== "" && tokens.expiresAt - now > EXPIRY_MARGIN_MS;
}

/** Returns null when Spotify rejected the refresh token (invalid_grant) so a full login should run. */
async function refresh(deps: SpotifyAuthDeps, clientId: string, refreshToken: string): Promise<TokenAnswer | null> {
  try {
    return await requestToken(deps, { grant_type: "refresh_token", refresh_token: refreshToken, client_id: clientId });
  } catch (err) {
    if (err instanceof TokenError && err.spotifyError === "invalid_grant") return null;
    throw err;
  }
}

/** Caches the grant's tokens, keeping the previous refresh token when Spotify sent no new one. */
async function keep(settings: SettingsStore, grant: TokenAnswer, previousRefreshToken?: string): Promise<string> {
  const refreshToken = grant.refreshToken ?? previousRefreshToken;
  if (!refreshToken) throw new TokenError("Spotify's token endpoint sent no refresh token.");
  await settings.writeSpotifyTokens({ refreshToken, accessToken: grant.accessToken, expiresAt: grant.expiresAt });
  return grant.accessToken;
}
