import { PlaylistRateLimitError, SpotifyPlaylistError } from "./errors.js";

export const SPOTIFY_API = "https://api.spotify.com/";
const MAX_RATE_LIMIT_RETRIES = 3;
const DEFAULT_RETRY_AFTER_SECONDS = 1;

export interface SpotifyPlaylistOptions {
  /** A Spotify access token supplied by the caller. Never included in errors. */
  accessToken: string;
  /** Defaults to the global `fetch`. */
  fetch?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
  /** Defaults to a `setTimeout`-based wait. */
  sleep?: (ms: number) => Promise<void>;
}

export interface SpotifyRequest {
  method: "GET" | "POST";
  url: string;
  body?: unknown;
  /** Plain words for error messages, e.g. "create playlist". */
  what: string;
}

/**
 * Sends one Spotify request: only to https://api.spotify.com/, retrying the same request up to 3 times
 * on HTTP 429 (waiting `Retry-After` seconds, or 1). Any other non-success status, or a network failure,
 * raises a SpotifyPlaylistError at once. Returns the parsed JSON body (undefined if empty).
 */
export async function sendSpotifyRequest(request: SpotifyRequest, options: SpotifyPlaylistOptions): Promise<unknown> {
  if (!request.url.startsWith(SPOTIFY_API)) {
    throw new SpotifyPlaylistError(`Refused to send the ${request.what} request to a host other than ${SPOTIFY_API}`);
  }
  const doFetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const headers: Record<string, string> = {
    Authorization: `Bearer ${options.accessToken}`,
    Accept: "application/json",
  };
  if (request.body !== undefined) headers["Content-Type"] = "application/json";
  const init: RequestInit = { method: request.method, headers };
  if (request.body !== undefined) init.body = JSON.stringify(request.body);

  for (let retries = 0; ; retries++) {
    let response: Response;
    try {
      response = await doFetch(request.url, init);
    } catch (err) {
      throw networkError(request.what, err, options.accessToken);
    }
    if (response.status === 429) {
      if (retries >= MAX_RATE_LIMIT_RETRIES) throw new PlaylistRateLimitError(request.what, MAX_RATE_LIMIT_RETRIES);
      await sleep(retryAfterSeconds(response.headers.get("Retry-After")) * 1000);
      continue;
    }
    const text = await response.text().catch(() => "");
    const body = parseJson(text);
    if (!response.ok) {
      const spotifyMessage = errorMessageOf(body);
      throw new SpotifyPlaylistError(
        `Spotify answered the ${request.what} request with HTTP ${response.status}` +
          (spotifyMessage ? `: ${redact(spotifyMessage, options.accessToken)}` : ""),
        { status: response.status },
      );
    }
    return body;
  }
}

function networkError(what: string, err: unknown, accessToken: string): SpotifyPlaylistError {
  const reason = err instanceof Error ? err.message : String(err);
  const safe = !reason.includes(accessToken) && !(err instanceof Error && String(err.cause ?? "").includes(accessToken));
  return new SpotifyPlaylistError(`Could not reach Spotify for the ${what} request: ${redact(reason, accessToken)}`, {
    cause: safe ? err : undefined,
  });
}

function redact(text: string, accessToken: string): string {
  return accessToken ? text.split(accessToken).join("[access token]") : text;
}

function retryAfterSeconds(header: string | null): number {
  const value = header?.trim() ?? "";
  return /^\d+(\.\d+)?$/.test(value) ? Number(value) : DEFAULT_RETRY_AFTER_SECONDS;
}

function parseJson(text: string): unknown {
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function errorMessageOf(body: unknown): string | undefined {
  const message = (body as { error?: { message?: unknown } } | undefined)?.error?.message;
  return typeof message === "string" && message ? message : undefined;
}
