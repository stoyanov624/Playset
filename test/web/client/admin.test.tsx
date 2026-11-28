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
import { settle } from "./fixtures/flows";
import {
  connectedStatus,
  connectedWithoutNameStatus,
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

  it("AC-1: the header Admin text shows only on /admin, not on Visitor screens", async () => {
    openAdmin({}, "/terms");
    await screen.findByRole("heading", { level: 1, name: "Terms and Privacy" });
    expect(normalise(banner().textContent)).toBe("Playset");
  });

  it.each(["/admin/settings", "/admin/x/y", "/admin/login/extra"])(
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
    expect(isBefore(h1(), title())).toBe(true);
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
    for (const row of rows) {
      for (const cell of Array.from(row.querySelectorAll("td"))) {
        if (normalise(cell.textContent) !== "") continue;
        // An empty cell holds only the presentational bar.
        const hidden = cell.getAttribute("aria-hidden") === "true" || Array.from(cell.children).every((child) => child.getAttribute("aria-hidden") === "true");
        expect(hidden).toBe(true);
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
    openAdmin({ getAdminStatus: inTurn<AdminStatusResponse>([playsetUnreachable()]) });
    await expectFocusOn(() => screen.getByRole("heading", { level: 2, name: "Playset isn't answering right now." }));
    getByLine("Check your connection and try again in a minute.");
    screen.getByRole("button", { name: "Try again" });
  });

  it("AC-14: Try again answered with NOT_ADMIN shows the logged-out view", async () => {
    const { user } = openAdmin({ getAdminStatus: inTurn<AdminStatusResponse>([recordsUnreadable(), notAdmin()]) });
    await user.click(await screen.findByRole("button", { name: "Try again" }));
    await screen.findByRole("link", { name: "Log in with Spotify" });
    getByLine(LOGGED_OUT_LINE);
    expect(screen.queryByRole("heading", { level: 2, name: "Playset can't read its records right now." })).toBeNull();
    expect(queryByLine("Log in as the Host Account to see this page.")).toBeNull();
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

    await user.click(tryAgain);
    expect(api.getAdminStatus).toHaveBeenCalledTimes(1);
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
    await screen.findByRole("heading", { level: 1, name: "Hear the Setlist before the Show" });
    await act(async () => logout.resolve());
    await settle();
    expect(api.logOut).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("heading", { level: 1, name: "Hear the Setlist before the Show" }).tagName).toBe("H1");
  });

  it("AC-16: a failed logout shows a role=alert under the h1, keeps the dashboard and the Log out button, and leaves focus", async () => {
    const { api, user } = await openDashboard(connectedStatus(), {
      logOut: inTurn<void>([playsetUnreachable(), undefined]),
    });
    const button = within(banner()).getByRole("button", { name: "Log out" });
    await user.click(button);

    const alert = await findAlert("Playset isn't answering right now.");
    getByLine("Check your connection and try again in a minute.", alert);
    expect(isBefore(h1(), alert)).toBe(true);
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

  it("AC-16: a failed logout with INTERNAL shows that message and hint", async () => {
    const { user } = await openDashboard(connectedStatus(), { logOut: inTurn<void>([ourSide()]) });
    await user.click(within(banner()).getByRole("button", { name: "Log out" }));
    const alert = await findAlert("Something went wrong on our side.");
    getByLine("Please try again in a minute.", alert);
    screen.getByRole("heading", { level: 2, name: "Host Account" });
  });
});
