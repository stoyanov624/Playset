// The streamed preview: progress while Matching, the announcements, the counts, the Misses jump
// list, the sheet of Performances by Set, Unknown Songs in place, "Left out" and the action.
import { act, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import type { PreviewResult, PreviewRow } from "../../../src/web/shared/index.js";
import {
  expectFocusOn,
  getByLine,
  hasAccessibleText,
  isBefore,
  linksTo,
  listAfter,
  normalise,
  queryAllByLine,
  queryByLine,
  recordAnnouncements,
  setRows,
} from "./fixtures/dom";
import { openFinishedPreview, openSetlistScreen } from "./fixtures/flows";
import {
  allMissResult,
  madridOutdatedStatus,
  madridResult,
  madridStatus,
  manyMissesResult,
  matchRow,
  missRow,
  nirvanaResult,
  oneMatchResult,
  resultWithRows,
  unknownSongsOnlyResult,
} from "./fixtures/values";

afterEach(() => {
  vi.useRealTimers();
});

async function startedPreview(options: { fakeTimers?: boolean } = {}) {
  const opened = openSetlistScreen(madridStatus(), {}, options);
  await screen.findByRole("heading", { level: 1, name: "Arctic Monkeys" });
  await waitFor(() => expect(opened.preview.calls).toHaveLength(1));
  return opened;
}

function rowWithTitle(rows: HTMLElement[], index: number): HTMLElement {
  const row = rows[index];
  if (!row) throw new Error(`no row at ${index}`);
  return row;
}

function fortyTwoPerformances(): PreviewResult {
  const rows: PreviewRow[] = [];
  for (let number = 1; number <= 42; number++) {
    rows.push(number % 10 === 0 ? missRow(number, `Song ${number}`) : matchRow(number, `Song ${number}`));
  }
  return resultWithRows(rows);
}

// ---------------------------------------------------------------- progress

describe("Matching progress", () => {
  it("AC-25: shows Loading the Setlist… until the first progress, and no sheet, counts or action", async () => {
    await startedPreview();
    await waitFor(() => getByLine("Loading the Setlist…"));
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.queryByRole("button", { name: "Create playlist" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Main set" })).toBeNull();
  });

  it("AC-25: a progress event shows Matching n of total with a progress bar of the same name", async () => {
    const { preview } = await startedPreview();
    preview.progress(1, 5);
    await waitFor(() => getByLine("Matching 1 of 5 Performances"));
    const bar = screen.getByRole("progressbar", { name: "Matching 1 of 5 Performances" });
    expect(bar.tagName).toBe("PROGRESS");
    expect((bar as HTMLProgressElement).max).toBe(5);
    expect((bar as HTMLProgressElement).value).toBe(1);
    expect(queryByLine("Loading the Setlist…")).toBeNull();

    preview.progress(3, 5);
    await waitFor(() => getByLine("Matching 3 of 5 Performances"));
    expect((screen.getByRole("progressbar", { name: "Matching 3 of 5 Performances" }) as HTMLProgressElement).value).toBe(3);
    expect(queryByLine("4 Matches")).toBeNull();
    expect(screen.queryByRole("button", { name: "Create playlist" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Main set" })).toBeNull();
  });

  it("AC-25: the result replaces the progress line and bar", async () => {
    const { preview } = await startedPreview();
    preview.progress(5, 5);
    await waitFor(() => getByLine("Matching 5 of 5 Performances"));
    await preview.finish(madridResult());
    await waitFor(() => getByLine("4 Matches"));
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(queryByLine("Matching 5 of 5 Performances")).toBeNull();
  });

  it("AC-26: announces Matching total Performances on the first progress, then Matching done with the counts", async () => {
    const { preview } = await startedPreview();
    const announcements = recordAnnouncements();
    for (let n = 1; n <= 5; n++) preview.progress(n, 5);
    await waitFor(() => expect(announcements).toEqual(["Matching 5 Performances"]));
    await preview.finish(madridResult());
    await waitFor(() => expect(announcements).toEqual(["Matching 5 Performances", "Matching done: 4 Matches, 1 Miss"]));
  });

  it("AC-26: announces Matching n of total only when 5 seconds have passed since the last announcement", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { preview } = await startedPreview({ fakeTimers: true });
    const announcements = recordAnnouncements();

    preview.progress(1, 42);
    await waitFor(() => expect(announcements).toEqual(["Matching 42 Performances"]));
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    for (let n = 2; n <= 10; n++) preview.progress(n, 42);
    act(() => {
      vi.advanceTimersByTime(2850);
    });
    for (let n = 11; n <= 19; n++) preview.progress(n, 42);
    await waitFor(() => getByLine("Matching 19 of 42 Performances"));
    expect(announcements).toEqual(["Matching 42 Performances"]);

    act(() => {
      vi.advanceTimersByTime(150);
    });
    preview.progress(20, 42);
    await waitFor(() => expect(announcements).toEqual(["Matching 42 Performances", "Matching 20 of 42"]));

    preview.progress(21, 42);
    await preview.finish(fortyTwoPerformances());
    await waitFor(() =>
      expect(announcements).toEqual(["Matching 42 Performances", "Matching 20 of 42", "Matching done: 38 Matches, 4 Misses"]),
    );
  });

  it("AC-26: a cached preview with no progress announces only Matching done", async () => {
    const { preview } = await startedPreview();
    const announcements = recordAnnouncements();
    await preview.finish(madridResult());
    await waitFor(() => expect(announcements).toEqual(["Matching done: 4 Matches, 1 Miss"]));
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it.each([
    ["one Match and no Misses", oneMatchResult(), "Matching done: 1 Match, 0 Misses"],
    ["no rows", unknownSongsOnlyResult(), "Matching done: 0 Matches, 0 Misses"],
    ["only Misses", allMissResult(), "Matching done: 0 Matches, 3 Misses"],
  ])("AC-26: Matching done counts %s", async (_kind, result, line) => {
    const { preview } = await startedPreview();
    const announcements = recordAnnouncements();
    await preview.finish(result);
    await waitFor(() => expect(announcements).toEqual([line]));
  });

  it("AC-52: the Setlist screen while Matching has no axe violations", async () => {
    const { preview, container } = await startedPreview();
    preview.progress(2, 5);
    await waitFor(() => getByLine("Matching 2 of 5 Performances"));
    expect(await axe(container)).toHaveNoViolations();
  });
});

// ---------------------------------------------------------------- counts

describe("counts", () => {
  it("AC-27: lists Matches, Misses, Unknown Songs and Tapes before the sheet", async () => {
    await openFinishedPreview();
    const lines = ["4 Matches", "1 Miss", "1 Unknown Song not added", "1 Tape left out"].map((line) => getByLine(line));
    for (let i = 1; i < lines.length; i++) {
      const before = lines[i - 1];
      const after = lines[i];
      if (!before || !after) throw new Error("count line missing");
      expect(isBefore(before, after)).toBe(true);
    }
    const last = lines.at(-1);
    if (!last) throw new Error("count line missing");
    expect(isBefore(last, screen.getByRole("heading", { level: 2, name: "Main set" }))).toBe(true);
  });

  it("AC-27: leaves out Misses, Unknown Songs and Tapes when there are none, and keeps 0 Matches", async () => {
    await openFinishedPreview(madridStatus(), resultWithRows([missRow(1, "Brianstorm"), missRow(2, "505")]));
    getByLine("0 Matches");
    getByLine("2 Misses");
    const text = normalise(document.querySelector("main")?.textContent);
    expect(text).not.toMatch(/Unknown Songs? not added/);
    expect(text).not.toMatch(/Tapes? left out/);
  });

  it("AC-27: one Match and no Misses reads 1 Match with no Misses line", async () => {
    await openFinishedPreview(madridStatus(), oneMatchResult());
    getByLine("1 Match");
    expect(queryByLine("0 Misses")).toBeNull();
  });

  it("AC-27: counts Unknown Songs and Tapes in the plural", async () => {
    const result = madridResult();
    result.notAdded = [
      { reason: "tape", name: "Intro" },
      { reason: "tape", name: "Outro" },
      { reason: "unknown", after: 1 },
      { reason: "unknown", after: 2 },
    ];
    await openFinishedPreview(madridStatus(), result);
    getByLine("2 Unknown Songs not added");
    getByLine("2 Tapes left out");
  });
});

// ---------------------------------------------------------------- sheet

describe("sheet", () => {
  it("AC-28: one section per Set, main shown as Main set, rows numbered in order with their Match lines", async () => {
    await openFinishedPreview();
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => normalise(h.textContent))).toEqual(
      expect.arrayContaining(["Main set", "Encore 1"]),
    );
    expect(isBefore(screen.getByRole("heading", { name: "Main set" }), screen.getByRole("heading", { name: "Encore 1" }))).toBe(true);

    const main = setRows("Main set").filter((row) => !normalise(row.textContent).includes("Unknown Song"));
    expect(main).toHaveLength(4);
    const expected: Array<[string, string, string]> = [
      ["1", "Brianstorm", "Brianstorm by Arctic Monkeys"],
      ["2", "Do I Wanna Know?", "Do I Wanna Know? by Arctic Monkeys"],
      ["3", "R U Mine?", "R U Mine? by Arctic Monkeys"],
      ["4", "Brianstorm", "Brianstorm by Arctic Monkeys"],
    ];
    expected.forEach(([number, title, line], index) => {
      const row = rowWithTitle(main, index);
      expect(row.closest("ol")).not.toBeNull();
      getByLine(number, row);
      getByLine(title, row);
      getByLine(line, row);
    });

    const encore = setRows("Encore 1");
    expect(encore).toHaveLength(1);
    getByLine("5", rowWithTitle(encore, 0));
    getByLine("505", rowWithTitle(encore, 0));
  });

  it("AC-28: a Set label other than main is shown as given, and a later run of main gets its own section", async () => {
    const result = resultWithRows([
      matchRow(1, "Brianstorm"),
      matchRow(2, "Cornerstone", "Acoustic"),
      matchRow(3, "Teddy Picker"),
    ]);
    await openFinishedPreview(madridStatus(), result);
    const setHeadings = screen
      .getAllByRole("heading", { level: 2 })
      .map((h) => normalise(h.textContent))
      .filter((label) => ["Main set", "Acoustic"].includes(label));
    expect(setHeadings).toEqual(["Main set", "Acoustic", "Main set"]);
  });

  it("AC-28: a live Match adds (live recording) and several artists are joined with commas", async () => {
    await openFinishedPreview(madridStatus(), nirvanaResult());
    getByLine("Polly by Nirvana (live recording)");
    getByLine("Boys in the Better Land by Fontaines D.C., Grian Chatten");
    getByLine("Love Buzz by Nirvana");
    expect(queryByLine("Love Buzz by Nirvana (live recording)")).toBeNull();
    expect(normalise(document.querySelector("main")?.textContent)).not.toContain("MTV Unplugged in New York");
  });

  it("AC-29: a Miss row reads Miss. No Spotify track by the Artist, and the Misses list links to it", async () => {
    await openFinishedPreview();
    const row = rowWithTitle(setRows("Encore 1"), 0);
    getByLine("Miss. No Spotify track by Arctic Monkeys.", row);

    const jump = screen.getByRole("link", { name: "5 505" });
    const href = jump.getAttribute("href") ?? "";
    expect(href).toMatch(/^#./);
    const target = document.getElementById(href.slice(1));
    expect(target).not.toBeNull();
    expect(target === row || row.contains(target) || target?.contains(row)).toBe(true);
  });

  it("AC-29: a Cover Miss names the Original Artist too", async () => {
    await openFinishedPreview(madridStatus(), nirvanaResult());
    getByLine("Miss. No Spotify track by Nirvana or The Vaselines.");
    getByLine("Miss. No Spotify track by Nirvana.");
  });

  it("AC-30: a Cover shows a Cover badge naming the Original Artist", async () => {
    await openFinishedPreview(madridStatus(), nirvanaResult());
    const row = setRows("Main set").find((li) => queryByLine("Love Buzz", li) !== null);
    if (!row) throw new Error("no Love Buzz row");
    expect(normalise(row.textContent)).toContain("Cover");
    expect(hasAccessibleText(row, "Cover of a song by Shocking Blue")).toBe(true);
    getByLine("3", row);
  });

  it("AC-30: each part of a medley shows a Medley badge naming the medley", async () => {
    await openFinishedPreview();
    const rows = setRows("Main set").filter((row) => normalise(row.textContent).includes("Medley"));
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(hasAccessibleText(row, 'Part of the medley "Do I Wanna Know? / R U Mine?"')).toBe(true);
    }
    const first = setRows("Main set")[0];
    if (!first) throw new Error("no first row");
    expect(normalise(first.textContent)).not.toContain("Medley");
    expect(normalise(first.textContent)).not.toContain("Cover");
  });

  it("AC-31: an Unknown Song row sits right after the row it follows, with no number", async () => {
    await openFinishedPreview();
    const rows = setRows("Main set");
    expect(rows).toHaveLength(5);
    const unknown = rowWithTitle(rows, 3);
    const text = normalise(unknown.textContent);
    expect(text).toContain("Unknown Song");
    expect(text).toContain("Not added.");
    expect(text).not.toMatch(/\d/);
    getByLine("R U Mine?", rowWithTitle(rows, 2));
    getByLine("4", rowWithTitle(rows, 4));
    getByLine("1 Miss");
  });

  it("AC-31: an Unknown Song's info follows Not added. in quotes", async () => {
    await openFinishedPreview(madridStatus(), nirvanaResult());
    const rows = setRows("Main set");
    const index = rows.findIndex((row) => normalise(row.textContent).includes("Unknown Song"));
    const before = rowWithTitle(rows, index - 1);
    getByLine("School", before);
    const text = normalise(rowWithTitle(rows, index).textContent);
    expect(text).toContain("Not added.");
    expect(text).toContain(`"Written as 'Dope Hippie' on the setlist"`);
    expect(text.indexOf("Not added.")).toBeLessThan(text.indexOf("Written as"));
  });

  it("AC-31: Unknown Songs after 0 come before the first row, in list order", async () => {
    const result = madridResult();
    result.notAdded = [{ reason: "unknown", after: 0 }, { reason: "unknown", after: 0, info: "Opener" }];
    await openFinishedPreview(madridStatus(), result);
    const rows = setRows("Main set");
    expect(rows).toHaveLength(6);
    expect(normalise(rowWithTitle(rows, 0).textContent)).toContain("Unknown Song");
    expect(normalise(rowWithTitle(rows, 0).textContent)).not.toContain("Opener");
    expect(normalise(rowWithTitle(rows, 1).textContent)).toContain('"Opener"');
    getByLine("Brianstorm", rowWithTitle(rows, 2));
  });

  it("AC-31: with no rows the Unknown Songs form one list with no Set heading", async () => {
    await openFinishedPreview(madridStatus(), unknownSongsOnlyResult());
    getByLine("2 Unknown Songs not added");
    expect(screen.queryByRole("heading", { name: "Main set" })).toBeNull();
    const unknownRows = Array.from(document.querySelectorAll("li")).filter((li) =>
      normalise(li.textContent).includes("Unknown Song") && !normalise(li.textContent).includes("not added"),
    );
    expect(unknownRows).toHaveLength(2);
    expect(unknownRows[0]?.parentElement).toBe(unknownRows[1]?.parentElement);
    expect(normalise(unknownRows[1]?.textContent)).toContain('Not added. "Opener"');
    expect(screen.queryByRole("heading", { name: "Misses" })).toBeNull();
  });
});

// ---------------------------------------------------------------- Misses jump list

describe("Misses jump list", () => {
  it("AC-32: a Misses heading follows the counts with one link per Miss", async () => {
    await openFinishedPreview();
    const misses = screen.getByRole("heading", { level: 2, name: "Misses" });
    expect(isBefore(getByLine("1 Miss"), misses)).toBe(true);
    expect(isBefore(misses, screen.getByRole("heading", { name: "Main set" }))).toBe(true);
    expect(linksTo("#").filter((a) => normalise(a.textContent) !== "Skip to content").map((a) => normalise(a.textContent))).toEqual([
      "5 505",
    ]);
  });

  it("AC-32: with more than 10 Misses shows the first 10 and a button that shows all of them in place", async () => {
    const { user } = await openFinishedPreview(madridStatus(), manyMissesResult());
    const missLinks = () => screen.queryAllByRole("link", { name: /^\d+ Song \d+$/ }).map((a) => normalise(a.textContent));
    expect(missLinks()).toEqual(Array.from({ length: 10 }, (_, i) => `${i + 3} Song ${i + 3}`));
    await user.click(screen.getByRole("button", { name: "Show all 23 Misses" }));
    await waitFor(() => expect(missLinks()).toHaveLength(23));
    expect(missLinks()).toEqual(Array.from({ length: 23 }, (_, i) => `${i + 3} Song ${i + 3}`));
  });

  it("AC-32: Show all 23 Misses moves focus to the first newly shown Miss link", async () => {
    const { user } = await openFinishedPreview(madridStatus(), manyMissesResult());
    await user.click(screen.getByRole("button", { name: "Show all 23 Misses" }));
    await expectFocusOn(() => screen.getByRole("link", { name: "13 Song 13" }));
    expect(screen.queryByRole("button", { name: "Show all 23 Misses" })).toBeNull();
  });

  it("AC-32: with no Misses there is no Misses heading", async () => {
    await openFinishedPreview(madridStatus(), oneMatchResult());
    expect(screen.queryByRole("heading", { name: "Misses" })).toBeNull();
  });
});

// ---------------------------------------------------------------- Left out

describe("Left out", () => {
  it("AC-33: lists Tapes and snippets after the sheet, each in not-added order, never as rows", async () => {
    await openFinishedPreview();
    const leftOut = screen.getByRole("heading", { level: 2, name: "Left out" });
    const lastRow = setRows("Encore 1").at(-1);
    if (!lastRow) throw new Error("no last row");
    expect(isBefore(lastRow, leftOut)).toBe(true);

    const tapes = getByLine("Tapes are never added:");
    const snippets = getByLine("Snippets are noted, not added:");
    expect(isBefore(leftOut, tapes)).toBe(true);
    expect(Array.from(listAfter(tapes).querySelectorAll("li")).map((li) => normalise(li.textContent))).toEqual(["Intro"]);
    expect(Array.from(listAfter(snippets).querySelectorAll("li")).map((li) => normalise(li.textContent))).toEqual([
      "Hey Jude",
      "Kashmir",
    ]);

    const sheetText = [...setRows("Main set"), ...setRows("Encore 1")].map((row) => normalise(row.textContent)).join(" ");
    expect(sheetText).not.toContain("Intro");
    expect(sheetText).not.toContain("Hey Jude");
    expect(sheetText).not.toContain("Kashmir");
  });

  it("AC-33: a list with no entries is left out", async () => {
    const result = madridResult();
    result.notAdded = [{ reason: "snippet", name: "Hey Jude" }];
    await openFinishedPreview(madridStatus(), result);
    screen.getByRole("heading", { level: 2, name: "Left out" });
    getByLine("Snippets are noted, not added:");
    expect(queryByLine("Tapes are never added:")).toBeNull();
  });

  it("AC-33: with no Tapes and no snippets there is no Left out section", async () => {
    await openFinishedPreview(madridStatus(), nirvanaResult());
    expect(screen.queryByRole("heading", { name: "Left out" })).toBeNull();
    expect(queryByLine("Snippets are noted, not added:")).toBeNull();
  });
});

// ---------------------------------------------------------------- action

describe("action", () => {
  it("AC-34: with Matches and no playlist yet, one Create playlist button with its line", async () => {
    await openFinishedPreview();
    expect(screen.getAllByRole("button", { name: "Create playlist" })).toHaveLength(1);
    expect(queryAllByLine("Public, in Playset's Spotify account")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Update playlist" })).toBeNull();
  });

  it("AC-34: an outdated playlist gets one Update playlist button with its line", async () => {
    await openFinishedPreview(madridOutdatedStatus());
    expect(screen.getAllByRole("button", { name: "Update playlist" })).toHaveLength(1);
    expect(queryAllByLine("Replaces the songs in the same playlist")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Create playlist" })).toBeNull();
  });

  it.each([
    ["only Unknown Songs", unknownSongsOnlyResult()],
    ["only Misses", allMissResult()],
  ])("AC-34: with zero Matches (%s) there is no action, only the nothing-to-put line", async (_kind, result) => {
    await openFinishedPreview(madridStatus(), result);
    getByLine("No songs matched, so there is nothing to put in a playlist.");
    expect(screen.queryByRole("button", { name: "Create playlist" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Update playlist" })).toBeNull();
    expect(queryByLine("Public, in Playset's Spotify account")).toBeNull();
  });

  it("AC-52: the finished preview (Misses, Cover, Medley, Unknown Song, Left out, Incomplete) has no axe violations", async () => {
    const result = madridResult();
    const coverRow = nirvanaResult().rows.find((row) => row.performance.originalArtist === "Shocking Blue");
    if (!coverRow) throw new Error("no Cover row");
    result.rows = [...result.rows, { ...coverRow, number: 6, performance: { ...coverRow.performance, position: 7, setLabel: "Encore 1" } }];
    const { container } = await openFinishedPreview(madridStatus(), result);
    getByLine("Incomplete Setlist");
    expect(await axe(container)).toHaveNoViolations();
  });

  it("AC-52: the preview with zero Matches has no axe violations", async () => {
    const { container } = await openFinishedPreview(madridStatus(), unknownSongsOnlyResult());
    expect(await axe(container)).toHaveNoViolations();
  });

  it("AC-52: the outdated preview with Update playlist has no axe violations", async () => {
    const { container } = await openFinishedPreview(madridOutdatedStatus());
    screen.getByRole("button", { name: "Update playlist" });
    expect(await axe(container)).toHaveNoViolations();
  });
});

