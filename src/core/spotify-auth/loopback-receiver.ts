import { createServer, type ServerResponse } from "node:http";
import { PortInUseError } from "./errors.js";
import type { AuthorizationResult, CallbackReceiver } from "./login.js";

const LOOPBACK_HOST = "127.0.0.1";

const SUCCESS_PAGE = page("Spotify login worked", "Playset is now logged in to Spotify. You can close this tab.");
const DECLINED_PAGE = page("Spotify login declined", "The Spotify login was declined. You can close this tab.");
const FAILED_PAGE = page("Spotify login failed", "The Spotify login did not complete. You can close this tab.");

/**
 * Bundled callback receiver: an HTTP server on 127.0.0.1 at the redirect URI's port.
 * Answers the first request to the redirect path, hands its query to the login, then stops listening.
 */
export async function startLoopbackReceiver(redirectUri: string): Promise<CallbackReceiver> {
  const { port: rawPort, pathname: callbackPath } = new URL(redirectUri);
  const port = Number(rawPort);

  let deliver!: (result: AuthorizationResult) => void;
  const callback = new Promise<AuthorizationResult>((resolve) => (deliver = resolve));
  let received = false;

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://${LOOPBACK_HOST}:${port}`);
    if (req.method !== "GET" || url.pathname !== callbackPath || received) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
      return;
    }
    received = true;
    const result = toAuthorizationResult(url.searchParams);
    res.on("finish", () => void stop());
    sendHtml(res, result.error === "access_denied" ? DECLINED_PAGE : result.error ? FAILED_PAGE : SUCCESS_PAGE);
    deliver(result);
  });

  let stopped: Promise<void> | undefined;
  const stop = (): Promise<void> => {
    stopped ??= new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections();
    });
    return stopped;
  };

  await new Promise<void>((resolve, reject) => {
    server.once("error", (err: NodeJS.ErrnoException) =>
      reject(err.code === "EADDRINUSE" ? new PortInUseError(port) : err),
    );
    server.listen(port, LOOPBACK_HOST, () => resolve());
  });

  return { waitForCallback: () => callback, close: stop };
}

function toAuthorizationResult(query: URLSearchParams): AuthorizationResult {
  const result: AuthorizationResult = {};
  const code = query.get("code");
  const state = query.get("state");
  const error = query.get("error");
  if (code !== null) result.code = code;
  if (state !== null) result.state = state;
  if (error !== null) result.error = error;
  return result;
}

function sendHtml(res: ServerResponse, html: string): void {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", Connection: "close" }).end(html);
}

function page(title: string, message: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body><h1>${title}</h1><p>${message}</p></body></html>`;
}
