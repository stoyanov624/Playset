# PRD 0011 — Note Unknown Songs and Incomplete Setlists; offer an older complete one

Status: Approved
Slice: 11
Depends on: 0002, 0005, 0007, 0008, 0009, 0010
Module: src/core/performances (Unknown Songs, the incomplete check), src/core/setlistfm (the setlist-level note, the search for an older complete Setlist), src/core/run and src/cli (warnings, the offer question, preview and summary lines)

## Problem

setlist.fm records a song that was played but whose title nobody knows as a song with an empty name. The site shows it as "(Unknown)", often with a note such as "Written as 'Dope Hippie' on the setlist". PRD 0002 AC-8 drops such songs silently. The concert-goer never learns that the **Setlist** has a gap, and the **Setlist Playlist** looks like the whole **Show** when it isn't.

setlist.fm also has no "incomplete" flag. Editors write it in the setlist's free-text note instead, for example "Setlist incomplete" or "Show cut short after a power outage." Playset ignores that note today.

When the user types an **Artist** name, the **Latest Setlist** is often the one from last night, and it is often still incomplete. An older Setlist from the same tour may be complete and a better guide to the coming Show. Playset never offers it.

## Goal

An **Unknown Song** is no longer dropped. It is noted with its played position, its **Set** and its info text, and shown under "Not added". A Setlist that has an Unknown Song, or whose note says it is incomplete, is an **Incomplete Setlist**. Playset warns about it after the Show line, in the preview and in the final summary. When the input is an Artist name and the Latest Setlist is incomplete, Playset offers the newest complete Setlist it can find within the pages PRD 0005 already searches. The default answer keeps the Latest Setlist.

## Non-goals

- **No detection of silent gaps.** A Setlist that stops early without an Unknown Song and without a matching note is treated as complete. Playset doesn't compare song counts, Show length or other Shows.
- **No guessing of titles.** An Unknown Song's info text (for example "Written as 'Dope Hippie' on the setlist") is shown as given. It is never searched on Spotify, never turned into a **Performance** and never matched.
- **No understanding of the note beyond the phrase list.** Only the phrases in AC-4 count. Negations ("not incomplete"), other languages and other wording ("missing songs", "cut-short") are not understood.
- **No song-level notes.** A song whose own info says "incomplete" or "cut short" doesn't make the Setlist incomplete. Only the setlist-level note counts.
- **No change to the Latest Setlist.** The Latest Setlist is still the newest Setlist with at least one Performance (PRD 0005 AC-18), complete or not. An older complete one is only offered, never chosen automatically.
- **No search beyond PRD 0005's limits.** The search for an older complete Setlist never requests a page that PRD 0005 AC-19 would not allow, and never goes past page 3. It doesn't search other Artists or other tours.
- **No offer for a setlist.fm link.** A link means the user chose that Setlist. Playset only warns.
- **No change to the playlist.** The Setlist Playlist's name, description and privacy are unchanged (PRD 0006). The description doesn't mention that the Setlist is incomplete.
- **No new flags and no new exit codes.** There is no `--complete`, `--latest` or `--allow-incomplete`. `--yes` skips the offer question, as AC-12 describes. Exit codes are those of PRD 0007.
- **No Original Artist or Tape handling for Unknown Songs.** A cover artist or tape flag on an Unknown Song is ignored. It is never in the Tape list and never asked about.
- **No new glossary terms.** "Unknown Song" and "Incomplete Setlist" are already in GLOSSARY.md.

## User stories

- As a concert-goer, I want to see that a Setlist has songs whose titles are unknown, and where they were played, so that I know my Setlist Playlist has gaps.
- As a concert-goer, I want a warning when setlist.fm says a Setlist is incomplete, so that I don't think the playlist is the whole Show.
- As a concert-goer, I want Playset to offer me the newest complete Setlist when last night's is still incomplete, so that I can learn a full Show instead.
- As a concert-goer who pasted a specific link, I want only a warning and no question, so that Playset respects my choice.
- As a concert-goer using `--yes`, I want no extra question, so that my run stays non-interactive.
- As a front-end developer, I want the core to report Unknown Songs, the incomplete status and the offer through injected interfaces, so that a web or mobile front-end can show them too.

## Acceptance criteria

Terms from earlier PRDs keep their meanings: "noted song", "played after", "snippet" (PRD 0002); "medley", "part" (PRD 0008); "input", "kept Performances", "Show line", "preview", "exit code", "message" (PRD 0007); "session", "prompt", "run line" (PRD 0009). Positions are 1-based and count only Performances, in played order across the whole Setlist (PRD 0002). Two more words are used here:

- **Setlist note**: the Setlist's own free-text info field from setlist.fm, not a song's info.
- **Setlist in use**: the Setlist the run builds its Setlist Playlist from. This is the fetched Setlist for a link. For an Artist name, it is the Latest Setlist unless the user accepted the offer in AC-11.

As in PRD 0007, wording and layout may differ from the Examples, but every fact an AC names must be present.

### Unknown Songs

- **AC-1** — Given a song whose name is missing, empty or only whitespace, when the Setlist is turned into Performances, then the song is not a Performance and does not use up a position. It appears in the noted list with reason "unknown". The entry records its Set label (PRD 0002 AC-2) and the position of the Performance it was played after (0 if it came before the first Performance). It also records the song's info text, trimmed, or no info text when the info is missing, empty or only whitespace.
- **AC-2** — Given a song with a missing, empty or whitespace-only name, when the Setlist is turned into Performances, then it is noted with reason "unknown" whatever else it carries. Info that says "snippet", "tease…" or "medley" doesn't change this. A tape flag doesn't make it a **Tape**: it is not in the Tape list (PRD 0002 AC-5) and no Tape question is asked for it. A cover artist doesn't give it an **Original Artist**, and a guest ("with") is ignored. The snippet rule (PRD 0002 AC-9) applies only to songs that have a name.
- **AC-3** — Given a Setlist with Unknown Songs and snippets, when it is turned into Performances, then the noted list holds both, in played order. Each Unknown Song is its own entry, even when two are played next to each other. Each Unknown Song is counted once in the Unknown Song count (AC-5).

