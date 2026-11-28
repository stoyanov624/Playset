// The Host login (X4, X5, X9): /admin/login sends the admin to Spotify with a signed login cookie;
// /admin/callback checks the query, the cookie, the state and the account, then keeps the Host token
// and sets the admin cookie. Every failure is a redirect code; no id, token or secret leaves the server.
import { describe, expect, it } from "vitest";
import {
  ADMIN_NEVER,
  AUTHORIZE_ENDPOINT,
  CODE,
  HOST_GRANT,
  OTHER_ACCESS,
  OTHER_GRANT,
  OTHER_ID,
  OTHER_REFRESH,
  OTHER_SECRET,
  REDIRECT_URI,
  SCOPE,
  T,
  accountError,
  challengeOf,
  cookieNamed,
  expectCookieAttributes,
  expectCookieHoldsNoSecret,
  expectNoAdminLeaks,
  makeAdminHarness,
  rateLimitError,
  tamper,
  tokenError,
  type AdminHarness,
  type StartedLogin,
} from "./fixtures/admin";
import { A, CLIENT_ID, HOST_ID, HOST_TOKEN } from "./fixtures/harness";

const CONNECTED = "The Host Account is connected.";
const REFUSED = "A Spotify account that isn't the Host Account tried to log in.";

/** Every callback answer: 302, no-store, the login cookie cleared, no JSON body. */
function expectCallbackAnswer(res: Awaited<ReturnType<AdminHarness["callback"]>>, location: string, secure = false) {
  expect(res.status).toBe(302);
  expect(res.headers.location).toBe(location);
  expect(res.headers["cache-control"]).toBe("no-store");
  expect(String(res.headers["content-type"] ?? "")).not.toMatch(/json/);
  const cleared = cookieNamed(res, "playset_login");
  expect(cleared, "the login cookie is cleared").not.toBeUndefined();
  expect(cleared!.attributes["max-age"]).toBe("0");
  expect(cleared!.attributes["path"]).toBe("/admin");
  expect("secure" in cleared!.attributes).toBe(secure);
}

function expectNoAdminCookie(res: Awaited<ReturnType<AdminHarness["callback"]>>) {
  expect(cookieNamed(res, "playset_admin")).toBeUndefined();
}

function expectLogsClean(a: AdminHarness, extra: string[] = []) {
  const text = a.log.allText();
  for (const s of [...ADMIN_NEVER, ...extra]) expect(text).not.toContain(s);
  expect(text).not.toContain(A);
}

const good = (s: StartedLogin) => `?code=${CODE}&state=${encodeURIComponent(s.state)}`;

// ---------------------------------------------------------------- /admin/login

