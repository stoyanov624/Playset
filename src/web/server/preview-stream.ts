// The preview stream and the preview runs behind it. One run per setlist id and version at a time:
// a second Visitor asking for the same preview joins the run (and first gets every event sent so far),
// and the run stops searching when the last Visitor watching it leaves.
import type { Response } from "express";
import { RunCancelledError } from "../../core/index.js";
import { PREVIEW_EVENTS, type PreviewEventName } from "../shared/index.js";
import { apiErrorOf, catalogueEntryOf } from "./catalogue.js";
import type { FailureLog } from "./logging.js";

/** A comment line keeps the connection open while a slow Match search runs. */
const KEEP_ALIVE_MS = 15_000;

/** One event on the wire: its name, its data as JSON on one line, then a blank line. */
export function eventFrame(name: PreviewEventName, data: unknown): string {
  return `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
}

export interface EventStream {
  send(frame: string): void;
  end(): void;
  /** Called once when the Visitor's connection closes before the stream ended. */
  onLeave(listener: () => void): void;
}

/** Starts the stream: answers 200 with the event-stream headers at once. */
export function openEventStream(res: Response): EventStream {
  res.status(200);
  // A buffering reverse proxy would hold the events back until the stream ends.
  res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-store", "X-Accel-Buffering": "no" });
  res.flushHeaders();
  const keepAlive = setInterval(() => res.write(": keep-alive\n\n"), KEEP_ALIVE_MS);
  keepAlive.unref();
  let ended = false;
  const leaveListeners: Array<() => void> = [];
  res.on("close", () => {
    clearInterval(keepAlive);
    if (ended) return;
    ended = true;
    for (const listener of leaveListeners) listener();
  });
  return {
    send: (frame) => {
      if (!ended) res.write(frame);
    },
    end: () => {
      if (ended) return;
      ended = true;
      clearInterval(keepAlive);
      res.end();
    },
    onLeave: (listener) => {
      leaveListeners.push(listener);
    },
  };
}

/** One preview's Matching, with every event it has sent so far. */
export interface PreviewRun {
  /** Adds a listener: it gets every event sent so far, then each later one, then the end. */
  listen(stream: EventStream): void;
}

/**
 * The run's work: it sends progress events through `send` and resolves to the last event (the preview).
 * `signal` aborts when nobody is watching any more.
 */
export type PreviewWork = (signal: AbortSignal, send: (frame: string) => void) => Promise<string>;

export interface PreviewRuns {
  /** The run in flight for this setlist id and version, if any. */
  find(setlistId: string, versionId: string): PreviewRun | undefined;
  start(setlistId: string, versionId: string, work: PreviewWork): PreviewRun;
}

export function createPreviewRuns(log: FailureLog): PreviewRuns {
  const runs = new Map<string, PreviewRun>();
  // JSON keeps the setlist id and version apart whatever characters they hold.
  const keyOf = (setlistId: string, versionId: string) => JSON.stringify([setlistId, versionId]);

  return {
    find: (setlistId, versionId) => runs.get(keyOf(setlistId, versionId)),
    start(setlistId, versionId, work) {
      const key = keyOf(setlistId, versionId);
      const frames: string[] = [];
      const listeners = new Set<EventStream>();
      const controller = new AbortController();
      let ended = false;

      const forget = () => {
        if (runs.get(key) === run) runs.delete(key);
      };
      const send = (frame: string) => {
        frames.push(frame);
        for (const listener of listeners) listener.send(frame);
      };
      const finish = (last: string | undefined) => {
        ended = true;
        if (last !== undefined) send(last);
        for (const listener of listeners) listener.end();
        listeners.clear();
        forget();
      };

      const run: PreviewRun = {
        listen(stream) {
          for (const frame of frames) stream.send(frame);
          if (ended) {
            stream.end();
            return;
          }
          listeners.add(stream);
          stream.onLeave(() => {
            listeners.delete(stream);
            if (listeners.size === 0 && !ended) {
              // Nobody is watching: stop searching, and let the next request start afresh.
              forget();
              controller.abort();
            }
          });
        },
      };
      runs.set(key, run);

      work(controller.signal, send).then(
        (last) => finish(last),
        (error: unknown) => {
          if (error instanceof RunCancelledError && controller.signal.aborted) {
            log.cancelled(error);
            finish(undefined);
            return;
          }
          const entry = catalogueEntryOf(error);
          log.failure(error, entry);
          finish(eventFrame(PREVIEW_EVENTS.error, apiErrorOf(entry)));
        },
      );
      return run;
    },
  };
}
