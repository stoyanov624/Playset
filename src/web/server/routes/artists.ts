// Finding a Show by Artist: the Artist search and an Artist's Setlist pages.
import { Router } from "express";
import { ArtistNotFoundError, findArtists, listSetlists, type ArtistCandidates } from "../../../core/index.js";
import {
  ROUTES,
  artistSetlistsParamsSchema,
  artistSetlistsQuerySchema,
  artistSetlistsResponseSchema,
  artistsQuerySchema,
  artistsResponseSchema,
} from "../../shared/index.js";
import { CATALOGUE } from "../catalogue.js";
import { artistSetlistsResponseOf, artistsResponseOf } from "../shapes.js";
import { parsed, sendJson, undecodableParamIs, type RouteContext } from "./context.js";

export function artistRoutes({ services }: RouteContext): Router {
  const router = Router();

  router.get(ROUTES.artists, async (req, res) => {
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

  router.get(ROUTES.artistSetlists, async (req, res) => {
    const { mbid } = parsed(artistSetlistsParamsSchema, req.params, CATALOGUE.setlistPageInvalid);
    const { page } = parsed(artistSetlistsQuerySchema, req.query, CATALOGUE.setlistPageInvalid);
    const setlists = await listSetlists(services, mbid, page);
    sendJson(res, artistSetlistsResponseSchema, "Setlist page answer", artistSetlistsResponseOf(mbid, setlists));
  });

  router.use(undecodableParamIs(CATALOGUE.setlistPageInvalid));
  return router;
}
