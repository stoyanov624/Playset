import type { PrepareSetlistOptions } from "../../../core/index.js";

/** The web never asks about Tapes: every Tape is left out of the Host Account's Setlist Playlists. */
export const LEAVE_OUT_TAPES: PrepareSetlistOptions = { keepTape: async () => false };
