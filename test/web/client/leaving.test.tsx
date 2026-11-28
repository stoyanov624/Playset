// Leaving a screen: a streaming preview and pending reads are cancelled silently, while a
// create or update already sent is left to finish and shows nothing on the next screen.
import { act, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { CreatePlaylistResponse, SetlistResponse, ArtistSetlistsResponse } from "../../../src/web/shared/index.js";
import { deferred, fakeApi } from "./fixtures/fake-api";
import { currentUrl, getByLine, normalise, openApp, queryByLine, recordAnnouncements } from "./fixtures/dom";
import { openSetlistFromList } from "./fixtures/flows";
import { ARCTIC_MONKEYS_MBID, PAGE1_ROW_NAMES, PORTLAND_ID, createdAnswer, madridResult } from "./fixtures/values";

async function pause(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
}

function expectNoErrorShown(): void {
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
}

describe("leaving a streaming preview", () => {
  it("AC-45: the back link aborts the preview's cancel signal, silently", async () => {
    const { preview, user } = await openSetlistFromList();
    await waitFor(() => expect(preview.calls).toHaveLength(1));
    preview.progress(2, 5);
    await waitFor(() => getByLine("Matching 2 of 5 Performances"));
    const signal = preview.last().signal;
    expect(signal?.aborted).toBe(false);
    const announcements = recordAnnouncements();
    const before = announcements.length;

    await user.click(screen.getByRole("link", { name: "Setlists of Arctic Monkeys" }));
    await waitFor(() => expect(currentUrl()).toBe(`/artists/${ARCTIC_MONKEYS_MBID}`));
    expect(signal?.aborted).toBe(true);
    await screen.findByRole("link", { name: PAGE1_ROW_NAMES[1] });
    await pause();

    expect(announcements.slice(before).filter((text) => text.startsWith("Matching"))).toEqual([]);
    expectNoErrorShown();
  });

  it("AC-45: Back in the browser aborts the preview the same way", async () => {
    const { preview } = await openSetlistFromList();
    await waitFor(() => expect(preview.calls).toHaveLength(1));
    preview.progress(2, 5);
    await waitFor(() => getByLine("Matching 2 of 5 Performances"));
    const signal = preview.last().signal;
    const announcements = recordAnnouncements();
    const before = announcements.length;

    await act(async () => window.history.back());
    await waitFor(() => expect(currentUrl()).toBe(`/artists/${ARCTIC_MONKEYS_MBID}`));
    await waitFor(() => expect(signal?.aborted).toBe(true));
    await pause();
    expect(announcements.slice(before).filter((text) => text.startsWith("Matching"))).toEqual([]);
    expectNoErrorShown();
    expect(queryByLine("Matching 2 of 5 Performances")).toBeNull();
  });

  it("AC-45: a preview finishing after the Visitor left shows nothing and announces nothing", async () => {
    const { user } = await openSetlistFromList(undefined, {
      // A stream that ignores its signal: its late answer must still not reach the list screen.
      streamPreview: () => new Promise((resolve) => setTimeout(() => resolve(madridResult()), 100)),
    });
    const announcements = recordAnnouncements();
    const before = announcements.length;
    await user.click(screen.getByRole("link", { name: "Setlists of Arctic Monkeys" }));
    await waitFor(() => expect(currentUrl()).toBe(`/artists/${ARCTIC_MONKEYS_MBID}`));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));
    });
    expect(announcements.slice(before).filter((text) => text.startsWith("Matching"))).toEqual([]);
    expect(queryByLine("4 Matches")).toBeNull();
  });
});

describe("leaving pending reads", () => {
  it("AC-45: leaving while the Setlist status is pending aborts its signal", async () => {
    let statusSignal: AbortSignal | undefined;
    const api = fakeApi({
      getSetlist: (_id, signal) => {
        statusSignal = signal;
        return deferred<SetlistResponse>(signal).promise;
      },
    });
    const { user } = openApp(api, `/setlists/${PORTLAND_ID}`);
    await waitFor(() => expect(api.getSetlist).toHaveBeenCalledTimes(1));
    expect(statusSignal?.aborted).toBe(false);

    await user.click(screen.getByRole("link", { name: "New search" }));
    await waitFor(() => expect(currentUrl()).toBe("/"));
    await waitFor(() => expect(statusSignal?.aborted).toBe(true));
    await pause();
    expectNoErrorShown();
  });

  it("AC-45: leaving while a Setlist page is pending aborts its signal", async () => {
    let pageSignal: AbortSignal | undefined;
    const api = fakeApi({
      getArtistSetlists: (_mbid, _page, signal) => {
        pageSignal = signal;
        return deferred<ArtistSetlistsResponse>(signal).promise;
      },
    });
    const { user } = openApp(api, `/artists/${ARCTIC_MONKEYS_MBID}`);
    await waitFor(() => expect(api.getArtistSetlists).toHaveBeenCalledTimes(1));
    expect(pageSignal?.aborted).toBe(false);

    await user.click(screen.getByRole("link", { name: "New search" }));
    await waitFor(() => expect(currentUrl()).toBe("/"));
    await waitFor(() => expect(pageSignal?.aborted).toBe(true));
    await pause();
    expectNoErrorShown();
  });
});

describe("leaving after Create", () => {
  it("AC-46: a create already sent is not cancelled, and its answer shows nothing on the next screen", async () => {
    const answer = deferred<CreatePlaylistResponse>();
    const { api, preview, user } = await openSetlistFromList(undefined, { createPlaylist: () => answer.promise });
    await waitFor(() => expect(preview.calls).toHaveLength(1));
    await preview.finish(madridResult());
    await user.click(await screen.findByRole("button", { name: "Create playlist" }));
    await screen.findByRole("button", { name: "Creating…" });
    expect(api.createPlaylist).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("link", { name: "Setlists of Arctic Monkeys" }));
    await waitFor(() => expect(currentUrl()).toBe(`/artists/${ARCTIC_MONKEYS_MBID}`));
    await screen.findByRole("link", { name: PAGE1_ROW_NAMES[0] });
    const announcements = recordAnnouncements();
    const before = announcements.length;

    await act(async () => answer.resolve(createdAnswer()));
    await pause();
    expect(screen.queryByRole("heading", { name: "Playlist created" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Open in Spotify (opens in a new tab)" })).toBeNull();
    expect(announcements.slice(before)).toEqual([]);
    expect(normalise(document.body.textContent)).not.toContain("Playlist created");
    expect(api.createPlaylist).toHaveBeenCalledTimes(1);
  });
});
