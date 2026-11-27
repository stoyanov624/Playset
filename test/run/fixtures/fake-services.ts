// Fakes for the run (PRD 0007): fake setlist.fm, fake Spotify (token, Match search,
// duplicate check, creation) and a fake front-end that answers every question.
// Nothing here touches a terminal or the network. Every call is appended to one shared
// `events` log so tests can check the order of questions, reports and service calls.
import type {
  ArtistCandidate,
  ArtistChooser,
  Match,
  MatchOutcome,
  Miss,
  Performance,
  SetlistFmSetlist,
  Show,
} from "../../../src/core/index.js";
import type { RunFrontEnd, RunServices } from "../../../src/core/run/index.js";
import { fixtureA } from "./setlists";

export const TOKEN = "BQD-test-token";
export const REFRESH_TOKEN = "AQCr7Yh1...refresh";
export const SETLISTFM_API_KEY = "sfm-test-key-0f3c9a";
export const SPOTIFY_CLIENT_ID = "3f9a0c2e7b4d4e1f8a6b5c4d3e2f1a0b";

/** T1's authorize URL (PRD 0004 shape). */
export const AUTHORIZE_URL =
  "https://accounts.spotify.com/authorize?client_id=3f9a0c2e7b4d4e1f8a6b5c4d3e2f1a0b&response_type=code&redirect_uri=http%3A%2F%2F127.0.0.1%3A8888%2Fcallback&scope=playlist-modify-private+playlist-modify-public+playlist-read-private&state=q8Zr1xV0bT3kLmN9pQ2s&code_challenge_method=S256&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

export const CREATED_PLAYLIST_ID = "7GhIjKlMnOpQrStUvWxYzA";
export const CREATED_SHARE_URL = "https://open.spotify.com/playlist/7GhIjKlMnOpQrStUvWxYzA";

export const DUPLICATE = {
  id: "1AbCdEfGhIjKlMnOpQrStU",
  name: "Arctic Monkeys – 2025-08-23 – Amsterdam",
  shareUrl: "https://open.spotify.com/playlist/1AbCdEfGhIjKlMnOpQrStU",
};

// ---------------------------------------------------------------- Matches (PRD 0003 shape)

export function match(id: string, name: string, artists: string | string[], album: string, live = false): Match {
  return {
    kind: "match",
    uri: `spotify:track:${id}`,
    id,
    name,
    artists: Array.isArray(artists) ? artists : [artists],
    album,
    live,
  } as Match;
}

export type MatchSpec = Match | "miss";

/** Fixture R — Spotify search outcomes for Fixture A, by Performance title. */
export const fixtureR: Record<string, MatchSpec> = {
  "I Want It All": match("1d6ZfnbHbkHb1Gcz6Dcfbl", "I Want It All - Remastered 2011", "Queen", "The Miracle (2011 Remaster)"),
  "Sculptures of Anything Goes": match("4LRPiXqCikLlN15c3yImP7", "Sculptures Of Anything Goes", "Arctic Monkeys", "The Car"),
  Brianstorm: match("2PYNLpcbVSE1hzFg4Ofmd9", "Brianstorm", "Arctic Monkeys", "Favourite Worst Nightmare"),
  "Don't Sit Down 'Cause I've Moved Your Chair": match(
    "6Lq8ZB8b9zJ3oDTTpSPRfV",
    "Don't Sit Down 'Cause I've Moved Your Chair",
    "Arctic Monkeys",
    "Suck It and See",
  ),
  "505": match("2x8evxqUlF0eRabbW2JBJd", "505", "Arctic Monkeys", "Favourite Worst Nightmare"),
  "Mardy Bum": match(
    "0kqA4Fm1Jj6GdW4Ws9bNXa",
    "Mardy Bum",
    "Arctic Monkeys",
    "Whatever People Say I Am, That's What I'm Not",
  ),
  // PRD 0008 P2 — Fixture R extended with the parts of Fixture A's medleys
  "Teddy Picker": match("0BxE4FqsDD1Ot4YuBXwAPp", "Teddy Picker", "Arctic Monkeys", "Favourite Worst Nightmare"),
  "Crying Lightning": match("4nDOavRzjNNwUcCkhnLkBX", "Crying Lightning", "Arctic Monkeys", "Humbug"),
  Cornerstone: match("5bdQGzFFHSKZtIkwfP8BaN", "Cornerstone", "Arctic Monkeys", "Humbug"),
  "I Wanna Be Yours": match("5FVd6KXrgO9B3JPmC8OPst", "I Wanna Be Yours", "Arctic Monkeys", "AM"),
  "Baby, I'm Yours": "miss",
  "R U Mine?": match("2Hp4ZMWJ4D3ACvhzF6S0fM", "R U Mine?", "Arctic Monkeys", "AM"),
  "Mr. Blue Sky": match("2RlgNHKcydI9sayD2Df2xp", "Mr. Blue Sky", "Electric Light Orchestra", "Out of the Blue"),
  // E9
  "Untitled New Song": "miss",
  "Another New Song": "miss",
  // E7
  "Crown of Thorns": match("1aB2cD3eF4gH5iJ6kL7mN8", "Crown of Thorns", "Pearl Jam", "Live on Two Legs", true),
  "Déjà Vu": match("6sVQNUvcVFTXvlk3ec0ngd", "Déjà Vu (feat. Jay-Z)", ["Beyoncé", "JAY-Z"], "B'Day Deluxe Edition"),
};

