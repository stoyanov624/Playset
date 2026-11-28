// Answers the fake API client gives on the admin page (the admin page's examples E1–E6). Each
// status is parsed with the contract's schema, so a fixture that drifts from it fails loudly.
// Every builder returns a fresh object.
import { act, screen, waitFor } from "@testing-library/react";
import { ApiCallError } from "../../../../src/web/client/api/index.js";
import { adminStatusResponseSchema, type AdminStatusResponse } from "../../../../src/web/shared/index.js";
import { usageDates } from "../../shared/fixtures/contract-values";
import { deferred, fakeApi, type Deferred, type FakeApi } from "./fake-api";
import { openApp, type OpenOptions } from "./dom";

/** The status answer when nobody (or not the Host Account) is logged in. */
export function notAdmin(): ApiCallError {
  return new ApiCallError({
    code: "NOT_ADMIN",
    message: "Log in as the Host Account to see this page.",
    hint: "Use the Log in with Spotify button.",
  });
}

export function recordsUnreadable(): ApiCallError {
  return new ApiCallError({
    code: "UPSTREAM_UNAVAILABLE",
    message: "Playset can't read its records right now.",
    hint: "Try again in a minute.",
  });
}

export function ourSide(): ApiCallError {
  return new ApiCallError({
    code: "INTERNAL",
    message: "Something went wrong on our side.",
    hint: "Please try again in a minute.",
  });
}

export function tooManyRequests(retryAfterSeconds: number): ApiCallError {
  return new ApiCallError({
    code: "RATE_LIMITED",
    message: "Too many requests from here.",
    hint: "Wait a moment, then try again.",
    retryAfterSeconds,
  });
}

/** The real API client's own error when no answer came (fetch rejected). */
export function playsetUnreachable(): ApiCallError {
  return new ApiCallError({
    code: "UPSTREAM_UNAVAILABLE",
    message: "Playset isn't answering right now.",
    hint: "Check your connection and try again in a minute.",
  });
}

/** The per-day counts of E2, newest first (28 Nov down to 30 Oct). */
function e2DaysNewestFirst() {
  return usageDates().map((date, i) => {
    if (i === 0) return { date, created: 4, updated: 1, opened: 37 };
    if (i === 1) return { date, created: 2, updated: 0, opened: 21 };
    if (i === 29) return { date, created: 0, updated: 0, opened: 0 };
    return { date, created: 1, updated: i % 3 === 0 ? 1 : 0, opened: 30 - i };
  });
}

/** E2: the dashboard, connected, with all 30 days; the fake sends the days oldest first. */
export function connectedStatus(): AdminStatusResponse {
  return adminStatusResponseSchema.parse({
    hostAccount: { connected: true, displayName: "playset-host" },
    config: [
      { name: "setlist.fm API key", present: true },
      { name: "Spotify client id", present: true },
      { name: "Host Account id", present: true },
      { name: "Cookie secret", present: false },
    ],
    usage: {
      playlistsMade: 128,
      opens: 1042,
      perDay: e2DaysNewestFirst().reverse(),
      topArtists: [
        { artist: "Arctic Monkeys", playlistCount: 14 },
        { artist: "Fontaines D.C.", playlistCount: 9 },
        { artist: "Sigur Rós", playlistCount: 1 },
      ],
    },
    rateLimitHitsToday: 3,
  });
}

/** E2 without a display name for the Host Account. */
export function connectedWithoutNameStatus(): AdminStatusResponse {
  const status = connectedStatus();
  return adminStatusResponseSchema.parse({ ...status, hostAccount: { connected: true } });
}

/** E3: a fresh install, Host Account not connected, every count zero. */
export function freshInstallStatus(): AdminStatusResponse {
  return adminStatusResponseSchema.parse({
    hostAccount: { connected: false },
    config: [
      { name: "setlist.fm API key", present: true },
      { name: "Spotify client id", present: true },
      { name: "Host Account id", present: true },
      { name: "Cookie secret", present: true },
    ],
    usage: {
      playlistsMade: 0,
      opens: 0,
      perDay: usageDates().reverse().map((date) => ({ date, created: 0, updated: 0, opened: 0 })),
      topArtists: [],
    },
    rateLimitHitsToday: 0,
  });
}

/** E3 variant: no config reported at all. */
export function noConfigStatus(): AdminStatusResponse {
  return adminStatusResponseSchema.parse({ ...freshInstallStatus(), config: [] });
}

/** E3 variant: one update on 12 Nov among zeros, so the table shows. */
export function oneUpdateStatus(): AdminStatusResponse {
  const status = freshInstallStatus();
  return adminStatusResponseSchema.parse({
    ...status,
    usage: {
      ...status.usage,
      perDay: status.usage.perDay.map((day) => (day.date === "2026-11-12" ? { ...day, updated: 1 } : day)),
    },
  });
}

/** Answers each call in turn: a value, an error to reject with, or a pending answer the test settles. */
export function inTurn<T>(answers: Array<T | Error | Deferred<T>>): (...args: unknown[]) => Promise<T> {
  let index = 0;
  return () => {
    if (answers.length === 0) return Promise.reject(new Error("inTurn: no answers"));
    const answer = answers[Math.min(index, answers.length - 1)];
    index += 1;
    if (answer instanceof Error) return Promise.reject(answer);
    if (typeof answer === "object" && answer !== null && "promise" in answer && "resolve" in answer) {
      return (answer as Deferred<T>).promise;
    }
    return Promise.resolve(answer as T);
  };
}

/** A status call that stays pending until the test settles it; aborting its signal rejects it. */
export function pendingStatus() {
  const calls: { signal: AbortSignal | undefined; answer: Deferred<AdminStatusResponse> }[] = [];
  const getAdminStatus = (signal?: AbortSignal): Promise<AdminStatusResponse> => {
    const answer = deferred<AdminStatusResponse>(signal);
    calls.push({ signal, answer });
    return answer.promise;
  };
  return { getAdminStatus, calls };
}

/** Opens the admin page at `path` with the given fake answers. */
export function openAdmin(
  answers: Partial<Parameters<typeof fakeApi>[0]>,
  path = "/admin",
  options: OpenOptions = {},
): { api: FakeApi } & ReturnType<typeof openApp> {
  const api = fakeApi(answers);
  const opened = openApp(api, path, options);
  return { api, ...opened };
}

/** Opens the dashboard (E2 by default) and waits until it shows. */
export async function openDashboard(
  status: AdminStatusResponse = connectedStatus(),
  answers: Partial<Parameters<typeof fakeApi>[0]> = {},
  path = "/admin",
) {
  const opened = openAdmin({ getAdminStatus: async () => status, ...answers }, path, {});
  await screen.findByRole("heading", { level: 2, name: "Config" });
  await waitFor(() => {
    if (screen.queryAllByRole("button", { name: "Log out" }).length !== 1) throw new Error("no Log out button yet");
  });
  return opened;
}

/** Opens the logged-out view and waits until it shows. */
export async function openLoggedOut(path = "/admin") {
  const opened = openAdmin({ getAdminStatus: async () => Promise.reject(notAdmin()) }, path, {});
  await screen.findByRole("link", { name: "Log in with Spotify" });
  await act(async () => {
    await Promise.resolve();
  });
  return opened;
}
