// The preview stream's event data: progress while Matching, then the whole preview at once.
import { z } from "zod";
import { count, nonEmptyString, ordinal, versionIdSchema } from "./primitives.js";
import { incompleteStatusSchema, showSchema } from "./setlists.js";

export const previewProgressSchema = z
  .strictObject({ n: ordinal, total: ordinal })
  .refine(({ n, total }) => n <= total, { message: "n is greater than total", path: ["n"] });
export type PreviewProgress = z.output<typeof previewProgressSchema>;

/**
 * A kept Performance as the browser sees it. Its Artist is always the Show's, and the web
 * leaves every Tape out, so neither travels.
 */
export const previewPerformanceSchema = z.strictObject({
  position: ordinal,
  title: nonEmptyString,
  setLabel: nonEmptyString,
  originalArtist: nonEmptyString.optional(),
  medley: nonEmptyString.optional(),
});
export type PreviewPerformance = z.output<typeof previewPerformanceSchema>;

/** Match lines are plain text, so the Spotify URI and id stay on the server. */
export const matchSchema = z.strictObject({
  kind: z.literal("match"),
  name: nonEmptyString,
  artists: z.array(nonEmptyString).min(1),
  album: z.string(),
  live: z.boolean(),
});
export type Match = z.output<typeof matchSchema>;

/** The search queries tried for a Miss stay on the server. */
export const missSchema = z.strictObject({
  kind: z.literal("miss"),
  title: nonEmptyString,
  artist: nonEmptyString,
  originalArtist: nonEmptyString.optional(),
});
export type Miss = z.output<typeof missSchema>;

export const previewRowSchema = z.strictObject({
  number: ordinal,
  performance: previewPerformanceSchema,
  outcome: z.discriminatedUnion("kind", [matchSchema, missSchema]),
});
export type PreviewRow = z.output<typeof previewRowSchema>;

/** A Miss with its row number, so the Misses list can link to its row. */
export const previewMissSchema = z.strictObject({
  number: ordinal,
  title: nonEmptyString,
  artist: nonEmptyString,
  originalArtist: nonEmptyString.optional(),
});
export type PreviewMiss = z.output<typeof previewMissSchema>;

/** A snippet or left-out Tape has its name; an Unknown Song has none, only its place and info. */
export const notAddedSchema = z.discriminatedUnion("reason", [
  z.strictObject({ reason: z.enum(["snippet", "tape"]), name: nonEmptyString }),
  z.strictObject({ reason: z.literal("unknown"), after: count, info: nonEmptyString.optional() }),
]);
export type NotAdded = z.output<typeof notAddedSchema>;

export const previewResultSchema = z.strictObject({
  show: showSchema,
  incompleteStatus: incompleteStatusSchema,
  rows: z.array(previewRowSchema),
  misses: z.array(previewMissSchema),
  notAdded: z.array(notAddedSchema),
  playlistName: nonEmptyString,
  versionId: versionIdSchema,
});
export type PreviewResult = z.output<typeof previewResultSchema>;
