import { request } from "node:http";
import { connect, createServer, type Server } from "node:net";
import { networkInterfaces } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { PortInUseError, startLoopbackReceiver, type CallbackReceiver } from "../../src/core/spotify-auth";
import { AUTH_CODE, STATE, captureError, errorText } from "./helpers";

// Loopback only: these tests talk to 127.0.0.1 on an ephemeral port, never to Spotify.

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

function redirectUriFor(port: number): string {
  return `http://127.0.0.1:${port}/callback`;
}

function httpGet(url: string): Promise<{ status: number; contentType: string; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request(url, { method: "GET", agent: false, headers: { Connection: "close" } }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk: string) => (body += chunk));
      res.on("end", () =>
        resolve({ status: res.statusCode ?? 0, contentType: String(res.headers["content-type"] ?? ""), body }),
      );
    });
    req.on("error", reject);
    req.end();
  });
}

/** Resolves true if a TCP connection to host:port is accepted. */
function canConnect(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host, port });
    const done = (ok: boolean) => {
      socket.destroy();
      resolve(ok);
    };
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
    socket.setTimeout(1000, () => done(false));
  });
}

async function eventuallyClosed(port: number): Promise<boolean> {
  for (let i = 0; i < 40; i++) {
    if (!(await canConnect("127.0.0.1", port))) return true;
    await new Promise((r) => setTimeout(r, 25));
  }
  return false;
}

let receivers: CallbackReceiver[] = [];
let blockers: Server[] = [];

afterEach(async () => {
  for (const r of receivers) await r.close().catch(() => {});
  for (const b of blockers) await new Promise<void>((res) => b.close(() => res()));
  receivers = [];
  blockers = [];
});

async function start(port: number): Promise<CallbackReceiver> {
  const receiver = await startLoopbackReceiver(redirectUriFor(port));
  receivers.push(receiver);
  return receiver;
}

describe("loopback callback receiver", () => {
  it("AC-29: listens on 127.0.0.1 at the redirect URI's port", async () => {
    const port = await freePort();
    await start(port);
    expect(await canConnect("127.0.0.1", port)).toBe(true);
  });

  it("AC-29: does not listen on IPv6 loopback or on external interfaces", async () => {
    const port = await freePort();
    await start(port);
    expect(await canConnect("::1", port)).toBe(false);
    const external = Object.values(networkInterfaces())
      .flat()
      .find((i) => i && i.family === "IPv4" && !i.internal);
    if (external) {
      expect(await canConnect(external.address, port)).toBe(false);
    }
  });

  it("AC-29: raises a port-in-use error with a PLAYSET_AUTH_PORT hint when the port is taken", async () => {
    const port = await freePort();
    const blocker = createServer();
    await new Promise<void>((res) => blocker.listen(port, "127.0.0.1", () => res()));
    blockers.push(blocker);

    const err = await captureError(startLoopbackReceiver(redirectUriFor(port)));

    expect(err).toBeInstanceOf(PortInUseError);
    expect((err as PortInUseError).hint).toContain("PLAYSET_AUTH_PORT");
    expect(errorText(err)).toContain(String(port));
  });

  it("AC-30: answers a code callback with 200 HTML saying the tab can be closed, hands back code and state, and stops listening", async () => {
    const port = await freePort();
    const receiver = await start(port);
    const result = receiver.waitForCallback();

    const res = await httpGet(
      `http://127.0.0.1:${port}/callback?code=${encodeURIComponent(AUTH_CODE)}&state=${encodeURIComponent(STATE)}`,
    );

    expect(res.status).toBe(200);
    expect(res.contentType).toMatch(/text\/html/);
    expect(res.body).toMatch(/You can close this tab/i);
    expect(res.body).not.toContain(AUTH_CODE);
    await expect(result).resolves.toEqual({ code: AUTH_CODE, state: STATE });
    expect(await eventuallyClosed(port)).toBe(true);
  });

  it("AC-31: answers an access_denied callback with HTML saying the login was declined, hands back the error, and stops listening", async () => {
    const port = await freePort();
    const receiver = await start(port);
    const result = receiver.waitForCallback();

    const res = await httpGet(`http://127.0.0.1:${port}/callback?error=access_denied&state=${STATE}`);

    expect(res.status).toBe(200);
    expect(res.contentType).toMatch(/text\/html/);
    expect(res.body).toMatch(/declined/i);
    await expect(result).resolves.toEqual({ error: "access_denied", state: STATE });
    expect(await eventuallyClosed(port)).toBe(true);
  });

  it("AC-32: answers 404 for any other path and keeps listening without ending the login", async () => {
    const port = await freePort();
    const receiver = await start(port);
    const result = receiver.waitForCallback();
    let settled = false;
    void result.then(
      () => (settled = true),
      () => (settled = true),
    );

    const favicon = await httpGet(`http://127.0.0.1:${port}/favicon.ico`);
    expect(favicon.status).toBe(404);
    const other = await httpGet(`http://127.0.0.1:${port}/something-else?code=x&state=y`);
    expect(other.status).toBe(404);

    await new Promise((r) => setTimeout(r, 50));
    expect(settled).toBe(false);
    expect(await canConnect("127.0.0.1", port)).toBe(true);

    const ok = await httpGet(`http://127.0.0.1:${port}/callback?code=${encodeURIComponent(AUTH_CODE)}&state=${STATE}`);
    expect(ok.status).toBe(200);
    await expect(result).resolves.toEqual({ code: AUTH_CODE, state: STATE });
  });
});