/**
 * PRD 0010 "P1 revisited" — Spotify search outcomes for Fixture M (Pearl Jam medleys), by
 * Performance title. Only " / " splits, so "Even Flow + Alive" and "Porch + Yellow Ledbetter"
 * are single Performances, and both are Misses; every other title has PRD 0008 P1's Match.
 */
export const fixtureMOutcomes: Record<string, MatchSpec> = {
  "Interstellar Overdrive": match("1o4Bkk7FAfpVCGzk6V6Pqd", "Interstellar Overdrive", "Pink Floyd", "The Piper at the Gates of Dawn"),
  Release: match("4xGvbS8NnKtwKw5CXGkmA9", "Release", "Pearl Jam", "Ten"),
  Daughter: match("6rSFzV1CKBFnZ1EaPvcGSh", "Daughter", "Pearl Jam", "Vs."),
  "W.M.A.": match("0nO8qkPBSuhoN9IzxXK3Gq", "W.M.A.", "Pearl Jam", "Vs."),
  "Even Flow + Alive": "miss",
  Black: match("5Xak5fmy089t0FYmh3VJiY", "Black", "Pearl Jam", "Ten"),
  Jeremy: match("2ChmZaZVGhCSzzCV8Q1g8X", "Jeremy", "Pearl Jam", "Ten"),
  "Love/Hate": "miss",
  "Baba O'Riley": match("3qiyyUfYe7CRYLucrPmulD", "Baba O'Riley", "The Who", "Who's Next"),
  "Won't Get Fooled Again": match("2c8Rv4kUW6SLZqVHG4Kc4d", "Won't Get Fooled Again", "The Who", "Who's Next"),
  "Porch + Yellow Ledbetter": "miss",
};

/** The 9 Match URIs of P1 revisited (kept #1–#4, #6, #7, #9, #10, #11), in played order. */
export const P1_URIS = [
  "spotify:track:1o4Bkk7FAfpVCGzk6V6Pqd",
  "spotify:track:4xGvbS8NnKtwKw5CXGkmA9",
  "spotify:track:6rSFzV1CKBFnZ1EaPvcGSh",
  "spotify:track:0nO8qkPBSuhoN9IzxXK3Gq",
  "spotify:track:5Xak5fmy089t0FYmh3VJiY",
  "spotify:track:2ChmZaZVGhCSzzCV8Q1g8X",
  "spotify:track:3qiyyUfYe7CRYLucrPmulD",
  "spotify:track:2c8Rv4kUW6SLZqVHG4Kc4d",
  "spotify:track:5Xak5fmy089t0FYmh3VJiY",
];

