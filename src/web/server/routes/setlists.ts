// Opening a Show: reading a setlist.fm link, and the Setlist's status with its Setlist Playlist, if any.
import { Router } from "express";
import {
  SetlistLinkError,
  findSetlistPlaylist,
  getSetlist,
  prepareSetlist,
  readSetlistId,
  type SetlistPlaylistRecords,
} from "../../../core/index.js";
import {
  ROUTES,
  setlistIdSchema,
  setlistLinksQuerySchema,
  setlistLinksResponseSchema,
  setlistParamsSchema,
  setlistResponseSchema,
  type PlaylistStatus,
} from "../../shared/index.js";
import { CATALOGUE, VisitorError } from "../catalogue.js";
import { utcDay } from "../limits.js";
import { checked, incompleteStatusOf, showOf } from "../shapes.js";
import { LEAVE_OUT_TAPES } from "./tapes.js";
import { parsed, sendJson, type RouteContext } from "./context.js";

/** The setlist id in a setlist.fm link, only read, never fetched: the Setlist is asked of setlist.fm by its id. */
function setlistIdIn(url: string): string {
  let setlistId: string;
  try {
    setlistId = readSetlistId(url);
  } catch (error) {
    if (error instanceof SetlistLinkError) throw new VisitorError(CATALOGUE.setlistLinkInvalid);
    throw error;
  }
  return parsed(setlistIdSchema, setlistId, CATALOGUE.setlistLinkInvalid);
}

/** Without a version nobody can tell whether the recorded playlist holds this Setlist, so it is never current. */
async function playlistStatusOf(
  setlistId: string,
  versionId: string | undefined,
  records: SetlistPlaylistRecords,
): Promise<PlaylistStatus> {
  if (versionId === undefined) {
    const record = await records.findRecord(setlistId);
    return record === undefined ? { status: "none" } : { status: "outdated", url: record.shareUrl };
  }
  const lookup = await findSetlistPlaylist(setlistId, versionId, { records });
  return lookup.kind === "none" ? { status: "none" } : { status: lookup.kind, url: lookup.shareUrl };
}

export function setlistRoutes({ services, records, events, now }: RouteContext): Router {
  const router = Router();

  router.get(ROUTES.setlistLinks, (req, res) => {
    const { url } = parsed(setlistLinksQuerySchema, req.query, CATALOGUE.setlistLinkInvalid);
    sendJson(res, setlistLinksResponseSchema, "Setlist link answer", { setlistId: setlistIdIn(url) });
  });

  router.get(ROUTES.setlist, async (req, res) => {
    const { id } = parsed(setlistParamsSchema, req.params, CATALOGUE.setlistIdInvalid);
    const prepared = await prepareSetlist(await getSetlist(services, id), LEAVE_OUT_TAPES);
    const playlist = await playlistStatusOf(id, prepared.versionId, records);
    // Checked before the open is recorded, so an answer the contract rejects records nothing.
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

  return router;
}
