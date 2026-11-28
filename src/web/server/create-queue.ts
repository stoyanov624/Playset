// One create or update per Setlist at a time, so two Visitors never make two Setlist Playlists for one
// Setlist. A request for the version already queued shares that run's answer; a request for another
// version waits for it to end, then runs on its own and sees the record it left. Different Setlists
// run side by side.

export interface SetlistQueue<T> {
  run(setlistId: string, versionId: string, work: () => Promise<T>): Promise<T>;
}

export function createSetlistQueue<T>(): SetlistQueue<T> {
  /** The last run queued per setlist id, until it ends. */
  const lastQueued = new Map<string, { versionId: string; done: Promise<T> }>();

  return {
    run(setlistId, versionId, work) {
      const last = lastQueued.get(setlistId);
      if (last?.versionId === versionId) return last.done;

      const previousEnded = last === undefined ? Promise.resolve() : last.done.then(noop, noop);
      const done = previousEnded.then(work);
      const queued = { versionId, done };
      lastQueued.set(setlistId, queued);
      const forget = () => {
        if (lastQueued.get(setlistId) === queued) lastQueued.delete(setlistId);
      };
      done.then(forget, forget);
      return done;
    },
  };
}

const noop = (): void => {};
