// The Start screen: the Artist search with its candidates, and the setlist.fm link form.
import { act, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";
import { ApiCallError } from "../../../src/web/client/api/index.js";
import type { ArtistsResponse, SetlistLinksResponse } from "../../../src/web/shared/index.js";
import { deferred, fakeApi } from "./fixtures/fake-api";
import {
  currentUrl,
  describedBy,
  expectFocusOn,
  getByLine,
  linksTo,
  normalise,
  openApp,
  queryByLine,
} from "./fixtures/dom";
import {
  ARCTIC_MONKEYS_MBID,
  FONTAINES_MBID,
  MADRID_ID,
  MADRID_URL,
  SHARE_URL,
  arcticMonkeysCandidates,
  fontainesCandidates,
  madridStatus,
  noCandidates,
  pearlJamCandidates,
} from "./fixtures/values";

function artistInput(): HTMLInputElement {
  return screen.getByLabelText("Artist") as HTMLInputElement;
}

function linkInput(): HTMLInputElement {
  return screen.getByLabelText("setlist.fm link") as HTMLInputElement;
}

const ARCTIC_MONKEYS_LINK = /^Arctic Monkeys\s*English rock band from Sheffield$/;

// ---------------------------------------------------------------- Start

describe("Start screen", () => {
  it("AC-6: shows the headline, the intro, the Artist search form and the setlist.fm link form", async () => {
    openApp(fakeApi(), "/");
    await screen.findByRole("heading", { level: 1, name: "Hear the Setlist before the Show" });
    getByLine("Find an Artist's Setlist on setlist.fm and play it as a Spotify playlist.");

    const artist = artistInput();
    const link = linkInput();
    expect(artist.closest("form")).not.toBeNull();
    expect(link.closest("form")).not.toBeNull();
    expect(artist.closest("form")).not.toBe(link.closest("form"));
    expect(link.getAttribute("placeholder")).toBe("https://www.setlist.fm/setlist/…");

    const searchButton = screen.getByRole("button", { name: "Search" });
    const openButton = screen.getByRole("button", { name: "Open" });
    expect(artist.closest("form")?.contains(searchButton)).toBe(true);
    expect(link.closest("form")?.contains(openButton)).toBe(true);
  });

  it("AC-6: typing in the Artist input sends no request", async () => {
    const api = fakeApi();
    const { user } = openApp(api, "/");
    await user.type(artistInput(), "arctic monkeys");
    expect(api.searchArtists).not.toHaveBeenCalled();
    expect(currentUrl()).toBe("/");
  });

  it("AC-52: the Start screen has no axe violations", async () => {
    const { container } = openApp(fakeApi(), "/");
    await screen.findByRole("heading", { level: 1, name: "Hear the Setlist before the Show" });
    expect(await axe(container)).toHaveNoViolations();
  });
});

// ---------------------------------------------------------------- Artist search

describe("Artist search", () => {
  it("AC-7: Enter in the Artist input puts the trimmed name in the URL and searches it once", async () => {
    const api = fakeApi({ searchArtists: async () => arcticMonkeysCandidates() });
    const { user } = openApp(api, "/");
    await user.type(artistInput(), "  arctic monkeys {Enter}");
    await waitFor(() => expect(currentUrl()).toBe("/?artist=arctic%20monkeys"));
    await screen.findByRole("heading", { level: 1, name: "Pick the Artist" });
    expect(api.searchArtists).toHaveBeenCalledTimes(1);
    expect(api.searchArtists.mock.calls[0]?.[0]).toBe("arctic monkeys");
  });

  it("AC-7: activating Search does the same as Enter", async () => {
    const api = fakeApi({ searchArtists: async () => fontainesCandidates() });
    const { user } = openApp(api, "/");
    await user.type(artistInput(), "Fontaines D.C.");
    await user.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(currentUrl()).toBe("/?artist=Fontaines%20D.C."));
    expect(api.searchArtists).toHaveBeenCalledTimes(1);
    expect(api.searchArtists.mock.calls[0]?.[0]).toBe("Fontaines D.C.");
  });

  it("AC-7: while the answer is pending the button reads Searching… and a second activation sends nothing", async () => {
    const answer = deferred<ArtistsResponse>();
    const api = fakeApi({ searchArtists: () => answer.promise });
    const { user } = openApp(api, "/");
    await user.type(artistInput(), "arctic monkeys{Enter}");

    const searching = await screen.findByRole("button", { name: "Searching…" });
    expect(searching.getAttribute("aria-disabled")).toBe("true");
    await user.click(searching);
    await user.type(artistInput(), "{Enter}");
    expect(api.searchArtists).toHaveBeenCalledTimes(1);

    await act(async () => answer.resolve(arcticMonkeysCandidates()));
    await screen.findByRole("heading", { level: 1, name: "Pick the Artist" });
    expect(screen.getByRole("button", { name: "Search" }).getAttribute("aria-disabled")).not.toBe("true");
  });

  it("AC-7: an earlier candidate list stays until the new answer arrives", async () => {
    const second = deferred<ArtistsResponse>();
    let calls = 0;
    const api = fakeApi({
      searchArtists: () => {
        calls += 1;
        return calls === 1 ? Promise.resolve(arcticMonkeysCandidates()) : second.promise;
      },
    });
    const { user } = openApp(api, "/");
    await user.type(artistInput(), "arctic monkeys{Enter}");
    await screen.findByRole("link", { name: ARCTIC_MONKEYS_LINK });

    await user.clear(artistInput());
    await user.type(artistInput(), "pearl jam{Enter}");
    await screen.findByRole("button", { name: "Searching…" });
    expect(linksTo("/artists/")).toHaveLength(3);

    await act(async () => second.resolve(pearlJamCandidates()));
    await waitFor(() => expect(linksTo("/artists/").map((a) => normalise(a.textContent))).toEqual(["Pearl Jam"]));
    expect(api.searchArtists.mock.calls[1]?.[0]).toBe("pearl jam");
  });

  it.each([
    ["empty", ""],
    ["only whitespace", "   "],
  ])("AC-8: an %s Artist input sends no request and is marked invalid", async (_kind, typed) => {
    const api = fakeApi();
    const { user } = openApp(api, "/");
    const input = artistInput();
    await user.click(input);
    if (typed !== "") await user.keyboard(typed);
    await user.keyboard("{Enter}");

    await waitFor(() => expect(input.getAttribute("aria-invalid")).toBe("true"));
    expect(describedBy(input)).toBe("Type an Artist's name to search.");
    expect(document.activeElement).toBe(input);
    expect(api.searchArtists).not.toHaveBeenCalled();
    expect(currentUrl()).toBe("/");
  });

  it("AC-8: activating Search with an empty input marks it invalid without a request", async () => {
    const api = fakeApi();
    const { user } = openApp(api, "/");
    await user.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(artistInput().getAttribute("aria-invalid")).toBe("true"));
    expect(describedBy(artistInput())).toBe("Type an Artist's name to search.");
    expect(api.searchArtists).not.toHaveBeenCalled();
  });

  it("AC-9: shows the candidates in the server's order under the form, with the input holding the name", async () => {
    const { user } = openApp(fakeApi({ searchArtists: async () => arcticMonkeysCandidates() }), "/");
    await user.type(artistInput(), "  arctic monkeys {Enter}");
    const pick = await screen.findByRole("heading", { level: 1, name: "Pick the Artist" });
    getByLine('3 Artists found for "arctic monkeys"');
    expect(artistInput().value).toBe("arctic monkeys");
    expect(artistInput().compareDocumentPosition(pick) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);

    const candidates = linksTo("/artists/");
    expect(candidates.map((a) => a.getAttribute("href"))).toEqual([
      `/artists/${ARCTIC_MONKEYS_MBID}`,
      "/artists/1c3a5e7f-2b4d-4f6a-8c0e-1a2b3c4d5e6f",
      "/artists/7d9e1f3a-5b7c-4d9e-a1f3-5b7c9d1e3f5a",
    ]);
    const first = candidates[0];
    const second = candidates[1];
    const third = candidates[2];
    if (!first || !second || !third) throw new Error("three candidates expected");
    expect(normalise(first.textContent)).toMatch(/^Arctic Monkeys\s*English rock band from Sheffield$/);
    expect(normalise(second.textContent)).toMatch(/^The Arctic Monkeys\s*1960s cover act$/);
    expect(normalise(third.textContent)).toBe("Arctic Monkeys Tribute");
    const list = first.closest("ol");
    expect(list).not.toBeNull();
    expect(list?.contains(third)).toBe(true);
    expect(list?.querySelectorAll(":scope > li")).toHaveLength(3);
  });

  it("AC-9: a single candidate is still a list and the app does not move on by itself", async () => {
    const api = fakeApi({ searchArtists: async () => fontainesCandidates() });
    openApp(api, "/?artist=Fontaines%20D.C.");
    await screen.findByRole("heading", { level: 1, name: "Pick the Artist" });
    getByLine('1 Artist found for "Fontaines D.C."');
    const candidates = linksTo("/artists/");
    expect(candidates.map((a) => a.getAttribute("href"))).toEqual([`/artists/${FONTAINES_MBID}`]);
    expect(candidates[0]?.closest("ol")).not.toBeNull();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(currentUrl()).toBe("/?artist=Fontaines%20D.C.");
    expect(api.getArtistSetlists).not.toHaveBeenCalled();
  });

  it("AC-9: focus moves to Pick the Artist when the candidates arrive", async () => {
    const { user } = openApp(fakeApi({ searchArtists: async () => arcticMonkeysCandidates() }), "/");
    await user.type(artistInput(), "arctic monkeys{Enter}");
    await expectFocusOn(() => screen.getByRole("heading", { level: 1, name: "Pick the Artist" }));
  });

  it("AC-10: activating a candidate opens its Setlist list, headed with its name while page 1 loads", async () => {
    const page = deferred<never>();
    const api = fakeApi({
      searchArtists: async () => arcticMonkeysCandidates(),
      getArtistSetlists: () => page.promise,
    });
    const { user } = openApp(api, "/?artist=arctic%20monkeys");
    await user.click(await screen.findByRole("link", { name: ARCTIC_MONKEYS_LINK }));
    await waitFor(() => expect(currentUrl()).toBe(`/artists/${ARCTIC_MONKEYS_MBID}`));
    await screen.findByRole("heading", { level: 1, name: "Arctic Monkeys" });
    getByLine("Loading Setlists…");
    expect(api.getArtistSetlists.mock.calls[0]?.slice(0, 2)).toEqual([ARCTIC_MONKEYS_MBID, 1]);
  });

  it("AC-11: no candidates shows No Artist found with the searched name, and the input keeps it", async () => {
    const { user } = openApp(fakeApi({ searchArtists: async () => noCandidates() }), "/");
    await user.type(artistInput(), "arctci monkys{Enter}");
    await screen.findByRole("heading", { level: 1, name: "No Artist found — check spelling" });
    getByLine('Nothing on setlist.fm matches "arctci monkys". Try the Artist\'s full name or another spelling.');
    expect(artistInput().value).toBe("arctci monkys");
    expect(linksTo("/artists/")).toHaveLength(0);
    await expectFocusOn(() => screen.getByRole("heading", { level: 1, name: "No Artist found — check spelling" }));
  });

  it("AC-12: opening a search URL directly fills the input and runs the search", async () => {
    const api = fakeApi({ searchArtists: async () => fontainesCandidates() });
    openApp(api, "/?artist=Fontaines%20D.C.");
    await screen.findByRole("heading", { level: 1, name: "Pick the Artist" });
    expect(artistInput().value).toBe("Fontaines D.C.");
    expect(api.searchArtists).toHaveBeenCalledTimes(1);
    expect(api.searchArtists.mock.calls[0]?.[0]).toBe("Fontaines D.C.");
    await expectFocusOn(() => screen.getByRole("heading", { level: 1, name: "Pick the Artist" }));
  });

  it("AC-43: an INVALID_INPUT answer marks the Artist field invalid with the server's message and hint", async () => {
    const api = fakeApi({
      searchArtists: async () => {
        throw new ApiCallError({
          code: "INVALID_INPUT", message: "That Artist name is too long.", hint: "Use at most 200 characters.",
        });
      },
    });
    const { user } = openApp(api, "/");
    const input = artistInput();
    await user.click(input);
    await user.paste("a".repeat(201));
    await user.click(screen.getByRole("button", { name: "Search" }));

    await waitFor(() => expect(input.getAttribute("aria-invalid")).toBe("true"));
    expect(describedBy(input)).toBe("That Artist name is too long. Use at most 200 characters.");
    expect(queryByLine("Type an Artist's name to search.")).toBeNull();
    expect(screen.queryByRole("heading", { name: "That Artist name is too long." })).toBeNull();
    await expectFocusOn(artistInput);
  });

  it("AC-52: the candidates have no axe violations", async () => {
    const { container } = openApp(fakeApi({ searchArtists: async () => arcticMonkeysCandidates() }), "/?artist=arctic%20monkeys");
    await screen.findByRole("heading", { level: 1, name: "Pick the Artist" });
    expect(await axe(container)).toHaveNoViolations();
  });

  it("AC-52: No Artist found has no axe violations", async () => {
    const { container } = openApp(fakeApi({ searchArtists: async () => noCandidates() }), "/?artist=arctci%20monkys");
    await screen.findByRole("heading", { level: 1, name: "No Artist found — check spelling" });
    expect(await axe(container)).toHaveNoViolations();
  });

  it("AC-52: the Artist field's invalid state has no axe violations", async () => {
    const { user, container } = openApp(fakeApi(), "/");
    await user.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(artistInput().getAttribute("aria-invalid")).toBe("true"));
    expect(await axe(container)).toHaveNoViolations();
  });
});