/** E13 — "Baby, I'm Yours" matched through Barbara Lewis instead of a Miss. */
export const fixtureRWithoutMisses: Record<string, MatchSpec> = {
  ...fixtureR,
  "Baby, I'm Yours": match("3Ck5mGvUo8rQ8dYQcL9w1R", "Baby, I'm Yours", "Barbara Lewis", "Baby, I'm Yours"),
};

/** The 12 Match URIs of T1 (PRD 0008 P2), in played order. */
export const T1_URIS = [
  "spotify:track:1d6ZfnbHbkHb1Gcz6Dcfbl",
  "spotify:track:4LRPiXqCikLlN15c3yImP7",
  "spotify:track:2PYNLpcbVSE1hzFg4Ofmd9",
  "spotify:track:6Lq8ZB8b9zJ3oDTTpSPRfV",
  "spotify:track:2x8evxqUlF0eRabbW2JBJd",
  "spotify:track:0kqA4Fm1Jj6GdW4Ws9bNXa",
  "spotify:track:0BxE4FqsDD1Ot4YuBXwAPp",
  "spotify:track:4nDOavRzjNNwUcCkhnLkBX",
  "spotify:track:5bdQGzFFHSKZtIkwfP8BaN",
  "spotify:track:5FVd6KXrgO9B3JPmC8OPst",
  "spotify:track:2x8evxqUlF0eRabbW2JBJd",
  "spotify:track:2Hp4ZMWJ4D3ACvhzF6S0fM",
];

function missFor(performance: Performance): Miss {
  const miss: Record<string, unknown> = {
    kind: "miss",
    title: performance.title,
    artist: performance.artist,
    queries: [],
  };
  if (performance.originalArtist !== undefined) miss.originalArtist = performance.originalArtist;
  return miss as unknown as Miss;
}

/** A unique stand-in Match for a title not in the table (e.g. "Song 17", "Intro"). */
function generatedMatch(performance: Performance): Match {
  const id = `T${String(performance.position).padStart(21, "0")}`;
  return match(id, performance.title, performance.artist, "Some Album");
}

// ---------------------------------------------------------------- fake services

export type ServiceName =
  | "getSetlist"
  | "findLatestSetlistByArtistName"
  | "getAccessToken"
  | "findPlaylistsNamed"
  | "createSetlistPlaylist";

export interface FakeServicesOptions {
  /** The Setlist returned by setlist.fm (by id or as the Latest Setlist). Default: Fixture A. */
  setlist?: SetlistFmSetlist;
  /** When set, the Artist lookup asks the chooser with these candidates (no exact match). */
  candidates?: ArtistCandidate[] | undefined;
  /** Thrown by the Artist lookup when the chooser answers null (PRD 0005 AC-17). */
  choiceCancelledError?: unknown;
  /** Match outcomes by Performance title. Unknown titles get a generated Match. Default: Fixture R. */
  outcomes?: Record<string, MatchSpec>;
  /** Errors thrown by the Match search for the given titles. */
  failMatchOn?: Record<string, unknown>;
  /** A full login is needed: the token getter shows the authorize URL first. */
  fullLogin?: boolean;
  /** The login never finishes (to test Ctrl-C while waiting). */
  loginNeverFinishes?: boolean;
  /** Playlists with the same name found by the duplicate check. */
  duplicates?: { id: string; name: string; shareUrl: string }[];
  /** Errors thrown by a service. */
  fail?: Partial<Record<ServiceName, unknown>>;
  /**
   * PRD 0011 AC-7: the newest complete Setlist the Artist lookup finds after an incomplete
   * Latest Setlist. Returned only when the run asks for an alternative
   * (`{ wantCompleteAlternative: true }`); otherwise the lookup says there is none (AC-8).
   */
  completeAlternative?: SetlistFmSetlist | undefined;
}

export interface RecordedCreate {
  show: Show;
  matches: Match[];
  options: { accessToken: string; public: boolean };
}

