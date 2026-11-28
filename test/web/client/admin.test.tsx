// The admin page at /admin: loading, the logged-out view, login problems, the dashboard of the
// Host Account's status, config and usage, status errors, log out, and leaving and coming back.
import { act, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../../../src/web/client/App.js";
import type { AdminStatusResponse } from "../../../src/web/shared/index.js";
import { deferred, fakeApi } from "./fixtures/fake-api";
import {
  announced,
  currentUrl,
  expectFocusOn,
  findAlert,
  getByLine,
  isBefore,
  listAfter,
  normalise,
  queryByLine,
  recordAnnouncements,
} from "./fixtures/dom";
import {
  connectedStatus,
  connectedWithoutNameStatus,
  e2DaysNewestFirst,
  freshInstallStatus,
  inTurn,
  noConfigStatus,
  notAdmin,
  oneUpdateStatus,
  openAdmin,
  openDashboard,
  openLoggedOut,
  ourSide,
  pendingStatus,
  playsetUnreachable,
  recordsUnreadable,
  tooManyRequests,
} from "./fixtures/admin-values";

afterEach(() => {
  vi.useRealTimers();
});

const LOGGED_OUT_LINE = "Log in as the Host Account to see its status and usage.";

/**
 * Lets every pending promise and timer task run (a few rounds of macrotasks), so a late effect,
 * request or announcement would have shown before a "nothing happened" check.
 */
async function settle(): Promise<void> {
  for (let round = 0; round < 3; round++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

/** Text with all white space removed, to compare an element's whole text with its lines. */
function withoutSpaces(text: string | null | undefined): string {
  return (text ?? "").replace(/\s+/g, "");
}

/** The alert or its title is the h1's very next element: nothing sits between them. */
function expectDirectlyUnderH1(el: HTMLElement): void {
  const next = h1().nextElementSibling;
  expect(next, "an element right after the h1").not.toBeNull();
  expect(next === el || next?.contains(el) === true, "the element right after the h1 holds it").toBe(true);
}

function h1(): HTMLElement {
  return screen.getByRole("heading", { level: 1, name: "Admin" });
}

function banner(): HTMLElement {
  return screen.getByRole("banner");
}

function h2Names(): string[] {
  return screen.getAllByRole("heading", { level: 2 }).map((h) => normalise(h.textContent));
}

/**
 * Clicks `link` and tells whether the app let the browser follow it (a full page load the
 * server handles) rather than handling it in the app. The browser's own navigation is then
 * stopped, since jsdom can't load another page.
 */
function followsAsFullPageLoad(link: HTMLElement): boolean {
  let leftToBrowser = false;
  const listener = (event: MouseEvent) => {
    leftToBrowser = !event.defaultPrevented;
    event.preventDefault();
  };
  window.addEventListener("click", listener);
  try {
    link.click();
  } finally {
    window.removeEventListener("click", listener);
  }
  return leftToBrowser;
}

function expectLeavesAppTo(link: HTMLElement, href: string): void {
  expect(link.tagName).toBe("A");
  expect(link.getAttribute("href")).toBe(href);
  const before = currentUrl();
  expect(followsAsFullPageLoad(link)).toBe(true);
  expect(currentUrl()).toBe(before);
}

/** The cells a person reads in a table row (a hidden bar cell carries nothing). */
function rowTexts(row: HTMLElement): string[] {
  const header = within(row).getByRole("rowheader");
  const cells = within(row).queryAllByRole("cell").map((cell) => normalise(cell.textContent)).filter((t) => t !== "");
  return [normalise(header.textContent), ...cells];
}

function bodyRows(table: HTMLElement): HTMLElement[] {
  return within(table).getAllByRole("row").filter((row) => within(row).queryAllByRole("rowheader").length === 1);
}

// ---------------------------------------------------------------- opening /admin

describe("opening /admin", () => {
  it("AC-1: shows the shell with Admin after the wordmark, the title and h1, and only the loading line while pending", async () => {
    const status = pendingStatus();
    const { api } = openAdmin({ getAdminStatus: status.getAdminStatus });

    await screen.findByRole("heading", { level: 1, name: "Admin" });
    await waitFor(() => expect(document.title).toBe("Admin – Playset"));
    getByLine("Loading the status…");

    expect(screen.getByRole("link", { name: "Skip to content" }).getAttribute("href")).toBe(`#${screen.getByRole("main").id}`);
    expect(document.querySelectorAll("main")).toHaveLength(1);
    const footer = screen.getByRole("contentinfo");
    expect(within(footer).getByRole("link", { name: "Terms and Privacy" }).getAttribute("href")).toBe("/terms");
    const wordmark = within(banner()).getByRole("link", { name: "Playset" });
    expect(wordmark.getAttribute("href")).toBe("/");
    expect(normalise(banner().textContent)).toBe("Playset Admin");
    const adminLabel = getByLine("Admin", banner());
    expect(isBefore(wordmark, adminLabel)).toBe(true);

    expect(screen.queryAllByRole("heading", { level: 2 })).toHaveLength(0);
    expect(screen.queryByRole("link", { name: "Log in with Spotify" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Log out" })).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
    expect(queryByLine(LOGGED_OUT_LINE)).toBeNull();

    await settle();
    expect(api.getAdminStatus).toHaveBeenCalledTimes(1);
    expect(status.calls).toHaveLength(1);
  });

  it("AC-1: with an in-memory start path, /admin asks for the status once and shows the admin screen", async () => {
    const api = fakeApi({ getAdminStatus: async () => Promise.reject(notAdmin()) });
    render(<App api={api} initialPath="/admin" />);
    await screen.findByRole("link", { name: "Log in with Spotify" });
    expect(screen.getByRole("heading", { level: 1, name: "Admin" })).toBe(h1());
    await waitFor(() => expect(document.title).toBe("Admin – Playset"));
    expect(api.getAdminStatus).toHaveBeenCalledTimes(1);
  });

  it.each<[string, () => Promise<unknown>]>([
    ["the logged-out view", () => openLoggedOut()],
    ["the logged-out view with a login problem", () => openLoggedOut("/admin?login=NOT_ADMIN")],
    ["the dashboard", () => openDashboard()],
    ["a status error", async () => {
      openAdmin({ getAdminStatus: inTurn<AdminStatusResponse>([recordsUnreadable()]) });
      await screen.findByRole("button", { name: "Try again" });
    }],
    ["the logged-out view after logging out", async () => {
      const { user } = await openDashboard(connectedStatus(), { logOut: async () => undefined });
      await user.click(within(banner()).getByRole("button", { name: "Log out" }));
      await screen.findByRole("link", { name: "Log in with Spotify" });
    }],
  ])("AC-1: the document title is Admin – Playset on %s", async (_state, open) => {
    await open();
    await waitFor(() => expect(document.title).toBe("Admin – Playset"));
    expect(normalise(banner().textContent).startsWith("Playset Admin")).toBe(true);
  });

  it("AC-1: the header Admin text shows only on /admin, not on Visitor screens", async () => {
    openAdmin({}, "/terms");
    await screen.findByRole("heading", { level: 1, name: "Terms and Privacy" });
    expect(normalise(banner().textContent)).toBe("Playset");
  });

  it.each(["/admin/settings", "/admin/x/y", "/admin/login/extra", "/admin/login", "/admin/callback"])(
    "AC-3: %s shows Page not found and asks for no status",
    async (path) => {
      const { api } = openAdmin({}, path);
      await screen.findByRole("heading", { level: 1, name: "Page not found" });
      await waitFor(() => expect(document.title).toBe("Page not found – Playset"));
      expect(screen.getByRole("link", { name: "New search" }).getAttribute("href")).toBe("/");
      await settle();
      expect(api.getAdminStatus).not.toHaveBeenCalled();
      expect(api.logOut).not.toHaveBeenCalled();
    },
  );

  it("AC-3: /admin/ with a trailing slash is /admin itself, not a path under it", async () => {
    const { api } = await openLoggedOut("/admin/");
    expect(h1()).toBeTruthy();
    expect(screen.queryByRole("heading", { level: 1, name: "Page not found" })).toBeNull();
    expect(api.getAdminStatus).toHaveBeenCalledTimes(1);
  });

  it("AC-3: an in-memory start path under /admin/ shows Page not found and asks for no status", async () => {
    const api = fakeApi();
    render(<App api={api} initialPath="/admin/settings" />);
    await screen.findByRole("heading", { level: 1, name: "Page not found" });
    await settle();
    expect(api.getAdminStatus).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------- leaving and coming back

describe("leaving and coming back", () => {
  it("AC-2: leaving while the status is pending aborts its signal and announces nothing; coming back asks again", async () => {
    const status = pendingStatus();
    const { api, user } = openAdmin({ getAdminStatus: status.getAdminStatus });
    await screen.findByRole("heading", { level: 1, name: "Admin" });
    await waitFor(() => expect(status.calls).toHaveLength(1));
    const firstSignal = status.calls[0]?.signal;
    expect(firstSignal).toBeInstanceOf(AbortSignal);
    const announcements = recordAnnouncements();

    await user.click(within(banner()).getByRole("link", { name: "Playset" }));
    await screen.findByRole("heading", { level: 1, name: "Hear the Setlist before the Show" });
    expect(firstSignal?.aborted).toBe(true);
    await settle();
    expect(announcements).toEqual([]);
    expect(queryByLine("Loading the status…")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();

    await act(async () => window.history.back());
    await waitFor(() => expect(currentUrl()).toBe("/admin"));
    await waitFor(() => expect(api.getAdminStatus).toHaveBeenCalledTimes(2));
    getByLine("Loading the status…");
    await act(async () => status.calls.at(-1)?.answer.resolve(connectedStatus()));
    await screen.findByRole("heading", { level: 2, name: "Host Account" });
  });

  it("AC-2: coming back to /admin after the dashboard was shown asks for the status again and shows loading, not the earlier answer", async () => {
    const second = deferred<AdminStatusResponse>();
    const { api, user } = await openDashboard(connectedStatus(), {
      getAdminStatus: inTurn<AdminStatusResponse>([connectedStatus(), second]),
    });

    await user.click(within(screen.getByRole("contentinfo")).getByRole("link", { name: "Terms and Privacy" }));
    await screen.findByRole("heading", { level: 1, name: "Terms and Privacy" });
    await act(async () => window.history.back());
    await waitFor(() => expect(currentUrl()).toBe("/admin"));

    await waitFor(() => expect(api.getAdminStatus).toHaveBeenCalledTimes(2));
    getByLine("Loading the status…");
    expect(screen.queryByRole("heading", { level: 2, name: "Host Account" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Log out" })).toBeNull();

    await act(async () => second.resolve(freshInstallStatus()));
    await screen.findByRole("heading", { level: 2, name: "Host Account not connected" });
  });
});

// ---------------------------------------------------------------- logged out

describe("logged out", () => {
  it("AC-4: NOT_ADMIN shows the logged-out view with a Log in with Spotify link that leaves the app, and focuses the h1", async () => {
    const { api } = await openLoggedOut();
    await expectFocusOn(h1);
    getByLine(LOGGED_OUT_LINE);
    const login = screen.getByRole("link", { name: "Log in with Spotify" });
    expectLeavesAppTo(login, "/admin/login");

    expect(queryByLine("Log in as the Host Account to see this page.")).toBeNull();
    expect(queryByLine("Use the Log in with Spotify button.")).toBeNull();
    expect(screen.queryAllByRole("alert")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Log out" })).toBeNull();
    expect(screen.queryAllByRole("heading", { level: 2 })).toHaveLength(0);
    expect(normalise(banner().textContent)).toBe("Playset Admin");
    expect(api.getAdminStatus).toHaveBeenCalledTimes(1);
  });

  it("AC-4: the logged-out text and link come after the h1", async () => {
    await openLoggedOut();
    expect(isBefore(h1(), getByLine(LOGGED_OUT_LINE))).toBe(true);
    expect(isBefore(getByLine(LOGGED_OUT_LINE), screen.getByRole("link", { name: "Log in with Spotify" }))).toBe(true);
  });
});

// ---------------------------------------------------------------- login problems

describe("login problems", () => {
  it.each([
    [
      "NOT_ADMIN",
      "That Spotify account isn't the Host Account.",
      "Nothing was changed. Log in with the Spotify account Playset uses as its Host Account.",
    ],
    [
      "INVALID_INPUT",
      "The Spotify login didn't finish.",
      "Spotify didn't confirm the login, or it was cancelled. Log in with Spotify again.",
    ],
    ["UPSTREAM_UNAVAILABLE", "Spotify isn't answering right now.", "Try logging in again in a minute."],
    ["INTERNAL", "The login didn't work.", "Something went wrong on our side. Try logging in again in a minute."],
    ["RATE_LIMITED", "The login didn't work.", "Something went wrong on our side. Try logging in again in a minute."],
    ["NOT_FOUND", "The login didn't work.", "Something went wrong on our side. Try logging in again in a minute."],
    ["PLAYLISTS_UNAVAILABLE", "The login didn't work.", "Something went wrong on our side. Try logging in again in a minute."],
    ["SETLIST_CHANGED", "The login didn't work.", "Something went wrong on our side. Try logging in again in a minute."],
  ])("AC-5: login=%s on the logged-out view shows the alert under the h1 and focuses its h2", async (code, title, body) => {
    await openLoggedOut(`/admin?login=${code}`);
    const alertTitle = await screen.findByRole("heading", { level: 2, name: title });
    await expectFocusOn(() => screen.getByRole("heading", { level: 2, name: title }));
    const bodyLine = getByLine(body);
    expectDirectlyUnderH1(alertTitle);
    expect(isBefore(h1(), alertTitle)).toBe(true);
    expect(isBefore(alertTitle, bodyLine)).toBe(true);
    expect(isBefore(bodyLine, getByLine(LOGGED_OUT_LINE))).toBe(true);
    expect(isBefore(getByLine(LOGGED_OUT_LINE), screen.getByRole("link", { name: "Log in with Spotify" }))).toBe(true);
    expect(h2Names()).toEqual([title]);
    // The alert has no button of its own; the logged-out view has none either.
    expect(within(screen.getByRole("main")).queryAllByRole("button")).toHaveLength(0);
    expect(currentUrl()).toBe(`/admin?login=${code}`);
  });

  it("AC-5: login=UPSTREAM_UNAVAILABLE with a status answer sits above the Host Account block and takes focus", async () => {
    await openDashboard(connectedStatus(), {}, "/admin?login=UPSTREAM_UNAVAILABLE");
    const title = () => screen.getByRole("heading", { level: 2, name: "Spotify isn't answering right now." });
    await expectFocusOn(title);
    getByLine("Try logging in again in a minute.");
    expect(h2Names()).toEqual(["Spotify isn't answering right now.", "Host Account", "Config", "Usage", "Last 30 days", "Top Artists"]);
    expectDirectlyUnderH1(title());
    expect(isBefore(getByLine("Try logging in again in a minute."), getByLine("Connected as playset-host"))).toBe(true);
  });

  it.each(["/admin?login=wrong-account", "/admin?login=", "/admin?login=not_admin"])(
    "AC-6: %s shows no login problem alert and focuses the h1",
    async (path) => {
      await openLoggedOut(path);
      await expectFocusOn(h1);
      expect(screen.queryAllByRole("heading", { level: 2 })).toHaveLength(0);
      expect(queryByLine("The login didn't work.")).toBeNull();
      expect(screen.queryAllByRole("alert")).toHaveLength(0);
      getByLine(LOGGED_OUT_LINE);
    },
  );
});

// ---------------------------------------------------------------- dashboard

describe("dashboard", () => {
  it("AC-7: shows the sections in order under the h1, Log out in the header, and focuses the h1", async () => {
    const { api } = await openDashboard();
    await expectFocusOn(h1);
    expect(h2Names()).toEqual(["Host Account", "Config", "Usage", "Last 30 days", "Top Artists"]);
    expect(isBefore(h1(), screen.getByRole("heading", { level: 2, name: "Host Account" }))).toBe(true);
    const logOut = within(banner()).getByRole("button", { name: "Log out" });
    expect(normalise(banner().textContent)).toBe("Playset Admin Log out");
    expect(isBefore(getByLine("Admin", banner()), logOut)).toBe(true);
    expect(within(screen.getByRole("main")).queryByRole("button", { name: "Log out" })).toBeNull();
    expect(api.getAdminStatus).toHaveBeenCalledTimes(1);
  });

  it("AC-8: a connected Host Account shows Connected as its name and a Reconnect link that leaves the app", async () => {
    await openDashboard();
    const heading = screen.getByRole("heading", { level: 2, name: "Host Account" });
    const connected = getByLine("Connected as playset-host");
    expect(isBefore(heading, connected)).toBe(true);
    const reconnect = screen.getByRole("link", { name: "Reconnect" });
    expect(isBefore(connected, reconnect)).toBe(true);
    expect(isBefore(reconnect, screen.getByRole("heading", { level: 2, name: "Config" }))).toBe(true);
    expectLeavesAppTo(reconnect, "/admin/login");
    expect(screen.queryByRole("heading", { name: "Host Account not connected" })).toBeNull();
  });

  it("AC-8: without a display name the line reads Connected", async () => {
    await openDashboard(connectedWithoutNameStatus());
    getByLine("Connected");
    expect(normalise(document.body.textContent)).not.toContain("Connected as");
    expect(screen.getByRole("link", { name: "Reconnect" }).getAttribute("href")).toBe("/admin/login");
  });

  it("AC-9: a Host Account not connected shows the caution alert with a Reconnect link, then the other sections", async () => {
    await openDashboard(freshInstallStatus());
    const heading = screen.getByRole("heading", { level: 2, name: "Host Account not connected" });
    const text = getByLine("Visitors can search and open playlists. Previews and new playlists are unavailable.");
    const reconnect = screen.getByRole("link", { name: "Reconnect" });
    expect(isBefore(heading, text)).toBe(true);
    expect(isBefore(text, reconnect)).toBe(true);
    expectLeavesAppTo(reconnect, "/admin/login");
    expect(screen.getAllByRole("link", { name: "Reconnect" })).toHaveLength(1);
    expect(h2Names()).toEqual(["Host Account not connected", "Config", "Usage", "Last 30 days", "Top Artists"]);
    expect(queryByLine("Connected")).toBeNull();
    expect(normalise(document.body.textContent)).not.toContain("Connected as");
    expect(within(banner()).getByRole("button", { name: "Log out" }).tagName).toBe("BUTTON");
  });

  it("AC-10: the Config list shows each label as given with present or missing, in the server's order", async () => {
    await openDashboard();
    const list = listAfter(screen.getByRole("heading", { level: 2, name: "Config" }));
    const items = within(list).getAllByRole("listitem");
    expect(items.map((item) => normalise(item.textContent))).toEqual([
      "setlist.fm API key present",
      "Spotify client id present",
      "Host Account id present",
      "Cookie secret missing",
    ]);
    const missing = items[3];
    if (!missing) throw new Error("no fourth config item");
    getByLine("missing", missing);
    expect(isBefore(list, screen.getByRole("heading", { level: 2, name: "Usage" }))).toBe(true);
  });

  it("AC-10: no env name or config value is shown", async () => {
    await openDashboard();
    const text = normalise(document.body.textContent);
    for (const envName of ["SETLISTFM_API_KEY", "SPOTIFY_CLIENT_ID", "PLAYSET_HOST_SPOTIFY_ID", "PLAYSET_COOKIE_SECRET"]) {
      expect(text).not.toContain(envName);
    }
  });

  it("AC-10: a fresh install's config shows four present items", async () => {
    await openDashboard(freshInstallStatus());
    const list = listAfter(screen.getByRole("heading", { level: 2, name: "Config" }));
    expect(within(list).getAllByRole("listitem").map((item) => normalise(item.textContent))).toEqual([
      "setlist.fm API key present",
      "Spotify client id present",
      "Host Account id present",
      "Cookie secret present",
    ]);
  });

  it("AC-10: an empty config list reads No config reported. instead of a list", async () => {
    await openDashboard(noConfigStatus());
    const line = getByLine("No config reported.");
    const config = screen.getByRole("heading", { level: 2, name: "Config" });
    const usage = screen.getByRole("heading", { level: 2, name: "Usage" });
    expect(isBefore(config, line)).toBe(true);
    expect(isBefore(line, usage)).toBe(true);
    const listsBetween = Array.from(document.querySelectorAll("ul, ol")).filter((list) => isBefore(config, list) && isBefore(list, usage));
    expect(listsBetween).toHaveLength(0);
  });

  it("AC-11: the Usage description list shows the three terms in order with grouped numbers", async () => {
    await openDashboard();
    const usage = screen.getByRole("heading", { level: 2, name: "Usage" });
    const dl = Array.from(document.querySelectorAll("dl")).find((candidate) => isBefore(usage, candidate));
    if (!dl) throw new Error("no description list after Usage");
    expect(Array.from(dl.querySelectorAll("dt")).map((dt) => normalise(dt.textContent))).toEqual([
      "Playlists made",
      "Opens",
      "Rate-limit hits today",
    ]);
    expect(Array.from(dl.querySelectorAll("dd")).map((dd) => normalise(dd.textContent))).toEqual(["128", "1,042", "3"]);
    expect(isBefore(dl, screen.getByRole("heading", { level: 2, name: "Last 30 days" }))).toBe(true);
  });

  it("AC-11: zero usage reads No playlists made yet., No opens yet. and 0", async () => {
    await openDashboard(freshInstallStatus());
    const dl = document.querySelector("dl");
    if (!dl) throw new Error("no description list");
    expect(Array.from(dl.querySelectorAll("dt")).map((dt) => normalise(dt.textContent))).toEqual([
      "Playlists made",
      "Opens",
      "Rate-limit hits today",
    ]);
    expect(Array.from(dl.querySelectorAll("dd")).map((dd) => normalise(dd.textContent))).toEqual([
      "No playlists made yet.",
      "No opens yet.",
      "0",
    ]);
  });

  it("AC-12: the Last 30 days table has the caption, the four column headers and 30 rows newest first", async () => {
    await openDashboard();
    const table = screen.getByRole("table", { name: "Setlist Playlists made, updated and opened per day, last 30 days" });
    expect(isBefore(screen.getByRole("heading", { level: 2, name: "Last 30 days" }), table)).toBe(true);
    expect(isBefore(table, screen.getByRole("heading", { level: 2, name: "Top Artists" }))).toBe(true);
    const caption = table.querySelector("caption");
    expect(normalise(caption?.textContent)).toBe("Setlist Playlists made, updated and opened per day, last 30 days");
    expect(
      within(table).getAllByRole("columnheader").map((th) => normalise(th.textContent)).filter((t) => t !== ""),
    ).toEqual(["Day", "Made", "Updated", "Opens"]);

    const rows = bodyRows(table);
    expect(rows).toHaveLength(30);
    const first = rows[0];
    const second = rows[1];
    const last = rows[29];
    if (!first || !second || !last) throw new Error("missing rows");
    expect(rowTexts(first)).toEqual(["28 Nov", "4", "1", "37"]);
    expect(rowTexts(second)).toEqual(["27 Nov", "2", "0", "21"]);
    expect(rowTexts(last)).toEqual(["30 Oct", "0", "0", "0"]);
    expect(within(first).getByRole("rowheader").querySelector("time")?.getAttribute("dateTime")).toBe("2026-11-28");
    expect(within(last).getByRole("rowheader").querySelector("time")?.getAttribute("dateTime")).toBe("2026-10-30");

    // Every row, in order, with its own numbers: a mix-up of rows or columns in the middle shows.
    const labels = [
      ...Array.from({ length: 28 }, (_unused, i) => `${28 - i} Nov`),
      "31 Oct",
      "30 Oct",
    ];
    expect(labels[19]).toBe("9 Nov");
    expect(labels[27]).toBe("1 Nov");
    const expectedRows = e2DaysNewestFirst().map((day, i) => [labels[i], String(day.created), String(day.updated), String(day.opened)]);
    expect(rows.map(rowTexts)).toEqual(expectedRows);
    expect(rowTexts(rows[2] ?? first)).toEqual(["26 Nov", "1", "0", "28"]);
    expect(rowTexts(rows[3] ?? first)).toEqual(["25 Nov", "1", "1", "27"]);

    const expectedDates = connectedStatus().usage.perDay.map((day) => day.date).sort().reverse();
    expect(rows.map((row) => within(row).getByRole("rowheader").querySelector("time")?.getAttribute("dateTime"))).toEqual(expectedDates);
  });

  it("AC-12: the rows are newest first whatever order the server sends", async () => {
    const status = connectedStatus();
    const shuffled = [...status.usage.perDay];
    const moved = shuffled.splice(10, 5);
    shuffled.push(...moved);
    await openDashboard({ ...status, usage: { ...status.usage, perDay: shuffled } });
    const rows = bodyRows(screen.getByRole("table"));
    const dates = rows.map((row) => within(row).getByRole("rowheader").querySelector("time")?.getAttribute("dateTime"));
    expect(dates).toEqual(status.usage.perDay.map((day) => day.date).sort().reverse());
  });

  it("AC-12: a day bar, if shown, is hidden from assistive technology and carries no text", async () => {
    await openDashboard();
    const rows = bodyRows(screen.getByRole("table"));
    // A row is its day and its three numbers; anything else in it can only be the bar.
    const extras = rows.map((row) =>
      Array.from(row.querySelectorAll("td")).filter((cell) => normalise(cell.textContent) === ""),
    );
    for (const row of rows) {
      expect(Array.from(row.querySelectorAll("td")).filter((cell) => normalise(cell.textContent) !== "")).toHaveLength(3);
    }
    const barShown = extras.some((cells) => cells.length > 0);
    if (!barShown) {
      // No bar at all is allowed: the rows then hold only the day and the numbers.
      expect(extras.every((cells) => cells.length === 0)).toBe(true);
      return;
    }
    // A bar, once shown, is in every row (one per day), hidden as a whole and with no text inside.
    for (const cells of extras) {
      expect(cells).toHaveLength(1);
      const bar = cells[0];
      if (!bar) throw new Error("no bar cell");
      expect(bar.closest('[aria-hidden="true"]'), "the bar sits inside an aria-hidden element").not.toBeNull();
      expect(normalise(bar.textContent)).toBe("");
      for (const inside of Array.from(bar.querySelectorAll("*"))) {
        expect(normalise(inside.textContent)).toBe("");
        expect(inside.getAttribute("aria-label")).toBeNull();
      }
    }
    // The cells a person reads are never hidden.
    for (const row of rows) {
      expect(within(row).getByRole("rowheader").closest('[aria-hidden="true"]')).toBeNull();
      for (const cell of Array.from(row.querySelectorAll("td")).filter((c) => normalise(c.textContent) !== "")) {
        expect(cell.closest('[aria-hidden="true"]')).toBeNull();
      }
    }
  });

  it("AC-12: every day all zeros replaces the table with Nothing in the last 30 days.", async () => {
    await openDashboard(freshInstallStatus());
    const line = getByLine("Nothing in the last 30 days.");
    expect(isBefore(screen.getByRole("heading", { level: 2, name: "Last 30 days" }), line)).toBe(true);
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("AC-12: one update among zeros shows the table with 30 rows, not the empty line", async () => {
    await openDashboard(oneUpdateStatus());
    const rows = bodyRows(screen.getByRole("table"));
    expect(rows).toHaveLength(30);
    expect(queryByLine("Nothing in the last 30 days.")).toBeNull();
    const twelfth = rows.find((row) => within(row).getByRole("rowheader").querySelector("time")?.getAttribute("dateTime") === "2026-11-12");
    if (!twelfth) throw new Error("no row for 12 Nov");
    expect(rowTexts(twelfth)).toEqual(["12 Nov", "0", "1", "0"]);
  });

  it("AC-13: Top Artists is an ordered list in the server's order with playlist counts, singular for one", async () => {
    await openDashboard();
    const list = listAfter(screen.getByRole("heading", { level: 2, name: "Top Artists" }));
    expect(list.tagName).toBe("OL");
    expect(within(list).getAllByRole("listitem").map((item) => normalise(item.textContent))).toEqual([
      "Arctic Monkeys 14 playlists",
      "Fontaines D.C. 9 playlists",
      "Sigur Rós 1 playlist",
    ]);
  });

  it("AC-13: no top Artists reads No Artists yet.", async () => {
    await openDashboard(freshInstallStatus());
    const heading = screen.getByRole("heading", { level: 2, name: "Top Artists" });
    const line = getByLine("No Artists yet.");
    expect(isBefore(heading, line)).toBe(true);
    expect(Array.from(document.querySelectorAll("main ol")).filter((list) => isBefore(heading, list))).toHaveLength(0);
  });
});

// ---------------------------------------------------------------- status errors

describe("status errors", () => {
  it("AC-14: UPSTREAM_UNAVAILABLE shows the message as an h2 and the hint under the h1, focuses it, and Try again loads the dashboard", async () => {
    const second = deferred<AdminStatusResponse>();
    const { api, user } = openAdmin({ getAdminStatus: inTurn<AdminStatusResponse>([recordsUnreadable(), second]) });
    const title = () => screen.getByRole("heading", { level: 2, name: "Playset can't read its records right now." });
    await screen.findByRole("heading", { level: 2, name: "Playset can't read its records right now." });
    await expectFocusOn(title);
    getByLine("Try again in a minute.");
    expect(isBefore(h1(), title())).toBe(true);
    expect(h2Names()).toEqual(["Playset can't read its records right now."]);
    expect(screen.queryByRole("button", { name: "Log out" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Log in with Spotify" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Try again" }));
    const trying = await screen.findByRole("button", { name: "Trying again…" });
    expect(trying.getAttribute("aria-disabled")).toBe("true");
    await user.click(trying);
    expect(api.getAdminStatus).toHaveBeenCalledTimes(2);

    await act(async () => second.resolve(connectedStatus()));
    await screen.findByRole("heading", { level: 2, name: "Host Account" });
    expect(screen.queryByRole("heading", { level: 2, name: "Playset can't read its records right now." })).toBeNull();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    within(banner()).getByRole("button", { name: "Log out" });
  });

  it("AC-14: INTERNAL follows the same pattern", async () => {
    const { api, user } = openAdmin({ getAdminStatus: inTurn<AdminStatusResponse>([ourSide(), connectedStatus()]) });
    await expectFocusOn(() => screen.getByRole("heading", { level: 2, name: "Something went wrong on our side." }));
    getByLine("Please try again in a minute.");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByRole("heading", { level: 2, name: "Host Account" });
    expect(api.getAdminStatus).toHaveBeenCalledTimes(2);
  });

  it("AC-14: a client error of the API client shows its own words with Try again", async () => {
    const { api } = openAdmin({ getAdminStatus: inTurn<AdminStatusResponse>([playsetUnreachable()]) });
    await expectFocusOn(() => screen.getByRole("heading", { level: 2, name: "Playset isn't answering right now." }));
    getByLine("Check your connection and try again in a minute.");
    screen.getByRole("button", { name: "Try again" });
    await settle();
    expect(api.getAdminStatus).toHaveBeenCalledTimes(1);
  });

  it("AC-14: Try again answered with NOT_ADMIN shows the logged-out view", async () => {
    const { user } = openAdmin({ getAdminStatus: inTurn<AdminStatusResponse>([recordsUnreadable(), notAdmin()]) });
    await user.click(await screen.findByRole("button", { name: "Try again" }));
    await screen.findByRole("link", { name: "Log in with Spotify" });
    getByLine(LOGGED_OUT_LINE);
    expect(screen.queryByRole("heading", { level: 2, name: "Playset can't read its records right now." })).toBeNull();
    expect(queryByLine("Log in as the Host Account to see this page.")).toBeNull();
  });

  it("AC-14: Try again failing a second time shows the new error, focuses its h2 and offers Try again again", async () => {
    const second = deferred<AdminStatusResponse>();
    const { api, user } = openAdmin({
      getAdminStatus: inTurn<AdminStatusResponse>([recordsUnreadable(), second, connectedStatus()]),
    });
    await user.click(await screen.findByRole("button", { name: "Try again" }));
    await screen.findByRole("button", { name: "Trying again…" });
    await act(async () => second.reject(ourSide()));

    const title = () => screen.getByRole("heading", { level: 2, name: "Something went wrong on our side." });
    await screen.findByRole("heading", { level: 2, name: "Something went wrong on our side." });
    getByLine("Please try again in a minute.");
    expect(h2Names()).toEqual(["Something went wrong on our side."]);
    expect(queryByLine("Try again in a minute.")).toBeNull();
    const again = screen.getByRole("button", { name: "Try again" });
    expect(again.getAttribute("aria-disabled")).not.toBe("true");
    expect(screen.queryByRole("button", { name: "Log out" })).toBeNull();
    expect(api.getAdminStatus).toHaveBeenCalledTimes(2);
    // The new failure is a new alert: focus moves to its h2, as for the first one.
    await expectFocusOn(title);

    await user.click(again);
    await screen.findByRole("heading", { level: 2, name: "Host Account" });
    expect(api.getAdminStatus).toHaveBeenCalledTimes(3);
  });

  it("AC-14: Try again after a RATE_LIMITED wait that fails again shows the new error without a countdown", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { api, user } = openAdmin(
      { getAdminStatus: inTurn<AdminStatusResponse>([tooManyRequests(2), recordsUnreadable()]) },
      "/admin",
      { fakeTimers: true },
    );
    await waitFor(() => getByLine("You can try again in 0:02"));
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    await waitFor(() => expect(screen.getByRole("button", { name: "Try again" }).getAttribute("aria-disabled")).not.toBe("true"));
    await user.click(screen.getByRole("button", { name: "Try again" }));

    const title = () => screen.getByRole("heading", { level: 2, name: "Playset can't read its records right now." });
    await screen.findByRole("heading", { level: 2, name: "Playset can't read its records right now." });
    expect(h2Names()).toEqual(["Playset can't read its records right now."]);
    expect(normalise(document.body.textContent)).not.toContain("You can try again in");
    expect(queryByLine("Too many requests from here.")).toBeNull();
    expect(screen.getByRole("button", { name: "Try again" }).getAttribute("aria-disabled")).not.toBe("true");
    expect(api.getAdminStatus).toHaveBeenCalledTimes(2);
    await expectFocusOn(title);
  });

  it("AC-14: Try again after a RATE_LIMITED wait answered with NOT_ADMIN shows the logged-out view", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { api, user } = openAdmin(
      { getAdminStatus: inTurn<AdminStatusResponse>([tooManyRequests(1), notAdmin()]) },
      "/admin",
      { fakeTimers: true },
    );
    await waitFor(() => getByLine("You can try again in 0:01"));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    await waitFor(() => expect(screen.getByRole("button", { name: "Try again" }).getAttribute("aria-disabled")).not.toBe("true"));
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByRole("link", { name: "Log in with Spotify" });
    getByLine(LOGGED_OUT_LINE);
    expect(screen.queryAllByRole("heading", { level: 2 })).toHaveLength(0);
    expect(queryByLine("Log in as the Host Account to see this page.")).toBeNull();
    expect(api.getAdminStatus).toHaveBeenCalledTimes(2);
  });

  it("AC-14: RATE_LIMITED counts down from the retry wait with Try again aria-disabled, announces twice, then enables it", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const first = deferred<AdminStatusResponse>();
    const { api, user } = openAdmin(
      { getAdminStatus: inTurn<AdminStatusResponse>([first, connectedStatus()]) },
      "/admin",
      { fakeTimers: true },
    );
    getByLine("Loading the status…");
    const announcements = recordAnnouncements();
    await act(async () => first.reject(tooManyRequests(42)));

    const title = () => screen.getByRole("heading", { level: 2, name: "Too many requests from here." });
    await expectFocusOn(title);
    getByLine("Wait a moment, then try again.");
    getByLine("You can try again in 0:42");
    const tryAgain = screen.getByRole("button", { name: "Try again" });
    expect(tryAgain.getAttribute("aria-disabled")).toBe("true");
    await waitFor(() => expect(announcements).toEqual(["Try again in 42 seconds"]));
    expect(screen.queryByRole("button", { name: "Log out" })).toBeNull();

    // Activated without moving focus, so the check below sees that the countdown never moves it.
    act(() => tryAgain.click());
    expect(api.getAdminStatus).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(title());

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
    await screen.findByRole("heading", { level: 2, name: "Host Account" });
    expect(api.getAdminStatus).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------- log out

describe("log out", () => {
  it("AC-15: Log out reads Logging out… while pending, sends once, then shows the logged-out view at /admin and announces it", async () => {
    const logout = deferred<void>();
    const { api, user } = await openDashboard(connectedStatus(), { logOut: () => logout.promise }, "/admin?login=UPSTREAM_UNAVAILABLE");
    await screen.findByRole("heading", { level: 2, name: "Spotify isn't answering right now." });

    await user.click(within(banner()).getByRole("button", { name: "Log out" }));
    const pending = await within(banner()).findByRole("button", { name: "Logging out…" });
    expect(pending.getAttribute("aria-disabled")).toBe("true");
    await user.click(pending);
    await user.click(pending);
    expect(api.logOut).toHaveBeenCalledTimes(1);

    await act(async () => logout.resolve());
    await screen.findByRole("link", { name: "Log in with Spotify" });
    await waitFor(() => expect(currentUrl()).toBe("/admin"));
    getByLine(LOGGED_OUT_LINE);
    await expectFocusOn(h1);
    await waitFor(() => expect(announced()).toBe("Logged out"));
    expect(screen.queryByRole("heading", { level: 2, name: "Spotify isn't answering right now." })).toBeNull();
    expect(screen.queryAllByRole("heading", { level: 2 })).toHaveLength(0);
    expect(screen.queryByRole("button", { name: /^Log(ging)? out/ })).toBeNull();
    expect(api.getAdminStatus).toHaveBeenCalledTimes(1);
  });

  it("AC-15: logOut is called without a cancel signal, and leaving /admin while it is pending does not cancel it", async () => {
    const logout = deferred<void>();
    const { api, user } = await openDashboard(connectedStatus(), { logOut: () => logout.promise });
    await user.click(within(banner()).getByRole("button", { name: "Log out" }));
    await within(banner()).findByRole("button", { name: "Logging out…" });
    expect(api.logOut).toHaveBeenCalledTimes(1);
    expect((api.logOut.mock.calls[0] ?? []).some((arg: unknown) => arg instanceof AbortSignal)).toBe(false);

    await user.click(within(banner()).getByRole("link", { name: "Playset" }));
    const start = await screen.findByRole("heading", { level: 1, name: "Hear the Setlist before the Show" });
    await settle();
    const focusBefore = document.activeElement;
    const announcements = recordAnnouncements();

    await act(async () => logout.resolve());
    await settle();
    // The logout was left to finish on its own: nothing of it follows the admin to the Start screen.
    expect(api.logOut).toHaveBeenCalledTimes(1);
    expect(announcements).toEqual([]);
    expect(announced()).not.toBe("Logged out");
    expect(screen.queryAllByRole("alert")).toHaveLength(0);
    expect(currentUrl()).toBe("/");
    expect(document.activeElement).toBe(focusBefore);
    expect(screen.queryByRole("heading", { level: 1, name: "Admin" })).toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "Hear the Setlist before the Show" })).toBe(start);
    expect(api.getAdminStatus).toHaveBeenCalledTimes(1);
  });

  it("AC-15: a logout that fails after the admin left shows and announces nothing", async () => {
    const logout = deferred<void>();
    const { api, user } = await openDashboard(connectedStatus(), { logOut: () => logout.promise });
    await user.click(within(banner()).getByRole("button", { name: "Log out" }));
    await within(banner()).findByRole("button", { name: "Logging out…" });

    await user.click(within(banner()).getByRole("link", { name: "Playset" }));
    await screen.findByRole("heading", { level: 1, name: "Hear the Setlist before the Show" });
    await settle();
    const focusBefore = document.activeElement;
    const announcements = recordAnnouncements();

    await act(async () => logout.reject(playsetUnreachable()));
    await settle();
    expect(announcements).toEqual([]);
    expect(screen.queryAllByRole("alert")).toHaveLength(0);
    expect(queryByLine("Playset isn't answering right now.")).toBeNull();
    expect(currentUrl()).toBe("/");
    expect(document.activeElement).toBe(focusBefore);
    expect(api.logOut).toHaveBeenCalledTimes(1);
  });

  it("AC-16: a failed logout shows a role=alert under the h1, keeps the dashboard and the Log out button, and leaves focus", async () => {
    const { api, user } = await openDashboard(connectedStatus(), {
      logOut: inTurn<void>([playsetUnreachable(), undefined]),
    });
    const button = within(banner()).getByRole("button", { name: "Log out" });
    await user.click(button);

    const alert = await findAlert("Playset isn't answering right now.");
    getByLine("Check your connection and try again in a minute.", alert);
    expect(withoutSpaces(alert.textContent)).toBe(withoutSpaces("Playset isn't answering right now. Check your connection and try again in a minute."));
    expectDirectlyUnderH1(alert);
    expect(isBefore(alert, screen.getByRole("heading", { level: 2, name: "Host Account" }))).toBe(true);
    expect(h2Names().slice(-5)).toEqual(["Host Account", "Config", "Usage", "Last 30 days", "Top Artists"]);
    const again = within(banner()).getByRole("button", { name: "Log out" });
    expect(again.getAttribute("aria-disabled")).not.toBe("true");
    expect(document.activeElement).toBe(again);
    expect(currentUrl()).toBe("/admin");

    await user.click(again);
    await screen.findByRole("link", { name: "Log in with Spotify" });
    expect(screen.queryAllByRole("alert")).toHaveLength(0);
    expect(queryByLine("Playset isn't answering right now.")).toBeNull();
    expect(api.logOut).toHaveBeenCalledTimes(2);
    expect(api.getAdminStatus).toHaveBeenCalledTimes(1);
  });

  it("AC-5: with login=UPSTREAM_UNAVAILABLE still in the URL, a failed logout keeps the login-problem alert directly under the h1 and puts the logout error right after it", async () => {
    const { user } = await openDashboard(
      connectedStatus(),
      { logOut: inTurn<void>([playsetUnreachable(), undefined]) },
      "/admin?login=UPSTREAM_UNAVAILABLE",
    );
    const loginTitle = () => screen.getByRole("heading", { level: 2, name: "Spotify isn't answering right now." });
    await expectFocusOn(loginTitle);

    await user.click(within(banner()).getByRole("button", { name: "Log out" }));
    const logoutAlert = await findAlert("Playset isn't answering right now.");

    // The login problem keeps the slot right under the h1; the logout error follows it directly.
    expectDirectlyUnderH1(loginTitle());
    const loginProblem = h1().nextElementSibling;
    if (!(loginProblem instanceof HTMLElement)) throw new Error("nothing right after the h1");
    expect(loginProblem.contains(loginTitle()), "the element under the h1 holds the login problem").toBe(true);
    expect(loginProblem.contains(logoutAlert), "the element under the h1 does not hold the logout error").toBe(false);
    const afterLoginProblem = loginProblem.nextElementSibling;
    expect(afterLoginProblem, "an element right after the login problem").not.toBeNull();
    expect(
      afterLoginProblem === logoutAlert || afterLoginProblem?.contains(logoutAlert) === true,
      "the element right after the login problem holds the logout error",
    ).toBe(true);
    expect(isBefore(loginTitle(), logoutAlert)).toBe(true);
    expect(isBefore(logoutAlert, screen.getByRole("heading", { level: 2, name: "Host Account" }))).toBe(true);

    expect(document.activeElement).toBe(within(banner()).getByRole("button", { name: "Log out" }));
    expect(currentUrl()).toBe("/admin?login=UPSTREAM_UNAVAILABLE");
  });

  it.each<[string, () => Error, string, string]>([
    ["INTERNAL", ourSide, "Something went wrong on our side.", "Please try again in a minute."],
    ["RATE_LIMITED", () => tooManyRequests(30), "Too many requests from here.", "Wait a moment, then try again."],
    ["NOT_ADMIN", notAdmin, "Log in as the Host Account to see this page.", "Use the Log in with Spotify button."],
  ])("AC-16: a failed logout with %s shows that message and hint, keeps the dashboard and leaves focus", async (_code, error, message, hint) => {
    const { api, user } = await openDashboard(connectedStatus(), { logOut: inTurn<void>([error()]) });
    const button = within(banner()).getByRole("button", { name: "Log out" });
    await user.click(button);
    const alert = await findAlert(message);
    getByLine(hint, alert);
    expect(withoutSpaces(alert.textContent)).toBe(withoutSpaces(`${message} ${hint}`));
    expectDirectlyUnderH1(alert);
    // A failed logout has no countdown of its own: the button is ready again at once.
    expect(normalise(document.body.textContent)).not.toContain("You can try again in");
    const again = within(banner()).getByRole("button", { name: "Log out" });
    expect(again.getAttribute("aria-disabled")).not.toBe("true");
    expect(document.activeElement).toBe(again);
    expect(h2Names()).toEqual(["Host Account", "Config", "Usage", "Last 30 days", "Top Artists"]);
    expect(screen.queryByRole("link", { name: "Log in with Spotify" })).toBeNull();
    expect(currentUrl()).toBe("/admin");
    await settle();
    expect(api.logOut).toHaveBeenCalledTimes(1);
    expect(api.getAdminStatus).toHaveBeenCalledTimes(1);
  });
});
