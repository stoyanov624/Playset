import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SetlistLinkError,
  looksLikeSetlistFmLink,
  readSetlistId,
  type SetlistLinkErrorReason,
} from "../../src/core/setlist-link/index.js";

// Example inputs come from the "Examples" tables in docs/prd/0001-setlist-link.md.
const RADIOHEAD_SETLIST_LINK =
  "https://www.setlist.fm/setlist/radiohead/2025/o2-arena-london-england-6bb4a2fe.html";
const RADIOHEAD_SETLIST_ID = "6bb4a2fe";

/** Calls readSetlistId and returns the SetlistLinkError it throws (fails the test otherwise). */
function readSetlistIdError(input: string): SetlistLinkError {
  let thrown: unknown;
  try {
    readSetlistId(input);
  } catch (error) {
    thrown = error;
  }
  expect(thrown, `expected readSetlistId(${JSON.stringify(input)}) to throw`).toBeDefined();
  expect(thrown).toBeInstanceOf(SetlistLinkError);
  return thrown as SetlistLinkError;
}

/** A concert-goer-readable message: non-empty, not just the reason code, no URL-internals jargon. */
function expectReadableMessage(error: SetlistLinkError, reason: SetlistLinkErrorReason): void {
  expect(error).toBeInstanceOf(Error);
  expect(typeof error.message).toBe("string");
  expect(error.message.trim().length).toBeGreaterThan(10);
  expect(error.message.trim()).not.toBe(reason);
  expect(error.message).not.toMatch(/\b(hostname|regex|regexp|undefined|null|TypeError|hexadecimal|pathname)\b/i);
}

describe("readSetlistId: reading the setlist id from a link to a Setlist page", () => {
  it.each([
    [RADIOHEAD_SETLIST_LINK, "6bb4a2fe"],
    ["https://www.setlist.fm/setlist/the-cure/2023/the-forum-inglewood-ca-3bd6c8a4.html", "3bd6c8a4"],
    ["https://www.setlist.fm/setlist/bjork/2007/dour-festival-dour-belgium-7bd6e2c8.html", "7bd6e2c8"],
  ])("AC-1: returns the hex segment before .html of a full https www link (%s)", (setlistLink, setlistId) => {
    expect(readSetlistId(setlistLink)).toBe(setlistId);
  });

  it("AC-2: returns the same setlist id for an http link as for the https form", () => {
    const httpLink = "http://www.setlist.fm/setlist/radiohead/2025/o2-arena-london-england-6bb4a2fe.html";
    expect(readSetlistId(httpLink)).toBe(RADIOHEAD_SETLIST_ID);
    expect(readSetlistId(httpLink)).toBe(readSetlistId(RADIOHEAD_SETLIST_LINK));
  });

  it("AC-3: returns the same setlist id for a setlist.fm host without www. as for the www. form", () => {
    const bareHostLink = "https://setlist.fm/setlist/radiohead/2025/o2-arena-london-england-6bb4a2fe.html";
    expect(readSetlistId(bareHostLink)).toBe(RADIOHEAD_SETLIST_ID);
    expect(readSetlistId(bareHostLink)).toBe(readSetlistId(RADIOHEAD_SETLIST_LINK));
  });

  it.each([
    "https://de.setlist.fm/setlist/radiohead/2025/o2-arena-london-england-6bb4a2fe.html",
    "https://fr.setlist.fm/setlist/radiohead/2025/o2-arena-london-england-6bb4a2fe.html",
  ])("AC-4: returns the same setlist id for a language subdomain link (%s)", (languageLink) => {
    expect(readSetlistId(languageLink)).toBe(RADIOHEAD_SETLIST_ID);
    expect(readSetlistId(languageLink)).toBe(readSetlistId(RADIOHEAD_SETLIST_LINK));
  });

  it.each([
    "www.setlist.fm/setlist/radiohead/2025/o2-arena-london-england-6bb4a2fe.html",
    "setlist.fm/setlist/radiohead/2025/o2-arena-london-england-6bb4a2fe.html",
  ])("AC-5: returns the setlist id for a link with no scheme (%s)", (schemelessLink) => {
    expect(readSetlistId(schemelessLink)).toBe(RADIOHEAD_SETLIST_ID);
  });

  it.each([
    ["spaces around", `   ${RADIOHEAD_SETLIST_LINK}  `],
    ["tab before, newline after", `\t${RADIOHEAD_SETLIST_LINK}\n`],
  ])("AC-6: ignores surrounding whitespace (%s)", (_label, paddedLink) => {
    expect(readSetlistId(paddedLink)).toBe(RADIOHEAD_SETLIST_ID);
  });

  it.each([
    ["query", `${RADIOHEAD_SETLIST_LINK}?utm_source=share&utm_medium=ios`],
    ["hash", `${RADIOHEAD_SETLIST_LINK}#encore`],
    ["query and hash", `${RADIOHEAD_SETLIST_LINK}?ref=app#top`],
  ])("AC-7: ignores a trailing %s", (_label, setlistLink) => {
    expect(readSetlistId(setlistLink)).toBe(RADIOHEAD_SETLIST_ID);
  });

  it.each([
    "HTTPS://WWW.SETLIST.FM/setlist/radiohead/2025/o2-arena-london-england-6bb4a2fe.html",
    "https://Www.SetList.fm/setlist/radiohead/2025/o2-arena-london-england-6bb4a2fe.html",
  ])("AC-8: returns the setlist id when scheme and/or host are upper or mixed case (%s)", (setlistLink) => {
    expect(readSetlistId(setlistLink)).toBe(RADIOHEAD_SETLIST_ID);
  });

  it("AC-9: returns an upper-case setlist id in lower case", () => {
    const upperCaseIdLink = "https://www.setlist.fm/setlist/radiohead/2025/o2-arena-london-england-6BB4A2FE.html";
    expect(readSetlistId(upperCaseIdLink)).toBe("6bb4a2fe");
  });
});

