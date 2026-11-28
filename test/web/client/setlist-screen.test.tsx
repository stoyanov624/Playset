// The Setlist screen before the preview: the status, the Show line, the Incomplete Setlist
// warning, the "Setlist Playlist ready" panel with Copy link, and the outdated playlist notice.
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import type { SetlistResponse } from "../../../src/web/shared/index.js";
import { controlledPreview, deferred, fakeApi } from "./fixtures/fake-api";
import {
  announced,
  expectFocusOn,
  getByLine,
  isBefore,
  normalise,
  openApp,
  queryByLine,
  recordAnnouncements,
} from "./fixtures/dom";
import { openSetlistScreen } from "./fixtures/flows";
import {
  MADRID_ID,
  PORTLAND_ID,
  SEATTLE_ID,
  SHARE_URL,
  madridCompleteStatus,
  madridOutdatedStatus,
  madridStatus,
  portlandCurrentStatus,
  seattleCurrentStatus,
} from "./fixtures/values";

afterEach(() => {
  vi.useRealTimers();
});

function openStatus(id: string, status: SetlistResponse | Promise<SetlistResponse>, fakeTimers = false) {
  const preview = controlledPreview();
  const api = fakeApi({ getSetlist: () => Promise.resolve(status), streamPreview: preview.streamPreview });
  return { api, preview, ...openApp(api, `/setlists/${id}`, { fakeTimers }) };
}

/** The items of the Show line, found from its date. */
function showLineItems(date: string): string[] {
  const item = getByLine(date).closest("li");
  const list = item?.parentElement;
  if (!item || !list) throw new Error("the Show line is a list of items");
  return Array.from(list.children).map((child) => normalise(child.textContent));
}

describe("Setlist status and Show line", () => {
  it("AC-21: asks for the status once and shows Loading the Setlist… until it arrives", async () => {
    const status = deferred<SetlistResponse>();
    const api = fakeApi({ getSetlist: () => status.promise });
    openApp(api, `/setlists/${PORTLAND_ID}`);
    await waitFor(() => getByLine("Loading the Setlist…"));
    expect(api.getSetlist).toHaveBeenCalledTimes(1);
    expect(api.getSetlist.mock.calls[0]?.[0]).toBe(PORTLAND_ID);

    await act(async () => status.resolve(portlandCurrentStatus()));
    await screen.findByRole("heading", { level: 1, name: "Pearl Jam" });
    expect(queryByLine("Loading the Setlist…")).toBeNull();
    expect(api.getSetlist).toHaveBeenCalledTimes(1);
  });

  it("AC-21: the h1 is the Show's Artist and the Show line lists date, venue and city", async () => {
    openStatus(PORTLAND_ID, portlandCurrentStatus());
    const h1 = await screen.findByRole("heading", { level: 1, name: "Pearl Jam" });
    expect(showLineItems("22 Nov 2026")).toEqual(["22 Nov 2026", "Moda Center", "Portland"]);
    expect(isBefore(h1, getByLine("22 Nov 2026"))).toBe(true);
    expect(normalise(document.body.textContent)).not.toContain("United States");
  });

  it("AC-21: empty parts of the Show line are left out", async () => {
    const status = portlandCurrentStatus();
    status.show = { ...status.show, venue: "" };
    openStatus(PORTLAND_ID, status);
    await screen.findByRole("heading", { level: 1, name: "Pearl Jam" });
    expect(showLineItems("22 Nov 2026")).toEqual(["22 Nov 2026", "Portland"]);
  });

  it("AC-21: an Incomplete Setlist shows the caution alert, without a note line when there is no note", async () => {
    openStatus(PORTLAND_ID, portlandCurrentStatus());
    await screen.findByRole("heading", { level: 1, name: "Pearl Jam" });
    const title = getByLine("Incomplete Setlist");
    const body = getByLine("setlist.fm doesn't list the whole Show. The playlist has only the known songs.");
    expect(isBefore(getByLine("Portland"), title)).toBe(true);
    expect(isBefore(title, body)).toBe(true);
    expect(normalise(document.body.textContent)).not.toContain("setlist.fm note");
  });

  it("AC-21: the Incomplete Setlist alert adds the setlist.fm note when the status has one", async () => {
    openStatus(SEATTLE_ID, seattleCurrentStatus());
    await screen.findByRole("heading", { level: 1, name: "Pearl Jam" });
    getByLine("Incomplete Setlist");
    getByLine('setlist.fm note: "Show cut short after a power outage."');
  });

  it("AC-21: a complete Setlist shows no Incomplete Setlist alert", async () => {
    openStatus(MADRID_ID, madridCompleteStatus());
    await screen.findByRole("heading", { level: 1, name: "Arctic Monkeys" });
    expect(queryByLine("Incomplete Setlist")).toBeNull();
    expect(queryByLine("setlist.fm doesn't list the whole Show. The playlist has only the known songs.")).toBeNull();
  });
});

