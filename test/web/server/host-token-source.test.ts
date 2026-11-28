// The Host token source over a Host token store (X3): no request while the stored Host token is good,
// one refresh at a time within 60 seconds of expiry, invalid_grant ends the login, other failures keep it.
import { describe, expect, it } from "vitest";
import { createHostTokenSource, createMemoryHostTokenStore } from "../../../src/web/server/index.js";
import {
  ADMIN_NEVER,
  HOST_REFRESH,
  NOW_MS,
  T,
  makeAdminHarness,
  makeFakeHostLogin,
  rateLimitError,
  tokenError,
  type StoredHostToken,
} from "./fixtures/admin";
import { HOST_ID, HOST_TOKEN, flush, frameNames, makeGate, makeLogger, parseSse, progressNames, waitUntil } from "./fixtures/harness";
import { expectCatalogueError } from "./fixtures/catalogue";
import { MADRID_ID } from "./fixtures/setlists";

const ENDED = "The Host Account's Spotify login has ended. Log in again at /admin.";
const REFRESHED = { accessToken: "BQDhost-refreshed", refreshToken: HOST_REFRESH, expiresAt: 1795879800000 };

async function setup(stored: StoredHostToken | undefined) {
  const store = createMemoryHostTokenStore();
  if (stored) await store.save(stored);
  const login = makeFakeHostLogin();
  const log = makeLogger();
  const source = createHostTokenSource({
    store,
    login: login.hostLogin,
    hostAccountId: HOST_ID,
    now: () => NOW_MS,
    logger: log.logger,
  });
  return { store, login, log, source };
}

function expectNoSecretsLogged(log: ReturnType<typeof makeLogger>) {
  const text = log.allText();
  for (const s of ADMIN_NEVER) expect(text).not.toContain(s);
}

describe("no refresh needed (AC-9)", () => {
  it("AC-9: an empty store → undefined, no refresh", async () => {
    const { source, login, store } = await setup(undefined);
    await expect(source.getAccessToken()).resolves.toBeUndefined();
    expect(login.calls()).toBe(0);
    expect(await store.read()).toBeUndefined();
  });

  it("AC-9: a stored Host token of another account (the config changed) → undefined, no refresh, the store unchanged", async () => {
    const other = { ...T, accountId: "jane.doe.music", expiresAt: 1795870000000 };
    const { source, login, store } = await setup(other);
    await expect(source.getAccessToken()).resolves.toBeUndefined();
    expect(login.calls()).toBe(0);
    expect(await store.read()).toStrictEqual(other);
  });

  for (const [label, expiresAt] of [
    ["one hour away", 1795879800000],
    ["60.001 seconds away", 1795876260001],
  ] as const) {
    it(`AC-9: the Host Account's token with expiry ${label} → its access token, no refresh, the store unchanged`, async () => {
      const stored = { ...T, expiresAt };
      const { source, login, store, log } = await setup(stored);
      await expect(source.getAccessToken()).resolves.toBe(HOST_TOKEN);
      expect(login.calls()).toBe(0);
      expect(await store.read()).toStrictEqual(stored);
      expectNoSecretsLogged(log);
    });
  }
});

describe("refresh (AC-10)", () => {
  for (const [label, expiresAt] of [
    ["within 60 seconds (+30 s)", 1795876230000],
    ["exactly 60 seconds away", 1795876260000],
    ["already expired", 1795870000000],
  ] as const) {
    it(`AC-10: expiry ${label} → one refresh with the stored refresh token; the store holds the new token, same account and name`, async () => {
      const { source, login, store, log } = await setup({ ...T, expiresAt });
      login.state.refreshWith = { grant: REFRESHED };
      await expect(source.getAccessToken()).resolves.toBe("BQDhost-refreshed");
      expect(login.state.refreshCalls).toEqual([HOST_REFRESH]);
      expect(login.state.exchangeCalls).toEqual([]);
      expect(login.state.fetchCalls).toEqual([]);
      expect(await store.read()).toStrictEqual({
        accountId: HOST_ID,
        displayName: "playset-host",
        accessToken: "BQDhost-refreshed",
        refreshToken: HOST_REFRESH,
        expiresAt: 1795879800000,
      });
      expectNoSecretsLogged(log);
    });
  }

  it("AC-10: a rotated refresh token is stored", async () => {
    const { source, login, store } = await setup({ ...T, expiresAt: 1795870000000 });
    login.state.refreshWith = { grant: { ...REFRESHED, refreshToken: "AQChost-rotated" } };
    await expect(source.getAccessToken()).resolves.toBe("BQDhost-refreshed");
    expect(login.state.refreshCalls).toHaveLength(1);
    expect(await store.read()).toStrictEqual({ ...REFRESHED, refreshToken: "AQChost-rotated", accountId: HOST_ID, displayName: "playset-host" });
  });

  it("AC-10: a stored Host token without displayName stays without it after a refresh", async () => {
    const { displayName: _dropped, ...noName } = T;
    const { source, login, store } = await setup({ ...noName, expiresAt: 1795870000000 });
    login.state.refreshWith = { grant: REFRESHED };
    await source.getAccessToken();
    const after = await store.read();
    expect(after).toStrictEqual({ accountId: HOST_ID, ...REFRESHED });
    expect(after !== undefined && "displayName" in after).toBe(false);
  });

  it("AC-10: after a refresh the next ask uses the new token with no request", async () => {
    const { source, login } = await setup({ ...T, expiresAt: 1795870000000 });
    login.state.refreshWith = { grant: REFRESHED };
    await source.getAccessToken();
    await expect(source.getAccessToken()).resolves.toBe("BQDhost-refreshed");
    expect(login.state.refreshCalls).toHaveLength(1);
  });
});

