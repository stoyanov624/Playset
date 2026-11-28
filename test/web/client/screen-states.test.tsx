// Rules that hold on every screen state, loading, empty and error states included: exactly one
// h1, icons only as hidden lucide icons beside visible text (never a glyph or emoji standing in
// for one), and the app's own words never say "tracklist", "gig" or "band".
import { act, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ApiCallError } from "../../../src/web/client/api/index.js";
import type {
  ArtistSetlistsResponse,
  ArtistsResponse,
  CreatePlaylistResponse,
  SetlistLinksResponse,
  SetlistResponse,
} from "../../../src/web/shared/index.js";
import { controlledPreview, deferred, fakeApi } from "./fixtures/fake-api";
import { findAlert, findByLine, normalise, openApp } from "./fixtures/dom";
import { openFinishedPreview, openSetlistScreen } from "./fixtures/flows";
import {
  ARCTIC_MONKEYS_MBID,
  MADRID_URL,
  PEARL_JAM_MBID,
  SEATTLE_ID,
  allMissResult,
  arcticMonkeysCandidates,
  arcticMonkeysPage1,
  createdAnswer,
  emptyPage,
  madridOutdatedStatus,
  madridResult,
  madridStatus,
  nirvanaResult,
  noCandidates,
  seattleCurrentStatus,
  updatedAnswer,
} from "./fixtures/values";

const TOO_MANY_SEARCHES = new ApiCallError({
  code: "RATE_LIMITED", message: "Too many searches from here.", hint: "Wait a moment, then search again.", retryAfterSeconds: 42,
});
const OUR_SIDE = new ApiCallError({
  code: "INTERNAL", message: "Something went wrong on our side.", hint: "Please try again in a minute.",
});
const PLAYSET_UNREACHABLE = new ApiCallError({
  code: "UPSTREAM_UNAVAILABLE", message: "Playset isn't answering right now.", hint: "Check your connection and try again in a minute.",
});
const SETLISTFM_DOWN = new ApiCallError({
  code: "UPSTREAM_UNAVAILABLE", message: "setlist.fm isn't answering right now.", hint: "Try again in a minute.",
});
const SETLISTFM_BUSY = new ApiCallError({
  code: "RATE_LIMITED", message: "setlist.fm is busy right now.", hint: "Wait a moment, then load more.", retryAfterSeconds: 30,
});
const SPOTIFY_DOWN = new ApiCallError({
  code: "UPSTREAM_UNAVAILABLE", message: "Spotify isn't answering right now.", hint: "Try again in a minute.",
});
const MANY_PREVIEWS = new ApiCallError({
  code: "RATE_LIMITED", message: "You've asked for many previews in the last hour.",
  hint: "Try again later, or open a Setlist that already has a playlist.", retryAfterSeconds: 120,
});
const PLAYLISTS_OFF = new ApiCallError({
  code: "PLAYLISTS_UNAVAILABLE", message: "Playlists can't be made right now.",
  hint: "Search and existing playlists still work. Try again later.",
});
const SETLIST_CHANGED = new ApiCallError({
  code: "SETLIST_CHANGED", message: "This Setlist changed on setlist.fm a moment ago.",
  hint: "Load a fresh preview to see the new songs.",
});
const MANY_PLAYLISTS = new ApiCallError({
  code: "RATE_LIMITED", message: "You've made many playlists in the last hour.", hint: "Try again later.", retryAfterSeconds: 600,
});
const NO_MATCHES = new ApiCallError({ code: "INVALID_INPUT", message: "There are no Matches to put in a playlist." });
const NO_SUCH_SETLIST = new ApiCallError({
  code: "NOT_FOUND", message: "setlist.fm has no Setlist with that id.", hint: "Check the link, or search for the Artist.",
});
const NO_SUCH_ARTIST = new ApiCallError({
  code: "NOT_FOUND", message: "setlist.fm has no Artist with that id.", hint: "Search for the Artist by name.",
});

/** Words that come from setlist.fm's data, not from the app (an Artist's disambiguation). */
const ARCTIC_MONKEYS_DISAMBIGUATIONS = arcticMonkeysCandidates().artists.flatMap((artist) =>
  artist.disambiguation === undefined ? [] : [artist.disambiguation],
);

interface ScreenState {
  /** Server data shown as given, left out of the word check. */
  serverWords?: string[];
}

function never<T>(): Promise<T> {
  return deferred<T>().promise;
}

function rejecting<T>(error: Error): () => Promise<T> {
  return () => Promise.reject(error);
}

