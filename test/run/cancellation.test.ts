// Cancelling a run through an AbortSignal, moved from the CLI into the core so every front-end
// gets it: aborting before the create request was sent ends the run promptly with a
// RunCancelledError and stops every further service and front-end call; aborting after the
// create request was sent changes nothing. Fake services and front-end only.
import { describe, expect, it } from "vitest";
import { PlaysetError, RunCancelledError, runPlayset } from "../../src/core/index.js";
import type { RunOptions } from "../../src/core/run/index.js";
import {
  AUTHORIZE_URL,
  CREATED_SHARE_URL,
  TOKEN,
  makeFakeFrontEnd,
  makeFakeServices,
  type FakeFrontEndOptions,
  type FakeServicesOptions,
} from "./fixtures/fake-services";
import { ARCTIC_MONKEYS_CANDIDATES, FIXTURE_A_URL } from "./fixtures/setlists";
import { captureError, deferred, flush, makeAbort, makeCallRecorder, within } from "./fixtures/call-recorder";

const OPTIONS: RunOptions = { tapes: "ask", confirm: "ask", public: false, dryRun: false };

type Fn = (...args: any[]) => any;
type Overrides = (inner: Record<string, Fn>) => Record<string, Fn>;

interface SetupOptions {
  input?: string;
  options?: Partial<RunOptions>;
  services?: FakeServicesOptions;
  frontEnd?: FakeFrontEndOptions;
  /** Replace some service methods; receives the fake services. */
  overrideServices?: Overrides;
  /** Replace some front-end methods; receives the fake front-end. */
  overrideFrontEnd?: Overrides;
  /** Give the run no signal at all. */
  noSignal?: boolean;
}

/** Fixture A by link, both Tapes asked (Yes, No), cached token, no duplicates, confirmation Yes. */
function setup(opts: SetupOptions = {}) {
  const recorder = makeCallRecorder();
  const abort = makeAbort(recorder);
  const events: string[] = [];
  const fake = makeFakeServices({ fullLogin: false, duplicates: [], ...opts.services }, events);
  const ui = makeFakeFrontEnd({ tapeAnswers: [true, false], confirm: true, ...opts.frontEnd }, events);
  const innerServices = fake.services as unknown as Record<string, Fn>;
  const innerFrontEnd = ui.frontEnd as unknown as Record<string, Fn>;
  const services = { ...innerServices, ...(opts.overrideServices?.(innerServices) ?? {}) };
  const frontEnd = { ...innerFrontEnd, ...(opts.overrideFrontEnd?.(innerFrontEnd) ?? {}) };
  const run = () =>
    runPlayset({
      input: opts.input ?? FIXTURE_A_URL,
      options: { ...OPTIONS, ...opts.options },
      frontEnd: recorder.wrapFrontEnd(frontEnd as never),
      services: recorder.wrapServices(services as never),
      ...(opts.noSignal ? {} : { signal: abort.signal }),
    });
  return { run, abort, recorder, calls: fake.calls, record: ui.record, events };
}

/** Expects the run to reject with RunCancelledError within the time limit. */
async function expectCancelled(running: Promise<unknown>) {
  const err = await captureError(within(running));
  expect(err).toBeInstanceOf(RunCancelledError);
  return err;
}

describe("run cancellation — a signal already aborted", () => {
  it("rejects with RunCancelledError, a PlaysetError, and calls no service and no front-end method", async () => {
    const t = setup();
    t.abort.abort();
    const err = await expectCancelled(t.run());
    expect(err).toBeInstanceOf(PlaysetError);
    expect(t.recorder.calls).toEqual([]);
  });

  it("is checked even for an Artist name input", async () => {
    const t = setup({ input: "Arctic Monkeys" });
    t.abort.abort();
    await expectCancelled(t.run());
    expect(t.recorder.calls).toEqual([]);
  });
});

