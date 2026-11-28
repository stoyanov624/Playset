// The real API client over HTTP: the exact requests it sends, answers parsed by the contract,
// server errors, its own client errors, cancelling, and reading the preview stream.
import { describe, expect, it, vi } from "vitest";
import { ApiCallError, createHttpApi } from "../../../../src/web/client/api/index.js";
import type { PreviewProgress } from "../../../../src/web/shared/index.js";
import { madridPreview, pearlJamPage, portlandStatusAnswer } from "../../shared/fixtures/contract-values";

interface SentRequest {
  path: string;
  method: string;
  headers: Headers;
  body: string | undefined;
  signal: AbortSignal | undefined;
}

type Answer = (request: SentRequest) => Response | Promise<Response>;

const encoder = new TextEncoder();

/** Reads what the client asked for, from either a Request or a URL plus init. */
async function readRequest(input: RequestInfo | URL, init: RequestInit | undefined): Promise<SentRequest> {
  const request = input instanceof Request ? input : undefined;
  const raw = input instanceof Request ? input.url : input.toString();
  let path = raw;
  if (!raw.startsWith("/")) {
    const url = new URL(raw);
    expect(url.origin).toBe(window.location.origin);
    path = raw.slice(url.origin.length);
  }
  const headers = new Headers(request?.headers);
  new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
  const bodyInit = init?.body ?? undefined;
  const body = typeof bodyInit === "string" ? bodyInit : request && request.body ? await request.text() : undefined;
  const signal = init?.signal ?? request?.signal ?? undefined;
  return { path, method: (init?.method ?? request?.method ?? "GET").toUpperCase(), headers, body, signal };
}

/**
 * A fetch that answers with `answer` and behaves like the browser's on cancel: an aborted signal
 * rejects the call, or errors the body stream once the answer has started, with the signal's reason.
 */
function fakeFetch(answer: Answer) {
  const sent: SentRequest[] = [];
  const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = await readRequest(input, init);
    sent.push(request);
    const signal = request.signal;
    if (signal?.aborted) throw signal.reason;
    const aborted = new Promise<never>((_resolve, reject) => {
      signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
    });
    // An abort after the answer arrived is handled by the body stream below, not here.
    aborted.catch(() => undefined);
    const response = await Promise.race([answer(request), aborted]);
    if (!signal || !response.body) return response;
    const reader = response.body.getReader();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        signal.addEventListener("abort", () => {
          controller.error(signal.reason);
          void reader.cancel(signal.reason).catch(() => undefined);
        }, { once: true });
      },
      async pull(controller) {
        try {
          const { done, value } = await reader.read();
          if (done) controller.close();
          else controller.enqueue(value);
        } catch (error) {
          controller.error(error);
        }
      },
    });
    return new Response(body, { status: response.status, headers: response.headers });
  });
  return { fetch: fetchFn as typeof fetch, sent };
}

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
}

/** A text/event-stream answer delivered in exactly these chunks (strings or raw bytes). */
function stream(chunks: Array<string | Uint8Array>, options: { status?: number; open?: boolean } = {}): Response {
  let index = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = chunks[index];
      index += 1;
      if (chunk === undefined) {
        // An open stream waits for more, as a live preview does while Matching.
        if (!options.open) controller.close();
        return options.open ? new Promise<void>(() => undefined) : undefined;
      }
      controller.enqueue(typeof chunk === "string" ? encoder.encode(chunk) : chunk);
      return undefined;
    },
  });
  return new Response(body, { status: options.status ?? 200, headers: { "Content-Type": "text/event-stream" } });
}

async function failure(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("the call did not fail");
}

async function apiError(promise: Promise<unknown>) {
  const error = await failure(promise);
  expect(error).toBeInstanceOf(ApiCallError);
  if (!(error instanceof ApiCallError)) throw error;
  return { code: error.code, message: error.message, hint: error.hint, retryAfterSeconds: error.retryAfterSeconds };
}

