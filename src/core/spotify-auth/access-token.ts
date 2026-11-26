import { defaultConfigDir, resolveClientId, resolveRedirectUri, type Env } from "./config";
import { TokenError } from "./errors";
import { runLogin, type LoginDeps } from "./login";
import { readTokenCache, writeTokenCache, type TokenCache } from "./token-cache";
import { requestToken, type TokenGrant } from "./token-endpoint";

/** A cached access token is reused only while its expiry is more than this far away. */
export const EXPIRY_MARGIN_MS = 60_000;

export interface SpotifyAuthDeps extends LoginDeps {
  /** Defaults to ~/.config/playset/. */
  configDir?: string;
  /** Defaults to process.env. */
  env?: Env;
}

/** A valid Spotify access token: cached, refreshed, or from a full PKCE login. */
export async function getAccessToken(deps: SpotifyAuthDeps): Promise<string> {
  const env = deps.env ?? process.env;
  const configDir = deps.configDir ?? defaultConfigDir();
  const clientId = await resolveClientId({ env, configDir });
  const redirectUri = resolveRedirectUri(env);

  const cache = await readTokenCache(configDir);
  if (cache && isFresh(cache, deps.now())) return cache.accessToken;

  if (cache) {
    const refreshed = await refresh(deps, clientId, cache.refreshToken);
    if (refreshed) return store(configDir, refreshed, cache.refreshToken);
  }

  const grant = await runLogin(deps, clientId, redirectUri);
  return store(configDir, grant);
}

function isFresh(cache: TokenCache, now: number): cache is TokenCache & { accessToken: string } {
  return cache.accessToken !== undefined && cache.expiresAt !== undefined && cache.expiresAt - now > EXPIRY_MARGIN_MS;
}

/** Returns null when Spotify rejected the refresh token (invalid_grant) so a full login should run. */
async function refresh(deps: SpotifyAuthDeps, clientId: string, refreshToken: string): Promise<TokenGrant | null> {
  try {
    return await requestToken(deps, { grant_type: "refresh_token", refresh_token: refreshToken, client_id: clientId });
  } catch (err) {
    if (err instanceof TokenError && err.spotifyError === "invalid_grant") return null;
    throw err;
  }
}

async function store(configDir: string, grant: TokenGrant, previousRefreshToken?: string): Promise<string> {
  const refreshToken = grant.refreshToken ?? previousRefreshToken;
  if (!refreshToken) throw new TokenError("Spotify's token endpoint sent no refresh token.");
  await writeTokenCache(configDir, { refreshToken, accessToken: grant.accessToken, expiresAt: grant.expiresAt });
  return grant.accessToken;
}
