// Errors by code, on every request that can fail: where the alert goes, its heading and focus,
// the Retry-After countdown, "Try again", "Playlist creation is temporarily unavailable",
// "Load fresh preview", Setlists that don't exist, and a preview stream that fails mid-way.
import { act, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import { ApiCallError } from "../../../src/web/client/api/index.js";
import type { ArtistSetlistsResponse, ArtistsResponse, SetlistResponse } from "../../../src/web/shared/index.js";
import { deferred, fakeApi, type Deferred } from "./fixtures/fake-api";
import {
  expectFocusOn,
  findAlert,
  getByLine,
  isBefore,
  linksTo,
  normalise,
  openApp,
  queryByLine,
  recordAnnouncements,
  setRows,
} from "./fixtures/dom";
import { openFinishedPreview, openSetlistFromList, openSetlistScreen } from "./fixtures/flows";
import {
  ARCTIC_MONKEYS_MBID,
  MADRID_ID,
  PAGE1_ROW_NAMES,
  PORTLAND_ID,
  arcticMonkeysCandidates,
  arcticMonkeysPage1,
  arcticMonkeysPage2,
  madridOutdatedStatus,
  madridResult,
  madridStatus,
  SHARE_URL,
} from "./fixtures/values";

afterEach(() => {
  vi.useRealTimers();
});

const TOO_MANY_SEARCHES = new ApiCallError({
  code: "RATE_LIMITED", message: "Too many searches from here.", hint: "Wait a moment, then search again.", retryAfterSeconds: 42,
});
const SETLISTFM_DOWN = new ApiCallError({
  code: "UPSTREAM_UNAVAILABLE", message: "setlist.fm isn't answering right now.", hint: "Try again in a minute.",
});
const SPOTIFY_DOWN = new ApiCallError({
  code: "UPSTREAM_UNAVAILABLE", message: "Spotify isn't answering right now.", hint: "Try again in a minute.",
});
const OUR_SIDE = new ApiCallError({
  code: "INTERNAL", message: "Something went wrong on our side.", hint: "Please try again in a minute.",
});
const PLAYLISTS_OFF = new ApiCallError({
  code: "PLAYLISTS_UNAVAILABLE", message: "Playlists can't be made right now.",
  hint: "Search and existing playlists still work. Try again later.",
});
const SETLIST_CHANGED = new ApiCallError({
  code: "SETLIST_CHANGED", message: "This Setlist changed on setlist.fm a moment ago.",
  hint: "Load a fresh preview to see the new songs.",
});
const NO_SUCH_SETLIST = new ApiCallError({
  code: "NOT_FOUND", message: "setlist.fm has no Setlist with that id.", hint: "Check the link, or search for the Artist.",
});
const NO_SUCH_ARTIST = new ApiCallError({
  code: "NOT_FOUND", message: "setlist.fm has no Artist with that id.", hint: "Search for the Artist by name.",
});

/** No status number, exception name or stack reaches the page. */
function expectNoTechnicalText(): void {
  const text = normalise(document.body.textContent);
  expect(text).not.toMatch(/\b(400|404|429|500|502|503)\b/);
  expect(text).not.toContain("ApiCallError");
  expect(text).not.toContain("Error:");
  expect(text).not.toContain(" at ");
}

/** Answers each call from the list in turn; a Deferred waits for the test. */
function inTurn<T>(answers: Array<T | Error | Deferred<T>>) {
  let next = 0;
  return () => {
    const answer = answers[next];
    next += 1;
    if (answer === undefined) return Promise.reject(new Error("no more answers in this test"));
    if (answer instanceof Error) return Promise.reject(answer);
    if (isDeferred<T>(answer)) return answer.promise;
    return Promise.resolve(answer);
  };
}

function isDeferred<T>(value: unknown): value is Deferred<T> {
  return typeof value === "object" && value !== null && "promise" in value && value.promise instanceof Promise;
}

// ---------------------------------------------------------------- search

describe("search errors", () => {
  it("AC-37: an error on the search is one alert under the Start form, its h1 the server's message, focused", async () => {
    const api = fakeApi({ searchArtists: inTurn<ArtistsResponse>([OUR_SIDE]) });
    openApp(api, "/?artist=arctic%20monkeys");
    const alertHeading = await screen.findByRole("heading", { level: 1, name: "Something went wrong on our side." });
    getByLine("Please try again in a minute.");
    expect(isBefore(screen.getByLabelText("Artist"), alertHeading)).toBe(true);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.queryByRole("heading", { name: "Pick the Artist" })).toBeNull();
    await expectFocusOn(() => screen.getByRole("heading", { level: 1, name: "Something went wrong on our side." }));
    expectNoTechnicalText();
  });

  it("AC-38: RATE_LIMITED with a retry wait counts down, keeps Try again disabled, then enables it without moving focus", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const first = deferred<ArtistsResponse>();
    const api = fakeApi({ searchArtists: inTurn<ArtistsResponse>([first, arcticMonkeysCandidates()]) });
    const { user } = openApp(api, "/?artist=arctic%20monkeys", { fakeTimers: true });
    await screen.findByRole("button", { name: "Searching…" });
    const announcements = recordAnnouncements();
    await act(async () => first.reject(TOO_MANY_SEARCHES));

    const title = () => screen.getByRole("heading", { level: 1, name: "Too many searches from here." });
    await expectFocusOn(title);
    getByLine("Wait a moment, then search again.");
    getByLine("You can try again in 0:42");
    const tryAgain = screen.getByRole("button", { name: "Try again" });
    expect(tryAgain.getAttribute("aria-disabled")).toBe("true");
    await waitFor(() => expect(announcements).toEqual(["Try again in 42 seconds"]));

    await user.click(tryAgain);
    expect(api.searchArtists).toHaveBeenCalledTimes(1);
    title().focus();

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    await waitFor(() => getByLine("You can try again in 0:41"));
    act(() => {
      vi.advanceTimersByTime(41_000);
    });
    await waitFor(() => expect(announcements).toEqual(["Try again in 42 seconds", "You can try again now"]));
    expect(normalise(document.body.textContent)).not.toContain("You can try again in");
    expect(screen.getByRole("button", { name: "Try again" }).getAttribute("aria-disabled")).not.toBe("true");
    expect(document.activeElement).toBe(title());

    await user.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByRole("heading", { level: 1, name: "Pick the Artist" });
    expect(api.searchArtists).toHaveBeenCalledTimes(2);
    expect(api.searchArtists.mock.calls[1]?.[0]).toBe("arctic monkeys");
  });

  it("AC-39: INTERNAL offers Try again, which reads Trying again… while pending and then shows the candidates", async () => {
    const second = deferred<ArtistsResponse>();
    const api = fakeApi({ searchArtists: inTurn<ArtistsResponse>([OUR_SIDE, second]) });
    const { user } = openApp(api, "/?artist=arctic%20monkeys");
    await user.click(await screen.findByRole("button", { name: "Try again" }));

    const trying = await screen.findByRole("button", { name: "Trying again…" });
    expect(trying.getAttribute("aria-disabled")).toBe("true");
    await user.click(trying);
    expect(api.searchArtists).toHaveBeenCalledTimes(2);

    await act(async () => second.resolve(arcticMonkeysCandidates()));
    await screen.findByRole("heading", { level: 1, name: "Pick the Artist" });
    expect(screen.queryByRole("heading", { name: "Something went wrong on our side." })).toBeNull();
    expect(api.searchArtists.mock.calls[1]?.[0]).toBe("arctic monkeys");
  });

  it("AC-52: the search rate-limit alert has no axe violations", async () => {
    const api = fakeApi({ searchArtists: inTurn<ArtistsResponse>([TOO_MANY_SEARCHES]) });
    const { container } = openApp(api, "/?artist=arctic%20monkeys");
    await screen.findByRole("heading", { level: 1, name: "Too many searches from here." });
    expect(await axe(container)).toHaveNoViolations();
  });
});