const NO_ANSWER = {
  code: "UPSTREAM_UNAVAILABLE",
  message: "Playset isn't answering right now.",
  hint: "Check your connection and try again in a minute.",
  retryAfterSeconds: undefined,
};
const DRIFTED = {
  code: "INTERNAL",
  message: "Something went wrong on our side.",
  hint: "Please try again in a minute.",
  retryAfterSeconds: undefined,
};
const STOPPED_EARLY = {
  code: "UPSTREAM_UNAVAILABLE",
  message: "The preview stopped before it finished.",
  hint: "Try again in a minute.",
  retryAfterSeconds: undefined,
};

const TOO_MANY_SEARCHES = {
  error: { code: "RATE_LIMITED", message: "Too many searches from here.", hint: "Wait a moment, then search again." },
};

// ---------------------------------------------------------------- requests

describe("requests", () => {
  it("AC-47: search sends GET /api/artists with the name percent-encoded and returns the parsed answer", async () => {
    const answer = {
      artists: [{ name: "Sigur Rós", mbid: "F6F2A6F3-0B3B-4C0E-8C7A-2D5E7F9A1B3C", disambiguation: "Icelandic post-rock band" }],
    };
    const { fetch, sent } = fakeFetch(() => json(200, answer));
    const result = await createHttpApi({ fetch }).searchArtists("Sigur Rós");
    expect(sent).toHaveLength(1);
    expect(sent[0]?.path).toBe("/api/artists?name=Sigur%20R%C3%B3s");
    expect(sent[0]?.method).toBe("GET");
    expect(sent[0]?.headers.get("Accept")).toBe("application/json");
    // Parsed by the contract: the mbid comes back lower-cased.
    expect(result).toEqual({
      artists: [{ name: "Sigur Rós", mbid: "f6f2a6f3-0b3b-4c0e-8c7a-2d5e7f9a1b3c", disambiguation: "Icelandic post-rock band" }],
    });
  });

  it("AC-47: a Setlist page sends the mbid in the path and the page number in the query", async () => {
    const { fetch, sent } = fakeFetch(() => json(200, pearlJamPage()));
    const api = createHttpApi({ fetch });
    const page2 = await api.getArtistSetlists("83b9cbe7-9857-49e2-ab8e-b57b01038103", 2);
    await api.getArtistSetlists("83b9cbe7-9857-49e2-ab8e-b57b01038103", 1);
    expect(sent.map((request) => request.path)).toEqual([
      "/api/artists/83b9cbe7-9857-49e2-ab8e-b57b01038103/setlists?page=2",
      "/api/artists/83b9cbe7-9857-49e2-ab8e-b57b01038103/setlists?page=1",
    ]);
    expect(sent.every((request) => request.method === "GET" && request.headers.get("Accept") === "application/json")).toBe(true);
    expect(page2).toEqual(pearlJamPage());
  });

  it("AC-47: a setlist.fm link is sent as one encoded query value", async () => {
    const link = "https://www.setlist.fm/setlist/a/b-73a1b2c5.html?x=1&y=2";
    const { fetch, sent } = fakeFetch(() => json(200, { setlistId: "73A1B2C5" }));
    const result = await createHttpApi({ fetch }).readSetlistLink(link);
    expect(sent[0]?.path).toBe(`/api/setlist-links?url=${encodeURIComponent(link)}`);
    expect(sent[0]?.path).toBe("/api/setlist-links?url=https%3A%2F%2Fwww.setlist.fm%2Fsetlist%2Fa%2Fb-73a1b2c5.html%3Fx%3D1%26y%3D2");
    expect(sent[0]?.headers.get("Accept")).toBe("application/json");
    expect(result).toEqual({ setlistId: "73a1b2c5" });
  });

  it("AC-47: the Setlist status sends GET /api/setlists/:id", async () => {
    const { fetch, sent } = fakeFetch(() => json(200, portlandStatusAnswer()));
    const result = await createHttpApi({ fetch }).getSetlist("73a1b2c5");
    expect(sent[0]?.path).toBe("/api/setlists/73a1b2c5");
    expect(sent[0]?.method).toBe("GET");
    expect(sent[0]?.headers.get("Accept")).toBe("application/json");
    expect(result).toEqual(portlandStatusAnswer());
  });

  it("AC-47: create sends POST /api/setlists/:id/playlist with exactly the version as JSON", async () => {
    const answer = { url: "https://open.spotify.com/playlist/5PqRsTuVwXyZaBcDeFgHiJ", status: "created" };
    const { fetch, sent } = fakeFetch(() => json(200, answer));
    const result = await createHttpApi({ fetch }).createPlaylist("73a1b2c5", "g3e5f7a91");
    expect(sent[0]?.path).toBe("/api/setlists/73a1b2c5/playlist");
    expect(sent[0]?.method).toBe("POST");
    expect(sent[0]?.headers.get("Content-Type")).toBe("application/json");
    expect(sent[0]?.headers.get("Accept")).toBe("application/json");
    expect(sent[0]?.body).toBe('{"versionId":"g3e5f7a91"}');
    expect(result).toEqual(answer);
  });

  it("AC-47: an empty candidate list comes back as it is", async () => {
    const { fetch } = fakeFetch(() => json(200, { artists: [] }));
    expect(await createHttpApi({ fetch }).searchArtists("arctci monkys")).toEqual({ artists: [] });
  });
});

