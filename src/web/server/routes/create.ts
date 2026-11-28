// Create or update the Setlist's one Setlist Playlist: behind the per-address and daily limits, and one
// run per Setlist at a time.
import express, { Router, type RequestHandler } from "express";
import {
  createOrUpdateSetlistPlaylist,
  getSetlist,
  prepareSetlist,
  type CreateOrUpdateResult,
} from "../../../core/index.js";
import {
  ROUTES,
  createPlaylistBodySchema,
  createPlaylistResponseSchema,
  setlistParamsSchema,
} from "../../shared/index.js";
import { CATALOGUE, VisitorError } from "../catalogue.js";
import { createSetlistQueue } from "../create-queue.js";
import { createAddressWindow, secondsUntilNextUtcDay, utcDay } from "../limits.js";
import { addressOf, parsed, sendJson, type RouteContext } from "./context.js";
import { LEAVE_OUT_TAPES } from "./tapes.js";

/** 10 kB: a create body is a version id; nothing a Visitor sends needs more. */
const BODY_LIMIT_BYTES = 10 * 1024;

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

export function createRoutes({ config, services, records, events, now, hostToken, refuse }: RouteContext): Router {
  const createWindow = createAddressWindow(config.createLimit);
  const createQueue = createSetlistQueue<CreateOrUpdateResult>();
  const router = Router();

  router.post(ROUTES.setlistPlaylist, checkSetlistId, readJsonBody, async (req, res) => {
    const { id } = parsed(setlistParamsSchema, req.params, CATALOGUE.setlistIdInvalid);
    const { versionId } = parsed(createPlaylistBodySchema, req.body, CATALOGUE.createBodyInvalid);
    const accessToken = await hostToken();

    const address = addressOf(req);
    const wait = createWindow.waitFor(address, now());
    if (wait !== undefined) throw refuse(CATALOGUE.tooManyPlaylists, wait);
    if ((await events.countPlaylistsMade(utcDay(now()))) >= config.dailyLimit) {
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

  return router;
}
