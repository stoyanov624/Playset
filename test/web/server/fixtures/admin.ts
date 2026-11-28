// The admin side of the web app under test (PRD 0017): the app built with createApp from the shared
// harness's fakes plus a Host token store, a fake Host login (Spotify's code exchange, /me and refresh,
// throwing the core's real errors), the real usage events and the real Host token source over the store.
// Cookies are kept by hand, so every test says exactly which cookie the "browser" sends.
import { createHash } from "node:crypto";
import request from "supertest";
import { expect } from "vitest";
import { RateLimitError, fetchSpotifyAccount, refreshAccessToken, type TokenGrant } from "../../../../src/core/spotify-auth";
import {
  createApp,
  createHostTokenSource,
  createMemoryHostTokenStore,
  createMemoryUsageEvents,
} from "../../../../src/web/server/index.js";
import { A, COOKIE_SECRET, HOST_ID, HOST_TOKEN, makeHarness, sharedClientDir, type HarnessOptions } from "./harness";

// ---------------------------------------------------------------- the examples' values

export const HOST_REFRESH = "AQChost-refresh-token";
export const CODE = "AQDx9-test-code";
export const OTHER_SECRET = "other-cookie-secret-0000000000000000";
export const REDIRECT_URI = "http://127.0.0.1:3000/admin/callback";
export const AUTHORIZE_ENDPOINT = "https://accounts.spotify.com/authorize";
export const SCOPE = "playlist-modify-private playlist-modify-public playlist-read-private";
export const NOW_MS = 1795876200000; // 2026-11-28T14:30:00.000Z

export const OTHER_ID = "jane.doe.music";
export const OTHER_ACCESS = "BQDjane-other-token";
export const OTHER_REFRESH = "AQCjane-other-refresh";

/** Never in any cookie value, answer, header or log line of the admin routes. */
export const ADMIN_NEVER = [
  HOST_ID,
  HOST_TOKEN,
  "BQDhost-refreshed",
  HOST_REFRESH,
  "AQChost-rotated",
  CODE,
  OTHER_ID,
  OTHER_ACCESS,
  OTHER_REFRESH,
  COOKIE_SECRET,
];

