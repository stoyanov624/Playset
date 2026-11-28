// The admin's two signed cookies: the login cookie carries one Host login's state and code verifier for
// ten minutes; the admin cookie says "logged in as the Host Account" for twelve hours. Both are
// self-contained (no server-side session) and hold no id or token. Their age is checked against the
// app's clock, not only the browser's Max-Age.
import { createHmac, timingSafeEqual } from "node:crypto";
import type { CookieOptions, Request, Response } from "express";

export const LOGIN_COOKIE = "playset_login";
export const ADMIN_COOKIE = "playset_admin";
const LOGIN_COOKIE_MS = 10 * 60 * 1000;
const ADMIN_COOKIE_MS = 12 * 60 * 60 * 1000;

const PATHS = { [LOGIN_COOKIE]: "/admin", [ADMIN_COOKIE]: "/" } as const;
const LIFETIMES = { [LOGIN_COOKIE]: LOGIN_COOKIE_MS, [ADMIN_COOKIE]: ADMIN_COOKIE_MS } as const;

type CookieName = typeof LOGIN_COOKIE | typeof ADMIN_COOKIE;

export interface LoginCookie {
  state: string;
  codeVerifier: string;
}

export interface AdminCookies {
  setLogin(req: Request, res: Response, login: LoginCookie): void;
  /** The login the cookie carries, when it is signed by this app and younger than ten minutes. */
  readLogin(req: Request): LoginCookie | undefined;
  setAdmin(req: Request, res: Response): void;
  isAdmin(req: Request): boolean;
  clear(req: Request, res: Response, name: CookieName): void;
  /** The raw cookie values of the request, for the log redactor. */
  valuesOf(req: Request): string[];
}

/** The request's cookies by name; a value that isn't valid percent-encoding is kept as sent. */
function cookiesOf(req: Request): Map<string, string> {
  const cookies = new Map<string, string>();
  for (const pair of (req.headers.cookie ?? "").split(";")) {
    const eq = pair.indexOf("=");
    if (eq === -1) continue;
    const name = pair.slice(0, eq).trim();
    const raw = pair.slice(eq + 1).trim();
    let value = raw;
    try {
      value = decodeURIComponent(raw);
    } catch {
      // kept as sent
    }
    if (!cookies.has(name)) cookies.set(name, value);
  }
  return cookies;
}

export function createAdminCookies(secret: string, now: () => number): AdminCookies {
  const signatureOf = (name: CookieName, payload: string) =>
    createHmac("sha256", secret).update(`${name}.${payload}`).digest("base64url");

  /** `<payload>.<signature>`; the cookie's name is signed too, so one cookie can't pass as the other. */
  const sign = (name: CookieName, content: object) => {
    const payload = Buffer.from(JSON.stringify({ ...content, issuedAt: now() })).toString("base64url");
    return `${payload}.${signatureOf(name, payload)}`;
  };

  /** The signed content of a cookie still inside its lifetime, else undefined. */
  function verified(req: Request, name: CookieName): Record<string, unknown> | undefined {
    const value = cookiesOf(req).get(name);
    if (value === undefined) return undefined;
    const dot = value.indexOf(".");
    if (dot === -1) return undefined;
    const payload = value.slice(0, dot);
    // Signatures are compared as text: decoding first would let a changed last character through.
    const given = Buffer.from(value.slice(dot + 1));
    const expected = Buffer.from(signatureOf(name, payload));
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return undefined;
    let content: unknown;
    try {
      content = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    } catch {
      return undefined;
    }
    if (typeof content !== "object" || content === null) return undefined;
    const { issuedAt } = content as { issuedAt?: unknown };
    if (typeof issuedAt !== "number" || now() - issuedAt >= LIFETIMES[name]) return undefined;
    return content as Record<string, unknown>;
  }

  const options = (req: Request, name: CookieName, maxAge: number): CookieOptions => ({
    httpOnly: true,
    sameSite: "lax",
    path: PATHS[name],
    maxAge,
    secure: req.secure,
  });

  return {
    setLogin(req, res, login) {
      res.cookie(LOGIN_COOKIE, sign(LOGIN_COOKIE, login), options(req, LOGIN_COOKIE, LOGIN_COOKIE_MS));
    },
    readLogin(req) {
      const content = verified(req, LOGIN_COOKIE);
      const { state, codeVerifier } = content ?? {};
      return typeof state === "string" && typeof codeVerifier === "string" ? { state, codeVerifier } : undefined;
    },
    setAdmin(req, res) {
      res.cookie(ADMIN_COOKIE, sign(ADMIN_COOKIE, {}), options(req, ADMIN_COOKIE, ADMIN_COOKIE_MS));
    },
    isAdmin: (req) => verified(req, ADMIN_COOKIE) !== undefined,
    clear(req, res, name) {
      // Max-Age=0 (not clearCookie's past Expires alone), so every browser drops it at once.
      res.cookie(name, "", options(req, name, 0));
    },
    valuesOf: (req) => [...cookiesOf(req).values()],
  };
}
