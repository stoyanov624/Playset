import { describe, expect, it } from "vitest";
import { matchPerformance } from "../../src/core/matching";
import { fakeTrackSearch, payload, track } from "./fixtures/fake-track-search";

// Shape helpers: the outcome is a discriminated union on `kind`.
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

describe("matchPerformance — queries", () => {
  it("AC-1: sends the filtered query with the title and Artist exactly as given, asking for 10 results", async () => {
    const search = fakeTrackSearch();
    await matchPerformance({ title: "Mr. Brightside", artist: "The Killers" }, search);

    expect(search.searches[0]).toEqual({
      query: 'track:"Mr. Brightside" artist:"The Killers"',
      limit: 10,
    });
  });

  it("AC-1: does not normalise the title or Artist inside the filtered query", async () => {
    const search = fakeTrackSearch();
    await matchPerformance({ title: "Don't Stop Me Now", artist: "Simon & Garfunkel" }, search);

    expect(search.searches[0]?.query).toBe('track:"Don\'t Stop Me Now" artist:"Simon & Garfunkel"');
  });
});

describe("matchPerformance — Match contents", () => {
  it("AC-2: returns a Match with uri, id, track name, all artists in Spotify's order, album and live flag (E1)", async () => {
    const search = fakeTrackSearch({
      [filtered("Here Comes the Sun", "The Beatles")]: payload(
        track(
          "6dGnYIeXmHdcikdzNNDMm2",
          "Here Comes The Sun - Remastered 2009",
          "The Beatles",
          "Abbey Road (Remastered)",
        ),
      ),
    });

    const outcome = await matchPerformance({ title: "Here Comes the Sun", artist: "The Beatles" }, search);

    expect(outcome).toEqual({
      kind: "match",
      uri: "spotify:track:6dGnYIeXmHdcikdzNNDMm2",
      id: "6dGnYIeXmHdcikdzNNDMm2",
      name: "Here Comes The Sun - Remastered 2009",
      artists: ["The Beatles"],
      album: "Abbey Road (Remastered)",
      live: false,
    });
    expect(search.queries).toHaveLength(1);
  });

  it("AC-2: a Match lists every artist of the track in Spotify's order", async () => {
    const search = fakeTrackSearch({
      [filtered("Deja Vu", "Beyonce")]: payload(
        track("7ggggggggggggggggggggg", "Déjà Vu (feat. Jay-Z)", ["Beyoncé", "JAY-Z"], "B'Day Deluxe Edition"),
      ),
    });

    const match = expectMatch(await matchPerformance({ title: "Deja Vu", artist: "Beyonce" }, search));
    expect(match.artists).toEqual(["Beyoncé", "JAY-Z"]);
  });
});

