// PRD 0010 — "+", "&" and "and" count as the same word when verifying, and a title with "+"
// gets one extra filtered query per target artist with "+" replaced by "&" (src/core/matching).
// Spotify search results come from a fake TrackSearch with Spotify-shaped payloads. No network.
import { describe, expect, it } from "vitest";
import { matchPerformance } from "../../src/core/matching";
import { fakeTrackSearch, payload, track, type SpotifySearchPayload } from "./fixtures/fake-track-search";

function expectMatch(outcome: any) {
  expect(outcome.kind).toBe("match");
  return outcome as {
    kind: "match";
    uri: string;
    id: string;
    name: string;
    artists: string[];
    album: string;
    live: boolean;
  };
}

function expectMiss(outcome: any) {
  expect(outcome.kind).toBe("miss");
  return outcome as {
    kind: "miss";
    title: string;
    artist: string;
    originalArtist?: string;
    queries: string[];
  };
}

const filtered = (title: string, artist: string) => `track:"${title}" artist:"${artist}"`;

/** A fake search that gives the same payload for every query. */
function sameForEveryQuery(result: SpotifySearchPayload) {
  const search = fakeTrackSearch();
  const original = search.searchTracks.bind(search);
  return Object.assign(search, {
    async searchTracks(query: string, limit: number) {
      await original(query, limit);
      return result.tracks.items;
    },
  });
}

const KIWANUKA = "Michael Kiwanuka";
const LOVE_AND_HATE_ID = "1kLqvSbhE2uUuS5WkzYcXy";
const U_UR_HAND_ID = "2Ff2ZBt7BnWuN5wRpEhzxN";
const MMS_ID = "6gLqSwvK3pRzzWZGOS3e4W";

/** Verifies when `title` (Performance) and `trackName` (Spotify) normalise alike, by one filtered query. */
async function verifiesTitle(title: string, trackName: string, artist = KIWANUKA, spotifyArtist = artist) {
  const search = fakeTrackSearch({
    [filtered(title, artist)]: payload(track("4norm00000000000000000", trackName, spotifyArtist, "Some Album")),
  });
  const outcome = await matchPerformance({ title, artist }, search);
  return { outcome, search };
}

// ---------------------------------------------------------------- AC-7 normalisation

describe("matchPerformance — normalisation of '+', '&' and 'and' (PRD 0010)", () => {
  it.each<[string, string]>([
    ["Love + Hate", "Love and Hate"],
    ["Love+Hate", "Love and Hate"],
    ["Love & Hate", "love and hate"],
    ["U + Ur Hand", "u and ur hand"],
    ["M+M's", "m and ms"],
    ["M&M's", "M and Ms"],
  ])("AC-7: the title %j normalises like %j, so a track with that name verifies", async (title, trackName) => {
    const { outcome } = await verifiesTitle(title, trackName);
    expect(expectMatch(outcome).id).toBe("4norm00000000000000000");
  });

  it("AC-7: '&' and '+' become ' and ' with spaces, so 'R&B' verifies against 'R and B' but not against 'RandB'", async () => {
    const good = await verifiesTitle("R&B", "R and B");
    expectMatch(good.outcome);

    const bad = await verifiesTitle("R&B", "RandB");
    expectMiss(bad.outcome);

    const plus = await verifiesTitle("R+B", "R and B");
    expectMatch(plus.outcome);
  });

  it("AC-7: version suffixes are removed before '+' is turned into 'and': 'M+M's - Remastered 2011' verifies against 'M+M's'", async () => {
    const { outcome } = await verifiesTitle("M+M's", "M+M's - Remastered 2011", "blink-182");
    expect(expectMatch(outcome).name).toBe("M+M's - Remastered 2011");
  });

  it("AC-7: an apostrophe next to '+' or '&' is deleted after the replacement ('M+M’s' verifies against 'M & Ms')", async () => {
    const { outcome } = await verifiesTitle("M+M’s", "M & Ms", "blink-182");
    expectMatch(outcome);
  });

  it("AC-7: other punctuation still becomes a space ('P!nk' verifies against 'P!nk' but not 'Pink')", async () => {
    const same = fakeTrackSearch({
      [filtered("U + Ur Hand", "P!nk")]: payload(track(U_UR_HAND_ID, "U + Ur Hand", "P!nk", "I'm Not Dead")),
    });
    expectMatch(await matchPerformance({ title: "U + Ur Hand", artist: "P!nk" }, same));

    const other = sameForEveryQuery(payload(track(U_UR_HAND_ID, "U + Ur Hand", "Pink", "I'm Not Dead")));
    expectMiss(await matchPerformance({ title: "U + Ur Hand", artist: "P!nk" }, other));
  });

  it("AC-7: 'x' is not treated as 'and' ('Love x Hate' does not verify against 'Love and Hate')", async () => {
    const search = sameForEveryQuery(payload(track("4norm00000000000000000", "Love and Hate", KIWANUKA, "Some Album")));
    expectMiss(await matchPerformance({ title: "Love x Hate", artist: KIWANUKA }, search));
  });
});

