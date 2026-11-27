import type { Match, MatchOutcome, Miss } from "../matching/index.js";
import type { IncompleteStatus, Performance, SetlistFmSetlist, Show } from "../performances/index.js";
import type { CreatedSetlistPlaylist, ExistingPlaylist } from "../setlist-playlist/index.js";
import type {
  ArtistCandidate,
  ArtistChooser,
  LatestSetlistLookup,
  LatestSetlistOptions,
} from "../setlistfm/index.js";

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

/** A playlist the user already has with the Setlist Playlist name. */
export type PlaylistLink = ExistingPlaylist;

/** The new Setlist Playlist, with its share link and the number of Matches added. */
export type CreatedPlaylist = CreatedSetlistPlaylist;

/** Everything the run needs from setlist.fm and Spotify. Fakes in tests, real adapters in a front-end. */
export interface RunServices {
  getSetlist(setlistId: string): Promise<SetlistFmSetlist>;
  /** With `wantCompleteAlternative`, also gives the newest complete Setlist after an incomplete Latest Setlist. */
  findLatestSetlistByArtistName(
    name: string,
    chooser: ArtistChooser,
    options?: LatestSetlistOptions,
  ): Promise<LatestSetlistLookup>;
  /** `signal` aborts with the run's signal; a login in progress then stops and frees its callback receiver. */
  getAccessToken(hooks: {
    openAuthorizeUrl(url: string): Promise<void>;
    signal?: AbortSignal | undefined;
  }): Promise<string>;
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
  /** Whether this Setlist is an Incomplete Setlist, and why. */
  incompleteStatus: IncompleteStatus;
}

/**
 * The offer of the newest complete Setlist after an incomplete Latest Setlist: the user decides whether a
 * Setlist Playlist without gaps is worth an older Show.
 */
export interface CompleteSetlistOffer {
  latest: Show;
  complete: Show;
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
  /** Whether to use the newest complete Setlist instead of the incomplete Latest Setlist (default: no). */
  askUseCompleteSetlist(offer: CompleteSetlistOffer): Promise<boolean>;
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

/**
 * A song that is not added: a noted snippet, a Tape (or Tape medley part) that was left out, or an
 * Unknown Song.
 */
export type NotAdded = NotAddedSong | NotAddedUnknownSong;

export interface NotAddedSong {
  name: string;
  reason: "snippet" | "tape";
}

export interface NotAddedUnknownSong {
  reason: "unknown";
  /** Preview number of the last kept Performance played before it; 0 when none (at the start). */
  after: number;
  /** The Unknown Song's info text, trimmed; absent when it has none. */
  info?: string;
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
  /** Whether the Setlist in use is an Incomplete Setlist, and why. */
  incompleteStatus: IncompleteStatus;
}

export type RunOutcome =
  | { kind: "created"; playlist: CreatedPlaylist; misses: Miss[]; incompleteStatus: IncompleteStatus }
  | { kind: "dry-run"; preview: Preview; misses: Miss[]; incompleteStatus: IncompleteStatus }
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
  /**
   * Cancels the run: until the create request is sent, an abort ends it with a RunCancelledError and no
   * further service or front-end call is made. After that, an abort changes nothing.
   */
  signal?: AbortSignal | undefined;
}
