# PRD 0001 — Read the setlist id from a setlist.fm link

Status: Implemented
Slice: 1
Depends on: none
Module: src/core/setlist-link

## Problem

A concert-goer often starts from a setlist.fm page they already have open: the **Setlist** of one **Show** by an **Artist**. To build a **Setlist Playlist** from it, Playset needs the setlist.fm id of that **Setlist**, which sits in the link as the hex segment just before `.html`. People paste these links in many shapes: with or without `https://`, with `www.` or a language subdomain, with tracking query strings, with stray spaces. Today nothing reads that id, and nothing tells a link apart from an **Artist** name typed on the command line.

## Goal

Given any text the user typed, Playset can (a) cheaply tell whether it looks like a setlist.fm link at all, and (b) for a setlist.fm link to a **Setlist** page, return that **Setlist**'s id, or a clear, user-readable error that says why the link cannot be used.

## Non-goals

- No network calls of any kind. The link is never opened, and the id is never checked against setlist.fm.
- No fetching of the **Setlist**, its **Sets** or its **Performances** (Slice 2 and the CLI do that).
- No **Artist** name search and no **Latest Setlist** lookup (Slice 4).
- No deciding, inside this feature, what to do with an input that does not look like a setlist.fm link; the CLI (Slice 7) decides to treat it as an **Artist** name.
- No support for links from other sites (Spotify, songkick, short-link services such as `bit.ly`), even if they eventually redirect to setlist.fm.
- No support for setlist.fm links that carry an explicit port, user info, or IP-address host. Such inputs are rejected or treated as not setlist.fm, as described below.
- No building of setlist.fm links from an id (attribution links are written by Slice 6 from data it already has).
- Input is one string. Several links in one input are not split apart.

## User stories

- As a concert-goer, I want to paste the setlist.fm link of the **Show** I care about, in whatever form my browser gave it to me, so that Playset builds the **Setlist Playlist** from exactly that **Setlist**.
- As a concert-goer, I want a clear message when I paste the wrong kind of setlist.fm page (an **Artist** page, a venue page, a search), so that I know to open the **Setlist** itself and copy that link.
- As a concert-goer, I want to type just an **Artist** name instead of a link, so that Playset can tell the two apart and look up the **Latest Setlist** for me.

## Definitions used in this PRD

These are descriptions of URL shapes, not new domain terms.

- **setlist.fm host** — after lower-casing, the host is exactly `setlist.fm` or ends with `.setlist.fm` (for example `www.setlist.fm`, `de.setlist.fm`, `fr.setlist.fm`). Any other host, including `setlist.fm.evil.com` and `evilsetlist.fm`, is not a setlist.fm host.
- **Setlist page path** — the first path segment is `setlist` (singular), and the last path segment ends with `.html`. Example: `/setlist/radiohead/2025/o2-arena-london-england-6bb4a2fe.html`.
- **setlist id** — the run of hexadecimal characters (`0-9`, `a-f`, either case) between the last `-` of the last path segment and `.html`. It is returned in lower case.

## Acceptance criteria

Reading the setlist id:

- **AC-1** — Given a full `https://www.setlist.fm/setlist/…-<hex>.html` link to a **Setlist** page, when the setlist id is read, then the hex segment before `.html` is returned.
- **AC-2** — Given a link to a **Setlist** page that uses `http` instead of `https`, when the setlist id is read, then the same id is returned as for the `https` form.
- **AC-3** — Given a link to a **Setlist** page whose host is `setlist.fm` without `www.`, when the setlist id is read, then the same id is returned as for the `www.` form.
- **AC-4** — Given a link to a **Setlist** page on a language subdomain (such as `de.setlist.fm` or `fr.setlist.fm`), when the setlist id is read, then the same id is returned as for the `www.` form.
- **AC-5** — Given a link to a **Setlist** page with no scheme at all (starting with `www.setlist.fm/…` or `setlist.fm/…`), when the setlist id is read, then the id is returned.
- **AC-6** — Given a link to a **Setlist** page surrounded by spaces, tabs or newlines, when the setlist id is read, then the surrounding whitespace is ignored and the id is returned.
- **AC-7** — Given a link to a **Setlist** page followed by a `?query`, a `#hash`, or both, when the setlist id is read, then the query and hash are ignored and the id is returned.
- **AC-8** — Given a link to a **Setlist** page whose scheme and/or host are written in upper or mixed case, when the setlist id is read, then the id is returned.
- **AC-9** — Given a link to a **Setlist** page whose id contains upper-case hex letters, when the setlist id is read, then the id is returned in lower case.