describe("refresh failures (AC-11)", () => {
  it("AC-11: invalid_grant → the store is cleared, undefined, one warning with the exact text", async () => {
    const { source, login, store, log } = await setup({ ...T, expiresAt: 1795870000000 });
    login.state.refreshWith = { fails: await tokenError("invalid_grant") };
    await expect(source.getAccessToken()).resolves.toBeUndefined();
    expect(login.state.refreshCalls).toHaveLength(1);
    expect(await store.read()).toBeUndefined();
    const warnings = log.of("warn");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.message).toBe(ENDED);
    expect(log.of("error")).toEqual([]);
    expectNoSecretsLogged(log);
  });

  it("AC-11: after invalid_grant the next ask resolves undefined and sends nothing", async () => {
    const { source, login } = await setup({ ...T, expiresAt: 1795870000000 });
    login.state.refreshWith = { fails: await tokenError("invalid_grant") };
    await source.getAccessToken();
    await expect(source.getAccessToken()).resolves.toBeUndefined();
    expect(login.state.refreshCalls).toHaveLength(1);
  });

  for (const kind of ["503", "network", "invalid_client", "rate limit"] as const) {
    it(`AC-11: a refresh failing with ${kind} → the source rejects, the store unchanged, the next ask refreshes again`, async () => {
      const stored = { ...T, expiresAt: 1795870000000 };
      const { source, login, store, log } = await setup(stored);
      const failure = kind === "rate limit" ? await rateLimitError() : await tokenError(kind);
      login.state.refreshWith = { fails: failure };
      await expect(source.getAccessToken()).rejects.toBe(failure);
      expect(await store.read()).toStrictEqual(stored);
      expect(log.calls.filter((c) => c.message === ENDED)).toEqual([]);

      await expect(source.getAccessToken()).rejects.toBe(failure);
      expect(login.state.refreshCalls).toEqual([HOST_REFRESH, HOST_REFRESH]);

      login.state.refreshWith = { grant: REFRESHED };
      await expect(source.getAccessToken()).resolves.toBe("BQDhost-refreshed");
      expect(login.state.refreshCalls).toHaveLength(3);
      expectNoSecretsLogged(log);
    });
  }
});

describe("one refresh at a time (AC-12)", () => {
  it("AC-12: three asks while a refresh waits → one refresh; all three get BQDhost-refreshed", async () => {
    const { source, login, store } = await setup({ ...T, expiresAt: 1795870000000 });
    const gate = makeGate();
    login.state.refreshGate = gate;
    login.state.refreshWith = { grant: { ...REFRESHED, refreshToken: "AQChost-rotated" } };
    const asks = [source.getAccessToken(), source.getAccessToken(), source.getAccessToken()];
    await waitUntil(() => login.state.refreshCalls.length >= 1, "the refresh to start");
    await flush();
    expect(login.state.refreshCalls).toHaveLength(1);
    gate.release();
    expect(await Promise.all(asks)).toEqual(["BQDhost-refreshed", "BQDhost-refreshed", "BQDhost-refreshed"]);
    expect(login.state.refreshCalls).toEqual([HOST_REFRESH]);
    expect((await store.read())?.refreshToken).toBe("AQChost-rotated");
  });

  it("AC-12: three asks while a refresh ends with invalid_grant → all undefined, one warning", async () => {
    const { source, login, log } = await setup({ ...T, expiresAt: 1795870000000 });
    const gate = makeGate();
    login.state.refreshGate = gate;
    login.state.refreshWith = { fails: await tokenError("invalid_grant") };
    const asks = [source.getAccessToken(), source.getAccessToken(), source.getAccessToken()];
    await waitUntil(() => login.state.refreshCalls.length >= 1, "the refresh to start");
    await flush();
    gate.release();
    expect(await Promise.all(asks)).toEqual([undefined, undefined, undefined]);
    expect(login.state.refreshCalls).toHaveLength(1);
    expect(log.of("warn").filter((c) => c.message === ENDED)).toHaveLength(1);
  });

  it("AC-12: three asks while a refresh fails with a 503 → all three get the same rejection, one refresh", async () => {
    const { source, login } = await setup({ ...T, expiresAt: 1795870000000 });
    const gate = makeGate();
    login.state.refreshGate = gate;
    const failure = await tokenError("503");
    login.state.refreshWith = { fails: failure };
    const asks = [source.getAccessToken(), source.getAccessToken(), source.getAccessToken()].map((p) =>
      p.then(
        () => "resolved",
        (err: unknown) => err,
      ),
    );
    await waitUntil(() => login.state.refreshCalls.length >= 1, "the refresh to start");
    await flush();
    gate.release();
    expect(await Promise.all(asks)).toEqual([failure, failure, failure]);
    expect(login.state.refreshCalls).toHaveLength(1);
  });
});

