// The real API client: same-origin requests to Playset's server, every answer read through the
// contract's schema so a drifted answer becomes a client error instead of a broken screen.
import type { z } from "zod";
import {
  ROUTES,
  artistSetlistsResponseSchema,
  artistsResponseSchema,
  createPlaylistResponseSchema,
  errorBodySchema,
  setlistLinksResponseSchema,
  setlistResponseSchema,
} from "../../shared/index.js";
import { ApiCallError, driftedAnswerError, noAnswerError, stoppedEarlyError } from "./errors.js";
import { readPreviewStream } from "./preview-stream.js";
import type { PlaysetApi } from "./types.js";

export interface HttpApiDeps {
  fetch: typeof fetch;
}

const JSON_TYPE = "application/json";

function withParam(route: string, name: string, value: string): string {
  return route.replace(`:${name}`, encodeURIComponent(value));
}

/** A cancelled call rejects with the signal's own reason, never as an API error. */
function cancelledOr(signal: AbortSignal | undefined, error: ApiCallError): unknown {
  return signal?.aborted ? signal.reason : error;
}

/** Only whole seconds count; an HTTP date or a fraction means no countdown. */
function retryAfterSeconds(response: Response): number | undefined {
  const header = response.headers.get("Retry-After")?.trim() ?? "";
  return /^\d+$/.test(header) ? Number(header) : undefined;
}

async function readJson(response: Response, signal: AbortSignal | undefined): Promise<unknown> {
  let text: string;
  try {
    text = await response.text();
  } catch {
    throw cancelledOr(signal, noAnswerError());
  }
  try {
    return JSON.parse(text);
  } catch {
    throw noAnswerError();
  }
}

async function serverError(response: Response, signal: AbortSignal | undefined): Promise<ApiCallError> {
  const parsed = errorBodySchema.safeParse(await readJson(response, signal));
  if (!parsed.success) return driftedAnswerError();
  const { code, message, hint } = parsed.data.error;
  return new ApiCallError({
    code,
    message,
    hint,
    retryAfterSeconds: code === "RATE_LIMITED" ? retryAfterSeconds(response) : undefined,
  });
}

export function createHttpApi(deps: HttpApiDeps): PlaysetApi {
  // Called unbound: the browser's fetch refuses to run with a foreign `this`.
  const fetchFn = deps.fetch;

  async function send(path: string, init: RequestInit, signal: AbortSignal | undefined): Promise<Response> {
    if (signal?.aborted) throw signal.reason;
    let response: Response;
    try {
      response = await fetchFn(path, { ...init, ...(signal ? { signal } : {}) });
    } catch {
      throw cancelledOr(signal, noAnswerError());
    }
    if (!response.ok) throw await serverError(response, signal);
    return response;
  }

  async function call<T>(
    path: string,
    schema: z.ZodType<T>,
    signal: AbortSignal | undefined,
    init: RequestInit = {},
  ): Promise<T> {
    const response = await send(path, { ...init, headers: { Accept: JSON_TYPE, ...init.headers } }, signal);
    const parsed = schema.safeParse(await readJson(response, signal));
    if (!parsed.success) throw driftedAnswerError();
    return parsed.data;
  }

  return {
    searchArtists: (name, signal) =>
      call(`${ROUTES.artists}?name=${encodeURIComponent(name)}`, artistsResponseSchema, signal),
    getArtistSetlists: (mbid, page, signal) =>
      call(`${withParam(ROUTES.artistSetlists, "mbid", mbid)}?page=${page}`, artistSetlistsResponseSchema, signal),
    readSetlistLink: (url, signal) =>
      call(`${ROUTES.setlistLinks}?url=${encodeURIComponent(url)}`, setlistLinksResponseSchema, signal),
    getSetlist: (id, signal) => call(withParam(ROUTES.setlist, "id", id), setlistResponseSchema, signal),
    createPlaylist: (id, versionId) =>
      call(withParam(ROUTES.setlistPlaylist, "id", id), createPlaylistResponseSchema, undefined, {
        method: "POST",
        headers: { "Content-Type": JSON_TYPE },
        body: JSON.stringify({ versionId }),
      }),
    streamPreview: async (id, { onProgress, signal }) => {
      const response = await send(
        withParam(ROUTES.setlistPreview, "id", id),
        { headers: { Accept: "text/event-stream" } },
        signal,
      );
      if (!response.body) throw stoppedEarlyError();
      try {
        return await readPreviewStream(response.body, onProgress);
      } catch (error) {
        if (signal?.aborted) throw signal.reason;
        throw error instanceof ApiCallError ? error : stoppedEarlyError();
      }
    },
  };
}
