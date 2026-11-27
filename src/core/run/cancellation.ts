// Cancelling a run through an AbortSignal: until the create request is sent, an abort ends the run promptly
// with a RunCancelledError and lets no further service or front-end call through; late answers are ignored.
// Once the create request is sent, an abort changes nothing.
import { RunCancelledError } from "./errors.js";
import type { RunFrontEnd, RunServices } from "./types.js";

export interface RunGuard {
  frontEnd: RunFrontEnd;
  services: RunServices;
  /** Stops listening to the signal; call when the run has settled. */
  release(): void;
}

/** Wraps the front-end and services so that they obey `signal` (which must not be aborted yet). */
export function guardRun(signal: AbortSignal, frontEnd: RunFrontEnd, services: RunServices): RunGuard {
  let createSent = false;
  const cancelled = () => signal.aborted && !createSent;

  let onAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(new RunCancelledError());
    signal.addEventListener("abort", onAbort, { once: true });
  });
  aborted.catch(() => {}); // Only observed through the races below.

  const check = (): void => {
    if (cancelled()) throw new RunCancelledError();
  };

  /** Calls `call` unless cancelled; its answer counts only if no abort came first. */
  const guarded = async <T>(call: () => Promise<T>): Promise<T> => {
    check();
    const result = await Promise.race([call(), aborted]);
    check();
    return result;
  };

  /** Like `guarded`, for a front-end report that returns nothing. */
  const report = (show: () => void): void => {
    check();
    show();
  };

  return {
    frontEnd: {
      chooseArtist: (candidates) => guarded(() => frontEnd.chooseArtist(candidates)),
      askTape: (tape) => guarded(() => frontEnd.askTape(tape)),
      askUseCompleteSetlist: (offer) => guarded(() => frontEnd.askUseCompleteSetlist(offer)),
      confirmCreate: (preview) => guarded(() => frontEnd.confirmCreate(preview)),
      showAuthorizeUrl: (url) => guarded(() => frontEnd.showAuthorizeUrl(url)),
      showShow: (summary) => report(() => frontEnd.showShow(summary)),
      showProgress: (progress) => report(() => frontEnd.showProgress(progress)),
      showPreview: (preview) => report(() => frontEnd.showPreview(preview)),
    },
    services: {
      getSetlist: (setlistId) => guarded(() => services.getSetlist(setlistId)),
      findLatestSetlistByArtistName: (name, chooser, options) =>
        guarded(() => services.findLatestSetlistByArtistName(name, chooser, options)),
      getAccessToken: (hooks) => guarded(() => services.getAccessToken(hooks)),
      findMatch: (performance, accessToken) => guarded(() => services.findMatch(performance, accessToken)),
      findPlaylistsNamed: (name, accessToken) => guarded(() => services.findPlaylistsNamed(name, accessToken)),
      createSetlistPlaylist: (show, matches, options) => {
        check();
        createSent = true;
        return services.createSetlistPlaylist(show, matches, options);
      },
    },
    release() {
      if (onAbort) signal.removeEventListener("abort", onAbort);
    },
  };
}
