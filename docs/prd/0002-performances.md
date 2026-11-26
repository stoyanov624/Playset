# PRD 0002 — Turn a Setlist into Performances

Status: Approved
Slice: 2
Depends on: none
Module: src/core/performances

## Problem

setlist.fm returns a **Setlist** as nested JSON: one or more **Sets**, each with its own list of songs, some marked as a **Tape**, some carrying a **Cover**, a guest or a free-text note. Nothing in Playset yet turns that shape into the flat, played-order list of **Performances** that matching and playlist creation need. Without it, later steps would each have to re-read the raw JSON, and would disagree about **Encores**, repeated songs, snippets and medleys.

## Goal

Given one setlist.fm Setlist (as returned by the setlist.fm "get setlist" API), Playset produces, with no network and no prompting:

- every **Performance** in played order across all Sets, Encores included in position, each flagged as a Tape or not and carrying its **Original Artist** when it is a Cover;
- a separate list of noted songs (snippets/teasers and medleys) that never become Performances;
- the **Show** details later steps need: Artist name, date (YYYY-MM-DD), city, venue and setlist.fm URL.

## Non-goals

- **No medley splitting.** Medleys are only noted, never split into separate Performances and never added to the **Setlist Playlist** by default. This supersedes the CLAUDE.md product rule "Medleys split best-effort" (see Shared-file requests).
- **No Tape choice.** Tapes are flagged and listed; asking the user which Tapes to keep (and the `--tapes` / `--no-tapes` flags) belongs to a later Slice.
- **No network.** Fetching the Setlist from setlist.fm, and finding the **Latest Setlist** for an Artist (including skipping empty placeholder Setlists), belong to other Slices.
- **No Spotify.** No **Match**, no **Miss**, no playlist naming or creation.
- **No prompting or printing.** Nothing is shown to the user by this module.
- **No guest handling.** A guest performer ("with") is ignored entirely; it does not change the Performance or its Artist.
- **No title clean-up beyond trimming.** Titles are not normalised (case, punctuation, "(Live)" suffixes); normalisation for matching belongs to the Match Slice.
- **No validation of malformed API responses** (for example a missing Artist or an unparseable date). Input is assumed to be a well-formed setlist.fm Setlist object.
- **No de-duplication.** A song played twice is never collapsed into one.

## User stories

- As a concert-goer, I want every song the Artist played, in the order they played it, including Encores and repeats, so that my Setlist Playlist feels like the Show.
- As a concert-goer, I want intros and outros recognised as Tapes, so that I can later choose whether they go in the playlist.
- As a concert-goer, I want Covers to remember their Original Artist, so that a Match can still be found if the Artist never recorded the song.
- As a concert-goer, I want brief snippets/teasers and medleys kept out of the playlist but still noted, so that the playlist only has full songs and I can still see what was left out.

## Acceptance criteria

Positions below are 1-based and count only Performances, in played order across the whole Setlist.

