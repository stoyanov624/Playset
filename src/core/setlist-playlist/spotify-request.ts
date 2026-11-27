import { HttpError, createRequester, type Sleep } from "../http/index.js";
import { PlaylistRateLimitError, SpotifyPlaylistError } from "./errors.js";

export const SPOTIFY_API = "https://api.spotify.com/";
/** The first request and up to 3 retries on HTTP 429. */
const MAX_ATTEMPTS = 4;
/** Spotify's documented error statuses: their body carries `error.message`, which the error repeats. */
const STATUSES_WITH_SPOTIFY_MESSAGE = [400, 401, 403, 404, 500, 502, 503];

export interface SpotifyPlaylistOptions {
  /** A Spotify access token supplied by the caller. Never included in errors. */
  accessToken: string;
  /** Defaults to the global `fetch`. */
  fetch?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
  /** Defaults to a `setTimeout`-based wait. */
  sleep?: Sleep;
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
  const send = createRequester(
    {
      name: "Spotify",
      maxAttempts: MAX_ATTEMPTS,
      secrets: () => [options.accessToken],
      allowedUrlPrefixes: [SPOTIFY_API],
      passThroughStatuses: STATUSES_WITH_SPOTIFY_MESSAGE,
    },
    {
      ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
      ...(options.sleep === undefined ? {} : { sleep: options.sleep }),
    },
  );
  const headers: Record<string, string> = {
    Authorization: `Bearer ${options.accessToken}`,
    Accept: "application/json",
  };
  if (request.body !== undefined) headers["Content-Type"] = "application/json";
  const init: RequestInit = { method: request.method, headers };
  if (request.body !== undefined) init.body = JSON.stringify(request.body);

  let response: Response;
  try {
    response = await send(request.url, init);
  } catch (err) {
    throw toPlaylistError(err, request.what);
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

function toPlaylistError(err: unknown, what: string): unknown {
  if (!(err instanceof HttpError)) return err;
  switch (err.kind) {
    case "rate-limited":
      return new PlaylistRateLimitError(what, MAX_ATTEMPTS - 1, { cause: err });
    case "status":
      return new SpotifyPlaylistError(`Spotify answered the ${what} request with HTTP ${err.status}`, {
        status: err.status,
        cause: err,
      });
    case "refused-url":
      return new SpotifyPlaylistError(`Refused to send the ${what} request to a host other than ${SPOTIFY_API}`, {
        cause: err,
      });
    case "network":
      // The cause is only kept when it holds no access token, so its message is safe to repeat.
      return new SpotifyPlaylistError(
        `Could not reach Spotify for the ${what} request: ${err.cause instanceof Error ? err.cause.message : "network error"}`,
        { cause: err },
      );
  }
}

function redact(text: string, accessToken: string): string {
  return accessToken ? text.split(accessToken).join("[access token]") : text;
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
