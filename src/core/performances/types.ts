/** A song entry inside a Set, as returned by the setlist.fm "get setlist" API. */
export interface SetlistFmSong {
  readonly name?: string;
  readonly info?: string;
  readonly tape?: boolean;
  readonly cover?: { readonly mbid?: string; readonly name?: string };
  /** Guest performer. Ignored by Playset. */
  readonly with?: { readonly mbid?: string; readonly name?: string };
}

/** A Set, as returned by the setlist.fm "get setlist" API. */
export interface SetlistFmSet {
  readonly name?: string;
  readonly encore?: number;
  readonly song?: readonly SetlistFmSong[];
}

/** A Setlist, as returned by the setlist.fm "get setlist" API (only the fields Playset reads). */
export interface SetlistFmSetlist {
  readonly id?: string;
  /** Date of the Show in setlist.fm's "dd-MM-yyyy" format. */
  readonly eventDate: string;
  readonly artist: { readonly name: string; readonly mbid?: string };
  readonly venue: {
    readonly name: string;
    readonly city: { readonly name: string; readonly country?: { readonly name?: string } };
  };
  readonly url: string;
  /** The Setlist note: setlist.fm's free-text info about the whole Setlist (not a song's info). */
  readonly info?: string;
  readonly sets?: { readonly set?: readonly SetlistFmSet[] };
}

/** One slot in a Setlist where a song was played. */
export interface Performance {
  /** 1-based position among Performances, in played order. */
  position: number;
  /** Song title, trimmed. */
  title: string;
  /** The Setlist's Artist. */
  artist: string;
  /** "main", the Set's own name, or "Encore n". */
  setLabel: string;
  isTape: boolean;
  /** Present only for a Cover with a usable Original Artist name. */
  originalArtist?: string;
  /**
   * The medley marker: the medley name (the song's trimmed name) when this Performance is a part
   * of a split medley, or its own title for an info-only medley. Absent otherwise.
   */
  medley?: string;
}

/** A song that was played but does not become a Performance. */
export type NotedSong = NotedSnippet | NotedUnknownSong;

interface NotedSongBase {
  /** The song's name exactly as given by setlist.fm ("" when missing). */
  rawName: string;
  setLabel: string;
  /** Position of the Performance this song was played after (0 if before the first). */
  afterPosition: number;
}

/** A snippet or teaser: only part of a song was played, so it is never added to the Setlist Playlist. */
export interface NotedSnippet extends NotedSongBase {
  reason: "snippet";
}

/** An Unknown Song: a song with a missing, empty or whitespace-only name, so it cannot be searched for. */
export interface NotedUnknownSong extends NotedSongBase {
  reason: "unknown";
  /** The song's info text, trimmed; absent when missing or blank. */
  info?: string;
}

/**
 * Whether a Setlist is an Incomplete Setlist: it has an Unknown Song, or its Setlist note contains one of
 * the incomplete phrases. A complete Setlist is exactly
 * `{ isIncomplete: false, unknownSongCount: 0 }`.
 */
export interface IncompleteStatus {
  isIncomplete: boolean;
  unknownSongCount: number;
  /** The first matching phrase in list order; present only when the Setlist note matches. */
  matchedPhrase?: string;
  /** The Setlist note, trimmed; present only when it matches. */
  setlistNote?: string;
}

/** Details of the Show a Setlist belongs to. */
export interface Show {
  artist: string;
  /** "YYYY-MM-DD". */
  date: string;
  city: string;
  venue: string;
  /** setlist.fm URL of the Setlist (needed for attribution). */
  url: string;
}

export interface PerformancesResult {
  show: Show;
  performances: Performance[];
  noted: NotedSong[];
  incompleteStatus: IncompleteStatus;
}
