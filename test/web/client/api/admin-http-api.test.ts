// The real API client's admin calls over HTTP: the status (sent with the page's cookies, parsed
// by the contract's admin status schema) and log out, with server and client errors.
import { describe, expect, it, vi } from "vitest";
import { ApiCallError, createHttpApi } from "../../../../src/web/client/api/index.js";
import { usageDates } from "../../shared/fixtures/contract-values";

interface SentRequest {
  /** The request target exactly as the client passed it to fetch. */
  target: string;
  path: string;
  method: string;
  headers: Headers;
  body: string | undefined;
  hasBody: boolean;
  credentials: RequestCredentials | undefined;
  signal: AbortSignal | undefined;
}

type Answer = (request: SentRequest) => Response | Promise<Response>;

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
  let body: string | undefined;
  if (typeof bodyInit === "string") body = bodyInit;
  else if (request && request.body) body = await request.text();
  const hasBody = (bodyInit !== undefined && bodyInit !== null) || (request !== undefined && request.body !== null);
  // A Request built without credentials says "same-origin"; only an explicit init counts as opting out.
  const credentials = init?.credentials ?? request?.credentials ?? undefined;
  const signal = init?.signal ?? request?.signal ?? undefined;
  return { target: raw, path, method: (init?.method ?? request?.method ?? "GET").toUpperCase(), headers, body, hasBody, credentials, signal };
}

/** A fetch that answers with `answer`; an aborted signal rejects the call with its reason. */
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
    aborted.catch(() => undefined);
    return Promise.race([answer(request), aborted]);
  });
  return { fetch: fetchFn as typeof fetch, sent };
}

/**
 * The request keeps the page's cookies: credentials left to the default, or set to a value that
 * still sends them to the same origin. "omit" (or anything else) would drop the admin's login.
 */
function expectsPageCookies(request: SentRequest | undefined): void {
  expect([undefined, "same-origin", "include"]).toContain(request?.credentials);
}

/** The request goes to `path` on the page's own origin, with no query and no other host. */
function expectsSameOriginTarget(request: SentRequest | undefined, path: string): void {
  const target = request?.target ?? "";
  expect(new URL(target, window.location.origin).origin).toBe(window.location.origin);
  expect(target === path || target === `${window.location.origin}${path}`).toBe(true);
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
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
  return { code: error.code, message: error.message, hint: error.hint };
}

const NO_ANSWER = {
  code: "UPSTREAM_UNAVAILABLE",
  message: "Playset isn't answering right now.",
  hint: "Check your connection and try again in a minute.",
};
const DRIFTED = {
  code: "INTERNAL",
  message: "Something went wrong on our side.",
  hint: "Please try again in a minute.",
};

/** E2 as the server sends it: the days oldest first. */
function e2StatusJson(days = 30) {
  const perDay = usageDates(days)
    .map((date, i) => ({ date, created: i === 0 ? 4 : i === 1 ? 2 : 0, updated: i === 0 ? 1 : 0, opened: i === 0 ? 37 : i === 1 ? 21 : 0 }))
    .reverse();
  return {
    hostAccount: { connected: true, displayName: "playset-host" },
    config: [
      { name: "setlist.fm API key", present: true },
      { name: "Spotify client id", present: true },
      { name: "Host Account id", present: true },
      { name: "Cookie secret", present: false },
    ],
    usage: {
      playlistsMade: 128,
      opens: 1042,
      perDay,
      topArtists: [
        { artist: "Arctic Monkeys", playlistCount: 14 },
        { artist: "Fontaines D.C.", playlistCount: 9 },
        { artist: "Sigur Rós", playlistCount: 1 },
      ],
    },
    rateLimitHitsToday: 3,
  };
}

// ---------------------------------------------------------------- status

