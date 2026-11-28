// The preview stream. A cached preview or a run already in flight for the same version is free; only a
// preview that starts a new run is counted against the Visitor address.
import { Router } from "express";
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

export function previewRoutes({ config, services, records, now, log, hostToken, refuse }: RouteContext): Router {
  const previewWindow = createAddressWindow(config.previewLimit);
  const previewRuns = createPreviewRuns(log);
  const router = Router();

  router.get(ROUTES.setlistPreview, async (req, res) => {
    const { id } = parsed(setlistParamsSchema, req.params, CATALOGUE.setlistIdInvalid);
    const accessToken = await hostToken();
    const prepared = await prepareSetlist(await getSetlist(services, id), LEAVE_OUT_TAPES);
    const { setlistId, versionId } = prepared;
    if (setlistId === undefined || versionId === undefined) throw new MissingSetlistVersionError(id);

    // Read here, not left to the preview step, because a cached preview must be known before the limit.
    const cached = await records.findPreview(setlistId, versionId);
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