export function makeFakeServices(opts: FakeServicesOptions = {}, events: string[] = []) {
  const setlist = opts.setlist ?? fixtureA();
  const outcomes = opts.outcomes ?? fixtureR;
  const calls = {
    getSetlist: [] as string[],
    findLatest: [] as string[],
    /** PRD 0011: the options the run passed to the Artist lookup, one entry per call. */
    findLatestOptions: [] as ({ wantCompleteAlternative?: boolean } | undefined)[],
    chooserAnswers: [] as (ArtistCandidate | null)[],
    getAccessToken: 0,
    findMatch: [] as { performance: Performance; accessToken: string }[],
    findPlaylistsNamed: [] as { name: string; accessToken: string }[],
    create: [] as RecordedCreate[],
  };
  const stats = { inFlightMatches: 0, maxInFlightMatches: 0 };

  const failIfAsked = (name: ServiceName) => {
    const failure = opts.fail?.[name];
    if (failure !== undefined) throw failure;
  };

  const services = {
    async getSetlist(setlistId: string): Promise<SetlistFmSetlist> {
      events.push(`setlistfm:getSetlist:${setlistId}`);
      calls.getSetlist.push(setlistId);
      failIfAsked("getSetlist");
      return structuredClone(setlist);
    },

    async findLatestSetlistByArtistName(
      name: string,
      chooser: ArtistChooser,
      options?: { wantCompleteAlternative?: boolean },
    ) {
      events.push(`setlistfm:findLatest:${name}`);
      calls.findLatest.push(name);
      calls.findLatestOptions.push(options === undefined ? undefined : { ...options });
      let artist: ArtistCandidate = {
        name: (setlist as unknown as { artist: { name: string } }).artist.name,
        mbid: (setlist as unknown as { artist: { mbid: string } }).artist.mbid,
      };
      if (opts.candidates) {
        const picked = await chooser(opts.candidates.map((c) => ({ ...c })));
        calls.chooserAnswers.push(picked ?? null);
        if (picked === null || picked === undefined) {
          throw opts.choiceCancelledError ?? new Error("fake: Artist choice cancelled");
        }
        artist = picked;
        events.push(`setlistfm:setlists:${picked.mbid}`);
      }
      failIfAsked("findLatestSetlistByArtistName");
      const completeAlternative =
        options?.wantCompleteAlternative === true && opts.completeAlternative !== undefined
          ? structuredClone(opts.completeAlternative)
          : null;
      return { artist, setlist: structuredClone(setlist), completeAlternative };
    },

    async getAccessToken(hooks: { openAuthorizeUrl(url: string): Promise<void> | void }): Promise<string> {
      events.push("spotify:getAccessToken");
      calls.getAccessToken++;
      if (opts.fullLogin || opts.loginNeverFinishes) await hooks.openAuthorizeUrl(AUTHORIZE_URL);
      if (opts.loginNeverFinishes) return new Promise<string>(() => {});
      failIfAsked("getAccessToken");
      events.push("spotify:token");
      return TOKEN;
    },

    async findMatch(performance: Performance, accessToken: string): Promise<MatchOutcome> {
      events.push(`spotify:findMatch:${performance.title}`);
      calls.findMatch.push({ performance: { ...performance }, accessToken });
      stats.inFlightMatches++;
      stats.maxInFlightMatches = Math.max(stats.maxInFlightMatches, stats.inFlightMatches);
      try {
        for (let i = 0; i < 3; i++) await Promise.resolve();
        const failure = opts.failMatchOn?.[performance.title];
        if (failure !== undefined) throw failure;
        const spec = outcomes[performance.title];
        if (spec === "miss") return missFor(performance);
        return spec ?? generatedMatch(performance);
      } finally {
        stats.inFlightMatches--;
      }
    },

    async findPlaylistsNamed(name: string, accessToken: string) {
      events.push("spotify:findPlaylistsNamed");
      calls.findPlaylistsNamed.push({ name, accessToken });
      failIfAsked("findPlaylistsNamed");
      return (opts.duplicates ?? []).map((d) => ({ ...d }));
    },

    async createSetlistPlaylist(show: Show, matches: Match[], options: { accessToken: string; public: boolean }) {
      events.push("spotify:createSetlistPlaylist");
      calls.create.push({ show: { ...show }, matches: [...matches], options: { ...options } });
      failIfAsked("createSetlistPlaylist");
      return {
        id: CREATED_PLAYLIST_ID,
        shareUrl: CREATED_SHARE_URL,
        name: `${show.artist} – ${show.date} – ${show.city}`,
        trackCount: matches.length,
      };
    },
  };

  return { services: services as unknown as RunServices, calls, stats, events };
}

