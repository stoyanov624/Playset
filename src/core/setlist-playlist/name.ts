import type { Show } from "../performances/index.js";
import { DescriptionTooLongError } from "./errors.js";

/** Spotify's limit on a playlist description. */
const DESCRIPTION_LIMIT = 300;
const DESCRIPTION_PREFIX = "Setlist from setlist.fm: ";

/** `Artist – YYYY-MM-DD – City`, with en dashes; no network request. */
export function setlistPlaylistName(show: Show): string {
  return `${show.artist} – ${show.date} – ${show.city}`;
}

/** `Setlist from setlist.fm: <url>` (attribution); throws DescriptionTooLongError above 300 characters. */
export function setlistPlaylistDescription(show: Show): string {
  const description = `${DESCRIPTION_PREFIX}${show.url}`;
  if (description.length > DESCRIPTION_LIMIT) {
    throw new DescriptionTooLongError(description.length, DESCRIPTION_LIMIT);
  }
  return description;
}
