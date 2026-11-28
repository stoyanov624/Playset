// The one error shape: inside an error answer's body, and bare as the preview stream's error event.
import { z } from "zod";
import { ERROR_CODES } from "./constants.js";
import { nonEmptyString } from "./primitives.js";

export const apiErrorSchema = z.strictObject({
  code: z.enum(ERROR_CODES),
  message: nonEmptyString,
  hint: nonEmptyString.optional(),
});
export type ApiError = z.output<typeof apiErrorSchema>;

export const errorBodySchema = z.strictObject({ error: apiErrorSchema });
export type ErrorBody = z.output<typeof errorBodySchema>;

/** The error event of the preview stream carries the error unwrapped. */
export const previewErrorSchema = apiErrorSchema;
export type PreviewError = z.output<typeof previewErrorSchema>;