describe("matchPerformance — version suffixes", () => {
  const verifyingNames = [
    "Wish You Were Here - Remastered",
    "Wish You Were Here - Remastered 2011",
    "Wish You Were Here - 2011 Remaster",
    "Wish You Were Here - 2011 Remastered",
    "Wish You Were Here - Remaster",
    "Wish You Were Here (Remastered)",
    "Wish You Were Here (Remastered 2011)",
    "Wish You Were Here (2011 Remaster)",
    "Wish You Were Here (2011 Remastered)",
    "Wish You Were Here [Remastered]",
    "Wish You Were Here [2011 Remaster]",
    "Wish You Were Here - Single Version",
    "Wish You Were Here - Radio Edit",
    "Wish You Were Here (Single Version)",
    "Wish You Were Here (Radio Edit)",
    "Wish You Were Here (feat. Stéphane Grappelli)",
    "Wish You Were Here [feat. Stéphane Grappelli]",
    "Wish You Were Here (ft. Stéphane Grappelli)",
    "Wish You Were Here - feat. Stéphane Grappelli",
    "Wish You Were Here - Live",
    "Wish You Were Here - Live at Earls Court",
    "Wish You Were Here - Live from Knebworth",
    "Wish You Were Here - Live in Venice",
    "Wish You Were Here (Live)",
    "Wish You Were Here (Live at Earls Court)",
    "Wish You Were Here (Live from Knebworth)",
    "Wish You Were Here (Live in Venice)",
    "Wish You Were Here [Live]",
    "Wish You Were Here - REMASTERED 2011",
    "Wish You Were Here (radio edit)",
    "Wish You Were Here - Remastered 2011 - Live",
    "Wish You Were Here (2011 Remaster) [Live]",
  ];

  it.each(verifyingNames)("AC-3: a track named %j verifies against \"Wish You Were Here\"", async (name) => {
    const search = fakeTrackSearch({
      [filtered("Wish You Were Here", "Pink Floyd")]: payload(
        track("1wywwh0000000000000000", name, "Pink Floyd", "Wish You Were Here"),
      ),
    });

    const match = expectMatch(await matchPerformance({ title: "Wish You Were Here", artist: "Pink Floyd" }, search));
    expect(match.id).toBe("1wywwh0000000000000000");
    expect(match.name).toBe(name);
  });

  it("AC-3: an unrecognised suffix such as \"(Acoustic)\" does not verify", async () => {
    const search = fakeTrackSearch({
      [filtered("Wish You Were Here", "Pink Floyd")]: payload(
        track("2acoustic0000000000000", "Wish You Were Here (Acoustic)", "Pink Floyd", "Sessions"),
      ),
      ["Wish You Were Here Pink Floyd"]: payload(
        track("2acoustic0000000000000", "Wish You Were Here (Acoustic)", "Pink Floyd", "Sessions"),
      ),
    });

    const outcome = await matchPerformance({ title: "Wish You Were Here", artist: "Pink Floyd" }, search);
    expectMiss(outcome);
  });

  it("AC-3: a suffix only counts at the end of the track name", async () => {
    const search = fakeTrackSearch({
      [filtered("Wish You Were Here", "Pink Floyd")]: payload(
        track("3middle00000000000000", "Wish You Were Here - Remastered 2011 Outtake", "Pink Floyd", "Outtakes"),
      ),
    });

    const outcome = await matchPerformance({ title: "Wish You Were Here", artist: "Pink Floyd" }, search);
    expectMiss(outcome);
  });
});

describe("matchPerformance — normalisation", () => {
  const verifyingPairs: Array<{
    label: string;
    performance: { title: string; artist: string };
    result: { name: string; artist: string };
  }> = [
    {
      label: "accents and diacritics on title and Artist (E5)",
      performance: { title: "Deja Vu", artist: "Beyonce" },
      result: { name: "Déjà Vu", artist: "Beyoncé" },
    },
    {
      label: "& versus and",
      performance: { title: "The Boxer", artist: "Simon and Garfunkel" },
      result: { name: "The Boxer", artist: "Simon & Garfunkel" },
    },
    {
      label: "straight versus curly apostrophe, plus a remaster suffix",
      performance: { title: "Don't Stop Me Now", artist: "Queen" },
      result: { name: "Don’t Stop Me Now - Remastered 2011", artist: "Queen" },
    },
    {
      label: "diacritics in Artist and title",
      performance: { title: "Hoppipolla", artist: "Sigur Ros" },
      result: { name: "Hoppípolla", artist: "Sigur Rós" },
    },
    {
      label: "punctuation-heavy names",
      performance: { title: "T.N.T.", artist: "AC/DC" },
      result: { name: "T.N.T.", artist: "AC/DC" },
    },
    {
      label: "extra spacing",
      performance: { title: "Hello,  Goodbye", artist: "The Beatles" },
      result: { name: "Hello, Goodbye", artist: "The Beatles" },
    },
    {
      label: "letter case",
      performance: { title: "smells like teen spirit", artist: "NIRVANA" },
      result: { name: "Smells Like Teen Spirit", artist: "Nirvana" },
    },
  ];

  it.each(verifyingPairs)("AC-4: verifies despite $label", async ({ performance, result }) => {
    const search = fakeTrackSearch({
      [filtered(performance.title, performance.artist)]: payload(
        track("4norm00000000000000000", result.name, result.artist, "Some Album"),
      ),
    });

    const match = expectMatch(await matchPerformance(performance, search));
    expect(match.id).toBe("4norm00000000000000000");
  });

  it("AC-4: does not strip a leading \"The\" — \"Beatles\" does not verify against \"The Beatles\"", async () => {
    const search = fakeTrackSearch({
      [filtered("Let It Be", "Beatles")]: payload(track("5thebeatles00000000000", "Let It Be", "The Beatles", "Let It Be")),
      ["Let It Be Beatles"]: payload(track("5thebeatles00000000000", "Let It Be", "The Beatles", "Let It Be")),
    });

    expectMiss(await matchPerformance({ title: "Let It Be", artist: "Beatles" }, search));
  });
});

