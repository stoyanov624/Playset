// The Setlist page, the Setlist link, the setlist id and the Setlist status (examples X4–X6).
import { describe, expect, it } from "vitest";
import {
  artistSetlistsParamsSchema,
  artistSetlistsQuerySchema,
  artistSetlistsResponseSchema,
  mbidSchema,
  playlistStatusSchema,
  setlistIdSchema,
  setlistLinksQuerySchema,
  setlistLinksResponseSchema,
  setlistParamsSchema,
  setlistResponseSchema,
  setlistSummarySchema,
  showSchema,
} from "../../../src/web/shared/index.js";
import {
  MADRID_URL,
  PEARL_JAM_MBID,
  SHARE_URL,
  changed,
  pearlJamPage,
  portlandStatusAnswer,
} from "./fixtures/contract-values";

// ---------------------------------------------------------------- Setlist page path

describe("Setlist page path parameters", () => {
  it("AC-6: a lower-case mbid parses unchanged", () => {
    expect(artistSetlistsParamsSchema.parse({ mbid: PEARL_JAM_MBID })).toEqual({ mbid: PEARL_JAM_MBID });
    expect(mbidSchema.parse(PEARL_JAM_MBID)).toBe(PEARL_JAM_MBID);
  });

  it("AC-6: an upper-case mbid parses to lower case", () => {
    expect(artistSetlistsParamsSchema.parse({ mbid: "83B9CBE7-9857-49E2-AB8E-B57B01038103" })).toEqual({ mbid: PEARL_JAM_MBID });
    expect(mbidSchema.parse("83B9CBE7-9857-49E2-AB8E-B57B01038103")).toBe(PEARL_JAM_MBID);
  });

  it("AC-6: an mbid of any UUID version parses", () => {
    expect(mbidSchema.parse("8e3fcd7d-bda1-4ca0-b987-b8528d2ee74e")).toBe("8e3fcd7d-bda1-4ca0-b987-b8528d2ee74e");
    expect(mbidSchema.parse("2f4b1c6e-0d3a-1e5b-0c7d-9e0f1a2b3c4d")).toBe("2f4b1c6e-0d3a-1e5b-0c7d-9e0f1a2b3c4d");
  });

  it.each([
    ["too short", "83b9cbe7"],
    ["in braces", "{83b9cbe7-9857-49e2-ab8e-b57b01038103}"],
    ["without hyphens", "83b9cbe7985749e2ab8eb57b01038103"],
    ["with a non-hex digit", "83b9cbe7-9857-49e2-ab8e-b57b0103810g"],
    ["empty", ""],
  ])("AC-6: rejects an mbid %s", (_why, mbid) => {
    expect(artistSetlistsParamsSchema.safeParse({ mbid }).success).toBe(false);
    expect(mbidSchema.safeParse(mbid).success).toBe(false);
  });

  it("AC-6: other path keys are ignored", () => {
    expect(artistSetlistsParamsSchema.parse({ mbid: PEARL_JAM_MBID, extra: "x" })).toEqual({ mbid: PEARL_JAM_MBID });
  });
});

// ---------------------------------------------------------------- Setlist page query

describe("Setlist page query", () => {
  it("AC-7: a missing page parses to 1", () => {
    expect(artistSetlistsQuerySchema.parse({})).toEqual({ page: 1 });
  });

  it.each([
    ["1", 1],
    ["2", 2],
    ["66", 66],
    ["1000", 1000],
  ])("AC-7: page %j parses to %d", (page, parsed) => {
    expect(artistSetlistsQuerySchema.parse({ page })).toEqual({ page: parsed });
  });

  it.each([["0"], ["-1"], ["1.5"], ["01"], ["1e2"], [" 2"], ["abc"], [""], ["1001"], [["1", "2"]]])(
    "AC-7: rejects page %j",
    (page) => {
      expect(artistSetlistsQuerySchema.safeParse({ page }).success).toBe(false);
    },
  );

  it("AC-7: other query keys are ignored and dropped", () => {
    expect(artistSetlistsQuerySchema.parse({ page: "2", _: "1764320000" })).toEqual({ page: 2 });
    expect(artistSetlistsQuerySchema.parse({ sort: "date" })).toEqual({ page: 1 });
  });
});

// ---------------------------------------------------------------- Setlist page answer