// ---------------------------------------------------------------- AC-8 titles

describe("matchPerformance — titles with '+', '&' or 'and' verify against each other (PRD 0010)", () => {
  it.each<[string, string]>([
    ["Love + Hate", "Love & Hate"],
    ["Love + Hate", "Love and Hate"],
    ["Love + Hate", "Love+Hate"],
    ["Love + Hate", "Love +Hate"],
    ["Love + Hate", "Love&Hate"],
    ["Love+Hate", "Love & Hate"],
    ["M+M's", "M+M's"],
    ["M+M's", "M&M's"],
    ["M+M's", "M & M's"],
  ])("AC-8: the Performance title %j verifies against the track name %j", async (title, trackName) => {
    const { outcome, search } = await verifiesTitle(title, trackName);
    expectMatch(outcome);
    expect(search.queries).toHaveLength(1);
  });

  it("AC-8: X1 — 'Love + Hate' matches Spotify's 'Love & Hate' after one query, with no retry and no '&' query", async () => {
    const search = fakeTrackSearch({
      [filtered("Love + Hate", KIWANUKA)]: payload(track(LOVE_AND_HATE_ID, "Love & Hate", KIWANUKA, "Love & Hate")),
    });

    const outcome = await matchPerformance({ title: "Love + Hate", artist: KIWANUKA }, search);

    expect(outcome).toEqual({
      kind: "match",
      uri: `spotify:track:${LOVE_AND_HATE_ID}`,
      id: LOVE_AND_HATE_ID,
      name: "Love & Hate",
      artists: [KIWANUKA],
      album: "Love & Hate",
      live: false,
    });
    expect(search.searches).toEqual([{ query: filtered("Love + Hate", KIWANUKA), limit: 10 }]);
  });

  it("AC-8: X3 — 'U + Ur Hand' by P!nk matches Spotify's 'U + Ur Hand' after one query", async () => {
    const search = fakeTrackSearch({
      [filtered("U + Ur Hand", "P!nk")]: payload(track(U_UR_HAND_ID, "U + Ur Hand", "P!nk", "I'm Not Dead")),
    });

    const match = expectMatch(await matchPerformance({ title: "U + Ur Hand", artist: "P!nk" }, search));

    expect(match.id).toBe(U_UR_HAND_ID);
    expect(search.queries).toEqual([filtered("U + Ur Hand", "P!nk")]);
  });

  it.each(["M+M's", "M&M's"])("AC-8: X3 — 'M+M's' by blink-182 matches a track named %j after one query", async (name) => {
    const search = fakeTrackSearch({
      [filtered("M+M's", "blink-182")]: payload(track(MMS_ID, name, "blink-182", "Cheshire Cat")),
    });

    const match = expectMatch(await matchPerformance({ title: "M+M's", artist: "blink-182" }, search));

    expect(match.id).toBe(MMS_ID);
    expect(search.queries).toEqual([filtered("M+M's", "blink-182")]);
  });

  it("AC-8: a title that verifies still needs its artist to verify", async () => {
    const search = sameForEveryQuery(payload(track(LOVE_AND_HATE_ID, "Love & Hate", "Someone Else", "Love & Hate")));
    expectMiss(await matchPerformance({ title: "Love + Hate", artist: KIWANUKA }, search));
  });
});

// ---------------------------------------------------------------- AC-9 artists