// ---------------------------------------------------------------- server errors

describe("server errors", () => {
  it("AC-48: a 429 with a whole-seconds Retry-After carries the code, message, hint and retry wait", async () => {
    const { fetch } = fakeFetch(() => json(429, TOO_MANY_SEARCHES, { "Retry-After": "42" }));
    expect(await apiError(createHttpApi({ fetch }).searchArtists("arctic monkeys"))).toEqual({
      code: "RATE_LIMITED",
      message: "Too many searches from here.",
      hint: "Wait a moment, then search again.",
      retryAfterSeconds: 42,
    });
  });

  it.each([
    ["an HTTP date", { "Retry-After": "Wed, 21 Oct 2026 07:28:00 GMT" }],
    ["a fraction", { "Retry-After": "1.5" }],
    ["no header", {}],
  ])("AC-48: a 429 with %s as Retry-After has no retry wait", async (_kind, headers) => {
    const { fetch } = fakeFetch(() => json(429, TOO_MANY_SEARCHES, headers));
    expect(await apiError(createHttpApi({ fetch }).searchArtists("arctic monkeys"))).toEqual({
      code: "RATE_LIMITED",
      message: "Too many searches from here.",
      hint: "Wait a moment, then search again.",
      retryAfterSeconds: undefined,
    });
  });

  it("AC-48: an error body without a hint gives an error without a hint", async () => {
    const { fetch } = fakeFetch(() =>
      json(404, { error: { code: "NOT_FOUND", message: "setlist.fm has no Setlist with that id." } }),
    );
    const error = await apiError(createHttpApi({ fetch }).getSetlist("73a1b2c5"));
    expect(error).toEqual({
      code: "NOT_FOUND", message: "setlist.fm has no Setlist with that id.", hint: undefined, retryAfterSeconds: undefined,
    });
  });

  it("AC-48: a create refused with SETLIST_CHANGED carries the server's words", async () => {
    const { fetch } = fakeFetch(() =>
      json(409, {
        error: {
          code: "SETLIST_CHANGED", message: "This Setlist changed on setlist.fm a moment ago.",
          hint: "Load a fresh preview to see the new songs.",
        },
      }),
    );
    expect(await apiError(createHttpApi({ fetch }).createPlaylist("73a1b2c5", "g3e5f7a91"))).toEqual({
      code: "SETLIST_CHANGED",
      message: "This Setlist changed on setlist.fm a moment ago.",
      hint: "Load a fresh preview to see the new songs.",
      retryAfterSeconds: undefined,
    });
  });

  it("AC-48: ApiCallError keeps the fields it is given", () => {
    const error = new ApiCallError({ code: "RATE_LIMITED", message: "Too many searches from here.", hint: "Wait.", retryAfterSeconds: 42 });
    expect(error).toBeInstanceOf(Error);
    expect([error.code, error.message, error.hint, error.retryAfterSeconds]).toEqual([
      "RATE_LIMITED", "Too many searches from here.", "Wait.", 42,
    ]);
  });
});

