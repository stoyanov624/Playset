import type { Match, MatchOutcome, Miss } from "../matching/index.js";
import {
  toPerformances,
  type NotedSong,
  type Performance,
  type PerformancesResult,
  type SetlistFmSetlist,
} from "../performances/index.js";
import { looksLikeSetlistFmLink, readSetlistId } from "../setlist-link/index.js";
import { setlistPlaylistDescription, setlistPlaylistName } from "../setlist-playlist/index.js";
import type {
  NotAdded,
  Preview,
  PreviewRow,
  RunFrontEnd,
  RunOptions,
  RunOutcome,
  RunRequest,
  ShowSummary,
} from "./types.js";

/**
 * One whole run: Setlist → Show → (offer of an older complete Setlist) → Tape decisions → Spotify login →
 * Matches → preview → confirmation → Setlist Playlist. Every question and service comes from the caller. Errors are passed on unchanged.
 */
export async function runPlayset({ input, options, frontEnd, services }: RunRequest): Promise<RunOutcome> {
  const chooseArtist = frontEnd.chooseArtist.bind(frontEnd);
  const { setlist, completeAlternative } = await fetchSetlist(input, options, services, chooseArtist);
  const latest = toPerformances(setlist);
  frontEnd.showShow(showSummaryOf(latest));

  const inUse = await setlistInUse(latest, completeAlternative, frontEnd);
  const { show, performances, noted, incompleteStatus } = inUse;
  // Fails early (before any Tape question or Spotify request) when the description would be too long.
  setlistPlaylistDescription(show);
  if (performances.length === 0) return { kind: "no-performances" };

  const kept: Performance[] = [];
  const leftOutTapes: Performance[] = [];
  for (const performance of performances) {
    if (!performance.isTape || (await keepTape(performance, options, frontEnd.askTape.bind(frontEnd)))) {
      kept.push(performance);
    } else {
      leftOutTapes.push(performance);
    }
  }
  if (kept.length === 0) return { kind: "nothing-to-add" };

  const accessToken = await services.getAccessToken({
    openAuthorizeUrl: (url) => frontEnd.showAuthorizeUrl(url),
  });

  const rows: PreviewRow[] = [];
  for (const [index, performance] of kept.entries()) {
    frontEnd.showProgress({ n: index + 1, total: kept.length, performance });
    const outcome = await services.findMatch(performance, accessToken);
    rows.push({ number: index + 1, performance, outcome });
  }

  const outcomes = rows.map((row) => row.outcome);
  const matches = outcomes.filter(isMatch);
  const misses = outcomes.filter(isMiss);
  if (matches.length === 0) return { kind: "all-misses", misses };

  const playlistName = setlistPlaylistName(show);
  const duplicates = await services.findPlaylistsNamed(playlistName, accessToken);
  const preview: Preview = {
    rows,
    notAdded: notAddedInPlayedOrder(noted, kept, leftOutTapes),
    playlistName,
    public: options.public,
    trackCount: matches.length,
    missCount: misses.length,
    duplicates,
    incompleteStatus,
  };
  frontEnd.showPreview(preview);

  if (options.dryRun) return { kind: "dry-run", preview, misses, incompleteStatus };
  if (options.confirm === "ask" && !(await frontEnd.confirmCreate(preview))) {
    return { kind: "declined", preview, misses };
  }

  const playlist = await services.createSetlistPlaylist(show, matches, { accessToken, public: options.public });
  return { kind: "created", playlist, misses, incompleteStatus };
}

function showSummaryOf({ show, performances, incompleteStatus }: PerformancesResult): ShowSummary {
  return {
    show,
    performanceCount: performances.length,
    tapeCount: performances.filter((p) => p.isTape).length,
    incompleteStatus,
  };
}

/**
 * The Setlist the run builds its Setlist Playlist from: the newest complete Setlist when the Latest Setlist
 * is incomplete and the user accepts the offer (its Show is then reported too), otherwise the fetched one.
 */
async function setlistInUse(
  latest: PerformancesResult,
  completeAlternative: SetlistFmSetlist | null,
  frontEnd: RunFrontEnd,
): Promise<PerformancesResult> {
  if (completeAlternative === null || !latest.incompleteStatus.isIncomplete) return latest;
  const complete = toPerformances(completeAlternative);
  if (!(await frontEnd.askUseCompleteSetlist({ latest: latest.show, complete: complete.show }))) return latest;
  frontEnd.showShow(showSummaryOf(complete));
  return complete;
}

/**
 * A setlist.fm link is fetched by id; anything else is an Artist name for the Latest Setlist search. An
 * older complete Setlist is looked for only when the user can be asked about it (not with confirm "skip").
 */
async function fetchSetlist(
  input: string,
  options: RunOptions,
  services: RunRequest["services"],
  chooseArtist: RunFrontEnd["chooseArtist"],
): Promise<{ setlist: SetlistFmSetlist; completeAlternative: SetlistFmSetlist | null }> {
  const trimmed = input.trim();
  if (trimmed === "" || looksLikeSetlistFmLink(trimmed)) {
    return { setlist: await services.getSetlist(readSetlistId(trimmed)), completeAlternative: null };
  }
  const { setlist, completeAlternative } = await services.findLatestSetlistByArtistName(trimmed, chooseArtist, {
    wantCompleteAlternative: options.confirm !== "skip",
  });
  return { setlist, completeAlternative: completeAlternative ?? null };
}

async function keepTape(
  tape: Performance,
  options: RunOptions,
  askTape: RunRequest["frontEnd"]["askTape"],
): Promise<boolean> {
  if (options.tapes === "all") return true;
  if (options.tapes === "none") return false;
  return askTape(tape);
}

/**
 * Noted songs and left-out Tapes merged in played order (a noted song follows the Performance before it).
 * An Unknown Song is placed after the preview number of the last kept Performance played before it.
 */
function notAddedInPlayedOrder(
  noted: readonly NotedSong[],
  kept: readonly Performance[],
  leftOutTapes: readonly Performance[],
): NotAdded[] {
  const entries: { order: number; item: NotAdded }[] = [
    ...leftOutTapes.map((tape) => ({ order: tape.position, item: { name: tape.title, reason: "tape" as const } })),
    ...noted.map((song) => ({ order: song.afterPosition + 0.5, item: notAddedOf(song, kept) })),
  ];
  return entries.sort((a, b) => a.order - b.order).map((entry) => entry.item);
}

function notAddedOf(song: NotedSong, kept: readonly Performance[]): NotAdded {
  if (song.reason === "snippet") return { name: song.rawName, reason: "snippet" };
  const after = kept.filter((performance) => performance.position <= song.afterPosition).length;
  return song.info === undefined ? { reason: "unknown", after } : { reason: "unknown", after, info: song.info };
}

const isMatch = (outcome: MatchOutcome): outcome is Match => outcome.kind === "match";
const isMiss = (outcome: MatchOutcome): outcome is Miss => outcome.kind === "miss";
