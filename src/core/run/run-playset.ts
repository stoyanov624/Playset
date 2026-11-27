import {
  toPerformances,
  type Performance,
  type PerformancesResult,
  type SetlistFmSetlist,
} from "../performances/index.js";
import { looksLikeSetlistFmLink, readSetlistId } from "../setlist-link/index.js";
import { guardRun } from "./cancellation.js";
import { RunCancelledError, RunInputError } from "./errors.js";
import { createSetlistPlaylist, findLatestSetlist, getSetlist, prepareSetlist, previewMatches } from "./steps.js";
import type {
  Preview,
  RunFrontEnd,
  RunOptions,
  RunOutcome,
  RunRequest,
  RunServices,
  ShowSummary,
} from "./types.js";

/**
 * One whole run: Setlist → Show → (offer of an older complete Setlist) → Tape decisions → Spotify login →
 * Matches → preview → confirmation → Setlist Playlist. Every question and service comes from the caller.
 * Errors are passed on unchanged; a blank or mixed input is a RunInputError, a cancelled run a RunCancelledError.
 */
export async function runPlayset({ input, options, frontEnd, services, signal }: RunRequest): Promise<RunOutcome> {
  if (signal?.aborted) throw new RunCancelledError();
  checkInput(input);
  if (signal === undefined) return run(input.trim(), options, frontEnd, services, undefined);

  const guard = guardRun(signal, frontEnd, services);
  return run(input.trim(), options, guard.frontEnd, guard.services, signal);
}

/** A blank input, or a setlist.fm link together with other words, cannot be used. */
function checkInput(input: string): void {
  const words = input.trim().split(/\s+/);
  if (words[0] === "") throw new RunInputError("Please give a setlist.fm link or an Artist name.");
  if (words.length > 1 && words.some(looksLikeSetlistFmLink)) {
    throw new RunInputError("Give either one setlist.fm link or an Artist name, not both.");
  }
}

async function run(
  input: string,
  options: RunOptions,
  frontEnd: RunFrontEnd,
  services: RunServices,
  signal: AbortSignal | undefined,
): Promise<RunOutcome> {
  const chooseArtist = frontEnd.chooseArtist.bind(frontEnd);
  const { setlist, completeAlternative } = await fetchSetlist(input, options, services, chooseArtist);
  const latest = toPerformances(setlist);
  frontEnd.showShow(showSummaryOf(latest));

  const inUse = await setlistInUse({ setlist, performances: latest }, completeAlternative, frontEnd);
  // Prepared even without Performances, so a description that is too long still fails first.
  const prepared = await prepareSetlist(inUse.setlist, { keepTape: (tape) => keepTape(tape, options, frontEnd) });
  if (inUse.performances.performances.length === 0) return { kind: "no-performances" };
  const { show, keptPerformances, notAdded, incompleteStatus } = prepared;
  if (keptPerformances.length === 0) return { kind: "nothing-to-add" };

  const accessToken = await services.getAccessToken({
    openAuthorizeUrl: (url) => frontEnd.showAuthorizeUrl(url),
    signal,
  });

  // No signal here: the guarded services already end the run on an abort.
  const { rows, matches, misses, playlistName } = await previewMatches(services, prepared, accessToken, {
    onProgress: (progress) => frontEnd.showProgress(progress),
  });
  if (matches.length === 0) return { kind: "all-misses", misses };

  const duplicates = await services.findPlaylistsNamed(playlistName, accessToken);
  const preview: Preview = {
    rows,
    notAdded,
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

  const playlist = await createSetlistPlaylist(services, show, matches, { accessToken, public: options.public });
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

/** A Setlist together with the Performances the run already read from it for its Show line. */
interface ReadSetlist {
  setlist: SetlistFmSetlist;
  performances: PerformancesResult;
}

/**
 * The Setlist the run builds its Setlist Playlist from: the newest complete Setlist when the Latest Setlist
 * is incomplete and the user accepts the offer (its Show is then reported too), otherwise the fetched one.
 */
async function setlistInUse(
  latest: ReadSetlist,
  completeAlternative: SetlistFmSetlist | null,
  frontEnd: RunFrontEnd,
): Promise<ReadSetlist> {
  if (completeAlternative === null || !latest.performances.incompleteStatus.isIncomplete) return latest;
  const complete = toPerformances(completeAlternative);
  const shows = { latest: latest.performances.show, complete: complete.show };
  if (!(await frontEnd.askUseCompleteSetlist(shows))) return latest;
  frontEnd.showShow(showSummaryOf(complete));
  return { setlist: completeAlternative, performances: complete };
}

/**
 * A setlist.fm link is fetched by id; anything else is an Artist name for the Latest Setlist search. An
 * older complete Setlist is looked for only when the user can be asked about it (not with confirm "skip").
 */
async function fetchSetlist(
  input: string,
  options: RunOptions,
  services: RunServices,
  chooseArtist: RunFrontEnd["chooseArtist"],
): Promise<{ setlist: SetlistFmSetlist; completeAlternative: SetlistFmSetlist | null }> {
  if (looksLikeSetlistFmLink(input)) {
    return { setlist: await getSetlist(services, readSetlistId(input)), completeAlternative: null };
  }
  return findLatestSetlist(services, input, chooseArtist, {
    wantCompleteAlternative: options.confirm !== "skip",
  });
}

/** `--tapes` keeps every Tape and `--no-tapes` none; otherwise the user is asked about each one. */
async function keepTape(tape: Performance, options: RunOptions, frontEnd: RunFrontEnd): Promise<boolean> {
  if (options.tapes === "all") return true;
  if (options.tapes === "none") return false;
  return frontEnd.askTape(tape);
}
