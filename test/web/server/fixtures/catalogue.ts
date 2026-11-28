// The server's error catalogue as a Visitor sees it: status, exact error body and Retry-After.
import { expect } from "vitest";
import { errorBodySchema } from "../../../../src/web/shared/index.js";

export interface CatalogueEntry {
  status: number;
  code: string;
  message: string;
  hint?: string;
  retryAfter?: number;
}

const entry = (status: number, code: string, message: string, hint?: string, retryAfter?: number): CatalogueEntry => {
  const e: CatalogueEntry = { status, code, message };
  if (hint !== undefined) e.hint = hint;
  if (retryAfter !== undefined) e.retryAfter = retryAfter;
  return e;
};

const TRY_AGAIN = "Try again in a minute.";

export const CATALOGUE = {
  "E-1": entry(400, "INVALID_INPUT", "Type an Artist name to search for.", "Use 1 to 200 characters."),
  "E-2": entry(400, "INVALID_INPUT", "That Artist or page isn't valid.", "Search for the Artist again."),
  "E-3": entry(
    400,
    "INVALID_INPUT",
    "That isn't a setlist.fm Setlist link.",
    "Open the Setlist on setlist.fm and copy the link from the address bar. It ends in .html.",
  ),
  "E-4": entry(400, "INVALID_INPUT", "That Setlist id isn't valid.", "Open the Setlist from a search or a setlist.fm link."),
  "E-5": entry(400, "INVALID_INPUT", "That request isn't valid.", "Load the preview again, then press Create."),
  "E-6": entry(413, "INVALID_INPUT", "That request is too large."),
  "E-7": entry(
    400,
    "INVALID_INPUT",
    "None of the songs were found on Spotify, so there's nothing to put in a playlist.",
    "Pick another Show.",
  ),
  "E-8": entry(
    400,
    "INVALID_INPUT",
    "Playset can't make a playlist for this Setlist.",
    "Its setlist.fm link is too long for a Spotify playlist description.",
  ),
  "E-9": entry(404, "NOT_FOUND", "setlist.fm has no Setlist with that id.", "Check the link, or search for the Artist instead."),
  "E-10": entry(404, "NOT_FOUND", "There's nothing here."),
  "E-11": entry(
    429,
    "RATE_LIMITED",
    "Too many previews from here in the last hour.",
    "Wait a little, then try again. Setlists that already have a preview stay free.",
  ),
  "E-12": entry(429, "RATE_LIMITED", "Too many playlists from here in the last hour.", "Wait a little, then try again."),
  "E-13": entry(
    429,
    "RATE_LIMITED",
    "Playset has made as many playlists as it can today.",
    "Try again tomorrow. Playlists that already exist still open.",
  ),
  "E-14": entry(429, "RATE_LIMITED", "setlist.fm is busy right now.", TRY_AGAIN, 60),
  "E-15": entry(429, "RATE_LIMITED", "Spotify is busy right now.", TRY_AGAIN, 60),
  "E-16": entry(502, "UPSTREAM_UNAVAILABLE", "setlist.fm isn't answering right now.", TRY_AGAIN),
  "E-17": entry(502, "UPSTREAM_UNAVAILABLE", "Spotify isn't answering right now.", TRY_AGAIN),
  "E-18": entry(
    502,
    "UPSTREAM_UNAVAILABLE",
    "Spotify stopped answering while the playlist was being filled.",
    "Try again in a minute. The same playlist will be filled.",
  ),
  "E-19": entry(
    502,
    "UPSTREAM_UNAVAILABLE",
    "Spotify stopped answering while the playlist was being updated.",
    "Try again in a minute. The same playlist will be updated.",
  ),
  "E-20": entry(
    502,
    "UPSTREAM_UNAVAILABLE",
    "setlist.fm didn't send everything Playset needs for this Setlist.",
    "Try again in a few minutes.",
  ),
  "E-21": entry(429, "RATE_LIMITED", "A music service Playset uses is busy right now.", TRY_AGAIN, 60),
  "E-22": entry(502, "UPSTREAM_UNAVAILABLE", "A music service Playset uses isn't answering right now.", TRY_AGAIN),
  "E-23": entry(
    503,
    "PLAYLISTS_UNAVAILABLE",
    "Making playlists is unavailable right now.",
    "You can still search and open playlists that already exist. Try again later.",
  ),
  "E-24": entry(
    409,
    "SETLIST_CHANGED",
    "This Setlist was changed on setlist.fm after your preview.",
    "Load the fresh preview, then press Create again.",
  ),
  "E-25": entry(500, "INTERNAL", "Something went wrong on our side.", "Please try again in a minute."),
} as const;

export type CatalogueId = keyof typeof CATALOGUE;

/** The bare error (`{ code, message, hint? }`), as in an error event. */
export function bareError(id: CatalogueId): Record<string, string> {
  const e: CatalogueEntry = CATALOGUE[id];
  const bare: Record<string, string> = { code: e.code, message: e.message };
  if (e.hint !== undefined) bare.hint = e.hint;
  return bare;
}

interface ErrorResponse {
  status: number;
  body: unknown;
  headers: Record<string, string | string[] | undefined>;
}

/**
 * The answer is catalogue entry `id`: its status, a JSON body of exactly `{ error: { code, message, hint? } }`
 * (checked against the contract too), and for a 429 the Retry-After (`retryAfter` overrides the entry's).
 */
export function expectCatalogueError(res: ErrorResponse, id: CatalogueId, retryAfter?: number) {
  const e: CatalogueEntry = CATALOGUE[id];
  expect(res.status).toBe(e.status);
  expect(String(res.headers["content-type"])).toMatch(/^application\/json/);
  expect(res.body).toStrictEqual({ error: bareError(id) });
  expect(errorBodySchema.safeParse(res.body).success).toBe(true);
  const wait = retryAfter ?? e.retryAfter;
  if (e.status === 429) {
    expect(wait).not.toBeUndefined();
    expect(res.headers["retry-after"]).toBe(String(wait));
  } else {
    expect(res.headers["retry-after"]).toBeUndefined();
  }
}