describe("readSetlistId: rejecting unusable input", () => {
  it.each([
    ["empty string", ""],
    ["spaces only", "   "],
    ["newline and tab only", "\n\t"],
  ])("AC-10: rejects %s with reason empty and asks for a setlist.fm link", (_label, input) => {
    const error = readSetlistIdError(input);
    expect(error.reason).toBe("empty");
    expectReadableMessage(error, "empty");
    expect(error.message).toMatch(/setlist\.fm link/i);
  });

  it.each([
    "https://setlist.fm.evil.com/setlist/radiohead/2025/o2-arena-london-england-6bb4a2fe.html",
    "https://evilsetlist.fm/setlist/radiohead/2025/o2-arena-london-england-6bb4a2fe.html",
    "https://setlist.fm@evil.com/setlist/radiohead/2025/o2-arena-london-england-6bb4a2fe.html",
    "https://evil.com/setlist.fm/setlist/radiohead/2025/o2-arena-london-england-6bb4a2fe.html",
    "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M",
    "https://www.songkick.com/concerts/41234567-radiohead-at-o2-arena",
  ])("AC-11: rejects a link that is not on a setlist.fm host with reason not-setlist-fm (%s)", (otherSiteLink) => {
    const error = readSetlistIdError(otherSiteLink);
    expect(error.reason).toBe("not-setlist-fm");
    expectReadableMessage(error, "not-setlist-fm");
    expect(error.message).toMatch(/not a setlist\.fm link/i);
  });

  it.each([
    ["Artist page ending in hex", "https://www.setlist.fm/setlists/radiohead-bd6bd12.html"],
    ["venue page", "https://www.setlist.fm/venue/o2-arena-london-england-6bd6ca6e.html"],
    ["search page", "https://www.setlist.fm/search?query=radiohead"],
    ["home page", "https://www.setlist.fm/"],
    ["host only", "setlist.fm"],
  ])("AC-12: rejects a setlist.fm %s with reason not-a-setlist-page", (_label, notASetlistPageLink) => {
    const error = readSetlistIdError(notASetlistPageLink);
    expect(error.reason).toBe("not-a-setlist-page");
    expectReadableMessage(error, "not-a-setlist-page");
    // Tells the concert-goer to open the Setlist of the Show and copy its link.
    expect(error.message).toMatch(/setlist/i);
    expect(error.message).toMatch(/open/i);
    expect(error.message).toMatch(/copy/i);
  });

  it.each([
    ["last - followed by non-hex word", "https://www.setlist.fm/setlist/radiohead/2025/o2-arena-london-england.html"],
    ["nothing after the last -", "https://www.setlist.fm/setlist/radiohead/2025/o2-arena-london-england-.html"],
    ["non-hex z in the id", "https://www.setlist.fm/setlist/radiohead/2025/o2-arena-london-england-6bb4a2fz.html"],
    ["no - in the last segment", "https://www.setlist.fm/setlist/radiohead/2025/live.html"],
  ])("AC-13: rejects a Setlist page link with %s with reason missing-id", (_label, cutOffLink) => {
    const error = readSetlistIdError(cutOffLink);
    expect(error.reason).toBe("missing-id");
    expectReadableMessage(error, "missing-id");
    expect(error.message).toMatch(/setlist id/i);
    expect(error.message).toMatch(/cut off|incomplete|full link/i);
  });

  it.each(["Radiohead", "Sigur Rós"])(
    "AC-14: rejects an Artist name with reason not-setlist-fm instead of treating it as an Artist (%s)",
    (artistName) => {
      const error = readSetlistIdError(artistName);
      expect(error.reason).toBe("not-setlist-fm");
      expectReadableMessage(error, "not-setlist-fm");
    },
  );

  it("AC-10, AC-11, AC-12, AC-13: each rejection is a SetlistLinkError distinguishable from other failures", () => {
    const reasons = [
      readSetlistIdError("").reason,
      readSetlistIdError("https://evilsetlist.fm/setlist/x/2025/y-6bb4a2fe.html").reason,
      readSetlistIdError("https://www.setlist.fm/").reason,
      readSetlistIdError("https://www.setlist.fm/setlist/radiohead/2025/live.html").reason,
    ];
    expect(reasons).toEqual(["empty", "not-setlist-fm", "not-a-setlist-page", "missing-id"]);

    const error = readSetlistIdError("");
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("SetlistLinkError");
    expect(new TypeError("other failure")).not.toBeInstanceOf(SetlistLinkError);
  });
});

