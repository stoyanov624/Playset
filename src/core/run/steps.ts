// The run as stateless steps: each takes everything it needs as input, asks nothing of its own and
// remembers nothing between calls, so a front-end without a run in flight can call them one at a time.
// Some steps only pass through to a service; they exist so a front-end drives the whole flow through
// steps alone and never reaches into the services itself.
import type { Match, MatchOutcome, Miss } from "../matching/index.js";
import {
  toPerformances,
  type NotedSong,
  type Performance,
  type SetlistFmSetlist,
  type Show,
} from "../performances/index.js";
import { setlistPlaylistDescription, setlistPlaylistName } from "../setlist-playlist/index.js";
import type {
  ArtistCandidates,
  ArtistChooser,
  LatestSetlistLookup,
  LatestSetlistOptions,
} from "../setlistfm/index.js";
import { throwIfCancelled, unlessCancelled } from "./cancellation.js";
import { InvalidSetlistPageError } from "./errors.js";
import type {
  CreateSetlistPlaylistOptions,
  CreatedPlaylist,
  MatchPreview,
  NotAdded,
  PrepareSetlistOptions,
  PreparedSetlist,
  PreviewMatchesOptions,
  PreviewRow,
  RunServices,
  SetlistBrowsingServices,
  SetlistSummary,
  SetlistSummaryPage,
} from "./types.js";

/** The Artists found for a typed name; `autoPick` is set only when exactly one is an exact match. */
export function findArtists(
  services: Pick<SetlistBrowsingServices, "findArtistCandidates">,
  name: string,
): Promise<ArtistCandidates> {
  return services.findArtistCandidates(name);
}

/** One page of the Artist's Setlists, summarised, newest first; Setlists without a Performance are left out. */
export async function listSetlists(
  services: Pick<SetlistBrowsingServices, "getSetlistPage">,
  mbid: string,
  page: number,
): Promise<SetlistSummaryPage> {
  if (!Number.isInteger(page) || page < 1) throw new InvalidSetlistPageError(page);
  const { setlists, hasMore } = await services.getSetlistPage(mbid, page);
  return { setlists: setlists.flatMap(summaryOf), hasMore };
}

/** A placeholder (an announced Show, or only snippets and Unknown Songs) cannot be picked, so it has none. */
function summaryOf(setlist: SetlistFmSetlist): SetlistSummary[] {
  const { show, performances, incompleteStatus } = toPerformances(setlist);
  // Without an id the Setlist could not be fetched again once picked.
  if (performances.length === 0 || setlist.id === undefined) return [];
  return [
    {
      id: setlist.id,
      date: show.date,
      venue: show.venue,
      city: show.city,
      songCount: performances.length,
      incompleteStatus,
      ...withVersion(setlist),
    },
  ];
}

/**
 * setlist.fm's version of the Setlist, when it has a usable one: setlist.fm's data is not checked against
 * its type, so an empty or non-string `versionId` counts as none.
 */
export function versionOf(setlist: SetlistFmSetlist): string | undefined {
  const versionId: unknown = setlist.versionId;
  return typeof versionId === "string" && versionId !== "" ? versionId : undefined;
}

/** `versionId` as a key only when there is a version, so a Setlist without one looks exactly as before. */
function withVersion(setlist: SetlistFmSetlist): { versionId?: string } {
  const versionId = versionOf(setlist);
  return versionId === undefined ? {} : { versionId };
}

/** One Setlist by its setlist.fm id, unchanged. */
export function getSetlist(services: Pick<RunServices, "getSetlist">, setlistId: string): Promise<SetlistFmSetlist> {
  return services.getSetlist(setlistId);
}

/** The Artist's Latest Setlist, asking the chooser when the name is ambiguous. */
export function findLatestSetlist(
  services: Pick<RunServices, "findLatestSetlistByArtistName">,
  name: string,
  chooser: ArtistChooser,
  options: LatestSetlistOptions,
): Promise<LatestSetlistLookup> {
  return services.findLatestSetlistByArtistName(name, chooser, options);
}

/**
 * The Setlist with the Tape decisions applied. A description that would be too long fails before any Tape
 * is asked about, so the user never answers questions for a Setlist Playlist that cannot be made.
 */
export async function prepareSetlist(
  setlist: SetlistFmSetlist,
  { keepTape }: PrepareSetlistOptions,
): Promise<PreparedSetlist> {
  const { show, performances, noted, incompleteStatus } = toPerformances(setlist);
  setlistPlaylistDescription(show);

  const keptPerformances: Performance[] = [];
  const leftOutTapes: Performance[] = [];
  for (const performance of performances) {
    if (!performance.isTape || (await keepTape(performance))) keptPerformances.push(performance);
    else leftOutTapes.push(performance);
  }
  return {
    show,
    keptPerformances,
    notAdded: notAddedInPlayedOrder(noted, keptPerformances, leftOutTapes),
    incompleteStatus,
    ...(setlist.id === undefined ? {} : { setlistId: setlist.id }),
    ...withVersion(setlist),
  };
}