describe("matchPerformance — artist names with '+', '&' or 'and' (PRD 0010)", () => {
  it.each(["Florence + The Machine", "Florence and the Machine", "Florence & the Machine", "Florence+the Machine"])(
    "AC-9: X5 — the Artist 'Florence + the Machine' passes the artist check against Spotify's %j",
    async (spotifyArtist) => {
      const search = fakeTrackSearch({
        [filtered("Dog Days Are Over", "Florence + the Machine")]: payload(
          track("1A8j0qRUvYBXkmT8mWj8Gt", "Dog Days Are Over", spotifyArtist, "Lungs"),
        ),
      });

      const match = expectMatch(
        await matchPerformance({ title: "Dog Days Are Over", artist: "Florence + the Machine" }, search),
      );

      expect(match.id).toBe("1A8j0qRUvYBXkmT8mWj8Gt");
      expect(search.queries).toHaveLength(1);
    },
  );

  it("AC-9: the Artist 'Simon and Garfunkel' passes against Spotify's 'Simon + Garfunkel'", async () => {
    const search = fakeTrackSearch({
      [filtered("The Boxer", "Simon and Garfunkel")]: payload(
        track("76TZCvJ8GitQ2FA1q5dKu0", "The Boxer", "Simon + Garfunkel", "Bridge Over Troubled Water"),
      ),
    });

    expectMatch(await matchPerformance({ title: "The Boxer", artist: "Simon and Garfunkel" }, search));
  });

  it("AC-9: the Original Artist check treats '+' like '&' during the Cover fallback", async () => {
    const search = fakeTrackSearch({
      [filtered("Dog Days Are Over", "Florence & the Machine")]: payload(
        track("1A8j0qRUvYBXkmT8mWj8Gt", "Dog Days Are Over", "Florence + The Machine", "Lungs"),
      ),
    });

    const match = expectMatch(
      await matchPerformance(
        { title: "Dog Days Are Over", artist: "Walk the Moon", originalArtist: "Florence & the Machine" },
        search,
      ),
    );

    expect(match.artists).toEqual(["Florence + The Machine"]);
  });
});

// ---------------------------------------------------------------- AC-10 symmetry

describe("matchPerformance — verification is symmetric (PRD 0010)", () => {
  it.each<[string, string]>([
    ["Love + Hate", "Love & Hate"],
    ["Love + Hate", "Love and Hate"],
    ["Love & Hate", "Love+Hate"],
    ["M+M's", "M&M's"],
  ])("AC-10: %j and %j verify against each other in both directions", async (a, b) => {
    expectMatch((await verifiesTitle(a, b)).outcome);
    expectMatch((await verifiesTitle(b, a)).outcome);
  });

  it("AC-10: X4 — the title 'Love & Hate' verifies against the track 'Love + Hate' after one query", async () => {
    const search = fakeTrackSearch({
      [filtered("Love & Hate", KIWANUKA)]: payload(track(LOVE_AND_HATE_ID, "Love + Hate", KIWANUKA, "Love & Hate")),
    });

    expectMatch(await matchPerformance({ title: "Love & Hate", artist: KIWANUKA }, search));
    expect(search.queries).toEqual([filtered("Love & Hate", KIWANUKA)]);
  });

  it("AC-10: X4 — the title 'Love and Hate' verifies against the track 'Love + Hate'", async () => {
    const search = fakeTrackSearch({
      [filtered("Love and Hate", KIWANUKA)]: payload(track(LOVE_AND_HATE_ID, "Love + Hate", KIWANUKA, "Love & Hate")),
    });

    expectMatch(await matchPerformance({ title: "Love and Hate", artist: KIWANUKA }, search));
  });

  it("AC-10: an artist written with '+' on setlist.fm and '&' on Spotify verifies, and the other way round", async () => {
    for (const [artist, spotifyArtist] of [
      ["Florence + the Machine", "Florence & the Machine"],
      ["Florence & the Machine", "Florence + the Machine"],
    ]) {
      const { outcome } = await verifiesTitle("Dog Days Are Over", "Dog Days Are Over", artist, spotifyArtist);
      expectMatch(outcome);
    }
  });
});

// ---------------------------------------------------------------- AC-11 no fuzzy matching

