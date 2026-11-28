// The Host Account's admin: the Spotify login as the Host Account (`/admin/login` → Spotify →
// `/admin/callback`), the admin status and logout. Only the Host Account can log in; any other account
// is turned away with nothing of it kept, answered or logged.
import { Router, type Request, type Response } from "express";
import { timingSafeEqual } from "node:crypto";
import {
  HttpError,
  RateLimitError,
  SpotifyAccountError,
  TokenError,
  buildAuthorizeUrl,
  computeCodeChallenge,
  generateCodeVerifier,
  generateState,
  type TokenGrant,
} from "../../../core/index.js";
import {
  CONFIG_ITEMS,
  ROUTES,
  adminCallbackQuerySchema,
  adminLogoutBodySchema,
  adminStatusResponseSchema,
  type AdminStatusResponse,
  type ErrorCode,
} from "../../shared/index.js";
import { ADMIN_COOKIE, LOGIN_COOKIE, type AdminCookies } from "../admin-cookies.js";
import { CATALOGUE, VisitorError } from "../catalogue.js";
import { LISTEN_HOST, type WebConfig } from "../config.js";
import type { HostLogin, HostTokenStore } from "../host-tokens.js";
import { utcDay, type RateLimitHitCounter } from "../limits.js";
import { createFailureLog, type Logger } from "../logging.js";
import type { UsageEvents } from "../usage-events.js";
import { parsed, readJsonBody, sendJson } from "./context.js";

const LOGIN_SUCCEEDED = "The Host Account is connected.";
const LOGIN_REFUSED = "A Spotify account that isn't the Host Account tried to log in.";

export interface AdminContext {
  config: WebConfig;
  cookies: AdminCookies;
  hostTokenStore: HostTokenStore;
  hostLogin: HostLogin;
  events: UsageEvents;
  rateLimitHits: RateLimitHitCounter;
  now: () => number;
  logger: Logger;
  /** Redacts the app's own secrets and `extra` (this login's code, verifier, tokens and cookie values). */
  redactorFor(extra: () => string[]): (text: string) => string;
}

/** A Host login stopped: the admin page is sent this code. */
class LoginStopped extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly level?: "warn" | "error",
    options: { cause?: unknown } = {},
  ) {
    super(`The Host login ended with ${code}.`, options);
    this.name = "LoginStopped";
  }
}

/** Spotify couldn't answer right now (down, unreachable or busy), as opposed to refusing the login. */
const spotifyUnavailable = (status: number | undefined): boolean =>
  status === undefined || status === 429 || status >= 500;

function exchangeFailure(error: unknown): LoginStopped {
  const cause = error instanceof TokenError ? error.cause : undefined;
  const unreachable =
    error instanceof RateLimitError ||
    (cause instanceof HttpError && (cause.kind === "network" || spotifyUnavailable(cause.status)));
  return unreachable
    ? new LoginStopped("UPSTREAM_UNAVAILABLE", "warn", { cause: error })
    : new LoginStopped("INTERNAL", "error", { cause: error });
}

function accountFailure(error: unknown): LoginStopped {
  if (!(error instanceof SpotifyAccountError)) return new LoginStopped("INTERNAL", "error", { cause: error });
  // 403: the account isn't on the Spotify app's user list, so it can't be the Host Account.
  if (error.status === 403) return new LoginStopped("NOT_ADMIN");
  if (spotifyUnavailable(error.status)) return new LoginStopped("UPSTREAM_UNAVAILABLE", "warn", { cause: error });
  return new LoginStopped("INTERNAL", "error", { cause: error });
}