describe("admin status", () => {
  it("AC-17: sends GET /api/admin/status with Accept JSON, the page's cookies and the signal, and returns the parsed status", async () => {
    const { fetch, sent } = fakeFetch(() => json(200, e2StatusJson()));
    const controller = new AbortController();
    const status = await createHttpApi({ fetch }).getAdminStatus(controller.signal);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.path).toBe("/api/admin/status");
    expect(sent[0]?.method).toBe("GET");
    expect(sent[0]?.headers.get("Accept")).toBe("application/json");
    expectsPageCookies(sent[0]);
    expectsSameOriginTarget(sent[0], "/api/admin/status");
    // The caller's own signal, not a copy, so cancelling the call cancels the request.
    expect(sent[0]?.signal).toBe(controller.signal);
    expect(status).toEqual(e2StatusJson());
  });

  it("AC-17: a status with a field the contract doesn't know fails the schema with the INTERNAL client error", async () => {
    const { fetch } = fakeFetch(() => json(200, { ...e2StatusJson(), visitorIps: ["203.0.113.7"] }));
    expect(await apiError(createHttpApi({ fetch }).getAdminStatus())).toEqual(DRIFTED);
  });

  it("AC-17: a 200 HTML page (the app page served in place of the API) fails with the UPSTREAM_UNAVAILABLE client error", async () => {
    const { fetch } = fakeFetch(() => new Response("<!doctype html><title>Playset</title>", { status: 200, headers: { "Content-Type": "text/html" } }));
    expect(await apiError(createHttpApi({ fetch }).getAdminStatus())).toEqual(NO_ANSWER);
  });

  it("AC-17: an error status with malformed JSON fails with the UPSTREAM_UNAVAILABLE client error", async () => {
    const { fetch } = fakeFetch(() => new Response('{"error": {"code": "INTERNAL"', { status: 500, headers: { "Content-Type": "application/json" } }));
    expect(await apiError(createHttpApi({ fetch }).getAdminStatus())).toEqual(NO_ANSWER);
  });

  it("AC-17: an error body with a code the contract doesn't know fails with the INTERNAL client error", async () => {
    const { fetch } = fakeFetch(() => json(401, { error: { code: "SESSION_EXPIRED", message: "Your session expired." } }));
    expect(await apiError(createHttpApi({ fetch }).getAdminStatus())).toEqual(DRIFTED);
  });

  it("AC-17: works without a signal", async () => {
    const { fetch } = fakeFetch(() => json(200, e2StatusJson()));
    expect(await createHttpApi({ fetch }).getAdminStatus()).toEqual(e2StatusJson());
  });

  it("AC-17: a 401 NOT_ADMIN body fails with that code and message and no hint", async () => {
    const { fetch } = fakeFetch(() =>
      json(401, { error: { code: "NOT_ADMIN", message: "Log in as the Host Account to see this page." } }),
    );
    expect(await apiError(createHttpApi({ fetch }).getAdminStatus())).toEqual({
      code: "NOT_ADMIN",
      message: "Log in as the Host Account to see this page.",
      hint: undefined,
    });
  });

  it("AC-17: a 403 NOT_ADMIN body with a hint fails with its code, message and hint", async () => {
    const { fetch } = fakeFetch(() =>
      json(403, {
        error: { code: "NOT_ADMIN", message: "Log in as the Host Account to see this page.", hint: "Use the Log in with Spotify button." },
      }),
    );
    expect(await apiError(createHttpApi({ fetch }).getAdminStatus())).toEqual({
      code: "NOT_ADMIN",
      message: "Log in as the Host Account to see this page.",
      hint: "Use the Log in with Spotify button.",
    });
  });

  it("AC-17: a 503 UPSTREAM_UNAVAILABLE body fails with that error", async () => {
    const { fetch } = fakeFetch(() =>
      json(503, { error: { code: "UPSTREAM_UNAVAILABLE", message: "Playset can't read its records right now.", hint: "Try again in a minute." } }),
    );
    expect(await apiError(createHttpApi({ fetch }).getAdminStatus())).toEqual({
      code: "UPSTREAM_UNAVAILABLE",
      message: "Playset can't read its records right now.",
      hint: "Try again in a minute.",
    });
  });

  it("AC-17: a status carrying the Host Account id fails the schema with the INTERNAL client error", async () => {
    const body = { ...e2StatusJson(), hostAccount: { connected: true, id: "31abcxyzhost" } };
    const { fetch } = fakeFetch(() => json(200, body));
    expect(await apiError(createHttpApi({ fetch }).getAdminStatus())).toEqual(DRIFTED);
  });

  it("AC-17: a status with 29 days fails the schema with the INTERNAL client error", async () => {
    const { fetch } = fakeFetch(() => json(200, e2StatusJson(29)));
    expect(await apiError(createHttpApi({ fetch }).getAdminStatus())).toEqual(DRIFTED);
  });

  it("AC-17: a 502 HTML page fails with the UPSTREAM_UNAVAILABLE client error", async () => {
    const { fetch } = fakeFetch(() => new Response("<html>Bad Gateway</html>", { status: 502, headers: { "Content-Type": "text/html" } }));
    expect(await apiError(createHttpApi({ fetch }).getAdminStatus())).toEqual(NO_ANSWER);
  });

  it("AC-17: no answer (fetch rejects) fails with the UPSTREAM_UNAVAILABLE client error", async () => {
    const { fetch } = fakeFetch(() => Promise.reject(new TypeError("Failed to fetch")));
    expect(await apiError(createHttpApi({ fetch }).getAdminStatus())).toEqual(NO_ANSWER);
  });

  it("AC-17: a call cancelled before the answer rejects with the signal's reason, not an API error", async () => {
    const controller = new AbortController();
    const reason = new DOMException("The admin left", "AbortError");
    const { fetch } = fakeFetch(() => new Promise<Response>(() => undefined));
    const call = createHttpApi({ fetch }).getAdminStatus(controller.signal);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    controller.abort(reason);
    const error = await failure(call);
    expect(error).toBe(reason);
    expect(error).not.toBeInstanceOf(ApiCallError);
  });

  it("AC-17: a call whose signal is already aborted rejects with its reason", async () => {
    const controller = new AbortController();
    const reason = new DOMException("The admin left", "AbortError");
    controller.abort(reason);
    const { fetch } = fakeFetch(() => json(200, e2StatusJson()));
    const error = await failure(createHttpApi({ fetch }).getAdminStatus(controller.signal));
    expect(error).toBe(reason);
  });
});