describe("matchPerformance — artist verification", () => {
  it("AC-5: a result by a different artist never verifies, and the plain-text retry finds the Artist's track (E6)", async () => {
    const search = fakeTrackSearch({
      [filtered("Yesterday", "The Beatles")]: payload(
        track("8hhhhhhhhhhhhhhhhhhhhh", "Yesterday", "Boyz II Men", "II"),
      ),
      ["Yesterday The Beatles"]: payload(
        track("3BQHpFgAp4l80e1XslIjNI", "Yesterday - Remastered 2009", "The Beatles", "Help! (Remastered)"),
      ),
    });

    const match = expectMatch(await matchPerformance({ title: "Yesterday", artist: "The Beatles" }, search));
    expect(match.id).toBe("3BQHpFgAp4l80e1XslIjNI");
    expect(match.live).toBe(false);
  });

  it("AC-5: a result listing the target artist among several artists verifies, whatever its position", async () => {
    const search = fakeTrackSearch({
      [filtered("Under Pressure", "David Bowie")]: payload(
        track("5underpressure00000000", "Under Pressure", ["Queen", "David Bowie"], "Hot Space"),
      ),
    });

    const match = expectMatch(await matchPerformance({ title: "Under Pressure", artist: "David Bowie" }, search));
    expect(match.id).toBe("5underpressure00000000");
    expect(match.artists).toEqual(["Queen", "David Bowie"]);
  });

  it("AC-5: a result whose only link to the Artist is a feat. credit in the title does not verify", async () => {
    const wrong = track("5featonly0000000000000", "Yesterday (feat. The Beatles)", "Some Tribute Band", "Tributes");
    const search = fakeTrackSearch({
      [filtered("Yesterday", "The Beatles")]: payload(wrong),
      ["Yesterday The Beatles"]: payload(wrong),
    });

    expectMiss(await matchPerformance({ title: "Yesterday", artist: "The Beatles" }, search));
  });
});