### Incomplete Setlist

- **AC-4** — Given a Setlist note, when it is checked, then it matches when it contains at least one of these phrases: `incomplete`, `partial`, `rest unknown`, `rest of the set unknown`, `cut short`, `ended early`, `unknown songs`, `not complete`. The check works like this:
  1. Letter case is ignored, and every run of whitespace in the note counts as one space.
  2. A phrase counts only as whole words. The character before it must be the start of the note or a character that is not a letter or digit. The same holds for the character after it and the end of the note. So `incomplete` matches "Setlist incomplete." but not "incompletely", and `partial` doesn't match "partially".
  3. The matched phrase is the first phrase in the list above that the note contains.

  A missing, empty or whitespace-only Setlist note never matches.
- **AC-5** — Given a Setlist, when it is turned into Performances, then the result also says whether it is an Incomplete Setlist. It is incomplete when it has at least one Unknown Song, or when its Setlist note matches (AC-4), or both. The result gives the Unknown Song count, which is 0 when there are none. When the note matches, it also gives the matched phrase and the Setlist note, trimmed. When the Setlist isn't incomplete, the count is 0 and no note is given. A song's own info never counts toward this, even if it contains one of the phrases.
- **AC-6** — Given setlist.fm returns a Setlist with a Setlist note, when it is fetched by id (PRD 0005 AC-10) or found in a page of an Artist's setlists (PRD 0005 AC-18), then the Setlist note reaches the incomplete check unchanged. A Setlist without a Setlist note is handled the same as one with an empty note.

### Looking for an older complete Setlist

"Complete Setlist" below means a Setlist that has at least one Performance and is not an Incomplete Setlist.

- **AC-7** — Given an Artist whose Latest Setlist is an Incomplete Setlist, and a caller that wants an alternative, when the Latest Setlist is looked for, then the search goes on from the setlist right after the Latest Setlist. It checks the rest of that page in setlist.fm's order, then later pages. The first complete Setlist it meets is the newest complete Setlist. The rules for requesting later pages are those of PRD 0005 AC-19: a page is requested only if the previous page had setlists and its `page × itemsPerPage` is less than its `total`, and pages after 3 are never requested. The newest complete Setlist is returned as listed on its page, unchanged. No extra request fetches it by id. The lookup returns the Artist, the Latest Setlist and the newest complete Setlist.
- **AC-8** — Given the Latest Setlist is not incomplete, or the caller doesn't want an alternative, when the Latest Setlist is looked for, then no further setlist is checked and no further page is requested. The requests are exactly those of PRD 0005, and the lookup says there is no alternative.
- **AC-9** — Given the search in AC-7 reaches its last allowed page without meeting a complete Setlist, when it ends, then no error is raised. The lookup returns the Latest Setlist and says there is no alternative. A later page that setlist.fm answers with HTTP 404 counts as a page with no setlists. Any other error from a later page (rate limit, request error) is passed to the caller unchanged (PRD 0005 AC-21).

### The run: warnings and the offer

- **AC-10** — Given the Setlist shown on the Show line (PRD 0007 AC-9) is an Incomplete Setlist, when the Show line is printed, then a warning follows it right away. The warning comes before any offer question, Tape question, Spotify login or "no Performances" message. It says the Setlist looks incomplete and gives each reason that applies: the Unknown Song count ("1 Unknown Song" or "n Unknown Songs") and the Setlist note in quotes. It also says the Setlist Playlist may not be the full Show. Given the Setlist is not incomplete, then no warning is printed. This applies to both a link and an Artist name. For a link, no offer question follows the warning, and no request is made beyond PRD 0005 AC-10.
- **AC-11** — Given an Artist name, a Latest Setlist that is an Incomplete Setlist, a newest complete Setlist found under AC-7, and no `--yes`, when the warning of AC-10 has been printed, then one yes/no question is asked. It gives the Latest Setlist's date (`YYYY-MM-DD`) and city, and the newest complete Setlist's date and city. It asks whether to use the newest complete one instead. The default answer is No.
  - Answer Yes: the newest complete Setlist becomes the Setlist in use. Its Show line is printed (PRD 0007 AC-9), with no incomplete warning, and the run goes on with it. Its Tape questions, Performances, playlist name and description (PRD 0006 AC-1 to AC-3) and preview are used.
  - Answer No, or the default: the Latest Setlist stays the Setlist in use.

  PRD 0007 AC-11's description-length check applies to the Setlist in use, after this question and before any Tape question.
- **AC-12** — Given `--yes`, when the Latest Setlist is an Incomplete Setlist, then no offer question is asked. The Latest Setlist is the Setlist in use, and no search for an older complete Setlist is made (AC-8). The warning of AC-10 is still printed. `--tapes`, `--no-tapes`, `--public` and `--dry-run` don't skip the offer question. With `--dry-run --yes` it is skipped. Given an Artist name whose Latest Setlist is incomplete and no complete Setlist is found (AC-9), then no question is asked and only the warning is printed.
- **AC-13** — Given the offer question is shown, when the user presses Ctrl-C, then the run ends as PRD 0007 AC-42 describes: one line `Cancelled.`, no stack trace, no Spotify request and exit code 130. In an interactive session, the run ends with `Cancelled.` and the prompt is shown again (PRD 0009 AC-15). That Ctrl-C does not count toward the two Ctrl-C presses that leave the session (PRD 0009 AC-18).

### The run: preview and summary

