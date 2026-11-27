// Updating an existing Setlist Playlist when the Setlist gives no Matches (PRD 0014 AC-14): the
// playlist must not be emptied, so no request reaches Spotify at all.
import { describe, expect, it } from "vitest";
import { NothingToAddError, updateSetlistPlaylist } from "../../src/core/setlist-playlist/index.js";
import { E6_PLAYLIST_ID, TOKEN, captureError, fakeFetch, fakeSleep, fixtureS } from "./fixtures/fake-spotify";

const existingSetlistPlaylist = {
  id: E6_PLAYLIST_ID,
  shareUrl: `https://open.spotify.com/playlist/${E6_PLAYLIST_ID}`,
};

describe("Updating the Setlist Playlist", () => {
  it("AC-14: updating with no Matches raises the nothing-to-add error saying the Setlist Playlist was not changed, and sends no request", async () => {
    const { fetch, requests } = fakeFetch([]);

    const err = await captureError(
      updateSetlistPlaylist(existingSetlistPlaylist, fixtureS, [], {
        accessToken: TOKEN,
        fetch,
        sleep: fakeSleep().sleep,
      }),
    );

    expect(err).toBeInstanceOf(NothingToAddError);
    expect((err as Error).constructor).toBe(NothingToAddError);
    expect((err as Error).message).toBe("There are no Matches to add, so the Setlist Playlist was not changed.");
    expect(requests).toEqual([]);
  });
});