describe("matchPerformance — studio preference and live detection", () => {
  it("AC-6: picks the first non-live verifying result even when a live one comes earlier (E2)", async () => {
    const search = fakeTrackSearch({
      [filtered("Mr. Brightside", "The Killers")]: payload(
        track(
          "1aaaaaaaaaaaaaaaaaaaaa",
          "Mr. Brightside - Live at Wembley Stadium",
          "The Killers",
          "Live From The Royal Albert Hall",
        ),
        track("003vvx7Niy0yvhvHt4a68B", "Mr. Brightside", "The Killers", "Hot Fuss"),
        track("003second0000000000000", "Mr. Brightside", "The Killers", "Direct Hits"),
      ),
    });

    const match = expectMatch(await matchPerformance({ title: "Mr. Brightside", artist: "The Killers" }, search));
    expect(match.id).toBe("003vvx7Niy0yvhvHt4a68B");
    expect(match.album).toBe("Hot Fuss");
    expect(match.live).toBe(false);
  });

  it("AC-7: when every verifying result is live, picks the first one and flags it live (E3)", async () => {
    const search = fakeTrackSearch({
      [filtered("Crown of Thorns", "Pearl Jam")]: payload(
        track("2bbbbbbbbbbbbbbbbbbbbb", "Crown of Thorns", "Pearl Jam", "Live on Two Legs"),
        track("3ccccccccccccccccccccc", "Crown Of Thorns - Live", "Pearl Jam", "Let's Play Two"),
      ),
    });

    const match = expectMatch(await matchPerformance({ title: "Crown of Thorns", artist: "Pearl Jam" }, search));
    expect(match.id).toBe("2bbbbbbbbbbbbbbbbbbbbb");
    expect(match.live).toBe(true);
  });

  it("AC-7: a live verifying result beats a non-verifying studio result", async () => {
    const search = fakeTrackSearch({
      [filtered("Crown of Thorns", "Pearl Jam")]: payload(
        track("2wrongstudio0000000000", "Crown of Thorns", "Mother Love Bone", "Apple"),
        track("2bbbbbbbbbbbbbbbbbbbbb", "Crown of Thorns", "Pearl Jam", "Live on Two Legs"),
      ),
    });

    const match = expectMatch(await matchPerformance({ title: "Crown of Thorns", artist: "Pearl Jam" }, search));
    expect(match.id).toBe("2bbbbbbbbbbbbbbbbbbbbb");
    expect(match.live).toBe(true);
  });

  const liveCases: Array<{
    label: string;
    performance: { title: string; artist: string };
    result: { name: string; album: string };
    live: boolean;
  }> = [
    {
      label: "\"Alive\" is not the whole word live (E4)",
      performance: { title: "Alive", artist: "Pearl Jam" },
      result: { name: "Alive", album: "Ten" },
      live: false,
    },
    {
      label: "album \"Alive 2007\" is not live",
      performance: { title: "Robot Rock / Oh Yeah", artist: "Daft Punk" },
      result: { name: "Robot Rock / Oh Yeah", album: "Alive 2007" },
      live: false,
    },
    {
      label: "album \"Lively Up Yourself\" is not live",
      performance: { title: "Natural Mystic", artist: "Bob Marley & The Wailers" },
      result: { name: "Natural Mystic", album: "Lively Up Yourself" },
      live: false,
    },
    {
      label: "words \"Oliver\" and \"Delivery\" are not live",
      performance: { title: "Special Delivery", artist: "Oliver Tree" },
      result: { name: "Special Delivery", album: "Oliver's Delivery" },
      live: false,
    },
    {
      label: "title \"Live Forever\" on a studio album is not live",
      performance: { title: "Live Forever", artist: "Oasis" },
      result: { name: "Live Forever", album: "Definitely Maybe" },
      live: false,
    },
    {
      label: "\"Live Forever - Live at Knebworth Park\" is live",
      performance: { title: "Live Forever", artist: "Oasis" },
      result: { name: "Live Forever - Live at Knebworth Park", album: "Knebworth 1996" },
      live: true,
    },
    {
      label: "\"Live And Let Die\" on album \"Live And Let Die\" is not live",
      performance: { title: "Live and Let Die", artist: "Wings" },
      result: { name: "Live And Let Die", album: "Live And Let Die" },
      live: false,
    },
    {
      label: "upper-case \"LIVE\" in the album counts",
      performance: { title: "Jeremy", artist: "Pearl Jam" },
      result: { name: "Jeremy", album: "MTV Unplugged (LIVE)" },
      live: true,
    },
  ];

  it.each(liveCases)("AC-8: $label", async ({ performance, result, live }) => {
    const search = fakeTrackSearch({
      [filtered(performance.title, performance.artist)]: payload(
        track("8live00000000000000000", result.name, performance.artist, result.album),
      ),
    });

    const match = expectMatch(await matchPerformance(performance, search));
    expect(match.id).toBe("8live00000000000000000");
    expect(match.live).toBe(live);
  });

  it("AC-8: for \"Live Forever\", a result with live twice in its name is live and loses to the studio one (E4)", async () => {
    const search = fakeTrackSearch({
      [filtered("Live Forever", "Oasis")]: payload(
        track("5eeeeeeeeeeeeeeeeeeeee", "Live Forever - Live at Knebworth Park", "Oasis", "Knebworth 1996"),
        track("6fffffffffffffffffffff", "Live Forever - Remastered", "Oasis", "Definitely Maybe (Remastered)"),
      ),
    });

    const match = expectMatch(await matchPerformance({ title: "Live Forever", artist: "Oasis" }, search));
    expect(match.id).toBe("6fffffffffffffffffffff");
    expect(match.live).toBe(false);
  });
});

