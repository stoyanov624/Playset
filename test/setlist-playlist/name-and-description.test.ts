import { describe, expect, it } from "vitest";
import {
  DescriptionTooLongError,
  createSetlistPlaylist,
  setlistPlaylistDescription,
  setlistPlaylistName,
} from "../../src/core/setlist-playlist";
import {
  E6_PLAYLIST_ID,
  FIXTURE_S_DESCRIPTION,
  FIXTURE_S_NAME,
  SNAPSHOT,
  TOKEN,
  captureError,
  captureSyncError,
  createdPlaylistBody,
  e6Matches,
  errorText,
  fakeFetch,
  fakeSleep,
  fixtureS,
  jsonBody,
  show,
} from "./fixtures/fake-spotify";

/** `https://www.setlist.fm/setlist/` + `a`… up to `beforeHtml` chars + `.html`. */
function setlistUrlOfLength(totalLength: number): string {
  const prefix = "https://www.setlist.fm/setlist/";
  const beforeHtml = totalLength - ".html".length;
  return prefix + "a".repeat(beforeHtml - prefix.length) + ".html";
}

describe("Setlist Playlist name", () => {
  it("AC-1: names the Setlist Playlist 'Artist – YYYY-MM-DD – City' with en dashes (E1, Fixture S)", () => {
    const name = setlistPlaylistName(fixtureS);

    expect(name).toBe("Arctic Monkeys – 2025-08-23 – Amsterdam");
    expect(name).toBe(FIXTURE_S_NAME);
    expect(name).toHaveLength(39);
    expect(name.split(" – ")).toEqual(["Arctic Monkeys", "2025-08-23", "Amsterdam"]);
  });

  it.each([
    ["Sigur Rós", "2026-03-14", "Reykjavík", "Sigur Rós – 2026-03-14 – Reykjavík"],
    ["AC/DC", "2026-06-01", "Paris", "AC/DC – 2026-06-01 – Paris"],
    ["Simon & Garfunkel", "1981-09-19", "New York", "Simon & Garfunkel – 1981-09-19 – New York"],
  ])("AC-1: keeps each part exactly as given for %s (E1)", (artist, date, city, expected) => {
    expect(setlistPlaylistName(show({ artist, date, city }))).toBe(expected);
  });

  it("AC-1: does not use the venue in the name", () => {
    expect(setlistPlaylistName(show({ venue: "Somewhere Else" }))).toBe(FIXTURE_S_NAME);
  });

  it("AC-1: works out the name without any network request", () => {
    const { fetch, requests } = fakeFetch([]);
    const original = globalThis.fetch;
    globalThis.fetch = fetch as typeof globalThis.fetch;
    try {
      setlistPlaylistName(fixtureS);
    } finally {
      globalThis.fetch = original;
    }
    expect(requests).toHaveLength(0);
  });
});

describe("Setlist Playlist description", () => {
  it("AC-2: is exactly 'Setlist from setlist.fm: ' followed by the setlist.fm URL (E2, Fixture S)", () => {
    const description = setlistPlaylistDescription(fixtureS);

    expect(description).toBe(FIXTURE_S_DESCRIPTION);
    expect(description).toHaveLength(122);
  });

  it("AC-2: works out the description without any network request", () => {
    const { fetch, requests } = fakeFetch([]);
    const original = globalThis.fetch;
    globalThis.fetch = fetch as typeof globalThis.fetch;
    try {
      setlistPlaylistDescription(fixtureS);
    } finally {
      globalThis.fetch = original;
    }
    expect(requests).toHaveLength(0);
  });

  it("AC-3: allows a description of exactly 300 characters and does not shorten it (E2, 275-char URL)", () => {
    const url = setlistUrlOfLength(275);
    expect(url).toHaveLength(275);

    const description = setlistPlaylistDescription(show({ url }));

    expect(description).toHaveLength(300);
    expect(description).toBe(`Setlist from setlist.fm: ${url}`);
  });

  it("AC-3: raises a typed 'description too long' error mentioning 301 and 300 (E2, 276-char URL)", () => {
    const url = setlistUrlOfLength(276);
    expect(url).toHaveLength(276);

    const err = captureSyncError(() => setlistPlaylistDescription(show({ url })));

    expect(err).toBeInstanceOf(DescriptionTooLongError);
    expect((err as DescriptionTooLongError).descriptionLength).toBe(301);
    expect((err as DescriptionTooLongError).limit).toBe(300);
    expect(errorText(err)).toMatch(/301/);
    expect(errorText(err)).toMatch(/300/);
  });

  it("AC-3: creating a Setlist Playlist with a too-long description raises the same error and sends no request", async () => {
    const { fetch, requests } = fakeFetch([{ status: 201, body: createdPlaylistBody(E6_PLAYLIST_ID) }]);
    const { sleep } = fakeSleep();

    const err = await captureError(
      createSetlistPlaylist(show({ url: setlistUrlOfLength(276) }), e6Matches, { accessToken: TOKEN, fetch, sleep }),
    );

    expect(err).toBeInstanceOf(DescriptionTooLongError);
    expect(errorText(err)).toMatch(/301/);
    expect(errorText(err)).toMatch(/300/);
    expect(requests).toHaveLength(0);
  });
});

describe("Preview equals what is created", () => {
  it("AC-4: the name and description are the same every time and match the create request", async () => {
    const names = [setlistPlaylistName(fixtureS), setlistPlaylistName(fixtureS), setlistPlaylistName(fixtureS)];
    const descriptions = [
      setlistPlaylistDescription(fixtureS),
      setlistPlaylistDescription(fixtureS),
      setlistPlaylistDescription(fixtureS),
    ];
    expect(new Set(names).size).toBe(1);
    expect(new Set(descriptions).size).toBe(1);

    const { fetch, requests } = fakeFetch([
      { status: 201, body: createdPlaylistBody(E6_PLAYLIST_ID) },
      { status: 201, body: SNAPSHOT },
    ]);
    const result = await createSetlistPlaylist(fixtureS, e6Matches, { accessToken: TOKEN, fetch, sleep: fakeSleep().sleep });

    const createBody = jsonBody(requests[0]) as { name: string; description: string };
    expect(createBody.name).toBe(names[0]);
    expect(createBody.description).toBe(descriptions[0]);
    expect(result.name).toBe(names[0]);
  });
});
