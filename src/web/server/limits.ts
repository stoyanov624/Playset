// Playset's own limits, kept in memory only: a sliding hour per Visitor address, and the count of
// rate-limit answers per UTC day. Addresses live here only, never in the store or the log.

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** The UTC day of a moment, as `YYYY-MM-DD`. */
export function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Whole seconds to wait for `ms` milliseconds, rounded up and never under 1, as Retry-After wants. */
function retrySeconds(ms: number): number {
  return Math.max(1, Math.ceil(ms / 1000));
}

/** Seconds until the next 00:00 UTC, when playlists made today start again from 0. */
export function secondsUntilNextUtcDay(ms: number): number {
  return retrySeconds(DAY_MS - (ms % DAY_MS));
}

/** Requests counted per Visitor address over the last 60 minutes. */
export interface AddressWindow {
  /** Seconds until the address may ask again, or undefined when it is under its limit. */
  waitFor(address: string, now: number): number | undefined;
  count(address: string, now: number): void;
}

export function createAddressWindow(limit: number): AddressWindow {
  const counted = new Map<string, number[]>();

  /** The address's counted moments still inside the window; an address with none is forgotten. */
  const inWindow = (address: string, now: number): number[] => {
    const moments = (counted.get(address) ?? []).filter((at) => at > now - HOUR_MS);
    if (moments.length === 0) counted.delete(address);
    else counted.set(address, moments);
    return moments;
  };

  return {
    waitFor(address, now) {
      const moments = inWindow(address, now);
      if (moments.length < limit) return undefined;
      return retrySeconds(moments[0]! + HOUR_MS - now);
    },
    count(address, now) {
      counted.set(address, [...inWindow(address, now), now]);
    },
  };
}

/** How many rate-limit answers Playset's own limits gave, per UTC day. */
export interface RateLimitHitCounter {
  add(day: string): void;
  count(day: string): number;
}

export function createRateLimitHitCounter(): RateLimitHitCounter {
  const hits = new Map<string, number>();
  return {
    add: (day) => {
      hits.set(day, (hits.get(day) ?? 0) + 1);
    },
    count: (day) => hits.get(day) ?? 0,
  };
}