describe("matchPerformance — plain-text retry", () => {
  it("AC-9: sends exactly one plain-text retry \"<title> <Artist>\" with 10 results when the filtered query has no results", async () => {
    const search = fakeTrackSearch({
      ["Creep Radiohead"]: payload(track("9creep0000000000000000", "Creep", "Radiohead", "Pablo Honey")),
    });

    const match = expectMatch(await matchPerformance({ title: "Creep", artist: "Radiohead" }, search));
    expect(match.id).toBe("9creep0000000000000000");
    expect(search.searches).toEqual([
      { query: 'track:"Creep" artist:"Radiohead"', limit: 10 },
      { query: "Creep Radiohead", limit: 10 },
    ]);
  });

  it("AC-9: the retry's results are judged by the same rules (studio preferred over an earlier live result)", async () => {
    const search = fakeTrackSearch({
      ["Creep Radiohead"]: payload(
        track("9creeplive000000000000", "Creep - Live", "Radiohead", "Live Sessions"),
        track("9creepwrong00000000000", "Creep", "Stone Temple Pilots", "Purple"),
        track("9creep0000000000000000", "Creep", "Radiohead", "Pablo Honey"),
      ),
    });

    const match = expectMatch(await matchPerformance({ title: "Creep", artist: "Radiohead" }, search));
    expect(match.id).toBe("9creep0000000000000000");
    expect(match.live).toBe(false);
  });

  it("AC-9: no retry is sent when the filtered query yields a verifying result, even a live-only one (E3)", async () => {
    const search = fakeTrackSearch({
      [filtered("Crown of Thorns", "Pearl Jam")]: payload(
        track("2bbbbbbbbbbbbbbbbbbbbb", "Crown of Thorns", "Pearl Jam", "Live on Two Legs"),
      ),
      ["Crown of Thorns Pearl Jam"]: payload(
        track("2studio000000000000000", "Crown of Thorns", "Pearl Jam", "Studio Album"),
      ),
    });

    const match = expectMatch(await matchPerformance({ title: "Crown of Thorns", artist: "Pearl Jam" }, search));
    expect(match.id).toBe("2bbbbbbbbbbbbbbbbbbbbb");
    expect(search.queries).toEqual(['track:"Crown of Thorns" artist:"Pearl Jam"']);
  });
});

describe("matchPerformance — Cover fallback", () => {
  it("AC-10: falls back to the Original Artist with the same two searches in order (E7)", async () => {
    const search = fakeTrackSearch({
      [filtered("Atlantic City", "The Hold Steady")]: payload(
        track("9wrongband00000000000", "Atlantic City", "The Band", "Jericho"),
      ),
      ["Atlantic City The Hold Steady"]: payload(),
      [filtered("Atlantic City", "Bruce Springsteen")]: payload(
        track("9iiiiiiiiiiiiiiiiiiiii", "Atlantic City", "Bruce Springsteen", "Nebraska"),
      ),
    });

    const outcome = await matchPerformance(
      { title: "Atlantic City", artist: "The Hold Steady", originalArtist: "Bruce Springsteen" },
      search,
    );

    const match = expectMatch(outcome);
    expect(match).toEqual({
      kind: "match",
      uri: "spotify:track:9iiiiiiiiiiiiiiiiiiiii",
      id: "9iiiiiiiiiiiiiiiiiiiii",
      name: "Atlantic City",
      artists: ["Bruce Springsteen"],
      album: "Nebraska",
      live: false,
    });
    expect(search.queries).toEqual([
      'track:"Atlantic City" artist:"The Hold Steady"',
      "Atlantic City The Hold Steady",
      'track:"Atlantic City" artist:"Bruce Springsteen"',
    ]);
  });

  it("AC-10: uses the Original Artist plain-text retry when the Original Artist filtered query fails to verify", async () => {
    const search = fakeTrackSearch({
      ["Atlantic City Bruce Springsteen"]: payload(
        track("9iiiiiiiiiiiiiiiiiiiii", "Atlantic City", "Bruce Springsteen", "Nebraska"),
      ),
    });

    const match = expectMatch(
      await matchPerformance(
        { title: "Atlantic City", artist: "The Hold Steady", originalArtist: "Bruce Springsteen" },
        search,
      ),
    );
    expect(match.id).toBe("9iiiiiiiiiiiiiiiiiiiii");
    expect(search.searches).toEqual([
      { query: 'track:"Atlantic City" artist:"The Hold Steady"', limit: 10 },
      { query: "Atlantic City The Hold Steady", limit: 10 },
      { query: 'track:"Atlantic City" artist:"Bruce Springsteen"', limit: 10 },
      { query: "Atlantic City Bruce Springsteen", limit: 10 },
    ]);
  });

  it("AC-10: during the fallback only a result by the Original Artist verifies, skipping an earlier one by another artist", async () => {
    // During the fallback the target artist is the Original Artist; a track by someone else still never verifies.
    const search = fakeTrackSearch({
      [filtered("Atlantic City", "Bruce Springsteen")]: payload(
        track("9wrongband00000000000", "Atlantic City", "The Band", "Jericho"),
        track("9iiiiiiiiiiiiiiiiiiiii", "Atlantic City", "Bruce Springsteen", "Nebraska"),
      ),
    });

    const match = expectMatch(
      await matchPerformance(
        { title: "Atlantic City", artist: "The Hold Steady", originalArtist: "Bruce Springsteen" },
        search,
      ),
    );
    expect(match.id).toBe("9iiiiiiiiiiiiiiiiiiiii");
  });
});

