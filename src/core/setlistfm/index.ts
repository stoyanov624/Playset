// setlist.fm: the API key, the Artist lookup, and finding a Setlist by id or an Artist's Latest Setlist.
export { resolveSetlistFmApiKey } from "./api-key.js";
export type { Env } from "./api-key.js";
export { artistNamesMatch, createSetlistFmClient } from "./client.js";
export type {
  ArtistCandidate,
  ArtistCandidates,
  ArtistChooser,
  LatestSetlistLookup,
  LatestSetlistOptions,
  SetlistFmClient,
  SetlistFmClientDeps,
  SetlistPage,
} from "./client.js";
export {
  ArtistChoiceCancelledError,
  ArtistNotFoundError,
  MissingSetlistFmApiKeyError,
  NoSetlistError,
  SetlistFmRateLimitError,
  SetlistFmRequestError,
  SetlistNotFoundError,
} from "./errors.js";
