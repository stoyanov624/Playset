// The web app: the Visitor routes of the contract and the built client. Each route checks its input with
// the contract, calls the core's steps and answers in the contract's shapes; the server adds only what
// HTTP needs (limits, shared runs, one create per Setlist at a time, usage events, error wording).
// Every in-memory state belongs to the app built here, so two apps share nothing.
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import express, { type ErrorRequestHandler, type Request, type RequestHandler, type Response } from "express";
import helmet from "helmet";
import {
  ArtistNotFoundError,
  MissingSetlistVersionError,
  createOrUpdateSetlistPlaylist,
  findArtists,
  findSetlistPlaylist,
  getSetlist,
  listSetlists,
  prepareSetlist,
  previewMatches,
  readSetlistId,
  type ArtistCandidates,
  type CreateOrUpdateResult,
  type HostPlaylistServices,
  type PrepareSetlistOptions,
  type RunServices,
  type SetlistBrowsingServices,
  type SetlistPlaylistRecords,
} from "../../core/index.js";
import {
  PREVIEW_EVENTS,
  ROUTES,
  artistSetlistsParamsSchema,
  artistSetlistsQuerySchema,
  artistSetlistsResponseSchema,
  artistsQuerySchema,
  artistsResponseSchema,
  createPlaylistBodySchema,
  createPlaylistResponseSchema,
  previewProgressSchema,
  previewResultSchema,
  setlistIdSchema,
  setlistLinksQuerySchema,
  setlistLinksResponseSchema,
  setlistParamsSchema,
  setlistResponseSchema,
  type PlaylistStatus,
} from "../shared/index.js";
import {
  CATALOGUE,
  VisitorError,
  apiErrorOf,
  catalogueEntryOf,
  retryAfterOf,
  type CatalogueEntry,
} from "./catalogue.js";
import type { WebConfig } from "./config.js";
import { createSetlistQueue } from "./create-queue.js";
import type { HostTokenSource } from "./host-tokens.js";
import { createAddressWindow, secondsUntilNextUtcDay, utcDay, type RateLimitHitCounter } from "./limits.js";
import { createFailureLog, createRedactor, type Logger } from "./logging.js";
import { createPreviewRuns, eventFrame, openEventStream } from "./preview-stream.js";
import {
  artistSetlistsResponseOf,
  artistsResponseOf,
  checked,
  incompleteStatusOf,
  previewResultOf,
  showOf,
} from "./shapes.js";
import type { UsageEvents } from "./usage-events.js";

/** The core's setlist.fm and Spotify services, as `createRunServices` builds them. */
export type WebServices = RunServices & SetlistBrowsingServices & HostPlaylistServices;

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

/** 10 kB: a create body is a version id; nothing a Visitor sends needs more. */
const BODY_LIMIT_BYTES = 10 * 1024;

/** The web never asks about Tapes: every Tape is left out of the Host Account's Setlist Playlists. */
const LEAVE_OUT_TAPES: PrepareSetlistOptions = { keepTape: async () => false };

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

const PAGE_UNAVAILABLE = "Playset's web page isn't available right now.";

/** The input as the contract reads it, or the Visitor error `entry` when the contract rejects it. */
function parsed<T>(
  schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } },
  value: unknown,
  entry: CatalogueEntry,
): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new VisitorError(entry);
  return result.data;
}

