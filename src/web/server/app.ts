// The web app: the Visitor routes of the contract and the built client. Each route checks its input with
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
import type { HostTokenSource } from "./host-tokens.js";
import { utcDay, type RateLimitHitCounter } from "./limits.js";
import { createFailureLog, createRedactor, type Logger } from "./logging.js";
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

export function createApp(deps: AppDeps): express.Express {
  const { config, services, records, events, hostTokens, rateLimitHits, now, logger } = deps;

  const hostTokensSeen = new Set<string>();
  const redact = createRedactor(() => [
    config.setlistFmApiKey,
    config.spotifyClientId,
    config.cookieSecret,
    config.hostSpotifyId,
    ...hostTokensSeen,
  ]);
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
      hostTokensSeen.add(token);
      return token;
    },
    refuse(entry, retryAfter) {
      rateLimitHits.add(utcDay(now()));
      return new VisitorError(entry, { retryAfter });
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

  app.use(artistRoutes(context), setlistRoutes(context), previewRoutes(context), createRoutes(context));
  app.use("/api", () => {
    throw new VisitorError(CATALOGUE.nothingHere);
  });
  app.use(clientRoutes(deps.clientDir, logger));
  app.use(createErrorHandler(log));

  return app;
}
