// Where the server gets the Host Account's Spotify access token: the one stored Host token, refreshed by
// the server when it is about to expire. Only the Host Account's own login is ever used.
import type { SpotifyAccount, TokenGrant } from "../../core/index.js";
import type { Logger } from "./logging.js";

export interface HostTokenSource {
  /** The Host token; undefined when the Host Account is not connected. Rejects when getting one failed. */
  getAccessToken(): Promise<string | undefined>;
}

/** Never connected: every preview and create answers that making playlists is unavailable. */
export const notConnectedHostTokenSource: HostTokenSource = {
  getAccessToken: async () => undefined,
};

/** The Host Account's one saved login, with the Spotify account it belongs to. */
export interface StoredHostToken {
  accountId: string;
  displayName?: string;
  accessToken: string;
  refreshToken: string;
  /** Epoch ms. */
  expiresAt: number;
}

/** Holds at most one stored Host token; saving replaces it. */
export interface HostTokenStore {
  read(): Promise<StoredHostToken | undefined>;
  save(token: StoredHostToken): Promise<void>;
  clear(): Promise<void>;
}

/** The Spotify login calls the server makes for the Host Account. */
export interface HostLogin {
  exchangeCode(p: { code: string; codeVerifier: string; redirectUri: string }): Promise<TokenGrant>;
  fetchAccount(accessToken: string): Promise<SpotifyAccount>;
  refresh(refreshToken: string): Promise<TokenGrant>;
}

/** A copy, so a missing display name stays missing and callers can't change what is stored. */
function copyOf(token: StoredHostToken): StoredHostToken {
  const { accountId, displayName, accessToken, refreshToken, expiresAt } = token;
  return { accountId, ...(displayName === undefined ? {} : { displayName }), accessToken, refreshToken, expiresAt };
}

/** A Host token store kept in memory only, for tests. */
export function createMemoryHostTokenStore(): HostTokenStore {
  let stored: StoredHostToken | undefined;
  return {
    read: async () => (stored === undefined ? undefined : copyOf(stored)),
    save: async (token) => {
      stored = copyOf(token);
    },
    clear: async () => {
      stored = undefined;
    },
  };
}

/** A stored access token is used only while its expiry is more than this far away. */
const EXPIRY_MARGIN_MS = 60_000;

const LOGIN_ENDED_WARNING = "The Host Account's Spotify login has ended. Log in again at /admin.";

/** Spotify said the refresh token no longer works, so only a new Host login helps. */
const loginEnded = (error: unknown): boolean =>
  (error as { spotifyError?: unknown } | null)?.spotifyError === "invalid_grant";

export function createHostTokenSource(deps: {
  store: HostTokenStore;
  login: Pick<HostLogin, "refresh">;
  hostAccountId: string;
  now: () => number;
  logger: Logger;
}): HostTokenSource {
  const { store, login, hostAccountId, now, logger } = deps;
  // One refresh at a time: a rotated refresh token must never be used twice.
  let refreshing: Promise<string | undefined> | undefined;

  /** The usable stored access token, or undefined when the store holds none of the Host Account. */
  const usable = (stored: StoredHostToken | undefined): StoredHostToken | undefined =>
    // A token kept for another account (the configured Host Account changed) is never used.
    stored === undefined || stored.accountId !== hostAccountId ? undefined : stored;
  const fresh = (stored: StoredHostToken): boolean => stored.expiresAt - now() > EXPIRY_MARGIN_MS;

  /** Reads the store again first: an ask that saw the old token may arrive after a refresh ended. */
  async function renew(): Promise<string | undefined> {
    const stored = usable(await store.read());
    if (stored === undefined) return undefined;
    if (fresh(stored)) return stored.accessToken;
    let grant: TokenGrant;
    try {
      grant = await login.refresh(stored.refreshToken);
    } catch (error) {
      if (!loginEnded(error)) throw error;
      await store.clear();
      logger.warn(LOGIN_ENDED_WARNING);
      return undefined;
    }
    const { accessToken, refreshToken, expiresAt } = grant;
    await store.save({ ...stored, accessToken, refreshToken, expiresAt });
    return grant.accessToken;
  }

  return {
    async getAccessToken() {
      if (refreshing) return refreshing;
      const stored = usable(await store.read());
      if (stored === undefined) return undefined;
      if (fresh(stored)) return stored.accessToken;
      refreshing ??= renew().finally(() => {
        refreshing = undefined;
      });
      return refreshing;
    },
  };
}
