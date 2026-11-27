/**
 * Hand-written fakes for the shared request module tests (src/core/http).
 *
 * - `fakeClock` gives a `now()` that only moves when `sleep()` is called (or when a
 *   scripted answer advances it), so throttle and Retry-After waits are exact.
 * - `scriptedFetch` answers from a queue shaped like real setlist.fm / Spotify responses,
 *   records every call with the clock time it started, and can reject like a network failure.
 */

export const T0 = 1_795_716_000_000;

export interface FakeClock {
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  /** Every wait asked of `sleep`, in milliseconds, in call order. */
  sleeps: number[];
  /** Moves the clock without a sleep (time spent elsewhere, e.g. inside a request). */
  advance: (ms: number) => void;
}

export function fakeClock(start = T0): FakeClock {
  let t = start;
  const sleeps: number[] = [];
  return {
    now: () => t,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      t += ms;
    },
    sleeps,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

export type Answer =
  | { status: number; body?: unknown; headers?: Record<string, string>; advance?: number }
  | { throws: unknown };

export interface RecordedCall {
  url: string;
  init: RequestInit | undefined;
  /** Clock time when the request started (`now()` at the moment fetch was called). */
  at: number;
}

export function scriptedFetch(answers: Answer[], clock?: FakeClock) {
  const queue = [...answers];
  const calls: RecordedCall[] = [];
  const fetch = async (input: string, init?: RequestInit): Promise<Response> => {
    calls.push({ url: input, init, at: clock ? clock.now() : 0 });
    const answer = queue.shift();
    if (!answer) throw new Error("scripted fetch: no more answers");
    if ("throws" in answer) throw answer.throws;
    if (answer.advance && clock) clock.advance(answer.advance);
    const body =
      answer.body === undefined ? null : typeof answer.body === "string" ? answer.body : JSON.stringify(answer.body);
    return new Response(body, {
      status: answer.status,
      headers: { "Content-Type": "application/json", ...(answer.headers ?? {}) },
    });
  };
  return { fetch, calls };
}

// ---------------------------------------------------------------- canned answers

export const ok = (body: unknown = { ok: true }): Answer => ({ status: 200, body });

/** HTTP 429. `retryAfter` null means no Retry-After header at all. */
export function tooManyRequests(retryAfter: string | null): Answer {
  return retryAfter === null
    ? { status: 429, body: { code: 429, status: "Too Many Requests", message: "Too Many Requests" } }
    : {
        status: 429,
        headers: { "Retry-After": retryAfter },
        body: { code: 429, status: "Too Many Requests", message: "Too Many Requests" },
      };
}

export const spotifyError = (status: number, message: string): Answer => ({
  status,
  body: { error: { status, message } },
});

// ---------------------------------------------------------------- error helpers

/** Runs `fn` and returns what it threw or rejected with; fails if it succeeded. */
export async function captureError(fn: () => unknown): Promise<unknown> {
  try {
    await fn();
  } catch (err) {
    return err;
  }
  throw new Error("expected an error, but the call succeeded");
}

/** The error and every `cause` below it. */
export function causeChain(err: unknown): unknown[] {
  const out: unknown[] = [];
  let current: unknown = err;
  while (current !== undefined && current !== null && out.length < 20) {
    out.push(current);
    current = (current as { cause?: unknown }).cause;
  }
  return out;
}

/** All user-visible text of the error and its causes: String(), message and hint. */
export function chainText(err: unknown): string {
  return causeChain(err)
    .map((e) => {
      const parts = [String(e)];
      if (e && typeof e === "object") {
        const { message, hint } = e as { message?: unknown; hint?: unknown };
        if (typeof message === "string") parts.push(message);
        if (typeof hint === "string") parts.push(hint);
      }
      return parts.join("\n");
    })
    .join("\n");
}