describe("Setlist page answer", () => {
  it("AC-8: Pearl Jam page 1 parses unchanged, summaries with and without matchedPhrase and setlistNote", () => {
    expect(artistSetlistsResponseSchema.parse(pearlJamPage())).toEqual(pearlJamPage());
  });

  it("AC-8: an empty last page without the Artist's name parses", () => {
    const page67 = { artist: { mbid: PEARL_JAM_MBID }, setlists: [], hasMore: false };
    expect(artistSetlistsResponseSchema.parse(page67)).toEqual(page67);
  });

  it.each([
    ["a summary with a versionId", changed(pearlJamPage(), (d) => { d.setlists[0].versionId = "g4bd1a2f6"; })],
    ["a summary with a country", changed(pearlJamPage(), (d) => { d.setlists[0].country = "United States"; })],
    ["a date that isn't YYYY-MM-DD", changed(pearlJamPage(), (d) => { d.setlists[0].date = "22-11-2026"; })],
    ["a negative songCount", changed(pearlJamPage(), (d) => { d.setlists[0].songCount = -1; })],
    ["a fractional songCount", changed(pearlJamPage(), (d) => { d.setlists[0].songCount = 2.5; })],
    ["no hasMore", changed(pearlJamPage(), (d) => { delete d.hasMore; })],
    ["an empty Artist name", changed(pearlJamPage(), (d) => { d.artist.name = ""; })],
    ["a null Artist name", changed(pearlJamPage(), (d) => { d.artist.name = null; })],
    ["a negative unknownSongCount", changed(pearlJamPage(), (d) => { d.setlists[0].incompleteStatus.unknownSongCount = -1; })],
    ["an empty matchedPhrase", changed(pearlJamPage(), (d) => { d.setlists[1].incompleteStatus.matchedPhrase = ""; })],
  ])("AC-8: rejects the page with %s", (_why, page) => {
    expect(artistSetlistsResponseSchema.safeParse(page).success).toBe(false);
  });

  it("AC-8: a single Setlist summary parses on its own and rejects a versionId", () => {
    const portland = pearlJamPage().setlists[0];
    expect(setlistSummarySchema.parse(portland)).toEqual(portland);
    expect(setlistSummarySchema.safeParse({ ...portland, versionId: "g4bd1a2f6" }).success).toBe(false);
  });
});

// ---------------------------------------------------------------- Setlist link

describe("Setlist link query and answer", () => {
  it("AC-9: a setlist.fm link parses unchanged", () => {
    expect(setlistLinksQuerySchema.parse({ url: MADRID_URL })).toEqual({ url: MADRID_URL });
  });

  it("AC-9: a link with surrounding whitespace parses trimmed", () => {
    const nirvana = "https://www.setlist.fm/setlist/nirvana/1987/community-world-theater-tacoma-wa-53d60349.html";
    expect(setlistLinksQuerySchema.parse({ url: `  ${nirvana}\n` })).toEqual({ url: nirvana });
  });

  it("AC-9: a link that isn't on setlist.fm still parses (the server rejects it, not the contract)", () => {
    expect(setlistLinksQuerySchema.parse({ url: "https://example.com/x" })).toEqual({ url: "https://example.com/x" });
  });

  it("AC-9: 2048 characters parse (also after trimming), 2049 are rejected", () => {
    const longest = "https://www.setlist.fm/" + "a".repeat(2025);
    expect(longest).toHaveLength(2048);
    expect(setlistLinksQuerySchema.parse({ url: longest })).toEqual({ url: longest });
    expect(setlistLinksQuerySchema.parse({ url: `  ${longest}  ` })).toEqual({ url: longest });
    expect(setlistLinksQuerySchema.safeParse({ url: longest + "a" }).success).toBe(false);
  });

  it.each([
    ["no url", {}],
    ["an empty url", { url: "" }],
    ["a whitespace-only url", { url: "  " }],
    ["two links (a list)", { url: [MADRID_URL, MADRID_URL] }],
  ])("AC-9: rejects a link query with %s", (_why, query) => {
    expect(setlistLinksQuerySchema.safeParse(query).success).toBe(false);
  });

  it("AC-9: other query keys are ignored and dropped", () => {
    expect(setlistLinksQuerySchema.parse({ url: MADRID_URL, utm_source: "share" })).toEqual({ url: MADRID_URL });
  });

  it("AC-9: the link answer { setlistId } parses; an unknown key or a non-hex id is rejected", () => {
    expect(setlistLinksResponseSchema.parse({ setlistId: "73a1b2c5" })).toEqual({ setlistId: "73a1b2c5" });
    expect(setlistLinksResponseSchema.safeParse({ setlistId: "73a1b2c5", url: MADRID_URL }).success).toBe(false);
    expect(setlistLinksResponseSchema.safeParse({ setlistId: "not-hex" }).success).toBe(false);
    expect(setlistLinksResponseSchema.safeParse({}).success).toBe(false);
  });
});