describe("the source through the app (AC-9, AC-15)", () => {
  it("AC-9: with t stored, a Madrid preview streams and every Match search gets BQDhost-test-token", async () => {
    const a = makeAdminHarness();
    await a.store.save(T);
    const own = await a.getStream(`/api/setlists/${MADRID_ID}/preview`);
    expect(own.status).toBe(200);
    const names = frameNames(parseSse(own.body as string).frames);
    expect(names.slice(-1)).toEqual(["preview"]);
    expect(names.slice(0, -1)).toEqual(progressNames(5));
    expect(a.sourceState.asked).toBeGreaterThanOrEqual(1);
    expect(a.matchSearches.length).toBeGreaterThanOrEqual(5);
    expect(new Set(a.matchSearches.map((s) => s.accessToken))).toEqual(new Set([HOST_TOKEN]));
    expect(a.login.calls()).toBe(0);
  });

  it("AC-9: with the store empty a preview answers 503 E-23", async () => {
    const a = makeAdminHarness();
    const res = await a.get(`/api/setlists/${MADRID_ID}/preview`);
    expectCatalogueError(res, "E-23");
    expect(a.login.calls()).toBe(0);
  });
});

describe("a new Host login saved while a refresh runs (AC-10, AC-11)", () => {
  // The admin may finish a new login while a refresh of the old login is still waiting on Spotify.
  // The new login is what the admin page reported as connected, so it must survive either outcome.
  const NEW_LOGIN: StoredHostToken = {
    ...T,
    accessToken: "BQDhost-new-login",
    refreshToken: "AQChost-new-login",
    expiresAt: 1795883400000,
  };

  it("AC-10: the refresh succeeds after a new login was saved → the store keeps the new login; the waiting ask and the next ask get its token, no further refresh", async () => {
    const { source, login, store, log } = await setup({ ...T, expiresAt: 1795876230000 });
    const gate = makeGate();
    login.state.refreshGate = gate;
    login.state.refreshWith = { grant: REFRESHED };
    const waiting = source.getAccessToken();
    await waitUntil(() => login.state.refreshCalls.length >= 1, "the refresh to start");
    await flush();
    await store.save(NEW_LOGIN);
    gate.release();
    await expect(waiting).resolves.toBe("BQDhost-new-login");
    expect(await store.read()).toStrictEqual(NEW_LOGIN);
    await expect(source.getAccessToken()).resolves.toBe("BQDhost-new-login");
    expect(login.state.refreshCalls).toEqual([HOST_REFRESH]);
    expectNoSecretsLogged(log);
  });

  it("AC-11: the refresh ends with invalid_grant after a new login was saved → the store keeps the new login, no login-ended warning; the waiting ask and the next ask get its token", async () => {
    const { source, login, store, log } = await setup({ ...T, expiresAt: 1795870000000 });
    const gate = makeGate();
    login.state.refreshGate = gate;
    login.state.refreshWith = { fails: await tokenError("invalid_grant") };
    const waiting = source.getAccessToken();
    await waitUntil(() => login.state.refreshCalls.length >= 1, "the refresh to start");
    await flush();
    await store.save(NEW_LOGIN);
    gate.release();
    await expect(waiting).resolves.toBe("BQDhost-new-login");
    expect(await store.read()).toStrictEqual(NEW_LOGIN);
    expect(log.calls.filter((c) => c.message === ENDED)).toEqual([]);
    await expect(source.getAccessToken()).resolves.toBe("BQDhost-new-login");
    expect(login.state.refreshCalls).toEqual([HOST_REFRESH]);
    expectNoSecretsLogged(log);
  });
});