/** Page 1 then whatever `next` answers for page 2. */
function page1Then(next: () => Promise<ArtistSetlistsResponse>) {
  let calls = 0;
  return () => {
    calls += 1;
    return calls === 1 ? Promise.resolve(arcticMonkeysPage1()) : next();
  };
}

async function openList(getArtistSetlists: () => Promise<ArtistSetlistsResponse>) {
  return openApp(fakeApi({ getArtistSetlists }), `/artists/${ARCTIC_MONKEYS_MBID}`);
}

async function loadMoreWith(next: () => Promise<ArtistSetlistsResponse>) {
  const { user } = await openList(page1Then(next));
  await user.click(await screen.findByRole("button", { name: "Load more Setlists" }));
}

async function createWith(createPlaylist: () => Promise<CreatePlaylistResponse>, status: SetlistResponse = madridStatus()) {
  const opened = await openFinishedPreview(status, madridResult(), { createPlaylist });
  const action = status.playlist.status === "outdated" ? "Update playlist" : "Create playlist";
  await opened.user.click(screen.getByRole("button", { name: action }));
  return opened;
}

async function previewFailing(error: ApiCallError) {
  const { preview } = openSetlistScreen();
  await waitFor(() => expect(preview.calls).toHaveLength(1));
  await preview.fail(error);
}

