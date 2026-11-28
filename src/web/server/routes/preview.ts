// The preview stream. A cached preview or a run already in flight for the same version is free; only a
// preview that starts a new run is counted against the Visitor address.
import { Router, type Response } from "express";
import { MissingSetlistVersionError, getSetlist, prepareSetlist, previewMatches } from "../../../core/index.js";
import {
  PREVIEW_EVENTS,
  ROUTES,
  previewProgressSchema,
  previewResultSchema,
  setlistParamsSchema,
} from "../../shared/index.js";
import { CATALOGUE } from "../catalogue.js";
import { createAddressWindow } from "../limits.js";
import { createPreviewRuns, eventFrame, openEventStream } from "../preview-stream.js";
import { checked, previewResultOf } from "../shapes.js";
import { addressOf, parsed, type RouteContext } from "./context.js";
import { LEAVE_OUT_TAPES } from "./tapes.js";

/** Whether the Visitor's connection has closed since now, before any answer was sent. */
function leftSince(res: Response): () => boolean {
  let closed = res.destroyed;
  res.once("close", () => {
    closed = true;
  });
  return () => closed || res.destroyed;
}

export function previewRoutes({ config, services, records, now, log, hostToken, refuse }: RouteContext): Router {
  const previewWindow = createAddressWindow(config.previewLimit);
  const previewRuns = createPreviewRuns(log);
  const router = Router();

  router.get(ROUTES.setlistPreview, async (req, res) => {
    const { id } = parsed(setlistParamsSchema, req.params, CATALOGUE.setlistIdInvalid);
    // A Visitor can leave while the Host token, the Setlist or the cache lookup is still on its way. They
    // have left as surely as one who closes the open stream: nothing is started or counted for them.
    const left = leftSince(res);
    const accessToken = await hostToken();
    if (left()) return;
    const setlist = await getSetlist(services, id);
    if (left()) return;
    const prepared = await prepareSetlist(setlist, LEAVE_OUT_TAPES);
    const { setlistId, versionId } = prepared;
    if (setlistId === undefined || versionId === undefined) throw new MissingSetlistVersionError(id);

    // Read here, not left to the preview step, because a cached preview must be known before the limit.
    const cached = await records.findPreview(setlistId, versionId);
    if (left()) return;
    let run = previewRuns.find(setlistId, versionId);
    if (run === undefined && cached !== undefined) {
      const answer = checked(previewResultSchema, "preview", previewResultOf(prepared, cached, versionId));
      const stream = openEventStream(res);
      stream.send(eventFrame(PREVIEW_EVENTS.preview, answer));
      stream.end();
      return;
    }
    if (run === undefined) {
      const address = addressOf(req);
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

  return router;
}