- **AC-14** — Given the Setlist in use has Unknown Songs, when the preview is shown, then the "Not added" section (PRD 0007 AC-27, PRD 0008 AC-12) lists each Unknown Song in played order among the snippets and left-out Tapes. Each one is shown as `(Unknown song) after #n`. n is the preview number of the last kept Performance played before it, so a left-out Tape is not counted. When no kept Performance was played before it, it is shown as `(Unknown song) at the start`. If the Unknown Song has info text, the text follows after ` — `. The section is shown when it has at least one entry, even if every entry is an Unknown Song.
- **AC-15** — Given the Setlist in use is an Incomplete Setlist, when the preview is shown, then it includes a warning line with the same reasons as AC-10, before the playlist name line (PRD 0007 AC-28). Given it is not incomplete, then no such line is shown.
- **AC-16** — Given the Setlist in use is an Incomplete Setlist, when a Setlist Playlist was created (PRD 0007 AC-36), then a line saying the Setlist is incomplete and the playlist may not be the full Show is printed. It comes after the Misses, or after the "every Performance has a Match" line, and before the share link. The share link stays the last line of standard output (PRD 0007 AC-37). Given `--dry-run` (PRD 0007 AC-35), the same line is printed after the Misses and before the final dry-run line. The line is not printed when the Setlist in use is not incomplete. It is also not printed when the run ends without this summary: confirmation declined, nothing to add, every kept Performance a Miss, a partly created playlist, or an error.
- **AC-17** — Given Unknown Songs, when `playset` runs, then they are never searched on Spotify and never listed as Misses. They are not counted in the Show line's Performance and Tape counts, in the `n/N` progress, in the track count or in the Miss count. Those counts are the same as for the same Setlist without its Unknown Songs.

### Interactive session and core

- **AC-18** — Given an interactive session (PRD 0009), when a run line is entered, then that run's warnings, offer question, preview lines and summary line follow AC-10 to AC-17 exactly, and the prompt is shown again afterwards. Each run line's own `--yes` decides whether the offer question is asked (PRD 0009 AC-6).
- **AC-19** — Given fake setlist.fm and Spotify services and fake answers (PRD 0007 AC-44), when a whole run is carried out through the core with no terminal, then the core reports the following to the front-end:
  - with the Show: the incomplete status of AC-5 (incomplete yes or no, Unknown Song count, matched phrase and Setlist note);
  - when AC-11 applies, one offer question with both Setlists' dates and cities, answered by the front-end with yes, no or cancel;
  - the Unknown Songs in the preview's not-added entries, each with its preview number "after", or "at the start", and its info text;
  - the incomplete status of the Setlist in use, in the preview and in the outcome.

  The core never prints and never reads from a terminal.

## Examples

Unless stated otherwise, the set-up is PRD 0007's: `SETLISTFM_API_KEY=sfm-test-key-0f3c9a`, `SPOTIFY_CLIENT_ID=3f9a0c2e7b4d4e1f8a6b5c4d3e2f1a0b`, a valid cached Spotify token (no login lines), no playlist with the same name. In transcripts, `$` lines are typed by the user, `?` lines are questions with the answer after them, and `[stderr]` marks standard error.

### U1 — Nirvana, 1987-04-18, Tacoma: a real Unknown Song (AC-1, AC-5, AC-17)

`GET /setlist/53d60349`. Song 8 is taken verbatim from setlist.fm's real API response for this Setlist. The other songs, the venue id and the URL are a trimmed test fixture.

```json
{
  "id": "53d60349",
  "eventDate": "18-04-1987",
  "artist": { "mbid": "5b11f4ce-a62d-471e-81fc-a69a8278c7da", "name": "Nirvana" },
  "venue": {
    "id": "7bd6b2c4",
    "name": "Community World Theater",
    "city": { "id": "5812944", "name": "Tacoma", "state": "Washington", "stateCode": "WA",
      "country": { "code": "US", "name": "United States" } }
  },
  "url": "https://www.setlist.fm/setlist/nirvana/1987/community-world-theater-tacoma-wa-53d60349.html",
  "sets": { "set": [ { "song": [
    { "name": "Love Buzz", "cover": { "mbid": "a0a6f1c1-9a3f-4b5e-8c4e-5c2d1e0f9b8a", "name": "Shocking Blue" } },
    { "name": "Floyd the Barber" },
    { "name": "Downer" },
    { "name": "Mexican Seafood" },
    { "name": "Hairspray Queen" },
    { "name": "Spank Thru" },
    { "name": "Aero Zeppelin" },
    { "name": "", "info": "Written as 'Dope Hippie' on the setlist" },
    { "name": "Pen Cap Chew" },
    { "name": "Paper Cuts" }
  ] } ] }
}
```

Expected Performances (Artist "Nirvana", Set label "main" on every row): 1 Love Buzz (Original Artist Shocking Blue), 2 Floyd the Barber, 3 Downer, 4 Mexican Seafood, 5 Hairspray Queen, 6 Spank Thru, 7 Aero Zeppelin, 8 Pen Cap Chew, 9 Paper Cuts. Pen Cap Chew is at position 8, because the Unknown Song uses no position.

Expected noted list:

| Reason | Raw name | Set label | Played after | Info text |
|---|---|---|---|---|
| unknown | (empty) | main | 7 | Written as 'Dope Hippie' on the setlist |

Incomplete status: incomplete yes, Unknown Song count 1, no matched phrase, no Setlist note. Tape list `[]`.

### U2 — Unknown Song edge cases (AC-1, AC-2, AC-3)

Each row is one main Set by "Arctic Monkeys". Positions count Performances only.

| Songs | Performances | Noted (reason, played after, info text) |
|---|---|---|
| `[{ "info": "Unknown song" }, { "name": "Brianstorm" }]` | 1 Brianstorm | unknown, after 0, "Unknown song" |
| `[{ "name": "505" }, { "name": "" }, { "name": "   " }, { "name": "Mardy Bum" }]` | 1 505, 2 Mardy Bum | unknown, after 1, none; unknown, after 1, none |
| `[{ "name": "505" }, { "name": "", "info": "  " }]` | 1 505 | unknown, after 1, none (blank info) |
| `[{ "name": "", "info": "snippet" }]` | none | unknown, after 0, "snippet" (unknown wins, AC-2) |
| `[{ "name": " ", "info": "Medley" }]` | none | unknown, after 0, "Medley" |
| `[{ "name": "", "tape": true, "info": "Intro tape" }]` | none; Tape list `[]`; no Tape question | unknown, after 0, "Intro tape" |
| `[{ "name": "", "cover": { "name": "The Beatles" }, "with": { "name": "Miles Kane" } }]` | none | unknown, after 0, none (no Original Artist recorded) |
| `[{ "name": "Hey Jude", "info": "snippet" }, { "name": "505" }, { "name": "" }, { "name": "Kashmir", "info": "Tease" }]` | 1 505 | snippet "Hey Jude" after 0; unknown after 1; snippet "Kashmir" after 1 (played order, AC-3) |