describe("GET /admin/login (AC-13, AC-19)", () => {
  it("AC-13: 302 no-store to Spotify's authorize URL with exactly the seven parameters", async () => {
    const a = makeAdminHarness();
    const s = await a.startLogin();
    expect(s.res.headers["cache-control"]).toBe("no-store");
    expect(`${s.location.origin}${s.location.pathname}`).toBe(AUTHORIZE_ENDPOINT);
    const params = s.location.searchParams;
    expect([...params.keys()].sort()).toEqual(
      ["client_id", "code_challenge", "code_challenge_method", "redirect_uri", "response_type", "scope", "state"].sort(),
    );
    expect(params.get("client_id")).toBe(CLIENT_ID);
    expect(params.get("response_type")).toBe("code");
    expect(params.get("redirect_uri")).toBe(REDIRECT_URI);
    expect(params.get("scope")).toBe(SCOPE);
    expect(params.get("code_challenge_method")).toBe("S256");
    expect(s.state).toMatch(/^[A-Za-z0-9\-._~]{16,}$/);
    expect(s.challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a.login.calls()).toBe(0);
    expect(a.http.requests).toEqual([]);
  });

  it("AC-13: the login cookie is signed, HttpOnly, SameSite=Lax, Path=/admin, Max-Age=600, without Secure on plain HTTP", async () => {
    const a = makeAdminHarness();
    const s = await a.startLogin();
    expectCookieAttributes(s.loginCookie, { path: "/admin", maxAge: "600", secure: false });
    expect(s.loginCookie.value.length).toBeGreaterThan(0);
    expectCookieHoldsNoSecret(s.loginCookie.value);
  });

  it("AC-13: two requests give two different states, challenges and login cookies", async () => {
    const a = makeAdminHarness();
    const first = await a.startLogin();
    const second = await a.startLogin();
    expect(second.state).not.toBe(first.state);
    expect(second.challenge).not.toBe(first.challenge);
    expect(second.loginCookie.value).not.toBe(first.loginCookie.value);
  });

  it("AC-13: the code verifier is never in the Location (it is the one whose S256 challenge was sent)", async () => {
    const a = makeAdminHarness();
    const s = await a.startLogin();
    const res = await a.callback(good(s), s.cookie);
    expect(res.headers.location).toBe("/admin");
    const verifier = a.login.state.exchangeCalls[0]!.codeVerifier;
    expect(verifier).toMatch(/^[A-Za-z0-9\-._~]{43,128}$/);
    expect(challengeOf(verifier)).toBe(s.challenge);
    expect(s.location.href).not.toContain(verifier);
    expect(String(res.headers.location)).not.toContain(verifier);
    expect(a.log.allText()).not.toContain(verifier);
  });

  it("AC-13: with PLAYSET_WEB_PORT=8080 the redirect URI uses port 8080", async () => {
    const a = makeAdminHarness({ env: { PLAYSET_WEB_PORT: "8080" } });
    const s = await a.startLogin();
    expect(s.location.searchParams.get("redirect_uri")).toBe("http://127.0.0.1:8080/admin/callback");
    await a.callback(good(s), s.cookie);
    expect(a.login.state.exchangeCalls[0]?.redirectUri).toBe("http://127.0.0.1:8080/admin/callback");
  });

  it("AC-13: an existing admin cookie is left as it is (no admin cookie set or cleared)", async () => {
    const a = makeAdminHarness();
    const admin = await a.loginAsHost();
    const { default: request } = await import("supertest");
    const res = await request(a.app).get("/admin/login").set("X-Forwarded-For", A).set("Cookie", admin);
    expect(res.status).toBe(302);
    expect(cookieNamed(res, "playset_admin")).toBeUndefined();
    expect((await a.status(admin)).status).toBe(200);
  });

  it("AC-13: the answer holds no id, token or secret", async () => {
    const a = makeAdminHarness();
    const s = await a.startLogin();
    expectNoAdminLeaks(s.res);
  });

  it("AC-19: with PLAYSET_TRUST_PROXY=1 and X-Forwarded-Proto: https the login cookie has Secure", async () => {
    const a = makeAdminHarness();
    const s = await a.startLogin("https");
    expectCookieAttributes(s.loginCookie, { path: "/admin", maxAge: "600", secure: true });
  });

  it("AC-19: with PLAYSET_TRUST_PROXY=0 the same header gives no Secure", async () => {
    const a = makeAdminHarness({ env: { PLAYSET_TRUST_PROXY: "0" } });
    const s = await a.startLogin("https");
    expectCookieAttributes(s.loginCookie, { path: "/admin", maxAge: "600", secure: false });
  });
});

// ---------------------------------------------------------------- /admin/callback: success

