// Create or update the Setlist Playlist from the preview: one request, the pending button and
// announcement, then the result panel under the Show line with the preview kept below.
import { act, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";
import type { CreatePlaylistResponse } from "../../../src/web/shared/index.js";
import { deferred } from "./fixtures/fake-api";
import { announced, expectFocusOn, getByLine, isBefore, queryByLine, setRows } from "./fixtures/dom";
import { openFinishedPreview } from "./fixtures/flows";
import {
  MADRID_ID,
  NEW_SHARE_URL,
  SHARE_URL,
  createdAnswer,
  madridOutdatedStatus,
  madridResult,
  madridStatus,
  oneMatchResult,
  updatedAnswer,
} from "./fixtures/values";

async function openWithCreate(
  answer: Promise<CreatePlaylistResponse>,
  status = madridStatus(),
  result = madridResult(),
) {
  return openFinishedPreview(status, result, { createPlaylist: () => answer });
}

describe("Create playlist", () => {
  it("AC-35: asks once to create with the preview's version, even on a double click", async () => {
    const answer = deferred<CreatePlaylistResponse>();
    const { api, user } = await openWithCreate(answer.promise);
    await user.dblClick(screen.getByRole("button", { name: "Create playlist" }));
    expect(api.createPlaylist).toHaveBeenCalledTimes(1);
    expect(api.createPlaylist.mock.calls[0]).toEqual([MADRID_ID, "g3e5f7a91"]);
  });

  it("AC-35: while pending the button reads Creating…, ignores activation and Creating playlist is announced", async () => {
    const answer = deferred<CreatePlaylistResponse>();
    const { api, user } = await openWithCreate(answer.promise);
    await user.click(screen.getByRole("button", { name: "Create playlist" }));

    const creating = await screen.findByRole("button", { name: "Creating…" });
    expect(creating.getAttribute("aria-disabled")).toBe("true");
    await waitFor(() => expect(announced()).toBe("Creating playlist"));
    await user.click(creating);
    creating.focus();
    await user.keyboard("{Enter}");
    expect(api.createPlaylist).toHaveBeenCalledTimes(1);
  });

  it("AC-36: a created answer replaces the action with the Playlist created panel under the Show line", async () => {
    const answer = deferred<CreatePlaylistResponse>();
    const { user } = await openWithCreate(answer.promise);
    await user.click(screen.getByRole("button", { name: "Create playlist" }));
    await act(async () => answer.resolve(createdAnswer()));

    const created = await screen.findByRole("heading", { level: 2, name: "Playlist created" });
    getByLine("Arctic Monkeys – 2026-06-02 – Madrid");
    getByLine("4 songs, public in Playset's Spotify account.");
    const open = screen.getByRole("link", { name: "Open in Spotify (opens in a new tab)" });
    expect(open.getAttribute("href")).toBe(SHARE_URL);
    expect(open.getAttribute("target")).toBe("_blank");
    expect(open.getAttribute("rel")?.split(/\s+/)).toContain("noopener");
    getByLine(SHARE_URL);
    screen.getByRole("button", { name: "Copy link" });

    expect(isBefore(getByLine("Madrid"), created)).toBe(true);
    expect(isBefore(created, getByLine("4 Matches"))).toBe(true);
    expect(screen.queryByRole("button", { name: /Create playlist|Creating…/ })).toBeNull();
    expect(queryByLine("Public, in Playset's Spotify account")).toBeNull();

    await expectFocusOn(() => screen.getByRole("heading", { level: 2, name: "Playlist created" }));
    getByLine("1 Miss");
    screen.getByRole("heading", { level: 2, name: "Misses" });
    expect(setRows("Main set")).toHaveLength(5);
    expect(setRows("Encore 1")).toHaveLength(1);
  });

  it("AC-36: one Match reads 1 song", async () => {
    const { user } = await openWithCreate(Promise.resolve(createdAnswer()), madridStatus(), oneMatchResult());
    await user.click(screen.getByRole("button", { name: "Create playlist" }));
    await screen.findByRole("heading", { level: 2, name: "Playlist created" });
    getByLine("1 song, public in Playset's Spotify account.");
  });

  it("AC-52: Playlist created has no axe violations", async () => {
    const { user, container } = await openWithCreate(Promise.resolve(createdAnswer()));
    await user.click(screen.getByRole("button", { name: "Create playlist" }));
    await screen.findByRole("heading", { level: 2, name: "Playlist created" });
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("Update playlist", () => {
  it("AC-35: Update playlist reads Updating… while pending and announces Updating playlist", async () => {
    const answer = deferred<CreatePlaylistResponse>();
    const { api, user } = await openWithCreate(answer.promise, madridOutdatedStatus());
    await user.click(screen.getByRole("button", { name: "Update playlist" }));
    const updating = await screen.findByRole("button", { name: "Updating…" });
    expect(updating.getAttribute("aria-disabled")).toBe("true");
    await waitFor(() => expect(announced()).toBe("Updating playlist"));
    await user.click(updating);
    expect(api.createPlaylist).toHaveBeenCalledTimes(1);
    expect(api.createPlaylist.mock.calls[0]).toEqual([MADRID_ID, "g3e5f7a91"]);
  });

  it("AC-36: an updated answer shows Playlist updated and removes the outdated notice", async () => {
    const { user } = await openWithCreate(Promise.resolve(updatedAnswer()), madridOutdatedStatus());
    getByLine("This Setlist changed on setlist.fm since its playlist was made.");
    await user.click(screen.getByRole("button", { name: "Update playlist" }));

    await screen.findByRole("heading", { level: 2, name: "Playlist updated" });
    await expectFocusOn(() => screen.getByRole("heading", { level: 2, name: "Playlist updated" }));
    expect(queryByLine("This Setlist changed on setlist.fm since its playlist was made.")).toBeNull();
    expect(screen.queryByRole("link", { name: "Open current playlist (opens in a new tab)" })).toBeNull();
    expect(screen.getByRole("link", { name: "Open in Spotify (opens in a new tab)" }).getAttribute("href")).toBe(SHARE_URL);
    getByLine("4 songs, public in Playset's Spotify account.");
    expect(screen.queryByRole("button", { name: /Update playlist|Updating…/ })).toBeNull();
  });

  it("AC-36: Update answered with created (the server made it again) shows Playlist created with the new link", async () => {
    const { user } = await openWithCreate(Promise.resolve(createdAnswer(NEW_SHARE_URL)), madridOutdatedStatus());
    await user.click(screen.getByRole("button", { name: "Update playlist" }));
    await screen.findByRole("heading", { level: 2, name: "Playlist created" });
    expect(screen.getByRole("link", { name: "Open in Spotify (opens in a new tab)" }).getAttribute("href")).toBe(NEW_SHARE_URL);
    getByLine(NEW_SHARE_URL);
    expect(queryByLine("This Setlist changed on setlist.fm since its playlist was made.")).toBeNull();
  });
});
