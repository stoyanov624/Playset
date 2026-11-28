// The Setlist list of one Artist: rows, Load more, the end of the list and the empty list.
import { act, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";
import type { ArtistSetlistsResponse } from "../../../src/web/shared/index.js";
import { deferred, fakeApi } from "./fixtures/fake-api";
import { announced, currentUrl, expectFocusOn, getByLine, linksTo, normalise, openApp, queryByLine } from "./fixtures/dom";
import {
  ARCTIC_MONKEYS_MBID,
  BOSTON_ID,
  PAGE1_ROW_NAMES,
  PEARL_JAM_MBID,
  arcticMonkeysPage1,
  arcticMonkeysPage2,
  emptyPage,
  pearlJamCandidates,
} from "./fixtures/values";

const LIST_PATH = `/artists/${ARCTIC_MONKEYS_MBID}`;

/** The Setlist rows are exactly these, by accessible name, in this order. */
function expectRows(names: readonly string[]): void {
  expect(linksTo("/setlists/")).toEqual(names.map((name) => screen.getByRole("link", { name })));
}

/** Opens the list with page answers given in turn; later pages wait for the test when given as deferred. */
function openList(pages: Array<ArtistSetlistsResponse | Promise<ArtistSetlistsResponse>>, path = LIST_PATH) {
  let next = 0;
  const api = fakeApi({
    getArtistSetlists: () => {
      const page = pages[next];
      next += 1;
      if (page === undefined) return Promise.reject(new Error("no more pages in this test"));
      return Promise.resolve(page);
    },
    getSetlist: () => deferred<never>().promise,
  });
  return { api, ...openApp(api, path) };
}

describe("Setlist list", () => {
  it("AC-15: shows the Artist's name, the subtitle and one row per Setlist in the server's order", async () => {
    const { api } = openList([arcticMonkeysPage1()]);
    await screen.findByRole("heading", { level: 1, name: "Arctic Monkeys" });
    getByLine("Setlists on setlist.fm, newest first");
    await screen.findByRole("link", { name: PAGE1_ROW_NAMES[0] });

    const rows = linksTo("/setlists/");
    expect(rows.map((a) => a.getAttribute("href"))).toEqual(["/setlists/2b8c4f1a", `/setlists/${BOSTON_ID}`, "/setlists/1b8c4d3e"]);
    expect(rows.map((a) => a.querySelector("time")?.getAttribute("datetime"))).toEqual(["2026-11-27", "2026-11-24", "2026-11-21"]);
    const [newYork, boston, toronto] = rows;
    if (!newYork || !boston || !toronto) throw new Error("three rows expected");
    expect(normalise(newYork.textContent)).toContain("Madison Square Garden");
    expect(normalise(newYork.textContent)).toContain("New York");
    expect(normalise(newYork.textContent)).toContain("21 songs");
    expect(normalise(newYork.textContent)).toContain("27");
    expect(normalise(newYork.textContent)).toContain("Nov");
    expect(normalise(newYork.textContent)).toContain("2026");
    expect(normalise(toronto.textContent)).toContain("1 song");
    expect(normalise(toronto.textContent)).not.toContain("1 songs");
    expect(normalise(boston.textContent)).toContain("Incomplete");
    expect(normalise(newYork.textContent)).not.toContain("Incomplete");
    expect(normalise(toronto.textContent)).not.toContain("Incomplete");
    expect(api.getArtistSetlists.mock.calls[0]?.slice(0, 2)).toEqual([ARCTIC_MONKEYS_MBID, 1]);
  });

  it("AC-15: shows Loading Setlists… while page 1 loads", async () => {
    const page = deferred<ArtistSetlistsResponse>();
    openList([page.promise]);
    await waitFor(() => getByLine("Loading Setlists…"));
    await act(async () => page.resolve(arcticMonkeysPage1()));
    await screen.findByRole("link", { name: PAGE1_ROW_NAMES[0] });
    expect(queryByLine("Loading Setlists…")).toBeNull();
  });

  it("AC-15: without a name in the answer or a picked candidate the heading reads Setlists", async () => {
    openList([emptyPage(false)], `/artists/${PEARL_JAM_MBID}`);
    await screen.findByRole("heading", { level: 2, name: "No Setlists with songs yet" });
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Setlists");
  });

  it("AC-15: loaded pages are kept, so returning to the list shows them again without a new request", async () => {
    const { api, user } = openList([arcticMonkeysPage1(), arcticMonkeysPage2()]);
    await user.click(await screen.findByRole("button", { name: "Load more Setlists" }));
    await screen.findByRole("link", { name: "19 Nov 2026, Bell Centre, 20 songs" });

    await user.click(screen.getByRole("link", { name: PAGE1_ROW_NAMES[1] }));
    await waitFor(() => expect(currentUrl()).toBe(`/setlists/${BOSTON_ID}`));
    await user.click(await screen.findByRole("link", { name: "Setlists of Arctic Monkeys" }));
    await waitFor(() => expect(currentUrl()).toBe(LIST_PATH));

    await screen.findByRole("link", { name: "19 Nov 2026, Bell Centre, 20 songs" });
    expect(linksTo("/setlists/")).toHaveLength(4);
    expect(api.getArtistSetlists).toHaveBeenCalledTimes(2);
  });

  it("AC-16: each row's accessible name is its date, venue, city, song count and Incomplete Setlist", async () => {
    openList([arcticMonkeysPage1()]);
    for (const name of PAGE1_ROW_NAMES) {
      expect((await screen.findByRole("link", { name })).getAttribute("href")).toMatch(/^\/setlists\/[0-9a-f]+$/);
    }
    expectRows(PAGE1_ROW_NAMES);
  });

  it("AC-16: an empty city is left out of the accessible name with its comma", async () => {
    const { user } = openList([arcticMonkeysPage1(), arcticMonkeysPage2()]);
    await user.click(await screen.findByRole("button", { name: "Load more Setlists" }));
    expect((await screen.findByRole("link", { name: "19 Nov 2026, Bell Centre, 20 songs" })).getAttribute("href")).toBe(
      "/setlists/3b8c4c4f",
    );
  });

  it("AC-16: an empty venue is left out of the accessible name with its comma", async () => {
    const page = arcticMonkeysPage1();
    page.setlists = page.setlists.map((setlist) => (setlist.id === BOSTON_ID ? { ...setlist, venue: "" } : setlist));
    openList([page]);
    await screen.findByRole("link", { name: "24 Nov 2026, Boston, 18 songs, Incomplete Setlist" });
  });

  it("AC-17: Load more asks for page 2 once, shows Loading… with focus kept, and appends only new Setlists", async () => {
    const page2 = deferred<ArtistSetlistsResponse>();
    const { api, user } = openList([arcticMonkeysPage1(), page2.promise]);
    const more = await screen.findByRole("button", { name: "Load more Setlists" });
    expect(isAfterRows(more)).toBe(true);

    await user.click(more);
    const loading = await screen.findByRole("button", { name: "Loading…" });
    expect(loading.getAttribute("aria-disabled")).toBe("true");
    expect(document.activeElement).toBe(loading);
    await user.click(loading);
    expect(api.getArtistSetlists).toHaveBeenCalledTimes(2);
    expect(api.getArtistSetlists.mock.calls[1]?.slice(0, 2)).toEqual([ARCTIC_MONKEYS_MBID, 2]);

    await act(async () => page2.resolve(arcticMonkeysPage2()));
    await screen.findByRole("link", { name: "19 Nov 2026, Bell Centre, 20 songs" });
    expectRows([...PAGE1_ROW_NAMES, "19 Nov 2026, Bell Centre, 20 songs"]);
    await waitFor(() => expect(announced()).toBe("1 more Setlist loaded"));
  });

  it("AC-17: announces the number of Setlists added in the plural", async () => {
    const page2 = arcticMonkeysPage2();
    const extra = page2.setlists[1];
    if (!extra) throw new Error("page 2 has a second Setlist");
    page2.setlists = [extra, { ...extra, id: "5b8c4b5a", date: "2026-11-17", venue: "Rogers Place", city: "Edmonton" }];
    const { user } = openList([arcticMonkeysPage1(), page2]);
    await user.click(await screen.findByRole("button", { name: "Load more Setlists" }));
    await screen.findByRole("link", { name: "17 Nov 2026, Rogers Place, Edmonton, 20 songs" });
    await waitFor(() => expect(announced()).toBe("2 more Setlists loaded"));
  });

  it("AC-17: a page with nothing new announces No more Setlists and keeps the button", async () => {
    const { api, user } = openList([arcticMonkeysPage1(), { ...emptyPage(true), artist: { mbid: ARCTIC_MONKEYS_MBID } }]);
    await user.click(await screen.findByRole("button", { name: "Load more Setlists" }));
    await waitFor(() => expect(announced()).toBe("No more Setlists"));
    expectRows(PAGE1_ROW_NAMES);
    expect(screen.getByRole("button", { name: "Load more Setlists" }).getAttribute("aria-disabled")).not.toBe("true");
    expect(api.getArtistSetlists).toHaveBeenCalledTimes(2);
  });

  it("AC-18: after the last page there is no Load more button and the end line shows", async () => {
    const { user } = openList([arcticMonkeysPage1(), arcticMonkeysPage2()]);
    expect(queryByLine("That's every Setlist on setlist.fm.")).toBeNull();
    await user.click(await screen.findByRole("button", { name: "Load more Setlists" }));
    await screen.findByRole("link", { name: "19 Nov 2026, Bell Centre, 20 songs" });
    await waitFor(() => expect(screen.queryByRole("button", { name: /Load more Setlists|Loading…/ })).toBeNull());
    const end = getByLine("That's every Setlist on setlist.fm.");
    expect(isAfterRows(end)).toBe(true);
  });

  it("AC-18: when the last page adds Setlists and Load more goes away, focus moves to the first new row", async () => {
    const { user } = openList([arcticMonkeysPage1(), arcticMonkeysPage2()]);
    await user.click(await screen.findByRole("button", { name: "Load more Setlists" }));
    await screen.findByRole("link", { name: "19 Nov 2026, Bell Centre, 20 songs" });
    await waitFor(() => expect(screen.queryByRole("button", { name: /Load more Setlists|Loading…/ })).toBeNull());
    await expectFocusOn(() => screen.getByRole("link", { name: "19 Nov 2026, Bell Centre, 20 songs" }));
  });

  it("AC-18: when the last page adds nothing and Load more goes away, focus moves to the end line", async () => {
    const lastPage = { ...arcticMonkeysPage2(), setlists: arcticMonkeysPage2().setlists.slice(0, 1) };
    const { user } = openList([arcticMonkeysPage1(), lastPage]);
    await user.click(await screen.findByRole("button", { name: "Load more Setlists" }));
    await waitFor(() => expect(announced()).toBe("No more Setlists"));
    await waitFor(() => expect(screen.queryByRole("button", { name: /Load more Setlists|Loading…/ })).toBeNull());
    expectRows(PAGE1_ROW_NAMES);
    await expectFocusOn(() => getByLine("That's every Setlist on setlist.fm."));
  });

  it("AC-18: when the list is still empty and the last page adds nothing, focus moves to the empty-state heading", async () => {
    const { api, user } = openList([emptyPage(true), emptyPage(false)], `/artists/${PEARL_JAM_MBID}`);
    await user.click(await screen.findByRole("button", { name: "Load more Setlists" }));
    await screen.findByRole("heading", { level: 2, name: "No Setlists with songs yet" });
    await waitFor(() => expect(screen.queryByRole("button", { name: /Load more Setlists|Loading…/ })).toBeNull());
    expect(linksTo("/setlists/")).toEqual([]);
    expect(api.getArtistSetlists).toHaveBeenCalledTimes(2);
    await expectFocusOn(() => screen.getByRole("heading", { level: 2, name: "No Setlists with songs yet" }));
  });

  it("AC-18: a single page with hasMore false ends the list at once", async () => {
    const page = { ...arcticMonkeysPage1(), hasMore: false };
    openList([page]);
    await screen.findByRole("link", { name: PAGE1_ROW_NAMES[0] });
    getByLine("That's every Setlist on setlist.fm.");
    expect(screen.queryByRole("button", { name: "Load more Setlists" })).toBeNull();
  });

  it("AC-19: an empty first page with no more pages says there are no Setlists with songs yet", async () => {
    const api = fakeApi({ searchArtists: async () => pearlJamCandidates(), getArtistSetlists: async () => emptyPage(false) });
    const { user } = openApp(api, "/?artist=pearl%20jam");
    await user.click(await screen.findByRole("link", { name: "Pearl Jam" }));
    await screen.findByRole("heading", { level: 2, name: "No Setlists with songs yet" });
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Pearl Jam");
    getByLine("setlist.fm has no Setlist with songs for this Artist.");
    expect(screen.getByRole("link", { name: "Search for another Artist" }).getAttribute("href")).toBe("/");
    expect(screen.queryByRole("button", { name: "Load more Setlists" })).toBeNull();
    expect(queryByLine("That's every Setlist on setlist.fm.")).toBeNull();
  });

  it("AC-19: an empty first page with more pages offers Load more", async () => {
    openList([emptyPage(true)], `/artists/${PEARL_JAM_MBID}`);
    const line = await waitFor(() => getByLine("No Setlists with songs among the newest ones. Load more to look further back."));
    const more = screen.getByRole("button", { name: "Load more Setlists" });
    expect(line.compareDocumentPosition(more) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(screen.queryByRole("heading", { name: "No Setlists with songs yet" })).toBeNull();
  });

  it("AC-20: a row opens its Setlist screen with the back link Setlists of the Artist", async () => {
    const { user } = openList([arcticMonkeysPage1()]);
    await user.click(await screen.findByRole("link", { name: PAGE1_ROW_NAMES[1] }));
    await waitFor(() => expect(currentUrl()).toBe(`/setlists/${BOSTON_ID}`));
    const back = await screen.findByRole("link", { name: "Setlists of Arctic Monkeys" });
    expect(back.getAttribute("href")).toBe(LIST_PATH);
  });

  it("AC-20: from a list whose Artist name is unknown the back link reads Setlists", async () => {
    const page = arcticMonkeysPage1();
    page.artist = { mbid: ARCTIC_MONKEYS_MBID };
    const { user } = openList([page]);
    await user.click(await screen.findByRole("link", { name: PAGE1_ROW_NAMES[0] }));
    await waitFor(() => expect(currentUrl()).toBe("/setlists/2b8c4f1a"));
    const back = await screen.findByRole("link", { name: "Setlists" });
    expect(back.getAttribute("href")).toBe(LIST_PATH);
  });

  it("AC-3: the list heading gets focus when the rows have rendered", async () => {
    openList([arcticMonkeysPage1()]);
    await expectFocusOn(() => screen.getByRole("heading", { level: 1, name: "Arctic Monkeys" }));
  });

  it("AC-52: the Setlist list with an Incomplete badge and Load more has no axe violations", async () => {
    const { container } = openList([arcticMonkeysPage1()]);
    await screen.findByRole("button", { name: "Load more Setlists" });
    expect(await axe(container)).toHaveNoViolations();
  });

  it("AC-52: the Setlist list while page 1 loads has no axe violations", async () => {
    const { container } = openList([deferred<ArtistSetlistsResponse>().promise]);
    await waitFor(() => getByLine("Loading Setlists…"));
    expect(await axe(container)).toHaveNoViolations();
  });

  it("AC-52: the Setlist list while Load more is pending has no axe violations", async () => {
    const { container, user } = openList([arcticMonkeysPage1(), deferred<ArtistSetlistsResponse>().promise]);
    await user.click(await screen.findByRole("button", { name: "Load more Setlists" }));
    await screen.findByRole("button", { name: "Loading…" });
    expect(await axe(container)).toHaveNoViolations();
  });

  it("AC-52: the Setlist list reached from a candidate, while page 1 loads, has no axe violations", async () => {
    const api = fakeApi({
      searchArtists: async () => pearlJamCandidates(),
      getArtistSetlists: () => deferred<ArtistSetlistsResponse>().promise,
    });
    const { user, container } = openApp(api, "/?artist=pearl%20jam");
    await user.click(await screen.findByRole("link", { name: "Pearl Jam" }));
    await screen.findByRole("heading", { level: 1, name: "Pearl Jam" });
    getByLine("Loading Setlists…");
    expect(await axe(container)).toHaveNoViolations();
  });

  it("AC-52: the empty Setlist list has no axe violations", async () => {
    const { container } = openList([emptyPage(false)], `/artists/${PEARL_JAM_MBID}`);
    await screen.findByRole("heading", { level: 2, name: "No Setlists with songs yet" });
    expect(await axe(container)).toHaveNoViolations();
  });

  it("AC-52: the list after its last page has no axe violations", async () => {
    const { container, user } = openList([arcticMonkeysPage1(), arcticMonkeysPage2()]);
    await user.click(await screen.findByRole("button", { name: "Load more Setlists" }));
    await waitFor(() => getByLine("That's every Setlist on setlist.fm."));
    expect(await axe(container)).toHaveNoViolations();
  });
});

/** True when `el` comes after every Setlist row. */
function isAfterRows(el: Element): boolean {
  return linksTo("/setlists/").every((row) => (row.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0);
}
