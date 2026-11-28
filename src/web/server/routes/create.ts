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
import { createAddressWindow, createDailyLimit, secondsUntilNextUtcDay, utcDay } from "../limits.js";
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

export function createRoutes({ config, services, records, events, now, log, hostToken, refuse }: RouteContext): Router {
  const createWindow = createAddressWindow(config.createLimit);
  const dailyLimit = createDailyLimit(config.dailyLimit);
  const createQueue = createSetlistQueue<CreateOrUpdateResult>();
  const router = Router();

  router.post(ROUTES.setlistPlaylist, checkSetlistId, readJsonBody, async (req, res) => {
    const { id } = parsed(setlistParamsSchema, req.params, CATALOGUE.setlistIdInvalid);
    const { versionId } = parsed(createPlaylistBodySchema, req.body, CATALOGUE.createBodyInvalid);
    const accessToken = await hostToken();

    const address = addressOf(req);
    const admittedAt = now();
    const wait = createWindow.waitFor(address, admittedAt);
    if (wait !== undefined) throw refuse(CATALOGUE.tooManyPlaylists, wait);
    // Counted before anything is awaited, so creates arriving together from one address can't all pass.
    createWindow.count(address, admittedAt);
    // A create refused for the whole of Playset (or that couldn't be checked) leaves the address's hour as it was.
    const done = await dailyLimit
      .admit(() => events.countPlaylistsMade(utcDay(now())))
      .catch((error: unknown) => {
        createWindow.uncount(address, admittedAt);
        throw error;
      });
    if (done === undefined) {
      createWindow.uncount(address, admittedAt);
      throw refuse(CATALOGUE.dailyLimitReached, secondsUntilNextUtcDay(now()));
    }

    let answer: CreateOrUpdateResult;
    try {
      answer = await createQueue.run(id, versionId, async () => {
        const setlist = await getSetlist(services, id);
        const result = await createOrUpdateSetlistPlaylist(services, setlist, versionId, { accessToken, records, now });
        const { show } = await prepareSetlist(setlist, LEAVE_OUT_TAPES);
        try {
          await events.recordEvent({ kind: result.status, setlistId: id, artist: show.artist, day: utcDay(now()) });
        } catch (error) {
          // The playlist exists; a missing usage event only makes the numbers short by one.
          log.eventNotRecorded(error);
        }
        return result;
      });
    } finally {
      done();
    }
    const { playlist, status } = answer;
    sendJson(res, createPlaylistResponseSchema, "create answer", { url: playlist.shareUrl, status });
  });

  return router;
}
