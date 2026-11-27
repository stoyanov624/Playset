// The Host Account's admin: Spotify login callback, admin page, status and logout.
import { z } from "zod";
import { CONFIG_ITEMS, ERROR_CODES, LIMITS } from "./constants.js";
import { count, isoDate, nonEmptyString, ordinal } from "./primitives.js";

/** Spotify answers with either a code or an error, never both; xor rejects a query matching both. */
export const adminCallbackQuerySchema = z.xor([
  z.object({ code: nonEmptyString, state: nonEmptyString }),
  z.object({ error: nonEmptyString, state: nonEmptyString }),
]);
export type AdminCallbackQuery = z.output<typeof adminCallbackQuerySchema>;

/** A failed login comes back to the admin page with its error code. */
export const adminPageQuerySchema = z.object({ login: z.enum(ERROR_CODES).optional() });
export type AdminPageQuery = z.output<typeof adminPageQuerySchema>;

/** Logout takes no input; an absent body is as good as `{}`. */
export const adminLogoutBodySchema = z.strictObject({}).optional();
export type AdminLogoutBody = z.output<typeof adminLogoutBodySchema>;

/** Names and counts only: no secret, no env name and no Host Account id reaches the browser. */
export const adminStatusResponseSchema = z.strictObject({
  hostAccount: z.strictObject({ connected: z.boolean(), displayName: nonEmptyString.optional() }),
  config: z.array(z.strictObject({ name: z.enum(CONFIG_ITEMS), present: z.boolean() })),
  usage: z.strictObject({
    playlistsMade: count,
    opens: count,
    perDay: z
      .array(z.strictObject({ date: isoDate, created: count, updated: count, opened: count }))
      .length(LIMITS.usageDays),
    topArtists: z
      .array(z.strictObject({ artist: nonEmptyString, playlistCount: ordinal }))
      .max(LIMITS.topArtistsMax),
  }),
  rateLimitHitsToday: count,
});
export type AdminStatusResponse = z.output<typeof adminStatusResponseSchema>;