describe("run cancellation — while a setlist.fm call is pending", () => {
  it("rejects promptly while the Setlist fetch is still pending, and ignores its late answer", async () => {
    const pending = deferred<unknown>();
    let innerGetSetlist: Fn | undefined;
    const t = setup({
      overrideServices: (inner) => {
        innerGetSetlist = inner.getSetlist;
        return { getSetlist: () => pending.promise };
      },
    });
    const running = t.run();
    await flush();
    expect(t.recorder.calls).toEqual(["service:getSetlist"]);
    t.abort.abort();
    await expectCancelled(running);

    pending.resolve(await innerGetSetlist!("63a5e2b7"));
    await flush();
    expect(t.recorder.callsAfterAbort()).toEqual([]);
    expect(t.record.shows).toEqual([]);
  });

  it("rejects promptly while the Artist lookup is still pending, and ignores its late answer", async () => {
    const pending = deferred<unknown>();
    const t = setup({
      input: "Arctic Monkeys",
      overrideServices: () => ({ findLatestSetlistByArtistName: () => pending.promise }),
    });
    const running = t.run();
    await flush();
    t.abort.abort();
    await expectCancelled(running);

    pending.reject(new Error("late failure after the abort"));
    await flush();
    expect(t.recorder.callsAfterAbort()).toEqual([]);
  });
});

describe("run cancellation — while a front-end question is pending", () => {
  it("rejects promptly at the Artist question; a late pick sends no setlists request", async () => {
    const pick = deferred<unknown>();
    const t = setup({
      input: "arctic monkey",
      services: { candidates: ARCTIC_MONKEYS_CANDIDATES },
      overrideFrontEnd: () => ({ chooseArtist: () => pick.promise }),
    });
    const running = t.run();
    await flush();
    expect(t.recorder.calls).toContain("frontEnd:chooseArtist");
    t.abort.abort();
    await expectCancelled(running);

    pick.resolve(ARCTIC_MONKEYS_CANDIDATES[0]);
    await flush();
    expect(t.recorder.callsAfterAbort()).toEqual([]);
    expect(t.events.some((e) => e.startsWith("setlistfm:setlists:"))).toBe(false);
  });

  it("rejects promptly at the second Tape question; a late answer asks nothing more and makes no Spotify call", async () => {
    const secondAnswer = deferred<boolean>();
    let asked = 0;
    const t = setup({
      overrideFrontEnd: (inner) => ({
        askTape: (tape: unknown) => {
          asked++;
          return asked === 1 ? inner.askTape!(tape) : secondAnswer.promise;
        },
      }),
    });
    const running = t.run();
    await flush();
    expect(asked).toBe(2);
    t.abort.abort();
    await expectCancelled(running);

    secondAnswer.resolve(true);
    await flush();
    expect(t.recorder.callsAfterAbort()).toEqual([]);
    expect(t.events.filter((e) => e.startsWith("spotify:"))).toEqual([]);
  });

  it("rejects promptly at the confirmation; a late Yes creates nothing", async () => {
    const answer = deferred<boolean>();
    const t = setup({ overrideFrontEnd: () => ({ confirmCreate: () => answer.promise }) });
    const running = t.run();
    await flush();
    expect(t.recorder.calls).toContain("frontEnd:confirmCreate");
    t.abort.abort();
    await expectCancelled(running);

    answer.resolve(true);
    await flush();
    expect(t.recorder.callsAfterAbort()).toEqual([]);
    expect(t.calls.create).toEqual([]);
  });
});