// ---------------------------------------------------------------- setlist id

describe("setlist id", () => {
  it.each([
    ["63a5e2b7", "63a5e2b7"],
    ["53d60349", "53d60349"],
    ["2bf1c8e4", "2bf1c8e4"],
    ["63A5E2B7", "63a5e2b7"],
    ["a", "a"],
    ["f".repeat(32), "f".repeat(32)],
  ])("AC-10: setlist id %j parses to %j", (id, parsed) => {
    expect(setlistIdSchema.parse(id)).toBe(parsed);
    expect(setlistParamsSchema.parse({ id })).toEqual({ id: parsed });
  });

  it.each([[""], ["f".repeat(33)], ["63a5e2bz"], ["63a5e2b7.html"], ["63a5-e2b7"], [" 63a5e2b7"]])(
    "AC-10: rejects setlist id %j",
    (id) => {
      expect(setlistIdSchema.safeParse(id).success).toBe(false);
      expect(setlistParamsSchema.safeParse({ id }).success).toBe(false);
    },
  );

  it("AC-10: the setlist id in answers is lower-cased too (setlistId and a summary's id)", () => {
    expect(setlistLinksResponseSchema.parse({ setlistId: "73A1B2C5" })).toEqual({ setlistId: "73a1b2c5" });
    const portland = pearlJamPage().setlists[0];
    expect(setlistSummarySchema.parse({ ...portland, id: "2BF1C8E4" })).toEqual(portland);
  });

  it("AC-10: a summary's id that isn't a setlist id is rejected", () => {
    const portland = pearlJamPage().setlists[0];
    expect(setlistSummarySchema.safeParse({ ...portland, id: "2bf1c8e4.html" }).success).toBe(false);
  });
});

// ---------------------------------------------------------------- Setlist status

