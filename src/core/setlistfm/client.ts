// The setlist.fm side of Playset: finding an Artist, a Setlist by its id, and an Artist's Latest Setlist.
// setlist.fm is a free, non-commercial API, so every client spaces its requests (~2 per second).
import { HttpError, createRequester, type FetchLike, type Sleep } from "../http/index.js";
import { toPerformances, type SetlistFmSetlist } from "../performances/index.js";
import { settingsStoreFor, type SettingsStore } from "../settings/index.js";
import { resolveSetlistFmApiKey, type Env } from "./api-key.js";
import {
  ArtistChoiceCancelledError,
  ArtistNotFoundError,
  NoSetlistError,
  SetlistFmRateLimitError,
  SetlistFmRequestError,
  SetlistNotFoundError,
} from "./errors.js";

const API_BASE = "https://api.setlist.fm/rest/1.0";
/** Minimum gap between the starts of two requests of one client (~2 req/s). */
const MIN_REQUEST_GAP_MS = 500;
/** The first request and up to 3 retries on HTTP 429. */
const MAX_ATTEMPTS = 4;
/** The user is asked to choose from at most this many Artists. */
const MAX_CHOOSER_CANDIDATES = 10;
/** The Latest Setlist is looked for on this many pages of the Artist's setlists at most (20 per page). */
const MAX_SETLIST_PAGES = 3;

/** An Artist as found by the setlist.fm Artist search. */
export interface ArtistCandidate {
  name: string;
  mbid: string;
  /** setlist.fm's short description; absent when none is given. */
  disambiguation?: string;
}

/** Asks the user to pick one Artist; resolves to null when they cancel. */
export type ArtistChooser = (candidates: ArtistCandidate[]) => Promise<ArtistCandidate | null>;

export interface SetlistFmClientDeps {
  fetch: FetchLike;
  sleep: Sleep;
  now: () => number;
  /** Defaults to process.env; used only when no `settings` store is given. */
  env?: Env;
  /** Defaults to ~/.config/playset/; used only when no `settings` store is given. */
  configDir?: string;
  /** Where the API key is read from. Defaults to the file store built from `env` and `configDir`. */
  settings?: SettingsStore;
}

export interface SetlistFmClient {
  /** Fetches one Setlist by its setlist.fm id, unchanged. */
  getSetlist(id: string): Promise<SetlistFmSetlist>;
  /** Resolves a typed Artist name, asking the chooser when it is ambiguous. */
  findArtist(name: string, chooser: ArtistChooser): Promise<ArtistCandidate>;
  /** The Artist's Latest Setlist: the newest one with at least one Performance. */
  findLatestSetlist(artist: ArtistCandidate): Promise<SetlistFmSetlist>;
  /**
   * Artist lookup, then Latest Setlist search. With `wantCompleteAlternative`, an Incomplete Setlist as
   * the Latest Setlist also leads to a search for the newest complete Setlist after it, so the user can be
   * offered a Setlist Playlist without gaps.
   */
  findLatestSetlistByArtistName(
    name: string,
    chooser: ArtistChooser,
    options?: LatestSetlistOptions,
  ): Promise<LatestSetlistLookup>;
}

export interface LatestSetlistOptions {
  /** Look for the newest complete Setlist when the Latest Setlist is an Incomplete Setlist. Default: false. */
  wantCompleteAlternative?: boolean;
}

export interface LatestSetlistLookup {
  artist: ArtistCandidate;
  /** The Latest Setlist, complete or not. */
  setlist: SetlistFmSetlist;
  /**
   * The newest complete Setlist after an incomplete Latest Setlist, unchanged as listed on its page;
   * null when none was found, none was wanted, or the Latest Setlist is complete.
   */
  completeAlternative: SetlistFmSetlist | null;
}

interface SearchArtist {
  mbid: string;
  name: string;
  disambiguation?: string;
}

interface ArtistSearchPage {
  artist?: SearchArtist[];
}

interface SetlistsPage {
  page?: number;
  itemsPerPage?: number;
  total?: number;
  setlist?: SetlistFmSetlist[];
}

/** Result of a GET: the parsed body, or "not found" for HTTP 404 (its meaning depends on the caller). */
type GetResult<T> = { found: true; body: T } | { found: false };

