// The page shell, routes, document titles, back links, focus on each new screen, Back through
// the steps, and Page not found.
import { act, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "../../../src/web/client/App.js";
import { deferred, fakeApi, type FakeApi } from "./fixtures/fake-api";
import { currentUrl, expectFocusOn, getByLine, isBefore, linksTo, normalise, openApp } from "./fixtures/dom";
import { openSetlistFromList } from "./fixtures/flows";
import {
  ARCTIC_MONKEYS_MBID,
  BOSTON_ID,
  MADRID_ID,
  PEARL_JAM_MBID,
  PORTLAND_ID,
  arcticMonkeysCandidates,
  arcticMonkeysPage1,
  emptyPage,
  madridResult,
  madridStatus,
  portlandCurrentStatus,
} from "./fixtures/values";

function noCallsMade(api: FakeApi): void {
  expect(api.searchArtists).not.toHaveBeenCalled();
  expect(api.getArtistSetlists).not.toHaveBeenCalled();
  expect(api.readSetlistLink).not.toHaveBeenCalled();
  expect(api.getSetlist).not.toHaveBeenCalled();
  expect(api.streamPreview).not.toHaveBeenCalled();
  expect(api.createPlaylist).not.toHaveBeenCalled();
}

async function waitForTitle(title: string): Promise<void> {
  await waitFor(() => expect(document.title).toBe(title));
}

// ---------------------------------------------------------------- shell

describe("page shell", () => {
  it("AC-1: has a skip link first, a header with the wordmark, one main and the footer, in that order", async () => {
    const { user } = openApp(fakeApi(), "/");
    await screen.findByRole("heading", { level: 1, name: "Hear the Setlist before the Show" });

    const banner = screen.getByRole("banner");
    const main = screen.getByRole("main");
    const footer = screen.getByRole("contentinfo");
    expect(document.querySelectorAll("main")).toHaveLength(1);
    expect(isBefore(banner, main)).toBe(true);
    expect(isBefore(main, footer)).toBe(true);

    const wordmark = within(banner).getByRole("link", { name: "Playset" });
    expect(wordmark.getAttribute("href")).toBe("/");

    await user.tab();
    const skip = screen.getByRole("link", { name: "Skip to content" });
    expect(document.activeElement).toBe(skip);
    expect(main.id).not.toBe("");
    expect(skip.getAttribute("href")).toBe(`#${main.id}`);
    expect(isBefore(skip, banner) || banner.contains(skip)).toBe(true);
  });

  it("AC-1: the footer holds the setlist.fm credit, the public-playlist line and the Terms link", async () => {
    openApp(fakeApi(), "/");
    const footer = await screen.findByRole("contentinfo");
    const paragraphs = Array.from(footer.querySelectorAll("p")).map((p) => normalise(p.textContent));
    expect(paragraphs).toEqual([
      "Setlists from setlist.fm",
      "Playlists are created in Playset's Spotify account and are public.",
      "Terms and Privacy",
    ]);
    expect(within(footer).getByRole("link", { name: "setlist.fm" }).getAttribute("href")).toBe("https://www.setlist.fm/");
    expect(within(footer).getByRole("link", { name: "Terms and Privacy" }).getAttribute("href")).toBe("/terms");
  });

  it.each([
    ["Start", "/", "Hear the Setlist before the Show"],
    ["Terms", "/terms", "Terms and Privacy"],
    ["Page not found", "/admin/settings", "Page not found"],
  ])("AC-1: the %s screen has exactly one h1", async (_screen, path, h1) => {
    openApp(fakeApi(), path);
    await screen.findByRole("heading", { level: 1, name: h1 });
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("AC-1: the Setlist list and the Setlist screen have exactly one h1", async () => {
    await openSetlistFromList(portlandCurrentStatus());
    await screen.findByRole("heading", { level: 2, name: "Setlist Playlist ready" });
    expect(screen.getAllByRole("heading", { level: 1 }).map((h) => normalise(h.textContent))).toEqual(["Pearl Jam"]);

    await act(async () => window.history.back());
    await screen.findByRole("link", { name: "24 Nov 2026, TD Garden, Boston, 18 songs, Incomplete Setlist" });
    expect(screen.getAllByRole("heading", { level: 1 }).map((h) => normalise(h.textContent))).toEqual(["Arctic Monkeys"]);
  });
});

// ---------------------------------------------------------------- titles and back links

describe("document titles and back links", () => {
  it("AC-2: Start is titled Playset and has no back link", async () => {
    openApp(fakeApi(), "/");
    await screen.findByRole("heading", { level: 1, name: "Hear the Setlist before the Show" });
    await waitForTitle("Playset");
    expect(screen.queryByRole("link", { name: "New search" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Back to Playset" })).toBeNull();
    expect(screen.queryByRole("link", { name: /^Setlists/ })).toBeNull();
  });

  it("AC-2: the candidates are titled with the searched name and link back to a new search", async () => {
    openApp(fakeApi({ searchArtists: async () => arcticMonkeysCandidates() }), "/?artist=arctic%20monkeys");
    await screen.findByRole("heading", { level: 1, name: "Pick the Artist" });
    await waitForTitle('Artists for "arctic monkeys" – Playset');
    expect(screen.getByRole("link", { name: "New search" }).getAttribute("href")).toBe("/");
  });

  it("AC-2: the Setlist list is titled with the Artist's name and links back to a new search", async () => {
    openApp(fakeApi({ getArtistSetlists: async () => arcticMonkeysPage1() }), `/artists/${ARCTIC_MONKEYS_MBID}`);
    await waitForTitle("Arctic Monkeys – Setlists – Playset");
    expect(screen.getByRole("link", { name: "New search" }).getAttribute("href")).toBe("/");
  });

  it("AC-2: the Setlist list of an Artist whose name is unknown is titled Setlists – Playset", async () => {
    openApp(fakeApi({ getArtistSetlists: async () => emptyPage(false) }), `/artists/${PEARL_JAM_MBID}`);
    await screen.findByRole("heading", { level: 2, name: "No Setlists with songs yet" });
    await waitForTitle("Setlists – Playset");
  });

  it("AC-2: the Setlist screen is titled Setlist – Playset until the Show is known, then Artist and date", async () => {
    const status = deferred<ReturnType<typeof portlandCurrentStatus>>();
    openApp(fakeApi({ getSetlist: () => status.promise }), `/setlists/${PORTLAND_ID}`);
    await waitForTitle("Setlist – Playset");
    expect(screen.getByRole("link", { name: "New search" }).getAttribute("href")).toBe("/");

    await act(async () => status.resolve(portlandCurrentStatus()));
    await waitForTitle("Pearl Jam, 22 Nov 2026 – Playset");
  });

  it("AC-2: the Setlist screen reached from a Setlist list links back to that list", async () => {
    await openSetlistFromList();
    const back = screen.getByRole("link", { name: "Setlists of Arctic Monkeys" });
    expect(back.getAttribute("href")).toBe(`/artists/${ARCTIC_MONKEYS_MBID}`);
    expect(screen.queryByRole("link", { name: "New search" })).toBeNull();
  });

  it("AC-2: the back link to the Setlist list survives activating a Misses jump link", async () => {
    const { preview, user } = await openSetlistFromList();
    await waitFor(() => expect(preview.calls).toHaveLength(1));
    await preview.finish(madridResult());
    await user.click(await screen.findByRole("link", { name: "5 505" }));

    await waitFor(() => expect(window.location.hash).not.toBe(""));
    expect(window.location.pathname).toBe(`/setlists/${MADRID_ID}`);
    const back = await screen.findByRole("link", { name: "Setlists of Arctic Monkeys" });
    expect(back.getAttribute("href")).toBe(`/artists/${ARCTIC_MONKEYS_MBID}`);
    expect(screen.queryByRole("link", { name: "New search" })).toBeNull();
  });

  it("AC-2: the back link to the Setlist list survives Skip to content", async () => {
    const { user } = await openSetlistFromList();
    await screen.findByRole("heading", { level: 1, name: "Arctic Monkeys" });
    await user.click(screen.getByRole("link", { name: "Skip to content" }));

    await waitFor(() => expect(window.location.hash).toBe(`#${screen.getByRole("main").id}`));
    expect(window.location.pathname).toBe(`/setlists/${MADRID_ID}`);
    const back = await screen.findByRole("link", { name: "Setlists of Arctic Monkeys" });
    expect(back.getAttribute("href")).toBe(`/artists/${ARCTIC_MONKEYS_MBID}`);
    expect(screen.queryByRole("link", { name: "New search" })).toBeNull();
  });

  it("AC-2: Terms is titled Terms and Privacy and links back to Playset", async () => {
    openApp(fakeApi(), "/terms");
    await waitForTitle("Terms and Privacy – Playset");
    expect(screen.getByRole("link", { name: "Back to Playset" }).getAttribute("href")).toBe("/");
  });

  it("AC-2: Page not found is titled Page not found and links back to a new search", async () => {
    openApp(fakeApi(), "/setlist/73a1b2c5");
    await waitForTitle("Page not found – Playset");
    expect(screen.getByRole("link", { name: "New search" }).getAttribute("href")).toBe("/");
  });
});

// ---------------------------------------------------------------- focus

describe("focus on each new screen", () => {
  it("AC-3: a plain first load of the Start screen leaves focus where it is", async () => {
    openApp(fakeApi(), "/");
    await screen.findByRole("heading", { level: 1, name: "Hear the Setlist before the Show" });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(document.activeElement).toBe(document.body);
  });

  it("AC-3: a deep link to a Setlist list focuses its heading once the list has rendered", async () => {
    openApp(fakeApi({ getArtistSetlists: async () => arcticMonkeysPage1() }), `/artists/${ARCTIC_MONKEYS_MBID}`);
    await expectFocusOn(() => screen.getByRole("heading", { level: 1, name: "Arctic Monkeys" }));
  });

  it("AC-3: a link to Terms focuses the Terms heading", async () => {
    const { user } = openApp(fakeApi(), "/");
    await user.click(screen.getByRole("link", { name: "Terms and Privacy" }));
    await expectFocusOn(() => screen.getByRole("heading", { level: 1, name: "Terms and Privacy" }));
  });

  it("AC-3: Back to the candidates focuses Pick the Artist, and Forward focuses the Setlist list heading", async () => {
    const api = fakeApi({
      searchArtists: async () => arcticMonkeysCandidates(),
      getArtistSetlists: async () => arcticMonkeysPage1(),
    });
    const { user } = openApp(api, "/?artist=arctic%20monkeys");
    await user.click(await screen.findByRole("link", { name: /^Arctic Monkeys\s*English rock band from Sheffield$/ }));
    await expectFocusOn(() => screen.getByRole("heading", { level: 1, name: "Arctic Monkeys" }));

    await act(async () => window.history.back());
    await expectFocusOn(() => screen.getByRole("heading", { level: 1, name: "Pick the Artist" }));

    await act(async () => window.history.forward());
    await expectFocusOn(() => screen.getByRole("heading", { level: 1, name: "Arctic Monkeys" }));
  });
});

// ---------------------------------------------------------------- Back through the steps

describe("Back through the steps", () => {
  it("AC-4: Back three times shows the Setlist list, the candidates and the empty Start form, with no new requests", async () => {
    const status = deferred<ReturnType<typeof madridStatus>>();
    const api = fakeApi({
      searchArtists: async () => arcticMonkeysCandidates(),
      getArtistSetlists: async () => arcticMonkeysPage1(),
      getSetlist: () => status.promise,
    });
    const { user } = openApp(api, "/");
    await user.type(screen.getByLabelText("Artist"), "arctic monkeys{Enter}");
    await user.click(await screen.findByRole("link", { name: /^Arctic Monkeys\s*English rock band from Sheffield$/ }));
    await user.click(await screen.findByRole("link", { name: "24 Nov 2026, TD Garden, Boston, 18 songs, Incomplete Setlist" }));
    await waitFor(() => expect(currentUrl()).toBe(`/setlists/${BOSTON_ID}`));

    await act(async () => window.history.back());
    await waitFor(() => expect(currentUrl()).toBe(`/artists/${ARCTIC_MONKEYS_MBID}`));
    await screen.findByRole("link", { name: "27 Nov 2026, Madison Square Garden, New York, 21 songs" });
    expect(screen.getByRole("link", { name: "21 Nov 2026, Scotiabank Arena, Toronto, 1 song" }).getAttribute("href")).toBe(
      "/setlists/1b8c4d3e",
    );
    expect(api.getArtistSetlists).toHaveBeenCalledTimes(1);

    await act(async () => window.history.back());
    await waitFor(() => expect(currentUrl()).toBe("/?artist=arctic%20monkeys"));
    await screen.findByRole("heading", { level: 1, name: "Pick the Artist" });
    expect(linksTo("/artists/")).toHaveLength(3);
    expect(api.searchArtists).toHaveBeenCalledTimes(1);

    await act(async () => window.history.back());
    await waitFor(() => expect(currentUrl()).toBe("/"));
    await screen.findByRole("heading", { level: 1, name: "Hear the Setlist before the Show" });
    expect((screen.getByLabelText("Artist") as HTMLInputElement).value).toBe("");
    expect(linksTo("/artists/")).toHaveLength(0);
    expect(api.searchArtists).toHaveBeenCalledTimes(1);
    expect(api.getArtistSetlists).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------- Page not found

describe("Page not found", () => {
  it.each([
    "/admin/settings",
    "/setlist/73a1b2c5",
    "/artists",
    "/artists/not-an-mbid",
    "/setlists/73a1b2c5.html",
    "/setlists/not-hex",
  ])("AC-5: %s shows Page not found and sends no request", async (path) => {
    const api = fakeApi();
    openApp(api, path);
    await screen.findByRole("heading", { level: 1, name: "Page not found" });
    getByLine("There's nothing at this address.");
    expect(screen.getByRole("link", { name: "Search for an Artist" }).getAttribute("href")).toBe("/");
    noCallsMade(api);
  });

  it("AC-5: with an in-memory start path, /admin/settings shows Page not found and sends no request", async () => {
    const api = fakeApi();
    render(<App api={api} initialPath="/admin/settings" />);
    await screen.findByRole("heading", { level: 1, name: "Page not found" });
    getByLine("There's nothing at this address.");
    noCallsMade(api);
  });

  it("AC-5: an in-memory start path opens that route rather than the browser's URL", async () => {
    window.history.pushState(null, "", "/terms");
    render(<App api={fakeApi({ getArtistSetlists: async () => arcticMonkeysPage1() })} initialPath={`/artists/${ARCTIC_MONKEYS_MBID}`} />);
    await screen.findByRole("heading", { level: 1, name: "Arctic Monkeys" });
  });
});