/** Compared in constant time, so the answer's timing says nothing about the expected state. */
function sameText(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Whether a body was sent at all (an empty one counts as none). */
const hasBody = (req: Request): boolean =>
  req.headers["transfer-encoding"] !== undefined || Number(req.headers["content-length"] ?? 0) > 0;

export function adminRoutes(context: AdminContext): Router {
  const { config, cookies, hostTokenStore, hostLogin, events, rateLimitHits, now, logger } = context;
  // Spotify sends the admin back to the address the server listens on.
  const redirectUri = `http://${LISTEN_HOST}:${config.port}${ROUTES.adminCallback}`;
  const router = Router();

  const redirect = (res: Response, location: string) => {
    res.set("Cache-Control", "no-store").status(302).location(location).end();
  };

  router.get(ROUTES.adminLogin, (req, res) => {
    const state = generateState();
    const codeVerifier = generateCodeVerifier();
    cookies.setLogin(req, res, { state, codeVerifier });
    const authorizeUrl = buildAuthorizeUrl({
      clientId: config.spotifyClientId,
      redirectUri,
      state,
      codeChallenge: computeCodeChallenge(codeVerifier),
    });
    redirect(res, authorizeUrl);
  });

  router.get(ROUTES.adminCallback, async (req, res) => {
    // Everything this login handles that must never reach the log.
    const secrets: string[] = [...cookies.valuesOf(req)];
    const log = createFailureLog(logger, context.redactorFor(() => secrets));
    const login = cookies.readLogin(req);
    cookies.clear(req, res, LOGIN_COOKIE);
    try {
      const query = adminCallbackQuerySchema.safeParse(req.query);
      if (!query.success || login === undefined) throw new LoginStopped("INVALID_INPUT");
      const { code, state } = query.data;
      secrets.push(login.codeVerifier, login.state, ...(code === undefined ? [] : [code]));
      // A declined consent (an error instead of a code) is the admin's own doing, as is a stale login.
      if (!sameText(state, login.state) || code === undefined) throw new LoginStopped("INVALID_INPUT");

      const grant: TokenGrant = await hostLogin
        .exchangeCode({ code, codeVerifier: login.codeVerifier, redirectUri })
        .catch((error: unknown) => {
          throw exchangeFailure(error);
        });
      secrets.push(grant.accessToken, grant.refreshToken);
      const account = await hostLogin.fetchAccount(grant.accessToken).catch((error: unknown) => {
        throw accountFailure(error);
      });
      secrets.push(account.id);
      if (account.id !== config.hostSpotifyId) throw new LoginStopped("NOT_ADMIN");

      await hostTokenStore
        .save({
          accountId: account.id,
          ...(account.displayName === undefined ? {} : { displayName: account.displayName }),
          accessToken: grant.accessToken,
          refreshToken: grant.refreshToken,
          expiresAt: grant.expiresAt,
        })
        .catch((error: unknown) => {
          throw new LoginStopped("INTERNAL", "error", { cause: error });
        });
    } catch (error) {
      if (!(error instanceof LoginStopped)) throw error;
      if (error.code === "NOT_ADMIN") logger.warn(LOGIN_REFUSED);
      else if (error.level !== undefined) log.hostLoginFailed(error.code, error.level, error.cause);
      redirect(res, `/admin?login=${error.code}`);
      return;
    }
    cookies.setAdmin(req, res);
    logger.info(LOGIN_SUCCEEDED);
    redirect(res, "/admin");
  });

  router.get(ROUTES.adminStatus, async (req, res) => {
    if (!cookies.isAdmin(req)) throw new VisitorError(CATALOGUE.notAdmin);
    const today = utcDay(now());
    const stored = await hostTokenStore.read();
    const hostAccount: AdminStatusResponse["hostAccount"] =
      stored?.accountId === config.hostSpotifyId
        ? { connected: true, ...(stored.displayName === undefined ? {} : { displayName: stored.displayName }) }
        : { connected: false };
    // Startup refuses a config without these, so while the server runs each one is present.
    const status: AdminStatusResponse = {
      hostAccount,
      config: CONFIG_ITEMS.map((name) => ({ name, present: true })),
      usage: await events.readUsage(today),
      rateLimitHitsToday: rateLimitHits.count(today),
    };
    sendJson(res, adminStatusResponseSchema, "admin status", status);
  });

  router.post(ROUTES.adminLogout, async (req, res) => {
    if (hasBody(req) && !req.is("application/json")) throw new VisitorError(CATALOGUE.logoutBodyInvalid);
    await readJsonBody(req, res, CATALOGUE.logoutBodyInvalid);
    parsed(adminLogoutBodySchema, req.body, CATALOGUE.logoutBodyInvalid);
    cookies.clear(req, res, ADMIN_COOKIE);
    res.status(204).end();
  });

  return router;
}