describe("matchPerformance — preference across target artists", () => {
  it("AC-11: an Artist live result beats the Original Artist's studio recording; Oasis is never searched (E8)", async () => {
    const search = fakeTrackSearch({
      [filtered("Wonderwall", "Ryan Adams")]: payload(
        track("0jjjjjjjjjjjjjjjjjjjjj", "Wonderwall - Live", "Ryan Adams", "Live at Carnegie Hall"),
      ),
      [filtered("Wonderwall", "Oasis")]: payload(
        track("0oasis000000000000000", "Wonderwall", "Oasis", "(What's the Story) Morning Glory?"),
      ),
    });

    const match = expectMatch(
      await matchPerformance({ title: "Wonderwall", artist: "Ryan Adams", originalArtist: "Oasis" }, search),
    );
    expect(match.id).toBe("0jjjjjjjjjjjjjjjjjjjjj");
    expect(match.live).toBe(true);
    expect(search.queries).toEqual(['track:"Wonderwall" artist:"Ryan Adams"']);
  });

  it("AC-11: an Artist live result found by the plain-text retry still beats the Original Artist", async () => {
    const search = fakeTrackSearch({
      ["Wonderwall Ryan Adams"]: payload(
        track("0jjjjjjjjjjjjjjjjjjjjj", "Wonderwall - Live", "Ryan Adams", "Live at Carnegie Hall"),
      ),
      [filtered("Wonderwall", "Oasis")]: payload(
        track("0oasis000000000000000", "Wonderwall", "Oasis", "(What's the Story) Morning Glory?"),
      ),
    });

    const match = expectMatch(
      await matchPerformance({ title: "Wonderwall", artist: "Ryan Adams", originalArtist: "Oasis" }, search),
    );
    expect(match.id).toBe("0jjjjjjjjjjjjjjjjjjjjj");
    expect(search.queries).toEqual(['track:"Wonderwall" artist:"Ryan Adams"', "Wonderwall Ryan Adams"]);
  });

  it("AC-11: when the fallback is reached, an Original Artist studio result beats an Original Artist live result", async () => {
    const search = fakeTrackSearch({
      [filtered("Wonderwall", "Oasis")]: payload(
        track("0oasislive00000000000", "Wonderwall - Live", "Oasis", "Familiar to Millions"),
        track("0oasis000000000000000", "Wonderwall", "Oasis", "(What's the Story) Morning Glory?"),
      ),
    });

    const match = expectMatch(
      await matchPerformance({ title: "Wonderwall", artist: "Ryan Adams", originalArtist: "Oasis" }, search),
    );
    expect(match.id).toBe("0oasis000000000000000");
    expect(match.live).toBe(false);
  });
});

