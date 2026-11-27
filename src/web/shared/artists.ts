// Artist search: the typed name and the candidates the Visitor chooses from.
import { z } from "zod";
import { LIMITS } from "./constants.js";
import { mbidSchema, nonEmptyString, trimmedQueryValue } from "./primitives.js";

/** One page of candidates is plenty to choose from; a longer list would only bury the right Artist. */
const ARTIST_CANDIDATES_MAX = 10;

export const artistsQuerySchema = z.object({ name: trimmedQueryValue(LIMITS.artistNameMaxLength) });
export type ArtistsQuery = z.output<typeof artistsQuerySchema>;

export const artistCandidateSchema = z.strictObject({
  name: nonEmptyString,
  mbid: mbidSchema,
  disambiguation: nonEmptyString.optional(),
});
export type ArtistCandidate = z.output<typeof artistCandidateSchema>;

/** The web always shows the list, so the core's auto-pick never travels. */
export const artistsResponseSchema = z.strictObject({
  artists: z.array(artistCandidateSchema).max(ARTIST_CANDIDATES_MAX),
});
export type ArtistsResponse = z.output<typeof artistsResponseSchema>;
