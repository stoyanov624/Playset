// Create or update the Setlist Playlist from the version the Visitor previewed.
import { z } from "zod";
import { spotifyShareUrl, versionIdSchema } from "./primitives.js";

export const createPlaylistBodySchema = z.strictObject({ versionId: versionIdSchema });
export type CreatePlaylistBody = z.output<typeof createPlaylistBodySchema>;

export const createPlaylistResponseSchema = z.strictObject({
  url: spotifyShareUrl,
  status: z.enum(["created", "updated"]),
});
export type CreatePlaylistResponse = z.output<typeof createPlaylistResponseSchema>;
