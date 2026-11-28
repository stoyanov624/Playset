// The built web client: its hashed assets, and index.html for every other page (the client's own routes).
// Without a build, pages answer 503 so the API still works while the client is missing.
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import express, { Router } from "express";
import type { Logger } from "./logging.js";

const PAGE_UNAVAILABLE = "Playset's web page isn't available right now.";
const NOT_FOUND = "Not found.";

export function clientRoutes(clientDir: string, logger: Logger): Router {
  const router = Router();
  const notFound: express.RequestHandler = (_req, res) => {
    res.status(404).type("text/plain").send(NOT_FOUND);
  };

  router.use(
    "/assets",
    express.static(join(resolve(clientDir), "assets"), { index: false, immutable: true, maxAge: "1y" }),
    notFound,
  );

  const indexHtml = join(resolve(clientDir), "index.html");
  const clientBuilt = existsSync(indexHtml);
  if (!clientBuilt) logger.warn("The web client isn't built: its index.html is missing, so pages answer 503.");

  router.get(/.*/, (_req, res, next) => {
    if (!clientBuilt) {
      res.status(503).type("text/plain").send(PAGE_UNAVAILABLE);
      return;
    }
    res.set("Cache-Control", "no-cache");
    res.sendFile(indexHtml, { cacheControl: false }, (error) => {
      if (error !== undefined) next(error);
    });
  });

  router.use(notFound);
  return router;
}