describe("GET /admin/callback succeeds (AC-14, AC-15, AC-19, AC-27)", () => {
  it("AC-14: exchanges the code with the login's verifier and the redirect URI, fetches the account, stores the Host token, sets the admin cookie", async () => {
    const a = makeAdminHarness();
    const s = await a.startLogin();
    const res = await a.callback(good(s), s.cookie);

    expectCallbackAnswer(res, "/admin");
    expect(a.login.state.exchangeCalls).toHaveLength(1);
    const call = a.login.state.exchangeCalls[0]!;
    expect(call.code).toBe(CODE);
    expect(call.redirectUri).toBe(REDIRECT_URI);
    expect(challengeOf(call.codeVerifier)).toBe(s.challenge);
    expect(a.login.state.fetchCalls).toEqual([HOST_TOKEN]);
    expect(a.login.state.refreshCalls).toEqual([]);
    expect(await a.store.read()).toStrictEqual(T);

    const admin = cookieNamed(res, "playset_admin");
    expectCookieAttributes(admin, { path: "/", maxAge: "43200", secure: false });
    expectCookieHoldsNoSecret(admin!.value);
    expectNoAdminLeaks(res);
  });

  it("AC-14: /me without a display name → the stored Host token has no displayName key", async () => {
    const a = makeAdminHarness();
    a.login.state.account = { id: HOST_ID };
    const s = await a.startLogin();
    const res = await a.callback(good(s), s.cookie);
    expectCallbackAnswer(res, "/admin");
    const { displayName: _dropped, ...withoutName } = T;
    const stored = await a.store.read();
    expect(stored).toStrictEqual(withoutName);
    expect(stored !== undefined && "displayName" in stored).toBe(false);
    expect(cookieNamed(res, "playset_admin")).not.toBeUndefined();
  });

  it("AC-14: an extra iss parameter is accepted", async () => {
    const a = makeAdminHarness();
    const s = await a.startLogin();
    const res = await a.callback(`${good(s)}&iss=https%3A%2F%2Faccounts.spotify.com`, s.cookie);
    expectCallbackAnswer(res, "/admin");
    expect(await a.store.read()).toStrictEqual(T);
    expect(cookieNamed(res, "playset_admin")).not.toBeUndefined();
  });

  it("AC-14: a login cookie 9:59.999 old still works", async () => {
    const a = makeAdminHarness();
    const s = await a.startLogin();
    a.clock.set("2026-11-28T14:39:59.999Z");
    const res = await a.callback(good(s), s.cookie);
    expectCallbackAnswer(res, "/admin");
    expect(await a.store.read()).toStrictEqual(T);
  });

  it("AC-15: a new Host login replaces an earlier stored Host token, and the source then gives the new access token", async () => {
    const a = makeAdminHarness();
    await a.store.save({ ...T, accessToken: "BQDhost-old", refreshToken: "AQChost-old" });
    const s = await a.startLogin();
    const res = await a.callback(good(s), s.cookie);
    expectCallbackAnswer(res, "/admin");
    expect(await a.store.read()).toStrictEqual(T);
    const preview = await a.getStream("/api/setlists/73a1b2c5/preview");
    expect(preview.status).toBe(200);
    expect(new Set(a.matchSearches.map((m) => m.accessToken))).toEqual(new Set([HOST_TOKEN]));
  });

  it("AC-19: behind a proxy with X-Forwarded-Proto: https the admin cookie and the cleared login cookie have Secure", async () => {
    const a = makeAdminHarness();
    const s = await a.startLogin("https");
    const res = await a.callback(good(s), s.cookie, "https");
    expectCallbackAnswer(res, "/admin", true);
    expectCookieAttributes(cookieNamed(res, "playset_admin"), { path: "/", maxAge: "43200", secure: true });
  });

  it("AC-19: with PLAYSET_TRUST_PROXY=0 the admin cookie has no Secure whatever the header says", async () => {
    const a = makeAdminHarness({ env: { PLAYSET_TRUST_PROXY: "0" } });
    const s = await a.startLogin("https");
    const res = await a.callback(good(s), s.cookie, "https");
    expectCallbackAnswer(res, "/admin", false);
    expectCookieAttributes(cookieNamed(res, "playset_admin"), { path: "/", maxAge: "43200", secure: false });
  });

  it("AC-27: a successful login is logged once with logger.info as 'The Host Account is connected.', nothing secret", async () => {
    const a = makeAdminHarness();
    const s = await a.startLogin();
    const res = await a.callback(good(s), s.cookie);
    const infos = a.log.of("info").filter((c) => c.message === CONNECTED);
    expect(infos).toHaveLength(1);
    expect(a.log.of("warn")).toEqual([]);
    expect(a.log.of("error")).toEqual([]);
    const verifier = a.login.state.exchangeCalls[0]!.codeVerifier;
    const admin = cookieNamed(res, "playset_admin")!.value;
    expectLogsClean(a, [verifier, s.loginCookie.value, admin]);
  });
});

// ---------------------------------------------------------------- /admin/callback: INVALID_INPUT

