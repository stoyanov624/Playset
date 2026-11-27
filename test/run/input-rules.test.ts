// The run's input rules, moved from the CLI into the core so every front-end gets them:
// a blank input, or a setlist.fm link mixed with other words, is rejected by runPlayset itself
// with a RunInputError, before any service or front-end method is called.
import { describe, expect, it } from "vitest";
import {
  PlaysetError,
  RunInputError,
  SetlistLinkError,
  runPlayset,
} from "../../src/core/index.js";
import type { RunOptions } from "../../src/core/run/index.js";
import { makeFakeFrontEnd, makeFakeServices } from "./fixtures/fake-services";
import { FIXTURE_A_SETLIST_ID, FIXTURE_A_URL } from "./fixtures/setlists";
import { notASetlistPageLink, missingIdLink } from "./fixtures/typed-errors";
import { captureError, makeCallRecorder } from "./fixtures/call-recorder";

const OPTIONS: RunOptions = { tapes: "none", confirm: "skip", public: false, dryRun: false };

const BLANK_MESSAGE = "Please give a setlist.fm link or an Artist name.";
const BOTH_MESSAGE = "Give either one setlist.fm link or an Artist name, not both.";

function setup(input: string) {
  const recorder = makeCallRecorder();
  const fake = makeFakeServices();
  const ui = makeFakeFrontEnd();
  const run = () =>
    runPlayset({
      input,
      options: OPTIONS,
      frontEnd: recorder.wrapFrontEnd(ui.frontEnd),
      services: recorder.wrapServices(fake.services),
    });
  return { run, recorder, calls: fake.calls };
}

describe("run input rules — a blank input", () => {
  for (const [label, input] of [
    ["an empty input", ""],
    ["only spaces", "     "],
    ["only tabs and newlines", "\t \n\t"],
  ] as const) {
    it(`rejects ${label} with a RunInputError asking for a setlist.fm link or an Artist name`, async () => {
      const t = setup(input);
      const err = await captureError(t.run());
      expect(err).toBeInstanceOf(RunInputError);
      expect(err).toBeInstanceOf(PlaysetError);
      expect((err as Error).message).toBe(BLANK_MESSAGE);
    });

    it(`calls no service and no front-end method for ${label}`, async () => {
      const t = setup(input);
      await captureError(t.run());
      expect(t.recorder.calls).toEqual([]);
    });
  }
});

describe("run input rules — a setlist.fm link together with other words", () => {
  for (const [label, input] of [
    ["a link followed by an Artist name", `${FIXTURE_A_URL} Radiohead`],
    ["an Artist name followed by a link", `Radiohead ${FIXTURE_A_URL}`],
    ["two links", `${FIXTURE_A_URL} ${FIXTURE_A_URL}`],
    ["a link between words, with extra spaces", `Arctic   ${FIXTURE_A_URL}   Monkeys`],
    ["a rejected setlist.fm link next to a word", `${notASetlistPageLink} Radiohead`],
  ] as const) {
    it(`rejects ${label} with a RunInputError saying to give one or the other`, async () => {
      const t = setup(input);
      const err = await captureError(t.run());
      expect(err).toBeInstanceOf(RunInputError);
      expect(err).toBeInstanceOf(PlaysetError);
      expect((err as Error).message).toBe(BOTH_MESSAGE);
    });

    it(`calls no service and no front-end method for ${label}`, async () => {
      const t = setup(input);
      await captureError(t.run());
      expect(t.recorder.calls).toEqual([]);
    });
  }
});

describe("run input rules — what is still accepted or rejected as before", () => {
  for (const link of [notASetlistPageLink, missingIdLink]) {
    it(`a single rejected setlist.fm link still rejects with SetlistLinkError, not RunInputError (${link.slice(-40)})`, async () => {
      const t = setup(link);
      const err = await captureError(t.run());
      expect(err).toBeInstanceOf(SetlistLinkError);
      expect(err).not.toBeInstanceOf(RunInputError);
      expect(t.recorder.calls).toEqual([]);
    });
  }

  it("a single setlist.fm link fetches that Setlist by id", async () => {
    const t = setup(FIXTURE_A_URL);
    await t.run();
    expect(t.calls.getSetlist).toEqual([FIXTURE_A_SETLIST_ID]);
    expect(t.calls.findLatest).toEqual([]);
  });

  it("an Artist name of several words with no link is used for the Artist lookup as typed", async () => {
    const t = setup("Panic! at the Disco");
    await t.run();
    expect(t.calls.findLatest).toEqual(["Panic! at the Disco"]);
  });

  it("an Artist name that mentions setlist.fm without being a link is not rejected as a link plus words", async () => {
    const t = setup("The setlist fm Band");
    await t.run();
    expect(t.calls.findLatest).toEqual(["The setlist fm Band"]);
  });
});