describe("matchPerformance — '+' never matches a missing or different symbol (PRD 0010)", () => {
  it.each(["Love Hate", "Love/Hate", "Love - Hate", "Love x Hate", "Love, Hate", "LoveHate"])(
    "AC-11: 'Love + Hate' does not verify against a track named %j",
    async (name) => {
      const search = sameForEveryQuery(payload(track(LOVE_AND_HATE_ID, name, KIWANUKA, "Love & Hate")));

      const miss = expectMiss(await matchPerformance({ title: "Love + Hate", artist: KIWANUKA }, search));

      expect(miss.queries).toHaveLength(3);
    },
  );

  it.each(["Release Alive", "Release/Alive"])(
    "AC-11: X6 — 'Release + Alive' does not verify against a track named %j by Pearl Jam",
    async (name) => {
      const search = sameForEveryQuery(payload(track("0aaaaaaaaaaaaaaaaaaaaa", name, "Pearl Jam", "Ten")));
      expectMiss(await matchPerformance({ title: "Release + Alive", artist: "Pearl Jam" }, search));
    },
  );
});

// ---------------------------------------------------------------- AC-12 first queries keep "+"

describe("matchPerformance — the filtered query and the retry keep '+' (PRD 0010)", () => {
  it("AC-12: the first query is the filtered query with '+' as given, asking for 10 results", async () => {
    const search = fakeTrackSearch();
    await matchPerformance({ title: "Love + Hate", artist: KIWANUKA }, search);

    expect(search.searches[0]).toEqual({ query: 'track:"Love + Hate" artist:"Michael Kiwanuka"', limit: 10 });
  });

  it("AC-12: an unspaced '+' is kept as given in the filtered query and the plain-text retry", async () => {
    const search = fakeTrackSearch();
    await matchPerformance({ title: "M+M's", artist: "blink-182" }, search);

    expect(search.searches.slice(0, 2)).toEqual([
      { query: `track:"M+M's" artist:"blink-182"`, limit: 10 },
      { query: "M+M's blink-182", limit: 10 },
    ]);
  });

  it("AC-12: the plain-text retry keeps '+' and is not replaced by 'and' anywhere", async () => {
    const search = fakeTrackSearch();
    await matchPerformance({ title: "Love + Hate", artist: KIWANUKA }, search);

    expect(search.queries[1]).toBe("Love + Hate Michael Kiwanuka");
    for (const q of search.queries) expect(q).not.toMatch(/Love and Hate/);
  });
});

// ---------------------------------------------------------------- AC-13 the "&" query

