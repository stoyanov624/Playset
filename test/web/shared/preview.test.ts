// The preview stream's progress and preview event data (examples X7).
import { describe, expect, it } from "vitest";
import {
  matchSchema,
  missSchema,
  notAddedSchema,
  previewMissSchema,
  previewPerformanceSchema,
  previewProgressSchema,
  previewResultSchema,
  previewRowSchema,
} from "../../../src/web/shared/index.js";
import { changed, loveBuzzCoverRow, madridPreview, unknownSongsOnlyPreview } from "./fixtures/contract-values";

// ---------------------------------------------------------------- progress

describe("progress event data", () => {
  it.each([
    [{ n: 1, total: 5 }],
    [{ n: 5, total: 5 }],
    [{ n: 1, total: 1 }],
  ])("AC-12: %j parses unchanged", (data) => {
    expect(previewProgressSchema.parse(data)).toEqual(data);
  });

  it.each([
    ["n of 0", { n: 0, total: 5 }],
    ["n above total", { n: 6, total: 5 }],
    ["a fractional n", { n: 1.5, total: 5 }],
    ["a total of 0", { n: 1, total: 0 }],
    ["a fractional total", { n: 1, total: 5.5 }],
    ["a missing total", { n: 1 }],
    ["a performance key", { n: 1, total: 5, performance: { title: "Brianstorm" } }],
  ])("AC-12: rejects progress data with %s", (_why, data) => {
    expect(previewProgressSchema.safeParse(data).success).toBe(false);
  });
});

// ---------------------------------------------------------------- preview

describe("preview event data", () => {
  it("AC-13: the Madrid preview parses unchanged, Brianstorm as two rows and the medley parts marked", () => {
    expect(previewResultSchema.parse(madridPreview())).toEqual(madridPreview());
  });

  it("AC-13: a Cover row with originalArtist parses unchanged", () => {
    expect(previewRowSchema.parse(loveBuzzCoverRow())).toEqual(loveBuzzCoverRow());
    const withCover = changed(madridPreview(), (d) => { d.rows.push(loveBuzzCoverRow()); });
    expect(previewResultSchema.parse(withCover)).toEqual(withCover);
  });

  it("AC-13: an outcome is told apart by kind", () => {
    const match = { kind: "match", name: "Brianstorm", artists: ["Arctic Monkeys"], album: "Favourite Worst Nightmare", live: false };
    const miss = { kind: "miss", title: "505", artist: "Arctic Monkeys" };
    expect(matchSchema.parse(match)).toEqual(match);
    expect(missSchema.parse(miss)).toEqual(miss);
    expect(matchSchema.safeParse(miss).success).toBe(false);
    expect(missSchema.safeParse(match).success).toBe(false);
  });

  it("AC-13: a live Match with several artists and a Miss of a Cover parse", () => {
    const liveMatch = { kind: "match", name: "Love Buzz - Live", artists: ["Nirvana", "Kurt Cobain"], album: "Live at Reading", live: true };
    const coverMiss = { kind: "miss", title: "Molly's Lips", artist: "Nirvana", originalArtist: "The Vaselines" };
    expect(matchSchema.parse(liveMatch)).toEqual(liveMatch);
    expect(missSchema.parse(coverMiss)).toEqual(coverMiss);
  });

  it("AC-13: a Performance parses with and without originalArtist and medley", () => {
    for (const performance of [
      { position: 2, title: "Brianstorm", setLabel: "main" },
      { position: 3, title: "Do I Wanna Know?", setLabel: "main", medley: "Do I Wanna Know? / R U Mine?" },
      { position: 3, title: "Love Buzz", setLabel: "main", originalArtist: "Shocking Blue" },
      { position: 9, title: "Love Buzz", setLabel: "Encore 1", originalArtist: "Shocking Blue", medley: "Love Buzz / Molly's Lips" },
    ]) {
      expect(previewPerformanceSchema.parse(performance)).toEqual(performance);
    }
  });

  it.each([
    ["a Match with a uri", (d: any) => { d.rows[0].outcome.uri = "spotify:track:2JUVKZaRwH8L3h5eKq7EvC"; }],
    ["a Match with an id", (d: any) => { d.rows[0].outcome.id = "2JUVKZaRwH8L3h5eKq7EvC"; }],
    ["a Miss with queries", (d: any) => { d.rows[4].outcome.queries = ['track:"505" artist:"Arctic Monkeys"']; }],
    ["a Performance with artist", (d: any) => { d.rows[0].performance.artist = "Arctic Monkeys"; }],
    ["a Performance with isTape", (d: any) => { d.rows[0].performance.isTape = false; }],
    ["a top-level matches list", (d: any) => { d.matches = []; }],
    ["a Match without artists", (d: any) => { d.rows[0].outcome.artists = []; }],
    ["a Match with an empty artist", (d: any) => { d.rows[0].outcome.artists = [""]; }],
    ["an unknown kind", (d: any) => { d.rows[0].outcome.kind = "found"; }],
    ["no versionId", (d: any) => { delete d.versionId; }],
    ["an empty versionId", (d: any) => { d.versionId = ""; }],
    ["a versionId with whitespace", (d: any) => { d.versionId = "g3e5 f7a91"; }],
    ["a versionId of 65 characters", (d: any) => { d.versionId = "x".repeat(65); }],
    ["an empty playlistName", (d: any) => { d.playlistName = ""; }],
    ["no playlistName", (d: any) => { delete d.playlistName; }],
    ["a null matchedPhrase", (d: any) => { d.incompleteStatus.matchedPhrase = null; }],
    ["a row number of 0", (d: any) => { d.rows[0].number = 0; }],
    ["a Performance position of 0", (d: any) => { d.rows[0].performance.position = 0; }],
    ["an empty setLabel", (d: any) => { d.rows[0].performance.setLabel = ""; }],
    ["an empty medley", (d: any) => { d.rows[1].performance.medley = ""; }],
    ["a null originalArtist", (d: any) => { d.rows[0].performance.originalArtist = null; }],
    ["no rows", (d: any) => { delete d.rows; }],
  ])("AC-13: rejects the Madrid preview with %s", (_why, edit) => {
    expect(previewResultSchema.safeParse(changed(madridPreview(), edit)).success).toBe(false);
  });
});

