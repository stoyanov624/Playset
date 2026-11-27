// Contract-shaped values from the web contract's examples (X1–X11). The shared setlist.fm
// fixtures (Fixture A, H, P1, P2, U1, T1d) are raw setlist.fm or core shapes; these are the
// same Shows as the browser sees them after the server drops the internal fields.
// Every builder returns a fresh object, so a test may change it freely.

export const PEARL_JAM_MBID = "83b9cbe7-9857-49e2-ab8e-b57b01038103";
export const SHARE_URL = "https://open.spotify.com/playlist/5PqRsTuVwXyZaBcDeFgHiJ";
export const MADRID_URL =
  "https://www.setlist.fm/setlist/arctic-monkeys/2026/estadio-metropolitano-madrid-spain-73a1b2c5.html";
export const PORTLAND_URL =
  "https://www.setlist.fm/setlist/pearl-jam/2026/moda-center-portland-or-2bf1c8e4.html";

/** Changes a deep copy of `base`; the draft is untyped on purpose (tests build invalid values). */
export function changed(base: unknown, edit: (draft: any) => void): unknown {
  const draft = structuredClone(base);
  edit(draft);
  return draft;
}

/** X3: the Genesis Artist search answer (PRD 0012 F1). */
export function genesisSearchAnswer() {
  return {
    artists: [
      { name: "Genesis", mbid: "8e3fcd7d-bda1-4ca0-b987-b8528d2ee74e", disambiguation: "English rock band" },
      { name: "Genesis", mbid: "2f4b1c6e-0d3a-4e5b-8c7d-9e0f1a2b3c4d", disambiguation: "US psychedelic rock band" },
      { name: "Genesis Owusu", mbid: "4a5b6c7d-8e9f-4a0b-9c1d-2e3f4a5b6c7d" },
    ],
  };
}

/** X4: Pearl Jam Setlist page 1 (PRD 0012 P1). */
export function pearlJamPage() {
  return {
    artist: { mbid: PEARL_JAM_MBID, name: "Pearl Jam" },
    setlists: [
      {
        id: "2bf1c8e4", date: "2026-11-22", venue: "Moda Center", city: "Portland", songCount: 3,
        incompleteStatus: { isIncomplete: true, unknownSongCount: 1 },
      },
      {
        id: "6bf1b3d0", date: "2026-11-20", venue: "Climate Pledge Arena", city: "Seattle", songCount: 2,
        incompleteStatus: {
          isIncomplete: true, unknownSongCount: 0, matchedPhrase: "cut short",
          setlistNote: "Show cut short after a power outage.",
        },
      },
      {
        id: "3bf1a7c2", date: "2026-11-18", venue: "Rogers Arena", city: "Vancouver", songCount: 6,
        incompleteStatus: { isIncomplete: false, unknownSongCount: 0 },
      },
    ],
    hasMore: true,
  };
}

/** X6: Fixture H v1 (PRD 0014) as a Setlist status answer, recorded and current. */
export function portlandStatusAnswer() {
  return {
    show: { artist: "Pearl Jam", date: "2026-11-22", venue: "Moda Center", city: "Portland", url: PORTLAND_URL },
    incompleteStatus: { isIncomplete: true, unknownSongCount: 1 },
    playlist: { status: "current", url: SHARE_URL },
  };
}