PRD 0002 Fixture E, under the new rules: Performances 1 Creep, 2 Karma Police, 3 No Surprises (unchanged). Noted: unknown after 2 with info "Unknown song", then unknown after 2 with no info. Incomplete status: incomplete, 2 Unknown Songs.

PRD 0002 Fixture A, under PRD 0008 and 0010 numbering: the Performances are unchanged ("Fixture A revisited"). The `"   "` song in the Acoustic Set is now noted as unknown, Set label "Acoustic", after 9 (Cornerstone), with no info. Fixture A is an Incomplete Setlist with 1 Unknown Song.

### N1 — Setlist note phrases (AC-4, AC-5)

| Setlist note | Matches? | Matched phrase |
|---|---|---|
| `Setlist incomplete` | yes | incomplete |
| `INCOMPLETE SETLIST.` | yes | incomplete |
| `Partial setlist, from fan videos` | yes | partial |
| `Rest of the set unknown.` | yes | rest of the set unknown |
| `First 5 songs known, rest unknown` | yes | rest unknown |
| `Show cut short after a power outage.` | yes | cut short |
| `Show ended early because of rain` | yes | ended early |
| `There were 2 unknown songs before the encore` | yes | unknown songs |
| `Setlist is not   complete` (several spaces) | yes | not complete |
| `Setlist incomplete, rest unknown` | yes | incomplete (first in the list) |
| `Not incomplete!` | yes | incomplete (no understanding of negation, Non-goals) |
| `Partially recorded` | no | — |
| `Incompletely documented` | no | — |
| `Show was cut-short` | no | — (hyphen is not a space) |
| `Unknown song order` | no | — |
| `Not completed yet` | no | — |
| `First show of the tour` | no | — |
| `   ` or missing | no | — |

A Setlist whose songs all have names and whose Setlist note is `Setlist incomplete`: Performances as usual, nothing noted for this reason. Incomplete status: incomplete, Unknown Song count 0, matched phrase "incomplete", Setlist note "Setlist incomplete". For example:

```json
{
  "id": "2bf3d4e6",
  "eventDate": "14-06-2026",
  "artist": { "mbid": "a74b1b7f-71a5-4011-9441-d0b5e4122711", "name": "Radiohead" },
  "venue": { "id": "1bd6a3c0", "name": "O2 Arena",
    "city": { "id": "2643743", "name": "London", "country": { "code": "GB", "name": "United Kingdom" } } },
  "url": "https://www.setlist.fm/setlist/radiohead/2026/o2-arena-london-england-2bf3d4e6.html",
  "info": "Setlist incomplete",
  "sets": { "set": [ { "song": [ { "name": "Airbag" }, { "name": "Paranoid Android" }, { "name": "Karma Police" } ] } ] }
}
```

The same Setlist with `"info": "Recorded for BBC radio"` but with song 2 `{ "name": "Paranoid Android", "info": "incomplete, cut short by a broken string" }` is **not** incomplete. The phrases are in a song's info, not in the Setlist note (AC-5).

Both a note and Unknown Songs: `"info": "Rest of the set unknown."` and two songs with `"name": ""` give incomplete, 2 Unknown Songs, phrase "rest of the set unknown", note "Rest of the set unknown.".

### L1 — Pearl Jam: latest incomplete, older complete on the same page (AC-7, AC-11)

Artist search for "Pearl Jam" gives one exact match, `83b9cbe7-9857-49e2-ab8e-b57b01038103`. `GET /artist/83b9cbe7-9857-49e2-ab8e-b57b01038103/setlists?p=1`:

```json
{
  "type": "setlists", "itemsPerPage": 20, "page": 1, "total": 1310,
  "setlist": [
    { "id": "4bf1d2a6", "eventDate": "05-12-2026",
      "artist": { "mbid": "83b9cbe7-9857-49e2-ab8e-b57b01038103", "name": "Pearl Jam" },
      "venue": { "id": "6bd6b0a2", "name": "Chase Center",
        "city": { "id": "5391959", "name": "San Francisco", "country": { "code": "US", "name": "United States" } } },
      "url": "https://www.setlist.fm/setlist/pearl-jam/2026/chase-center-san-francisco-ca-4bf1d2a6.html",
      "sets": { "set": [] } },
    { "id": "2bf1c8e4", "eventDate": "22-11-2026",
      "artist": { "mbid": "83b9cbe7-9857-49e2-ab8e-b57b01038103", "name": "Pearl Jam" },
      "venue": { "id": "3bd6c1a4", "name": "Moda Center",
        "city": { "id": "5746545", "name": "Portland", "country": { "code": "US", "name": "United States" } } },
      "url": "https://www.setlist.fm/setlist/pearl-jam/2026/moda-center-portland-or-2bf1c8e4.html",
      "sets": { "set": [ { "song": [
        { "name": "Release" },
        { "name": "", "info": "New song, title not yet known" },
        { "name": "Even Flow" },
        { "name": "Alive" } ] } ] } },
    { "id": "6bf1b3d0", "eventDate": "20-11-2026",
      "artist": { "mbid": "83b9cbe7-9857-49e2-ab8e-b57b01038103", "name": "Pearl Jam" },
      "venue": { "id": "5bd6c3a8", "name": "Climate Pledge Arena",
        "city": { "id": "5809844", "name": "Seattle", "country": { "code": "US", "name": "United States" } } },
      "url": "https://www.setlist.fm/setlist/pearl-jam/2026/climate-pledge-arena-seattle-wa-6bf1b3d0.html",
      "info": "Show cut short after a power outage.",
      "sets": { "set": [ { "song": [ { "name": "Release" }, { "name": "Corduroy" } ] } ] } },
    { "id": "3bf1a7c2", "eventDate": "18-11-2026",
      "artist": { "mbid": "83b9cbe7-9857-49e2-ab8e-b57b01038103", "name": "Pearl Jam" },
      "venue": { "id": "2bd6d4ac", "name": "Rogers Arena",
        "city": { "id": "6173331", "name": "Vancouver", "country": { "code": "CA", "name": "Canada" } } },
      "url": "https://www.setlist.fm/setlist/pearl-jam/2026/rogers-arena-vancouver-bc-canada-3bf1a7c2.html",
      "sets": { "set": [
        { "song": [ { "name": "Release" }, { "name": "Daughter" }, { "name": "Even Flow" }, { "name": "Black" }, { "name": "Alive" } ] },
        { "encore": 1, "song": [ { "name": "Yellow Ledbetter" } ] } ] } }
  ]
}
```

