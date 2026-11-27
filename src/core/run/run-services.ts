// The real RunServices (plus the Artist search and Setlist pages for picking a Show): the setlist.fm client, the Spotify login, the Match search, the duplicate check and
// the creation, wired from injected fetch / sleep / clock / settings / callback receiver for any front-end.
import { defaultSleep, type FetchLike, type Sleep } from "../http/index.js";
import { createSpotifyTrackSearch, matchPerformance } from "../matching/index.js";
import type { Env, SettingsStore } from "../settings/index.js";
import { createSetlistPlaylist, findPlaylistsNamed } from "../setlist-playlist/index.js";
import { createSetlistFmClient, type SetlistFmClient } from "../setlistfm/index.js";
import { getAccessToken, type CallbackReceiver } from "../spotify-auth/index.js";
import { RunCancelledError } from "./errors.js";
import type { RunServices, SetlistBrowsingServices } from "./types.js";

export interface RunServicesDeps {
  /** Defaults to the global `fetch`. */
  fetch?: FetchLike;
  /** Defaults to a `setTimeout`-based wait. */
  sleep?: Sleep;
  /** Defaults to `Date.now`. */
  now?: () => number;
  /** Defaults to process.env. Gives PLAYSET_AUTH_PORT, and the settings when no `settings` store is given. */
  env?: Env;
  /** Where the API key, the client id and the Spotify token cache live. Defaults to the file store. */
  settings?: SettingsStore;
  /** Starts listening for the Spotify login callback on the redirect URI. */
  startCallbackReceiver(redirectUri: string): Promise<CallbackReceiver>;
}

/**
 * Build once per process (or session): every run then shares the setlist.fm request spacing and the Spotify
 * token. The setlist.fm client is created on first use, so a missing API key is reported only when needed.
 */
export function createRunServices(deps: RunServicesDeps): RunServices & SetlistBrowsingServices {
  const fetch = deps.fetch ?? globalThis.fetch;
  const sleep = deps.sleep ?? defaultSleep;
  const now = deps.now ?? Date.now;
  const settingsDeps = {
    ...(deps.env === undefined ? {} : { env: deps.env }),
    ...(deps.settings === undefined ? {} : { settings: deps.settings }),
  };

  let setlistFm: SetlistFmClient | undefined;
  const setlistFmClient = () => (setlistFm ??= createSetlistFmClient({ fetch, sleep, now, ...settingsDeps }));

  /** Login callback receivers still listening (a login whose caller went away never closes its own). */
  const openReceivers = new Set<CallbackReceiver>();

  /** Frees the login port so the next login can listen on it again. */
  const closeOpenReceivers = async (): Promise<void> => {
    const receivers = [...openReceivers];
    openReceivers.clear();
    await Promise.all(receivers.map((receiver) => receiver.close().catch(() => {})));
  };

  /** Starts a receiver that is tracked until it is closed, and closed at once when `signal` aborts. */
  const startTrackedReceiver = async (redirectUri: string, signal: AbortSignal | undefined) => {
    const receiver = await deps.startCallbackReceiver(redirectUri);
    openReceivers.add(receiver);
    const onAbort = () => void close().catch(() => {});
    const close = () => {
      signal?.removeEventListener("abort", onAbort);
      openReceivers.delete(receiver);
      return receiver.close();
    };
    if (signal?.aborted) await close().catch(() => {});
    else signal?.addEventListener("abort", onAbort, { once: true });
    return { waitForCallback: () => receiver.waitForCallback(), close };
  };

  return {
    getSetlist: (setlistId) => setlistFmClient().getSetlist(setlistId),
    findArtistCandidates: (name) => setlistFmClient().findArtistCandidates(name),
    getSetlistPage: (mbid, page) => setlistFmClient().getSetlistPage(mbid, page),
    findLatestSetlistByArtistName: (name, chooser, options) =>
      setlistFmClient().findLatestSetlistByArtistName(name, chooser, options),
    async getAccessToken({ openAuthorizeUrl, signal }) {
      if (signal?.aborted) throw new RunCancelledError();
      await closeOpenReceivers();
      try {
        return await getAccessToken({
          fetch,
          sleep,
          now,
          ...settingsDeps,
          openAuthorizeUrl,
          startCallbackReceiver: (redirectUri) => startTrackedReceiver(redirectUri, signal),
        });
      } catch (error) {
        if (signal?.aborted) throw new RunCancelledError();
        throw error;
      }
    },
    findMatch: (performance, accessToken) =>
      matchPerformance(performance, createSpotifyTrackSearch({ accessToken, fetch, sleep })),
    findPlaylistsNamed: (name, accessToken) => findPlaylistsNamed(name, { accessToken, fetch, sleep }),
    createSetlistPlaylist: (show, matches, options) => createSetlistPlaylist(show, matches, { ...options, fetch, sleep }),
  };
}
