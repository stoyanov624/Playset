// The web app: the Visitor routes of the contract, the admin's Host login and status, and the built client. Each route checks its input with
// the contract, calls the core's steps and answers in the contract's shapes; the server adds only what
// HTTP needs (limits, shared runs, one create per Setlist at a time, usage events, error wording).
// Every in-memory state belongs to the app built here, so two apps share nothing.
import express from "express";
import helmet from "helmet";
import type { SetlistPlaylistRecords } from "../../core/index.js";
import { CATALOGUE, VisitorError } from "./catalogue.js";
import { clientRoutes } from "./client.js";
import type { WebConfig } from "./config.js";
import { createErrorHandler } from "./error-handler.js";
import { createAdminCookies } from "./admin-cookies.js";
import type { HostLogin, HostTokenSource, HostTokenStore } from "./host-tokens.js";
import { utcDay, type RateLimitHitCounter } from "./limits.js";
import { createFailureLog, createRedactor, type Logger } from "./logging.js";
import { adminRoutes } from "./routes/admin.js";
import { artistRoutes } from "./routes/artists.js";
import type { RouteContext, WebServices } from "./routes/context.js";
import { createRoutes } from "./routes/create.js";
import { previewRoutes } from "./routes/preview.js";
import { setlistRoutes } from "./routes/setlists.js";
import type { UsageEvents } from "./usage-events.js";

export type { WebServices } from "./routes/context.js";

export interface AppDeps {
  config: WebConfig;
  services: WebServices;
  records: SetlistPlaylistRecords;
  events: UsageEvents;
  hostTokens: HostTokenSource;
  rateLimitHits: RateLimitHitCounter;
  /** Milliseconds since the epoch. */
  now: () => number;
  logger: Logger;
  /** The built client: index.html and assets/. */
  clientDir: string;
  /** Where the Host Account's login is kept (the Host token source reads the same store). */
  hostTokenStore: HostTokenStore;
  /** Spotify's code exchange, `/me` and refresh, for the admin's Host login. */
  hostLogin: HostLogin;
}

const CONTENT_SECURITY_POLICY = {
  useDefaults: false,
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'"],
    imgSrc: ["'self'", "data:"],
    fontSrc: ["'self'"],
    connectSrc: ["'self'"],
    objectSrc: ["'none'"],
    baseUri: ["'self'"],
    formAction: ["'self'"],
    frameAncestors: ["'none'"],
  },
};

/**
 * The Host tokens redacted by value: the current one and a few before it, for runs still using them. Not
 * every hourly token is kept, so a long-running server doesn't pile them up; older ones are
 * Spotify-shaped ("BQ…") and the redactor catches them by their shape.
 */
const HOST_TOKENS_KEPT = 4;

export function createApp(deps: AppDeps): express.Express {
  const { config, services, records, events, hostTokens, rateLimitHits, now, logger } = deps;

  const hostTokensSeen = new Set<string>();
  const appSecrets = () => [
    config.setlistFmApiKey,
    config.spotifyClientId,
    config.cookieSecret,
    config.hostSpotifyId,
    ...hostTokensSeen,
  ];
  const redact = createRedactor(appSecrets);
  const log = createFailureLog(logger, redact);

  const context: RouteContext = {
    config,
    services,
    records,
    events,
    now,
    log,
    async hostToken() {
      let token: string | undefined;
      try {
        token = await hostTokens.getAccessToken();
      } catch (error) {
        throw new VisitorError(CATALOGUE.playlistsUnavailable, { cause: error });
      }
      if (token === undefined) throw new VisitorError(CATALOGUE.playlistsUnavailable);
      hostTokensSeen.delete(token);
      hostTokensSeen.add(token);
      for (const oldest of hostTokensSeen) {
        if (hostTokensSeen.size <= HOST_TOKENS_KEPT) break;
        hostTokensSeen.delete(oldest);
      }
      return token;
    },
    refuse(entry, retryAfter) {
      rateLimitHits.add(utcDay(now()));
      return new VisitorError(entry, { retryAfter });
    },
    async recordUsage(kind, setlistId, artist) {
      try {
        await events.recordEvent({ kind, setlistId, artist, day: utcDay(now()) });
      } catch (error) {
        log.eventNotRecorded(error);
      }
    },
  };

  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", config.trustProxy ? 1 : false);
  app.use(helmet({ contentSecurityPolicy: CONTENT_SECURITY_POLICY, strictTransportSecurity: false }));
  app.use("/api", (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });

  // No /api route answers OPTIONS, so the routers' automatic answer (an Allow list) must not reach a Visitor.
  // (A path-less check: a route pattern would decode the path, and a broken encoding has its own answer.)
  app.use("/api", (req, _res, next) => {
    next(req.method === "OPTIONS" ? new VisitorError(CATALOGUE.nothingHere) : undefined);
  });
  app.use(
    adminRoutes({
      config,
      cookies: createAdminCookies(config.cookieSecret, now),
      hostTokenStore: deps.hostTokenStore,
      hostLogin: deps.hostLogin,
      events,
      rateLimitHits,
      now,
      logger,
      redactorFor: (extra) => createRedactor(() => [...extra(), ...appSecrets()]),
    }),
  );
  app.use(artistRoutes(context), setlistRoutes(context), previewRoutes(context), createRoutes(context));
  app.use("/api", () => {
    throw new VisitorError(CATALOGUE.nothingHere);
  });
  app.use(clientRoutes(deps.clientDir, logger));
  app.use(createErrorHandler(log));

  return app;
}