- `4bf1d2a6`: 0 Performances, skipped (PRD 0005 AC-18).
- `2bf1c8e4` (Portland): the Latest Setlist. It is incomplete, with 1 Unknown Song.
- `6bf1b3d0` (Seattle): 2 Performances, but incomplete because its note matches "cut short". It is skipped.
- `3bf1a7c2` (Vancouver): the newest complete Setlist.

Only page 1 is requested.

Spotify outcomes (fake): Release `spotify:track:4xGvbS8NnKtwKw5CXGkmA9` (Ten), Even Flow `spotify:track:2pN3kBT1hYiA4bBydDMYv4` (Ten), Alive `spotify:track:3VbM2t6DQHmPWdbTvKrNKz` (Ten), Daughter `spotify:track:6rSFzV1CKBFnZ1EaPvcGSh` (Vs.), Black `spotify:track:5Xak5fmy089t0FYmh3VJiY` (Ten), Yellow Ledbetter `spotify:track:3Tz9GjB1xNnRdC3jGcvTBn` (rearviewmirror (Greatest Hits 1991-2003)).

**O1 — answer Yes (AC-10, AC-11):**

```
$ playset Pearl Jam

Pearl Jam – 2026-11-22 – Moda Center, Portland
https://www.setlist.fm/setlist/pearl-jam/2026/moda-center-portland-or-2bf1c8e4.html
3 Performances, 0 Tapes
Warning: this Setlist looks incomplete: 1 Unknown Song.
The Setlist Playlist may not be the full Show.

? The latest Setlist (2026-11-22, Portland) looks incomplete. Use the newest complete one (2026-11-18, Vancouver) instead? (y/N) y

Pearl Jam – 2026-11-18 – Rogers Arena, Vancouver
https://www.setlist.fm/setlist/pearl-jam/2026/rogers-arena-vancouver-bc-canada-3bf1a7c2.html
6 Performances, 0 Tapes

Finding Matches 1/6: Release
...
Finding Matches 6/6: Yellow Ledbetter

main
   1. Release
      → Release — Pearl Jam · Ten
   ...
Encore 1
   6. Yellow Ledbetter
      → Yellow Ledbetter — Pearl Jam · rearviewmirror (Greatest Hits 1991-2003)

Playlist: Pearl Jam – 2026-11-18 – Vancouver (private)
6 tracks, 0 Misses

? Create this playlist? (y/N) y

Created "Pearl Jam – 2026-11-18 – Vancouver" with 6 tracks.

Every Performance has a Match.

https://open.spotify.com/playlist/5PqRsTuVwXyZaBcDeFgHiJ
```

Exit code 0. There is no incomplete line in the preview or summary, and the playlist description contains the Vancouver URL. There is no "Not added" section.

**O2 — answer No, or Enter (AC-11, AC-14, AC-15, AC-16):**

```
? The latest Setlist (2026-11-22, Portland) looks incomplete. Use the newest complete one (2026-11-18, Vancouver) instead? (y/N) n

Finding Matches 1/3: Release
Finding Matches 2/3: Even Flow
Finding Matches 3/3: Alive

main
   1. Release
      → Release — Pearl Jam · Ten
   2. Even Flow
      → Even Flow — Pearl Jam · Ten
   3. Alive
      → Alive — Pearl Jam · Ten

Not added:
  (Unknown song) after #1 — New song, title not yet known

Warning: this Setlist looks incomplete: 1 Unknown Song.
Playlist: Pearl Jam – 2026-11-22 – Portland (private)
3 tracks, 0 Misses

? Create this playlist? (y/N) y

Created "Pearl Jam – 2026-11-22 – Portland" with 3 tracks.

Every Performance has a Match.

Note: this Setlist is incomplete — the playlist may not be the full Show.

https://open.spotify.com/playlist/5PqRsTuVwXyZaBcDeFgHiJ
```

Exit code 0. The Unknown Song is not searched (3 progress steps) and is not a Miss (AC-17).

**O3 — `playset Pearl Jam --yes` (AC-12):** the Portland Show line and warning are printed with no offer question, then the run goes on as in O2 without `? Create this playlist?`. setlist.fm requests: the artist search and page 1 only.

**O4 — `playset Pearl Jam --dry-run` (AC-12, AC-16):** the offer question is asked. With answer `n`, the output ends:

```
Every Performance has a Match.

Note: this Setlist is incomplete — the playlist may not be the full Show.

Dry run: no playlist created.
```

**O5 — Ctrl-C at the offer question (AC-13):**

| Where | Output | Exit / afterwards | Requests |
|---|---|---|---|
| `playset Pearl Jam` | `Cancelled.` | exit code 130 | artist search, page 1; no Spotify request |
| session line `Pearl Jam` | `Cancelled.` | prompt again; one following `^C` at the empty prompt prints only `(To leave, type exit or press Ctrl-C again.)` | same |

### L2 — Paging for the older complete Setlist (AC-7, AC-8, AC-9)

Artist `83b9cbe7-…` as in L1, no `--yes`. "Incomplete" means 1 Unknown Song.

