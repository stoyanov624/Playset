# PRD 0008 — Split medleys into Performances

Status: Approved
Slice: 8
Depends on: 0002, 0007
Module: src/core/performances (primary); the medley marker in the preview in src/core/run and src/cli

## Problem

PRD 0002 only notes medleys. A song such as "Teddy Picker / Crying Lightning", or a song whose info says "medley", never becomes a **Performance**. It is listed under "Not added" in the preview (PRD 0007 AC-27) and never reaches the **Setlist Playlist**. That leaves out songs the **Artist** really played, and often they are some of the best-known songs of the **Show**. The user has changed this rule: medleys are now split into their songs and added, every time.

## Goal

When a song's name joins several songs with " / " or " + ", each of those songs becomes its own Performance in the medley's place. Each one is matched and added like any other Performance, and the preview marks it as part of a medley. A song marked as a medley only in its info stays as one normal Performance with the same marker. Snippets are still only noted. The "Not added" list no longer contains medleys.

## Non-goals

- **No splitting on other separators.** "-", "&", "and", "into", ">", "->", "/" or "+" without a space on both sides, and line breaks never split a song. Only " / " and " + " (one space before and one after) split a song.
- **No way to keep medleys whole.** There is no question, flag or setting to turn splitting off. Medleys are always split.
- **No splitting of info-only medleys.** When only the info says "medley" (for example "Medley with 'Fluorescent Adolescent'"), the other song named in the info is not added. The song in the name stays one Performance.
- **No change to matching.** Each part is matched exactly as PRD 0003 matches any Performance. Matching does not know that a Performance came from a medley.
- **No per-part Cover or Tape detection.** setlist.fm gives one cover artist and one tape flag per song. Both apply to every part, even when only some parts are really by the **Original Artist**.
- **No change to snippets.** The snippet rule of PRD 0002 AC-9 is unchanged and takes priority over medleys. A snippet stays noted, never split and never added.
- **No change to guest handling.** A guest ("with") is still ignored.
- **No title clean-up beyond trimming.** Parts are trimmed of surrounding whitespace only, as titles are in PRD 0002 AC-8.
- **No new Tape question format and no medley question.** Tape questions keep the format of PRD 0007 AC-12. They are asked once for each Tape part.
- **No medley marker in the final Miss list.** A Miss that came from a medley is printed in the format of PRD 0007 AC-36, with no medley marker.

## User stories

- As a concert-goer, I want each song of a medley in my Setlist Playlist, so that I can learn every song the Artist played, not only the ones played on their own.
- As a concert-goer, I want the preview to show which songs came from a medley, so that I understand why songs I may only have heard in part are in the list.
- As a concert-goer, I want each part of a Tape medley asked about separately, so that I can keep one part and leave out another.
- As a concert-goer, I want song titles that contain a slash or a plus with no spaces to stay whole, so that real titles are not broken into nonsense.

## Acceptance criteria

Positions are 1-based and count only Performances, in played order across the whole **Setlist** (as in PRD 0002). "Trimmed" means leading and trailing whitespace removed. "Medley name" means the song's name, trimmed.

### Turning a Setlist into Performances

