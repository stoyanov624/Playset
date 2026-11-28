// Where the server gets the Host Account's Spotify access token. The Host login that keeps a real one
// comes later; until then the server runs with a source that is never connected.

export interface HostTokenSource {
  /** The Host token; undefined when the Host Account is not connected. Rejects when getting one failed. */
  getAccessToken(): Promise<string | undefined>;
}

/** Never connected: every preview and create answers that making playlists is unavailable. */
export const notConnectedHostTokenSource: HostTokenSource = {
  getAccessToken: async () => undefined,
};