describe("run cancellation — while waiting for the Spotify login", () => {
  it("passes the token getter an openAuthorizeUrl hook and a signal that aborts with the run's signal", async () => {
    const hooksSeen: { openAuthorizeUrl?: unknown; signal?: AbortSignal }[] = [];
    const t = setup({
      overrideServices: () => ({
        getAccessToken: async (hooks: { openAuthorizeUrl(url: string): Promise<void> | void; signal?: AbortSignal }) => {
          hooksSeen.push(hooks);
          await hooks.openAuthorizeUrl(AUTHORIZE_URL);
          return new Promise<string>(() => {});
        },
      }),
    });
    const running = t.run();
    await flush();
    expect(hooksSeen).toHaveLength(1);
    expect(typeof hooksSeen[0]!.openAuthorizeUrl).toBe("function");
    expect(hooksSeen[0]!.signal).toBeInstanceOf(AbortSignal);
    expect(hooksSeen[0]!.signal!.aborted).toBe(false);
    expect(t.record.authorizeUrls).toEqual([AUTHORIZE_URL]);

    t.abort.abort();
    await expectCancelled(running);
    expect(hooksSeen[0]!.signal!.aborted).toBe(true);
  });

  it("rejects promptly while the login never finishes; no search, no duplicate check, no creation", async () => {
    const t = setup({ services: { loginNeverFinishes: true } });
    const running = t.run();
    await flush();
    expect(t.calls.getAccessToken).toBe(1);
    t.abort.abort();
    await expectCancelled(running);
    await flush();
    expect(t.recorder.callsAfterAbort()).toEqual([]);
    expect(t.calls.findMatch).toEqual([]);
    expect(t.calls.findPlaylistsNamed).toEqual([]);
    expect(t.calls.create).toEqual([]);
  });

  it("ignores a token that arrives after the abort", async () => {
    const token = deferred<string>();
    const t = setup({ overrideServices: () => ({ getAccessToken: () => token.promise }) });
    const running = t.run();
    await flush();
    t.abort.abort();
    await expectCancelled(running);

    token.resolve(TOKEN);
    await flush();
    expect(t.recorder.callsAfterAbort()).toEqual([]);
    expect(t.calls.findMatch).toEqual([]);
  });
});

describe("run cancellation — while finding Matches and checking for duplicates", () => {
  it("stops after the search in progress: no new search, no progress, no duplicate check, no preview, no creation", async () => {
    const fourth = deferred<unknown>();
    let started = 0;
    let innerFindMatch: Fn | undefined;
    const t = setup({
      options: { confirm: "skip" },
      overrideServices: (inner) => {
        innerFindMatch = inner.findMatch;
        return {
          findMatch: (performance: unknown, accessToken: string) => {
            started++;
            return started === 4 ? fourth.promise : inner.findMatch!(performance, accessToken);
          },
        };
      },
    });
    const running = t.run();
    await flush();
    expect(started).toBe(4);
    t.abort.abort();
    await expectCancelled(running);

    fourth.resolve(await innerFindMatch!({ title: "Don't Sit Down 'Cause I've Moved Your Chair", artist: "Arctic Monkeys", position: 4 }, TOKEN));
    await flush();
    expect(started).toBe(4);
    expect(t.recorder.callsAfterAbort()).toEqual([]);
    expect(t.calls.findPlaylistsNamed).toEqual([]);
    expect(t.record.previews).toEqual([]);
    expect(t.calls.create).toEqual([]);
  });

  it("an abort during a search that then finishes normally still ends the run with RunCancelledError", async () => {
    let started = 0;
    const t = setup({
      options: { confirm: "skip" },
      overrideServices: (inner) => ({
        findMatch: (performance: unknown, accessToken: string) => {
          started++;
          if (started === 2) t.abort.abort();
          return inner.findMatch!(performance, accessToken);
        },
      }),
    });
    await expectCancelled(t.run());
    await flush();
    expect(started).toBe(2);
    expect(t.recorder.callsAfterAbort()).toEqual([]);
    expect(t.calls.create).toEqual([]);
  });

  it("rejects promptly during the duplicate check; its late answer leads to no preview, no confirmation and no creation", async () => {
    const duplicates = deferred<unknown[]>();
    const t = setup({ overrideServices: () => ({ findPlaylistsNamed: () => duplicates.promise }) });
    const running = t.run();
    await flush();
    expect(t.recorder.calls).toContain("service:findPlaylistsNamed");
    t.abort.abort();
    await expectCancelled(running);

    duplicates.resolve([]);
    await flush();
    expect(t.recorder.callsAfterAbort()).toEqual([]);
    expect(t.record.previews).toEqual([]);
    expect(t.record.confirmQuestions).toEqual([]);
    expect(t.calls.create).toEqual([]);
  });
});