- **AC-1** — Given a song that is not a snippet (PRD 0002 AC-9) and whose trimmed name contains " / " or " + ", when the Setlist is turned into Performances, then the song is replaced by one Performance per part, at the place where the song was played. The parts come from splitting the trimmed name at every " / " and " + ". Separators are found from left to right and never overlap. Each part is trimmed, and empty parts are dropped. The parts keep the order in which they appear in the name. Each part has the Set label of the song's **Set**. Positions still run 1, 2, 3 … with no gaps, so every later Performance moves down by the number of extra parts.
- **AC-2** — Given a song whose trimmed name contains "/" or "+" only without a space on both sides (for example "Love/Hate", "Me+You" or "Rearviewmirror /"), and whose info does not contain "medley", when the Setlist is turned into Performances, then it is one normal Performance with the trimmed name as its title and no medley marker.
- **AC-3** — Given a song split under AC-1, when the Setlist is turned into Performances, then every part's Performance carries a medley marker whose value is the medley name. Given a Performance that did not come from a medley (AC-1 or AC-6), it carries no medley marker.
- **AC-4** — Given a medley that is a **Cover**, when it is split, then every part has the medley's Original Artist. Given a cover with an empty or missing name, then no part has an Original Artist (as in PRD 0002 AC-6). In every case each part's Artist is the Setlist's Artist. Given a medley with a guest ("with"), then the parts are the same as without the guest (as in PRD 0002 AC-7).
- **AC-5** — Given a medley marked as tape, when it is split, then every part is a Performance flagged as a **Tape**. The Tape list (PRD 0002 AC-5) contains each part's title, in played order. Given a medley not marked as tape, then no part is a Tape.
- **AC-6** — Given a song that is not a snippet, whose info contains "medley" (any letter case) and whose trimmed name contains neither " / " nor " + ", when the Setlist is turned into Performances, then it becomes exactly one Performance. Its title is the trimmed name and its medley marker is the medley name, which is that same title. It is not noted. Given a song whose info contains "medley" and whose name does contain " / " or " + ", then it is split under AC-1. The info does not change the result.
- **AC-7** — Given a song that is a snippet under PRD 0002 AC-9, when the Setlist is turned into Performances, then it is noted with reason "snippet" and its raw name, and it is not split and not a Performance. This holds even when its name contains " / " or " + ", when its info also contains "medley", and when it is marked as tape.
- **AC-8** — Given a part whose title is the same as another Performance's title (another part, a song played on its own, or the same medley played again), when the Setlist is turned into Performances, then each is a separate Performance at its own position. Nothing is merged (as in PRD 0002 AC-3).
- **AC-9** — Given a Setlist, when it is turned into Performances, then medleys never appear in the noted list. "snippet" is the only reason a noted song can have, and "medley" is no longer a possible reason. A noted song's "played after" position (PRD 0002 AC-11) counts parts as Performances.

### The run and the preview

- **AC-10** — Given a kept Performance with a medley marker, when the preview is shown (PRD 0007 AC-26), then its row shows `Medley` among the markers in square brackets after the title. Markers appear in this order, separated by ", ": `Tape` (if a Tape), `Medley` (if it has a medley marker), `Cover of <Original Artist>` (if a Cover). A row with no markers has no brackets. The Match or `Miss` line under the row is unchanged.
- **AC-11** — Given a run, when the preview is passed from the core to the front-end, then each preview row includes the Performance's medley name, or says it has none. A front-end can then show the full medley (for example "Teddy Picker / Crying Lightning") next to each part.
- **AC-12** — Given a run, when the "Not added" section is shown (PRD 0007 AC-27), then it lists only noted snippets and left-out Tapes, in played order. It never lists a medley. A left-out Tape part is listed on its own as `<part title> (Tape, left out)`. Given there are no snippets and no left-out Tapes, the section is not shown.
- **AC-13** — Given a Setlist with a Tape medley, and neither `--tapes` nor `--no-tapes`, when `playset` runs, then one Tape question is asked for each Tape part, in played order, in the format of PRD 0007 AC-12 (part title, and Original Artist if a Cover). Each answer decides only that part. `--tapes` keeps every Tape part, and `--no-tapes` leaves every Tape part out, without asking.
- **AC-14** — Given a Setlist with medleys, when `playset` runs, then each part counts as one Performance everywhere in the run:
  - in the Show line's Performance and Tape counts (PRD 0007 AC-9);
  - in matching and its `n/N` progress, with one step per kept part (PRD 0007 AC-22, AC-23);
  - in the track and Miss counts (PRD 0007 AC-28);
  - in the playlist's tracks, in played order (PRD 0007 AC-31);
  - in the final Miss list, printed as `<title> — <Artist>` with ` (Cover of <Original Artist>)` for a Cover, with no medley marker (PRD 0007 AC-36).
- **AC-15** — Given any run, when `playset` runs, then no question about medleys is asked, and `--help` lists no medley option. An option such as `--no-split` or `--keep-medleys` is an unknown option, which is a usage error with exit code 2 (PRD 0007 AC-5).

## Examples