// ---------------------------------------------------------------- client errors

describe("client errors", () => {
  it("AC-49: a fetch that rejects (no connection) is UPSTREAM_UNAVAILABLE in Playset's words", async () => {
    const { fetch } = fakeFetch(() => Promise.reject(new TypeError("Failed to fetch")));
    expect(await apiError(createHttpApi({ fetch }).searchArtists("arctic monkeys"))).toEqual(NO_ANSWER);
  });

  it("AC-49: a non-JSON answer (a proxy's error page) is UPSTREAM_UNAVAILABLE", async () => {
    const { fetch } = fakeFetch(
      () => new Response("<html>Bad Gateway</html>", { status: 502, headers: { "Content-Type": "text/html" } }),
    );
    expect(await apiError(createHttpApi({ fetch }).getSetlist("73a1b2c5"))).toEqual(NO_ANSWER);
  });

  it("AC-49: a 200 answer that isn't JSON is UPSTREAM_UNAVAILABLE", async () => {
    const { fetch } = fakeFetch(() => new Response("not json", { status: 200, headers: { "Content-Type": "text/plain" } }));
    expect(await apiError(createHttpApi({ fetch }).searchArtists("arctic monkeys"))).toEqual(NO_ANSWER);
  });

  it("AC-49: an answer that fails the contract's schema is INTERNAL", async () => {
    const { fetch } = fakeFetch(() => json(200, { artists: [{ name: "Genesis", mbid: "8e3fcd7d", autoPick: true }] }));
    expect(await apiError(createHttpApi({ fetch }).searchArtists("genesis"))).toEqual(DRIFTED);
  });

  it.each([
    ["an unknown code", { error: { code: "TEAPOT", message: "I'm a teapot." } }],
    ["no error wrapper", { code: "INTERNAL", message: "Something went wrong on our side." }],
    ["an empty object", {}],
  ])("AC-49: an error answer with %s is INTERNAL", async (_kind, body) => {
    const { fetch } = fakeFetch(() => json(500, body));
    expect(await apiError(createHttpApi({ fetch }).getSetlist("73a1b2c5"))).toEqual(DRIFTED);
  });

  it("AC-49: a call cancelled before the answer rejects with the signal's reason, not an API error", async () => {
    const controller = new AbortController();
    const reason = new DOMException("The Visitor left", "AbortError");
    const { fetch } = fakeFetch(() => new Promise<Response>(() => undefined));
    const call = createHttpApi({ fetch }).searchArtists("arctic monkeys", controller.signal);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    controller.abort(reason);
    const error = await failure(call);
    expect(error).toBe(reason);
    expect(error).not.toBeInstanceOf(ApiCallError);
  });

  it("AC-49: a call whose signal is already aborted rejects with its reason", async () => {
    const controller = new AbortController();
    const reason = new DOMException("The Visitor left", "AbortError");
    controller.abort(reason);
    const { fetch } = fakeFetch(() => json(200, pearlJamPage()));
    const error = await failure(createHttpApi({ fetch }).getArtistSetlists("83b9cbe7-9857-49e2-ab8e-b57b01038103", 1, controller.signal));
    expect(error).toBe(reason);
    expect(error).not.toBeInstanceOf(ApiCallError);
  });

  it("AC-49: the status and Setlist page pass their cancel signal to fetch", async () => {
    const { fetch, sent } = fakeFetch((request) =>
      json(200, request.path.startsWith("/api/artists/") ? pearlJamPage() : portlandStatusAnswer()),
    );
    const api = createHttpApi({ fetch });
    const statusSignal = new AbortController();
    const pageSignal = new AbortController();
    await api.getSetlist("2bf1c8e4", statusSignal.signal);
    await api.getArtistSetlists("83b9cbe7-9857-49e2-ab8e-b57b01038103", 1, pageSignal.signal);
    statusSignal.abort();
    pageSignal.abort();
    expect(sent.map((request) => request.signal?.aborted)).toEqual([true, true]);
  });
});

