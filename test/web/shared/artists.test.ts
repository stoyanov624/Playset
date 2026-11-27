// The Artist search query and answer (examples X3).
import { describe, expect, it } from "vitest";
import { artistCandidateSchema, artistsQuerySchema, artistsResponseSchema } from "../../../src/web/shared/index.js";
import { changed, genesisSearchAnswer } from "./fixtures/contract-values";

describe("Artist search query", () => {
  it.each([
    [{ name: "Arctic Monkeys" }, { name: "Arctic Monkeys" }],
    [{ name: "  arctic monkeys  " }, { name: "arctic monkeys" }],
    [{ name: "Sigur Rós", _: "1764320000" }, { name: "Sigur Rós" }],
    [{ name: "Genesis", sort: "relevance" }, { name: "Genesis" }],
    [{ name: "A".repeat(200) }, { name: "A".repeat(200) }],
    [{ name: " " + "A".repeat(200) + " " }, { name: "A".repeat(200) }],
  ])("AC-4: the Artist name query %j parses to %j (trimmed, other keys dropped)", (query, parsed) => {
    expect(artistsQuerySchema.parse(query)).toEqual(parsed);
  });

  it.each([
    ["201 characters", { name: "A".repeat(201) }],
    ["201 characters after trimming", { name: "  " + "A".repeat(201) + "  " }],
    ["no name", {}],
    ["an empty name", { name: "" }],
    ["a whitespace-only name", { name: "   " }],
    ["a name given twice (a list)", { name: ["Genesis", "Pearl Jam"] }],
  ])("AC-4: rejects an Artist name query with %s", (_why, query) => {
    expect(artistsQuerySchema.safeParse(query).success).toBe(false);
  });
});

describe("Artist search answer", () => {
  it("AC-5: the Genesis candidates parse unchanged, in setlist.fm's order", () => {
    expect(artistsResponseSchema.parse(genesisSearchAnswer())).toEqual(genesisSearchAnswer());
  });

  it("AC-5: no results is an empty candidate list", () => {
    expect(artistsResponseSchema.parse({ artists: [] })).toEqual({ artists: [] });
  });

  it("AC-5: 10 candidates parse, 11 are rejected", () => {
    const candidate = { name: "Genesis Owusu", mbid: "4a5b6c7d-8e9f-4a0b-9c1d-2e3f4a5b6c7d" };
    expect(artistsResponseSchema.safeParse({ artists: Array.from({ length: 10 }, () => candidate) }).success).toBe(true);
    expect(artistsResponseSchema.safeParse({ artists: Array.from({ length: 11 }, () => candidate) }).success).toBe(false);
  });

  it.each([
    ["an autoPick key", changed(genesisSearchAnswer(), (d) => { d.autoPick = { name: "Genesis", mbid: "8e3fcd7d-bda1-4ca0-b987-b8528d2ee74e" }; })],
    ["an empty disambiguation", changed(genesisSearchAnswer(), (d) => { d.artists[2].disambiguation = ""; })],
    ["a null disambiguation", changed(genesisSearchAnswer(), (d) => { d.artists[0].disambiguation = null; })],
    ["a candidate mbid that isn't an mbid", changed(genesisSearchAnswer(), (d) => { d.artists[0].mbid = "8e3fcd7d"; })],
    ["a candidate with an empty name", changed(genesisSearchAnswer(), (d) => { d.artists[0].name = ""; })],
    ["a candidate without an mbid", changed(genesisSearchAnswer(), (d) => { delete d.artists[1].mbid; })],
  ])("AC-5: rejects the Genesis answer with %s", (_why, answer) => {
    expect(artistsResponseSchema.safeParse(answer).success).toBe(false);
  });

  it("AC-5: a single candidate needs a non-empty name and an mbid", () => {
    const candidate = { name: "Genesis", mbid: "8e3fcd7d-bda1-4ca0-b987-b8528d2ee74e", disambiguation: "English rock band" };
    expect(artistCandidateSchema.parse(candidate)).toEqual(candidate);
    expect(artistCandidateSchema.safeParse({ name: "Genesis" }).success).toBe(false);
  });
});
