import { toPerformances, type SetlistFmSetlist } from "../performances/index.js";
import { resolveSetlistFmApiKey, type Env } from "./api-key.js";
import { artistNamesMatch } from "./artist-name.js";
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
const MAX_RETRIES_ON_429 = 3;
const DEFAULT_RETRY_AFTER_MS = 1000;
const MAX_CHOOSER_CANDIDATES = 10;
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
  fetch: (input: string, init?: RequestInit) => Promise<Response>;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  env: Env;
  configDir?: string;
}

export interface SetlistFmClient {
  /** Fetches one Setlist by its setlist.fm id, unchanged. */
  getSetlist(id: string): Promise<SetlistFmSetlist>;
  /** Resolves a typed Artist name, asking the chooser when it is ambiguous. */
  findArtist(name: string, chooser: ArtistChooser): Promise<ArtistCandidate>;
  /** The Artist's Latest Setlist: the newest one with at least one Performance. */
  findLatestSetlist(artist: ArtistCandidate): Promise<SetlistFmSetlist>;
  /**
   * Artist lookup, then Latest Setlist search. With `wantCompleteAlternative`, an incomplete Latest Setlist
   * also leads to a search for the newest complete Setlist after it (PRD 0011 AC-7 to AC-9).
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
  let lastRequestStart: number | undefined;

  async function waitForTurn(): Promise<void> {
    if (lastRequestStart !== undefined) {
      const wait = Math.max(0, lastRequestStart + MIN_REQUEST_GAP_MS - deps.now());
      if (wait > 0) await deps.sleep(wait);
    }
    lastRequestStart = deps.now();
  }

  async function apiKey(): Promise<string> {
    return resolveSetlistFmApiKey({
      env: deps.env,
      ...(deps.configDir === undefined ? {} : { configDir: deps.configDir }),
    });
  }

  async function get<T>(path: string, params: Record<string, string> = {}): Promise<GetResult<T>> {
    const key = await apiKey();
    const query = new URLSearchParams(params).toString();
    const url = `${API_BASE}${path}${query ? `?${query}` : ""}`;
    const init: RequestInit = {
      method: "GET",
      headers: { "x-api-key": key, Accept: "application/json", "Accept-Language": "en" },
    };

    for (let attempt = 0; ; attempt++) {
      await waitForTurn();
      let response: Response;
      try {
        response = await deps.fetch(url, init);
      } catch {
        throw new SetlistFmRequestError(path);
      }

      if (response.status === 429) {
        if (attempt >= MAX_RETRIES_ON_429) throw new SetlistFmRateLimitError(attempt + 1);
        const delay = retryAfterMs(response.headers.get("Retry-After"));
        if (delay > 0) await deps.sleep(delay);
        continue;
      }
      if (response.status === 404) return { found: false };
      if (!response.ok) throw new SetlistFmRequestError(path, response.status);

      try {
        return { found: true, body: (await response.json()) as T };
      } catch {
        throw new SetlistFmRequestError(path, response.status);
      }
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
    return (await scanSetlists(artist, false)).setlist;
  }

  /**
   * Walks the Artist's setlists in setlist.fm's order, page by page (PRD 0005 AC-19: a next page only when
   * the previous one had setlists and was not the last, never past page 3). The first setlist with a
   * Performance is the Latest Setlist. When an alternative is wanted and the Latest Setlist is incomplete,
   * the walk goes on to the first complete Setlist. A 404 page ends the walk like an empty page.
   */
  async function scanSetlists(
    artist: ArtistCandidate,
    wantCompleteAlternative: boolean,
  ): Promise<{ setlist: SetlistFmSetlist; completeAlternative: SetlistFmSetlist | null }> {
    let latest: SetlistFmSetlist | undefined;
    for (let page = 1; page <= MAX_SETLIST_PAGES; page++) {
      const result = await get<SetlistsPage>(`/artist/${encodeURIComponent(artist.mbid)}/setlists`, {
        p: String(page),
      });
      if (!result.found) break;

      const setlists = result.body.setlist ?? [];
      for (const setlist of setlists) {
        const { performances, incompleteStatus } = toPerformances(setlist);
        if (performances.length === 0) continue;
        if (latest === undefined) {
          latest = setlist;
          if (!wantCompleteAlternative || !incompleteStatus.isIncomplete) {
            return { setlist: latest, completeAlternative: null };
          }
        } else if (!incompleteStatus.isIncomplete) {
          return { setlist: latest, completeAlternative: setlist };
        }
      }
      if (setlists.length === 0 || isLastPage(result.body, page)) break;
    }
    if (latest === undefined) throw new NoSetlistError(artist.name);
    return { setlist: latest, completeAlternative: null };
  }

  async function findLatestSetlistByArtistName(
    name: string,
    chooser: ArtistChooser,
    options: LatestSetlistOptions = {},
  ): Promise<LatestSetlistLookup> {
    const artist = await findArtist(name, chooser);
    const found = await scanSetlists(artist, options.wantCompleteAlternative === true);
    return { artist, ...found };
  }

  return { getSetlist, findArtist, findLatestSetlist, findLatestSetlistByArtistName };
}

/** Retry-After in whole seconds → ms; anything else → 1 s. */
function retryAfterMs(header: string | null): number {
  const value = header?.trim() ?? "";
  return /^\d+$/.test(value) ? Number(value) * 1000 : DEFAULT_RETRY_AFTER_MS;
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