// ---------------------------------------------------------------- preview stream

const PREVIEW_JSON = JSON.stringify(madridPreview());
const E13_CHUNKS = [
  "event: prog",
  'ress\r\ndata: {"n":1,"total":2}\r\n\r\n: keep-alive\n\n',
  'event: progress\ndata: {"n":2,"total":2}\n\nevent: preview\ndata: ',
  PREVIEW_JSON,
  "\n\n",
];

function previewCall(fetch: typeof globalThis.fetch, signal: AbortSignal = new AbortController().signal) {
  const progress: PreviewProgress[] = [];
  const call = createHttpApi({ fetch }).streamPreview("73a1b2c5", { onProgress: (p) => progress.push(p), signal });
  return { call, progress };
}

describe("preview stream", () => {
  it("AC-50: sends GET /api/setlists/:id/preview as an event stream with the caller's signal", async () => {
    const controller = new AbortController();
    const { fetch, sent } = fakeFetch(() => stream(E13_CHUNKS));
    await previewCall(fetch, controller.signal).call;
    expect(sent[0]?.path).toBe("/api/setlists/73a1b2c5/preview");
    expect(sent[0]?.method).toBe("GET");
    expect(sent[0]?.headers.get("Accept")).toBe("text/event-stream");
    controller.abort();
    expect(sent[0]?.signal?.aborted).toBe(true);
  });

  it("AC-50: hands each progress to the callback in order and resolves with the preview, across split chunks", async () => {
    const { fetch } = fakeFetch(() => stream(E13_CHUNKS));
    const { call, progress } = previewCall(fetch);
    expect(await call).toEqual(madridPreview());
    expect(progress).toEqual([{ n: 1, total: 2 }, { n: 2, total: 2 }]);
  });

  it("AC-50: reads the stream one byte at a time, including a character split across bytes", async () => {
    const bytes = encoder.encode(E13_CHUNKS.join(""));
    const { fetch } = fakeFetch(() => stream(Array.from(bytes, (byte) => Uint8Array.of(byte))));
    const { call, progress } = previewCall(fetch);
    const result = await call;
    expect(result.playlistName).toBe("Arctic Monkeys – 2026-06-02 – Madrid");
    expect(result).toEqual(madridPreview());
    expect(progress).toEqual([{ n: 1, total: 2 }, { n: 2, total: 2 }]);
  });

  it("AC-50: reads the stream split in two at every byte", async () => {
    const bytes = encoder.encode(E13_CHUNKS.join(""));
    for (let cut = 1; cut < bytes.length; cut += 1) {
      const { fetch } = fakeFetch(() => stream([bytes.slice(0, cut), bytes.slice(cut)]));
      const { call, progress } = previewCall(fetch);
      const result = await call;
      expect(result.playlistName, `cut at byte ${cut}`).toBe("Arctic Monkeys – 2026-06-02 – Madrid");
      expect(progress, `cut at byte ${cut}`).toHaveLength(2);
    }
  });

  it("AC-50: ignores comments and blank keep-alives between events", async () => {
    const { fetch } = fakeFetch(() =>
      stream([": hello\n\n", "\n\n", ': keep-alive\r\n\r\nevent: preview\r\ndata: ', PREVIEW_JSON, "\r\n\r\n"]),
    );
    const { call, progress } = previewCall(fetch);
    expect(await call).toEqual(madridPreview());
    expect(progress).toEqual([]);
  });

  it("AC-50: an error event fails the call with that error and no retry wait", async () => {
    const { fetch } = fakeFetch(() =>
      stream([
        'event: progress\ndata: {"n":1,"total":5}\n\n',
        'event: error\ndata: {"code":"UPSTREAM_UNAVAILABLE","message":"Spotify isn\'t answering right now.","hint":"Try again in a minute."}\n\n',
      ]),
    );
    const { call, progress } = previewCall(fetch);
    expect(await apiError(call)).toEqual({
      code: "UPSTREAM_UNAVAILABLE",
      message: "Spotify isn't answering right now.",
      hint: "Try again in a minute.",
      retryAfterSeconds: undefined,
    });
    expect(progress).toEqual([{ n: 1, total: 5 }]);
  });

  it("AC-50: an error status before the stream fails as a server error, with its retry wait", async () => {
    const { fetch } = fakeFetch(() =>
      json(
        429,
        {
          error: {
            code: "RATE_LIMITED", message: "You've asked for many previews in the last hour.",
            hint: "Try again later, or open a Setlist that already has a playlist.",
          },
        },
        { "Retry-After": "120" },
      ),
    );
    expect(await apiError(previewCall(fetch).call)).toEqual({
      code: "RATE_LIMITED",
      message: "You've asked for many previews in the last hour.",
      hint: "Try again later, or open a Setlist that already has a playlist.",
      retryAfterSeconds: 120,
    });
  });

  it("AC-50: PLAYLISTS_UNAVAILABLE before the stream carries the server's words", async () => {
    const { fetch } = fakeFetch(() =>
      json(503, {
        error: {
          code: "PLAYLISTS_UNAVAILABLE", message: "Playlists can't be made right now.",
          hint: "Search and existing playlists still work. Try again later.",
        },
      }),
    );
    expect(await apiError(previewCall(fetch).call)).toEqual({
      code: "PLAYLISTS_UNAVAILABLE",
      message: "Playlists can't be made right now.",
      hint: "Search and existing playlists still work. Try again later.",
      retryAfterSeconds: undefined,
    });
  });

  it("AC-51: a stream that ends after progress without a preview or error fails as stopped early", async () => {
    const { fetch } = fakeFetch(() => stream(E13_CHUNKS.slice(0, 2).concat('event: progress\ndata: {"n":2,"total":2}\n\n')));
    const { call, progress } = previewCall(fetch);
    expect(await apiError(call)).toEqual(STOPPED_EARLY);
    expect(progress).toEqual([{ n: 1, total: 2 }, { n: 2, total: 2 }]);
  });

  it("AC-51: a stream cut in the middle of the preview event fails as stopped early", async () => {
    const { fetch } = fakeFetch(() => stream(E13_CHUNKS.slice(0, 4)));
    expect(await apiError(previewCall(fetch).call)).toEqual(STOPPED_EARLY);
  });

  it("AC-51: an empty stream fails as stopped early", async () => {
    const { fetch } = fakeFetch(() => stream([]));
    expect(await apiError(previewCall(fetch).call)).toEqual(STOPPED_EARLY);
  });

  it.each([
    ["a progress past its total", 'event: progress\ndata: {"n":3,"total":2}\n\n'],
    ["a progress that isn't JSON", "event: progress\ndata: three\n\n"],
    ["a preview missing its version", `event: preview\ndata: ${JSON.stringify({ ...madridPreview(), versionId: undefined })}\n\n`],
    ["an error event with an unknown code", 'event: error\ndata: {"code":"TEAPOT","message":"x"}\n\n'],
  ])("AC-51: %s fails with the INTERNAL client error", async (_kind, chunk) => {
    const { fetch } = fakeFetch(() => stream([chunk, `event: preview\ndata: ${PREVIEW_JSON}\n\n`]));
    expect(await apiError(previewCall(fetch).call)).toEqual(DRIFTED);
  });

  it("AC-51: aborting the signal mid-stream closes it and rejects with the signal's reason", async () => {
    const controller = new AbortController();
    const reason = new DOMException("The Visitor left", "AbortError");
    const { fetch } = fakeFetch(() => stream([E13_CHUNKS[0] ?? "", E13_CHUNKS[1] ?? ""], { open: true }));
    const { call, progress } = previewCall(fetch, controller.signal);
    await vi.waitFor(() => expect(progress).toEqual([{ n: 1, total: 2 }]));
    controller.abort(reason);
    const error = await failure(call);
    expect(error).toBe(reason);
    expect(error).not.toBeInstanceOf(ApiCallError);
  });
});