- **AC-1** — Given a Setlist with several Sets (main set, a named Set and one or more Encores), when it is turned into Performances, then the Performances appear in the order the Sets and songs are listed in the Setlist, Encores included in their played position, and their positions run 1, 2, 3 … with no gaps.
- **AC-2** — Given a Setlist, when it is turned into Performances, then each Performance carries the label of the Set it came from: "main" for a Set with no name and no encore number, the Set's own name for a named Set, and "Encore n" for a Set with encore number n (the encore number wins if a Set has both a name and an encore number).
- **AC-3** — Given a Setlist in which the same song is played twice, when it is turned into Performances, then there are two Performances with that title, each at its own position.
- **AC-4** — Given a Setlist containing songs marked as tape, when it is turned into Performances, then each such song is a Performance flagged as a Tape, and every other Performance is flagged as not a Tape.
- **AC-5** — Given a Setlist containing Tapes, when the Tapes are listed, then the result is the titles of the Tape Performances in played order (a Tape played twice is listed twice); given a Setlist with no Tapes, the list is empty.
- **AC-6** — Given a song with a cover artist name, when it is turned into a Performance, then the Performance's Original Artist is that name; given a song with no cover, or a cover with an empty or missing name, then the Performance has no Original Artist. In every case the Performance's Artist is the Setlist's Artist.
- **AC-7** — Given a song with a guest ("with"), when it is turned into a Performance, then the Performance is identical to the same song without a guest: same title, same Artist, no guest recorded.
- **AC-8** — Given a song whose name is missing, empty or only whitespace, when the Setlist is turned into Performances, then that song produces neither a Performance nor a noted song and does not use up a position; given a song name with leading or trailing whitespace, then the Performance title has that whitespace removed.
- **AC-9** — Given a song whose info contains "snippet" anywhere (any letter case), or whose info starts with "tease" (any letter case, ignoring leading whitespace, so "Teaser" and "Tease of …" also count, meaning the song itself was only teased), when the Setlist is turned into Performances, then that song is not a Performance and appears in the noted list with reason "snippet". Given a song whose info mentions "tease" anywhere other than the start (for example "with 'Hey Jude' tease" or "includes 'Crazy Mary' tease"), then the song was played in full and is a normal Performance, not noted.
- **AC-10** — Given a song whose name contains " / " (space, slash, space) or whose info contains "medley" (any letter case), when the Setlist is turned into Performances, then that song is not a Performance, is not split, and appears once in the noted list with reason "medley" and its full raw name.
- **AC-11** — Given noted songs, when the Setlist is turned into Performances, then each noted song records its raw name, its reason ("snippet" or "medley"), its Set label, and the position of the Performance it was played after (0 if it came before the first Performance), listed in played order; a song that is both a snippet and a medley is noted once, with reason "snippet"; this applies to songs marked as tape too.
- **AC-12** — Given a Setlist, when it is turned into Performances, then the result also includes the Show details: Artist name, date converted from "dd-MM-yyyy" to "YYYY-MM-DD", city name, venue name and the setlist.fm URL, all exactly as given (apart from the date format).
- **AC-13** — Given a Setlist with no Sets, an empty list of Sets, or Sets with no songs, when it is turned into Performances, then the Performances, the noted songs and the Tape list are all empty, no error occurs, and the Show details are still present.
- **AC-14** — Given the same Setlist turned into Performances twice, then both results are equal, and the input Setlist is unchanged afterwards.

## Examples

### Fixture A — full Show (used by AC-1 … AC-12, AC-14)

```json
{
  "id": "63a5e2b7",
  "eventDate": "23-08-2025",
  "artist": {
    "mbid": "ada7a83c-e3e1-40f1-93f9-3e73dbfd2c7c",
    "name": "Arctic Monkeys"
  },
  "venue": {
    "id": "6bd6ca6e",
    "name": "Ziggo Dome",
    "city": {
      "id": "2759794",
      "name": "Amsterdam",
      "country": { "code": "NL", "name": "Netherlands" }
    }
  },
  "url": "https://www.setlist.fm/setlist/arctic-monkeys/2025/ziggo-dome-amsterdam-netherlands-63a5e2b7.html",
  "sets": {
    "set": [
      {
        "song": [
          { "name": "I Want It All", "tape": true,
            "cover": { "mbid": "0383dadf-2a4e-4d10-a46a-e9e041da8eb3", "name": "Queen" } },
          { "name": "Sculptures of Anything Goes" },
          { "name": " Brianstorm " },
          { "name": "Hey Jude", "info": "snippet",
            "cover": { "mbid": "b10bbbfc-cf9e-42e0-be17-e2c3e1d2600d", "name": "The Beatles" } },
          { "name": "Don't Sit Down 'Cause I've Moved Your Chair",
            "with": { "mbid": "a1f4c4ae-1c6b-4a2e-9a6e-3b3a2f6f2e1c", "name": "Miles Kane" } },
          { "name": "505" }
        ]
      },
      {
        "name": "Acoustic",
        "song": [
          { "name": "Mardy Bum" },
          { "name": "Teddy Picker / Crying Lightning" },
          { "name": "Cornerstone", "info": "Medley with 'Fluorescent Adolescent'" },
          { "name": "   " }
        ]
      },
      {
        "encore": 1,
        "song": [
          { "name": "I Wanna Be Yours" },
          { "name": "505", "info": "Reprise" },
          { "name": "Baby, I'm Yours",
            "cover": { "mbid": "3c3a2c0d-5c7e-4c2a-8f62-0a2b1f0f5e11", "name": "Barbara Lewis" } }
        ]
      },
      {
        "encore": 2,
        "song": [
          { "name": "R U Mine?" },
          { "name": "Mr. Blue Sky", "tape": true,
            "cover": { "mbid": "0e3ec3a2-6d1c-4b7e-8a3b-3f9c3b9d2f33", "name": "Electric Light Orchestra" } }
        ]
      }
    ]
  }
}
```