describe("Setlist Playlist ready", () => {
  it("AC-22: a current playlist shows the ready panel, focused, and no preview is asked for", async () => {
    const { api } = openStatus(PORTLAND_ID, portlandCurrentStatus());
    const ready = await screen.findByRole("heading", { level: 2, name: "Setlist Playlist ready" });
    getByLine("It's up to date with setlist.fm.");

    const open = screen.getByRole("link", { name: "Open in Spotify (opens in a new tab)" });
    expect(open.getAttribute("href")).toBe(SHARE_URL);
    expect(open.getAttribute("target")).toBe("_blank");
    expect(open.getAttribute("rel")?.split(/\s+/)).toContain("noopener");
    getByLine(SHARE_URL);
    screen.getByRole("button", { name: "Copy link" });
    expect(isBefore(getByLine("Portland"), ready)).toBe(true);

    await expectFocusOn(() => screen.getByRole("heading", { level: 2, name: "Setlist Playlist ready" }));
    expect(api.streamPreview).not.toHaveBeenCalled();
    expect(queryByLine("Loading the Setlist…")).toBeNull();
  });

  it("AC-23: Copy link writes the share link, reads Copied for 2 seconds and announces Link copied", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { user } = openStatus(PORTLAND_ID, portlandCurrentStatus(), true);
    await user.click(await screen.findByRole("button", { name: "Copy link" }));

    await screen.findByRole("button", { name: "Copied" });
    expect(await navigator.clipboard.readText()).toBe(SHARE_URL);
    expect(announced()).toBe("Link copied");

    act(() => {
      vi.advanceTimersByTime(1500);
    });
    screen.getByRole("button", { name: "Copied" });
    act(() => {
      vi.advanceTimersByTime(600);
    });
    await screen.findByRole("button", { name: "Copy link" });
  });

  it("AC-23: Copy link reads Copied at 1999 ms and Copy link again at 2000 ms", async () => {
    openStatus(PORTLAND_ID, portlandCurrentStatus());
    const copy = await screen.findByRole("button", { name: "Copy link" });
    // Time moves only when the test moves it, so the 2-second edge is exact. A plain click is
    // used here: user-event waits on a timer of its own after each action, which never fires.
    vi.useFakeTimers();
    await act(async () => {
      fireEvent.click(copy);
      await Promise.resolve();
    });
    screen.getByRole("button", { name: "Copied" });

    act(() => {
      vi.advanceTimersByTime(1999);
    });
    screen.getByRole("button", { name: "Copied" });
    expect(screen.queryByRole("button", { name: "Copy link" })).toBeNull();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    screen.getByRole("button", { name: "Copy link" });
    expect(screen.queryByRole("button", { name: "Copied" })).toBeNull();
  });

  it("AC-23: copying the link a second time announces Link copied again", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { user } = openStatus(PORTLAND_ID, portlandCurrentStatus(), true);
    const copy = await screen.findByRole("button", { name: "Copy link" });
    const announcements = recordAnnouncements({ repeats: true });

    await user.click(copy);
    await screen.findByRole("button", { name: "Copied" });
    await waitFor(() => expect(announcements).toEqual(["Link copied"]));
    act(() => {
      vi.advanceTimersByTime(2100);
    });
    await user.click(await screen.findByRole("button", { name: "Copy link" }));
    await screen.findByRole("button", { name: "Copied" });

    await waitFor(() => expect(announcements).toEqual(["Link copied", "Link copied"]));
    expect(await navigator.clipboard.readText()).toBe(SHARE_URL);
  });

  it("AC-23: when the clipboard refuses, announces how to copy by hand and keeps Copy link", async () => {
    const { user } = openStatus(PORTLAND_ID, portlandCurrentStatus());
    const copy = await screen.findByRole("button", { name: "Copy link" });
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new DOMException("Denied", "NotAllowedError"));
    await user.click(copy);

    await waitFor(() => expect(announced()).toBe("The link couldn't be copied. Select the link text and copy it."));
    screen.getByRole("button", { name: "Copy link" });
    expect(screen.queryByRole("button", { name: "Copied" })).toBeNull();
  });

  it("AC-52: Setlist Playlist ready has no axe violations", async () => {
    const { container } = openStatus(SEATTLE_ID, seattleCurrentStatus());
    await screen.findByRole("heading", { level: 2, name: "Setlist Playlist ready" });
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("no playlist yet, or an outdated one", () => {
  it("AC-24: with no playlist the preview starts at once for the Setlist", async () => {
    const { api, preview } = openSetlistScreen(madridStatus());
    await waitFor(() => expect(api.streamPreview).toHaveBeenCalledTimes(1));
    expect(preview.last().id).toBe(MADRID_ID);
    expect(queryByLine("This Setlist changed on setlist.fm since its playlist was made.")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Setlist Playlist ready" })).toBeNull();
  });

  it("AC-24: an outdated playlist starts the preview and shows the info alert with the current playlist's link", async () => {
    const { api } = openSetlistScreen(madridOutdatedStatus());
    await waitFor(() => expect(api.streamPreview).toHaveBeenCalledTimes(1));
    const notice = getByLine("This Setlist changed on setlist.fm since its playlist was made.");
    expect(isBefore(getByLine("Madrid"), notice)).toBe(true);

    const current = screen.getByRole("link", { name: "Open current playlist (opens in a new tab)" });
    expect(current.getAttribute("href")).toBe(SHARE_URL);
    expect(current.getAttribute("target")).toBe("_blank");
    expect(current.getAttribute("rel")?.split(/\s+/)).toContain("noopener");
    expect(screen.queryByRole("heading", { name: "Setlist Playlist ready" })).toBeNull();
  });
});