export interface StoredHostToken {
  accountId: string;
  displayName?: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export interface HostTokenStoreLike {
  read(): Promise<StoredHostToken | undefined>;
  save(token: StoredHostToken): Promise<void>;
  clear(): Promise<void>;
}

/** X2's `t`: the Host Account's stored Host token, one hour left. */
export const T: StoredHostToken = {
  accountId: HOST_ID,
  displayName: "playset-host",
  accessToken: HOST_TOKEN,
  refreshToken: HOST_REFRESH,
  expiresAt: 1795879800000,
};

export const HOST_GRANT: TokenGrant = { accessToken: HOST_TOKEN, refreshToken: HOST_REFRESH, expiresAt: 1795879800000 };
export const OTHER_GRANT: TokenGrant = { accessToken: OTHER_ACCESS, refreshToken: OTHER_REFRESH, expiresAt: 1795879800000 };

// ---------------------------------------------------------------- the core's real errors

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

const coreDeps = (answer: () => Response | Promise<Response>) => ({
  fetch: async () => answer(),
  sleep: async () => {},
  now: () => NOW_MS,
});

async function rejection(p: Promise<unknown>): Promise<unknown> {
  try {
    await p;
  } catch (err) {
    return err;
  }
  throw new Error("expected the core call to reject");
}

/** A token error from a real refresh: naming `invalid_grant`, another OAuth error, a 503, or a network failure. */
export function tokenError(kind: "invalid_grant" | "invalid_client" | "503" | "network"): Promise<unknown> {
  const answer =
    kind === "invalid_grant"
      ? () => json(400, { error: "invalid_grant", error_description: "Refresh token revoked" })
      : kind === "invalid_client"
        ? () => json(400, { error: "invalid_client", error_description: "Invalid client" })
        : kind === "503"
          ? () => new Response("", { status: 503 })
          : () => Promise.reject(new TypeError("fetch failed"));
  return rejection(refreshAccessToken(coreDeps(answer), { clientId: "3f9c2a7e5b1d4c8fa6e0b2d4c6a8e1f3", refreshToken: "AQCx-dummy" }));
}

/** The core's rate-limit error (429 three times on the token endpoint). */
export async function rateLimitError(): Promise<unknown> {
  const err = await rejection(
    refreshAccessToken(
      coreDeps(() => json(429, { error: "rate_limited" }, { "Retry-After": "1" })),
      { clientId: "3f9c2a7e5b1d4c8fa6e0b2d4c6a8e1f3", refreshToken: "AQCx-dummy" },
    ),
  );
  expect(err).toBeInstanceOf(RateLimitError);
  return err;
}

/** A SpotifyAccountError from a real /me call: of that status (429 after the retries), or without status (network). */
export function accountError(status: number | "network"): Promise<unknown> {
  const answer =
    status === "network"
      ? () => Promise.reject(new TypeError("fetch failed"))
      : () => json(status, { error: { status, message: "nope" } }, status === 429 ? { "Retry-After": "1" } : {});
  return rejection(fetchSpotifyAccount(coreDeps(answer), "BQDx-dummy"));
}

// ---------------------------------------------------------------- the fake Host login

export function makeFakeHostLogin() {
  const state = {
    grant: HOST_GRANT as TokenGrant,
    account: { id: HOST_ID, displayName: "playset-host" } as { id: string; displayName?: string },
    exchangeFails: undefined as unknown,
    accountFails: undefined as unknown,
    /** What `refresh` gives: a grant, or (as `{ fails }`) a rejection. */
    refreshWith: { grant: HOST_GRANT } as { grant: TokenGrant } | { fails: unknown },
    /** When set, every refresh waits here first. */
    refreshGate: undefined as { pass(): Promise<void> } | undefined,
    exchangeCalls: [] as Array<{ code: string; codeVerifier: string; redirectUri: string }>,
    fetchCalls: [] as string[],
    refreshCalls: [] as string[],
  };
  const hostLogin = {
    async exchangeCode(args: { code: string; codeVerifier: string; redirectUri: string }): Promise<TokenGrant> {
      state.exchangeCalls.push({ ...args });
      if (state.exchangeFails !== undefined) throw state.exchangeFails;
      return { ...state.grant };
    },
    async fetchAccount(accessToken: string): Promise<{ id: string; displayName?: string }> {
      state.fetchCalls.push(accessToken);
      if (state.accountFails !== undefined) throw state.accountFails;
      return { ...state.account };
    },
    async refresh(refreshToken: string): Promise<TokenGrant> {
      state.refreshCalls.push(refreshToken);
      if (state.refreshGate) await state.refreshGate.pass();
      const r = state.refreshWith;
      if ("fails" in r) throw r.fails;
      return { ...r.grant };
    },
  };
  return { hostLogin, state, calls: () => state.exchangeCalls.length + state.fetchCalls.length + state.refreshCalls.length };
}

// ---------------------------------------------------------------- the admin harness

export interface AdminHarnessOptions extends HarnessOptions {
  hostTokenStore?: HostTokenStoreLike;
  rateLimitHits?: { add(day: string): void; count(day: string): number };
  usageEvents?: ReturnType<typeof createMemoryUsageEvents>;
}

export function makeAdminHarness(opts: AdminHarnessOptions = {}) {
  const h = makeHarness(opts);
  const inner: HostTokenStoreLike = opts.hostTokenStore ?? createMemoryHostTokenStore();
  const storeState = { saves: 0, clears: 0, saveFails: undefined as unknown };
  const store: HostTokenStoreLike = {
    read: () => inner.read(),
    async save(token) {
      storeState.saves++;
      if (storeState.saveFails !== undefined) throw storeState.saveFails;
      await inner.save(token);
    },
    async clear() {
      storeState.clears++;
      await inner.clear();
    },
  };
  const login = makeFakeHostLogin();
  const events = opts.usageEvents ?? createMemoryUsageEvents();
  const source = createHostTokenSource({
    store,
    login: login.hostLogin,
    hostAccountId: HOST_ID,
    now: () => h.clock.ms,
    logger: h.log.logger,
  });
  const sourceState = { asked: 0 };
  const hostTokens = {
    getAccessToken(): Promise<string | undefined> {
      sourceState.asked++;
      return source.getAccessToken();
    },
  };
  const app = createApp({
    config: h.config,
    services: h.services,
    records: h.records,
    events,
    hostTokens,
    rateLimitHits: opts.rateLimitHits ?? h.hits,
    now: () => h.clock.ms,
    logger: h.log.logger,
    clientDir: sharedClientDir(),
    hostTokenStore: store,
    hostLogin: login.hostLogin,
  });

  const withProto = (r: request.Test, proto: string | undefined) => (proto === undefined ? r : r.set("X-Forwarded-Proto", proto));

  return {
    ...h,
    app,
    store,
    storeState,
    login,
    events,
    sourceState,
    // The Visitor helpers of the harness, aimed at this app.
    get: (path: string, address = A) => request(app).get(path).set("X-Forwarded-For", address),
    getStream: (path: string, address = A) =>
      request(app)
        .get(path)
        .set("X-Forwarded-For", address)
        .buffer(true)
        .parse((res, done) => {
          let text = "";
          res.setEncoding("utf8");
          res.on("data", (chunk: string) => {
            text += chunk;
          });
          res.on("end", () => done(null, text));
        }),
    post: (path: string, body: unknown, address = A) =>
      request(app).post(path).set("X-Forwarded-For", address).send(body as object),
    /** GET /admin/login, from A. */
    startLogin: async (proto?: string) => {
      const res = await withProto(request(app).get("/admin/login").set("X-Forwarded-For", A), proto);
      return loginOf(res);
    },
    /** GET /admin/callback?<query> with the given Cookie header (or none). */
    callback: (query: string, cookie?: string, proto?: string) => {
      let r = request(app).get(`/admin/callback${query}`).set("X-Forwarded-For", A);
      if (cookie !== undefined) r = r.set("Cookie", cookie);
      return withProto(r, proto);
    },
    status: (cookie?: string) => {
      const r = request(app).get("/api/admin/status").set("X-Forwarded-For", A);
      return cookie === undefined ? r : r.set("Cookie", cookie);
    },
    /** A full successful login: the admin cookie as `playset_admin=<value>`. */
    loginAsHost: async (): Promise<string> => {
      const started = await loginOf(await request(app).get("/admin/login").set("X-Forwarded-For", A));
      const res = await request(app)
        .get(`/admin/callback?code=${CODE}&state=${encodeURIComponent(started.state)}`)
        .set("X-Forwarded-For", A)
        .set("Cookie", started.cookie);
      expect(res.headers.location).toBe("/admin");
      const admin = cookieNamed(res, "playset_admin");
      expect(admin).not.toBeUndefined();
      return `playset_admin=${admin!.value}`;
    },
  };
}

export type AdminHarness = ReturnType<typeof makeAdminHarness>;

// ---------------------------------------------------------------- cookies and the login redirect

export interface SetCookie {
  name: string;
  value: string;
  /** Attribute names lower-cased → value ("" for flags). */
  attributes: Record<string, string>;
  raw: string;
}

export function setCookies(res: { headers: Record<string, unknown> }): SetCookie[] {
  const header = res.headers["set-cookie"];
  const lines = header === undefined ? [] : Array.isArray(header) ? (header as string[]) : [String(header)];
  return lines.map((raw) => {
    const [pair = "", ...attrs] = raw.split(";").map((s) => s.trim());
    const eq = pair.indexOf("=");
    const attributes: Record<string, string> = {};
    for (const a of attrs) {
      const i = a.indexOf("=");
      if (i === -1) attributes[a.toLowerCase()] = "";
      else attributes[a.slice(0, i).toLowerCase()] = a.slice(i + 1);
    }
    return { name: pair.slice(0, eq), value: pair.slice(eq + 1), attributes, raw };
  });
}

export function cookieNamed(res: { headers: Record<string, unknown> }, name: string): SetCookie | undefined {
  const all = setCookies(res).filter((c) => c.name === name);
  expect(all.length).toBeLessThanOrEqual(1);
  return all[0];
}

/** The attribute flags of a set cookie, checked exactly (Secure only when asked). */
export function expectCookieAttributes(
  cookie: SetCookie | undefined,
  want: { path: string; maxAge: string; secure: boolean },
) {
  expect(cookie, "the cookie was set").not.toBeUndefined();
  const a = cookie!.attributes;
  expect(a["path"]).toBe(want.path);
  expect(a["max-age"]).toBe(want.maxAge);
  expect("httponly" in a).toBe(true);
  expect(a["samesite"]?.toLowerCase()).toBe("lax");
  expect("secure" in a).toBe(want.secure);
}

export interface StartedLogin {
  res: request.Response;
  location: URL;
  state: string;
  challenge: string;
  loginCookie: SetCookie;
  /** `playset_login=<value>`, as the browser sends it back. */
  cookie: string;
}

export function loginOf(res: request.Response): StartedLogin {
  expect(res.status).toBe(302);
  const location = new URL(String(res.headers.location));
  const loginCookie = cookieNamed(res, "playset_login");
  expect(loginCookie, "the login cookie was set").not.toBeUndefined();
  return {
    res,
    location,
    state: location.searchParams.get("state") ?? "",
    challenge: location.searchParams.get("code_challenge") ?? "",
    loginCookie: loginCookie!,
    cookie: `playset_login=${loginCookie!.value}`,
  };
}

export const challengeOf = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");

/** The value with its last character changed. */
export function tamper(value: string): string {
  const last = value.slice(-1);
  return value.slice(0, -1) + (last === "A" ? "B" : "A");
}

/** A cookie value and every base64/base64url-decoded piece of it, so a hidden id or token is found too. */
export function cookieTexts(value: string): string[] {
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    // keep as is
  }
  const pieces = decoded.split(/[.:]/).filter((p) => p.length > 0);
  const texts = [value, decoded];
  for (const p of pieces) {
    texts.push(Buffer.from(p, "base64url").toString("utf8"));
    texts.push(Buffer.from(p, "base64").toString("utf8"));
  }
  return texts;
}

export function expectCookieHoldsNoSecret(value: string) {
  for (const text of cookieTexts(value)) for (const s of ADMIN_NEVER) expect(text).not.toContain(s);
}

// ---------------------------------------------------------------- admin error bodies

export const NOT_ADMIN_BODY = {
  error: {
    code: "NOT_ADMIN",
    message: "You're not logged in as Playset's admin.",
    hint: "Log in with Spotify as the Host Account.",
  },
};

export const INVALID_LOGOUT_BODY = { error: { code: "INVALID_INPUT", message: "That request isn't valid." } };

export function expectNotAdmin(res: request.Response) {
  expect(res.status).toBe(401);
  expect(String(res.headers["content-type"])).toMatch(/^application\/json/);
  expect(res.body).toStrictEqual(NOT_ADMIN_BODY);
}

/** Every answer of the admin routes: no id, token, code or secret in the body, Location or any header. */
export function expectNoAdminLeaks(res: request.Response, extra: string[] = []) {
  const text = `${res.text ?? ""}\n${JSON.stringify(res.body ?? null)}\n${JSON.stringify(res.headers)}`;
  for (const s of [...ADMIN_NEVER, ...extra]) expect(text).not.toContain(s);
}
