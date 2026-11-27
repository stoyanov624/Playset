// A Setlist and an Artist's Setlists: the Setlist page, the link lookup and the Setlist status.
import { z } from "zod";
import { LIMITS } from "./constants.js";
import {
  count,
  isoDate,
  mbidSchema,
  nonEmptyString,
  setlistFmUrl,
  setlistIdSchema,
  spotifyShareUrl,
  trimmedQueryValue,
} from "./primitives.js";

export const incompleteStatusSchema = z.strictObject({
  isIncomplete: z.boolean(),
  unknownSongCount: count,
  matchedPhrase: nonEmptyString.optional(),
  setlistNote: nonEmptyString.optional(),
});
export type IncompleteStatus = z.output<typeof incompleteStatusSchema>;

export const showSchema = z.strictObject({
  artist: nonEmptyString,
  date: isoDate,
  venue: z.string(),
  city: z.string(),
  url: setlistFmUrl,
});
export type Show = z.output<typeof showSchema>;

/** The list needs no version: the preview gives it. */
export const setlistSummarySchema = z.strictObject({
  id: setlistIdSchema,
  date: isoDate,
  venue: z.string(),
  city: z.string(),
  songCount: count,
  incompleteStatus: incompleteStatusSchema,
});
export type SetlistSummary = z.output<typeof setlistSummarySchema>;

/** A Setlist Playlist in the Host Account: none yet, or one with its share link. */
export const playlistStatusSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("none") }),
  z.strictObject({ status: z.literal("current"), url: spotifyShareUrl }),
  z.strictObject({ status: z.literal("outdated"), url: spotifyShareUrl }),
]);
export type PlaylistStatus = z.output<typeof playlistStatusSchema>;

export const artistSetlistsParamsSchema = z.object({ mbid: mbidSchema });
export type ArtistSetlistsParams = z.output<typeof artistSetlistsParamsSchema>;

/** Digits only with no leading zero, so a page in the URL has exactly one spelling. */
export const artistSetlistsQuerySchema = z.object({
  page: z
    .string()
    .regex(/^[1-9][0-9]*$/)
    .transform(Number)
    .pipe(z.int().max(LIMITS.pageMax))
    .default(LIMITS.pageDefault),
});
export type ArtistSetlistsQuery = z.output<typeof artistSetlistsQuerySchema>;

export const artistSetlistsResponseSchema = z.strictObject({
  artist: z.strictObject({ mbid: mbidSchema, name: nonEmptyString.optional() }),
  setlists: z.array(setlistSummarySchema),
  hasMore: z.boolean(),
});
export type ArtistSetlistsResponse = z.output<typeof artistSetlistsResponseSchema>;

/** Only trimmed and capped here; whether it is a setlist.fm Setlist link is the core's rule. */
export const setlistLinksQuerySchema = z.object({ url: trimmedQueryValue(LIMITS.setlistLinkMaxLength) });
export type SetlistLinksQuery = z.output<typeof setlistLinksQuerySchema>;

export const setlistLinksResponseSchema = z.strictObject({ setlistId: setlistIdSchema });
export type SetlistLinksResponse = z.output<typeof setlistLinksResponseSchema>;

/** The one `:id` parameter of the Setlist, preview and create-or-update routes. */
export const setlistParamsSchema = z.object({ id: setlistIdSchema });
export type SetlistParams = z.output<typeof setlistParamsSchema>;

export const setlistResponseSchema = z.strictObject({
  show: showSchema,
  incompleteStatus: incompleteStatusSchema,
  playlist: playlistStatusSchema,
});
export type SetlistResponse = z.output<typeof setlistResponseSchema>;
