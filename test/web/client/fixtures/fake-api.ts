// A fake API client for the visitor web app: every call is a spy, answers are controlled by the
// test, and a call given a cancel signal rejects with the signal's reason when it is aborted,
// as the real API client does.
import { act } from "@testing-library/react";
import { vi, type Mock } from "vitest";
import type { PreviewProgress, PreviewResult } from "../../../../src/web/shared/index.js";
import type { PlaysetApi } from "../../../../src/web/client/api/index.js";

export type FakeApi = { [K in keyof PlaysetApi]: Mock<PlaysetApi[K]> };

function unexpected(name: string) {
  return () => Promise.reject(new Error(`fake API: unexpected ${name} call`));
}

/** Every call not given an answer rejects, so an unexpected request shows up in the test. */
export function fakeApi(answers: Partial<PlaysetApi> = {}): FakeApi {
  return {
    searchArtists: vi.fn<PlaysetApi["searchArtists"]>(answers.searchArtists ?? unexpected("searchArtists")),
    getArtistSetlists: vi.fn<PlaysetApi["getArtistSetlists"]>(
      answers.getArtistSetlists ?? unexpected("getArtistSetlists"),
    ),
    readSetlistLink: vi.fn<PlaysetApi["readSetlistLink"]>(answers.readSetlistLink ?? unexpected("readSetlistLink")),
    getSetlist: vi.fn<PlaysetApi["getSetlist"]>(answers.getSetlist ?? unexpected("getSetlist")),
    streamPreview: vi.fn<PlaysetApi["streamPreview"]>(answers.streamPreview ?? unexpected("streamPreview")),
    createPlaylist: vi.fn<PlaysetApi["createPlaylist"]>(answers.createPlaylist ?? unexpected("createPlaylist")),
  };
}

export interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

/** A promise the test settles by hand; aborting `signal` rejects it with the signal's reason. */
export function deferred<T>(signal?: AbortSignal): Deferred<T> {
  let resolve: (value: T) => void = () => undefined;
  let reject: (reason: unknown) => void = () => undefined;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  // A rejection nobody awaits (the app already left the screen) must not fail the run.
  promise.catch(() => undefined);
  if (signal) {
    if (signal.aborted) reject(signal.reason);
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  }
  return { promise, resolve, reject };
}

/** Answers each call in turn from the given list of pending answers, recording the signal. */
export function pendingCalls<T>() {
  const calls: { args: unknown[]; signal: AbortSignal | undefined; answer: Deferred<T> }[] = [];
  return {
    calls,
    take(args: unknown[], signal: AbortSignal | undefined): Promise<T> {
      const answer = deferred<T>(signal);
      calls.push({ args, signal, answer });
      return answer.promise;
    },
    /** The latest call, which the test settles. */
    last() {
      const call = calls.at(-1);
      if (!call) throw new Error("no call was made");
      return call;
    },
  };
}

export interface PreviewCall {
  id: string;
  onProgress: (progress: PreviewProgress) => void;
  signal: AbortSignal | undefined;
  answer: Deferred<PreviewResult>;
}

/** A preview stream the test drives event by event: progress, then the result or an error. */
export function controlledPreview() {
  const calls: PreviewCall[] = [];
  const streamPreview: PlaysetApi["streamPreview"] = (id, options) => {
    const signal: AbortSignal | undefined = options.signal;
    const answer = deferred<PreviewResult>(signal);
    calls.push({ id, onProgress: options.onProgress, signal, answer });
    return answer.promise;
  };
  function last(): PreviewCall {
    const call = calls.at(-1);
    if (!call) throw new Error("streamPreview was not called");
    return call;
  }
  return {
    streamPreview,
    calls,
    last,
    progress(n: number, total: number) {
      act(() => {
        last().onProgress({ n, total });
      });
    },
    async finish(result: PreviewResult) {
      await act(async () => {
        last().answer.resolve(result);
      });
    },
    async fail(error: unknown) {
      await act(async () => {
        last().answer.reject(error);
      });
    },
  };
}