| Pages from setlist.fm | Pages requested | Result |
|---|---|---|
| p=1 (`total: 1310`, 20 items): items 1–19 empty, item 20 incomplete. p=2: item 1 complete (2026-10-30, Denver) | p=1, p=2 | Latest = p1 item 20; offered: Denver (AC-7) |
| p=1 (`total: 1310`): item 1 complete | p=1 | Latest = item 1, not incomplete; no search, no question (AC-8) |
| p=1, p=2, p=3 (`total: 1310`): item 1 of p=1 incomplete, every other item empty or incomplete | p=1, p=2, p=3 only | Latest = p1 item 1; no alternative; warning only, no question (AC-9) |
| p=1 (`itemsPerPage: 20`, `total: 4`): item 1 incomplete, items 2–4 incomplete | p=1 only (1 × 20 ≥ 4) | no alternative, warning only (AC-9) |
| p=1, p=2 (`total: 1310`): p1 all empty; p2 item 20 incomplete; p=3: item 1 complete | p=1, p=2, p=3 | Latest = p2 item 20; offered: p3 item 1 (AC-7) |
| p=1, p=2, p=3: p1 and p2 empty, p3 item 20 incomplete | p=1, p=2, p=3; never p=4 | no alternative (AC-7, AC-9) |
| p=1 (`total: 1310`): item 20 incomplete; p=2: HTTP 404 | p=1, p=2 | no alternative, warning only (AC-9) |
| p=1 (`total: 1310`): item 20 incomplete; p=2: HTTP 429 four times | p=1, p=2 (4 requests) | `[stderr] setlist.fm is busy (too many requests). Try again in a minute.`, exit code 1 (AC-9, PRD 0007 AC-38) |
| p=1 (`total: 1310`): item 20 incomplete, `--yes` | p=1 only | warning only (AC-8, AC-12) |

### T1 — A link to an Incomplete Setlist: warn only (AC-10, AC-14, AC-15, AC-16, AC-17)

Fake Spotify outcomes for U1's Performances:

