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
}

/** Why a song was noted instead of becoming a Performance. */
export type NotedReason = "snippet" | "medley";

/** A song that was played but does not become a Performance. */
export interface NotedSong {
  rawName: string;
  reason: NotedReason;
  setLabel: string;
  /** Position of the Performance this song was played after (0 if before the first). */
  afterPosition: number;
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
}