describe("Setlist status answer", () => {
  it("AC-11: Fixture H v1, recorded and current, parses unchanged", () => {
    expect(setlistResponseSchema.parse(portlandStatusAnswer())).toEqual(portlandStatusAnswer());
  });

  it.each([
    [{ status: "none" }],
    [{ status: "outdated", url: SHARE_URL }],
    [{ status: "current", url: SHARE_URL }],
  ])("AC-11: playlist %j parses", (playlist) => {
    const answer = changed(portlandStatusAnswer(), (d) => { d.playlist = playlist; });
    expect(setlistResponseSchema.parse(answer)).toEqual(answer);
    expect(playlistStatusSchema.parse(playlist)).toEqual(playlist);
  });

  it.each([
    ["none with a url", { status: "none", url: SHARE_URL }],
    ["current without a url", { status: "current" }],
    ["outdated without a url", { status: "outdated" }],
    ["a /track/ link", { status: "current", url: "https://open.spotify.com/track/4xGvbS8NnKtwKw5CXGkmA9" }],
    ["a query string", { status: "current", url: `${SHARE_URL}?si=abc` }],
    ["an http:// link", { status: "current", url: "http://open.spotify.com/playlist/5PqRsTuVwXyZaBcDeFgHiJ" }],
    ["another host", { status: "current", url: "https://example.com/playlist/5PqRsTuVwXyZaBcDeFgHiJ" }],
    ["no playlist id after /playlist/", { status: "current", url: "https://open.spotify.com/playlist/" }],
    ["a playlistId key", { status: "current", url: SHARE_URL, playlistId: "5PqRsTuVwXyZaBcDeFgHiJ" }],
    ["another status (created)", { status: "created", url: SHARE_URL }],
    ["the core's kind instead of status", { kind: "current", shareUrl: SHARE_URL }],
  ])("AC-11: rejects playlist with %s", (_why, playlist) => {
    expect(playlistStatusSchema.safeParse(playlist).success).toBe(false);
    const answer = changed(portlandStatusAnswer(), (d) => { d.playlist = playlist; });
    expect(setlistResponseSchema.safeParse(answer).success).toBe(false);
  });

  it("AC-11: a Show link on a setlist.fm subdomain parses", () => {
    const de = "https://de.setlist.fm/setlist/pearl-jam/2026/moda-center-portland-or-2bf1c8e4.html";
    const answer = changed(portlandStatusAnswer(), (d) => { d.show.url = de; });
    expect(setlistResponseSchema.parse(answer)).toEqual(answer);
  });

  it.each([
    ["another host", "https://example.com/setlist/pearl-jam/2026/moda-center-portland-or-2bf1c8e4.html"],
    ["http://", "http://www.setlist.fm/setlist/pearl-jam/2026/moda-center-portland-or-2bf1c8e4.html"],
    ["a host that only ends like setlist.fm", "https://notsetlist.fm/setlist/pearl-jam/2026/x-2bf1c8e4.html"],
  ])("AC-11: rejects a Show link on %s", (_why, url) => {
    const show = { ...portlandStatusAnswer().show, url };
    expect(showSchema.safeParse(show).success).toBe(false);
    const answer = changed(portlandStatusAnswer(), (d) => { d.show.url = url; });
    expect(setlistResponseSchema.safeParse(answer).success).toBe(false);
  });

  it("AC-11: a Show url with whitespace after the host is rejected", () => {
    for (const url of ["https://setlist.fm/ <script>", "https://www.setlist.fm/setlist/a b.html"]) {
      const answer = changed(portlandStatusAnswer(), (d) => { d.show.url = url; });
      expect(setlistResponseSchema.safeParse(answer).success).toBe(false);
    }
    const de = "https://de.setlist.fm/setlist/pearl-jam/2026/moda-center-portland-or-2bf1c8e4.html";
    const valid = changed(portlandStatusAnswer(), (d) => { d.show.url = de; });
    expect(setlistResponseSchema.parse(valid)).toEqual(valid);
  });

  it("AC-11: a Show url with quotes, angle brackets or invisible characters after the host is rejected", () => {
    const unsafe = [
      'https://setlist.fm/"onmouseover=1',
      "https://setlist.fm/x'y",
      "https://setlist.fm/a<b",
      "https://setlist.fm/a>b",
      "https://setlist.fm/x​y", // zero-width space
      "https://setlist.fm/x﻿y", // byte-order mark / zero-width no-break space
    ];
    for (const url of unsafe) {
      const answer = changed(portlandStatusAnswer(), (d) => { d.show.url = url; });
      expect(setlistResponseSchema.safeParse(answer).success, url).toBe(false);
    }
    for (const url of [
      "https://www.setlist.fm/setlist/pearl-jam/2026/moda-center-portland-or-2bf1c8e4.html",
      "https://www.setlist.fm/setlist/a%20b.html?x=1#top",
    ]) {
      const valid = changed(portlandStatusAnswer(), (d) => { d.show.url = url; });
      expect(setlistResponseSchema.parse(valid)).toEqual(valid);
    }
  });

  it("AC-11: a Show url whose host uses a look-alike letter is rejected", () => {
    // U+017F (long s) case-folds to "s", so a fold-then-compare check would accept these as setlist.fm.
    for (const url of ["https://ſetlist.fm/x", "https://www.ſetlist.fm/x", "https://setliſt.fm/x"]) {
      const answer = changed(portlandStatusAnswer(), (d) => { d.show.url = url; });
      expect(setlistResponseSchema.safeParse(answer).success, url).toBe(false);
    }
  });

  it("AC-11: a Show url with a backtick, control or private-use character after the host is rejected", () => {
    const unsafe = [
      "https://setlist.fm/a`b",
      "https://setlist.fm/a\u0000b", // NUL
      "https://setlist.fm/a\u0007b", // bell
      "https://setlist.fm/ab", // private-use
      "https://setlist.fm/aéb", // raw non-ASCII; real setlist.fm links percent-encode it
    ];
    for (const url of unsafe) {
      const answer = changed(portlandStatusAnswer(), (d) => { d.show.url = url; });
      expect(setlistResponseSchema.safeParse(answer).success, JSON.stringify(url)).toBe(false);
    }
    for (const url of [
      "https://www.setlist.fm/setlist/pearl-jam/2026/moda-center-portland-or-2bf1c8e4.html",
      "https://www.setlist.fm/setlist/a%C3%A9b.html?x=1&y=2#top",
      "https://de.setlist.fm/setlist/sigur-ros/2026/x-1a2b3c4d.html",
    ]) {
      const valid = changed(portlandStatusAnswer(), (d) => { d.show.url = url; });
      expect(setlistResponseSchema.parse(valid)).toEqual(valid);
    }
  });

  it("AC-11: rejects a Show without its date or with a date that isn't YYYY-MM-DD", () => {
    expect(setlistResponseSchema.safeParse(changed(portlandStatusAnswer(), (d) => { delete d.show.date; })).success).toBe(false);
    expect(setlistResponseSchema.safeParse(changed(portlandStatusAnswer(), (d) => { d.show.date = "2026/11/22"; })).success).toBe(false);
    expect(setlistResponseSchema.safeParse(changed(portlandStatusAnswer(), (d) => { d.show.artist = ""; })).success).toBe(false);
  });
});