// ---------------------------------------------------------------- log out

describe("log out", () => {
  it("AC-18: sends POST /api/admin/logout with Accept JSON, no body and the page's cookies; a 204 resolves with no value", async () => {
    const { fetch, sent } = fakeFetch(() => new Response(null, { status: 204 }));
    const result = await createHttpApi({ fetch }).logOut();
    expect(result).toBeUndefined();
    expect(sent).toHaveLength(1);
    expect(sent[0]?.path).toBe("/api/admin/logout");
    expect(sent[0]?.method).toBe("POST");
    expect(sent[0]?.headers.get("Accept")).toBe("application/json");
    expect(sent[0]?.hasBody).toBe(false);
    expect(sent[0]?.body).toBeUndefined();
    expectsPageCookies(sent[0]);
    expectsSameOriginTarget(sent[0], "/api/admin/logout");
  });

  it.each([
    ["200 {}", () => json(200, {})],
    ["200 with an unexpected body", () => json(200, { ok: true })],
    ["200 with a non-JSON body", () => new Response("done", { status: 200, headers: { "Content-Type": "text/plain" } })],
    ["205 empty", () => new Response(null, { status: 205 })],
  ])("AC-18: a 2xx answer (%s) resolves with no value", async (_kind, answer) => {
    const { fetch } = fakeFetch(answer);
    expect(await createHttpApi({ fetch }).logOut()).toBeUndefined();
  });

  it("AC-18: no answer (fetch rejects) fails with the UPSTREAM_UNAVAILABLE client error", async () => {
    const { fetch } = fakeFetch(() => Promise.reject(new TypeError("Failed to fetch")));
    expect(await apiError(createHttpApi({ fetch }).logOut())).toEqual(NO_ANSWER);
  });

  it("AC-18: a 500 INTERNAL body fails with that code, message and hint", async () => {
    const { fetch } = fakeFetch(() =>
      json(500, { error: { code: "INTERNAL", message: "Something went wrong on our side.", hint: "Please try again in a minute." } }),
    );
    expect(await apiError(createHttpApi({ fetch }).logOut())).toEqual(DRIFTED);
  });

  it("AC-18: a 502 HTML page fails with the UPSTREAM_UNAVAILABLE client error", async () => {
    const { fetch } = fakeFetch(() => new Response("<html>Bad Gateway</html>", { status: 502, headers: { "Content-Type": "text/html" } }));
    expect(await apiError(createHttpApi({ fetch }).logOut())).toEqual(NO_ANSWER);
  });

  it("AC-18: an error body that fails the contract's error schema fails with the INTERNAL client error", async () => {
    const { fetch } = fakeFetch(() => json(500, { message: "oops" }));
    expect(await apiError(createHttpApi({ fetch }).logOut())).toEqual(DRIFTED);
  });

  it("AC-18: a 302 redirect is not a 2xx answer and fails with the UPSTREAM_UNAVAILABLE client error", async () => {
    const { fetch } = fakeFetch(() => new Response(null, { status: 302, headers: { Location: "/admin" } }));
    expect(await apiError(createHttpApi({ fetch }).logOut())).toEqual(NO_ANSWER);
  });

  it("AC-18: a 403 NOT_ADMIN body fails with that code and message", async () => {
    const { fetch } = fakeFetch(() => json(403, { error: { code: "NOT_ADMIN", message: "Only the admin can do that." } }));
    expect(await apiError(createHttpApi({ fetch }).logOut())).toEqual({
      code: "NOT_ADMIN",
      message: "Only the admin can do that.",
      hint: undefined,
    });
  });
});