describe("run cancellation — after the create request was sent", () => {
  it("an abort right after createSetlistPlaylist was called has no effect: the run resolves 'created'", async () => {
    const t = setup({
      options: { confirm: "skip" },
      overrideServices: (inner) => ({
        createSetlistPlaylist: (...args: unknown[]) => {
          const result = inner.createSetlistPlaylist!(...args);
          t.abort.abort();
          return result;
        },
      }),
    });
    const outcome = (await within(t.run())) as { kind: string; playlist: { shareUrl: string }; misses: unknown[] };
    expect(outcome.kind).toBe("created");
    expect(outcome.playlist.shareUrl).toBe(CREATED_SHARE_URL);
    expect(outcome.misses).toHaveLength(1);
    expect(t.calls.create).toHaveLength(1);
  });

  it("an abort while the create request is still pending has no effect: the run waits for it and resolves 'created'", async () => {
    const created = deferred<unknown>();
    let innerCreate: Fn | undefined;
    let createArgs: unknown[] = [];
    const t = setup({
      overrideServices: (inner) => {
        innerCreate = inner.createSetlistPlaylist;
        return {
          createSetlistPlaylist: (...args: unknown[]) => {
            createArgs = args;
            return created.promise;
          },
        };
      },
    });
    const running = t.run();
    let settled = false;
    running.then(
      () => (settled = true),
      () => (settled = true),
    );
    await flush();
    expect(createArgs).toHaveLength(3);
    t.abort.abort();
    await flush();
    expect(settled).toBe(false);

    created.resolve(await innerCreate!(...createArgs));
    const outcome = (await within(running)) as { kind: string; playlist: { shareUrl: string } };
    expect(outcome.kind).toBe("created");
    expect(outcome.playlist.shareUrl).toBe(CREATED_SHARE_URL);
  });

  it("an abort after the run finished changes nothing", async () => {
    const t = setup();
    const outcome = await within(t.run());
    t.abort.abort();
    await flush();
    expect((outcome as { kind: string }).kind).toBe("created");
    expect(t.recorder.callsAfterAbort()).toEqual([]);
  });
});

describe("run cancellation — without an abort", () => {
  it("a signal that never aborts lets the run finish as usual", async () => {
    const t = setup();
    const outcome = (await within(t.run())) as { kind: string; playlist: { shareUrl: string } };
    expect(outcome.kind).toBe("created");
    expect(outcome.playlist.shareUrl).toBe(CREATED_SHARE_URL);
    expect(t.record.tapeQuestions.map((p) => p.title)).toEqual(["I Want It All", "Mr. Blue Sky"]);
  });

  it("with no signal the run finishes as before and the token getter still gets an openAuthorizeUrl hook", async () => {
    const hooksSeen: { openAuthorizeUrl?: unknown }[] = [];
    const t = setup({
      noSignal: true,
      overrideServices: (inner) => ({
        getAccessToken: (hooks: { openAuthorizeUrl?: unknown }) => {
          hooksSeen.push(hooks);
          return inner.getAccessToken!(hooks);
        },
      }),
    });
    const outcome = (await within(t.run())) as { kind: string };
    expect(outcome.kind).toBe("created");
    expect(hooksSeen).toHaveLength(1);
    expect(typeof hooksSeen[0]!.openAuthorizeUrl).toBe("function");
  });

  it("a question that fails on its own (not through the signal) still ends the run with that error, not RunCancelledError", async () => {
    const own = new Error("front-end went away");
    const t = setup({ frontEnd: { tapeAnswers: [true, { throws: own }] } });
    const err = await captureError(within(t.run()));
    expect(err).toBe(own);
  });
});
