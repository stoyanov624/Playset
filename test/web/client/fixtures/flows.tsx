// Common ways into the visitor web app's screens, so each test starts where its example does.
import { act, screen, waitFor } from "@testing-library/react";
import type { PreviewResult, SetlistResponse } from "../../../../src/web/shared/index.js";
import { controlledPreview, fakeApi, type FakeApi } from "./fake-api";
import { currentUrl, findByLine, openApp, type OpenOptions } from "./dom";
import { ARCTIC_MONKEYS_MBID, MADRID_ID, arcticMonkeysPage1, madridResult, madridStatus } from "./values";

/** Waits until the API client's pending answers have reached the screen. */
export async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

/**
 * Opens the Madrid Setlist screen directly (as from a setlist.fm link or a shared URL) with the
 * given status; the preview stream is driven by the returned controller.
 */
export function openSetlistScreen(
  status: SetlistResponse = madridStatus(),
  extra: Partial<Parameters<typeof fakeApi>[0]> = {},
  options: OpenOptions = {},
) {
  const preview = controlledPreview();
  const api = fakeApi({
    getSetlist: async () => status,
    streamPreview: preview.streamPreview,
    ...extra,
  });
  const opened = openApp(api, `/setlists/${MADRID_ID}`, options);
  return { api, preview, ...opened };
}

/** Opens the Madrid Setlist screen and lets the preview finish with `result`. */
export async function openFinishedPreview(
  status: SetlistResponse = madridStatus(),
  result: PreviewResult = madridResult(),
  extra: Partial<Parameters<typeof fakeApi>[0]> = {},
  options: OpenOptions = {},
) {
  const opened = openSetlistScreen(status, extra, options);
  await waitFor(() => {
    if (opened.preview.calls.length === 0) throw new Error("the preview has not started");
  });
  await opened.preview.finish(result);
  await findByLine(matchCountLine(result));
  return opened;
}

/** The first line of the counts list: "4 Matches", "1 Match", "0 Matches". */
export function matchCountLine(result: PreviewResult): string {
  const matches = result.rows.filter((row) => row.outcome.kind === "match").length;
  return matches === 1 ? "1 Match" : `${matches} Matches`;
}

/**
 * Opens the Arctic Monkeys Setlist list, then the Madrid Setlist from it (as the Visitor does
 * after picking the Artist), so the Setlist screen's back link is "Setlists of Arctic Monkeys".
 */
export async function openSetlistFromList(
  status: SetlistResponse = madridStatus(),
  extra: Partial<Parameters<typeof fakeApi>[0]> = {},
) {
  const page = arcticMonkeysPage1();
  const firstSetlist = page.setlists[0];
  if (!firstSetlist) throw new Error("page 1 has no Setlist");
  page.setlists[0] = { ...firstSetlist, id: MADRID_ID, date: "2026-06-02", venue: "Estadio Metropolitano", city: "Madrid" };
  const preview = controlledPreview();
  const api: FakeApi = fakeApi({
    getArtistSetlists: async () => page,
    getSetlist: async () => status,
    streamPreview: preview.streamPreview,
    ...extra,
  });
  const opened = openApp(api, `/artists/${ARCTIC_MONKEYS_MBID}`);
  const row = await screen.findByRole("link", { name: "2 Jun 2026, Estadio Metropolitano, Madrid, 21 songs" });
  await opened.user.click(row);
  await waitFor(() => {
    if (currentUrl() !== `/setlists/${MADRID_ID}`) throw new Error(`still at ${currentUrl()}`);
  });
  await screen.findByRole("link", { name: "Setlists of Arctic Monkeys" });
  return { api, preview, ...opened };
}