describe("matchPerformance — the extra '&' query for a '+' title (PRD 0010)", () => {
  it("AC-13: X2 — 'Love + Hate' reaches its Match through the '&' query after the filtered query and retry fail", async () => {
    const search = fakeTrackSearch({
      [filtered("Love + Hate", KIWANUKA)]: payload(),
      ["Love + Hate Michael Kiwanuka"]: payload(
        track("2coldlittleheart000000", "Cold Little Heart", KIWANUKA, "Love & Hate"),
      ),
      [filtered("Love & Hate", KIWANUKA)]: payload(track(LOVE_AND_HATE_ID, "Love & Hate", KIWANUKA, "Love & Hate")),
    });

    const match = expectMatch(await matchPerformance({ title: "Love + Hate", artist: KIWANUKA }, search));

    expect(match.id).toBe(LOVE_AND_HATE_ID);
    expect(match.live).toBe(false);
    expect(search.searches).toEqual([
      { query: 'track:"Love + Hate" artist:"Michael Kiwanuka"', limit: 10 },
      { query: "Love + Hate Michael Kiwanuka", limit: 10 },
      { query: 'track:"Love & Hate" artist:"Michael Kiwanuka"', limit: 10 },
    ]);
  });

  it("AC-13: every '+' is replaced by '&' and nothing else in the title changes; the target artist is unchanged", async () => {
    const search = fakeTrackSearch();
    await matchPerformance({ title: "Me+You + Them's", artist: "Florence + the Machine" }, search);

    expect(search.queries).toEqual([
      `track:"Me+You + Them's" artist:"Florence + the Machine"`,
      "Me+You + Them's Florence + the Machine",
      `track:"Me&You & Them's" artist:"Florence + the Machine"`,
    ]);
  });

  it("AC-13: X9 — double quotes are removed and several '+' all become '&'", async () => {
    const search = fakeTrackSearch();
    await matchPerformance({ title: '"A" + B + C', artist: "Muse" }, search);

    expect(search.queries).toEqual([`track:"A + B + C" artist:"Muse"`, "A + B + C Muse", `track:"A & B & C" artist:"Muse"`]);
  });

  it("AC-13: no '&' query is sent when the filtered query verifies", async () => {
    const search = fakeTrackSearch({
      [filtered("Release + Alive", "Pearl Jam")]: payload(track("0aaaaaaaaaaaaaaaaaaaaa", "Release & Alive", "Pearl Jam", "Ten")),
    });

    expectMatch(await matchPerformance({ title: "Release + Alive", artist: "Pearl Jam" }, search));
    expect(search.queries).toEqual([filtered("Release + Alive", "Pearl Jam")]);
  });

  it("AC-13: no '&' query is sent when the plain-text retry verifies, even with a live-only result", async () => {
    const search = fakeTrackSearch({
      ["Release + Alive Pearl Jam"]: payload(
        track("0aaaaaaaaaaaaaaaaaaaaa", "Release + Alive - Live", "Pearl Jam", "Live at the Gorge"),
      ),
    });

    const match = expectMatch(await matchPerformance({ title: "Release + Alive", artist: "Pearl Jam" }, search));

    expect(match.live).toBe(true);
    expect(search.queries).toEqual([filtered("Release + Alive", "Pearl Jam"), "Release + Alive Pearl Jam"]);
  });

  it("AC-13: the '&' query's results are judged by the same rules: a later studio result beats an earlier live one", async () => {
    const search = fakeTrackSearch({
      [filtered("Love & Hate", KIWANUKA)]: payload(
        track("5live00000000000000000", "Love & Hate - Live", KIWANUKA, "Live at the Roundhouse"),
        track("6other0000000000000000", "Love & Hate", "Someone Else", "Covers"),
        track(LOVE_AND_HATE_ID, "Love & Hate", KIWANUKA, "Love & Hate"),
      ),
    });

    const match = expectMatch(await matchPerformance({ title: "Love + Hate", artist: KIWANUKA }, search));

    expect(match.id).toBe(LOVE_AND_HATE_ID);
    expect(match.live).toBe(false);
  });

  it("AC-13: a live-only result from the '&' query is the Match, flagged live", async () => {
    const search = fakeTrackSearch({
      [filtered("Love & Hate", KIWANUKA)]: payload(
        track("5live00000000000000000", "Love & Hate (Live)", KIWANUKA, "Live at the Roundhouse"),
      ),
    });

    const match = expectMatch(await matchPerformance({ title: "Love + Hate", artist: KIWANUKA }, search));

    expect(match.id).toBe("5live00000000000000000");
    expect(match.live).toBe(true);
  });

  it("AC-13: P1 revisited — 'Even Flow + Alive' sends the filtered query, the retry and the '&' query, then is a Miss", async () => {
    const search = sameForEveryQuery(
      payload(track("2pN3kBT1hYiA4bBydDMYv4", "Even Flow", "Pearl Jam", "Ten"), track("3VbM2t6DQHmPWdbTvKrNKz", "Alive", "Pearl Jam", "Ten")),
    );

    const miss = expectMiss(await matchPerformance({ title: "Even Flow + Alive", artist: "Pearl Jam" }, search));

    expect(miss.queries).toEqual([
      'track:"Even Flow + Alive" artist:"Pearl Jam"',
      "Even Flow + Alive Pearl Jam",
      'track:"Even Flow & Alive" artist:"Pearl Jam"',
    ]);
  });

  it("AC-13: P1 revisited — 'Porch + Yellow Ledbetter' sends the filtered query, the retry and the '&' query, then is a Miss", async () => {
    const search = sameForEveryQuery(
      payload(
        track("1mT0w6Zm9qJ0xBJiu2rWbV", "Porch", "Pearl Jam", "Ten"),
        track("3Tz9GjB1xNnRdC3jGcvTBn", "Yellow Ledbetter", "Pearl Jam", "rearviewmirror (Greatest Hits 1991-2003)"),
      ),
    );

    const miss = expectMiss(await matchPerformance({ title: "Porch + Yellow Ledbetter", artist: "Pearl Jam" }, search));

    expect(miss.queries).toEqual([
      'track:"Porch + Yellow Ledbetter" artist:"Pearl Jam"',
      "Porch + Yellow Ledbetter Pearl Jam",
      'track:"Porch & Yellow Ledbetter" artist:"Pearl Jam"',
    ]);
    expect(search.searches.every((s) => s.limit === 10)).toBe(true);
  });

  it("AC-13: a search failure on the '&' query ends matching with that error", async () => {
    const failure = new Error("Spotify search failed (500)");
    const search = fakeTrackSearch({}, { failOn: { [filtered("Love & Hate", KIWANUKA)]: failure } });

    await expect(matchPerformance({ title: "Love + Hate", artist: KIWANUKA }, search)).rejects.toBe(failure);
    expect(search.queries).toHaveLength(3);
  });
});

