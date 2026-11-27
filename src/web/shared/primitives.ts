// Building blocks shared by several shapes: identifiers, links, dates and counts.
import { z } from "zod";
import { LIMITS } from "./constants.js";

export const nonEmptyString = z.string().min(1);

/** A count that can be zero, such as a song count or a usage counter. */
export const count = z.int().min(0);

/** A position or number that starts at 1. */
export const ordinal = z.int().min(1);

export const isoDate = z.iso.date();

/** The core's link reader accepts hex in either case and returns it lower-cased; the cap keeps a path short. */
export const setlistIdSchema = z
  .string()
  .regex(/^[0-9a-f]{1,32}$/i)
  .toLowerCase();
export type SetlistId = z.output<typeof setlistIdSchema>;

/** Any UUID version, so an older MusicBrainz id is never refused. */
export const mbidSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
  .toLowerCase();
export type Mbid = z.output<typeof mbidSchema>;

/** Opaque: compared as sent, so it is never lower-cased. */
export const versionIdSchema = z
  .string()
  .min(1)
  .max(LIMITS.versionIdMaxLength)
  .regex(/^\S+$/);
export type VersionId = z.output<typeof versionIdSchema>;

/**
 * A Show's page on setlist.fm or one of its language subdomains. No whitespace anywhere after the
 * host: the link goes into an href on the page and into the playlist description.
 */
export const setlistFmUrl = z.string().regex(/^https:\/\/(?:[a-z0-9-]+\.)*setlist\.fm\/\S*$/i);

/** The plain share link of a Setlist Playlist: no tracking query, no other Spotify page. */
export const spotifyShareUrl = z.string().regex(/^https:\/\/open\.spotify\.com\/playlist\/[A-Za-z0-9]+$/);

/** A query value given once; Express turns a repeated key into a list, which this rejects. */
export function trimmedQueryValue(maxLength: number) {
  return z.string().trim().min(1).max(maxLength);
}