### Fixture A revisited — PRD 0002's Fixture A under the new rules (AC-1, AC-3, AC-6, AC-9)

PRD 0002's Fixture A has, in its "Acoustic" Set:

```json
{ "name": "Teddy Picker / Crying Lightning" },
{ "name": "Cornerstone", "info": "Medley with 'Fluorescent Adolescent'" }
```

Expected Performances (Artist "Arctic Monkeys" on every row; rows 1–6 are unchanged):

| Position | Title | Set label | Tape | Original Artist | Medley name |
|---|---|---|---|---|---|
| 1 | I Want It All | main | yes | Queen | — |
| 2 | Sculptures of Anything Goes | main | no | — | — |
| 3 | Brianstorm | main | no | — | — |
| 4 | Don't Sit Down 'Cause I've Moved Your Chair | main | no | — | — |
| 5 | 505 | main | no | — | — |
| 6 | Mardy Bum | Acoustic | no | — | — |
| 7 | Teddy Picker | Acoustic | no | — | Teddy Picker / Crying Lightning |
| 8 | Crying Lightning | Acoustic | no | — | Teddy Picker / Crying Lightning |
| 9 | Cornerstone | Acoustic | no | — | Cornerstone |
| 10 | I Wanna Be Yours | Encore 1 | no | — | — |
| 11 | 505 | Encore 1 | no | — | — |
| 12 | Baby, I'm Yours | Encore 1 | no | Barbara Lewis | — |
| 13 | R U Mine? | Encore 2 | no | — | — |
| 14 | Mr. Blue Sky | Encore 2 | yes | Electric Light Orchestra | — |

Noted songs: only `Hey Jude` (snippet, main, after 3). Tape list: `["I Want It All", "Mr. Blue Sky"]`.

### Fixture D revisited — PRD 0002's Fixture D under the new rules (AC-5, AC-6, AC-7, AC-9)

```json
{ "song": [
  { "name": "Even Flow" },
  { "name": "Rockin' in the Free World", "info": "MEDLEY" },
  { "name": "Kashmir / Whole Lotta Love", "info": "tease" },
  { "name": "Intro / Release", "tape": true }
] }
```

| Position | Title | Tape | Medley name |
|---|---|---|---|
| 1 | Even Flow | no | — |
| 2 | Rockin' in the Free World | no | Rockin' in the Free World |
| 3 | Intro | yes | Intro / Release |
| 4 | Release | yes | Intro / Release |

Noted: `Kashmir / Whole Lotta Love` (snippet, main, after 2). It is not split, because snippet wins. Tape list: `["Intro", "Release"]`.

### Fixture M — Pearl Jam Show with every kind of medley (AC-1 … AC-9)

```json
{
  "id": "5bf2a3c4",
  "eventDate": "08-07-2026",
  "artist": { "mbid": "83b9cbe7-9857-49e2-ab8e-b57b01038103", "name": "Pearl Jam" },
  "venue": {
    "id": "3bd6b4a8",
    "name": "Johan Cruijff ArenA",
    "city": { "id": "2759794", "name": "Amsterdam", "country": { "code": "NL", "name": "Netherlands" } }
  },
  "url": "https://www.setlist.fm/setlist/pearl-jam/2026/johan-cruijff-arena-amsterdam-netherlands-5bf2a3c4.html",
  "sets": { "set": [
    { "song": [
      { "name": "Interstellar Overdrive / Astronomy Domine", "tape": true,
        "cover": { "mbid": "83d91898-7763-47d7-b03b-b92132375c47", "name": "Pink Floyd" } },
      { "name": "Release" },
      { "name": "Daughter / W.M.A." },
      { "name": "Even Flow + Alive / Black" },
      { "name": "Jeremy", "info": "Medley with 'Footsteps'" },
      { "name": "Kashmir / Whole Lotta Love", "info": "Snippet",
        "cover": { "mbid": "678d88b2-87b0-403b-b63d-5da7465aecc3", "name": "Led Zeppelin" } },
      { "name": "Love/Hate" }
    ] },
    { "encore": 1, "song": [
      { "name": "Baba O'Riley / Won't Get Fooled Again",
        "cover": { "mbid": "9fdaa16b-a6c4-4831-b87c-bc9ca8ce7eaa", "name": "The Who" },
        "with": { "mbid": "2b4c6d8e-1f3a-4b5c-9d7e-8f0a1b2c3d4e", "name": "Josh Klinghoffer" } },
      { "name": "Black" },
      { "name": "Porch + Yellow Ledbetter", "info": "Medley" }
    ] }
  ] }
}
```