// ---------------------------------------------------------------- AC-14 no "&" query without "+"

describe("matchPerformance — no '&' query without a '+' in the title (PRD 0010)", () => {
  it.each(["Love & Hate", "Love and Hate", "Love/Hate"])(
    "AC-14: X4 — a Miss for %j has exactly the two PRD 0003 queries",
    async (title) => {
      const search = fakeTrackSearch();

      const miss = expectMiss(await matchPerformance({ title, artist: KIWANUKA }, search));

      expect(miss.queries).toEqual([filtered(title, KIWANUKA), `${title} ${KIWANUKA}`]);
      expect(search.queries).toEqual(miss.queries);
    },
  );

  it("AC-14: X5 — a '+' only in the Artist never causes an '&' query: exactly 2 queries, the Artist sent as given", async () => {
    const search = fakeTrackSearch();

    const miss = expectMiss(
      await matchPerformance({ title: "Dog Days Are Over", artist: "Florence + the Machine" }, search),
    );

    expect(miss.queries).toEqual([
      'track:"Dog Days Are Over" artist:"Florence + the Machine"',
      "Dog Days Are Over Florence + the Machine",
    ]);
  });

  it("AC-14: a '+' only in the Original Artist never causes an '&' query: exactly 4 queries for the Cover", async () => {
    const search = fakeTrackSearch();

    const miss = expectMiss(
      await matchPerformance(
        { title: "Dog Days Are Over", artist: "Walk the Moon", originalArtist: "Florence + the Machine" },
        search,
      ),
    );

    expect(miss.queries).toEqual([
      'track:"Dog Days Are Over" artist:"Walk the Moon"',
      "Dog Days Are Over Walk the Moon",
      'track:"Dog Days Are Over" artist:"Florence + the Machine"',
      "Dog Days Are Over Florence + the Machine",
    ]);
  });
});

// ---------------------------------------------------------------- AC-15 Cover order

describe("matchPerformance — a Cover with a '+' title (PRD 0010)", () => {
  const cover = { title: "U + Ur Hand", artist: "Walk the Moon", originalArtist: "P!nk" };

  it("AC-15: X7 — Artist filtered, retry and '&' query come before the Original Artist; the Original Artist's filtered query is the Match", async () => {
    const search = fakeTrackSearch({
      ["U + Ur Hand Walk the Moon"]: payload(track("4shutupanddance0000000", "Shut Up and Dance", "Walk the Moon", "Talking Is Hard")),
      [filtered("U + Ur Hand", "P!nk")]: payload(track(U_UR_HAND_ID, "U + Ur Hand", "P!nk", "I'm Not Dead")),
    });

    const match = expectMatch(await matchPerformance(cover, search));

    expect(match.id).toBe(U_UR_HAND_ID);
    expect(search.queries).toEqual([
      'track:"U + Ur Hand" artist:"Walk the Moon"',
      "U + Ur Hand Walk the Moon",
      'track:"U & Ur Hand" artist:"Walk the Moon"',
      'track:"U + Ur Hand" artist:"P!nk"',
    ]);
  });

  it("AC-15: X7 variant — a live result from the Artist's '&' query is the Match and no Original Artist query is sent", async () => {
    const search = fakeTrackSearch({
      [filtered("U & Ur Hand", "Walk the Moon")]: payload(
        track("7livewalkthemoon000000", "U & Ur Hand - Live", "Walk the Moon", "Live at the Fillmore"),
      ),
      [filtered("U + Ur Hand", "P!nk")]: payload(track(U_UR_HAND_ID, "U + Ur Hand", "P!nk", "I'm Not Dead")),
    });

    const match = expectMatch(await matchPerformance(cover, search));

    expect(match.id).toBe("7livewalkthemoon000000");
    expect(match.live).toBe(true);
    expect(search.queries).toEqual([
      'track:"U + Ur Hand" artist:"Walk the Moon"',
      "U + Ur Hand Walk the Moon",
      'track:"U & Ur Hand" artist:"Walk the Moon"',
    ]);
    for (const q of search.queries) expect(q).not.toContain("P!nk");
  });

  it("AC-15: the Original Artist's '&' query is sent last and can give the Match", async () => {
    const search = fakeTrackSearch({
      [filtered("U & Ur Hand", "P!nk")]: payload(track(U_UR_HAND_ID, "U & Ur Hand", "P!nk", "I'm Not Dead")),
    });

    const match = expectMatch(await matchPerformance(cover, search));

    expect(match.id).toBe(U_UR_HAND_ID);
    expect(search.queries).toHaveLength(6);
    expect(search.queries[5]).toBe('track:"U & Ur Hand" artist:"P!nk"');
  });
});