describe("GET /admin/callback refused before Spotify (AC-16)", () => {
  const rows: Array<[string, (a: AdminHarness, s: StartedLogin) => Promise<Awaited<ReturnType<AdminHarness["callback"]>>>]> = [
    ["no code or error (?state=S)", (a, s) => a.callback(`?state=${encodeURIComponent(s.state)}`, s.cookie)],
    ["no state", (a, s) => a.callback(`?code=${CODE}`, s.cookie)],
    [
      "both code and error",
      (a, s) => a.callback(`?code=${CODE}&error=access_denied&state=${encodeURIComponent(s.state)}`, s.cookie),
    ],
    ["neither code, error nor state", (a, s) => a.callback("", s.cookie)],
    ["an empty code", (a, s) => a.callback(`?code=&state=${encodeURIComponent(s.state)}`, s.cookie)],
    ["an empty state", (a, s) => a.callback(`?code=${CODE}&state=`, s.cookie)],
    ["no login cookie", (a, s) => a.callback(good(s))],
    ["the login cookie with its last character changed", (a, s) => a.callback(good(s), `playset_login=${tamper(s.loginCookie.value)}`)],
    ["an empty login cookie", (a, s) => a.callback(good(s), "playset_login=")],
    ["a login cookie the app never made", (a, s) => a.callback(good(s), "playset_login=hello")],
    [
      "a state different from the login cookie's",
      (a, s) => a.callback(`?code=${CODE}&state=WRONGstate0000000000`, s.cookie),
    ],
    ["error=access_denied with the right state", (a, s) => a.callback(`?error=access_denied&state=${encodeURIComponent(s.state)}`, s.cookie)],
    [
      "a login cookie issued exactly 10 minutes ago",
      (a, s) => {
        a.clock.set("2026-11-28T14:40:00.000Z");
        return a.callback(good(s), s.cookie);
      },
    ],
    [
      "a login cookie issued more than 10 minutes ago",
      (a, s) => {
        a.clock.set("2026-11-28T15:30:00.000Z");
        return a.callback(good(s), s.cookie);
      },
    ],
  ];

  for (const [label, run] of rows) {
    it(`AC-16: ${label} → /admin?login=INVALID_INPUT, no Spotify call, nothing stored, no admin cookie`, async () => {
      const a = makeAdminHarness();
      await a.store.save({ ...T, accessToken: "BQDhost-old" });
      const s = await a.startLogin();
      const res = await run(a, s);
      expectCallbackAnswer(res, "/admin?login=INVALID_INPUT");
      expectNoAdminCookie(res);
      expect(a.login.calls()).toBe(0);
      expect(await a.store.read()).toStrictEqual({ ...T, accessToken: "BQDhost-old" });
      expect(a.storeState.saves).toBe(1);
      expectNoAdminLeaks(res);
      expectLogsClean(a, [s.loginCookie.value]);
    });
  }

  it("AC-16: a login cookie from an app with another cookie secret → INVALID_INPUT", async () => {
    const other = makeAdminHarness({ env: { PLAYSET_COOKIE_SECRET: OTHER_SECRET } });
    const foreign = await other.startLogin();
    const a = makeAdminHarness();
    const res = await a.callback(good(foreign), foreign.cookie);
    expectCallbackAnswer(res, "/admin?login=INVALID_INPUT");
    expectNoAdminCookie(res);
    expect(a.login.calls()).toBe(0);
    expect(await a.store.read()).toBeUndefined();
  });

  it("AC-16: the state of one login with the cookie of another → INVALID_INPUT", async () => {
    const a = makeAdminHarness();
    const first = await a.startLogin();
    const second = await a.startLogin();
    const res = await a.callback(good(first), second.cookie);
    expectCallbackAnswer(res, "/admin?login=INVALID_INPUT");
    expect(a.login.calls()).toBe(0);
  });

  it("AC-16: a second callback with the same state but no cookie (the browser dropped it) → INVALID_INPUT", async () => {
    const a = makeAdminHarness();
    const s = await a.startLogin();
    expectCallbackAnswer(await a.callback(good(s), s.cookie), "/admin");
    const again = await a.callback(good(s));
    expectCallbackAnswer(again, "/admin?login=INVALID_INPUT");
    expectNoAdminCookie(again);
    expect(a.login.state.exchangeCalls).toHaveLength(1);
  });

  it("AC-16: the admin cookie's value sent as the login cookie → INVALID_INPUT", async () => {
    const a = makeAdminHarness();
    const admin = (await a.loginAsHost()).slice("playset_admin=".length);
    const s = await a.startLogin();
    const res = await a.callback(good(s), `playset_login=${admin}`);
    expectCallbackAnswer(res, "/admin?login=INVALID_INPUT");
    expect(a.login.state.exchangeCalls).toHaveLength(1);
  });
});