/**
 * One Match search per kept Performance, in played order; nothing is checked or created. With records, a
 * preview already cached for the same setlist id and version is given back instead, and a new one is cached.
 */
export async function previewMatches(
  services: Pick<RunServices, "findMatch">,
  prepared: PreparedSetlist,
  accessToken: string,
  { onProgress, signal, records }: PreviewMatchesOptions,
): Promise<MatchPreview> {
  const cacheKey = records === undefined ? undefined : previewCacheKey(prepared);
  if (records === undefined || cacheKey === undefined) {
    return searchMatches(services, prepared, accessToken, onProgress, signal);
  }
  throwIfCancelled(signal);
  const cached = await records.findPreview(cacheKey.setlistId, cacheKey.versionId);
  throwIfCancelled(signal);
  if (cached !== undefined) return cached;
  const preview = await searchMatches(services, prepared, accessToken, onProgress, signal);
  await records.savePreview(cacheKey.setlistId, cacheKey.versionId, preview);
  return preview;
}

/**
 * Only a Setlist with an id and a version that keeps no Tape is cached: the version tells when the cache is
 * stale, and the Host Account always leaves Tapes out, so a front-end's Tape choice never reaches it.
 */
function previewCacheKey(prepared: PreparedSetlist): { setlistId: string; versionId: string } | undefined {
  const { setlistId, versionId, keptPerformances } = prepared;
  if (setlistId === undefined || versionId === undefined) return undefined;
  if (keptPerformances.some((performance) => performance.isTape)) return undefined;
  return { setlistId, versionId };
}

async function searchMatches(
  services: Pick<RunServices, "findMatch">,
  prepared: PreparedSetlist,
  accessToken: string,
  onProgress: PreviewMatchesOptions["onProgress"],
  signal: AbortSignal | undefined,
): Promise<MatchPreview> {
  const { keptPerformances } = prepared;
  const rows: PreviewRow[] = [];
  for (const [index, performance] of keptPerformances.entries()) {
    throwIfCancelled(signal);
    onProgress?.({ n: index + 1, total: keptPerformances.length, performance });
    const outcome = await unlessCancelled(signal, () => services.findMatch(performance, accessToken));
    rows.push({ number: index + 1, performance, outcome });
  }
  throwIfCancelled(signal);

  const outcomes = rows.map((row) => row.outcome);
  return {
    rows,
    matches: outcomes.filter(isMatch),
    misses: outcomes.filter(isMiss),
    playlistName: setlistPlaylistName(prepared.show),
  };
}

/** The Setlist Playlist of the Show, created and filled with the Matches. */
export function createSetlistPlaylist(
  services: Pick<RunServices, "createSetlistPlaylist">,
  show: Show,
  matches: Match[],
  options: CreateSetlistPlaylistOptions,
): Promise<CreatedPlaylist> {
  return services.createSetlistPlaylist(show, matches, options);
}

/**
 * Noted songs and left-out Tapes merged in played order. A left-out Tape sits at its own position; a noted
 * song was played right after the Performance at its `afterPosition`, so it comes after a Tape at that
 * position and before the next one. Noted songs at the same place keep their played order.
 */
function notAddedInPlayedOrder(
  noted: readonly NotedSong[],
  kept: readonly Performance[],
  leftOutTapes: readonly Performance[],
): NotAdded[] {
  const entries: { position: number; playedAfterPosition: boolean; item: NotAdded }[] = [
    ...leftOutTapes.map((tape) => ({
      position: tape.position,
      playedAfterPosition: false,
      item: { name: tape.title, reason: "tape" as const },
    })),
    ...noted.map((song) => ({ position: song.afterPosition, playedAfterPosition: true, item: notAddedOf(song, kept) })),
  ];
  const inPlayedOrder = (a: (typeof entries)[number], b: (typeof entries)[number]) =>
    a.position - b.position || Number(a.playedAfterPosition) - Number(b.playedAfterPosition);
  return entries.sort(inPlayedOrder).map((entry) => entry.item);
}

/** An Unknown Song is shown after the preview number of the last kept Performance played before it. */
function notAddedOf(song: NotedSong, kept: readonly Performance[]): NotAdded {
  if (song.reason === "snippet") return { name: song.rawName, reason: "snippet" };
  const after = kept.filter((performance) => performance.position <= song.afterPosition).length;
  return song.info === undefined ? { reason: "unknown", after } : { reason: "unknown", after, info: song.info };
}

const isMatch = (outcome: MatchOutcome): outcome is Match => outcome.kind === "match";
const isMiss = (outcome: MatchOutcome): outcome is Miss => outcome.kind === "miss";