// ---------------------------------------------------------------- Setlist list

describe("Setlist list errors", () => {
  it("AC-39: UPSTREAM_UNAVAILABLE on page 1 is an alert under the list h1, and Try again loads the rows", async () => {
    const retry = deferred<ArtistSetlistsResponse>();
    const api = fakeApi({ getArtistSetlists: inTurn<ArtistSetlistsResponse>([SETLISTFM_DOWN, retry]) });
    const { user } = openApp(api, `/artists/${ARCTIC_MONKEYS_MBID}`);
    const alertHeading = await screen.findByRole("heading", { level: 2, name: "setlist.fm isn't answering right now." });
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(isBefore(h1, alertHeading)).toBe(true);
    getByLine("Try again in a minute.");
    await expectFocusOn(() => screen.getByRole("heading", { level: 2, name: "setlist.fm isn't answering right now." }));
    expectNoTechnicalText();

    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect((await screen.findByRole("button", { name: "Trying again…" })).getAttribute("aria-disabled")).toBe("true");
    await act(async () => retry.resolve(arcticMonkeysPage1()));
    await screen.findByRole("link", { name: PAGE1_ROW_NAMES[0] });
    expect(screen.queryByRole("heading", { name: "setlist.fm isn't answering right now." })).toBeNull();
    expect(api.getArtistSetlists.mock.calls.map((call) => call.slice(0, 2))).toEqual([
      [ARCTIC_MONKEYS_MBID, 1],
      [ARCTIC_MONKEYS_MBID, 1],
    ]);
  });

  it("AC-37: an error on Load more is a role=alert in place of the button, rows stay and focus is not moved", async () => {
    const api = fakeApi({
      getArtistSetlists: inTurn<ArtistSetlistsResponse>([arcticMonkeysPage1(), SETLISTFM_DOWN, arcticMonkeysPage2()]),
    });
    const { user } = openApp(api, `/artists/${ARCTIC_MONKEYS_MBID}`);
    const more = await screen.findByRole("button", { name: "Load more Setlists" });
    await user.click(more);

    const alert = await findAlert("setlist.fm isn't answering right now.");
    getByLine("Try again in a minute.", alert);
    expect(screen.queryByRole("button", { name: "Load more Setlists" })).toBeNull();
    expect(linksTo("/setlists/")).toHaveLength(3);
    expect(screen.queryByRole("heading", { level: 2, name: "setlist.fm isn't answering right now." })).toBeNull();
    expect(document.activeElement === document.body || !alert.contains(document.activeElement)).toBe(true);

    await user.click(within(alert).getByRole("button", { name: "Try again" }));
    await screen.findByRole("link", { name: "19 Nov 2026, Bell Centre, 20 songs" });
    expect(api.getArtistSetlists.mock.calls.map((call) => call.slice(0, 2))).toEqual([
      [ARCTIC_MONKEYS_MBID, 1],
      [ARCTIC_MONKEYS_MBID, 2],
      [ARCTIC_MONKEYS_MBID, 2],
    ]);
  });

  it("AC-42: NOT_FOUND on the Setlist list is a screen alert with a link to search for an Artist", async () => {
    const api = fakeApi({ getArtistSetlists: inTurn<ArtistSetlistsResponse>([NO_SUCH_ARTIST]) });
    openApp(api, `/artists/${ARCTIC_MONKEYS_MBID}`);
    await expectFocusOn(() => screen.getByRole("heading", { name: "setlist.fm has no Artist with that id." }));
    getByLine("Search for the Artist by name.");
    expect(screen.getByRole("link", { name: "Search for an Artist" }).getAttribute("href")).toBe("/");
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("AC-52: the Setlist list error alert has no axe violations", async () => {
    const api = fakeApi({ getArtistSetlists: inTurn<ArtistSetlistsResponse>([SETLISTFM_DOWN]) });
    const { container } = openApp(api, `/artists/${ARCTIC_MONKEYS_MBID}`);
    await screen.findByRole("heading", { level: 2, name: "setlist.fm isn't answering right now." });
    expect(await axe(container)).toHaveNoViolations();
  });
});

// ---------------------------------------------------------------- Setlist status

describe("Setlist status errors", () => {
  it("AC-42: NOT_FOUND on the status is an h1 alert, focused, with a link to search for an Artist", async () => {
    const api = fakeApi({ getSetlist: inTurn<SetlistResponse>([NO_SUCH_SETLIST]) });
    openApp(api, `/setlists/${PORTLAND_ID}`);
    await expectFocusOn(() => screen.getByRole("heading", { level: 1, name: "setlist.fm has no Setlist with that id." }));
    getByLine("Check the link, or search for the Artist.");
    expect(screen.getByRole("link", { name: "Search for an Artist" }).getAttribute("href")).toBe("/");
    expect(api.streamPreview).not.toHaveBeenCalled();
    expectNoTechnicalText();
  });

  it("AC-39: NOT_ADMIN behaves like UPSTREAM_UNAVAILABLE, with Try again re-asking for the status", async () => {
    const notAdmin = new ApiCallError({ code: "NOT_ADMIN", message: "Only the admin can do that.", hint: "Log in on the admin page." });
    const api = fakeApi({
      getSetlist: inTurn<SetlistResponse>([notAdmin, madridStatus({ status: "current", url: SHARE_URL })]),
    });
    const { user } = openApp(api, `/setlists/${MADRID_ID}`);
    await screen.findByRole("heading", { level: 1, name: "Only the admin can do that." });
    getByLine("Log in on the admin page.");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByRole("heading", { level: 2, name: "Setlist Playlist ready" });
    expect(api.getSetlist).toHaveBeenCalledTimes(2);
    expect(api.getSetlist.mock.calls[1]?.[0]).toBe(MADRID_ID);
  });

  it("AC-52: the Setlist not-found alert has no axe violations", async () => {
    const api = fakeApi({ getSetlist: inTurn<SetlistResponse>([NO_SUCH_SETLIST]) });
    const { container } = openApp(api, `/setlists/${PORTLAND_ID}`);
    await screen.findByRole("heading", { level: 1, name: "setlist.fm has no Setlist with that id." });
    expect(await axe(container)).toHaveNoViolations();
  });
});

// ---------------------------------------------------------------- preview

describe("preview errors", () => {
  it("AC-38: RATE_LIMITED from the preview without a retry wait is an h2 alert with Try again enabled and no countdown", async () => {
    const manyPreviews = new ApiCallError({
      code: "RATE_LIMITED", message: "You've asked for many previews in the last hour.",
      hint: "Try again later, or open a Setlist that already has a playlist.",
    });
    const { preview, user } = openSetlistScreen();
    await waitFor(() => expect(preview.calls).toHaveLength(1));
    await preview.fail(manyPreviews);

    const alertHeading = await screen.findByRole("heading", { level: 2, name: "You've asked for many previews in the last hour." });
    expect(isBefore(getByLine("Madrid"), alertHeading)).toBe(true);
    await expectFocusOn(() => screen.getByRole("heading", { level: 2, name: "You've asked for many previews in the last hour." }));
    getByLine("Try again later, or open a Setlist that already has a playlist.");
    expect(normalise(document.body.textContent)).not.toContain("You can try again in");
    const tryAgain = screen.getByRole("button", { name: "Try again" });
    expect(tryAgain.getAttribute("aria-disabled")).not.toBe("true");

    await user.click(tryAgain);
    await waitFor(() => expect(preview.calls).toHaveLength(2));
    expect(preview.last().id).toBe(MADRID_ID);
  });

  it("AC-44: an error event after some progress replaces the progress line and bar, and Try again starts a new preview", async () => {
    const { preview, user } = openSetlistScreen();
    await waitFor(() => expect(preview.calls).toHaveLength(1));
    preview.progress(2, 5);
    await waitFor(() => getByLine("Matching 2 of 5 Performances"));
    await preview.fail(SPOTIFY_DOWN);

    await screen.findByRole("heading", { level: 2, name: "Spotify isn't answering right now." });
    getByLine("Try again in a minute.");
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(queryByLine("Matching 2 of 5 Performances")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(preview.calls).toHaveLength(2));
    await preview.finish(madridResult());
    await screen.findByRole("button", { name: "Create playlist" });
    expect(screen.queryByRole("heading", { name: "Spotify isn't answering right now." })).toBeNull();
  });

  it("AC-40: PLAYLISTS_UNAVAILABLE from the preview reached from a list links back to that list", async () => {
    const { preview } = await openSetlistFromList();
    await waitFor(() => expect(preview.calls).toHaveLength(1));
    await preview.fail(PLAYLISTS_OFF);

    await waitFor(() => getByLine("Playlist creation is temporarily unavailable"));
    getByLine("Search and existing playlists still work. Try again later.");
    expect(queryByLine("Playlists can't be made right now.")).toBeNull();
    const toList = screen.getAllByRole("link", { name: "Setlists of Arctic Monkeys" });
    expect(toList).toHaveLength(2);
    for (const link of toList) expect(link.getAttribute("href")).toBe(`/artists/${ARCTIC_MONKEYS_MBID}`);
    expect(screen.queryByRole("button", { name: "Create playlist" })).toBeNull();
  });

  it("AC-40: PLAYLISTS_UNAVAILABLE from a directly opened Setlist links to the search, and the outdated link stays", async () => {
    const { preview } = openSetlistScreen(madridOutdatedStatus());
    await waitFor(() => expect(preview.calls).toHaveLength(1));
    await preview.fail(PLAYLISTS_OFF);

    const title = await waitFor(() => getByLine("Playlist creation is temporarily unavailable"));
    expect(isBefore(getByLine("Madrid"), title)).toBe(true);
    expect(screen.getByRole("link", { name: "Search for an Artist" }).getAttribute("href")).toBe("/");
    expect(screen.getByRole("link", { name: "Open current playlist (opens in a new tab)" }).getAttribute("href")).toBe(SHARE_URL);
  });

  it("AC-40: PLAYLISTS_UNAVAILABLE without a hint shows the server's message as the body", async () => {
    const { preview } = openSetlistScreen();
    await waitFor(() => expect(preview.calls).toHaveLength(1));
    await preview.fail(new ApiCallError({ code: "PLAYLISTS_UNAVAILABLE", message: "Playlists can't be made right now." }));
    await waitFor(() => getByLine("Playlist creation is temporarily unavailable"));
    getByLine("Playlists can't be made right now.");
  });

  it("AC-52: the preview's PLAYLISTS_UNAVAILABLE alert has no axe violations", async () => {
    const { preview, container } = openSetlistScreen();
    await waitFor(() => expect(preview.calls).toHaveLength(1));
    await preview.fail(PLAYLISTS_OFF);
    await waitFor(() => getByLine("Playlist creation is temporarily unavailable"));
    expect(await axe(container)).toHaveNoViolations();
  });

  it("AC-52: the preview's error-event alert has no axe violations", async () => {
    const { preview, container } = openSetlistScreen();
    await waitFor(() => expect(preview.calls).toHaveLength(1));
    await preview.fail(SPOTIFY_DOWN);
    await screen.findByRole("heading", { level: 2, name: "Spotify isn't answering right now." });
    expect(await axe(container)).toHaveNoViolations();
  });
});

// ---------------------------------------------------------------- create and update

async function openAndCreate(error: ApiCallError, status = madridStatus(), options: { fakeTimers?: boolean } = {}) {
  const opened = await openFinishedPreview(status, madridResult(), { createPlaylist: () => Promise.reject(error) }, options);
  const action = status.playlist.status === "outdated" ? "Update playlist" : "Create playlist";
  await opened.user.click(screen.getByRole("button", { name: action }));
  return opened;
}

describe("create and update errors", () => {
  it("AC-40: PLAYLISTS_UNAVAILABLE from Create replaces the action with a role=alert and keeps the preview", async () => {
    await openAndCreate(PLAYLISTS_OFF);
    const alert = await findAlert("Playlist creation is temporarily unavailable");
    getByLine("Search and existing playlists still work. Try again later.", alert);
    expect(screen.queryByRole("button", { name: "Create playlist" })).toBeNull();
    expect(setRows("Main set")).toHaveLength(5);
    getByLine("4 Matches");
  });

  it("AC-37: an error on Create does not move focus to the alert", async () => {
    await openAndCreate(PLAYLISTS_OFF);
    const alert = await findAlert("Playlist creation is temporarily unavailable");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(alert.contains(document.activeElement)).toBe(false);
  });

  it("AC-41: SETLIST_CHANGED offers Load fresh preview, which asks for the status and the preview again", async () => {
    const { api, preview, user } = await openAndCreate(SETLIST_CHANGED);
    await waitFor(() => getByLine("This Setlist changed on setlist.fm a moment ago."));
    getByLine("Load a fresh preview to see the new songs.");
    expect(screen.queryByRole("button", { name: "Create playlist" })).toBeNull();
    expect(api.getSetlist).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Load fresh preview" }));
    await waitFor(() => expect(api.getSetlist).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(preview.calls).toHaveLength(2));
    await expectFocusOn(() => screen.getByRole("heading", { level: 1, name: "Arctic Monkeys" }));

    const fresh = madridResult();
    fresh.versionId = "h4f6a8b02";
    await preview.finish(fresh);
    await user.click(await screen.findByRole("button", { name: "Create playlist" }));
    await waitFor(() => expect(api.createPlaylist).toHaveBeenCalledTimes(2));
    expect(api.createPlaylist.mock.calls[1]).toEqual([MADRID_ID, "h4f6a8b02"]);
  });

  it("AC-38: RATE_LIMITED from Create with a 600-second wait shows the countdown in place of the button", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const manyPlaylists = new ApiCallError({
      code: "RATE_LIMITED", message: "You've made many playlists in the last hour.", hint: "Try again later.", retryAfterSeconds: 600,
    });
    await openAndCreate(manyPlaylists, madridStatus(), { fakeTimers: true });
    const alert = await findAlert("You've made many playlists in the last hour.");
    getByLine("Try again later.", alert);
    getByLine("You can try again in 10:00", alert);
    expect(within(alert).getByRole("button", { name: "Try again" }).getAttribute("aria-disabled")).toBe("true");
    expect(screen.queryByRole("button", { name: "Create playlist" })).toBeNull();
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    await waitFor(() => getByLine("You can try again in 9:59", alert));
  });

  it("AC-39: UPSTREAM_UNAVAILABLE from Update offers Try again, which re-sends the same update", async () => {
    let calls = 0;
    const opened = await openFinishedPreview(madridOutdatedStatus(), madridResult(), {
      createPlaylist: () => {
        calls += 1;
        return calls === 1 ? Promise.reject(SPOTIFY_DOWN) : new Promise(() => undefined);
      },
    });
    await opened.user.click(screen.getByRole("button", { name: "Update playlist" }));
    const alert = await findAlert("Spotify isn't answering right now.");
    await opened.user.click(within(alert).getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(opened.api.createPlaylist).toHaveBeenCalledTimes(2));
    expect(opened.api.createPlaylist.mock.calls[1]).toEqual([MADRID_ID, "g3e5f7a91"]);
  });

  it("AC-43: INVALID_INPUT from Create is an action alert with the message and no button", async () => {
    await openAndCreate(new ApiCallError({ code: "INVALID_INPUT", message: "There are no Matches to put in a playlist." }));
    const alert = await findAlert("There are no Matches to put in a playlist.");
    expect(within(alert).queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Create playlist" })).toBeNull();
  });

  it("AC-52: the Create error alerts have no axe violations", async () => {
    const { container } = await openAndCreate(SETLIST_CHANGED);
    await screen.findByRole("button", { name: "Load fresh preview" });
    expect(await axe(container)).toHaveNoViolations();
  });

  it("AC-52: the Create rate-limit alert has no axe violations", async () => {
    const { container } = await openAndCreate(
      new ApiCallError({ code: "RATE_LIMITED", message: "You've made many playlists in the last hour.", hint: "Try again later.", retryAfterSeconds: 600 }),
    );
    await findAlert("You've made many playlists in the last hour.");
    expect(await axe(container)).toHaveNoViolations();
  });
});
