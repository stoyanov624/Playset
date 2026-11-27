// PRD 0012 — the prepare step (AC-11 to AC-14): a Setlist and a keep-Tape decision in; the Show,
// the kept Performances, the not-added list and the incomplete status out. No services, no request.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toPerformances, type Performance, type SetlistFmSetlist } from "../../src/core/performances";
import { DescriptionTooLongError } from "../../src/core/setlist-playlist";
import { prepareSetlist, runPlayset } from "../../src/core/run/index.js";
import { deferred, flush } from "./fixtures/call-recorder";
import { ExitPromptError, makeFakeFrontEnd, makeFakeServices } from "./fixtures/fake-services";
import {
  NIRVANA_KEPT_TITLES,
  nirvanaShow,
  nirvanaTacoma,
  portlandOnlyUnknownSongs,
  portlandShow,
} from "./fixtures/incomplete-setlists";
import {
  FIXTURE_A_URL,
  announcedBerlinShow,
  fixtureA,
  fixtureAShow,
  fixtureM,
  tooLongDescriptionSetlist,
} from "./fixtures/setlists";

const INCOMPLETE_1 = { isIncomplete: true, unknownSongCount: 1 };

/** A keep-Tape decision that answers from a list and records every Tape it was asked about. */
function decision(answers: Array<boolean | { throws: unknown }>) {
  const asked: Performance[] = [];
  const queue = [...answers];
  const keepTape = vi.fn(async (tape: Performance) => {
    asked.push({ ...tape });
    const next = queue.shift();
    if (next === undefined) throw new Error(`unexpected keep-Tape question for "${tape.title}"`);
    if (typeof next === "object") throw next.throws;
    return next;
  });
  return { keepTape, asked };
}

const allPerformances = (setlist: SetlistFmSetlist) => toPerformances(setlist).performances;

/** P2 — Arctic Monkeys in Madrid. */
function madridSetlist(): SetlistFmSetlist {
  return {
    id: "73a1b2c5",
    eventDate: "02-06-2026",
    artist: { mbid: "ada7a83c-e3e1-40f1-93f9-3e73dbfd2c7c", name: "Arctic Monkeys" },
    venue: {
      id: "5bd7c2a4",
      name: "Estadio Metropolitano",
      city: { id: "3117735", name: "Madrid", country: { code: "ES", name: "Spain" } },
    },
    url: "https://www.setlist.fm/setlist/arctic-monkeys/2026/estadio-metropolitano-madrid-spain-73a1b2c5.html",
    sets: {
      set: [
        {
          song: [
            { name: "Intro", tape: true },
            { name: "Brianstorm" },
            { name: "Do I Wanna Know? / R U Mine?" },
            { name: "Hey Jude", info: "snippet" },
            { name: "" },
            { name: "Brianstorm" },
          ],
        },
        { encore: 1, song: [{ name: "505", info: "with Miles Kane" }, { name: "Kashmir", info: "Tease" }] },
      ],
    },
  } as unknown as SetlistFmSetlist;
}

// ---------------------------------------------------------------- AC-11, AC-12, AC-13: R1 on Fixture A