// ---------------------------------------------------------------- not-added list

describe("preview event not-added list", () => {
  it.each([
    [{ reason: "snippet", name: "Hey Jude" }],
    [{ reason: "tape", name: "Intro" }],
    [{ reason: "unknown", after: 3 }],
    [{ reason: "unknown", after: 0 }],
    [{ reason: "unknown", after: 7, info: "Written as 'Dope Hippie' on the setlist" }],
  ])("AC-14: not-added entry %j parses unchanged", (entry) => {
    expect(notAddedSchema.parse(entry)).toEqual(entry);
  });

  it.each([
    ["an Unknown Song with a name", { reason: "unknown", after: 3, name: "" }],
    ["a snippet without a name", { reason: "snippet" }],
    ["a Tape without a name", { reason: "tape" }],
    ["a snippet with an empty name", { reason: "snippet", name: "" }],
    ["another reason", { reason: "skipped", name: "Intro" }],
    ["a negative after", { reason: "unknown", after: -1 }],
    ["a fractional after", { reason: "unknown", after: 1.5 }],
    ["an empty info", { reason: "unknown", after: 3, info: "" }],
    ["a null info", { reason: "unknown", after: 3, info: null }],
    ["an Unknown Song without after", { reason: "unknown" }],
  ])("AC-14: rejects a not-added entry with %s", (_why, entry) => {
    expect(notAddedSchema.safeParse(entry).success).toBe(false);
    const preview = changed(madridPreview(), (d) => { d.notAdded[2] = entry; });
    expect(previewResultSchema.safeParse(preview).success).toBe(false);
  });
});

// ---------------------------------------------------------------- misses list

describe("preview event misses list", () => {
  it.each([
    [{ number: 5, title: "505", artist: "Arctic Monkeys" }],
    [{ number: 9, title: "Spank Thru", artist: "Nirvana" }],
    [{ number: 4, title: "Molly's Lips", artist: "Nirvana", originalArtist: "The Vaselines" }],
  ])("AC-15: Miss entry %j parses unchanged", (entry) => {
    expect(previewMissSchema.parse(entry)).toEqual(entry);
  });

  it.each([
    ["kind", { number: 5, title: "505", artist: "Arctic Monkeys", kind: "miss" }],
    ["queries", { number: 5, title: "505", artist: "Arctic Monkeys", queries: ['track:"505" artist:"Arctic Monkeys"'] }],
    ["no number", { title: "505", artist: "Arctic Monkeys" }],
    ["an empty title", { number: 5, title: "", artist: "Arctic Monkeys" }],
  ])("AC-15: rejects a Miss entry with %s", (_why, entry) => {
    expect(previewMissSchema.safeParse(entry).success).toBe(false);
    const preview = changed(madridPreview(), (d) => { d.misses[0] = entry; });
    expect(previewResultSchema.safeParse(preview).success).toBe(false);
  });
});

// ---------------------------------------------------------------- no kept Performances

describe("preview with no kept Performances", () => {
  it("AC-16: a preview of only Unknown Songs parses with empty rows and misses", () => {
    expect(previewResultSchema.parse(unknownSongsOnlyPreview())).toEqual(unknownSongsOnlyPreview());
  });

  it("AC-16: a Placeholder Setlist's preview parses with empty rows, misses and not-added list", () => {
    const placeholder = changed(unknownSongsOnlyPreview(), (d) => {
      d.incompleteStatus = { isIncomplete: false, unknownSongCount: 0 };
      d.notAdded = [];
    });
    expect(previewResultSchema.parse(placeholder)).toEqual(placeholder);
  });

  it("AC-16: a preview of only Tapes and snippets parses with empty rows and misses", () => {
    const onlyTapesAndSnippets = changed(unknownSongsOnlyPreview(), (d) => {
      d.incompleteStatus = { isIncomplete: false, unknownSongCount: 0 };
      d.notAdded = [{ reason: "tape", name: "Intro" }, { reason: "snippet", name: "Kashmir" }];
    });
    expect(previewResultSchema.parse(onlyTapesAndSnippets)).toEqual(onlyTapesAndSnippets);
  });
});