describe("looksLikeSetlistFmLink: telling a link from an Artist name", () => {
  it.each([
    RADIOHEAD_SETLIST_LINK,
    "  setlist.fm/setlist/radiohead/2025/o2-arena-london-england-6bb4a2fe.html ",
    "HTTPS://DE.SETLIST.FM/setlist/radiohead/2025/o2-arena-london-england-6bb4a2fe.html",
    "https://www.setlist.fm/setlists/radiohead-bd6bd12.html",
    "https://www.setlist.fm/search?query=radiohead",
    "https://www.setlist.fm/setlist/radiohead/2025/o2-arena-london-england.html",
  ])("AC-15: answers yes for input on a setlist.fm host, whatever the path (%s)", (setlistFmLink) => {
    expect(looksLikeSetlistFmLink(setlistFmLink)).toBe(true);
  });

  it.each([
    "Radiohead",
    "The Cure",
    "Panic! at the Disco",
    "Sunn O)))",
    "Sigur Rós",
    "AC/DC",
    "R.E.M.",
    "will.i.am",
    "",
    "   ",
    "https://open.spotify.com/artist/4Z8W4fKeB5YxbusRsdQVPb",
    "https://setlist.fm.evil.com/setlist/radiohead/2025/o2-arena-london-england-6bb4a2fe.html",
    "evilsetlist.fm/setlist/radiohead/2025/o2-arena-london-england-6bb4a2fe.html",
    "https://setlist.fm@evil.com/setlist/radiohead/2025/o2-arena-london-england-6bb4a2fe.html",
  ])("AC-16: answers no for an Artist name, blank input or a non-setlist.fm host (%j)", (input) => {
    expect(looksLikeSetlistFmLink(input)).toBe(false);
  });

  it.each(["%%%://///", "http://"])("AC-17: answers no without throwing for malformed input (%j)", (malformed) => {
    expect(() => looksLikeSetlistFmLink(malformed)).not.toThrow();
    expect(looksLikeSetlistFmLink(malformed)).toBe(false);
  });

  it("AC-17: never throws for odd inputs, only answers yes or no", () => {
    const oddInputs = [
      "://",
      "https://[::1",
      "setlist.fm:99999/x",
      "\u0000",
      "http://%zz",
      "https:///setlist.fm",
      "a".repeat(10_000),
      "😀 setlist.fm",
    ];
    for (const input of oddInputs) {
      let answer: unknown;
      expect(() => {
        answer = looksLikeSetlistFmLink(input);
      }, JSON.stringify(input)).not.toThrow();
      expect(typeof answer).toBe("boolean");
    }
  });
});

describe("purity: no network and the same answer every time", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function blockAllNetworkAccess() {
    const blocked = () => {
      throw new Error("network access is not allowed in setlist-link");
    };
    const spies = [
      vi.spyOn(http, "request").mockImplementation(blocked),
      vi.spyOn(http, "get").mockImplementation(blocked),
      vi.spyOn(https, "request").mockImplementation(blocked),
      vi.spyOn(https, "get").mockImplementation(blocked),
      vi.spyOn(net, "connect").mockImplementation(blocked),
      vi.spyOn(net, "createConnection").mockImplementation(blocked),
      vi.spyOn(tls, "connect").mockImplementation(blocked),
    ];
    const fetchSpy = vi.fn(blocked);
    vi.stubGlobal("fetch", fetchSpy);
    return [...spies, fetchSpy];
  }

  it("AC-18: reading the setlist id 3 times with the network blocked gives the same id and makes no request", () => {
    const networkSpies = blockAllNetworkAccess();
    const results = [1, 2, 3].map(() => readSetlistId(RADIOHEAD_SETLIST_LINK));
    expect(results).toEqual([RADIOHEAD_SETLIST_ID, RADIOHEAD_SETLIST_ID, RADIOHEAD_SETLIST_ID]);
    for (const spy of networkSpies) expect(spy).not.toHaveBeenCalled();
  });

  it("AC-18: checking an Artist name 3 times with the network blocked answers no each time and makes no request", () => {
    const networkSpies = blockAllNetworkAccess();
    const answers = [1, 2, 3].map(() => looksLikeSetlistFmLink("Radiohead"));
    expect(answers).toEqual([false, false, false]);
    for (const spy of networkSpies) expect(spy).not.toHaveBeenCalled();
  });

  it("AC-18: a rejection is the same every time for the same input", () => {
    const networkSpies = blockAllNetworkAccess();
    const errors = [1, 2, 3].map(() => readSetlistIdError("https://www.setlist.fm/"));
    expect(errors.map((e) => e.reason)).toEqual(["not-a-setlist-page", "not-a-setlist-page", "not-a-setlist-page"]);
    expect(new Set(errors.map((e) => e.message)).size).toBe(1);
    for (const spy of networkSpies) expect(spy).not.toHaveBeenCalled();
  });
});
