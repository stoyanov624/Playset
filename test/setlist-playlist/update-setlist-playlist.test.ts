// Updating an existing Setlist Playlist in place (AC-14, AC-16 to AC-19), called directly with a fake
// fetch and a fake sleep. With no Matches the playlist must not be emptied, so no request reaches Spotify.
// A 404 on the first replace means the account no longer holds the playlist: the update says so and sends
// nothing more, so the caller can make a new one.
import { describe, expect, it } from "vitest";
import {
  NothingToAddError,
  PartlyUpdatedPlaylistError,
  SpotifyPlaylistError,
  updateSetlistPlaylist,
} from "../../src/core/setlist-playlist/index.js";
import {
  E6_PLAYLIST_ID,
  FIXTURE_S_DESCRIPTION,
  FIXTURE_S_NAME,
  TOKEN,
  captureError,
  e6Matches,
  e7Matches,
  fakeFetch,
  fakeSleep,
  fixtureS,
  jsonBody,
} from "./fixtures/fake-spotify";

const SHARE_URL = `https://open.spotify.com/playlist/${E6_PLAYLIST_ID}`;
const existingSetlistPlaylist = { id: E6_PLAYLIST_ID, shareUrl: SHARE_URL };
const ITEMS_URL = `https://api.spotify.com/v1/playlists/${E6_PLAYLIST_ID}/items`;
const DETAILS_URL = `https://api.spotify.com/v1/playlists/${E6_PLAYLIST_ID}`;
const REPLACED = { status: 200, body: { snapshot_id: "AAAAAwAAAAA" } };
const ADDED = { status: 201, body: { snapshot_id: "AAAAAgAAAAA" } };
const RENAMED = { status: 200 };
const NOT_FOUND = { status: 404, body: { error: { status: 404, message: "Resource not found" } } };

const calls = (requests: Array<{ method: string; url: string }>) => requests.map((r) => `${r.method} ${r.url}`);

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

    expect((err as Error).constructor).toBe(NothingToAddError);
    expect((err as Error).message).toBe("There are no Matches to add, so the Setlist Playlist was not changed.");
    expect(requests).toEqual([]);
  });

  it("AC-17: the first replace answered 404 → the playlist is no longer held, and no further request is sent", async () => {
    const { fetch, requests } = fakeFetch([NOT_FOUND]);

    const update = await updateSetlistPlaylist(existingSetlistPlaylist, fixtureS, e6Matches, {
      accessToken: TOKEN,
      fetch,
      sleep: fakeSleep().sleep,
    });

    expect(update).toEqual({ held: false });
    expect(calls(requests)).toEqual([`PUT ${ITEMS_URL}`]);
    expect(jsonBody(requests[0])).toEqual({ uris: e6Matches.map((m) => m.uri) });
  });

  it("AC-18: the first replace answered 500 → a Spotify playlist error with status 500 saying not changed; no further request", async () => {
    const { fetch, requests } = fakeFetch([{ status: 500, body: { error: { status: 500, message: "Server error" } } }]);

    const err = await captureError(
      updateSetlistPlaylist(existingSetlistPlaylist, fixtureS, e6Matches, { accessToken: TOKEN, fetch, sleep: fakeSleep().sleep }),
    );

    expect(err).toBeInstanceOf(SpotifyPlaylistError);
    expect(err).not.toBeInstanceOf(PartlyUpdatedPlaylistError);
    expect((err as SpotifyPlaylistError).status).toBe(500);
    expect((err as Error).message).toMatch(/not changed/i);
    expect(requests).toHaveLength(1);
  });

  it("AC-16: four Matches with a repeat → one replace with all four in played order, then the name and description; held", async () => {
    const { fetch, requests, stats } = fakeFetch([REPLACED, RENAMED]);

    const update = await updateSetlistPlaylist(existingSetlistPlaylist, fixtureS, e6Matches, {
      accessToken: TOKEN,
      fetch,
      sleep: fakeSleep().sleep,
    });

    expect(update).toEqual({
      held: true,
      playlist: { id: E6_PLAYLIST_ID, shareUrl: SHARE_URL, name: FIXTURE_S_NAME, trackCount: 4 },
    });
    expect(calls(requests)).toEqual([`PUT ${ITEMS_URL}`, `PUT ${DETAILS_URL}`]);
    expect(jsonBody(requests[0])).toEqual({
      uris: [
        "spotify:track:4LRPiXqCikLlN15c3yImP7",
        "spotify:track:2x8evxqUlF0eRabbW2JBJd",
        "spotify:track:5FVd6KXrgO9B3JPmC8OPst",
        "spotify:track:2x8evxqUlF0eRabbW2JBJd",
      ],
    });
    expect(jsonBody(requests[1])).toEqual({ name: FIXTURE_S_NAME, description: FIXTURE_S_DESCRIPTION });
    for (const r of requests) {
      expect(r.headers.get("Authorization")).toBe(`Bearer ${TOKEN}`);
      expect(r.headers.get("Content-Type")).toMatch(/^application\/json/);
    }
    expect(stats.maxInFlight).toBe(1);
  });

  it("AC-16: 250 Matches → replace 1–100, add 101–200 and 201–250, one after another, then the rename; 250 tracks", async () => {
    const matches = e7Matches();
    const uris = matches.map((m) => m.uri);
    const { fetch, requests, stats } = fakeFetch([REPLACED, ADDED, ADDED, RENAMED]);

    const update = await updateSetlistPlaylist(existingSetlistPlaylist, fixtureS, matches, {
      accessToken: TOKEN,
      fetch,
      sleep: fakeSleep().sleep,
    });

    expect(calls(requests)).toEqual([`PUT ${ITEMS_URL}`, `POST ${ITEMS_URL}`, `POST ${ITEMS_URL}`, `PUT ${DETAILS_URL}`]);
    expect(requests.slice(0, 3).map((r) => jsonBody(r))).toEqual([
      { uris: uris.slice(0, 100) },
      { uris: uris.slice(100, 200) },
      { uris: uris.slice(200, 250) },
    ]);
    // Match 180 repeats T007, sent again at its played position.
    expect((jsonBody(requests[1]) as { uris: string[] }).uris[79]).toBe("spotify:track:T007");
    expect(stats.maxInFlight).toBe(1);
    expect(update).toEqual({
      held: true,
      playlist: { id: E6_PLAYLIST_ID, shareUrl: SHARE_URL, name: FIXTURE_S_NAME, trackCount: 250 },
    });
  });

  it("AC-19: 250 Matches, the second add answered 502 → partly updated, 200 of 250 written; no rename", async () => {
    const { fetch, requests } = fakeFetch([
      REPLACED,
      ADDED,
      { status: 502, body: { error: { status: 502, message: "Bad gateway" } } },
    ]);

    const err = await captureError(
      updateSetlistPlaylist(existingSetlistPlaylist, fixtureS, e7Matches(), { accessToken: TOKEN, fetch, sleep: fakeSleep().sleep }),
    );

    expect((err as Error).constructor).toBe(PartlyUpdatedPlaylistError);
    const partly = err as PartlyUpdatedPlaylistError;
    expect([partly.playlistId, partly.shareUrl, partly.tracksWritten, partly.totalMatches]).toEqual([E6_PLAYLIST_ID, SHARE_URL, 200, 250]);
    expect(partly.hint).toBe("Try the update again: it replaces every track, so nothing is added twice.");
    expect(calls(requests)).toEqual([`PUT ${ITEMS_URL}`, `POST ${ITEMS_URL}`, `POST ${ITEMS_URL}`]);
  });
});