const STATES: Array<[string, () => Promise<ScreenState | void>]> = [
  ["Start", async () => {
    openApp(fakeApi(), "/");
    await screen.findByRole("heading", { level: 1, name: "Hear the Setlist before the Show" });
  }],
  ["a pending Artist search", async () => {
    openApp(fakeApi({ searchArtists: () => never<ArtistsResponse>() }), "/?artist=arctic%20monkeys");
    await screen.findByRole("button", { name: "Searching…" });
  }],
  ["the candidates", async () => {
    openApp(fakeApi({ searchArtists: async () => arcticMonkeysCandidates() }), "/?artist=arctic%20monkeys");
    await screen.findByRole("heading", { level: 1, name: "Pick the Artist" });
    return { serverWords: ARCTIC_MONKEYS_DISAMBIGUATIONS };
  }],
  ["No Artist found", async () => {
    openApp(fakeApi({ searchArtists: async () => noCandidates() }), "/?artist=arctci%20monkys");
    await screen.findByRole("heading", { level: 1, name: "No Artist found — check spelling" });
  }],
  ["the search's rate-limit alert with its countdown", async () => {
    openApp(fakeApi({ searchArtists: rejecting<ArtistsResponse>(TOO_MANY_SEARCHES) }), "/?artist=arctic%20monkeys");
    await screen.findByRole("heading", { level: 1, name: "Too many searches from here." });
    await findByLine("You can try again in 0:42");
  }],
  ["the search's INTERNAL alert", async () => {
    openApp(fakeApi({ searchArtists: rejecting<ArtistsResponse>(OUR_SIDE) }), "/?artist=arctic%20monkeys");
    await screen.findByRole("heading", { level: 1, name: "Something went wrong on our side." });
  }],
  ["the Artist field marked invalid by the server", async () => {
    const tooLong = new ApiCallError({ code: "INVALID_INPUT", message: "That Artist name is too long.", hint: "Use at most 200 characters." });
    const { user } = openApp(fakeApi({ searchArtists: rejecting<ArtistsResponse>(tooLong) }), "/");
    await user.click(screen.getByLabelText("Artist"));
    await user.paste("a".repeat(201));
    await user.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(screen.getByLabelText("Artist").getAttribute("aria-invalid")).toBe("true"));
  }],
  ["a pending setlist.fm link", async () => {
    const { user } = openApp(fakeApi({ readSetlistLink: () => never<SetlistLinksResponse>() }), "/");
    await user.click(screen.getByLabelText("setlist.fm link"));
    await user.paste(MADRID_URL);
    await user.click(screen.getByRole("button", { name: "Open" }));
    await screen.findByRole("button", { name: "Opening…" });
  }],
  ["the setlist.fm link's error alert", async () => {
    const { user } = openApp(fakeApi({ readSetlistLink: rejecting<SetlistLinksResponse>(PLAYSET_UNREACHABLE) }), "/");
    await user.click(screen.getByLabelText("setlist.fm link"));
    await user.paste(MADRID_URL);
    await user.click(screen.getByRole("button", { name: "Open" }));
    await screen.findByRole("heading", { name: "Playset isn't answering right now." });
  }],
  ["the Setlist list while page 1 loads", async () => {
    await openList(() => never<ArtistSetlistsResponse>());
    await findByLine("Loading Setlists…");
  }],
  ["the Setlist list with an Incomplete badge and Load more", async () => {
    await openList(async () => arcticMonkeysPage1());
    await screen.findByRole("button", { name: "Load more Setlists" });
  }],
  ["the Setlist list while Load more is pending", async () => {
    await loadMoreWith(() => never<ArtistSetlistsResponse>());
    await screen.findByRole("button", { name: "Loading…" });
  }],
  ["the Load more error alert", async () => {
    await loadMoreWith(rejecting<ArtistSetlistsResponse>(SETLISTFM_DOWN));
    await findAlert("setlist.fm isn't answering right now.");
  }],
  ["the Load more rate-limit alert with its countdown", async () => {
    await loadMoreWith(rejecting<ArtistSetlistsResponse>(SETLISTFM_BUSY));
    await findAlert("You can try again in 0:30");
  }],
  ["the Setlist list after its last page", async () => {
    await openList(async () => ({ ...arcticMonkeysPage1(), hasMore: false }));
    await findByLine("That's every Setlist on setlist.fm.");
  }],
  ["the empty Setlist list", async () => {
    openApp(fakeApi({ getArtistSetlists: async () => emptyPage(false) }), `/artists/${PEARL_JAM_MBID}`);
    await screen.findByRole("heading", { level: 2, name: "No Setlists with songs yet" });
  }],
  ["the Setlist list's page 1 error alert", async () => {
    await openList(rejecting<ArtistSetlistsResponse>(SETLISTFM_DOWN));
    await screen.findByRole("heading", { level: 2, name: "setlist.fm isn't answering right now." });
  }],
  ["the Setlist list's NOT_FOUND alert", async () => {
    await openList(rejecting<ArtistSetlistsResponse>(NO_SUCH_ARTIST));
    await screen.findByRole("heading", { name: "setlist.fm has no Artist with that id." });
  }],
  ["the Setlist screen while the status loads", async () => {
    openSetlistScreen(madridStatus(), { getSetlist: () => never<SetlistResponse>() });
    await findByLine("Loading the Setlist…");
  }],
  ["the Setlist's NOT_FOUND alert", async () => {
    openSetlistScreen(madridStatus(), { getSetlist: rejecting<SetlistResponse>(NO_SUCH_SETLIST) });
    await screen.findByRole("heading", { level: 1, name: "setlist.fm has no Setlist with that id." });
  }],
  ["Setlist Playlist ready under the Incomplete Setlist alert with its note", async () => {
    const preview = controlledPreview();
    openApp(fakeApi({ getSetlist: async () => seattleCurrentStatus(), streamPreview: preview.streamPreview }), `/setlists/${SEATTLE_ID}`);
    await screen.findByRole("heading", { level: 2, name: "Setlist Playlist ready" });
    await findByLine("Incomplete Setlist");
  }],
  ["the preview before its first progress", async () => {
    const { preview } = openSetlistScreen();
    await waitFor(() => expect(preview.calls).toHaveLength(1));
    await findByLine("Loading the Setlist…");
  }],
  ["the preview while Matching, under the Incomplete Setlist alert", async () => {
    const { preview } = openSetlistScreen();
    await waitFor(() => expect(preview.calls).toHaveLength(1));
    preview.progress(2, 5);
    await findByLine("Matching 2 of 5 Performances");
    await findByLine("Incomplete Setlist");
  }],
  ["the finished preview", async () => {
    await openFinishedPreview();
  }],
  ["the finished preview with a Cover, a live Match and an Unknown Song", async () => {
    await openFinishedPreview(madridStatus(), nirvanaResult());
  }],
  ["the preview with zero Matches", async () => {
    await openFinishedPreview(madridStatus(), allMissResult());
  }],
  ["the outdated preview with Update playlist", async () => {
    await openFinishedPreview(madridOutdatedStatus());
    await screen.findByRole("button", { name: "Update playlist" });
  }],
  ["the preview's error-event alert", async () => {
    await previewFailing(SPOTIFY_DOWN);
    await screen.findByRole("heading", { level: 2, name: "Spotify isn't answering right now." });
  }],
  ["the preview's rate-limit alert with its countdown", async () => {
    await previewFailing(MANY_PREVIEWS);
    await findByLine("You can try again in 2:00");
  }],
  ["the preview's PLAYLISTS_UNAVAILABLE alert", async () => {
    await previewFailing(PLAYLISTS_OFF);
    await findByLine("Playlist creation is temporarily unavailable");
  }],
  ["Creating…", async () => {
    await createWith(() => never<CreatePlaylistResponse>());
    await screen.findByRole("button", { name: "Creating…" });
  }],
  ["the Create PLAYLISTS_UNAVAILABLE alert", async () => {
    await createWith(rejecting<CreatePlaylistResponse>(PLAYLISTS_OFF));
    await findAlert("Playlist creation is temporarily unavailable");
  }],
  ["the Create SETLIST_CHANGED alert", async () => {
    await createWith(rejecting<CreatePlaylistResponse>(SETLIST_CHANGED));
    await screen.findByRole("button", { name: "Load fresh preview" });
  }],
  ["the Create rate-limit alert with its countdown", async () => {
    await createWith(rejecting<CreatePlaylistResponse>(MANY_PLAYLISTS));
    await findAlert("You can try again in 10:00");
  }],
  ["the Create INVALID_INPUT alert", async () => {
    await createWith(rejecting<CreatePlaylistResponse>(NO_MATCHES));
    await findAlert("There are no Matches to put in a playlist.");
  }],
  ["the Update UPSTREAM_UNAVAILABLE alert", async () => {
    await createWith(rejecting<CreatePlaylistResponse>(SPOTIFY_DOWN), madridOutdatedStatus());
    await findAlert("Spotify isn't answering right now.");
  }],
  ["Playlist created", async () => {
    await createWith(async () => createdAnswer());
    await screen.findByRole("heading", { level: 2, name: "Playlist created" });
  }],
  ["Playlist updated", async () => {
    await createWith(async () => updatedAnswer(), madridOutdatedStatus());
    await screen.findByRole("heading", { level: 2, name: "Playlist updated" });
  }],
  ["Terms", async () => {
    openApp(fakeApi(), "/terms");
    await screen.findByRole("heading", { level: 1, name: "Terms and Privacy" });
  }],
  ["Page not found", async () => {
    openApp(fakeApi(), "/admin");
    await screen.findByRole("heading", { level: 1, name: "Page not found" });
  }],
];