export function createSetlistFmClient(deps: SetlistFmClientDeps): SetlistFmClient {
  const settings = settingsStoreFor(deps);
  const knownApiKeys: string[] = [];
  const request = createRequester(
    {
      name: "setlist.fm",
      maxAttempts: MAX_ATTEMPTS,
      minIntervalMs: MIN_REQUEST_GAP_MS,
      secrets: () => knownApiKeys,
      passThroughStatuses: [404],
    },
    { fetch: deps.fetch, sleep: deps.sleep, now: deps.now },
  );

  async function apiKey(): Promise<string> {
    const key = await resolveSetlistFmApiKey({ settings });
    if (!knownApiKeys.includes(key)) knownApiKeys.push(key);
    return key;
  }

  async function get<T>(path: string, params: Record<string, string> = {}): Promise<GetResult<T>> {
    const key = await apiKey();
    const query = new URLSearchParams(params).toString();
    const url = `${API_BASE}${path}${query ? `?${query}` : ""}`;

    let response: Response;
    try {
      response = await request(url, {
        method: "GET",
        headers: { "x-api-key": key, Accept: "application/json", "Accept-Language": "en" },
      });
    } catch (err) {
      throw toSetlistFmError(err, path);
    }
    if (response.status === 404) return { found: false };

    try {
      return { found: true, body: (await response.json()) as T };
    } catch {
      throw new SetlistFmRequestError(path, response.status);
    }
  }

  async function getSetlist(id: string): Promise<SetlistFmSetlist> {
    const result = await get<SetlistFmSetlist>(`/setlist/${encodeURIComponent(id)}`);
    if (!result.found) throw new SetlistNotFoundError(id);
    return result.body;
  }

  async function findArtist(name: string, chooser: ArtistChooser): Promise<ArtistCandidate> {
    const typed = name.trim();
    if (typed === "") throw new ArtistNotFoundError(name);

    const result = await get<ArtistSearchPage>("/search/artists", { artistName: typed, sort: "relevance", p: "1" });
    const found = result.found ? (result.body.artist ?? []) : [];
    if (found.length === 0) throw new ArtistNotFoundError(typed);

    const candidates = found.map(toArtistCandidate);
    const exact = candidates.filter((c) => artistNamesMatch(typed, c.name));
    if (exact.length === 1) return exact[0]!;

    const picked = await chooser(candidates.slice(0, MAX_CHOOSER_CANDIDATES));
    if (picked === null) throw new ArtistChoiceCancelledError();
    return picked;
  }

  async function findLatestSetlist(artist: ArtistCandidate): Promise<SetlistFmSetlist> {
    return (await findSetlists(artist, false)).setlist;
  }

  /** One page of the Artist's setlists, newest first; null when setlist.fm has no such page (HTTP 404). */
  async function fetchSetlistsPage(artist: ArtistCandidate, page: number): Promise<SetlistsPage | null> {
    const result = await get<SetlistsPage>(`/artist/${encodeURIComponent(artist.mbid)}/setlists`, {
      p: String(page),
    });
    return result.found ? result.body : null;
  }

  /**
   * Reads the Artist's setlists page by page until the pick is settled. A next page is read only when the
   * previous one had setlists and was not the last, and never past MAX_SETLIST_PAGES: an Artist whose
   * recent setlists are all empty placeholders has no Latest Setlist.
   */
  async function findSetlists(
    artist: ArtistCandidate,
    wantCompleteAlternative: boolean,
  ): Promise<Omit<LatestSetlistLookup, "artist">> {
    const seen: SetlistFmSetlist[] = [];
    let pick = pickSetlists(seen, wantCompleteAlternative);
    for (let page = 1; page <= MAX_SETLIST_PAGES && !pick.settled; page++) {
      const body = await fetchSetlistsPage(artist, page);
      if (body === null) break;
      const setlists = body.setlist ?? [];
      seen.push(...setlists);
      pick = pickSetlists(seen, wantCompleteAlternative);
      if (setlists.length === 0 || isLastPage(body, page)) break;
    }
    if (pick.latest === null) throw new NoSetlistError(artist.name);
    return { setlist: pick.latest, completeAlternative: pick.completeAlternative };
  }

  async function findLatestSetlistByArtistName(
    name: string,
    chooser: ArtistChooser,
    options: LatestSetlistOptions = {},
  ): Promise<LatestSetlistLookup> {
    const artist = await findArtist(name, chooser);
    const found = await findSetlists(artist, options.wantCompleteAlternative === true);
    return { artist, ...found };
  }

  return { getSetlist, findArtist, findLatestSetlist, findLatestSetlistByArtistName };
}

/** What the setlists seen so far, newest first, say about the Artist's Latest Setlist. */
interface SetlistPick {
  /** The first setlist with at least one Performance; null when there is none yet. */
  latest: SetlistFmSetlist | null;
  /** The first complete Setlist after an incomplete Latest Setlist, when one is wanted and seen. */
  completeAlternative: SetlistFmSetlist | null;
  /** True when no later setlist can change the pick. */
  settled: boolean;
}

/**
 * Picks the Latest Setlist (skipping empty placeholders) and, when wanted and the Latest Setlist is an
 * Incomplete Setlist, the newest complete Setlist after it, from the setlists seen so far.
 */
function pickSetlists(seen: readonly SetlistFmSetlist[], wantCompleteAlternative: boolean): SetlistPick {
  let latest: SetlistFmSetlist | null = null;
  for (const setlist of seen) {
    const { performances, incompleteStatus } = toPerformances(setlist);
    if (performances.length === 0) continue;
    if (latest === null) {
      latest = setlist;
      if (!wantCompleteAlternative || !incompleteStatus.isIncomplete) {
        return { latest, completeAlternative: null, settled: true };
      }
    } else if (!incompleteStatus.isIncomplete) {
      return { latest, completeAlternative: setlist, settled: true };
    }
  }
  return { latest, completeAlternative: null, settled: false };
}

/**
 * True when two Artist names are an exact match after normalisation: case folded, accents removed,
 * `&` and `+` read as ` and `, whitespace trimmed and collapsed. Other punctuation still counts, so a
 * typed name only skips the Artist choice when it really names that Artist.
 */
export function artistNamesMatch(a: string, b: string): boolean {
  return normaliseArtistName(a) === normaliseArtistName(b);
}

function normaliseArtistName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[&+]/g, " and ")
    .replace(/\s+/g, " ")
    .trim();
}

function toSetlistFmError(err: unknown, path: string): unknown {
  if (!(err instanceof HttpError)) return err;
  if (err.kind === "rate-limited") return new SetlistFmRateLimitError(MAX_ATTEMPTS, { cause: err });
  return new SetlistFmRequestError(path, err.status, { cause: err });
}

function toArtistCandidate(a: SearchArtist): ArtistCandidate {
  const candidate: ArtistCandidate = { name: a.name, mbid: a.mbid };
  if (a.disambiguation) candidate.disambiguation = a.disambiguation;
  return candidate;
}

function isLastPage(body: SetlistsPage, requestedPage: number): boolean {
  const { itemsPerPage, total } = body;
  if (itemsPerPage === undefined || total === undefined) return false;
  return (body.page ?? requestedPage) * itemsPerPage >= total;
}
