import type { Match, MatchOutcome, Miss } from "../matching/index.js";
import type { Performance, SetlistFmSetlist, Show } from "../performances/index.js";
import type { ArtistCandidate, ArtistChooser } from "../setlistfm/index.js";

/** How one run behaves; the CLI fills this from its flags. */
export interface RunOptions {
  /** "ask" about each Tape, keep "all" Tapes, or leave out every Tape ("none"). */
  tapes: "ask" | "all" | "none";
  /** "ask" before creating the Setlist Playlist, or "skip" the question. */
  confirm: "ask" | "skip";
  /** Create the Setlist Playlist as public (private otherwise). */
  public: boolean;
  /** Stop after the preview; never create anything. */
  dryRun: boolean;
}

/** A playlist on Spotify: an existing one with the same name, or the new Setlist Playlist. */
export interface PlaylistLink {
  id: string;
  name: string;
  shareUrl: string;
}

export interface CreatedPlaylist extends PlaylistLink {
  /** Number of Matches added, repeats included. */
  trackCount: number;
}

/** Everything the run needs from setlist.fm and Spotify. Fakes in tests, real adapters in a front-end. */
export interface RunServices {
  getSetlist(setlistId: string): Promise<SetlistFmSetlist>;
  findLatestSetlistByArtistName(
    name: string,
    chooser: ArtistChooser,
  ): Promise<{ artist: ArtistCandidate; setlist: SetlistFmSetlist }>;
  getAccessToken(hooks: { openAuthorizeUrl(url: string): Promise<void> }): Promise<string>;
  findMatch(performance: Performance, accessToken: string): Promise<MatchOutcome>;
  findPlaylistsNamed(name: string, accessToken: string): Promise<PlaylistLink[]>;
  createSetlistPlaylist(
    show: Show,
    matches: Match[],
    options: { accessToken: string; public: boolean },
  ): Promise<CreatedPlaylist>;
}

/** The Show and its counts, given to the front-end before any Tape question. */
export interface ShowSummary {
  show: Show;
  performanceCount: number;
  tapeCount: number;
}

export interface MatchProgress {
  /** 1-based number of the kept Performance about to be matched. */
  n: number;
  total: number;
  performance: Performance;
}

/** Every question the run asks and every report it gives. No terminal assumed. */
export interface RunFrontEnd {
  /** Resolves to null when the user cancels. */
  chooseArtist(candidates: ArtistCandidate[]): Promise<ArtistCandidate | null>;
  /** Whether to keep this Tape. */
  askTape(tape: Performance): Promise<boolean>;
  confirmCreate(preview: Preview): Promise<boolean>;
  /** A full Spotify login is needed: show (and try to open) the authorize URL. */
  showAuthorizeUrl(url: string): Promise<void>;
  showShow(summary: ShowSummary): void;
  showProgress(progress: MatchProgress): void;
  showPreview(preview: Preview): void;
}

export interface PreviewRow {
  /** 1-based number in played order among the kept Performances. */
  number: number;
  performance: Performance;
  outcome: MatchOutcome;
}

/** A song that is not added: a noted snippet or medley, or a Tape that was left out. */
export interface NotAdded {
  name: string;
  reason: "snippet" | "medley" | "tape";
}

/** What will be created, shown before the confirmation. */
export interface Preview {
  rows: PreviewRow[];
  /** In played order. */
  notAdded: NotAdded[];
  playlistName: string;
  public: boolean;
  /** Number of Matches, repeats included. */
  trackCount: number;
  missCount: number;
  /** Playlists that already have the Setlist Playlist name. */
  duplicates: PlaylistLink[];
}

export type RunOutcome =
  | { kind: "created"; playlist: CreatedPlaylist; misses: Miss[] }
  | { kind: "dry-run"; preview: Preview; misses: Miss[] }
  | { kind: "declined"; preview: Preview; misses: Miss[] }
  | { kind: "all-misses"; misses: Miss[] }
  | { kind: "nothing-to-add" }
  | { kind: "no-performances" };

export interface RunRequest {
  /** A setlist.fm link or an Artist name. */
  input: string;
  options: RunOptions;
  frontEnd: RunFrontEnd;
  services: RunServices;
}
