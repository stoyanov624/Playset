// Cancelling a run, or a single step that takes a signal, through an AbortSignal: until the create request is
// sent, an abort ends it promptly with a RunCancelledError and lets no further service or front-end call
// through; late answers are ignored. Once the create request is sent, an abort changes nothing.
import { RunCancelledError } from "./errors.js";
import type { RunFrontEnd, RunServices } from "./types.js";

/** Ends the run (or step) at once when the signal has already aborted. */
export function throwIfCancelled(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new RunCancelledError();
}

/**
 * The call's answer, unless the signal aborts first: then a RunCancelledError comes at once and the late
 * answer is ignored. No call is made when the signal has already aborted.
 */
export async function unlessCancelled<T>(signal: AbortSignal | undefined, call: () => Promise<T>): Promise<T> {
  throwIfCancelled(signal);
  if (signal === undefined) return call();
  let onAbort: () => void = () => {};
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(new RunCancelledError());
    signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    return await Promise.race([call(), aborted]);
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

export interface RunGuard {
  frontEnd: RunFrontEnd;
  services: RunServices;
}

/** Wraps the front-end and services so that they obey `signal`. */
export function guardRun(signal: AbortSignal, frontEnd: RunFrontEnd, services: RunServices): RunGuard {
  let createSent = false;
  const check = (): void => {
    if (!createSent) throwIfCancelled(signal);
  };

  /** Calls `call` unless cancelled; its answer counts only if no abort came first. */
  const guarded = async <T>(call: () => Promise<T>): Promise<T> => {
    check();
    const result = await unlessCancelled(signal, call);
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
  };
}