/** True when any Spotify service (token, search, duplicate check, create) was called. */
export function spotifyEvents(events: string[]): string[] {
  return events.filter((e) => e.startsWith("spotify:"));
}

// ---------------------------------------------------------------- fake front-end

export type Answer<T> = T | { throws: unknown };

export interface FakeFrontEndOptions {
  /** Index of the candidate to pick, null to cancel, or an error to throw. Default: 0. */
  artistPick?: Answer<number | null>;
  /** Answers to the Tape questions, in order. */
  tapeAnswers?: Answer<boolean>[];
  /** Answer to the final confirmation. Default: true. */
  confirm?: Answer<boolean>;
  /** PRD 0011 AC-11: answer to the offer of the newest complete Setlist. Unset: the question is unexpected. */
  offer?: Answer<boolean>;
}

function answerOrThrow<T>(answer: Answer<T>): T {
  if (answer !== null && typeof answer === "object" && "throws" in (answer as object)) {
    throw (answer as { throws: unknown }).throws;
  }
  return answer as T;
}

export function makeFakeFrontEnd(opts: FakeFrontEndOptions = {}, events: string[] = []) {
  const tapeAnswers = [...(opts.tapeAnswers ?? [])];
  const record = {
    artistQuestions: [] as ArtistCandidate[][],
    tapeQuestions: [] as Performance[],
    authorizeUrls: [] as string[],
    shows: [] as any[],
    progress: [] as any[],
    previews: [] as any[],
    confirmQuestions: [] as any[],
    /** PRD 0011 AC-11: each offer question ({ latest: Show, complete: Show }). */
    offerQuestions: [] as any[],
  };

  const frontEnd = {
    async chooseArtist(candidates: ArtistCandidate[]): Promise<ArtistCandidate | null> {
      events.push("ask:artist");
      record.artistQuestions.push(candidates.map((c) => ({ ...c })));
      const index = answerOrThrow(opts.artistPick === undefined ? 0 : opts.artistPick);
      if (index === null) return null;
      const picked = candidates[index];
      if (!picked) throw new Error(`fake front-end: no candidate at ${index}`);
      return picked;
    },
    async askTape(tape: Performance): Promise<boolean> {
      events.push(`ask:tape:${tape.title}`);
      record.tapeQuestions.push({ ...tape });
      const next = tapeAnswers.shift();
      if (next === undefined) throw new Error(`fake front-end: unexpected Tape question for "${tape.title}"`);
      return answerOrThrow(next);
    },
    async askUseCompleteSetlist(offer: unknown): Promise<boolean> {
      events.push("ask:offer");
      record.offerQuestions.push(offer);
      if (opts.offer === undefined) throw new Error("fake front-end: unexpected offer question");
      return answerOrThrow(opts.offer);
    },
    async confirmCreate(preview: unknown): Promise<boolean> {
      events.push("ask:confirm");
      record.confirmQuestions.push(preview);
      return answerOrThrow(opts.confirm ?? true);
    },
    async showAuthorizeUrl(url: string): Promise<void> {
      events.push("show:authorizeUrl");
      record.authorizeUrls.push(url);
    },
    showShow(summary: unknown): void {
      events.push("show:show");
      record.shows.push(summary);
    },
    showProgress(progress: { n: number; total: number; performance: Performance }): void {
      events.push(`show:progress:${progress.n}/${progress.total}`);
      record.progress.push(progress);
    },
    showPreview(preview: unknown): void {
      events.push("show:preview");
      record.previews.push(preview);
    },
  };

  return { frontEnd: frontEnd as unknown as RunFrontEnd, record, events };
}

/** A Ctrl-C at an @inquirer/prompts question surfaces as an ExitPromptError. */
export class ExitPromptError extends Error {
  override name = "ExitPromptError";
  constructor(message = "User force closed the prompt with SIGINT") {
    super(message);
  }
}