// ---------------------------------------------------------------- /admin/callback: NOT_ADMIN

describe("GET /admin/callback for another account (AC-17, AC-27)", () => {
  it("AC-17: /me gives jane.doe.music → /admin?login=NOT_ADMIN; the earlier Host token stays; nothing of Jane's is kept, answered or logged", async () => {
    const a = makeAdminHarness();
    await a.store.save(T);
    a.login.state.grant = OTHER_GRANT;
    a.login.state.account = { id: OTHER_ID, displayName: "Jane Doe" };
    const s = await a.startLogin();
    const res = await a.callback(good(s), s.cookie);

    expectCallbackAnswer(res, "/admin?login=NOT_ADMIN");
    expectNoAdminCookie(res);
    expect(a.login.state.fetchCalls).toEqual([OTHER_ACCESS]);
    expect(await a.store.read()).toStrictEqual(T);
    expect(a.storeState.saves).toBe(1);
    expect(a.storeState.clears).toBe(0);
    expectNoAdminLeaks(res, [OTHER_ID, OTHER_ACCESS, OTHER_REFRESH, "Jane Doe"]);
    const warnings = a.log.of("warn");
    expect(warnings.filter((c) => c.message === REFUSED)).toHaveLength(1);
    expect(a.log.of("info").filter((c) => c.message === "The Host Account is connected.")).toEqual([]);
    expectLogsClean(a, [OTHER_ID, OTHER_ACCESS, OTHER_REFRESH, s.loginCookie.value]);
  });

  it("AC-17: fetchAccount rejecting with a SpotifyAccountError 403 → NOT_ADMIN, store unchanged, one refusal warning", async () => {
    const a = makeAdminHarness();
    a.login.state.accountFails = await accountError(403);
    const s = await a.startLogin();
    const res = await a.callback(good(s), s.cookie);
    expectCallbackAnswer(res, "/admin?login=NOT_ADMIN");
    expectNoAdminCookie(res);
    expect(await a.store.read()).toBeUndefined();
    expect(a.storeState.saves).toBe(0);
    expect(a.log.of("warn").filter((c) => c.message === REFUSED)).toHaveLength(1);
    expectLogsClean(a);
  });

  it("AC-17: after a refused account the admin status still needs a cookie (no admin cookie was given)", async () => {
    const a = makeAdminHarness();
    a.login.state.account = { id: OTHER_ID };
    const s = await a.startLogin();
    const res = await a.callback(good(s), s.cookie);
    expect(res.headers.location).toBe("/admin?login=NOT_ADMIN");
    expect((await a.status()).status).toBe(401);
  });
});

// ---------------------------------------------------------------- /admin/callback: upstream and internal

