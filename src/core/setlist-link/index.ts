// Reads the setlist id out of a setlist.fm link to a Setlist page, with messages that say how to fix a
// bad link, and tells a setlist.fm link from an Artist name.
// Pure string handling: no network, no Node-only or terminal imports.
import { PlaysetError } from "../http/index.js";

export type SetlistLinkErrorReason = "empty" | "not-setlist-fm" | "not-a-setlist-page" | "missing-id";

/** Why a link cannot be used to find a Setlist; `message` is written for the concert-goer. */
export class SetlistLinkError extends PlaysetError {
  readonly reason: SetlistLinkErrorReason;

  constructor(reason: SetlistLinkErrorReason, message: string) {
    super(message);
    this.reason = reason;
  }
}

/** A setlist.fm link split into its host and path (query and hash dropped). */
interface SetlistFmLink {
  readonly host: string;
  readonly path: string;
}

const SCHEME = /^([a-z][a-z0-9+.-]*):/i;
// `setlist.fm` or any subdomain of it (www., de., fr., ...). No port, no user info.
const SETLIST_FM_HOST = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)*setlist\.fm$/i;
const SETLIST_ID = /^[0-9a-f]+$/i;
const SETLIST_PAGE_SECTION = "setlist";
const PAGE_SUFFIX = ".html";
const SHOWN_INPUT_MAX_LENGTH = 80;

/**
 * Splits trimmed, non-empty input into host and path when it is a link on a setlist.fm host,
 * with or without an `http`/`https` scheme. Returns `undefined` for anything else.
 */
function parseSetlistFmLink(trimmed: string): SetlistFmLink | undefined {
  let rest = trimmed;
  const scheme = SCHEME.exec(trimmed);
  if (scheme) {
    const name = scheme[1]!.toLowerCase();
    if (name !== "http" && name !== "https") return undefined;
    rest = trimmed.slice(scheme[0].length);
    if (!rest.startsWith("//")) return undefined;
    rest = rest.slice(2);
  }

  const hostEnd = rest.search(/[/?#\\]/);
  const host = hostEnd === -1 ? rest : rest.slice(0, hostEnd);
  if (!SETLIST_FM_HOST.test(host)) return undefined;

  const afterHost = hostEnd === -1 ? "" : rest.slice(hostEnd);
  const pathEnd = afterHost.search(/[?#]/);
  const path = pathEnd === -1 ? afterHost : afterHost.slice(0, pathEnd);
  return { host: host.toLowerCase(), path };
}

function showInput(trimmed: string): string {
  return trimmed.length > SHOWN_INPUT_MAX_LENGTH ? `${trimmed.slice(0, SHOWN_INPUT_MAX_LENGTH)}…` : trimmed;
}

/**
 * Returns the lower-case setlist id of a setlist.fm link to a Setlist page.
 * @throws SetlistLinkError with a reason and a message the concert-goer can act on.
 */
export function readSetlistId(input: string): string {
  const trimmed = input.trim();
  if (trimmed === "") {
    throw new SetlistLinkError("empty", "Please give a setlist.fm link or an Artist name.");
  }

  const link = parseSetlistFmLink(trimmed);
  if (!link) {
    throw new SetlistLinkError("not-setlist-fm", `That is not a setlist.fm link: ${showInput(trimmed)}`);
  }

  const segments = link.path.split("/").filter((segment) => segment !== "");
  const lastSegment = segments.at(-1);
  const isSetlistPage =
    segments.length >= 2 &&
    segments[0]!.toLowerCase() === SETLIST_PAGE_SECTION &&
    lastSegment !== undefined &&
    lastSegment.toLowerCase().endsWith(PAGE_SUFFIX);
  if (!isSetlistPage) {
    throw new SetlistLinkError(
      "not-a-setlist-page",
      "That setlist.fm page is not a Setlist. Open the Setlist of the Show on setlist.fm and copy its link.",
    );
  }

  const pageName = lastSegment.slice(0, -PAGE_SUFFIX.length);
  const lastDash = pageName.lastIndexOf("-");
  const setlistId = lastDash === -1 ? "" : pageName.slice(lastDash + 1);
  if (!SETLIST_ID.test(setlistId)) {
    throw new SetlistLinkError(
      "missing-id",
      "That setlist.fm link has no setlist id at the end. It may have been cut off; copy the full link again.",
    );
  }
  return setlistId.toLowerCase();
}

/** Answers whether the input is a link on a setlist.fm host, whatever its path. Never throws. */
export function looksLikeSetlistFmLink(input: string): boolean {
  const trimmed = input.trim();
  return trimmed !== "" && parseSetlistFmLink(trimmed) !== undefined;
}