describe("prepareSetlist — Fixture A (R1)", () => {
  it("AC-11: keep every Tape → the Show, every Performance unchanged in played order, the not-added list and the incomplete status", async () => {
    const d = decision([true, true]);
    const prepared = await prepareSetlist(fixtureA(), { keepTape: d.keepTape });
    expect(prepared.show).toEqual(fixtureAShow);
    expect(prepared.keptPerformances).toEqual(allPerformances(fixtureA()));
    expect(prepared.keptPerformances).toHaveLength(14);
    expect(prepared.notAdded).toEqual([
      { name: "Hey Jude", reason: "snippet" },
      { reason: "unknown", after: 9 },
    ]);
    expect(prepared.incompleteStatus).toEqual(INCOMPLETE_1);
  });

  it("AC-11, AC-13: leave out every Tape → all but the two Tapes; the not-added list renumbers the Unknown Song after #8", async () => {
    const d = decision([false, false]);
    const prepared = await prepareSetlist(fixtureA(), { keepTape: d.keepTape });
    expect(prepared.keptPerformances).toEqual(allPerformances(fixtureA()).filter((p) => !p.isTape));
    expect(prepared.keptPerformances.map((p: Performance) => p.title)).not.toContain("I Want It All");
    expect(prepared.notAdded).toEqual([
      { name: "I Want It All", reason: "tape" },
      { name: "Hey Jude", reason: "snippet" },
      { reason: "unknown", after: 8 },
      { name: "Mr. Blue Sky", reason: "tape" },
    ]);
    expect(prepared.show).toEqual(fixtureAShow);
    expect(prepared.incompleteStatus).toEqual(INCOMPLETE_1);
  });

  it("AC-12, AC-13: keep \"I Want It All\", leave out \"Mr. Blue Sky\" → all but Mr. Blue Sky; not added as in PRD 0011 T2", async () => {
    const d = decision([true, false]);
    const prepared = await prepareSetlist(fixtureA(), { keepTape: d.keepTape });
    expect(prepared.keptPerformances).toEqual(allPerformances(fixtureA()).filter((p) => p.title !== "Mr. Blue Sky"));
    expect(prepared.notAdded).toEqual([
      { name: "Hey Jude", reason: "snippet" },
      { reason: "unknown", after: 9 },
      { name: "Mr. Blue Sky", reason: "tape" },
    ]);
  });

  it("AC-12: the decision is asked once per Tape, in played order (\"I Want It All\", then \"Mr. Blue Sky\")", async () => {
    const d = decision([false, true]);
    await prepareSetlist(fixtureA(), { keepTape: d.keepTape });
    expect(d.asked.map((p) => p.title)).toEqual(["I Want It All", "Mr. Blue Sky"]);
    expect(d.asked.every((p) => p.isTape)).toBe(true);
    expect(d.keepTape).toHaveBeenCalledTimes(2);
  });

  it("AC-12: each answer is awaited before the next Tape is asked", async () => {
    const first = deferred<boolean>();
    const asked: string[] = [];
    const keepTape = async (tape: Performance) => {
      asked.push(tape.title);
      return asked.length === 1 ? first.promise : true;
    };
    const preparing = prepareSetlist(fixtureA(), { keepTape });
    await flush();
    expect(asked).toEqual(["I Want It All"]);
    first.resolve(true);
    const prepared = await preparing;
    expect(asked).toEqual(["I Want It All", "Mr. Blue Sky"]);
    expect(prepared.keptPerformances).toHaveLength(14);
  });

  it("AC-12: a failing decision (cancelled on the first Tape) passes on its error unchanged; no further Tape is asked", async () => {
    const cancelled = new ExitPromptError();
    const d = decision([{ throws: cancelled }, true]);
    let caught: unknown;
    try {
      await prepareSetlist(fixtureA(), { keepTape: d.keepTape });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBe(cancelled);
    expect(d.asked.map((p) => p.title)).toEqual(["I Want It All"]);
  });

  it("AC-12: a Tape medley part counts as a Tape (Fixture M: both parts of the Tape medley are asked about)", async () => {
    const tapes = allPerformances(fixtureM()).filter((p) => p.isTape);
    expect(tapes.map((p) => p.title)).toEqual(["Interstellar Overdrive", "Astronomy Domine"]);
    const d = decision([true, false]);
    const prepared = await prepareSetlist(fixtureM(), { keepTape: d.keepTape });
    expect(d.asked.map((p) => [p.title, p.medley])).toEqual(tapes.map((p) => [p.title, p.medley]));
    expect(prepared.keptPerformances.map((p: Performance) => p.title)).toContain("Interstellar Overdrive");
    expect(prepared.keptPerformances.map((p: Performance) => p.title)).not.toContain("Astronomy Domine");
    expect(prepared.notAdded[0]).toEqual({ name: "Astronomy Domine", reason: "tape" });
  });

  it("AC-13: the not-added list is the one runPlayset puts in its preview for the same Setlist and Tape answers", async () => {
    for (const answers of [
      [true, false],
      [false, false],
      [true, true],
    ]) {
      const events: string[] = [];
      const fake = makeFakeServices({ setlist: fixtureA(), duplicates: [] }, events);
      const ui = makeFakeFrontEnd({ tapeAnswers: answers, confirm: true }, events);
      await runPlayset({
        input: FIXTURE_A_URL,
        options: { tapes: "ask", confirm: "ask", public: false, dryRun: true },
        frontEnd: ui.frontEnd,
        services: fake.services,
      });
      const prepared = await prepareSetlist(fixtureA(), { keepTape: decision(answers).keepTape });
      expect(prepared.notAdded).toEqual(ui.record.previews[0].notAdded);
      expect(prepared.keptPerformances.map((p: Performance) => p.title)).toEqual(
        ui.record.previews[0].rows.map((r: { performance: Performance }) => r.performance.title),
      );
    }
  });
});

// ---------------------------------------------------------------- AC-11 to AC-13: the other R1 Setlists

describe("prepareSetlist — other Setlists (R1)", () => {
  it("AC-11, AC-13: Madrid leaving out every Tape → kept Brianstorm, the two medley parts, Brianstorm again, 505 in Encore 1", async () => {
    const d = decision([false]);
    const prepared = await prepareSetlist(madridSetlist(), { keepTape: d.keepTape });
    expect(d.asked.map((p) => p.title)).toEqual(["Intro"]);
    expect(prepared.keptPerformances.map((p: Performance) => [p.title, p.medley, p.setLabel])).toEqual([
      ["Brianstorm", undefined, "main"],
      ["Do I Wanna Know?", "Do I Wanna Know? / R U Mine?", "main"],
      ["R U Mine?", "Do I Wanna Know? / R U Mine?", "main"],
      ["Brianstorm", undefined, "main"],
      ["505", undefined, "Encore 1"],
    ]);
    expect(prepared.keptPerformances).toEqual(allPerformances(madridSetlist()).filter((p) => !p.isTape));
    expect(prepared.notAdded).toEqual([
      { name: "Intro", reason: "tape" },
      { name: "Hey Jude", reason: "snippet" },
      { reason: "unknown", after: 3 },
      { name: "Kashmir", reason: "snippet" },
    ]);
    expect(prepared.show).toEqual({
      artist: "Arctic Monkeys",
      date: "2026-06-02",
      city: "Madrid",
      venue: "Estadio Metropolitano",
      url: "https://www.setlist.fm/setlist/arctic-monkeys/2026/estadio-metropolitano-madrid-spain-73a1b2c5.html",
    });
    expect(prepared.incompleteStatus).toEqual(INCOMPLETE_1);
  });

  it("AC-11, AC-12: Nirvana U1 → 9 kept Performances (Love Buzz with Original Artist Shocking Blue); the decision is never asked", async () => {
    const d = decision([]);
    const prepared = await prepareSetlist(nirvanaTacoma(), { keepTape: d.keepTape });
    expect(d.keepTape).not.toHaveBeenCalled();
    expect(prepared.show).toEqual(nirvanaShow);
    expect(prepared.keptPerformances.map((p: Performance) => p.title)).toEqual(NIRVANA_KEPT_TITLES);
    expect(prepared.keptPerformances[0]).toMatchObject({ title: "Love Buzz", originalArtist: "Shocking Blue" });
    expect(prepared.notAdded).toEqual([
      { reason: "unknown", after: 7, info: "Written as 'Dope Hippie' on the setlist" },
    ]);
    expect(prepared.incompleteStatus).toEqual(INCOMPLETE_1);
  });

  it("AC-11, AC-14: a Setlist of only Unknown Songs (T1d) → no kept Performances, both Unknown Songs at the start, incomplete with 2", async () => {
    const d = decision([]);
    const prepared = await prepareSetlist(portlandOnlyUnknownSongs(), { keepTape: d.keepTape });
    expect(d.keepTape).not.toHaveBeenCalled();
    expect(prepared.show).toEqual(portlandShow);
    expect(prepared.keptPerformances).toEqual([]);
    expect(prepared.notAdded).toEqual([
      { reason: "unknown", after: 0 },
      { reason: "unknown", after: 0, info: "Opener" },
    ]);
    expect(prepared.incompleteStatus).toEqual({ isIncomplete: true, unknownSongCount: 2 });
  });

  it("AC-14: a placeholder Setlist (announced Show) → no kept Performances, empty not-added list, complete; never asks", async () => {
    const d = decision([]);
    const prepared = await prepareSetlist(announcedBerlinShow(), { keepTape: d.keepTape });
    expect(d.keepTape).not.toHaveBeenCalled();
    expect(prepared.keptPerformances).toEqual([]);
    expect(prepared.notAdded).toEqual([]);
    expect(prepared.incompleteStatus).toEqual({ isIncomplete: false, unknownSongCount: 0 });
    expect(prepared.show).toMatchObject({ artist: "Arctic Monkeys", city: "Berlin", date: "2027-03-14" });
  });

  it("AC-14: a description that would be too long raises the description-too-long error before the decision is asked", async () => {
    const d = decision([true, true]);
    let caught: unknown;
    try {
      await prepareSetlist(tooLongDescriptionSetlist(), { keepTape: d.keepTape });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(DescriptionTooLongError);
    expect(d.keepTape).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------- AC-11: no request

describe("prepareSetlist — no request", () => {
  const original = globalThis.fetch;
  let fetches = 0;
  beforeEach(() => {
    fetches = 0;
    globalThis.fetch = (async () => {
      fetches++;
      throw new Error("no network in tests");
    }) as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = original;
  });

  it("AC-11: preparing a Setlist makes no request and takes no services", async () => {
    const prepared = await prepareSetlist(fixtureA(), { keepTape: async () => true });
    expect(prepared.keptPerformances).toHaveLength(14);
    expect(fetches).toBe(0);
  });
});