Expected Performances (Artist is "Arctic Monkeys" for every row):

| Position | Title | Set label | Tape | Original Artist | ACs |
|---|---|---|---|---|---|
| 1 | I Want It All | main | yes | Queen | AC-1, AC-4, AC-6 |
| 2 | Sculptures of Anything Goes | main | no | — | AC-1 |
| 3 | Brianstorm | main | no | — | AC-8 (trimmed) |
| 4 | Don't Sit Down 'Cause I've Moved Your Chair | main | no | — | AC-7 (guest ignored) |
| 5 | 505 | main | no | — | AC-3 |
| 6 | Mardy Bum | Acoustic | no | — | AC-2 |
| 7 | I Wanna Be Yours | Encore 1 | no | — | AC-1, AC-2 |
| 8 | 505 | Encore 1 | no | — | AC-3 (repeat) |
| 9 | Baby, I'm Yours | Encore 1 | no | Barbara Lewis | AC-6 |
| 10 | R U Mine? | Encore 2 | no | — | AC-2 |
| 11 | Mr. Blue Sky | Encore 2 | yes | Electric Light Orchestra | AC-4, AC-6 |

The song named `"   "` produces nothing and position 7 follows 6 directly (AC-8).

Expected noted songs (AC-9, AC-10, AC-11):

| Raw name | Reason | Set label | Played after position |
|---|---|---|---|
| Hey Jude | snippet | main | 3 |
| Teddy Picker / Crying Lightning | medley | Acoustic | 6 |
| Cornerstone | medley | Acoustic | 6 |

Expected Tape list (AC-5): `["I Want It All", "Mr. Blue Sky"]`.

Expected Show details (AC-12):

| Field | Value |
|---|---|
| Artist | Arctic Monkeys |
| Date | 2025-08-23 |
| City | Amsterdam |
| Venue | Ziggo Dome |
| URL | https://www.setlist.fm/setlist/arctic-monkeys/2025/ziggo-dome-amsterdam-netherlands-63a5e2b7.html |

AC-14: turning Fixture A into Performances twice gives equal results, and Fixture A is unchanged.

### Fixture B — encore with a name (AC-2)

```json
{ "encore": 1, "name": "Encore:", "song": [ { "name": "Black" } ] }
```

→ one Performance "Black" with Set label "Encore 1" (not "Encore:").

### Fixture C — snippet wording, letter case, and teases inside full songs (AC-9)

```json
{ "song": [
  { "name": "Smells Like Teen Spirit", "info": "TEASE" },
  { "name": "Seven Nation Army", "info": "Teaser" },
  { "name": "Wonderwall", "info": "acoustic, Snippet only" },
  { "name": "Alive", "info": "Extended outro" },
  { "name": "Black", "info": "with 'Hey Jude' tease" },
  { "name": "Jeremy", "info": "includes 'Crazy Mary' tease" },
  { "name": "Porch", "info": "  Tease of 'Interstellar Overdrive'" }
] }
```