| # | Performance | Outcome |
|---|---|---|
| 1 | Love Buzz (Cover of Shocking Blue) | Match `spotify:track:6tKvLrLFmBvvYDmTHU9YEh`, "Love Buzz", ["Nirvana"], "Bleach", not live (Artist's version first) |
| 2 | Floyd the Barber | Match `spotify:track:1rHHu0w1kPpJEYGqtzCvOc`, "Floyd The Barber", ["Nirvana"], "Bleach" |
| 3 | Downer | Match `spotify:track:3XzDkJjrJ1j0Nq7nbF3gKz`, "Downer", ["Nirvana"], "Bleach" |
| 4 | Mexican Seafood | Match `spotify:track:0w6kUoYjmVb9bQ5Hqf3TrB`, "Mexican Seafood", ["Nirvana"], "Incesticide" |
| 5 | Hairspray Queen | Match `spotify:track:5aPZtPu3bYEDpYi2E0Z0w8`, "Hairspray Queen", ["Nirvana"], "Incesticide" |
| 6 | Spank Thru | Miss |
| 7 | Aero Zeppelin | Match `spotify:track:2r7K3fYqXcnwhP7LfYYn1c`, "Aero Zeppelin", ["Nirvana"], "Incesticide" |
| 8 | Pen Cap Chew | Match `spotify:track:7bZx1bqMsk1y0wB8m2l4yN`, "Pen Cap Chew", ["Nirvana"], "With The Lights Out" |
| 9 | Paper Cuts | Match `spotify:track:0rXhJ9e3eDqUj1qJkC7m3M`, "Paper Cuts", ["Nirvana"], "Bleach" |

```
$ playset https://www.setlist.fm/setlist/nirvana/1987/community-world-theater-tacoma-wa-53d60349.html

Nirvana – 1987-04-18 – Community World Theater, Tacoma
https://www.setlist.fm/setlist/nirvana/1987/community-world-theater-tacoma-wa-53d60349.html
9 Performances, 0 Tapes
Warning: this Setlist looks incomplete: 1 Unknown Song.
The Setlist Playlist may not be the full Show.

Finding Matches 1/9: Love Buzz
Finding Matches 2/9: Floyd the Barber
...
Finding Matches 9/9: Paper Cuts

main
   1. Love Buzz [Cover of Shocking Blue]
      → Love Buzz — Nirvana · Bleach
   2. Floyd the Barber
      → Floyd The Barber — Nirvana · Bleach
   3. Downer
      → Downer — Nirvana · Bleach
   4. Mexican Seafood
      → Mexican Seafood — Nirvana · Incesticide
   5. Hairspray Queen
      → Hairspray Queen — Nirvana · Incesticide
   6. Spank Thru
      → Miss
   7. Aero Zeppelin
      → Aero Zeppelin — Nirvana · Incesticide
   8. Pen Cap Chew
      → Pen Cap Chew — Nirvana · With The Lights Out
   9. Paper Cuts
      → Paper Cuts — Nirvana · Bleach

Not added:
  (Unknown song) after #7 — Written as 'Dope Hippie' on the setlist

Warning: this Setlist looks incomplete: 1 Unknown Song.
Playlist: Nirvana – 1987-04-18 – Tacoma (private)
8 tracks, 1 Miss

? Create this playlist? (y/N) y

Created "Nirvana – 1987-04-18 – Tacoma" with 8 tracks.

1 Miss (not in the playlist):
  Spank Thru — Nirvana

Note: this Setlist is incomplete — the playlist may not be the full Show.

https://open.spotify.com/playlist/3AbCdEfGhIjKlMnOpQrStV
```

Exit code 0. No offer question, because the input is a link. setlist.fm requests: `GET /setlist/53d60349` only. There are 9 progress steps, and the add-items request has 8 URIs. The Unknown Song is not in the Miss list.

**T1b — link, note only:** `playset https://www.setlist.fm/setlist/radiohead/2026/o2-arena-london-england-2bf3d4e6.html` (N1's Radiohead Setlist) prints:

```
Radiohead – 2026-06-14 – O2 Arena, London
https://www.setlist.fm/setlist/radiohead/2026/o2-arena-london-england-2bf3d4e6.html
3 Performances, 0 Tapes
Warning: this Setlist looks incomplete: note: "Setlist incomplete".
The Setlist Playlist may not be the full Show.
```

The preview has no "Not added" section (no Unknown Songs) but has the warning line. The summary has the Note line.

**T1c — both reasons:** `Warning: this Setlist looks incomplete: 2 Unknown Songs; note: "Rest of the set unknown.".`

**T1d — only Unknown Songs, link (AC-10):** a Setlist fetched by link whose only songs are `{ "name": "" }` and `{ "name": "", "info": "Opener" }`:

```
Pearl Jam – 2026-11-22 – Moda Center, Portland
https://www.setlist.fm/setlist/pearl-jam/2026/moda-center-portland-or-2bf1c8e4.html
0 Performances, 0 Tapes
Warning: this Setlist looks incomplete: 2 Unknown Songs.
The Setlist Playlist may not be the full Show.
[stderr] This Setlist has no Performances yet, so there is nothing to add.
```

Exit code 1, with no Spotify request. Found by Artist name instead, this setlist has 0 Performances and is skipped (PRD 0005 AC-18).

### T2 — "after #n" counts the preview numbering (AC-14)

PRD 0002 Fixture A (Arctic Monkeys, `63a5e2b7`), with PRD 0008's P2 data, by link:

- With "I Want It All" kept, "Not added" is `Hey Jude (snippet)`, `(Unknown song) after #9`, `Mr. Blue Sky (Tape, left out)`. Cornerstone is preview #9.
- With `--no-tapes`, "Not added" is `I Want It All (Tape, left out)`, `Hey Jude (snippet)`, `(Unknown song) after #8`, `Mr. Blue Sky (Tape, left out)`. Cornerstone is now preview #8, because the left-out Tape is not numbered.

A Setlist whose first song is `{ "name": "", "info": "Intro jam" }`, followed by `{ "name": "Brianstorm" }`, gives `(Unknown song) at the start — Intro jam`. So does a Setlist where the only songs before the Unknown Song are Tapes that were left out.

### S1 — Interactive session (AC-18)

```
playset › Pearl Jam --dry-run
...
? The latest Setlist (2026-11-22, Portland) looks incomplete. Use the newest complete one (2026-11-18, Vancouver) instead? (y/N) y
...
Dry run: no playlist created.

playset › Pearl Jam --yes
(Portland Show line and warning; no offer question; created; Note line; share link)

playset › exit
```

The second line's run doesn't remember the first line's answer. With `--yes` it uses the Latest Setlist.

### C1 — The core with fakes (AC-19)

The core is given input `Pearl Jam`, options (Tapes: ask, confirm: ask, dry run: no), L1's fake services, and fake answers (offer: no; confirm: yes). It records:

- one Show report: Portland, incomplete yes, Unknown Song count 1, no phrase, no note;
- one offer question with (2026-11-22, Portland) and (2026-11-18, Vancouver);
- 3 progress steps;
- one preview: 3 rows, 1 not-added entry (unknown, after 1, "New song, title not yet known"), incomplete yes;
- outcome "created" with 3 tracks, 0 Misses, incomplete yes.

With offer answer yes: a second Show report (Vancouver, incomplete no), 6 progress steps, outcome "created" with incomplete no. With offer answer cancel: outcome "cancelled", no token request. With confirm option "skip" (`--yes`): no offer question, and only the artist search and page 1 are requested.

### AC coverage

| AC | Examples |
|---|---|
| AC-1 | U1, U2 |
| AC-2 | U2 (snippet, medley, tape, cover rows) |
| AC-3 | U2 (last row, two adjacent rows), Fixture E |
| AC-4 | N1 |
| AC-5 | U1, N1 (Radiohead, song-level info, both reasons) |
| AC-6 | N1 (Radiohead JSON), L1 (Seattle in a page) |
| AC-7 | L1, L2 |
| AC-8 | L2 (complete latest, `--yes` rows), O3 |
| AC-9 | L2 |
| AC-10 | O1, T1, T1b, T1c, T1d |
| AC-11 | O1, O2 |
| AC-12 | O3, O4, L2 |
| AC-13 | O5 |
| AC-14 | O2, T1, T2 |
| AC-15 | O2, T1, T1b |
| AC-16 | O2, O4, T1 |
| AC-17 | O2, T1 |
| AC-18 | O5, S1 |
| AC-19 | C1 |

## Changes to earlier PRDs

Where this PRD and an earlier one disagree, this PRD wins.

**PRD 0002 — Turn a Setlist into Performances**

- **AC-8 is amended.** The first half ("a song whose name is missing, empty or only whitespace … produces neither a Performance nor a noted song") is replaced by AC-1 and AC-2 here. Such a song is now noted with reason "unknown". It still produces no Performance and uses no position. The trimming half (leading and trailing whitespace removed from titles) stays.
- **AC-11 is amended** (already amended by PRD 0008 AC-9). A noted song's reason is "snippet" or "unknown". An "unknown" entry also records its info text (AC-1 here). Raw name, Set label and "played after" stay.
- **AC-12 and AC-13 stay.** AC-13's empty Setlist is not incomplete unless its Setlist note matches.
- **New result field:** turning a Setlist into Performances now also gives the incomplete status (AC-5 here).
- **Examples:** in Fixture A, the line "The song named `"   "` produces nothing" is replaced. It is now noted as unknown (see U2). Fixture A is an Incomplete Setlist. In Fixture E, "Nothing noted" is replaced by two unknown entries (see U2).

**PRD 0005 — Find the Latest Setlist by Artist name**

- **AC-18 stays.** Setlists whose only songs have no name still have 0 Performances and are skipped. The Latest Setlist may be incomplete.
- **AC-19 is amended** by AC-7 here. When the Latest Setlist is incomplete and the caller wants an alternative, pages after N may be requested under the same rules, up to page 3.
- **AC-21 is amended** by AC-7 to AC-9 here. The entry point also returns the newest complete Setlist, or says there is none. The caller can say whether to look for one.
- **Examples:** unchanged. The `63a5e2b7` entry in PRD 0005's page 1 has only complete songs.

**PRD 0007 — The `playset` command**

- **AC-9 is amended** by AC-10 here. An incomplete warning can follow the Show line, and for an accepted offer a second Show line is printed (AC-11).
- **AC-10 is amended.** The incomplete warning (AC-10 here) comes between the Show line and the "no Performances" message.
- **AC-11 is amended.** The description check applies to the Setlist in use, after the offer question (AC-11 here).
- **AC-16 is amended** by AC-12 here. `--yes` also skips the offer question and keeps the Latest Setlist.
- **AC-26 to AC-28 are amended** by AC-14 and AC-15 here. "Not added" lists Unknown Songs, and the preview can carry an incomplete warning line.
- **AC-35 and AC-36 are amended** by AC-16 here, which adds the Note line before the dry-run line or before the share link.
- **AC-42 is amended** by AC-13 here. The offer question is one of the questions where Ctrl-C cancels.
- **AC-44 is amended** by AC-19 here.
- **Examples T1, T2 and E18** (as already changed by PRD 0008 P2) use Fixture A, which is now an Incomplete Setlist.
  - Each gains the Show-line warning (`1 Unknown Song`), the `(Unknown song) after #n` entry under "Not added" (T2 above), the preview warning line and the Note line.
  - In T1, the input is an Artist name without `--yes`, so an older complete Setlist is looked for. PRD 0005's page 1 lists `63a5e2b7` last, and its `total` is 1047, so page 2 is requested after page 1, before the token exchange. The test's fake must answer page 2. With `"setlist": []` there is no alternative, so T1 shows the warning only and no offer question.
  - In E18, the preview has 3 not-added entries instead of 2, and the outcome says incomplete.
  - T2 (a link) makes no extra request.

**PRD 0008 — Split medleys into Performances**

- **AC-9 is amended.** A noted song's reason is "snippet" or "unknown". Medleys still never appear in the noted list.
- **AC-12 is amended** by AC-14 here. "Not added" lists snippets, left-out Tapes and Unknown Songs.
- **Example P2** gains the same lines as PRD 0007 T1 above, with `(Unknown song) after #9`. Fixture M, Fixture N, P1 and P3 are unchanged: they have no Unknown Songs.

**PRD 0009 — Interactive shell**

- **AC-15 is amended** by AC-13 here. The offer question joins the questions where Ctrl-C cancels only the run.
- **Examples S1 and S14** use Fixture A, which is now incomplete.
  - Each Fixture A run gains the incomplete lines.
  - The first line (`Arctic Monkeys --dry-run --no-tapes`, no `--yes`) also requests setlists page 2, which the fake answers with `"setlist": []`. That moves the later setlist.fm request times. S1's "≥" timings still hold.
  - The fourth line has `--yes`, so it makes no extra request.
- All other ACs are unchanged.

**PRD 0010 — "+" in titles**

- No AC changes. Its examples (Fixture M revisited, P1 revisited, X1–X10) have no Unknown Songs and no Setlist note, so they are unchanged.

**PRD 0006** is unchanged. The name, description and privacy rules apply to the Setlist in use.

**Tests.** Existing tests that expect a nameless song to be dropped silently, Fixture A or E's noted list to lack the unknown entry, or the T1, T2, E18, P2, S1 and S14 outputs and request lists without the incomplete lines must change in this Slice. That includes PRD 0002 AC-8, AC-11, Fixture A and Fixture E, PRD 0005 AC-19 and AC-21, and PRD 0007 / 0008 / 0009 examples that use Fixture A by Artist name. The changes must be visible in the PR, and each changed test must cite the AC of this PRD that now governs it.

## Glossary terms used

- **Setlist** — as defined in GLOSSARY.md.
- **Show** — as defined in GLOSSARY.md.
- **Artist** — as defined in GLOSSARY.md.
- **Set** — as defined in GLOSSARY.md.
- **Encore** — as defined in GLOSSARY.md (through "Encore 1" Set labels in the examples).
- **Performance** — as defined in GLOSSARY.md.
- **Tape** — as defined in GLOSSARY.md.
- **Cover** — as defined in GLOSSARY.md.
- **Original Artist** — as defined in GLOSSARY.md.
- **Latest Setlist** — as defined in GLOSSARY.md.
- **Unknown Song** — as defined in GLOSSARY.md.
- **Incomplete Setlist** — as defined in GLOSSARY.md.
- **Setlist Playlist** — as defined in GLOSSARY.md.
- **Match** — as defined in GLOSSARY.md.
- **Miss** — as defined in GLOSSARY.md.

"Setlist note", "Setlist in use", "complete Setlist", "newest complete Setlist" and "offer question" are PRD-local words defined above, not glossary terms. Words from PRDs 0002, 0005, 0007, 0008 and 0009 keep their meanings. No new glossary term is proposed.

## Shared-file requests

For the orchestrator (this Slice does not edit shared files):

- **CLAUDE.md** — under "Product rules", add one bullet: `Unknown Songs (empty/whitespace name on setlist.fm) are never Performances, never matched or added; they are noted with their played position, Set and info, and listed under "Not added" as "(Unknown song) after #n". A Setlist is an Incomplete Setlist if it has an Unknown Song or its setlist-level note contains (whole words, any case) "incomplete", "partial", "rest unknown", "rest of the set unknown", "cut short", "ended early", "unknown songs" or "not complete". Warn after the Show line, in the preview and in the final summary. For an Artist name whose Latest Setlist is incomplete, offer the newest complete Setlist within the same ≤3 pages (default No; --yes keeps the latest without asking); a link only warns.`
- **docs/PLAN.md** — add the Slice row `| 11 | Note Unknown Songs and Incomplete Setlists; offer an older complete one | 2, 4, 7, 8, 9, 10 |`, and add `**Wave 6:** Slice 11`.
- **GLOSSARY.md** — no change. "Unknown Song" and "Incomplete Setlist" are already defined.
- **src/core/index.ts** — export the incomplete status shape, the noted-song shape with reason "unknown" and its info text, the lookup result with the newest complete Setlist, and the run's new offer-question interaction and report fields, if these shapes are exported from there.
- **docs/prd/0002-performances.md, 0005-setlistfm.md, 0007-cli.md, 0008-medley-split.md, 0009-interactive-shell.md** — optionally add under Status: "Partly superseded by PRD 0011 (Unknown Songs, Incomplete Setlists)."

## Open questions

(none)
