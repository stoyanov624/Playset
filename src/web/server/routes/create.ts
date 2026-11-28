// Create or update the Setlist's one Setlist Playlist: behind the per-address and daily limits, and one
// run per Setlist at a time.
import { Router } from "express";
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
import { CATALOGUE } from "../catalogue.js";
import { createSetlistQueue } from "../create-queue.js";
import { createAddressWindow, createDailyLimit, secondsUntilNextUtcDay, utcDay } from "../limits.js";
import { addressOf, parsed, readJsonBody, sendJson, undecodableParamIs, type RouteContext } from "./context.js";
import { LEAVE_OUT_TAPES } from "./tapes.js";

/** A create that shares another's run holds no daily slot, so it has none to give back. */
const NO_DAILY_SLOT = (): void => {};

export function createRoutes({
  config,
  services,
  records,
  events,
  now,
  hostToken,
  refuse,
  recordUsage,
}: RouteContext): Router {
  const createWindow = createAddressWindow(config.createLimit);
  const dailyLimit = createDailyLimit(config.dailyLimit);
  const createQueue = createSetlistQueue<CreateOrUpdateResult>();
  const router = Router();

  router.post(ROUTES.setlistPlaylist, async (req, res) => {
    const { id } = parsed(setlistParamsSchema, req.params, CATALOGUE.setlistIdInvalid);
    // Read only after the `:id` is checked, so a bad id is answered as such whatever the body.
    await readJsonBody(req, res, CATALOGUE.createBodyInvalid);
    const { versionId } = parsed(createPlaylistBodySchema, req.body, CATALOGUE.createBodyInvalid);
    const accessToken = await hostToken();

    const address = addressOf(req);
    const admittedAt = now();
    const wait = createWindow.waitFor(address, admittedAt);
    if (wait !== undefined) throw refuse(CATALOGUE.tooManyPlaylists, wait);
    // Counted before anything is awaited, so creates arriving together from one address can't all pass.
    const uncount = createWindow.count(address, admittedAt);

    // A create that shares a run already queued makes no playlist of its own, so it needs no daily slot and
    // is never refused for the day: it gets the running create's answer. Checked and joined with nothing
    // awaited in between, so the run can't end in the gap.
    let releaseDailySlot = NO_DAILY_SLOT;
    if (!createQueue.joins(id, versionId)) {
      // A create refused for the whole of Playset (or that couldn't be checked) leaves the address's hour as it was.
      const admitted = await dailyLimit
        .admit(() => events.countPlaylistsMade(utcDay(now())))
        .catch((error: unknown) => {
          uncount();
          throw error;
        });
      if (admitted === undefined) {
        uncount();
        throw refuse(CATALOGUE.dailyLimitReached, secondsUntilNextUtcDay(now()));
      }
      releaseDailySlot = admitted;
      // A run for this version may have been queued while the daily check ran; sharing it makes no playlist.
      if (createQueue.joins(id, versionId)) releaseDailySlot();
    }

    let answer: CreateOrUpdateResult;
    try {
      answer = await createQueue.run(id, versionId, async () => {
        const setlist = await getSetlist(services, id);
        const result = await createOrUpdateSetlistPlaylist(services, setlist, versionId, { accessToken, records, now });
        const { show } = await prepareSetlist(setlist, LEAVE_OUT_TAPES);
        await recordUsage(result.status, id, show.artist);
        // From here today's count holds this create (or, unsaved, never will), so its slot is free.
        releaseDailySlot();
        return result;
      });
    } finally {
      releaseDailySlot();
    }
    const { playlist, status } = answer;
    sendJson(res, createPlaylistResponseSchema, "create answer", { url: playlist.shareUrl, status });
  });

  router.use(undecodableParamIs(CATALOGUE.setlistIdInvalid));
  return router;
}
