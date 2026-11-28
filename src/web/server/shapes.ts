// Core results turned into the contract's shapes, field by field, so nothing the contract doesn't
// describe (Spotify URIs, Miss queries, record ids, versions on summaries) ever reaches a Visitor.
// Every answer is checked against its contract schema before it is sent.
import type {
  ArtistCandidates,
  IncompleteStatus as CoreIncompleteStatus,
  MatchPreview,
  NotAdded as CoreNotAdded,
  PreparedSetlist,
  PreviewRow as CorePreviewRow,
  Show as CoreShow,
  SetlistSummaryPage,
} from "../../core/index.js";
import type {
  ArtistSetlistsResponse,
  ArtistsResponse,
  IncompleteStatus,
  NotAdded,
  PreviewMiss,
  PreviewResult,
  PreviewRow,
  Show,
} from "../shared/index.js";

/** A core result the contract rejects: answered as INTERNAL, never sent. */
export class ContractRejectedError extends Error {
  constructor(what: string, cause: unknown) {
    super(`The ${what} doesn't fit the web contract, so it was not sent.`, { cause });
    this.name = "ContractRejectedError";
  }
}

interface Schema<T> {
  safeParse(value: unknown): { success: true; data: T } | { success: false; error: unknown };
}

/** The value as the contract reads it. @throws ContractRejectedError when the contract rejects it. */
export function checked<T>(schema: Schema<T>, what: string, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new ContractRejectedError(what, result.error);
  return result.data;
}

/** Adds `key` only when the value is there, so an absent field is absent, not undefined. */
const optional = <K extends string, V>(key: K, value: V | undefined): Partial<Record<K, V>> =>
  value === undefined ? {} : ({ [key]: value } as Record<K, V>);

export function artistsResponseOf({ candidates }: ArtistCandidates): ArtistsResponse {
  return {
    artists: candidates.map(({ name, mbid, disambiguation }) => ({
      name,
      mbid,
      ...optional("disambiguation", disambiguation),
    })),
  };
}

export function incompleteStatusOf(status: CoreIncompleteStatus): IncompleteStatus {
  return {
    isIncomplete: status.isIncomplete,
    unknownSongCount: status.unknownSongCount,
    ...optional("matchedPhrase", status.matchedPhrase),
    ...optional("setlistNote", status.setlistNote),
  };
}

export function showOf({ artist, date, venue, city, url }: CoreShow): Show {
  return { artist, date, venue, city, url };
}

export function artistSetlistsResponseOf(mbid: string, page: SetlistSummaryPage): ArtistSetlistsResponse {
  return {
    artist: { mbid },
    setlists: page.setlists.map(({ id, date, venue, city, songCount, incompleteStatus }) => ({
      id,
      date,
      venue,
      city,
      songCount,
      incompleteStatus: incompleteStatusOf(incompleteStatus),
    })),
    hasMore: page.hasMore,
  };
}

function previewRowOf({ number, performance, outcome }: CorePreviewRow): PreviewRow {
  return {
    number,
    performance: {
      position: performance.position,
      title: performance.title,
      setLabel: performance.setLabel,
      ...optional("originalArtist", performance.originalArtist),
      ...optional("medley", performance.medley),
    },
    outcome:
      outcome.kind === "match"
        ? { kind: "match", name: outcome.name, artists: outcome.artists, album: outcome.album, live: outcome.live }
        : {
            kind: "miss",
            title: outcome.title,
            artist: outcome.artist,
            ...optional("originalArtist", outcome.originalArtist),
          },
  };
}

function previewMissesOf(rows: readonly CorePreviewRow[]): PreviewMiss[] {
  return rows.flatMap(({ number, outcome }) =>
    outcome.kind === "miss"
      ? [{ number, title: outcome.title, artist: outcome.artist, ...optional("originalArtist", outcome.originalArtist) }]
      : [],
  );
}

function notAddedOf(item: CoreNotAdded): NotAdded {
  return item.reason === "unknown"
    ? { reason: "unknown", after: item.after, ...optional("info", item.info) }
    : { reason: item.reason, name: item.name };
}

/** The preview event: the prepared Setlist and its Matches and Misses, with the version just fetched. */
export function previewResultOf(prepared: PreparedSetlist, preview: MatchPreview, versionId: string): PreviewResult {
  return {
    show: showOf(prepared.show),
    incompleteStatus: incompleteStatusOf(prepared.incompleteStatus),
    rows: preview.rows.map(previewRowOf),
    misses: previewMissesOf(preview.rows),
    notAdded: prepared.notAdded.map(notAddedOf),
    playlistName: preview.playlistName,
    versionId,
  };
}