// ---------------------------------------------------------------- setlist.fm link

describe("setlist.fm link", () => {
  it("AC-13: Enter in the link input reads the trimmed link once and opens its Setlist screen", async () => {
    const api = fakeApi({
      readSetlistLink: async () => ({ setlistId: MADRID_ID }),
      getSetlist: () => deferred<never>().promise,
    });
    const { user } = openApp(api, "/");
    await user.click(linkInput());
    await user.paste(` ${MADRID_URL} `);
    await user.keyboard("{Enter}");

    await waitFor(() => expect(currentUrl()).toBe(`/setlists/${MADRID_ID}`));
    expect(api.readSetlistLink).toHaveBeenCalledTimes(1);
    expect(api.readSetlistLink.mock.calls[0]?.[0]).toBe(MADRID_URL);
    expect((await screen.findByRole("link", { name: "New search" })).getAttribute("href")).toBe("/");
    await waitFor(() => expect(api.getSetlist.mock.calls[0]?.[0]).toBe(MADRID_ID));
  });

  it("AC-13: while the link is read the button reads Opening… and ignores another activation", async () => {
    const answer = deferred<SetlistLinksResponse>();
    const api = fakeApi({
      readSetlistLink: () => answer.promise,
      getSetlist: async () => madridStatus({ status: "current", url: SHARE_URL }),
    });
    const { user } = openApp(api, "/");
    await user.click(linkInput());
    await user.paste(MADRID_URL);
    await user.click(screen.getByRole("button", { name: "Open" }));

    const opening = await screen.findByRole("button", { name: "Opening…" });
    expect(opening.getAttribute("aria-disabled")).toBe("true");
    await user.click(opening);
    expect(api.readSetlistLink).toHaveBeenCalledTimes(1);

    await act(async () => answer.resolve({ setlistId: MADRID_ID }));
    await waitFor(() => expect(currentUrl()).toBe(`/setlists/${MADRID_ID}`));
  });

  it.each([
    ["empty", ""],
    ["only whitespace", "   "],
  ])("AC-14: an %s link input sends no request and is marked invalid", async (_kind, typed) => {
    const api = fakeApi();
    const { user } = openApp(api, "/");
    const input = linkInput();
    await user.click(input);
    if (typed !== "") await user.keyboard(typed);
    await user.keyboard("{Enter}");

    await waitFor(() => expect(input.getAttribute("aria-invalid")).toBe("true"));
    expect(describedBy(input)).toBe("Paste a setlist.fm Setlist link to open it.");
    expect(document.activeElement).toBe(input);
    expect(api.readSetlistLink).not.toHaveBeenCalled();
  });

  it.each([
    [
      "INVALID_INPUT",
      new ApiCallError({
        code: "INVALID_INPUT", message: "That isn't a setlist.fm Setlist link.", hint: "Paste a link like setlist.fm/setlist/…/….html",
      }),
      "That isn't a setlist.fm Setlist link. Paste a link like setlist.fm/setlist/…/….html",
    ],
    [
      "NOT_FOUND",
      new ApiCallError({ code: "NOT_FOUND", message: "setlist.fm has no Setlist with that id." }),
      "setlist.fm has no Setlist with that id.",
    ],
  ])("AC-14: a %s answer marks the link field invalid with the server's words and keeps the link", async (_code, error, words) => {
    const api = fakeApi({
      readSetlistLink: async () => {
        throw error;
      },
    });
    const { user } = openApp(api, "/");
    const input = linkInput();
    await user.click(input);
    await user.paste("https://example.com/x");
    await user.click(screen.getByRole("button", { name: "Open" }));

    await waitFor(() => expect(input.getAttribute("aria-invalid")).toBe("true"));
    expect(describedBy(input)).toBe(words);
    expect(input.value).toBe("https://example.com/x");
    expect(currentUrl()).toBe("/");
    await expectFocusOn(linkInput);
  });
});