describe("matchPerformance — Miss", () => {
  it("AC-12: a Performance that is not a Cover is a Miss after exactly two searches (E9)", async () => {
    const search = fakeTrackSearch({
      ["Untitled New Song Muse"]: payload(
        track("1uprising000000000000", "Uprising", "Muse", "The Resistance"),
        track("1newborn0000000000000", "New Born", "Muse", "Origin of Symmetry"),
      ),
    });

    const outcome = await matchPerformance({ title: "Untitled New Song", artist: "Muse" }, search);

    expectMiss(outcome);
    expect(search.searches).toHaveLength(2);
  });

  it("AC-13: a Miss carries the title, Artist and every query in order (E9)", async () => {
    const search = fakeTrackSearch({
      ["Untitled New Song Muse"]: payload(
        track("1uprising000000000000", "Uprising", "Muse", "The Resistance"),
        track("1newborn0000000000000", "New Born", "Muse", "Origin of Symmetry"),
      ),
    });

    const miss = expectMiss(await matchPerformance({ title: "Untitled New Song", artist: "Muse" }, search));

    expect(miss.title).toBe("Untitled New Song");
    expect(miss.artist).toBe("Muse");
    expect(miss.originalArtist).toBeUndefined();
    expect(miss.queries).toEqual(['track:"Untitled New Song" artist:"Muse"', "Untitled New Song Muse"]);
  });

  it("AC-13: a Cover Miss carries the Original Artist and all four queries in order (E10)", async () => {
    const hadfield = payload(track("1hadfield000000000000", "Space Oddity", "Chris Hadfield", "Space Sessions"));
    const search = fakeTrackSearch({
      [filtered("Space Oddity", "Seu Jorge")]: hadfield,
      ["Space Oddity Seu Jorge"]: hadfield,
      [filtered("Space Oddity", "David Bowie")]: hadfield,
      ["Space Oddity David Bowie"]: hadfield,
    });

    const miss = expectMiss(
      await matchPerformance({ title: "Space Oddity", artist: "Seu Jorge", originalArtist: "David Bowie" }, search),
    );

    expect(miss).toEqual({
      kind: "miss",
      title: "Space Oddity",
      artist: "Seu Jorge",
      originalArtist: "David Bowie",
      queries: [
        'track:"Space Oddity" artist:"Seu Jorge"',
        "Space Oddity Seu Jorge",
        'track:"Space Oddity" artist:"David Bowie"',
        "Space Oddity David Bowie",
      ],
    });
  });

  it("AC-13: a top-ranked unverified result is never returned as a Match", async () => {
    const search = fakeTrackSearch({
      [filtered("Creep", "Radiohead")]: payload(
        track("1karaoke0000000000000", "Creep (Karaoke Version)", "Radiohead", "Karaoke Hits"),
        track("1stp00000000000000000", "Creep", "Stone Temple Pilots", "Purple"),
      ),
      ["Creep Radiohead"]: payload(
        track("1karaoke0000000000000", "Creep (Karaoke Version)", "Radiohead", "Karaoke Hits"),
      ),
    });

    const miss = expectMiss(await matchPerformance({ title: "Creep", artist: "Radiohead" }, search));
    expect(miss.queries).toHaveLength(2);
  });
});

describe("matchPerformance — Original Artist edge cases", () => {
  const notCovers: Array<{ label: string; originalArtist: string | undefined }> = [
    { label: "missing", originalArtist: undefined },
    { label: "empty", originalArtist: "" },
    { label: "blank", originalArtist: "   " },
    { label: "the Artist in another case", originalArtist: "nine inch nails" },
    { label: "the Artist with different punctuation and spacing", originalArtist: "Nine  Inch Nails!" },
  ];

  it.each(notCovers)("AC-14: Original Artist $label means no fallback and no repeated search (E11)", async ({ originalArtist }) => {
    const search = fakeTrackSearch();
    const performance =
      originalArtist === undefined
        ? { title: "Hurt", artist: "Nine Inch Nails" }
        : { title: "Hurt", artist: "Nine Inch Nails", originalArtist };

    const miss = expectMiss(await matchPerformance(performance, search));

    expect(search.queries).toEqual(['track:"Hurt" artist:"Nine Inch Nails"', "Hurt Nine Inch Nails"]);
    expect(new Set(search.queries).size).toBe(search.queries.length);
    expect(miss.queries).toEqual(search.queries);
  });
});

