// The Terms and Privacy page: its sections and text in order, and the links it names.
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";
import { fakeApi } from "./fixtures/fake-api";
import { expectFocusOn, getByLine, isBefore, normalise, openApp } from "./fixtures/dom";

async function openTerms() {
  const opened = openApp(fakeApi(), "/terms");
  await screen.findByRole("heading", { level: 1, name: "Terms and Privacy" });
  return opened;
}

function main(): HTMLElement {
  return screen.getByRole("main");
}

/** The paragraphs and list items under the h2 `section`, up to the next h2. */
function sectionTexts(section: string): string[] {
  const start = within(main()).getByRole("heading", { level: 2, name: section });
  const headings = within(main()).getAllByRole("heading", { level: 2 });
  const next = headings[headings.indexOf(start) + 1];
  return Array.from(main().querySelectorAll("p, li"))
    .filter((el) => isBefore(start, el) && (next === undefined || isBefore(el, next)))
    .filter((el) => el.tagName === "LI" || el.closest("li") === null)
    .map((el) => normalise(el.textContent));
}

describe("Terms and Privacy", () => {
  it("AC-57: shows the h1, the last-updated line and the six sections in order, with focus on the h1", async () => {
    await openTerms();
    getByLine("Last updated 28 Nov 2026");
    expect(within(main()).getAllByRole("heading", { level: 2 }).map((h) => normalise(h.textContent))).toEqual([
      "What Playset is",
      "Playlists are public",
      "What Playset keeps about you",
      "Where the data comes from",
      "Spotify's terms",
      "Using Playset fairly",
    ]);
    await expectFocusOn(() => screen.getByRole("heading", { level: 1, name: "Terms and Privacy" }));
  });

  it("AC-57: What Playset is", async () => {
    await openTerms();
    expect(sectionTexts("What Playset is")).toEqual([
      "Playset is a free, non-commercial tool. It reads a Setlist from setlist.fm, looks for each song on Spotify and makes a Spotify playlist of it, so you can hear the songs before the Show. It is a personal project, not a company. It comes with no guarantee: Matches can be wrong, songs can be missing, and Playset can be slow or unavailable.",
    ]);
  });

  it("AC-57: Playlists are public", async () => {
    await openTerms();
    expect(sectionTexts("Playlists are public")).toEqual([
      "You don't log in to Spotify to use Playset. Every playlist is created in Playset's own Spotify account and is public: anyone with the link can open it, and Spotify shows it under that account's name. Playset keeps one playlist per Setlist and updates it when the Setlist changes on setlist.fm, so other people may open and share the same playlist. If you want to keep a playlist, save it or copy it to your own Spotify library.",
    ]);
  });

  it("AC-57: What Playset keeps about you, with its list", async () => {
    await openTerms();
    expect(sectionTexts("What Playset keeps about you")).toEqual([
      "Nothing that identifies you. There are no accounts, no cookies for Visitors, no analytics, no ads and no third-party scripts or fonts.",
      "Your IP address is used only to count requests for Playset's rate limits. The count is held in memory only and is never written down.",
      "Playset records which Setlist Playlists were created, updated and opened, with the Artist's name and the day, but not who asked. These numbers show how much Playset is used.",
      "What you search for is sent to setlist.fm and Spotify by Playset's server, so they see Playset's server, not you.",
      "When you open a playlist you are on Spotify, and Spotify's Privacy Policy applies.",
    ]);
    const heading = within(main()).getByRole("heading", { level: 2, name: "What Playset keeps about you" });
    const list = Array.from(main().querySelectorAll("ul")).find((ul) => isBefore(heading, ul));
    expect(list?.querySelectorAll("li")).toHaveLength(4);
  });

  it("AC-57: Where the data comes from", async () => {
    await openTerms();
    expect(sectionTexts("Where the data comes from")).toEqual([
      "Setlists come from setlist.fm, written by its community. Every playlist's description links back to its Setlist on setlist.fm. Song matches and track details come from Spotify. Playset is not made, endorsed or supported by setlist.fm or Spotify. Spotify is a trademark of Spotify AB.",
    ]);
  });

  it("AC-57: Spotify's terms, with its list and closing line", async () => {
    await openTerms();
    expect(sectionTexts("Spotify's terms")).toEqual([
      "Playset uses the Spotify Platform, so these terms apply between you and Playset:",
      "Spotify gives no warranty for Playset, and all warranties on Spotify's behalf, including implied ones, are excluded.",
      "Spotify is not liable for any loss or damage that comes from using Playset.",
      "You may not modify, reverse-engineer or make works based on the Spotify Platform, Spotify's service or its content through Playset.",
      "Playset, not Spotify, is responsible for Playset and for any support of it.",
      "Spotify is a third-party beneficiary of these terms and may enforce them against you.",
      "Your use of Spotify itself is governed by Spotify's Terms of Use and Privacy Policy.",
    ]);
  });

  it("AC-57: Using Playset fairly", async () => {
    await openTerms();
    expect(sectionTexts("Using Playset fairly")).toEqual([
      "Use Playset by hand, for your own listening. Don't send automated requests; Playset limits how many previews and playlists one address can ask for, and how many playlists it makes per day.",
    ]);
  });

  it("AC-57: links setlist.fm, Terms of Use and both Privacy Policy mentions", async () => {
    await openTerms();
    const setlistFm = within(main()).getAllByRole("link", { name: "setlist.fm" });
    expect(setlistFm).toHaveLength(1);
    expect(setlistFm[0]?.getAttribute("href")).toBe("https://www.setlist.fm/");
    const dataHeading = within(main()).getByRole("heading", { level: 2, name: "Where the data comes from" });
    const spotifyHeading = within(main()).getByRole("heading", { level: 2, name: "Spotify's terms" });
    const first = setlistFm[0];
    if (!first) throw new Error("no setlist.fm link");
    expect(isBefore(dataHeading, first) && isBefore(first, spotifyHeading)).toBe(true);

    expect(within(main()).getByRole("link", { name: "Terms of Use" }).getAttribute("href")).toBe(
      "https://www.spotify.com/legal/end-user-agreement/",
    );
    const privacy = within(main()).getAllByRole("link", { name: "Privacy Policy" });
    expect(privacy.map((a) => a.getAttribute("href"))).toEqual([
      "https://www.spotify.com/legal/privacy-policy/",
      "https://www.spotify.com/legal/privacy-policy/",
    ]);
  });

  it("AC-52: Terms has no axe violations", async () => {
    const { container } = await openTerms();
    expect(await axe(container)).toHaveNoViolations();
  });
});