→ three Performances, all main: 1 "Alive", 2 "Black", 3 "Jeremy". "Black" and "Jeremy" stay normal Performances because their info mentions a tease of another song but does not start with "tease".
Noted, in order: "Smells Like Teen Spirit" (snippet, after 0), "Seven Nation Army" (snippet, after 0), "Wonderwall" (snippet, after 0, because "snippet" counts anywhere in the info), "Porch" (snippet, after 3, because leading whitespace is ignored).

### Fixture D — medley by info, letter case, and snippet precedence (AC-10, AC-11)

```json
{ "song": [
  { "name": "Even Flow" },
  { "name": "Rockin' in the Free World", "info": "MEDLEY" },
  { "name": "Kashmir / Whole Lotta Love", "info": "tease" },
  { "name": "Intro / Release", "tape": true }
] }
```

→ one Performance: "Even Flow" (position 1). Noted, in order: "Rockin' in the Free World" (medley, after 1), "Kashmir / Whole Lotta Love" (snippet, after 1 — snippet wins), "Intro / Release" (medley, after 1 — a tape is still noted, not a Performance). Tape list is empty.

### Fixture E — cover without a usable name, and missing names (AC-6, AC-8)

```json
{ "song": [
  { "name": "Creep", "cover": { "mbid": "", "name": "" } },
  { "name": "Karma Police", "cover": { "mbid": "a74b1b7f-71a5-4011-9441-d0b5e4122711" } },
  { "info": "Unknown song" },
  { "name": "" },
  { "name": "No Surprises" }
] }
```

→ Performances: 1 "Creep" (no Original Artist), 2 "Karma Police" (no Original Artist), 3 "No Surprises". Nothing noted.

### Fixture F — repeated Tape (AC-5)

```json
{ "sets": { "set": [
  { "song": [ { "name": "Baba O'Riley", "tape": true, "cover": { "name": "The Who" } }, { "name": "Alive" } ] },
  { "encore": 1, "song": [ { "name": "Baba O'Riley", "tape": true, "cover": { "name": "The Who" } } ] }
] } }
```

→ Tape list: `["Baba O'Riley", "Baba O'Riley"]`.

### Fixture G — no songs (AC-13)

Each of these, with Fixture A's `artist`, `eventDate`, `venue` and `url`:

```json
{ "sets": { "set": [] } }
```
```json
{ "sets": {} }
```
```json
{ "sets": { "set": [ { "song": [] }, { "encore": 1 } ] } }
```

→ Performances `[]`, noted `[]`, Tape list `[]`, Show details as in Fixture A, no error.

## Glossary terms used

- **Setlist** — as defined in GLOSSARY.md.
- **Show** — as defined in GLOSSARY.md.
- **Artist** — as defined in GLOSSARY.md.
- **Set** — as defined in GLOSSARY.md.
- **Encore** — as defined in GLOSSARY.md.
- **Performance** — as defined in GLOSSARY.md.
- **Tape** — as defined in GLOSSARY.md.
- **Cover** — as defined in GLOSSARY.md.
- **Original Artist** — as defined in GLOSSARY.md.
- **Latest Setlist** — as defined in GLOSSARY.md (mentioned only as out of scope).
- **Setlist Playlist** — as defined in GLOSSARY.md.
- **Match** — as defined in GLOSSARY.md (mentioned only as out of scope).
- **Miss** — as defined in GLOSSARY.md (mentioned only as out of scope).

"Noted song", "snippet" and "medley" are used in their plain-English sense and are not glossary terms.

## Shared-file requests

For the orchestrator (this Slice does not edit shared files):

- **CLAUDE.md** — replace "Medleys split best-effort." with a rule matching this PRD: snippets/teasers and medleys are noted but never become Performances and are not added to the Setlist Playlist by default; medleys are not split. A song counts as a snippet only when its info contains "snippet" or starts with "tease"; "with X tease" marks a full song.

## Open questions

(none)