describe("GET /admin/callback when Spotify or the store fails (AC-18, AC-27)", () => {
  const upstream: Array<[string, (a: AdminHarness) => Promise<void>]> = [
    ["exchangeCode rejects with a network token error", async (a) => void (a.login.state.exchangeFails = await tokenError("network"))],
    ["exchangeCode rejects with a 503 token error", async (a) => void (a.login.state.exchangeFails = await tokenError("503"))],
    ["exchangeCode rejects with the core's rate-limit error", async (a) => void (a.login.state.exchangeFails = await rateLimitError())],
    ["fetchAccount rejects with status 503", async (a) => void (a.login.state.accountFails = await accountError(503))],
    ["fetchAccount rejects with status 500", async (a) => void (a.login.state.accountFails = await accountError(500))],
    ["fetchAccount rejects with status 429", async (a) => void (a.login.state.accountFails = await accountError(429))],
    ["fetchAccount rejects without status (network)", async (a) => void (a.login.state.accountFails = await accountError("network"))],
  ];

  for (const [label, arrange] of upstream) {
    it(`AC-18: ${label} → /admin?login=UPSTREAM_UNAVAILABLE, nothing stored, one warning with its cause`, async () => {
      const a = makeAdminHarness();
      await arrange(a);
      const s = await a.startLogin();
      const res = await a.callback(good(s), s.cookie);
      expectCallbackAnswer(res, "/admin?login=UPSTREAM_UNAVAILABLE");
      expectNoAdminCookie(res);
      expect(await a.store.read()).toBeUndefined();
      expect(a.log.of("warn")).toHaveLength(1);
      expect(a.log.of("error")).toEqual([]);
      expect(a.log.of("info").filter((c) => c.message === CONNECTED)).toEqual([]);
      expectNoAdminLeaks(res);
      expectLogsClean(a, [a.login.state.exchangeCalls[0]!.codeVerifier, s.loginCookie.value]);
    });
  }

  const internal: Array<[string, (a: AdminHarness) => Promise<void>]> = [
    ["exchangeCode rejects with a token error naming invalid_grant (a code used twice)", async (a) => void (a.login.state.exchangeFails = await tokenError("invalid_grant"))],
    ["exchangeCode rejects with a token error naming invalid_client", async (a) => void (a.login.state.exchangeFails = await tokenError("invalid_client"))],
    ["fetchAccount rejects with status 401", async (a) => void (a.login.state.accountFails = await accountError(401))],
    ["the store's save rejects", async (a) => void (a.storeState.saveFails = new Error("SQLITE_FULL: database or disk is full"))],
  ];

  for (const [label, arrange] of internal) {
    it(`AC-18: ${label} → /admin?login=INTERNAL, nothing stored, one error log with its cause`, async () => {
      const a = makeAdminHarness();
      await arrange(a);
      const s = await a.startLogin();
      const res = await a.callback(good(s), s.cookie);
      expectCallbackAnswer(res, "/admin?login=INTERNAL");
      expectNoAdminCookie(res);
      expect(await a.store.read()).toBeUndefined();
      expect(a.log.of("error")).toHaveLength(1);
      expect(a.log.of("warn")).toEqual([]);
      expect(a.log.of("info").filter((c) => c.message === CONNECTED)).toEqual([]);
      expectNoAdminLeaks(res);
      expectLogsClean(a, [a.login.state.exchangeCalls[0]!.codeVerifier, s.loginCookie.value]);
    });
  }

  it("AC-18: the store failure is logged with its cause", async () => {
    const a = makeAdminHarness();
    a.storeState.saveFails = new Error("SQLITE_FULL: database or disk is full");
    const s = await a.startLogin();
    await a.callback(good(s), s.cookie);
    expect(a.log.textOf(a.log.of("error")[0]!)).toContain("SQLITE_FULL: database or disk is full");
  });

  it("AC-27: an exchange error naming the code is logged as an error with the code redacted", async () => {
    const a = makeAdminHarness();
    a.login.state.exchangeFails = new Error(`token endpoint said no for ${CODE}`);
    const s = await a.startLogin();
    const res = await a.callback(good(s), s.cookie);
    expectCallbackAnswer(res, "/admin?login=INTERNAL");
    const errors = a.log.of("error");
    expect(errors).toHaveLength(1);
    expect(a.log.textOf(errors[0]!)).toContain("token endpoint said no for [redacted]");
    expectLogsClean(a);
  });

  it("AC-27: errors carrying the tokens, verifier and cookie values are logged with every one redacted", async () => {
    const a = makeAdminHarness();
    const s = await a.startLogin();
    // fetchAccount fails with a message holding the new access token and the Host Account id.
    a.login.state.accountFails = new Error(`me failed for ${HOST_TOKEN} (${HOST_ID}) refresh ${HOST_GRANT.refreshToken} cookie ${s.loginCookie.value}`);
    const res = await a.callback(good(s), s.cookie);
    expectCallbackAnswer(res, "/admin?login=INTERNAL");
    const text = a.log.textOf(a.log.of("error")[0]!);
    expect(text).toContain("me failed for [redacted] ([redacted]) refresh [redacted] cookie [redacted]");
    expectLogsClean(a, [s.loginCookie.value, a.login.state.exchangeCalls[0]!.codeVerifier]);
  });
});