describe("matchPerformance — empty title", () => {
  it.each(["   ", ""])("AC-15: a title of %j is a Miss with no queries and no search sent (E12)", async (title) => {
    const search = fakeTrackSearch();

    const miss = expectMiss(await matchPerformance({ title, artist: "Radiohead" }, search));

    expect(miss.title).toBe(title);
    expect(miss.artist).toBe("Radiohead");
    expect(miss.queries).toEqual([]);
    expect(search.searches).toHaveLength(0);
  });
});

describe("matchPerformance — double quotes", () => {
  it("AC-16: straight double quotes are removed from the filtered query and the retry (E13)", async () => {
    const search = fakeTrackSearch();
    await matchPerformance({ title: 'The "Fabulous" Song', artist: "Weezer" }, search);

    expect(search.queries).toEqual(['track:"The Fabulous Song" artist:"Weezer"', "The Fabulous Song Weezer"]);
  });

  it("AC-16: curly double quotes in the title and Artist are removed too", async () => {
    const search = fakeTrackSearch();
    await matchPerformance({ title: "The “Fabulous” Song", artist: "The \"Real\" Weezer" }, search);

    expect(search.queries).toEqual([
      'track:"The Fabulous Song" artist:"The Real Weezer"',
      "The Fabulous Song The Real Weezer",
    ]);
  });

  it("AC-16: a result still verifies against a title that had double quotes", async () => {
    const search = fakeTrackSearch({
      ['track:"The Fabulous Song" artist:"Weezer"']: payload(
        track("1fabulous000000000000", 'The "Fabulous" Song', "Weezer", "Pinkerton"),
      ),
    });

    const match = expectMatch(await matchPerformance({ title: 'The "Fabulous" Song', artist: "Weezer" }, search));
    expect(match.id).toBe("1fabulous000000000000");
  });
});

describe("matchPerformance — extra Performance information", () => {
  it("AC-17: Set name, Encore and Tape flags are ignored (E14)", async () => {
    const answers = {
      [filtered("Paranoid Android", "Radiohead")]: payload(
        track("1paranoid000000000000", "Paranoid Android", "Radiohead", "OK Computer"),
      ),
    };
    const plainSearch = fakeTrackSearch(answers);
    const extraSearch = fakeTrackSearch(answers);

    const plain = await matchPerformance({ title: "Paranoid Android", artist: "Radiohead" }, plainSearch);
    const extra = await matchPerformance(
      { title: "Paranoid Android", artist: "Radiohead", set: "Encore 1", encore: true, tape: false } as {
        title: string;
        artist: string;
      },
      extraSearch,
    );

    expect(extra).toEqual(plain);
    expect(extraSearch.searches).toEqual(plainSearch.searches);
  });

  it("AC-17: extra information is ignored for a Miss too", async () => {
    const plainSearch = fakeTrackSearch();
    const extraSearch = fakeTrackSearch();

    const plain = await matchPerformance({ title: "Paranoid Android", artist: "Radiohead" }, plainSearch);
    const extra = await matchPerformance(
      { title: "Paranoid Android", artist: "Radiohead", set: "Encore 1", encore: true, tape: true } as {
        title: string;
        artist: string;
      },
      extraSearch,
    );

    expect(extra).toEqual(plain);
    expect(extraSearch.searches).toEqual(plainSearch.searches);
  });
});

describe("matchPerformance — search failures", () => {
  it("AC-18: a failing search ends matching with that error and sends no further query (E15)", async () => {
    const search = fakeTrackSearch(
      {},
      { failOn: { [filtered("Creep", "Radiohead")]: new Error("network unreachable") } },
    );

    await expect(matchPerformance({ title: "Creep", artist: "Radiohead" }, search)).rejects.toThrow(
      "network unreachable",
    );
    expect(search.searches).toHaveLength(1);
  });

  it("AC-18: a failure on the plain-text retry is an error, not a Miss", async () => {
    const search = fakeTrackSearch({}, { failOn: { "Creep Radiohead": new Error("Spotify search failed: 500") } });

    await expect(matchPerformance({ title: "Creep", artist: "Radiohead" }, search)).rejects.toThrow(
      "Spotify search failed: 500",
    );
    expect(search.searches).toHaveLength(2);
  });
});
