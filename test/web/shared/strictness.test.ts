// Answers and events reject unknown keys at every level and null optional fields; query and
// path schemas ignore unknown keys (examples X2, X3, X10).
import { describe, expect, it } from "vitest";
import {
  adminStatusResponseSchema,
  artistSetlistsResponseSchema,
  artistsResponseSchema,
  createPlaylistResponseSchema,
  errorBodySchema,
  previewErrorSchema,
  previewProgressSchema,
  previewResultSchema,
  setlistLinksResponseSchema,
  setlistParamsSchema,
  setlistResponseSchema,
  artistsQuerySchema,
} from "../../../src/web/shared/index.js";
import {
  SHARE_URL,
  adminStatusAnswer,
  changed,
  genesisSearchAnswer,
  loveBuzzCoverRow,
  madridPreview,
  pearlJamPage,
  portlandStatusAnswer,
} from "./fixtures/contract-values";

type SafeParser = { safeParse(value: unknown): { success: boolean } };
type Path = Array<string | number>;

/** The path to every plain object inside `value`, the top level included. */
function objectPaths(value: unknown, path: Path = []): Path[] {
  if (Array.isArray(value)) return value.flatMap((item, i) => objectPaths(item, [...path, i]));
  if (value === null || typeof value !== "object") return [];
  return [path, ...Object.entries(value).flatMap(([key, inner]) => objectPaths(inner, [...path, key]))];
}

function at(value: any, path: Path): any {
  return path.reduce((inner, key) => inner[key], value);
}

/** A Madrid preview where every optional field is present somewhere. */
function previewWithEveryField() {
  return changed(madridPreview(), (d) => {
    d.incompleteStatus = { isIncomplete: true, unknownSongCount: 1, matchedPhrase: "cut short", setlistNote: "Cut short by rain." };
    d.rows.push(loveBuzzCoverRow());
    d.rows.push({
      number: 7, performance: { position: 8, title: "Molly's Lips", setLabel: "main", originalArtist: "The Vaselines" },
      outcome: { kind: "miss", title: "Molly's Lips", artist: "Nirvana", originalArtist: "The Vaselines" },
    });
    d.misses.push({ number: 7, title: "Molly's Lips", artist: "Nirvana", originalArtist: "The Vaselines" });
    d.notAdded.push({ reason: "unknown", after: 7, info: "Written as 'Dope Hippie' on the setlist" });
  });
}

const answersAndEvents: Array<[string, SafeParser, () => unknown]> = [
  ["Artist search answer", artistsResponseSchema, genesisSearchAnswer],
  ["Setlist page answer", artistSetlistsResponseSchema, pearlJamPage],
  ["Setlist link answer", setlistLinksResponseSchema, () => ({ setlistId: "73a1b2c5" })],
  ["Setlist status answer (current playlist)", setlistResponseSchema, portlandStatusAnswer],
  ["Setlist status answer (no playlist)", setlistResponseSchema, () => changed(portlandStatusAnswer(), (d) => { d.playlist = { status: "none" }; })],
  ["Setlist status answer (outdated playlist)", setlistResponseSchema, () => changed(portlandStatusAnswer(), (d) => { d.playlist = { status: "outdated", url: SHARE_URL }; })],
  ["create answer", createPlaylistResponseSchema, () => ({ url: SHARE_URL, status: "created" })],
  ["admin status answer", adminStatusResponseSchema, adminStatusAnswer],
  ["error body", errorBodySchema, () => ({ error: { code: "INTERNAL", message: "Something went wrong on our side.", hint: "Try again." } })],
  ["progress event", previewProgressSchema, () => ({ n: 1, total: 5 })],
  ["preview event", previewResultSchema, previewWithEveryField],
  ["error event", previewErrorSchema, () => ({ code: "INTERNAL", message: "Something went wrong on our side.", hint: "Try again." })],
];

describe("unknown keys in answers and events", () => {
  it.each(answersAndEvents)("AC-24: the %s sample parses before any change", (_name, schema, sample) => {
    expect(schema.safeParse(sample()).success).toBe(true);
  });

  it.each(answersAndEvents)("AC-24: the %s rejects an unknown key on every object, at every level", (_name, schema, sample) => {
    const paths = objectPaths(sample());
    expect(paths.length).toBeGreaterThan(0);
    const accepted: string[] = [];
    for (const path of paths) {
      const value = changed(sample(), (d) => { at(d, path).extra = 1; });
      if (schema.safeParse(value).success) accepted.push(path.join(".") || "(top level)");
    }
    expect(accepted).toEqual([]);
  });

  it("AC-24: X10's named leaks are rejected", () => {
    expect(artistSetlistsResponseSchema.safeParse(changed(pearlJamPage(), (d) => { d.extra = 1; })).success).toBe(false);
    expect(
      artistSetlistsResponseSchema.safeParse(changed(pearlJamPage(), (d) => { d.setlists[0].incompleteStatus.reason = "unknown song"; })).success,
    ).toBe(false);
    expect(setlistResponseSchema.safeParse(changed(portlandStatusAnswer(), (d) => { d.show.country = "United States"; })).success).toBe(false);
  });
});

describe("null optional fields in answers and events", () => {
  it.each([
    ["a candidate's disambiguation", artistsResponseSchema, () => changed(genesisSearchAnswer(), (d) => { d.artists[0].disambiguation = null; })],
    ["the page Artist's name", artistSetlistsResponseSchema, () => changed(pearlJamPage(), (d) => { d.artist.name = null; })],
    ["a summary's matchedPhrase", artistSetlistsResponseSchema, () => changed(pearlJamPage(), (d) => { d.setlists[1].incompleteStatus.matchedPhrase = null; })],
    ["a summary's setlistNote", artistSetlistsResponseSchema, () => changed(pearlJamPage(), (d) => { d.setlists[0].incompleteStatus.setlistNote = null; })],
    ["the none playlist's url", setlistResponseSchema, () => changed(portlandStatusAnswer(), (d) => { d.playlist = { status: "none", url: null }; })],
    ["an error hint", errorBodySchema, () => ({ error: { code: "INTERNAL", message: "x", hint: null } })],
    ["an error event hint", previewErrorSchema, () => ({ code: "INTERNAL", message: "x", hint: null })],
    ["a Performance's originalArtist", previewResultSchema, () => changed(madridPreview(), (d) => { d.rows[0].performance.originalArtist = null; })],
    ["a Performance's medley", previewResultSchema, () => changed(madridPreview(), (d) => { d.rows[0].performance.medley = null; })],
    ["a Miss's originalArtist", previewResultSchema, () => changed(madridPreview(), (d) => { d.rows[4].outcome.originalArtist = null; })],
    ["a Miss entry's originalArtist", previewResultSchema, () => changed(madridPreview(), (d) => { d.misses[0].originalArtist = null; })],
    ["an Unknown Song's info", previewResultSchema, () => changed(madridPreview(), (d) => { d.notAdded[2].info = null; })],
    ["the Host Account's displayName", adminStatusResponseSchema, () => changed(adminStatusAnswer(), (d) => { d.hostAccount.displayName = null; })],
  ])("AC-24: rejects null for %s", (_why, schema: SafeParser, value) => {
    expect(schema.safeParse(value()).success).toBe(false);
  });
});

describe("unknown keys in requests", () => {
  it("AC-24: query and path schemas ignore unknown keys", () => {
    expect(artistsQuerySchema.parse({ name: "Genesis", sort: "relevance" })).toEqual({ name: "Genesis" });
    expect(setlistParamsSchema.parse({ id: "2bf1c8e4", format: "json" })).toEqual({ id: "2bf1c8e4" });
  });
});