/** X7: the Madrid preview (PRD 0012 P2, Arctic Monkeys, every Tape left out, "505" a Miss). */
export function madridPreview() {
  return {
    show: { artist: "Arctic Monkeys", date: "2026-06-02", venue: "Estadio Metropolitano", city: "Madrid", url: MADRID_URL },
    incompleteStatus: { isIncomplete: true, unknownSongCount: 1 },
    rows: [
      {
        number: 1, performance: { position: 2, title: "Brianstorm", setLabel: "main" },
        outcome: { kind: "match", name: "Brianstorm", artists: ["Arctic Monkeys"], album: "Favourite Worst Nightmare", live: false },
      },
      {
        number: 2, performance: { position: 3, title: "Do I Wanna Know?", setLabel: "main", medley: "Do I Wanna Know? / R U Mine?" },
        outcome: { kind: "match", name: "Do I Wanna Know?", artists: ["Arctic Monkeys"], album: "AM", live: false },
      },
      {
        number: 3, performance: { position: 4, title: "R U Mine?", setLabel: "main", medley: "Do I Wanna Know? / R U Mine?" },
        outcome: { kind: "match", name: "R U Mine?", artists: ["Arctic Monkeys"], album: "AM", live: false },
      },
      {
        number: 4, performance: { position: 5, title: "Brianstorm", setLabel: "main" },
        outcome: { kind: "match", name: "Brianstorm", artists: ["Arctic Monkeys"], album: "Favourite Worst Nightmare", live: false },
      },
      {
        number: 5, performance: { position: 6, title: "505", setLabel: "Encore 1" },
        outcome: { kind: "miss", title: "505", artist: "Arctic Monkeys" },
      },
    ],
    misses: [{ number: 5, title: "505", artist: "Arctic Monkeys" }],
    notAdded: [
      { reason: "tape", name: "Intro" },
      { reason: "snippet", name: "Hey Jude" },
      { reason: "unknown", after: 3 },
      { reason: "snippet", name: "Kashmir" },
    ],
    playlistName: "Arctic Monkeys – 2026-06-02 – Madrid",
    versionId: "g3e5f7a91",
  };
}

/** X7: the Nirvana Cover row (PRD 0011 U1; number and position illustrative). */
export function loveBuzzCoverRow() {
  return {
    number: 3, performance: { position: 3, title: "Love Buzz", setLabel: "main", originalArtist: "Shocking Blue" },
    outcome: { kind: "match", name: "Love Buzz", artists: ["Nirvana"], album: "Bleach", live: false },
  };
}

/** X7: the empty preview of PRD 0011 T1d (only Unknown Songs). */
export function unknownSongsOnlyPreview() {
  return {
    show: { artist: "Pearl Jam", date: "2026-11-22", venue: "Moda Center", city: "Portland", url: PORTLAND_URL },
    incompleteStatus: { isIncomplete: true, unknownSongCount: 2 },
    rows: [],
    misses: [],
    notAdded: [{ reason: "unknown", after: 0 }, { reason: "unknown", after: 0, info: "Opener" }],
    playlistName: "Pearl Jam – 2026-11-22 – Portland",
    versionId: "g4bd1a2f6",
  };
}

/** The 30 days of the usage table, newest first, from 2026-11-28 down to 2026-10-30. */
export function usageDates(count = 30): string[] {
  const dates: string[] = [];
  for (let i = 0; i < count; i++) {
    dates.push(new Date(Date.UTC(2026, 10, 28 - i)).toISOString().slice(0, 10));
  }
  return dates;
}

/** X9: the admin status answer with all 30 days filled in. */
export function adminStatusAnswer() {
  const perDay = usageDates().map((date, i) => ({ date, created: i === 0 ? 4 : 2, updated: i === 0 ? 1 : 0, opened: 21 + i }));
  return {
    hostAccount: { connected: true, displayName: "playset-host" },
    config: [
      { name: "setlist.fm API key", present: true },
      { name: "Spotify client id", present: true },
      { name: "Host Account id", present: true },
      { name: "Cookie secret", present: false },
    ],
    usage: {
      playlistsMade: 128,
      opens: 1042,
      perDay,
      topArtists: [
        { artist: "Arctic Monkeys", playlistCount: 14 },
        { artist: "Fontaines D.C.", playlistCount: 9 },
      ],
    },
    rateLimitHitsToday: 3,
  };
}

/** X9: a fresh install's admin status. */
export function freshInstallAdminStatus() {
  return {
    hostAccount: { connected: false },
    config: [
      { name: "setlist.fm API key", present: false },
      { name: "Spotify client id", present: false },
      { name: "Host Account id", present: false },
      { name: "Cookie secret", present: false },
    ],
    usage: {
      playlistsMade: 0,
      opens: 0,
      perDay: usageDates().map((date) => ({ date, created: 0, updated: 0, opened: 0 })),
      topArtists: [],
    },
    rateLimitHitsToday: 0,
  };
}
