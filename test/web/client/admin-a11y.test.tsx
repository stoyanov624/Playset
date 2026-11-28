// The admin page by keyboard alone, its axe checks in every state, heading order, and the icon
// rules (hidden lucide icons beside text; no emoji or check mark standing in for "present").
import { act, screen, waitFor, within } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import type { AdminStatusResponse } from "../../../src/web/shared/index.js";
import { deferred } from "./fixtures/fake-api";
import { expectFocusOn, findAlert, getByLine, listAfter, normalise } from "./fixtures/dom";
import {
  connectedStatus,
  freshInstallStatus,
  inTurn,
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

/** Presses Tab until `target` has focus; fails if it is never reached. */
async function tabTo(user: UserEvent, target: () => HTMLElement, options: { shift?: boolean; max?: number } = {}): Promise<void> {
  const max = options.max ?? 60;
  for (let presses = 0; presses <= max; presses++) {
    if (document.activeElement === target()) return;
    if (presses === max) break;
    await user.tab(options.shift === true ? { shift: true } : {});
  }
  throw new Error(`Tab never reached "${normalise(target().textContent)}"`);
}

function banner(): HTMLElement {
  return screen.getByRole("banner");
}

/** What a person hears for the focused control: its text (links and buttons here are named by it). */
function focusedName(): string {
  const active = document.activeElement;
  if (!active || active === document.body) return "(page)";
  return normalise(active.textContent);
}

/** Presses Tab (or Shift+Tab) `count` times and lists the names focus lands on. */
async function tabSequence(user: UserEvent, count: number, shift = false): Promise<string[]> {
  const names: string[] = [];
  for (let press = 0; press < count; press++) {
    await user.tab(shift ? { shift: true } : {});
    names.push(focusedName());
  }
  return names;
}

// ---------------------------------------------------------------- keyboard

/** Every control on the E2 dashboard in Tab order: the header, the Host Account block, the footer. */
const DASHBOARD_TAB_ORDER = ["Skip to content", "Playset", "Log out", "Reconnect", "setlist.fm", "Terms and Privacy"];

describe("keyboard only", () => {
  it("AC-20: on the dashboard Tab reaches every link, Reconnect and Log out; Enter on Log out ends on the logged-out view", async () => {
    const { user, api } = await openDashboard(connectedStatus(), { logOut: async () => undefined });
    await expectFocusOn(() => screen.getByRole("heading", { level: 1, name: "Admin" }));

    // From the h1, Tab goes through the rest of the page in reading order, wraps once to the
    // top and comes back round: no control is skipped, none is a trap, and the order is the page's.
    const order = DASHBOARD_TAB_ORDER;
    const reachable = screen.getAllByRole("link").map((link) => normalise(link.textContent));
    reachable.push("Log out");
    expect([...order].sort()).toEqual([...reachable].sort());
    const fromH1 = order.slice(order.indexOf("Reconnect"));
    const forward = await tabSequence(user, order.length + 1);
    expect(forward).toEqual([...fromH1, "(page)", ...order.slice(0, order.indexOf("Reconnect"))]);
    // Shift+Tab walks the same order backwards.
    const backward = await tabSequence(user, 2, true);
    expect(backward).toEqual([order[order.indexOf("Log out") - 1], order[order.indexOf("Log out") - 2]]);
    await tabTo(user, () => within(banner()).getByRole("button", { name: "Log out" }), { max: 2 });

    await user.keyboard("{Enter}");
    await screen.findByRole("link", { name: "Log in with Spotify" });
    expect(api.logOut).toHaveBeenCalledTimes(1);
    await expectFocusOn(() => screen.getByRole("heading", { level: 1, name: "Admin" }));
    await tabTo(user, () => screen.getByRole("link", { name: "Log in with Spotify" }), { max: 2 });
    expect(api.logOut).toHaveBeenCalledTimes(1);
    expect(api.getAdminStatus).toHaveBeenCalledTimes(1);
  });

  it("AC-20: on the logged-out view the next Tab after the h1 reaches Log in with Spotify", async () => {
    const { user, api } = await openLoggedOut();
    await expectFocusOn(() => screen.getByRole("heading", { level: 1, name: "Admin" }));
    await tabTo(user, () => screen.getByRole("link", { name: "Log in with Spotify" }), { max: 2 });
    expect(api.getAdminStatus).toHaveBeenCalledTimes(1);
  });

  it("AC-20: on a status error Tab reaches Try again and Enter activates it", async () => {
    const { user, api } = openAdmin({ getAdminStatus: inTurn<AdminStatusResponse>([recordsUnreadable(), connectedStatus()]) });
    await expectFocusOn(() => screen.getByRole("heading", { level: 2, name: "Playset can't read its records right now." }));
    await tabTo(user, () => screen.getByRole("button", { name: "Try again" }));
    await user.keyboard("{Enter}");
    await screen.findByRole("heading", { level: 2, name: "Host Account" });
    expect(api.getAdminStatus).toHaveBeenCalledTimes(2);
  });

  it("AC-20: on a status error Space activates Try again", async () => {
    const { user, api } = openAdmin({ getAdminStatus: inTurn<AdminStatusResponse>([ourSide(), connectedStatus()]) });
    await screen.findByRole("heading", { level: 2, name: "Something went wrong on our side." });
    await tabTo(user, () => screen.getByRole("button", { name: "Try again" }));
    await user.keyboard(" ");
    await screen.findByRole("heading", { level: 2, name: "Host Account" });
    expect(api.getAdminStatus).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------- every admin state

interface AdminState {
  /** Every lucide icon on the page in this state (each name once), and no other. */
  icons: string[];
}

const STATES: Array<[string, () => Promise<AdminState>]> = [
  ["loading", async () => {
    const status = pendingStatus();
    openAdmin({ getAdminStatus: status.getAdminStatus });
    await screen.findByRole("heading", { level: 1, name: "Admin" });
    getByLine("Loading the status…");
    return { icons: ["loader-circle"] };
  }],
  ["logged out", async () => {
    await openLoggedOut();
    return { icons: ["log-in"] };
  }],
  ...(["NOT_ADMIN", "INVALID_INPUT", "UPSTREAM_UNAVAILABLE", "INTERNAL"] as const).map(
    (code): [string, () => Promise<AdminState>] => [`logged out with login=${code}`, async () => {
      await openLoggedOut(`/admin?login=${code}`);
      await waitFor(() => expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(1));
      return { icons: ["log-in", "triangle-alert"] };
    }],
  ),
  ["dashboard connected with full usage", async () => {
    await openDashboard();
    return { icons: ["circle-check", "circle-x"] };
  }],
  ["dashboard with login=UPSTREAM_UNAVAILABLE above it", async () => {
    await openDashboard(connectedStatus(), {}, "/admin?login=UPSTREAM_UNAVAILABLE");
    await screen.findByRole("heading", { level: 2, name: "Spotify isn't answering right now." });
    return { icons: ["circle-check", "circle-x", "triangle-alert"] };
  }],
  ["dashboard not connected", async () => {
    await openDashboard(freshInstallStatus());
    return { icons: ["circle-check", "triangle-alert"] };
  }],
  ["dashboard with empty usage", async () => {
    await openDashboard(freshInstallStatus());
    getByLine("Nothing in the last 30 days.");
    return { icons: ["circle-check", "triangle-alert"] };
  }],
  ["status error UPSTREAM_UNAVAILABLE", async () => {
    openAdmin({ getAdminStatus: inTurn<AdminStatusResponse>([recordsUnreadable()]) });
    await screen.findByRole("button", { name: "Try again" });
    return { icons: ["triangle-alert", "rotate-cw"] };
  }],
  ["status error RATE_LIMITED counting down", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    openAdmin({ getAdminStatus: inTurn<AdminStatusResponse>([tooManyRequests(42)]) }, "/admin", { fakeTimers: true });
    await waitFor(() => getByLine("You can try again in 0:42"));
    return { icons: ["triangle-alert", "rotate-cw"] };
  }],
  ["logout error", async () => {
    const { user } = await openDashboard(connectedStatus(), { logOut: inTurn<void>([playsetUnreachable()]) });
    await user.click(within(banner()).getByRole("button", { name: "Log out" }));
    await findAlert("Playset isn't answering right now.");
    return { icons: ["circle-check", "circle-x", "triangle-alert"] };
  }],
  ["logging out", async () => {
    const logout = deferred<void>();
    const { user } = await openDashboard(connectedStatus(), { logOut: () => logout.promise });
    await user.click(within(banner()).getByRole("button", { name: "Log out" }));
    await within(banner()).findByRole("button", { name: "Logging out…" });
    return { icons: ["circle-check", "circle-x", "loader-circle"] };
  }],
];

async function open(state: () => Promise<AdminState>): Promise<AdminState> {
  const shown = await state();
  await act(async () => {
    await Promise.resolve();
  });
  return shown;
}

// Arrows, check marks, crosses, bullets, shapes and stars standing in for an icon, and any emoji.
const GLYPHS_STANDING_IN_FOR_ICONS = /[←-⇿✓-✘•‣⁃■-◿★☆➔➜➡]|\p{Extended_Pictographic}/u;

function iconProblems(): string[] {
  const problems: string[] = [];
  for (const svg of Array.from(document.querySelectorAll("svg"))) {
    const where = normalise(svg.parentElement?.textContent) || "(no text)";
    if (svg.getAttribute("aria-hidden") !== "true") problems.push(`an icon by "${where}" is not aria-hidden`);
    if (!/\blucide\b/.test(svg.getAttribute("class") ?? "")) problems.push(`an icon by "${where}" is not a lucide icon`);
    if (normalise(svg.parentElement?.textContent) === "") problems.push("an icon has no visible text beside it");
  }
  for (const control of Array.from(document.querySelectorAll("button, a[href]"))) {
    if (normalise(control.textContent) === "") problems.push(`a ${control.tagName.toLowerCase()} shows no text`);
  }
  const text = normalise(document.body.textContent);
  const glyph = text.match(GLYPHS_STANDING_IN_FOR_ICONS);
  if (glyph) problems.push(`the glyph ${glyph[0]} stands in for an icon`);
  if (text.includes("✅") || text.includes("✓")) problems.push("a check mark stands in for present");
  return problems;
}

/**
 * Compares the page's icons with `expected` both ways: every icon is one of the expected lucide
 * icons (a lucide icon can carry an alias name too), and every expected icon is on the page.
 */
function iconMismatches(expected: string[]): string[] {
  const svgs = Array.from(document.querySelectorAll("svg"));
  const problems: string[] = [];
  for (const svg of svgs) {
    if (!expected.some((name) => lucideIcon(svg, name))) problems.push(`unexpected icon ${svg.getAttribute("class") ?? ""}`);
  }
  for (const name of expected) {
    if (!svgs.some((svg) => lucideIcon(svg, name))) problems.push(`no ${name} icon`);
  }
  return problems;
}

function lucideIcon(svg: Element, name: string): boolean {
  return new RegExp(`\\blucide-${name}(-icon)?\\b`).test(svg.getAttribute("class") ?? "") &&
    !new RegExp(`\\blucide-${name}-(?!icon\\b)`).test(svg.getAttribute("class") ?? "");
}

describe("every admin screen state", () => {
  it.each(STATES)("AC-19: %s has no axe violations", async (_name, state) => {
    await open(state);
    expect(await axe(document.body)).toHaveNoViolations();
  });

  it.each(STATES)("AC-21: %s has one h1 first and only h2 sections", async (_name, state) => {
    await open(state);
    const headings = screen.getAllByRole("heading");
    const levels = headings.map((h) => Number(h.tagName.slice(1)));
    expect(levels.filter((level) => level === 1)).toHaveLength(1);
    expect(levels[0]).toBe(1);
    expect(levels.every((level) => level === 1 || level === 2)).toBe(true);
    expect(normalise(headings[0]?.textContent)).toBe("Admin");
  });

  it.each(STATES)("AC-21: %s shows icons only as hidden lucide icons beside text, and no glyph icons", async (_name, state) => {
    const { icons } = await open(state);
    expect(iconProblems()).toEqual([]);
    expect(iconMismatches(icons)).toEqual([]);
  });

  it("AC-21: each present config item carries a CircleCheck and the missing one a CircleX", async () => {
    await openDashboard();
    const config = screen.getByRole("heading", { level: 2, name: "Config" });
    const items = Array.from(listAfter(config).querySelectorAll("li"));
    expect(items).toHaveLength(4);
    const iconsPerItem = items.map((item) => {
      const svg = item.querySelector("svg");
      if (!svg) return "none";
      if (lucideIcon(svg, "circle-check")) return "circle-check";
      if (lucideIcon(svg, "circle-x")) return "circle-x";
      return svg.getAttribute("class") ?? "";
    });
    expect(iconsPerItem).toEqual(["circle-check", "circle-check", "circle-check", "circle-x"]);
  });

  it("AC-21: Log in with Spotify carries a LogIn icon", async () => {
    await openLoggedOut();
    const login = screen.getByRole("link", { name: "Log in with Spotify" });
    expect(Array.from(login.querySelectorAll("svg")).some((svg) => lucideIcon(svg, "log-in"))).toBe(true);
  });

  it("AC-21: Try again on a status error carries a RotateCw icon", async () => {
    openAdmin({ getAdminStatus: inTurn<AdminStatusResponse>([recordsUnreadable(), connectedStatus()]) });
    const tryAgain = await screen.findByRole("button", { name: "Try again" });
    expect(Array.from(tryAgain.querySelectorAll("svg")).some((svg) => lucideIcon(svg, "rotate-cw"))).toBe(true);
  });

  it("AC-21: whatever the table hides from assistive technology holds no text and nothing focusable", async () => {
    await openDashboard();
    const table = screen.getByRole("table");
    // Header row and body rows alike: a hidden part is decoration only.
    for (const hidden of Array.from(table.querySelectorAll('[aria-hidden="true"]'))) {
      expect(normalise(hidden.textContent)).toBe("");
      expect(hidden.querySelectorAll("a[href], button, input, [tabindex]")).toHaveLength(0);
    }
    // Every cell that is not hidden carries text, so nothing a screen reader reaches is blank.
    for (const cell of Array.from(table.querySelectorAll("th, td"))) {
      if (cell.closest('[aria-hidden="true"]') !== null) continue;
      expect(normalise(cell.textContent), "a cell a screen reader reaches").not.toBe("");
    }
  });
});
