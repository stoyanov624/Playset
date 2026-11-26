import type { Match, MatchOutcome, Miss } from "../matching/index.js";
import { toPerformances, type NotedSong, type Performance, type SetlistFmSetlist } from "../performances/index.js";
import { looksLikeSetlistFmLink, readSetlistId } from "../setlist-link/index.js";
import { setlistPlaylistDescription, setlistPlaylistName } from "../setlist-playlist/index.js";
import type { NotAdded, Preview, PreviewRow, RunOptions, RunOutcome, RunRequest } from "./types.js";

/**
 * One whole run: Setlist → Show → Tape decisions → Spotify login → Matches → preview → confirmation →
 * Setlist Playlist. Every question and service comes from the caller. Errors are passed on unchanged.
 */
export async function runPlayset({ input, options, frontEnd, services }: RunRequest): Promise<RunOutcome> {
  const setlist = await fetchSetlist(input, services, frontEnd.chooseArtist.bind(frontEnd));
  const { show, performances, noted } = toPerformances(setlist);

  frontEnd.showShow({
    show,
    performanceCount: performances.length,
    tapeCount: performances.filter((p) => p.isTape).length,
  });
  // Fails early (before any question or Spotify request) when the description would be too long.
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
    notAdded: notAddedInPlayedOrder(noted, leftOutTapes),
    playlistName,
    public: options.public,
    trackCount: matches.length,
    missCount: misses.length,
    duplicates,
  };
  frontEnd.showPreview(preview);

  if (options.dryRun) return { kind: "dry-run", preview, misses };
  if (options.confirm === "ask" && !(await frontEnd.confirmCreate(preview))) {
    return { kind: "declined", preview, misses };
  }

  const playlist = await services.createSetlistPlaylist(show, matches, { accessToken, public: options.public });
  return { kind: "created", playlist, misses };
}

/** A setlist.fm link is fetched by id; anything else is an Artist name for the Latest Setlist search. */
async function fetchSetlist(
  input: string,
  services: RunRequest["services"],
  chooseArtist: RunRequest["frontEnd"]["chooseArtist"],
): Promise<SetlistFmSetlist> {
  const trimmed = input.trim();
  if (trimmed === "" || looksLikeSetlistFmLink(trimmed)) {
    return services.getSetlist(readSetlistId(trimmed));
  }
  const { setlist } = await services.findLatestSetlistByArtistName(trimmed, chooseArtist);
  return setlist;
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

/** Noted songs and left-out Tapes merged in played order (a noted song follows the Performance before it). */
function notAddedInPlayedOrder(noted: readonly NotedSong[], leftOutTapes: readonly Performance[]): NotAdded[] {
  const entries = [
    ...leftOutTapes.map((tape) => ({ order: tape.position, item: { name: tape.title, reason: "tape" as const } })),
    ...noted.map((song) => ({ order: song.afterPosition + 0.5, item: { name: song.rawName, reason: song.reason } })),
  ];
  return entries.sort((a, b) => a.order - b.order).map((entry) => entry.item);
}

const isMatch = (outcome: MatchOutcome): outcome is Match => outcome.kind === "match";
const isMiss = (outcome: MatchOutcome): outcome is Miss => outcome.kind === "miss";
