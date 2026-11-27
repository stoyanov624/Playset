// One request path for every Playset HTTP client, so throttling, retries on rate limits and keeping
// secrets out of errors are done once for setlist.fm and Spotify alike.
import { HttpError } from "./errors.js";

/** The part of `fetch` Playset uses; tests pass fakes. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
/** Waits the given number of milliseconds; tests pass fakes so no real time passes. */
export type Sleep = (ms: number) => Promise<void>;

/** The real wait, used wherever no Sleep is given. */
export const defaultSleep: Sleep = (ms) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** How one client talks to one service. */
export interface RequestPolicy {
  /** The service in plain words for error messages, e.g. "setlist.fm" or "Spotify search". */
  name: string;
  /** Total number of requests sent for one call, the first included, while the answer is HTTP 429. */
  maxAttempts: number;
  /** Minimum gap between the starts of two requests of this requester. */
  minIntervalMs?: number;
  /** Values that must never appear in an error (read on every failure, so late-known secrets count). */
  secrets?: () => readonly string[];
  /** When given, a URL must start with one of these, or it is refused before any request. */
  allowedUrlPrefixes?: readonly string[];
  /** Non-2xx statuses returned to the caller as a Response instead of thrown. */
  passThroughStatuses?: readonly number[];
}

export interface RequesterDeps {
  /** Defaults to the global `fetch`. */
  fetch?: FetchLike;
  /** Defaults to a `setTimeout`-based wait. */
  sleep?: Sleep;
  /** Defaults to `Date.now`. */
  now?: () => number;
}

/** A fetch that follows one RequestPolicy. */
export type Requester = FetchLike;

const DEFAULT_RETRY_AFTER_MS = 1000;

/**
 * A request function for one service: throttling, retries on HTTP 429 honouring Retry-After, typed
 * HttpErrors for every failure, and secrets kept out of every error.
 */
export function createRequester(policy: RequestPolicy, deps: RequesterDeps = {}): Requester {
  const doFetch: FetchLike = deps.fetch ?? ((input, init) => globalThis.fetch(input, init));
  const sleep = deps.sleep ?? defaultSleep;
  const now = deps.now ?? Date.now;
  let lastStart: number | undefined;

  /** Waits at least `minWaitMs`, and long enough that the throttle allows the next start. */
  async function waitForTurn(minWaitMs: number): Promise<void> {
    const throttle =
      policy.minIntervalMs === undefined || lastStart === undefined
        ? 0
        : lastStart + policy.minIntervalMs - now();
    const wait = Math.max(0, minWaitMs, throttle);
    if (wait > 0) await sleep(wait);
    lastStart = now();
  }

  const redact = (text: string): string => redactSecrets(text, secretsOf(policy));

  return async function request(url: string, init?: RequestInit): Promise<Response> {
    if (policy.allowedUrlPrefixes && !policy.allowedUrlPrefixes.some((prefix) => url.startsWith(prefix))) {
      throw new HttpError(redact(`Refused to send a ${policy.name} request to a URL outside the allowed addresses.`), {
        kind: "refused-url",
      });
    }

    let retryWaitMs = 0;
    for (let attempt = 1; ; attempt++) {
      await waitForTurn(retryWaitMs);
      let response: Response;
      try {
        response = await doFetch(url, init);
      } catch (err) {
        throw networkError(policy, err);
      }

      if (response.status === 429) {
        if (attempt >= policy.maxAttempts) {
          throw new HttpError(redact(`${policy.name} is still rate-limiting after ${attempt} attempts (HTTP 429).`), {
            kind: "rate-limited",
            status: 429,
          });
        }
        retryWaitMs = retryAfterMs(response.headers.get("Retry-After"));
        continue;
      }
      if (response.ok || policy.passThroughStatuses?.includes(response.status)) return response;
      throw new HttpError(redact(`${policy.name} answered with HTTP ${response.status}.`), {
        kind: "status",
        status: response.status,
      });
    }
  };
}

/** Retry-After in seconds (decimals allowed) → ms; missing, empty or unparseable → 1 s. */
function retryAfterMs(header: string | null): number {
  const value = header?.trim() ?? "";
  return /^\d+(\.\d+)?$/.test(value) ? Math.round(Number(value) * 1000) : DEFAULT_RETRY_AFTER_MS;
}

function networkError(policy: RequestPolicy, err: unknown): HttpError {
  const secrets = secretsOf(policy);
  const safe = !secrets.some((secret) => chainText(err).includes(secret));
  return new HttpError(`Could not reach ${redactSecrets(policy.name, secrets)} (network error).`, {
    kind: "network",
    cause: safe ? err : undefined,
  });
}

function secretsOf(policy: RequestPolicy): string[] {
  return (policy.secrets?.() ?? []).filter((secret) => secret !== "");
}

function redactSecrets(text: string, secrets: readonly string[]): string {
  return secrets.reduce((out, secret) => out.split(secret).join("[redacted]"), text);
}

/** Every bit of text of an error and its causes. */
function chainText(err: unknown): string {
  const parts: string[] = [];
  let current: unknown = err;
  for (let depth = 0; current !== undefined && current !== null && depth < 20; depth++) {
    parts.push(String(current));
    if (typeof current !== "object") break;
    const { message, hint, stack } = current as { message?: unknown; hint?: unknown; stack?: unknown };
    for (const part of [message, hint, stack]) if (typeof part === "string") parts.push(part);
    current = (current as { cause?: unknown }).cause;
  }
  return parts.join("\n");
}
