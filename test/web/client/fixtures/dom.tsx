// How the visitor web app's tests open the app and read the page as a person would: by the
// full text a line shows (however it is split into elements), the live region, and the URL.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, vi } from "vitest";
import { App } from "../../../../src/web/client/App.js";
import type { PlaysetApi } from "../../../../src/web/client/api/index.js";

export interface OpenOptions {
  /** Use with `vi.useFakeTimers({ shouldAdvanceTime: true })` so user-event moves fake time too. */
  fakeTimers?: boolean;
}

/** Opens the app at `path` in the browser's own history, as a fresh page load. */
export function openApp(api: PlaysetApi, path = "/", options: OpenOptions = {}) {
  window.history.pushState(null, "", path);
  const user = options.fakeTimers
    ? userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) })
    : userEvent.setup();
  const utils = render(<App api={api} />);
  return { user, ...utils };
}

/** The path and query the browser shows. */
export function currentUrl(): string {
  return window.location.pathname + window.location.search;
}

export function normalise(text: string | null | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

/** Elements whose whole text is `text`, innermost first: a line split over several spans still counts. */
export function queryAllByLine(text: string, container: ParentNode = document.body): HTMLElement[] {
  const all = Array.from(container.querySelectorAll<HTMLElement>("*")).filter(
    (el) => el.tagName !== "SCRIPT" && el.tagName !== "STYLE" && normalise(el.textContent) === text,
  );
  // Keep only the innermost: drop an element when one of its descendants has the same text.
  return all.filter((el) => !all.some((other) => other !== el && el.contains(other)));
}

export function getByLine(text: string, container: ParentNode = document.body): HTMLElement {
  const found = queryAllByLine(text, container);
  const first = found[0];
  if (!first) throw new Error(`No element shows the line: ${text}\n\nPage text: ${normalise(document.body.textContent)}`);
  return first;
}

export function queryByLine(text: string, container: ParentNode = document.body): HTMLElement | null {
  return queryAllByLine(text, container)[0] ?? null;
}

export async function findByLine(text: string, container: ParentNode = document.body): Promise<HTMLElement> {
  return waitFor(() => getByLine(text, container));
}

/** The `role="alert"` element that shows `text` (other alerts on the page are ignored). */
export async function findAlert(text: string): Promise<HTMLElement> {
  return waitFor(() => {
    const alert = screen.queryAllByRole("alert").find((candidate) => queryByLine(text, candidate) !== null);
    if (!alert) throw new Error(`No role="alert" shows: ${text}`);
    return alert;
  });
}

/** The page's one polite live region. */
export function liveRegion(): HTMLElement {
  const regions = Array.from(document.querySelectorAll<HTMLElement>('[aria-live="polite"]'));
  if (regions.length !== 1) throw new Error(`Expected one polite live region, found ${regions.length}`);
  const region = regions[0];
  if (!region) throw new Error("No polite live region");
  return region;
}

export function announced(): string {
  return normalise(liveRegion().textContent);
}

/**
 * Every non-empty text the live region shows from now on, in order. By default a text equal to
 * the one before is one announcement; with `repeats`, the same text put into the region again
 * (new content added, as a screen reader hears it a second time) is recorded again.
 */
export function recordAnnouncements(options: { repeats?: boolean } = {}): string[] {
  const seen: string[] = [];
  const region = liveRegion();
  const initial = normalise(region.textContent);
  if (initial !== "") seen.push(initial);
  const observer = new MutationObserver((mutations) => {
    const text = normalise(region.textContent);
    if (text === "") return;
    const putInAgain = mutations.some((m) => m.type === "characterData" || m.addedNodes.length > 0);
    if (seen.at(-1) !== text || (options.repeats === true && putInAgain)) seen.push(text);
  });
  observer.observe(region, { childList: true, subtree: true, characterData: true });
  recorders.add(observer);
  return seen;
}

/** Live-region recorders still listening; each test's are stopped when it ends. */
const recorders = new Set<MutationObserver>();

afterEach(() => {
  for (const observer of recorders) observer.disconnect();
  recorders.clear();
});

/** The text of the elements named by `aria-describedby`. */
export function describedBy(el: Element): string {
  const ids = (el.getAttribute("aria-describedby") ?? "").split(/\s+/).filter((id) => id !== "");
  return normalise(ids.map((id) => document.getElementById(id)?.textContent ?? "").join(" "));
}

export function heading(name: string, level?: number): HTMLElement {
  return level === undefined ? screen.getByRole("heading", { name }) : screen.getByRole("heading", { name, level });
}

export async function expectFocusOn(get: () => HTMLElement): Promise<void> {
  await waitFor(() => {
    if (document.activeElement !== get()) {
      throw new Error(`Focus is on <${document.activeElement?.tagName.toLowerCase()}> "${normalise(document.activeElement?.textContent)}"`);
    }
  });
}

/** True when `a` comes before `b` in the page. */
export function isBefore(a: Node, b: Node): boolean {
  return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
}

/** The first list after `el` in the page. */
export function listAfter(el: Element): HTMLElement {
  const list = Array.from(document.querySelectorAll<HTMLElement>("ul, ol")).find((candidate) => isBefore(el, candidate) && !candidate.contains(el));
  if (!list) throw new Error(`No list after "${normalise(el.textContent)}"`);
  return list;
}

/** The rows (list items) of the Set headed `label` in the preview's sheet. */
export function setRows(label: string): HTMLElement[] {
  const setHeading = screen.getByRole("heading", { name: label, level: 2 });
  const list = listAfter(setHeading);
  return Array.from(list.children).filter((child): child is HTMLElement => child.tagName === "LI");
}

/** Text shown to the eye or given as an accessible name inside `container`. */
export function hasAccessibleText(container: HTMLElement, text: string): boolean {
  if (queryByLine(text, container)) return true;
  return Array.from(container.querySelectorAll("[aria-label]")).some((el) => normalise(el.getAttribute("aria-label")) === text);
}

/** Links whose target starts with `prefix`, in page order. */
export function linksTo(prefix: string): HTMLAnchorElement[] {
  return Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]")).filter((a) =>
    (a.getAttribute("href") ?? "").startsWith(prefix),
  );
}