// Arrows, check marks, crosses, bullets, shapes and stars standing in for an icon, and any emoji.
const GLYPHS_STANDING_IN_FOR_ICONS = /[←-⇿✓-✘•‣⁃■-◿★☆➔➜➡]|\p{Extended_Pictographic}/u;
const BANNED_WORDS = /\b(tracklists?|gigs?|bands?)\b/i;

/** Every svg is a hidden lucide icon beside visible text; no control is icon-only; no glyph icons. */
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
  const glyph = normalise(document.body.textContent).match(GLYPHS_STANDING_IN_FOR_ICONS);
  if (glyph) problems.push(`the glyph ${glyph[0]} stands in for an icon`);
  return problems;
}

/** The app's own words on the page: visible text, accessible names and the title, less server data. */
function ownWords(serverWords: string[]): string {
  const labels = Array.from(document.querySelectorAll("[aria-label]")).map((el) => el.getAttribute("aria-label") ?? "");
  let text = normalise([document.title, document.body.textContent, ...labels].join(" "));
  for (const words of serverWords) text = text.split(words).join(" ");
  return text;
}

async function open(state: () => Promise<ScreenState | void>): Promise<ScreenState> {
  const shown = (await state()) ?? {};
  // Let effects that run after the first paint (focus, titles, announcements) settle.
  await act(async () => {
    await Promise.resolve();
  });
  return shown;
}

describe("every screen state", () => {
  it.each(STATES)("AC-1: %s has exactly one h1", async (_name, state) => {
    await open(state);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it.each(STATES)("AC-54: %s shows icons only as hidden lucide icons beside text, and no glyph icons", async (_name, state) => {
    await open(state);
    expect(iconProblems()).toEqual([]);
  });

  it.each(STATES)("AC-1: %s never says tracklist, gig or band in the app's own words", async (_name, state) => {
    const { serverWords = [] } = await open(state);
    expect(ownWords(serverWords)).not.toMatch(BANNED_WORDS);
  });

  it("AC-1: the word check would catch a banned word in the app's own text", () => {
    expect("Open the tracklist").toMatch(BANNED_WORDS);
    expect("Your next gig").toMatch(BANNED_WORDS);
    expect("Pick the Band").toMatch(BANNED_WORDS);
    expect("Bandcamp, Gigantic").not.toMatch(BANNED_WORDS);
  });
});