// ---------------------------------------------------------------- AC-16 Miss lists every query

describe("matchPerformance — a Miss for a '+' title lists every query (PRD 0010)", () => {
  it("AC-16: X6 — 'Release + Alive' (not a Cover) is a Miss with exactly 3 queries in the order sent", async () => {
    const search = fakeTrackSearch({
      [filtered("Release + Alive", "Pearl Jam")]: payload(
        track("4xGvbS8NnKtwKw5CXGkmA9", "Release", "Pearl Jam", "Ten"),
        track("3VbM2t6DQHmPWdbTvKrNKz", "Alive", "Pearl Jam", "Ten"),
      ),
      ["Release + Alive Pearl Jam"]: payload(
        track("4xGvbS8NnKtwKw5CXGkmA9", "Release", "Pearl Jam", "Ten"),
        track("3VbM2t6DQHmPWdbTvKrNKz", "Alive", "Pearl Jam", "Ten"),
      ),
      [filtered("Release & Alive", "Pearl Jam")]: payload(),
    });

    const outcome = await matchPerformance({ title: "Release + Alive", artist: "Pearl Jam" }, search);

    expect(outcome).toEqual({
      kind: "miss",
      title: "Release + Alive",
      artist: "Pearl Jam",
      queries: ['track:"Release + Alive" artist:"Pearl Jam"', "Release + Alive Pearl Jam", 'track:"Release & Alive" artist:"Pearl Jam"'],
    });
  });

  it("AC-16: X7 — a Cover 'U + Ur Hand' with no verifying result is a Miss with exactly 6 queries in order", async () => {
    const search = fakeTrackSearch();

    const miss = expectMiss(
      await matchPerformance({ title: "U + Ur Hand", artist: "Walk the Moon", originalArtist: "P!nk" }, search),
    );

    expect(miss.title).toBe("U + Ur Hand");
    expect(miss.artist).toBe("Walk the Moon");
    expect(miss.originalArtist).toBe("P!nk");
    expect(miss.queries).toEqual([
      'track:"U + Ur Hand" artist:"Walk the Moon"',
      "U + Ur Hand Walk the Moon",
      'track:"U & Ur Hand" artist:"Walk the Moon"',
      'track:"U + Ur Hand" artist:"P!nk"',
      "U + Ur Hand P!nk",
      'track:"U & Ur Hand" artist:"P!nk"',
    ]);
    expect(search.queries).toEqual(miss.queries);
  });

  it("AC-16: X8 — an Original Artist equal to the Artist after normalising gives exactly 3 queries, none repeated", async () => {
    const search = fakeTrackSearch();

    const miss = expectMiss(
      await matchPerformance({ title: "M+M's", artist: "blink-182", originalArtist: "Blink-182" }, search),
    );

    expect(miss.queries).toEqual([`track:"M+M's" artist:"blink-182"`, "M+M's blink-182", `track:"M&M's" artist:"blink-182"`]);
    expect(search.queries).toEqual(miss.queries);
  });

  it.each(["", "   "])("AC-16: an Original Artist of %j (not a Cover) gives exactly 3 queries", async (originalArtist) => {
    const search = fakeTrackSearch();

    const miss = expectMiss(await matchPerformance({ title: "Love + Hate", artist: KIWANUKA, originalArtist }, search));

    expect(miss.queries).toHaveLength(3);
    expect(miss.queries[2]).toBe('track:"Love & Hate" artist:"Michael Kiwanuka"');
  });
});
