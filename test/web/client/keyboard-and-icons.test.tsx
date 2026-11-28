// The whole flow by keyboard alone, the icon rules on every screen, and the axe check of the
// Page not found screen.
import { screen, waitFor } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";
import { controlledPreview, fakeApi } from "./fixtures/fake-api";
import { currentUrl, expectFocusOn, normalise, openApp } from "./fixtures/dom";
import { openFinishedPreview } from "./fixtures/flows";
import {
  ARCTIC_MONKEYS_MBID,
  MADRID_ID,
  arcticMonkeysCandidates,
  arcticMonkeysPage1,
  createdAnswer,
  madridResult,
  madridStatus,
} from "./fixtures/values";

const MADRID_ROW = "2 Jun 2026, Estadio Metropolitano, Madrid, 21 songs";

/** Presses Tab until `target` has focus; fails if it is never reached. */
async function tabTo(user: UserEvent, target: () => HTMLElement, options: { shift?: boolean } = {}): Promise<void> {
  for (let presses = 0; presses < 60; presses++) {
    if (document.activeElement === target()) return;
    await user.tab(options.shift ? { shift: true } : {});
  }
  throw new Error(`Tab never reached "${normalise(target().textContent) || target().getAttribute("aria-label")}"`);
}

function madridPage() {
  const page = arcticMonkeysPage1();
  const first = page.setlists[0];
  if (!first) throw new Error("page 1 has no Setlist");
  page.setlists[0] = { ...first, id: MADRID_ID, date: "2026-06-02", venue: "Estadio Metropolitano", city: "Madrid" };
  return page;
}

describe("keyboard only", () => {
  it("AC-53: search, pick the Artist, open a Setlist and create its playlist with Tab and Enter only", async () => {
    const preview = controlledPreview();
    const api = fakeApi({
      searchArtists: async () => arcticMonkeysCandidates(),
      getArtistSetlists: async () => madridPage(),
      getSetlist: async () => madridStatus(),
      streamPreview: preview.streamPreview,
      createPlaylist: async () => createdAnswer(),
    });
    const { user } = openApp(api, "/");
    await screen.findByRole("heading", { level: 1, name: "Hear the Setlist before the Show" });

    await tabTo(user, () => screen.getByRole("link", { name: "Skip to content" }));
    await tabTo(user, () => screen.getByLabelText("Artist"));
    await user.keyboard("arctic monkeys");
    await tabTo(user, () => screen.getByRole("button", { name: "Search" }));
    await tabTo(user, () => screen.getByLabelText("setlist.fm link"));
    await tabTo(user, () => screen.getByRole("button", { name: "Open" }));
    await tabTo(user, () => screen.getByLabelText("Artist"), { shift: true });
    await user.keyboard("{Enter}");

    await expectFocusOn(() => screen.getByRole("heading", { level: 1, name: "Pick the Artist" }));
    await tabTo(user, () => screen.getByRole("link", { name: /^Arctic Monkeys\s*English rock band from Sheffield$/ }));
    await user.keyboard("{Enter}");

    await waitFor(() => expect(currentUrl()).toBe(`/artists/${ARCTIC_MONKEYS_MBID}`));
    await screen.findByRole("link", { name: MADRID_ROW });
    await tabTo(user, () => screen.getByRole("link", { name: MADRID_ROW }));
    await user.keyboard("{Enter}");

    await waitFor(() => expect(currentUrl()).toBe(`/setlists/${MADRID_ID}`));
    await waitFor(() => expect(preview.calls).toHaveLength(1));
    preview.progress(5, 5);
    await preview.finish(madridResult());
    await screen.findByRole("button", { name: "Create playlist" });
    await tabTo(user, () => screen.getByRole("link", { name: "5 505" }));
    await tabTo(user, () => screen.getByRole("button", { name: "Create playlist" }));
    await user.keyboard("{Enter}");

    await expectFocusOn(() => screen.getByRole("heading", { level: 2, name: "Playlist created" }));
    expect(api.createPlaylist).toHaveBeenCalledTimes(1);
    await tabTo(user, () => screen.getByRole("link", { name: "Open in Spotify (opens in a new tab)" }));
    await tabTo(user, () => screen.getByRole("button", { name: "Copy link" }));
    await user.keyboard(" ");
    await screen.findByRole("button", { name: "Copied" });
  });

  it("AC-53: Space activates Load more Setlists", async () => {
    const api = fakeApi({ getArtistSetlists: async () => madridPage() });
    const { user } = openApp(api, `/artists/${ARCTIC_MONKEYS_MBID}`);
    await screen.findByRole("button", { name: "Load more Setlists" });
    await tabTo(user, () => screen.getByRole("button", { name: "Load more Setlists" }));
    await user.keyboard(" ");
    await waitFor(() => expect(api.getArtistSetlists).toHaveBeenCalledTimes(2));
    expect(api.getArtistSetlists.mock.calls[1]?.slice(0, 2)).toEqual([ARCTIC_MONKEYS_MBID, 2]);
  });
});

// ---------------------------------------------------------------- icons

const GLYPHS_STANDING_IN_FOR_ICONS = /[←-⇿✓-✘•‣⁃■-◿★☆➔➜➡]|\p{Extended_Pictographic}/u;

function expectIconRules(): void {
  for (const svg of Array.from(document.querySelectorAll("svg"))) {
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("class") ?? "").toMatch(/\blucide\b/);
    expect(normalise(svg.parentElement?.textContent)).not.toBe("");
  }
  for (const control of Array.from(document.querySelectorAll("button, a[href]"))) {
    expect(normalise(control.textContent)).not.toBe("");
  }
  expect(normalise(document.body.textContent)).not.toMatch(GLYPHS_STANDING_IN_FOR_ICONS);
}

describe("icons", () => {
  it("AC-54: on Start, icons are hidden lucide icons beside text and no glyph stands in for one", async () => {
    openApp(fakeApi(), "/");
    await screen.findByRole("heading", { level: 1, name: "Hear the Setlist before the Show" });
    expectIconRules();
  });

  it("AC-54: on the candidates and the Setlist list the same holds", async () => {
    const { user } = openApp(
      fakeApi({ searchArtists: async () => arcticMonkeysCandidates(), getArtistSetlists: async () => arcticMonkeysPage1() }),
      "/?artist=arctic%20monkeys",
    );
    await screen.findByRole("heading", { level: 1, name: "Pick the Artist" });
    expectIconRules();
    await user.click(screen.getByRole("link", { name: /^Arctic Monkeys\s*English rock band from Sheffield$/ }));
    await screen.findByRole("button", { name: "Load more Setlists" });
    expectIconRules();
  });

  it("AC-54: on the finished preview and the Playlist created panel the same holds", async () => {
    const { user } = await openFinishedPreview(madridStatus(), madridResult(), { createPlaylist: async () => createdAnswer() });
    expectIconRules();
    await user.click(screen.getByRole("button", { name: "Create playlist" }));
    await screen.findByRole("heading", { level: 2, name: "Playlist created" });
    expectIconRules();
  });

  it("AC-54: on Terms the same holds", async () => {
    openApp(fakeApi(), "/terms");
    await screen.findByRole("heading", { level: 1, name: "Terms and Privacy" });
    expectIconRules();
  });

  it("AC-52: Page not found has no axe violations", async () => {
    const { container } = openApp(fakeApi(), "/admin/settings");
    await screen.findByRole("heading", { level: 1, name: "Page not found" });
    expectIconRules();
    expect(await axe(container)).toHaveNoViolations();
  });
});
