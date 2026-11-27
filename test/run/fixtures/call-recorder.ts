// Helpers for the cancellation and input-rule tests of the run: a call recorder that wraps the
// fake RunServices and RunFrontEnd and remembers which calls came after the signal aborted,
// a controllable promise (deferred), and a time limit for "rejects promptly".
// Nothing here touches a terminal or the network.
import type { RunFrontEnd, RunServices } from "../../../src/core/run/index.js";

export interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(reason: unknown): void;
}

/** A promise the test settles by hand (or never). */
export function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Lets pending promise callbacks and timers run (real time, a few milliseconds). */
export const flush = (ms = 20) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Settles with `promise`, or rejects with a "still pending" error after `ms` (real time).
 * Used to check that a cancelled run rejects promptly, while a service call or question is
 * still pending.
 */
export function within<T>(promise: Promise<T>, ms = 1000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`still pending after ${ms} ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export async function captureError(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  throw new Error("Expected the run to fail, but it finished");
}

/**
 * Records every call to the wrapped services and front-end (as "service:<name>" and
 * "frontEnd:<name>"), and which of them came after `markAbort()`.
 */
export function makeCallRecorder() {
  const calls: string[] = [];
  let abortMark: number | null = null;

  function wrap<T extends object>(target: T, prefix: "service" | "frontEnd"): T {
    const wrapped: Record<string, unknown> = {};
    for (const [name, value] of Object.entries(target as Record<string, unknown>)) {
      if (typeof value !== "function") {
        wrapped[name] = value;
        continue;
      }
      wrapped[name] = (...args: unknown[]) => {
        calls.push(`${prefix}:${name}`);
        return (value as (...a: unknown[]) => unknown)(...args);
      };
    }
    return wrapped as T;
  }

  return {
    calls,
    wrapServices: (services: RunServices) => wrap(services, "service"),
    wrapFrontEnd: (frontEnd: RunFrontEnd) => wrap(frontEnd, "frontEnd"),
    /** Remember where the abort happened in the call log. */
    markAbort() {
      if (abortMark === null) abortMark = calls.length;
    },
    /** Every service and front-end call made after the abort. */
    callsAfterAbort(): string[] {
      if (abortMark === null) throw new Error("call recorder: the signal was never aborted");
      return calls.slice(abortMark);
    },
  };
}

/** An AbortController whose abort is also marked in the call recorder. */
export function makeAbort(recorder: ReturnType<typeof makeCallRecorder>) {
  const controller = new AbortController();
  return {
    signal: controller.signal,
    abort() {
      recorder.markAbort();
      controller.abort();
    },
  };
}