/** The Visitor address: the connection's, or the one the trusted proxy forwarded (Express's `trust proxy`). */
const addressOf = (req: Request): string => req.ip ?? req.socket.remoteAddress ?? "";

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

  const previewWindow = createAddressWindow(config.previewLimit);
  const createWindow = createAddressWindow(config.createLimit);
  const previewRuns = createPreviewRuns(log);
  const createQueue = createSetlistQueue<CreateOrUpdateResult>();

  /** A Playset limit refused the request: counted for today, answered with how long to wait. */
  const refuse = (entry: CatalogueEntry, retryAfter: number): VisitorError => {
    rateLimitHits.add(utcDay(now()));
    return new VisitorError(entry, { retryAfter });
  };

  /** The Host token, or PLAYLISTS_UNAVAILABLE when the Host Account is not connected. */
  const hostToken = async (): Promise<string> => {
    let token: string | undefined;
    try {
      token = await hostTokens.getAccessToken();
    } catch (error) {
      throw new VisitorError(CATALOGUE.playlistsUnavailable, { cause: error });
    }
    if (token === undefined) throw new VisitorError(CATALOGUE.playlistsUnavailable);
    hostTokensSeen.add(token);
    return token;
  };

  const sendJson = <T>(res: Response, schema: Parameters<typeof checked<T>>[0], what: string, value: unknown) => {
    res.json(checked(schema, what, value));
  };

  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", config.trustProxy ? 1 : false);
  app.use(helmet({ contentSecurityPolicy: CONTENT_SECURITY_POLICY, strictTransportSecurity: false }));

  app.use("/api", (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });

  // ------------------------------------------------------------ Artist search

  app.get(ROUTES.artists, async (req, res) => {
    const { name } = parsed(artistsQuerySchema, req.query, CATALOGUE.artistNameInvalid);
    let found: ArtistCandidates;
    try {
      found = await findArtists(services, name);
    } catch (error) {
      // No Artist by that name is an empty list for a Visitor, not an error.
      if (!(error instanceof ArtistNotFoundError)) throw error;
      found = { candidates: [] };
    }
    sendJson(res, artistsResponseSchema, "Artist search answer", artistsResponseOf(found));
  });

  // ------------------------------------------------------------ Setlist page

  app.get(ROUTES.artistSetlists, async (req, res) => {
    const { mbid } = parsed(artistSetlistsParamsSchema, req.params, CATALOGUE.setlistPageInvalid);
    const { page } = parsed(artistSetlistsQuerySchema, req.query, CATALOGUE.setlistPageInvalid);
    const setlists = await listSetlists(services, mbid, page);
    sendJson(res, artistSetlistsResponseSchema, "Setlist page answer", artistSetlistsResponseOf(mbid, setlists));
  });

  // ------------------------------------------------------------ Setlist link

  app.get(ROUTES.setlistLinks, (req, res) => {
    const { url } = parsed(setlistLinksQuerySchema, req.query, CATALOGUE.setlistLinkInvalid);
    let setlistId: string;
    try {
      // Only read, never fetched: the Setlist is asked of setlist.fm by its id.
      setlistId = parsed(setlistIdSchema, readSetlistId(url), CATALOGUE.setlistLinkInvalid);
    } catch {
      throw new VisitorError(CATALOGUE.setlistLinkInvalid);
    }
    sendJson(res, setlistLinksResponseSchema, "Setlist link answer", { setlistId });
  });

  // ------------------------------------------------------------ Setlist status

  /** Without a version nobody can tell whether the recorded playlist holds this Setlist, so it is never current. */
  const playlistStatusOf = async (setlistId: string, versionId: string | undefined): Promise<PlaylistStatus> => {
    if (versionId === undefined) {
      const record = await records.findRecord(setlistId);
      return record === undefined ? { status: "none" } : { status: "outdated", url: record.shareUrl };
    }
    const lookup = await findSetlistPlaylist(setlistId, versionId, { records });
    return lookup.kind === "none" ? { status: "none" } : { status: lookup.kind, url: lookup.shareUrl };
  };

  app.get(ROUTES.setlist, async (req, res) => {
    const { id } = parsed(setlistParamsSchema, req.params, CATALOGUE.setlistIdInvalid);
    const prepared = await prepareSetlist(await getSetlist(services, id), LEAVE_OUT_TAPES);
    const playlist = await playlistStatusOf(id, prepared.versionId);
    const answer = checked(setlistResponseSchema, "Setlist status answer", {
      show: showOf(prepared.show),
      incompleteStatus: incompleteStatusOf(prepared.incompleteStatus),
      playlist,
    });
    if (playlist.status === "current") {
      await events.recordEvent({ kind: "opened", setlistId: id, artist: prepared.show.artist, day: utcDay(now()) });
    }
    res.json(answer);
  });

  // ------------------------------------------------------------ Preview

  app.get(ROUTES.setlistPreview, async (req, res) => {
    const { id } = parsed(setlistParamsSchema, req.params, CATALOGUE.setlistIdInvalid);
    const accessToken = await hostToken();
    const setlist = await getSetlist(services, id);
    const prepared = await prepareSetlist(setlist, LEAVE_OUT_TAPES);
    const { setlistId, versionId } = prepared;
    if (setlistId === undefined || versionId === undefined) throw new MissingSetlistVersionError(id);

    const cached = await records.findPreview(setlistId, versionId);
    const address = addressOf(req);
    let run = previewRuns.find(setlistId, versionId);
    if (run === undefined && cached !== undefined) {
      const answer = checked(previewResultSchema, "preview", previewResultOf(prepared, cached, versionId));
      const stream = openEventStream(res);
      stream.send(eventFrame(PREVIEW_EVENTS.preview, answer));
      stream.end();
      return;
    }
    if (run === undefined) {
      const wait = previewWindow.waitFor(address, now());
      if (wait !== undefined) throw refuse(CATALOGUE.tooManyPreviews, wait);
      previewWindow.count(address, now());
      run = previewRuns.start(setlistId, versionId, async (signal, send) => {
        const preview = await previewMatches(services, prepared, accessToken, {
          records,
          signal,
          onProgress: ({ n, total }) =>
            send(eventFrame(PREVIEW_EVENTS.progress, checked(previewProgressSchema, "progress", { n, total }))),
        });
        const answer = checked(previewResultSchema, "preview", previewResultOf(prepared, preview, versionId));
        return eventFrame(PREVIEW_EVENTS.preview, answer);
      });
    }
    run.listen(openEventStream(res));
  });

  // ------------------------------------------------------------ Create or update

  const jsonBody = express.json({ limit: BODY_LIMIT_BYTES });
  /** Parses a JSON body; a body too large or not JSON is the Visitor's error, never logged. */
  const readJsonBody: RequestHandler = (req, res, next) => {
    jsonBody(req, res, (error?: unknown) => {
      if (error === undefined) {
        next();
        return;
      }
      const tooLarge = (error as { type?: unknown }).type === "entity.too.large";
      next(new VisitorError(tooLarge ? CATALOGUE.bodyTooLarge : CATALOGUE.createBodyInvalid));
    });
  };
  /** The `:id` is checked before the body is read. */
  const checkSetlistId: RequestHandler = (req, _res, next) => {
    parsed(setlistParamsSchema, req.params, CATALOGUE.setlistIdInvalid);
    next();
  };

  app.post(ROUTES.setlistPlaylist, checkSetlistId, readJsonBody, async (req, res) => {
    const { id } = parsed(setlistParamsSchema, req.params, CATALOGUE.setlistIdInvalid);
    const { versionId } = parsed(createPlaylistBodySchema, req.body, CATALOGUE.createBodyInvalid);
    const accessToken = await hostToken();

    const address = addressOf(req);
    const wait = createWindow.waitFor(address, now());
    if (wait !== undefined) throw refuse(CATALOGUE.tooManyPlaylists, wait);
    const today = utcDay(now());
    if ((await events.countPlaylistsMade(today)) >= config.dailyLimit) {
      throw refuse(CATALOGUE.dailyLimitReached, secondsUntilNextUtcDay(now()));
    }
    createWindow.count(address, now());

    const { playlist, status } = await createQueue.run(id, versionId, async () => {
      const setlist = await getSetlist(services, id);
      const result = await createOrUpdateSetlistPlaylist(services, setlist, versionId, { accessToken, records, now });
      const { show } = await prepareSetlist(setlist, LEAVE_OUT_TAPES);
      await events.recordEvent({ kind: result.status, setlistId: id, artist: show.artist, day: utcDay(now()) });
      return result;
    });
    sendJson(res, createPlaylistResponseSchema, "create answer", { url: playlist.shareUrl, status });
  });

  // ------------------------------------------------------------ Anything else under /api

  app.use("/api", () => {
    throw new VisitorError(CATALOGUE.nothingHere);
  });

  // ------------------------------------------------------------ The built client

  app.use(
    "/assets",
    express.static(join(resolve(deps.clientDir), "assets"), { index: false, immutable: true, maxAge: "1y" }),
    (_req, res) => {
      res.status(404).type("text/plain").send("Not found.");
    },
  );

  const indexHtml = join(resolve(deps.clientDir), "index.html");
  const clientBuilt = existsSync(indexHtml);
  if (!clientBuilt) logger.warn("The web client isn't built: its index.html is missing, so pages answer 503.");

  // Every other page is one of the client's own routes.
  app.get(/.*/, (_req, res, next) => {
    if (!clientBuilt) {
      res.status(503).type("text/plain").send(PAGE_UNAVAILABLE);
      return;
    }
    res.set("Cache-Control", "no-cache");
    res.sendFile(indexHtml, { cacheControl: false }, (error) => {
      if (error !== undefined) next(error);
    });
  });

  app.use((_req, res) => {
    res.status(404).type("text/plain").send("Not found.");
  });

  const handleError: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    const entry = catalogueEntryOf(error);
    log.failure(error, entry);
    if (res.headersSent) {
      res.end();
      return;
    }
    const retryAfter = retryAfterOf(error, entry);
    if (entry.status === 429 && retryAfter !== undefined) res.set("Retry-After", String(retryAfter));
    res.status(entry.status).json({ error: apiErrorOf(entry) });
  };
  app.use(handleError);

  return app;
}