Rejecting unusable input (each rejection is an error that is distinguishable from any other kind of failure, carries one of the four reasons below, and has a message a concert-goer can act on without knowing anything about URLs' internals):

- **AC-10** — Given an empty string or a string of only whitespace, when the setlist id is read, then it is rejected with reason **empty**, and the message asks for a setlist.fm link.
- **AC-11** — Given a link whose host is not a setlist.fm host (another site, or a lookalike such as `setlist.fm.evil.com`, `evilsetlist.fm`, `https://setlist.fm@evil.com/…`, or `https://evil.com/setlist.fm/setlist/…`), when the setlist id is read, then it is rejected with reason **not-setlist-fm**, and the message says the link is not a setlist.fm link.
- **AC-12** — Given a link on a setlist.fm host whose path is not a Setlist page path (an **Artist** page under `/setlists/…`, a venue page, a search page, the home page), when the setlist id is read, then it is rejected with reason **not-a-setlist-page**, and the message tells the user to open the **Setlist** of the **Show** and copy its link. This holds even when the page's own path ends in `-<hex>.html` (for example an **Artist** page).
- **AC-13** — Given a link on a setlist.fm host with a Setlist page path whose last segment has no hex segment between its last `-` and `.html` (no `-` at all, nothing after the `-`, or non-hex characters such as `g` or `z`), when the setlist id is read, then it is rejected with reason **missing-id**, and the message says the link has no setlist id and may be incomplete.
- **AC-14** — Given any input that is not plain text that looks like a link (for example an **Artist** name such as `Radiohead`), when the setlist id is read, then it is rejected with reason **not-setlist-fm** (reading the id never falls back to treating input as an **Artist** name).

Telling a link from an **Artist** name:

- **AC-15** — Given an input whose host (after trimming whitespace, with or without a scheme, in any case) is a setlist.fm host, when it is checked for looking like a setlist.fm link, then the answer is yes, regardless of whether the path is a Setlist page path or carries a valid setlist id.
- **AC-16** — Given an **Artist** name (including names with punctuation, spaces, dots or non-Latin letters), an empty or whitespace-only string, a link to a non-setlist.fm host, or a lookalike host, when it is checked for looking like a setlist.fm link, then the answer is no.
- **AC-17** — Given any input, when it is checked for looking like a setlist.fm link, then the check never fails with an error; it only answers yes or no.

Purity:

- **AC-18** — Given any input, when the setlist id is read or the input is checked for looking like a setlist.fm link, then no network request is made, and the same input always gives the same result.

## Examples

### Reading the setlist id

| # | Input (shown between `⟨ ⟩` to make whitespace visible) | Result | AC |
|---|---|---|---|
| 1 | ⟨`https://www.setlist.fm/setlist/radiohead/2025/o2-arena-london-england-6bb4a2fe.html`⟩ | id `6bb4a2fe` | AC-1 |
| 2 | ⟨`https://www.setlist.fm/setlist/the-cure/2023/the-forum-inglewood-ca-3bd6c8a4.html`⟩ | id `3bd6c8a4` | AC-1 |
| 3 | ⟨`https://www.setlist.fm/setlist/bjork/2007/dour-festival-dour-belgium-7bd6e2c8.html`⟩ | id `7bd6e2c8` | AC-1 |
| 4 | ⟨`http://www.setlist.fm/setlist/radiohead/2025/o2-arena-london-england-6bb4a2fe.html`⟩ | id `6bb4a2fe` | AC-2 |
| 5 | ⟨`https://setlist.fm/setlist/radiohead/2025/o2-arena-london-england-6bb4a2fe.html`⟩ | id `6bb4a2fe` | AC-3 |
| 6 | ⟨`https://de.setlist.fm/setlist/radiohead/2025/o2-arena-london-england-6bb4a2fe.html`⟩ | id `6bb4a2fe` | AC-4 |
| 7 | ⟨`https://fr.setlist.fm/setlist/radiohead/2025/o2-arena-london-england-6bb4a2fe.html`⟩ | id `6bb4a2fe` | AC-4 |
| 8 | ⟨`www.setlist.fm/setlist/radiohead/2025/o2-arena-london-england-6bb4a2fe.html`⟩ | id `6bb4a2fe` | AC-5 |
| 9 | ⟨`setlist.fm/setlist/radiohead/2025/o2-arena-london-england-6bb4a2fe.html`⟩ | id `6bb4a2fe` | AC-5 |
| 10 | ⟨`   https://www.setlist.fm/setlist/radiohead/2025/o2-arena-london-england-6bb4a2fe.html  `⟩ | id `6bb4a2fe` | AC-6 |
| 11 | ⟨`\thttps://www.setlist.fm/setlist/radiohead/2025/o2-arena-london-england-6bb4a2fe.html\n`⟩ (tab before, newline after) | id `6bb4a2fe` | AC-6 |
| 12 | ⟨`https://www.setlist.fm/setlist/radiohead/2025/o2-arena-london-england-6bb4a2fe.html?utm_source=share&utm_medium=ios`⟩ | id `6bb4a2fe` | AC-7 |
| 13 | ⟨`https://www.setlist.fm/setlist/radiohead/2025/o2-arena-london-england-6bb4a2fe.html#encore`⟩ | id `6bb4a2fe` | AC-7 |
| 14 | ⟨`https://www.setlist.fm/setlist/radiohead/2025/o2-arena-london-england-6bb4a2fe.html?ref=app#top`⟩ | id `6bb4a2fe` | AC-7 |
| 15 | ⟨`HTTPS://WWW.SETLIST.FM/setlist/radiohead/2025/o2-arena-london-england-6bb4a2fe.html`⟩ | id `6bb4a2fe` | AC-8 |
| 16 | ⟨`https://Www.SetList.fm/setlist/radiohead/2025/o2-arena-london-england-6bb4a2fe.html`⟩ | id `6bb4a2fe` | AC-8 |
| 17 | ⟨`https://www.setlist.fm/setlist/radiohead/2025/o2-arena-london-england-6BB4A2FE.html`⟩ | id `6bb4a2fe` | AC-9 |

### Rejections

| # | Input | Result | AC |
|---|---|---|---|
| 18 | ⟨``⟩ (empty string) | error, reason **empty** | AC-10 |
| 19 | ⟨`   `⟩ (spaces only) | error, reason **empty** | AC-10 |
| 20 | ⟨`\n\t`⟩ (newline and tab only) | error, reason **empty** | AC-10 |
| 21 | ⟨`https://setlist.fm.evil.com/setlist/radiohead/2025/o2-arena-london-england-6bb4a2fe.html`⟩ | error, reason **not-setlist-fm** | AC-11 |
| 22 | ⟨`https://evilsetlist.fm/setlist/radiohead/2025/o2-arena-london-england-6bb4a2fe.html`⟩ | error, reason **not-setlist-fm** | AC-11 |
| 23 | ⟨`https://setlist.fm@evil.com/setlist/radiohead/2025/o2-arena-london-england-6bb4a2fe.html`⟩ | error, reason **not-setlist-fm** | AC-11 |
| 24 | ⟨`https://evil.com/setlist.fm/setlist/radiohead/2025/o2-arena-london-england-6bb4a2fe.html`⟩ | error, reason **not-setlist-fm** | AC-11 |
| 25 | ⟨`https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M`⟩ | error, reason **not-setlist-fm** | AC-11 |
| 26 | ⟨`https://www.songkick.com/concerts/41234567-radiohead-at-o2-arena`⟩ | error, reason **not-setlist-fm** | AC-11 |
| 27 | ⟨`https://www.setlist.fm/setlists/radiohead-bd6bd12.html`⟩ (**Artist** page; ends in hex but is not a **Setlist** page) | error, reason **not-a-setlist-page** | AC-12 |
| 28 | ⟨`https://www.setlist.fm/venue/o2-arena-london-england-6bd6ca6e.html`⟩ (venue page) | error, reason **not-a-setlist-page** | AC-12 |
| 29 | ⟨`https://www.setlist.fm/search?query=radiohead`⟩ (search page) | error, reason **not-a-setlist-page** | AC-12 |
| 30 | ⟨`https://www.setlist.fm/`⟩ (home page) | error, reason **not-a-setlist-page** | AC-12 |
| 31 | ⟨`setlist.fm`⟩ (host only) | error, reason **not-a-setlist-page** | AC-12 |
| 32 | ⟨`https://www.setlist.fm/setlist/radiohead/2025/o2-arena-london-england.html`⟩ (no `-<hex>`; last `-` is followed by `england`, which is not hex) | error, reason **missing-id** | AC-13 |
| 33 | ⟨`https://www.setlist.fm/setlist/radiohead/2025/o2-arena-london-england-.html`⟩ (nothing after the last `-`) | error, reason **missing-id** | AC-13 |
| 34 | ⟨`https://www.setlist.fm/setlist/radiohead/2025/o2-arena-london-england-6bb4a2fz.html`⟩ (`z` is not hex) | error, reason **missing-id** | AC-13 |
| 35 | ⟨`https://www.setlist.fm/setlist/radiohead/2025/live.html`⟩ (no `-` in the last segment) | error, reason **missing-id** | AC-13 |
| 36 | ⟨`Radiohead`⟩ | error, reason **not-setlist-fm** | AC-14 |
| 37 | ⟨`Sigur Rós`⟩ | error, reason **not-setlist-fm** | AC-14 |

Example messages (wording may vary; each must be readable without URL knowledge and name what to do next):

- **empty** — "Please give a setlist.fm link or an Artist name."
- **not-setlist-fm** — "That is not a setlist.fm link: `https://evilsetlist.fm/…`."
- **not-a-setlist-page** — "That setlist.fm page is not a Setlist. Open the Setlist of the Show on setlist.fm and copy its link."
- **missing-id** — "That setlist.fm link has no setlist id at the end. It may have been cut off; copy the full link again."

### Telling a link from an Artist name

| # | Input | Looks like a setlist.fm link? | AC |
|---|---|---|---|
| 38 | ⟨`https://www.setlist.fm/setlist/radiohead/2025/o2-arena-london-england-6bb4a2fe.html`⟩ | yes | AC-15 |
| 39 | ⟨`  setlist.fm/setlist/radiohead/2025/o2-arena-london-england-6bb4a2fe.html `⟩ | yes | AC-15 |
| 40 | ⟨`HTTPS://DE.SETLIST.FM/setlist/radiohead/2025/o2-arena-london-england-6bb4a2fe.html`⟩ | yes | AC-15 |
| 41 | ⟨`https://www.setlist.fm/setlists/radiohead-bd6bd12.html`⟩ (Artist page) | yes | AC-15 |
| 42 | ⟨`https://www.setlist.fm/search?query=radiohead`⟩ | yes | AC-15 |
| 43 | ⟨`https://www.setlist.fm/setlist/radiohead/2025/o2-arena-london-england.html`⟩ (missing id) | yes | AC-15 |
| 44 | ⟨`Radiohead`⟩ | no | AC-16 |
| 45 | ⟨`The Cure`⟩ | no | AC-16 |
| 46 | ⟨`Panic! at the Disco`⟩ | no | AC-16 |
| 47 | ⟨`Sunn O)))`⟩ | no | AC-16 |
| 48 | ⟨`Sigur Rós`⟩ | no | AC-16 |
| 49 | ⟨`AC/DC`⟩ | no | AC-16 |
| 50 | ⟨`R.E.M.`⟩ | no | AC-16 |
| 51 | ⟨`will.i.am`⟩ | no | AC-16 |
| 52 | ⟨``⟩ (empty) | no | AC-16 |
| 53 | ⟨`   `⟩ (spaces only) | no | AC-16 |
| 54 | ⟨`https://open.spotify.com/artist/4Z8W4fKeB5YxbusRsdQVPb`⟩ | no | AC-16 |
| 55 | ⟨`https://setlist.fm.evil.com/setlist/radiohead/2025/o2-arena-london-england-6bb4a2fe.html`⟩ | no | AC-16 |
| 56 | ⟨`evilsetlist.fm/setlist/radiohead/2025/o2-arena-london-england-6bb4a2fe.html`⟩ | no | AC-16 |
| 57 | ⟨`https://setlist.fm@evil.com/setlist/radiohead/2025/o2-arena-london-england-6bb4a2fe.html`⟩ | no | AC-16 |
| 58 | ⟨`%%%://///`⟩ (malformed) | no, and no error | AC-17 |
| 59 | ⟨`http://`⟩ (scheme only) | no, and no error | AC-17 |

### Purity

| # | Scenario | Result | AC |
|---|---|---|---|
| 60 | Example 1 is read 3 times in a row with all network access unavailable | id `6bb4a2fe` each time; no network request attempted | AC-18 |
| 61 | Example 44 is checked 3 times in a row with all network access unavailable | no each time; no network request attempted | AC-18 |

## Glossary terms used

- **Setlist** — the published, ordered list of what an Artist played at one Show, as recorded on setlist.fm.
- **Show** — one performance by an Artist on a specific date at a specific venue.
- **Artist** — the performer the Setlist belongs to.
- **Set** — one labelled section of a Setlist.
- **Performance** — a single slot in a Setlist where a song was played.
- **Latest Setlist** — the most recent Setlist for an Artist that contains at least one Performance.
- **Setlist Playlist** — a newly created Spotify playlist that mirrors one Setlist in played order.

## Open questions

(none)
