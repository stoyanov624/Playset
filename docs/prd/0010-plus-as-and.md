# PRD 0010 — "+" is part of a title, not a medley separator; match "+" like "&"

Status: Approved
Slice: 10
Depends on: 0003, 0008
Module: src/core/performances (medley splitting) and src/core/matching (normalisation and searches)

## Problem

PRD 0008 splits a song name at every " + " as well as at every " / ". setlist.fm does not use "+" that way. Its tutorial (https://www.setlist.fm/tutorial) and guidelines (https://www.setlist.fm/guidelines) give " / " (space, slash, space) as the **only** way to write a medley. A slash with no spaces belongs to a real title, such as "White Light/White Heat". "+" is never a medley separator. It appears inside real titles, for example P!nk's "U + Ur Hand" and blink-182's "M+M's". blink-182's medley is written "Dumpweed / M+M's / Josie / Man Overboard". So today a song such as "U + Ur Hand" is wrongly broken into two **Performances**, "U" and "Ur Hand". Neither part exists as a song, and both end up as a **Miss**.

Matching has a second problem with "+". The user saw a song written with "+" on setlist.fm that is written with "&" on Spotify. PRD 0003 turns "&" into "and" but treats "+" as plain punctuation, so "Love + Hate" becomes "love hate" while Spotify's "Love & Hate" becomes "love and hate". They never verify against each other, and the **Performance** becomes a **Miss** even though Spotify has the song. Titles also vary between "&" and "and" from one **Setlist** to the next.

## Goal

A song is split into medley parts only at " / ". A "+" in a song name, with or without spaces, stays part of the title. When matching, "+", "&" and "and" are treated as the same word on both sides, and a title with "+" gets one extra search with "&" in its place for each target artist, so it reaches its **Match** when Spotify writes it with "&".

## Non-goals

- **No splitting on an unspaced "/".** "Love/Hate" and "White Light/White Heat" stay whole, as in PRD 0008 AC-2.
- **No handling of opaque medley names.** A name like "Reggae Medley" or "Acoustic Medley" stays one Performance with that title. Playset does not guess which songs it contains.
- **No other symbol variants.** Only "+", "&" and the word "and" are treated alike. "x" (as in "Artist x Artist"), "n'" / "'n'" (as in "Rock n' Roll"), "with", "feat." in titles and "/" are not turned into "and".
- **No change to snippets.** PRD 0002 AC-9 and PRD 0008 AC-7 are unchanged: a snippet is noted, never split and never added, whatever its name contains.
- **No change to Cover, Tape, guest or position rules.** Parts of a " / " medley inherit the medley's **Cover** and **Tape** flags as in PRD 0008. A guest ("with") is still ignored.
- **No extra query with "+" replaced by "and".** The only extra query uses "&". The plain-text retry keeps the title as given.
- **No change to the artist in queries.** The extra query changes only the title. An artist name containing "+" (for example "Florence + the Machine") is sent as given, and its "+" never triggers the extra query.
- **No fuzzy matching.** "Love + Hate" still does not verify against "Love Hate", "Love/Hate" or "Love, Hate". Strict verification from PRD 0003 stays.
- **No new medley marker rules, prompts or flags.** The `[Medley]` marker, Tape questions, the "Not added" list and the Miss list keep the formats of PRDs 0007 and 0008.

## User stories

- As a concert-goer, I want "U + Ur Hand" to stay one song, so that my **Setlist Playlist** gets the real song instead of two Misses.
- As a concert-goer, I want only real medleys (written with " / ") split, so that I trust that every song in the preview was really played.
- As a concert-goer, I want a song written "Love + Hate" on setlist.fm matched to "Love & Hate" on Spotify, so that a small spelling difference does not cost me a song.
- As a concert-goer, I want "&", "+" and "and" treated alike, so that the same song matches no matter how the setlist.fm editor wrote it.
- As a concert-goer, I want every search that was tried listed for a Miss, including the "&" search, so that I can look the song up by hand.

## Acceptance criteria

Terms from earlier PRDs: "medley name", "medley marker", "part", "snippet" and "noted" as in PRD 0008; "target artist", "normalising", "verifies", "filtered query" and "plain-text retry" as in PRD 0003. "Trimmed" means leading and trailing whitespace removed.

### Turning a Setlist into Performances

- **AC-1** — Given a song that is not a snippet and whose trimmed name contains " / " (one space, slash, one space), when the **Setlist** is turned into Performances, then the song is split at every " / " and nowhere else. Each part is trimmed, empty parts are dropped, the parts keep their order, and they take the song's place as in PRD 0008 AC-1. Each part carries the medley marker with the medley name, and inherits the song's Set label, Cover and Tape flag as in PRD 0008 AC-3 to AC-5.
- **AC-2** — Given a song that is not a snippet, whose trimmed name contains "+" (with or without spaces around it) but not " / ", and whose info does not contain "medley" (any letter case), when the Setlist is turned into Performances, then it is exactly one Performance. Its title is the full trimmed name, "+" included, and it has no medley marker.
- **AC-3** — Given a song that is not a snippet and whose trimmed name contains both " / " and "+", when the Setlist is turned into Performances, then it is split only at " / " (AC-1). A part that contains "+" keeps it in its title and is not split further. Every part carries the full medley name as its medley marker.
- **AC-4** — Given a song that is not a snippet, whose info contains "medley" (any letter case) and whose trimmed name does not contain " / ", when the Setlist is turned into Performances, then it is exactly one Performance whose title is the trimmed name and whose medley marker is that same title (PRD 0008 AC-6). This holds when the name contains "+", with or without spaces.
- **AC-5** — Given a Tape song whose trimmed name contains "+" but not " / ", and neither `--tapes` nor `--no-tapes`, when `playset` runs, then exactly one Tape question is asked for it, showing its full title with "+", in the format of PRD 0007 AC-12. The Tape list (PRD 0002 AC-5) contains that full title once.
- **AC-6** — Given a kept Performance from AC-2, when the preview is shown, then its row shows its full title with "+" and no `Medley` marker. Given a kept Performance from AC-3 or AC-4, then its row shows `Medley` as in PRD 0008 AC-10. Every count in the run (Performances, Tapes, progress steps, tracks, Misses) counts a "+" song from AC-2 or AC-4 as one Performance.

### Matching

- **AC-7** — Given any name or title, when it is normalised for verification, then these steps run in this order:
  1. for a title only, recognised version suffixes are removed from the end (PRD 0003 AC-3);
  2. letters are case-folded, and accents and diacritics are removed;
  3. every "&" and every "+" is replaced by " and " (a space, the word "and", a space);
  4. apostrophes (`'` and `’`) are deleted;
  5. every other punctuation character is replaced by a space;
  6. runs of whitespace are collapsed into one space, and the result is trimmed.

  The same steps are applied, unchanged, to the Performance title, the target artist, and every Spotify track name and artist name.
- **AC-8** — Given a Performance title and a Spotify track name that differ only in writing "+", "&" or the word "and", with or without spaces around the "+" or "&", when the Performance is matched, then the result verifies (as long as its artist verifies too). For example "Love + Hate" verifies against "Love & Hate", "Love and Hate" and "Love+Hate", and "M+M's" verifies against "M+M's" and "M&M's".
- **AC-9** — Given a target artist and a Spotify artist name that differ only in writing "+", "&" or the word "and", when a Performance is matched, then the artist check passes. For example the Artist "Florence + the Machine" passes against Spotify's "Florence and the Machine" and "Florence + The Machine".
- **AC-10** — Given any two strings A and B, when verification compares them, then A verifies against B exactly when B verifies against A. A Performance title written with "&" or "and" verifies against a Spotify track name written with "+", just as a "+" title verifies against an "&" or "and" track name.
- **AC-11** — Given a Performance title with "+" and a Spotify track name that leaves the "+" out or replaces it with another symbol (for example "Love + Hate" against "Love Hate", "Love/Hate", "Love - Hate" or "Love x Hate"), when it is matched, then the result does not verify.
- **AC-12** — Given a Performance whose title contains "+", when it is matched, then the first query for each target artist is the filtered query with the title as given, "+" included (PRD 0003 AC-1), and the plain-text retry, if sent, also keeps the "+" (PRD 0003 AC-9).
- **AC-13** — Given a Performance whose title contains "+", and the filtered query and the plain-text retry for a target artist both produce no verifying result, when it is matched, then exactly one more query is sent for that target artist before anything else: the filtered query `track:"<title>" artist:"<target artist>"` in which every "+" in the title is replaced by "&" and nothing else in the title changes. The target artist is unchanged. It asks for 10 results, double quotes are removed as in PRD 0003 AC-16, and its results are judged by the same rules (PRD 0003 AC-2 to AC-8). Given the filtered query or the plain-text retry for that target artist produced a verifying result, then this query is not sent.
- **AC-14** — Given a Performance whose title contains no "+" (including titles with "&" or "and"), when it is matched, then no "&" query is sent, and at most two queries are sent for each target artist, exactly as in PRD 0003. A "+" that appears only in the Artist or the **Original Artist** never causes an "&" query.
- **AC-15** — Given a **Cover** whose title contains "+", when it is matched, then the queries go in this order, each sent only if no earlier query produced a verifying result: Artist filtered, Artist plain-text retry, Artist "&" query, Original Artist filtered, Original Artist plain-text retry, Original Artist "&" query. A verifying result from the Artist's "&" query is the Match, live or not, and no Original Artist query is sent (preference Artist > Original Artist from PRD 0003 AC-11 is unchanged).
- **AC-16** — Given a Performance whose title contains "+", when no query produces a verifying result, then the outcome is a Miss whose list of queries holds every query sent, in the order sent, "&" queries included. That is exactly 3 queries when it is not a Cover (or is treated as not a Cover under PRD 0003 AC-14), and exactly 6 when it is a Cover.
- **AC-17** — Given a query that contains "+" or "&", when the Spotify search adapter sends it, then the decoded `q` value Spotify receives contains that "+" or "&" character unchanged. A "+" is never received as a space, and an "&" never splits the query string.

## Examples

### Song names → Performances (AC-1 … AC-4)

Each row is the only song of a main Set. "—" means no medley marker.

| setlist.fm song | Artist | Performances (title → medley name) | ACs |
|---|---|---|---|
| `{ "name": "U + Ur Hand" }` | P!nk | 1 U + Ur Hand → — | AC-2 |
| `{ "name": "M+M's" }` | blink-182 | 1 M+M's → — | AC-2 |
| `{ "name": "Love + Hate" }` | Michael Kiwanuka | 1 Love + Hate → — | AC-2 |
| `{ "name": "Release + Alive" }` | Pearl Jam | 1 Release + Alive → — | AC-2 |
| `{ "name": "  Dead Star + In Your World  " }` | Muse | 1 Dead Star + In Your World → — (trimmed) | AC-2 |
| `{ "name": "Me+You" }` | Arctic Monkeys | 1 Me+You → — | AC-2 |
| `{ "name": "Dumpweed / M+M's / Josie / Man Overboard" }` | blink-182 | 1 Dumpweed, 2 M+M's, 3 Josie, 4 Man Overboard, each → "Dumpweed / M+M's / Josie / Man Overboard" | AC-1, AC-3 |
| `{ "name": "A / B + C" }` | Arctic Monkeys | 1 A, 2 B + C, each → "A / B + C" | AC-3 |
| `{ "name": "Map of the Problematique + Stockholm Syndrome / Knights of Cydonia" }` | Muse | 1 Map of the Problematique + Stockholm Syndrome, 2 Knights of Cydonia, each → the full name | AC-3 |
| `{ "name": "Alive /  + Black" }` (two spaces after "/") | Pearl Jam | 1 Alive, 2 + Black, each → "Alive /  + Black" | AC-1, AC-3 |
| `{ "name": "Release / + Outro" }` | Pearl Jam | 1 Release, 2 + Outro, each → "Release / + Outro" (unchanged from PRD 0008) | AC-1 |
| `{ "name": "Porch + Yellow Ledbetter", "info": "Medley" }` | Pearl Jam | 1 Porch + Yellow Ledbetter → "Porch + Yellow Ledbetter" | AC-4 |
| `{ "name": "Love/Hate + Black", "info": "MEDLEY" }` | Pearl Jam | 1 Love/Hate + Black → "Love/Hate + Black" | AC-4 |
| `{ "name": "U + Ur Hand", "cover": { "mbid": "f4d5cc07-3bc9-4836-9b15-88a08359bc63", "name": "P!nk" } }` | Walk the Moon | 1 U + Ur Hand → —, Original Artist P!nk | AC-2 |
| `{ "name": "Even Flow + Alive", "info": "Teaser" }` | Pearl Jam | none; noted "Even Flow + Alive" (snippet, after 0) | snippet unchanged |
| `{ "name": "Intro + Release", "tape": true }` | Pearl Jam | 1 Intro + Release → —, Tape; Tape list `["Intro + Release"]` | AC-2, AC-5 |

### Fixture M revisited — PRD 0008's Fixture M under the new rules (AC-1 … AC-4)

The setlist.fm JSON of PRD 0008 Fixture M is unchanged. Expected Performances (Artist "Pearl Jam" on every row):

| Position | Title | Set label | Tape | Original Artist | Medley name | ACs |
|---|---|---|---|---|---|---|
| 1 | Interstellar Overdrive | main | yes | Pink Floyd | Interstellar Overdrive / Astronomy Domine | AC-1 |
| 2 | Astronomy Domine | main | yes | Pink Floyd | Interstellar Overdrive / Astronomy Domine | AC-1 |
| 3 | Release | main | no | — | — | |
| 4 | Daughter | main | no | — | Daughter / W.M.A. | AC-1 |
| 5 | W.M.A. | main | no | — | Daughter / W.M.A. | AC-1 |
| 6 | Even Flow + Alive | main | no | — | Even Flow + Alive / Black | AC-3 |
| 7 | Black | main | no | — | Even Flow + Alive / Black | AC-3 |
| 8 | Jeremy | main | no | — | Jeremy | AC-4 (info only) |
| 9 | Love/Hate | main | no | — | — | |
| 10 | Baba O'Riley | Encore 1 | no | The Who | Baba O'Riley / Won't Get Fooled Again | AC-1 |
| 11 | Won't Get Fooled Again | Encore 1 | no | The Who | Baba O'Riley / Won't Get Fooled Again | AC-1 |
| 12 | Black | Encore 1 | no | — | — | repeat of #7 |
| 13 | Porch + Yellow Ledbetter | Encore 1 | no | — | Porch + Yellow Ledbetter | AC-4 |

Noted songs: `Kashmir / Whole Lotta Love` (snippet, main, after 8). Tape list: `["Interstellar Overdrive", "Astronomy Domine"]`.

### P1 revisited — preview for Fixture M (AC-6, AC-13, AC-16)

`playset https://www.setlist.fm/setlist/pearl-jam/2026/johan-cruijff-arena-amsterdam-netherlands-5bf2a3c4.html`, with a cached token, answering `y` for "Interstellar Overdrive" and `n` for "Astronomy Domine". The fake Spotify gives the same Match as PRD 0008 P1 for every kept Performance of the same title. For the two "+" Performances it returns, for every query, only `"Even Flow"` / `"Alive"` / `"Porch"` / `"Yellow Ledbetter"` by Pearl Jam, none of which verify. The queries sent for "Even Flow + Alive" are:

1. `track:"Even Flow + Alive" artist:"Pearl Jam"`
2. `Even Flow + Alive Pearl Jam`
3. `track:"Even Flow & Alive" artist:"Pearl Jam"`

and for "Porch + Yellow Ledbetter":

1. `track:"Porch + Yellow Ledbetter" artist:"Pearl Jam"`
2. `Porch + Yellow Ledbetter Pearl Jam`
3. `track:"Porch & Yellow Ledbetter" artist:"Pearl Jam"`

```
Pearl Jam – 2026-07-08 – Johan Cruijff ArenA, Amsterdam
https://www.setlist.fm/setlist/pearl-jam/2026/johan-cruijff-arena-amsterdam-netherlands-5bf2a3c4.html
13 Performances, 2 Tapes

? Add the Tape "Interstellar Overdrive" (Pink Floyd) to the playlist? (y/N) y
? Add the Tape "Astronomy Domine" (Pink Floyd) to the playlist? (y/N) n

Finding Matches 1/12: Interstellar Overdrive
Finding Matches 2/12: Release
...
Finding Matches 12/12: Porch + Yellow Ledbetter

main
   1. Interstellar Overdrive [Tape, Medley, Cover of Pink Floyd]
      → Interstellar Overdrive — Pink Floyd · The Piper at the Gates of Dawn
   2. Release
      → Release — Pearl Jam · Ten
   3. Daughter [Medley]
      → Daughter — Pearl Jam · Vs.
   4. W.M.A. [Medley]
      → W.M.A. — Pearl Jam · Vs.
   5. Even Flow + Alive [Medley]
      → Miss
   6. Black [Medley]
      → Black — Pearl Jam · Ten
   7. Jeremy [Medley]
      → Jeremy — Pearl Jam · Ten
   8. Love/Hate
      → Miss
Encore 1
   9. Baba O'Riley [Medley, Cover of The Who]
      → Baba O'Riley — The Who · Who's Next
  10. Won't Get Fooled Again [Medley, Cover of The Who]
      → Won't Get Fooled Again — The Who · Who's Next
  11. Black
      → Black — Pearl Jam · Ten
  12. Porch + Yellow Ledbetter [Medley]
      → Miss

Not added:
  Astronomy Domine (Tape, left out)
  Kashmir / Whole Lotta Love (snippet)

Playlist: Pearl Jam – 2026-07-08 – Amsterdam (private)
9 tracks, 3 Misses

? Create this playlist? (y/N) y

Created "Pearl Jam – 2026-07-08 – Amsterdam" with 9 tracks.

3 Misses (not in the playlist):
  Even Flow + Alive — Pearl Jam
  Love/Hate — Pearl Jam
  Porch + Yellow Ledbetter — Pearl Jam

https://open.spotify.com/playlist/2KlMnOpQrStUvWxYzAbCdE
```

Exit code 0. The add-items request carries 9 URIs, in kept order #1–#4, #6, #7, #9, #10, #11. `5Xak5fmy089t0FYmh3VJiY` (Black) appears twice. With `--tapes`, "Astronomy Domine" is kept Performance #2, progress runs to 13/13, and the playlist has 10 tracks. In the core (PRD 0008 AC-11), preview row 5 carries the medley name "Even Flow + Alive / Black", row 12 carries "Porch + Yellow Ledbetter", and rows 2, 8 and 11 carry none.

### Normalisation table (AC-7, AC-8, AC-9, AC-10, AC-11)

| Input | Normalised |
|---|---|
| `Love + Hate` | `love and hate` |
| `Love+Hate` | `love and hate` |
| `Love & Hate` | `love and hate` |
| `Love and Hate` | `love and hate` |
| `U + Ur Hand` | `u and ur hand` |
| `M+M's` | `m and ms` |
| `M&M's` | `m and ms` |
| `Florence + the Machine` | `florence and the machine` |
| `Florence and the Machine` | `florence and the machine` |
| `Simon & Garfunkel` | `simon and garfunkel` |
| `P!nk` | `p nk` |
| `Love Hate` | `love hate` (does not equal `love and hate`, AC-11) |
| `Love/Hate` | `love hate` (does not equal `love and hate`, AC-11) |
| `Love x Hate` | `love x hate` (no "x" variant, Non-goals) |
| `M+M's - Remastered 2011` (track name) | `m and ms` (suffix removed first) |

Pairs that verify both ways (AC-10): `Love + Hate` ↔ `Love & Hate`, `Love + Hate` ↔ `Love and Hate`, `Love & Hate` ↔ `Love+Hate`, `M+M's` ↔ `M&M's`. Normalisation is one fixed function applied to both sides, and verification compares the two results for equality, so the order of the two sides never matters.

### X1 — "Love + Hate" verifies by normalisation alone (AC-8, AC-12)

Performance: `{ "title": "Love + Hate", "artist": "Michael Kiwanuka" }`

Query 1: `track:"Love + Hate" artist:"Michael Kiwanuka"` (10 results requested)

```json
{ "tracks": { "items": [
  { "uri": "spotify:track:1kLqvSbhE2uUuS5WkzYcXy", "id": "1kLqvSbhE2uUuS5WkzYcXy",
    "name": "Love & Hate",
    "artists": [ { "name": "Michael Kiwanuka" } ],
    "album": { "name": "Love & Hate" } }
] } }
```

Outcome: Match `{ uri: "spotify:track:1kLqvSbhE2uUuS5WkzYcXy", id: "1kLqvSbhE2uUuS5WkzYcXy", name: "Love & Hate", artists: ["Michael Kiwanuka"], album: "Love & Hate", live: false }`. One query sent. No plain-text retry, no "&" query.

### X2 — "Love + Hate" verifies through the "&" query (AC-12, AC-13)

Performance: `{ "title": "Love + Hate", "artist": "Michael Kiwanuka" }`

| # | Query sent | Fake results | Verifies? |
|---|------------|--------------|-----------|
| 1 | `track:"Love + Hate" artist:"Michael Kiwanuka"` | `{ "tracks": { "items": [] } }` | — |
| 2 | `Love + Hate Michael Kiwanuka` | `"Cold Little Heart"` by Michael Kiwanuka, album "Love & Hate" | no (title) |
| 3 | `track:"Love & Hate" artist:"Michael Kiwanuka"` | `"Love & Hate"` by Michael Kiwanuka, album "Love & Hate", id `1kLqvSbhE2uUuS5WkzYcXy` | yes |

Outcome: Match on `1kLqvSbhE2uUuS5WkzYcXy`, `live: false`. Exactly 3 queries.

### X3 — "U + Ur Hand" and "M+M's" verify against Spotify's spelling (AC-8)

Performance `{ "title": "U + Ur Hand", "artist": "P!nk" }`, query 1 `track:"U + Ur Hand" artist:"P!nk"`:

```json
{ "tracks": { "items": [
  { "uri": "spotify:track:2Ff2ZBt7BnWuN5wRpEhzxN", "id": "2Ff2ZBt7BnWuN5wRpEhzxN",
    "name": "U + Ur Hand",
    "artists": [ { "name": "P!nk" } ],
    "album": { "name": "I'm Not Dead" } }
] } }
```

Outcome: Match on `2Ff2ZBt7BnWuN5wRpEhzxN`, one query.

Performance `{ "title": "M+M's", "artist": "blink-182" }`, query 1 `track:"M+M's" artist:"blink-182"`. Each of these single-item result lists gives a Match after one query:

- `{ "uri": "spotify:track:6gLqSwvK3pRzzWZGOS3e4W", "id": "6gLqSwvK3pRzzWZGOS3e4W", "name": "M+M's", "artists": [ { "name": "blink-182" } ], "album": { "name": "Cheshire Cat" } }`
- `{ "uri": "spotify:track:6gLqSwvK3pRzzWZGOS3e4W", "id": "6gLqSwvK3pRzzWZGOS3e4W", "name": "M&M's", "artists": [ { "name": "blink-182" } ], "album": { "name": "Cheshire Cat" } }`

### X4 — symmetric: an "&" title verifies against a "+" track (AC-10, AC-14)

Performance `{ "title": "Love & Hate", "artist": "Michael Kiwanuka" }`, query 1 `track:"Love & Hate" artist:"Michael Kiwanuka"` returns a track named `"Love + Hate"` by Michael Kiwanuka: it verifies, one query. Performance `{ "title": "Love and Hate", "artist": "Michael Kiwanuka" }` against the same track: it verifies.

If every search for `{ "title": "Love & Hate", "artist": "Michael Kiwanuka" }` returns nothing, the outcome is a Miss with exactly 2 queries (`track:"Love & Hate" artist:"Michael Kiwanuka"`, `Love & Hate Michael Kiwanuka`). No "&" query, because the title has no "+".

### X5 — artist names with "+" (AC-9, AC-14)

Performance `{ "title": "Dog Days Are Over", "artist": "Florence + the Machine" }`, query 1 `track:"Dog Days Are Over" artist:"Florence + the Machine"`:

```json
{ "tracks": { "items": [
  { "uri": "spotify:track:1A8j0qRUvYBXkmT8mWj8Gt", "id": "1A8j0qRUvYBXkmT8mWj8Gt",
    "name": "Dog Days Are Over",
    "artists": [ { "name": "Florence + The Machine" } ],
    "album": { "name": "Lungs" } }
] } }
```

Outcome: Match. The same result with the artist written `"Florence and the Machine"` also verifies. If every search returns nothing, the Miss lists exactly 2 queries: the "+" is in the Artist, not the title.

### X6 — Miss for a "+" title, not a Cover (AC-11, AC-13, AC-16)

Performance: `{ "title": "Release + Alive", "artist": "Pearl Jam" }`

| # | Query sent | Fake results |
|---|------------|--------------|
| 1 | `track:"Release + Alive" artist:"Pearl Jam"` | `"Release"` by Pearl Jam, album "Ten"; `"Alive"` by Pearl Jam, album "Ten" |
| 2 | `Release + Alive Pearl Jam` | `"Release"` by Pearl Jam; `"Alive"` by Pearl Jam |
| 3 | `track:"Release & Alive" artist:"Pearl Jam"` | `{ "tracks": { "items": [] } }` |

Outcome: Miss `{ title: "Release + Alive", artist: "Pearl Jam", queries: ["track:\"Release + Alive\" artist:\"Pearl Jam\"", "Release + Alive Pearl Jam", "track:\"Release & Alive\" artist:\"Pearl Jam\""] }`.

Also not verifying: a track named `"Release Alive"` or `"Release/Alive"` by Pearl Jam (AC-11).

### X7 — Cover with a "+" title: order of target artists (AC-13, AC-15, AC-16)

Performance (Cover): `{ "title": "U + Ur Hand", "artist": "Walk the Moon", "originalArtist": "P!nk" }`

| # | Query sent | Fake results | Verifies? |
|---|------------|--------------|-----------|
| 1 | `track:"U + Ur Hand" artist:"Walk the Moon"` | `[]` | — |
| 2 | `U + Ur Hand Walk the Moon` | `"Shut Up and Dance"` by Walk the Moon | no |
| 3 | `track:"U & Ur Hand" artist:"Walk the Moon"` | `[]` | — |
| 4 | `track:"U + Ur Hand" artist:"P!nk"` | `"U + Ur Hand"` by P!nk, album "I'm Not Dead", id `2Ff2ZBt7BnWuN5wRpEhzxN` | yes |

Outcome: Match on `2Ff2ZBt7BnWuN5wRpEhzxN`. No 5th query.

Variant: query 3 instead returns `"U & Ur Hand - Live"` by Walk the Moon, album "Live at the Fillmore". Outcome: Match on that track with `live: true`, and no P!nk query is sent (AC-15).

Variant: every query returns `[]`. Outcome: Miss with 6 queries, in order:
1. `track:"U + Ur Hand" artist:"Walk the Moon"`
2. `U + Ur Hand Walk the Moon`
3. `track:"U & Ur Hand" artist:"Walk the Moon"`
4. `track:"U + Ur Hand" artist:"P!nk"`
5. `U + Ur Hand P!nk`
6. `track:"U & Ur Hand" artist:"P!nk"`

### X8 — Original Artist same as Artist (AC-16)

`{ "title": "M+M's", "artist": "blink-182", "originalArtist": "Blink-182" }`, every query returns `[]`: Miss with exactly 3 queries (`track:"M+M's" artist:"blink-182"`, `M+M's blink-182`, `track:"M&M's" artist:"blink-182"`), none repeated.

### X9 — Double quotes and several "+" (AC-13)

Performance `{ "title": "\"A\" + B + C", "artist": "Muse" }`, no verifying result. Queries: `track:"A + B + C" artist:"Muse"`, `A + B + C Muse`, `track:"A & B & C" artist:"Muse"`.

### X10 — Adapter keeps "+" and "&" (AC-17)

Query `track:"Love & Hate" artist:"Michael Kiwanuka"` with token `BQD-test-token` sends one `GET` whose decoded parameters are exactly `q` = `track:"Love & Hate" artist:"Michael Kiwanuka"`, `type` = `track`, `limit` = `10`. For example:

```
GET https://api.spotify.com/v1/search?q=track%3A%22Love%20%26%20Hate%22%20artist%3A%22Michael%20Kiwanuka%22&type=track&limit=10
```

Query `track:"M+M's" artist:"blink-182"` is received with decoded `q` = `track:"M+M's" artist:"blink-182"` (the "+" is sent as `%2B`, never as a raw "+" that would decode to a space).

### AC coverage

| AC | Examples |
|---|---|
| AC-1 | Song names table (Dumpweed, Alive /  + Black, Release / + Outro), Fixture M revisited |
| AC-2 | Song names table (U + Ur Hand, M+M's, Love + Hate, Release + Alive, Dead Star, Me+You, Walk the Moon cover, Intro + Release) |
| AC-3 | Song names table (A / B + C, Map of the Problematique, Dumpweed), Fixture M revisited (#6–7) |
| AC-4 | Song names table (Porch + Yellow Ledbetter, Love/Hate + Black), Fixture M revisited (#8, #13) |
| AC-5 | Song names table (Intro + Release) |
| AC-6 | P1 revisited |
| AC-7 | Normalisation table |
| AC-8 | Normalisation table, X1, X3 |
| AC-9 | Normalisation table, X5 |
| AC-10 | Normalisation table, X4 |
| AC-11 | Normalisation table, X6 |
| AC-12 | X1, X2 |
| AC-13 | X2, X6, X7, X9, P1 revisited |
| AC-14 | X4, X5 |
| AC-15 | X7 |
| AC-16 | X6, X7, X8, P1 revisited |
| AC-17 | X10 |

## Changes to earlier PRDs

This PRD changes behaviour that PRDs 0003 and 0008 defined. Where they disagree, this PRD wins.

**PRD 0008 — Split medleys into Performances**

- **Goal** — "joins several songs with ' / ' or ' + '" becomes "joins several songs with ' / '".
- **Non-goal "No splitting on other separators"** — "+" in any form, with or without spaces, is now among the characters that never split a song. Only " / " splits.
- **AC-1 is amended** by AC-1 and AC-3 here: the name is split only at " / ".
- **AC-2 is amended** by AC-2 here: a name with "+", spaced or not, is one Performance with no medley marker (unless its info says "medley", AC-4 here).
- **AC-6 is amended** by AC-4 here: the condition "contains neither ' / ' nor ' + '" becomes "does not contain ' / '", and "does contain ' / ' or ' + '" becomes "does contain ' / '".
- **AC-7** — the words "or ' + '" are dropped. Snippets still win, unchanged.
- **AC-3, AC-4, AC-5, AC-8 to AC-15 stay as written.**
- **Examples:**
  - **Fixture M** — the expected Performances and noted songs are replaced by "Fixture M revisited" above (13 Performances instead of 15; Kashmir is noted after 8 instead of 9).
  - **Fixture N** — the rows `Dead Star + In Your World`, `Map of the Problematique + Stockholm Syndrome / Knights of Cydonia` and `Alive /  + Black` are replaced by the rows of the same names in the song names table above. The other Fixture N rows are unchanged.
  - **P1** — replaced by "P1 revisited" above (13 Performances, 12 kept, 9 tracks, 3 Misses).
  - **AC coverage** — the Fixture M and Fixture N references now point at the revisited rows.
  - Fixture A revisited, Fixture D revisited, P2 and P3 are unchanged.

**PRD 0003 — Find the Match for one Performance**

- **Definition of "normalising" a name** is replaced by AC-7 here: "&" and "+" both become " and " (with spaces) before apostrophes are deleted and other punctuation becomes a space. Side effect, accepted: a "+" no longer normalises to a plain space, so "Love + Hate" no longer verifies against "Love Hate" (AC-11 here); and an unspaced "&" next to letters now becomes a separate word, so "R&B" normalises to "r and b" and no longer equals "RandB".
- **AC-4 is amended** by AC-8, AC-9 and AC-10 here: "+" joins "&" and "and" as equivalent, in titles and artist names, on both sides.
- **AC-9 is amended** by AC-13 here: after the plain-text retry, a "+" title gets exactly one "&" query for the same target artist. The rule "exactly one plain-text retry" is unchanged.
- **AC-10 is amended** by AC-15 here: "the same two searches" becomes "the same searches", which for a "+" title includes the "&" query.
- **AC-12 is amended** by AC-16 here: a Miss that is not a Cover has exactly two queries, or exactly three when the title contains "+".
- **AC-13 is amended**: the list of queries includes "&" queries (AC-16 here).
- **AC-19 is clarified** by AC-17 here: "+" and "&" must be URL-encoded so that Spotify receives them as written.
- **AC-1, AC-2, AC-3, AC-5 to AC-8, AC-11, AC-14 to AC-18, AC-20 and AC-21 stay as written.** All of PRD 0003's examples E1–E18 are unchanged, since none has a "+" in a title or artist name.

**Tests.** Existing tests that expect a song to be split at " + " must be changed in this Slice, openly, in its PR. That includes the tests for PRD 0008 AC-1, AC-2, AC-6 and AC-7 that use " + ", PRD 0008 Fixture M (rows 6–8 and 14–15, and Kashmir's "played after"), the Fixture N rows named above, every case built on P1 (counts, progress, rows, add-items URIs, Miss list), and any other case with a " + " name such as "Release + Alive" or "Porch + Yellow Ledbetter". Tests for PRD 0003 that rely on "+" normalising to a space, if any exist, change the same way. Each changed test must cite the AC of this PRD that now governs it.

## Glossary terms used

- **Setlist** — as defined in GLOSSARY.md.
- **Artist** — as defined in GLOSSARY.md.
- **Set** — as defined in GLOSSARY.md.
- **Encore** — as defined in GLOSSARY.md (through the "Encore 1" Set label in the examples).
- **Performance** — as defined in GLOSSARY.md.
- **Tape** — as defined in GLOSSARY.md.
- **Cover** — as defined in GLOSSARY.md.
- **Original Artist** — as defined in GLOSSARY.md.
- **Setlist Playlist** — as defined in GLOSSARY.md.
- **Match** — as defined in GLOSSARY.md.
- **Miss** — as defined in GLOSSARY.md.

"Medley", "part", "medley name", "medley marker", "snippet", "noted", "preview", "kept Performance" (PRDs 0007, 0008) and "target artist", "normalising", "verifies", "filtered query", "plain-text retry" (PRD 0003) keep their meanings from those PRDs. "'&' query" is used in its plain sense for the extra query of AC-13. None of these are glossary terms, and no new glossary term is proposed.

## Shared-file requests

For the orchestrator (this Slice does not edit shared files):

- **CLAUDE.md** — under "Product rules":
  - In the Tapes/medley bullet, replace `Medleys are always split: a name containing " / " or " + " (space on both sides) becomes one Performance per part …` with `Medleys are always split: a name containing " / " (space on both sides; setlist.fm's only medley separator) becomes one Performance per part …`, and add: `"+" never splits a song; it is part of titles such as "U + Ur Hand" or "M+M's".` The rest of the bullet stays.
  - Replace the Match bullet with: `Match: strict normalised artist + title ("&", "+" and "and" count as the same word); prefer studio, live only as fallback. A title with "+" gets one extra filtered search per target artist with "+" replaced by "&". Cover → Artist's version first, then Original Artist. Otherwise Miss; list Misses (with every query tried) at end.`
- **docs/PLAN.md** — add the Slice row `| 10 | '+' is part of a title, not a medley separator; match '+' like '&' | 3, 8 |`, and make Wave 5 = Slices 9, 10. Optionally reword row 8 to `Split medleys into Performances (' / ')`, with a note that " + " was dropped by Slice 10.
- **GLOSSARY.md** — no change.
- **src/core/index.ts** — no change. No new entry point and no new shape.
- **docs/prd/0003-matching.md and docs/prd/0008-medley-split.md** — optionally add a line under their Status: "Partly superseded by PRD 0010 ('+' in titles)."

## Open questions

(none)