Expected Performances (Artist "Pearl Jam" on every row):

| Position | Title | Set label | Tape | Original Artist | Medley name | ACs |
|---|---|---|---|---|---|---|
| 1 | Interstellar Overdrive | main | yes | Pink Floyd | Interstellar Overdrive / Astronomy Domine | AC-1, AC-4, AC-5 |
| 2 | Astronomy Domine | main | yes | Pink Floyd | Interstellar Overdrive / Astronomy Domine | AC-1, AC-4, AC-5 |
| 3 | Release | main | no | — | — | AC-3 |
| 4 | Daughter | main | no | — | Daughter / W.M.A. | AC-1 (" / ") |
| 5 | W.M.A. | main | no | — | Daughter / W.M.A. | AC-1 |
| 6 | Even Flow | main | no | — | Even Flow + Alive / Black | AC-1 (mixed) |
| 7 | Alive | main | no | — | Even Flow + Alive / Black | AC-1 |
| 8 | Black | main | no | — | Even Flow + Alive / Black | AC-1, AC-8 |
| 9 | Jeremy | main | no | — | Jeremy | AC-6 (info only) |
| 10 | Love/Hate | main | no | — | — | AC-2 |
| 11 | Baba O'Riley | Encore 1 | no | The Who | Baba O'Riley / Won't Get Fooled Again | AC-4 (Cover, guest ignored) |
| 12 | Won't Get Fooled Again | Encore 1 | no | The Who | Baba O'Riley / Won't Get Fooled Again | AC-4 |
| 13 | Black | Encore 1 | no | — | — | AC-8 (repeat of #8) |
| 14 | Porch | Encore 1 | no | — | Porch + Yellow Ledbetter | AC-1 (" + "), AC-6 |
| 15 | Yellow Ledbetter | Encore 1 | no | — | Porch + Yellow Ledbetter | AC-1, AC-6 |

Noted songs (AC-7, AC-9): `Kashmir / Whole Lotta Love` (snippet, main, after 9).
Tape list (AC-5): `["Interstellar Overdrive", "Astronomy Domine"]`.

### Fixture N — single songs and edge cases (AC-1, AC-2, AC-4, AC-6, AC-7)

Each row is the only song of a main Set in a Setlist by "Arctic Monkeys".

| Song | Performances (title → medley name) | Noted |
|---|---|---|
| `{ "name": "Dead Star + In Your World" }` | 1 Dead Star → "Dead Star + In Your World"; 2 In Your World → same | — |
| `{ "name": "Map of the Problematique + Stockholm Syndrome / Knights of Cydonia" }` | 1 Map of the Problematique, 2 Stockholm Syndrome, 3 Knights of Cydonia, each → the full name | — |
| `{ "name": "  Do I Wanna Know? / 505  " }` | 1 Do I Wanna Know?, 2 505, each → "Do I Wanna Know? / 505" (trimmed) | — |
| `{ "name": "Alive /  + Black" }` (two spaces after "/") | 1 Alive, 2 Black, each → "Alive /  + Black" (the empty part between the separators is dropped) | — |
| `{ "name": "Release / + Outro" }` | 1 Release, 2 "+ Outro", each → "Release / + Outro" (left to right: " / " is found first and uses up the space before "+") | — |
| `{ "name": "Love/Hate" }` | 1 Love/Hate, no medley name | — |
| `{ "name": "Me+You" }` | 1 Me+You, no medley name | — |
| `{ "name": "Rearviewmirror /" }` | 1 Rearviewmirror /, no medley name | — |
| `{ "name": "TNT/Highway to Hell", "info": "Medley" }` | 1 TNT/Highway to Hell → "TNT/Highway to Hell" (info only, not split) | — |
| `{ "name": "Hysteria", "info": "MEDLEY" }` | 1 Hysteria → "Hysteria" | — |
| `{ "name": "Creep / Karma Police", "cover": { "mbid": "", "name": "" } }` | 1 Creep, 2 Karma Police, no Original Artist on either | — |
| `{ "name": "Creep / Karma Police", "with": { "name": "Thom Yorke" } }` | same as without "with" | — |
| `{ "name": "Even Flow / Alive", "info": "Teaser" }` | none | Even Flow / Alive (snippet, after 0) |
| `{ "name": "Intro / Release", "tape": true, "info": "medley, snippet" }` | none; Tape list `[]` | Intro / Release (snippet, after 0) |

### P1 — Preview for Fixture M (AC-10, AC-12, AC-13, AC-14)

`playset https://www.setlist.fm/setlist/pearl-jam/2026/johan-cruijff-arena-amsterdam-netherlands-5bf2a3c4.html`, with a cached token. The fake Spotify gives these outcomes, in played order:

| Kept # | Performance | Outcome |
|---|---|---|
| 1 | Interstellar Overdrive | Match `spotify:track:1o4Bkk7FAfpVCGzk6V6Pqd`, "Interstellar Overdrive", ["Pink Floyd"], "The Piper at the Gates of Dawn" |
| 2 | Release | Match `spotify:track:4xGvbS8NnKtwKw5CXGkmA9`, "Release", ["Pearl Jam"], "Ten" |
| 3 | Daughter | Match `spotify:track:6rSFzV1CKBFnZ1EaPvcGSh`, "Daughter", ["Pearl Jam"], "Vs." |
| 4 | W.M.A. | Match `spotify:track:0nO8qkPBSuhoN9IzxXK3Gq`, "W.M.A.", ["Pearl Jam"], "Vs." |
| 5 | Even Flow | Match `spotify:track:2pN3kBT1hYiA4bBydDMYv4`, "Even Flow", ["Pearl Jam"], "Ten" |
| 6 | Alive | Match `spotify:track:3VbM2t6DQHmPWdbTvKrNKz`, "Alive", ["Pearl Jam"], "Ten" |
| 7 | Black | Match `spotify:track:5Xak5fmy089t0FYmh3VJiY`, "Black", ["Pearl Jam"], "Ten" |
| 8 | Jeremy | Match `spotify:track:2ChmZaZVGhCSzzCV8Q1g8X`, "Jeremy", ["Pearl Jam"], "Ten" |
| 9 | Love/Hate | Miss |
| 10 | Baba O'Riley | Match `spotify:track:3qiyyUfYe7CRYLucrPmulD`, "Baba O'Riley", ["The Who"], "Who's Next" |
| 11 | Won't Get Fooled Again | Match `spotify:track:2c8Rv4kUW6SLZqVHG4Kc4d`, "Won't Get Fooled Again", ["The Who"], "Who's Next" |
| 12 | Black | Match `spotify:track:5Xak5fmy089t0FYmh3VJiY` (same as #7) |
| 13 | Porch | Match `spotify:track:1mT0w6Zm9qJ0xBJiu2rWbV`, "Porch", ["Pearl Jam"], "Ten" |
| 14 | Yellow Ledbetter | Match `spotify:track:3Tz9GjB1xNnRdC3jGcvTBn`, "Yellow Ledbetter", ["Pearl Jam"], "rearviewmirror (Greatest Hits 1991-2003)" |

```
Pearl Jam – 2026-07-08 – Johan Cruijff ArenA, Amsterdam
https://www.setlist.fm/setlist/pearl-jam/2026/johan-cruijff-arena-amsterdam-netherlands-5bf2a3c4.html
15 Performances, 2 Tapes

? Add the Tape "Interstellar Overdrive" (Pink Floyd) to the playlist? (y/N) y
? Add the Tape "Astronomy Domine" (Pink Floyd) to the playlist? (y/N) n

Finding Matches 1/14: Interstellar Overdrive
Finding Matches 2/14: Release
...
Finding Matches 14/14: Yellow Ledbetter

main
   1. Interstellar Overdrive [Tape, Medley, Cover of Pink Floyd]
      → Interstellar Overdrive — Pink Floyd · The Piper at the Gates of Dawn
   2. Release
      → Release — Pearl Jam · Ten
   3. Daughter [Medley]
      → Daughter — Pearl Jam · Vs.
   4. W.M.A. [Medley]
      → W.M.A. — Pearl Jam · Vs.
   5. Even Flow [Medley]
      → Even Flow — Pearl Jam · Ten
   6. Alive [Medley]
      → Alive — Pearl Jam · Ten
   7. Black [Medley]
      → Black — Pearl Jam · Ten
   8. Jeremy [Medley]
      → Jeremy — Pearl Jam · Ten
   9. Love/Hate
      → Miss
Encore 1
  10. Baba O'Riley [Medley, Cover of The Who]
      → Baba O'Riley — The Who · Who's Next
  11. Won't Get Fooled Again [Medley, Cover of The Who]
      → Won't Get Fooled Again — The Who · Who's Next
  12. Black
      → Black — Pearl Jam · Ten
  13. Porch [Medley]
      → Porch — Pearl Jam · Ten
  14. Yellow Ledbetter [Medley]
      → Yellow Ledbetter — Pearl Jam · rearviewmirror (Greatest Hits 1991-2003)

Not added:
  Astronomy Domine (Tape, left out)
  Kashmir / Whole Lotta Love (snippet)

Playlist: Pearl Jam – 2026-07-08 – Amsterdam (private)
13 tracks, 1 Miss

? Create this playlist? (y/N) y

Created "Pearl Jam – 2026-07-08 – Amsterdam" with 13 tracks.

1 Miss (not in the playlist):
  Love/Hate — Pearl Jam

https://open.spotify.com/playlist/2KlMnOpQrStUvWxYzAbCdE
```

Exit code 0. The add-items request carries the 13 Match URIs in kept order #1–#8, #10–#14. `5Xak5fmy089t0FYmh3VJiY` appears twice. With `--tapes`, no Tape question is asked, "Astronomy Domine [Tape, Medley, Cover of Pink Floyd]" is kept Performance #2, and "Not added" lists only the snippet. With `--no-tapes`, both Tape parts are under "Not added", each on its own line (AC-13).

In the core (AC-11), preview row 3 carries the medley name "Daughter / W.M.A.", row 8 carries "Jeremy", and rows 2, 9 and 12 carry none.

### P2 — PRD 0007's T1 under the new rules (AC-10, AC-12, AC-14)

Same set-up and answers as PRD 0007 T1 (keep "I Want It All", leave out "Mr. Blue Sky"). Fixture R is extended with:

| Performance | Outcome |
|---|---|
| Teddy Picker | Match `spotify:track:0BxE4FqsDD1Ot4YuBXwAPp`, "Teddy Picker", ["Arctic Monkeys"], "Favourite Worst Nightmare" |
| Crying Lightning | Match `spotify:track:4nDOavRzjNNwUcCkhnLkBX`, "Crying Lightning", ["Arctic Monkeys"], "Humbug" |
| Cornerstone | Match `spotify:track:5bdQGzFFHSKZtIkwfP8BaN`, "Cornerstone", ["Arctic Monkeys"], "Humbug" |

The parts of T1's output that change:

```
Arctic Monkeys – 2025-08-23 – Ziggo Dome, Amsterdam
https://www.setlist.fm/setlist/arctic-monkeys/2025/ziggo-dome-amsterdam-netherlands-63a5e2b7.html
14 Performances, 2 Tapes
...
Finding Matches 1/13: I Want It All
...
Finding Matches 7/13: Teddy Picker
Finding Matches 8/13: Crying Lightning
Finding Matches 9/13: Cornerstone
Finding Matches 10/13: I Wanna Be Yours
...
Finding Matches 13/13: R U Mine?
...
Acoustic
   6. Mardy Bum
      → Mardy Bum — Arctic Monkeys · Whatever People Say I Am, That's What I'm Not
   7. Teddy Picker [Medley]
      → Teddy Picker — Arctic Monkeys · Favourite Worst Nightmare
   8. Crying Lightning [Medley]
      → Crying Lightning — Arctic Monkeys · Humbug
   9. Cornerstone [Medley]
      → Cornerstone — Arctic Monkeys · Humbug
Encore 1
  10. I Wanna Be Yours
      → I Wanna Be Yours — Arctic Monkeys · AM
  11. 505
      → 505 — Arctic Monkeys · Favourite Worst Nightmare
  12. Baby, I'm Yours [Cover of Barbara Lewis]
      → Miss
Encore 2
  13. R U Mine?
      → R U Mine? — Arctic Monkeys · AM

Not added:
  Hey Jude (snippet)
  Mr. Blue Sky (Tape, left out)

Playlist: Arctic Monkeys – 2025-08-23 – Amsterdam (private)
12 tracks, 1 Miss
...
Created "Arctic Monkeys – 2025-08-23 – Amsterdam" with 12 tracks.
```

The add-items request carries 12 URIs. The three new ones (`0BxE4FqsDD1Ot4YuBXwAPp`, `4nDOavRzjNNwUcCkhnLkBX`, `5bdQGzFFHSKZtIkwfP8BaN`) come right after `0kqA4Fm1Jj6GdW4Ws9bNXa` (Mardy Bum). Rows 1–5 and the Miss list are the same as in T1.

PRD 0007 T2 (dry run, `--no-tapes`) becomes: `14 Performances, 2 Tapes`, progress `1/12` … `12/12`, preview rows 1–12, "Not added" = `I Want It All (Tape, left out)`, `Hey Jude (snippet)`, `Mr. Blue Sky (Tape, left out)`, and `11 tracks, 1 Miss`.

PRD 0007 E18 (core with fakes) becomes: 13 progress steps (1/13 … 13/13); one preview with 13 rows, 2 not-added entries, 12 tracks, 1 Miss and 1 duplicate; outcome "created" with 12 tracks and 1 Miss.

### P3 — No medley option (AC-15)

```
$ playset --keep-medleys "Pearl Jam"
[stderr] Unknown option `--keep-medleys`.
[stderr] Usage: playset [options] <setlist.fm link | Artist name...>
```

Exit code 2, no request. `playset --help` prints the same options as PRD 0007 T4, with nothing about medleys. No run of P1 or P2 asks a question about medleys.

### AC coverage

| AC | Examples |
|---|---|
| AC-1 | Fixture A revisited, Fixture D revisited, Fixture M, Fixture N |
| AC-2 | Fixture M (#10), Fixture N (Love/Hate, Me+You, Rearviewmirror /) |
| AC-3 | Fixture A revisited, Fixture M |
| AC-4 | Fixture M (#1–2, #11–12), Fixture N (Creep / Karma Police rows) |
| AC-5 | Fixture D revisited, Fixture M (#1–2) |
| AC-6 | Fixture A revisited (Cornerstone), Fixture D revisited, Fixture M (#9, #14–15), Fixture N (TNT/Highway to Hell, Hysteria) |
| AC-7 | Fixture D revisited, Fixture M (Kashmir), Fixture N (last two rows) |
| AC-8 | Fixture M (#8 and #13) |
| AC-9 | Fixture A revisited, Fixture D revisited, Fixture M |
| AC-10 | P1, P2 |
| AC-11 | P1 (core rows) |
| AC-12 | P1, P2 |
| AC-13 | P1 |
| AC-14 | P1, P2 |
| AC-15 | P3 |

## Changes to earlier PRDs

This PRD changes behaviour that PRDs 0002, 0005 and 0007 defined. Where they disagree, this PRD wins.

**PRD 0002 — Turn a Setlist into Performances**

- **AC-10 is superseded in full** by AC-1, AC-2, AC-3, AC-6 and AC-7 of this PRD. A name with " / " is now split, " + " is a separator too, and an info-only medley becomes one Performance instead of a noted song.
- **AC-11 is amended.** The reason can only be "snippet" (AC-9 here). The clause "a song that is both a snippet and a medley is noted once, with reason snippet" is replaced by AC-7 here. The rest stays: raw name, Set label, "played after" position, and the rule that songs marked as tape are noted too.
- **AC-5 stays as written.** Its Tape list now also contains Tape parts (AC-5 here).
- **Goal** (second bullet), **Non-goal "No medley splitting"** and the medley half of the fourth user story are superseded.
- **Examples:** the expected Performances and noted songs of **Fixture A** and the expected result of **Fixture D** are replaced by "Fixture A revisited" and "Fixture D revisited" above. Fixtures B, C, E, F and G are unchanged.
- The CLAUDE.md shared-file request of PRD 0002 ("medleys are noted but never become Performances … medleys are not split") is superseded by the request below.

**PRD 0007 — The `playset` command**

- **AC-26 is amended** by AC-10 here. The marker list gains `Medley`, in the order `Tape`, `Medley`, `Cover of <Original Artist>`.
- **AC-27 is amended** by AC-12 here. Noted songs show only the reason `snippet`, and medleys are never listed.
- **Non-goal "No medley splitting and no snippets in the playlist"** becomes "No snippets in the playlist".
- **Examples:** the expected output of **T1**, **T2** and **E18** changes as shown in P2. The other examples are unchanged.
- The CLAUDE.md request of PRD 0007 to say "medleys are noted, never added, and medleys are not split" is superseded by the request below.

**PRD 0005 — Find the Latest Setlist by Artist name**

- **AC-18 is amended.** Setlists are skipped only when their songs are all snippets or songs with no name (or they have no Sets). A setlist whose only songs are medleys now has **Performances** (its split parts or info-only medleys, AC-1 and AC-6 here), so it is not skipped and can be the **Latest Setlist**. No setlist.fm code changes: the check already turns the setlist into **Performances** with PRD 0002's rules.

Existing tests that cite PRD 0002 AC-10 or AC-11, Fixture A's or Fixture D's expected output, PRD 0005 AC-18's medley-only case, or PRD 0007 AC-26, AC-27, T1, T2 or E18 must change to match this PRD. These test changes are part of this Slice and must be visible in its PR.

## Glossary terms used

- **Setlist** — as defined in GLOSSARY.md.
- **Show** — as defined in GLOSSARY.md.
- **Artist** — as defined in GLOSSARY.md.
- **Set** — as defined in GLOSSARY.md.
- **Encore** — as defined in GLOSSARY.md (through the "Encore n" Set labels).
- **Performance** — as defined in GLOSSARY.md.
- **Tape** — as defined in GLOSSARY.md.
- **Cover** — as defined in GLOSSARY.md.
- **Original Artist** — as defined in GLOSSARY.md.
- **Setlist Playlist** — as defined in GLOSSARY.md.
- **Match** — as defined in GLOSSARY.md.
- **Miss** — as defined in GLOSSARY.md.

"Medley", "part", "medley name", "medley marker", "snippet", "noted song", "preview" and "kept Performance" are used in their plain-English sense or as defined in PRDs 0002 and 0007. They are not glossary terms, and no new glossary term is proposed.

## Shared-file requests

For the orchestrator (this Slice does not edit shared files):

- **CLAUDE.md** — under "Product rules", replace "Medleys split best-effort." (and any wording from the PRD 0002/0007 requests that says medleys are only noted) with: "Medleys are always split: a song name containing ' / ' or ' + ' (space on both sides) becomes one Performance per part, in its place, each with the medley's Cover and Tape flags; a song marked medley only in its info stays one Performance. Snippets/teasers are noted, never added, and win over medleys."
- **docs/PLAN.md** — add Slice rows:
  - `| 8 | Split medleys into Performances (' / ' and ' + ') | 2, 7 |`
  - `| 9 | Interactive shell: \`playset\` with no arguments opens its own prompt session | 7, 8 |`
  
  Add the Waves that follow from them: Wave 4 is Slice 8, and Wave 5 is Slice 9.
- **GLOSSARY.md** — no change.
- **src/core/index.ts** — no new entry point. If the Performance and preview-row shapes are exported from there, they now include the medley name.
- **docs/prd/0002-performances.md and docs/prd/0007-cli.md** — optionally add a line under their Status: "Partly superseded by PRD 0008 (medleys)."

## Open questions

(none)
