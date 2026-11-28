# Playset — Design
Status: Approved

The look of the Playset web app (visitor pages and `/admin`). Implementers build from this file without asking; `.claude/rules/web-client.md` applies on top. UI words follow `GLOSSARY.md`.

## 1. Concept: the sheet taped to the stage floor

Before a Show, the Artist's crew prints the Setlist and tapes it to the stage floor next to each monitor: one song per line, big condensed letters readable from two metres away, numbered in played order, the Encore under its own heading, held down with a strip of fluorescent spike tape. Playset gives the visitor that same sheet the day before the Show, with each line now pointing at a Spotify track.

- **The memorable thing is the Setlist sheet** in the Preview: song titles set large in a condensed display face, played-order numbers in a fixed column, Sets as headings, the Match quietly under each title. Everything else (forms, lists, footer, admin) stays calm and plain so the sheet carries the page.
- **Spike pink is the only loud colour.** It marks the one action that matters on a screen (Search, Open, Create playlist, Update playlist) and the focus ring. Nothing decorative is pink.
- **Paper and ink, not cards.** Content sits on the page surface, separated by hairline rules and spacing, like a printed sheet. No boxed card grid.
- **Light or dark follows the visitor's system** (`prefers-color-scheme`). The use scene sets this: planning at a desk by day (light paper), or checking the Setlist in the queue outside the venue at night (dark stage-floor slate). No manual toggle (see Open decisions).
- **Left-aligned everything.** A Setlist is read top to bottom down a left edge; text is never centred, never justified.

## 2. Colour tokens

Six base tokens, light and dark. Set them on `:root` with `color-scheme: light dark`; the dark values go under `@media (prefers-color-scheme: dark)`. Components use only the tokens (base and derived), never raw hex.

| Token | Role | Light | Dark |
|---|---|---|---|
| `--color-paper` | Page background, input background | `#F2F4F7` | `#1B2130` |
| `--color-ink` | Body text, headings, strong borders | `#1A2233` | `#E9EDF3` |
| `--color-ink-soft` | Secondary text, placeholders, input and control borders, icons | `#4B5568` | `#A9B2C1` |
| `--color-rule` | Hairline dividers only (decorative, never the only boundary of a control) | `#C9CFD8` | `#3A4356` |
| `--color-spike` | Primary action background, focus ring, links on hover, progress bar | `#B5135F` | `#FF7EB8` |
| `--color-caution` | Miss, Incomplete Setlist, errors, rate limits | `#8A5300` | `#F2B455` |

Derived tokens (precomputed; use these hex values, don't compute with `color-mix` at runtime so the checked ratios hold):

| Token | Role | Light | Dark |
|---|---|---|---|
| `--color-on-spike` | Text/icons on a spike background | `#FFFFFF` | `#1B2130` |
| `--color-spike-hover` | Primary button hover/active | `#961656` | `#FF9ECA` |
| `--color-sunk` | Hover row, secondary-button hover, disabled background, progress track, table stripes | `#E7E9ED` | `#252B3A` |
| `--color-caution-tint` | Background of Miss rows, caution alerts, Incomplete badge | `#E8E4DE` | `#303034` |
| `--color-spike-tint` | Text selection background | `#EDE2EB` | `#2D283B` |

### Contrast (WCAG 2.x relative luminance, computed)

Text needs 4.5:1 (all text here is checked at that bar, including large text). UI boundaries and focus indicators need 3:1.

| Pair | Light | Dark |
|---|---|---|
| ink on paper | 14.43 | 13.68 |
| ink on sunk | 13.08 | 12.03 |
| ink on caution-tint | 12.56 | 11.18 |
| ink on spike-tint (selection) | 12.63 | 12.09 |
| ink-soft on paper | 6.81 | 7.52 |
| ink-soft on sunk (disabled text) | 6.17 | 6.61 |
| ink-soft on caution-tint | 5.93 | 6.15 |
| spike on paper (link hover text, focus ring) | 5.91 | 6.83 |
| spike on sunk | 5.36 | 6.01 |
| caution on paper | 5.74 | 8.75 |
| caution on caution-tint | 5.00 | 7.16 |
| on-spike on spike (primary button) | 6.52 | 6.83 |
| on-spike on spike-hover | 8.25 | 8.41 |
| ink-soft border on paper (inputs, secondary buttons) | 6.81 | 7.52 |
| rule on paper | 1.42 | 1.62 — decorative only, never a control boundary |

Never use `--color-spike` or `--color-caution` text on a spike or caution background, and never put text on `--color-rule`.

### Browser surfaces
- `::selection`: background `--color-spike-tint`, color `--color-ink`.
- `caret-color: var(--color-spike)` on inputs.
- `scrollbar-color: var(--color-ink-soft) var(--color-paper)`.
- Links: `text-decoration-thickness: 1px; text-underline-offset: 0.18em`; hover → thickness 2px and colour `--color-spike`.
- `accent-color: var(--color-spike)`.
- `<meta name="theme-color">` twice, with `media` for light (`#F2F4F7`) and dark (`#1B2130`).

## 3. Type, spacing, radius, motion

### Fonts (self-hosted through Fontsource, no third-party requests)

| Role | Package | Import | Weights used |
|---|---|---|---|
| Display: wordmark, screen headings, Artist names, song titles in the Setlist sheet, Set headings, date day numbers | `@fontsource-variable/big-shoulders-display` | `import '@fontsource-variable/big-shoulders-display';` (family `'Big Shoulders Display Variable'`) | 600, 800 |
| Text: everything else (body, labels, buttons, inputs, Match lines, tables) | `@fontsource-variable/atkinson-hyperlegible-next` | `import '@fontsource-variable/atkinson-hyperlegible-next';` (family `'Atkinson Hyperlegible Next Variable'`) | 400, 700 |

Why: Big Shoulders is a condensed signage face (road-case stencils, venue marquees) that fits long song titles on one line at a large size; Atkinson Hyperlegible Next was drawn for legibility, which matters for small Match lines read on a phone in a crowd. Import the package root (all subsets, `unicode-range` loads only what is used) so Artist names like "Sigur Rós" or "Mötley Crüe" render in the same face.

Tokens:
- `--font-display: 'Big Shoulders Display Variable', 'Arial Narrow', sans-serif;`
- `--font-text: 'Atkinson Hyperlegible Next Variable', system-ui, sans-serif;`
- Numbers in dates, counts, countdowns and tables: `font-variant-numeric: tabular-nums` (Atkinson Next has `tnum`; Big Shoulders does not, so the played-order number column has a fixed width and is right-aligned).

### Type scale

Root font size stays the browser default (16px). Sizes in rem so visitor zoom works.

| Token (size / line-height) | Value | Face, weight | Used for |
|---|---|---|---|
| `--text-xs` / `--leading-xs` | 0.8125rem / 1.25rem | text 700 | Badges, month+year under date numbers |
| `--text-sm` / `--leading-sm` | 0.9375rem / 1.375rem | text 400/700 | Labels (700), Match lines, hints, footer, table cells |
| `--text-base` / `--leading-base` | 1.0625rem / 1.625rem | text 400/700 | Body, inputs, buttons (700), venue names (700) |
| `--text-lg` / `--leading-lg` | 1.5rem / 1.625rem | display 600 | Song titles in the sheet, candidate Artist names, Set headings (800) |
| `--text-xl` / `--leading-xl` | 2rem / 2.125rem | display 800 | Screen headings (h1 on mobile), wordmark, date day number |
| `--text-2xl` / `--leading-2xl` | 2.75rem / 2.75rem | display 800 | Artist name heading on mobile, Start headline on mobile |
| `--text-3xl` / `--leading-3xl` | 4rem / 3.75rem | display 800 | Artist name / Start headline at ≥ 64rem |

- Tracking: display 0 (never below −0.01em); text 0. No all-caps anywhere (labels, badges, headings are sentence case or the name as given).
- `text-wrap: balance` on h1/h2; `text-wrap: pretty` on paragraphs.
- Body measure: `--measure: 68ch` max on paragraphs, alerts, Terms text.
- Headings get more space above than below (`margin-block: var(--space-6) var(--space-3)` for h2).

### Spacing (4px base)

`--space-1: 0.25rem` · `--space-2: 0.5rem` · `--space-3: 0.75rem` · `--space-4: 1rem` · `--space-5: 1.5rem` · `--space-6: 2rem` · `--space-7: 3rem` · `--space-8: 4rem`

Layout sizes (added while building the client): `--row-h: 4.5rem` (Setlist list row height), `--row-h-artist: 3.5rem` (Artist candidate row height), `--main-min-h: 60vh` (main area minimum height), `--col-number`, `--col-date`, `--col-date-wide` (sheet and list columns, matching the 3ch / 3.5rem / 4.5rem in the wireframes), `--underline-offset`.

Layout tokens: `--gutter: var(--space-4)` (16px at 375), `--gutter-wide: var(--space-6)` at ≥ 48rem; `--page-max: 72rem`; `--flow-max: 44rem` (single-column screens); `--rail: 20rem` (Preview side rail at ≥ 64rem); `--target: 2.75rem` (44px minimum touch target); `--control-h: 3rem` (48px inputs and buttons).

Breakpoints (media queries cannot read custom properties; use these constants): base = 375px and up; `@media (min-width: 48rem)` tablet; `@media (min-width: 64rem)` desktop.

### Radius
- `--radius-none: 0` — the Setlist sheet, list rows, alerts, panels, progress bar, tables (it's paper).
- `--radius-control: 4px` — buttons, inputs.
- `--radius-badge: 2px` — badges.
No pill shapes, no large rounded corners.

### Border
- `--border-hair: 1px solid var(--color-rule)` dividers.
- `--border-control: 1px solid var(--color-ink-soft)` inputs, secondary buttons.
- `--border-strong: 2px solid var(--color-ink)` the Playlist created panel.

### Shadow
- `--shadow-bar` — only on the mobile sticky action bar (it floats above the sheet). Light: `0 -2px 12px #1A22331F`; dark: `0 -2px 12px #0000004D`. Nothing else has a shadow.

### Motion
- `--ease-out: cubic-bezier(0.16, 1, 0.3, 1)` (exponential ease-out).
- `--dur-quick: 120ms` — colour changes on hover/press.
- `--dur-reveal: 240ms` — the one authored moment.
- **The authored moment:** as Matching finishes for a Performance (or once, when the sheet first renders if results arrive together), its Match line goes from `opacity: 0.35` to 1 over `--dur-reveal`. The row itself is always visible (already-visible default); only the Match line "inks in". No entrance animations anywhere else, no hover lifts, no scroll effects.
- Spinner (`LoaderCircle`) rotates 1 turn / 900ms linear while something is loading.
- Progress bar value changes transition `inline-size` over `--dur-reveal`.
- **Reduced motion:** under `@media (prefers-reduced-motion: reduce)` set `--dur-quick: 0ms; --dur-reveal: 0ms;`, stop the spinner (static `LoaderCircle`, the text still says "Loading…"/"Creating…"), and `scroll-behavior: auto`. Otherwise `scroll-behavior: smooth` only for in-page Miss jump links.

## 4. Layout

### Shell (every page)
```
┌─────────────────────────────────────┐ 375
│ Playset                             │ header: wordmark (display xl 800, link to /)
├─────────────────────────────────────┤ hair rule
│ ‹ back link (when not on /)         │ ArrowLeft + text, 44px tall
│                                     │
│ <main> … screen …                   │ gutter 16px each side
│                                     │
├─────────────────────────────────────┤ hair rule
│ footer                              │
└─────────────────────────────────────┘
```
- `<header>` → `<main>` → `<footer>`; one `h1` per screen; skip link "Skip to content" as the first focusable element (visible on focus).
- Content is left-aligned in a container `max-inline-size: var(--page-max)`, `padding-inline: var(--gutter)` (`--gutter-wide` ≥ 48rem). Single-column screens cap their content at `--flow-max`.
- Back links (text names where they go): on candidates "New search"; on a Setlist list "New search"; on a Setlist screen "Setlists of <Artist>" when reached from a list, otherwise "New search"; on Terms "Back to Playset". Browser Back also works (URL holds the step; route paths are decided in the Slice 18 PRD).

### Desktop
- ≥ 64rem: header and footer span `--page-max`. Start, candidates, Setlist list, status, errors, Terms: one column at `--flow-max`, left-aligned in the container (not centred on the page; the right side stays empty paper).
- Preview: two columns `grid-template-columns: minmax(0, 1fr) var(--rail)`, gap `--space-7`. Left: the Setlist sheet. Right: the rail (Show summary, counts, Misses jump list, Create/Update action), `position: sticky; top: var(--space-5)`.
- Admin dashboard: two columns `minmax(0,1fr) minmax(0,1fr)` for the status/config/totals blocks; the 30-day table and top Artists span both.

## 5. Wireframes

All at 375px unless marked desktop. `[ Button ]` = button, `[_____]` = input, `‹` = ArrowLeft icon, `›` = ChevronRight icon, `(!)` = TriangleAlert icon, `(✓)` = Check / CircleCheck icon, `(x)` = CircleX icon, `(i)` = Info icon, `(◌)` = spinning LoaderCircle, `(↗)` = ExternalLink icon, `(⧉)` = Copy icon, `(⊘)` = CircleSlash icon, `(?)` = CircleHelp icon, `(▭)` = CassetteTape icon, `(✂)` = Scissors icon, `(↻)` = RotateCw icon. These are placeholders for lucide-react icons in this document only; the app renders the lucide icons, never these glyphs. Icon size: 20px in buttons and rows, 16px in badges; stroke 2; `aria-hidden="true"` (the text carries the meaning).

### 5.1 Start (`/`)
```
┌─────────────────────────────────────┐
│ Playset                             │
├─────────────────────────────────────┤
│                                     │
│ Hear the Setlist                    │ h1, display 2xl 800
│ before the Show                     │
│                                     │
│ Find an Artist's Setlist on         │ body, ink-soft, measure
│ setlist.fm and play it as a         │
│ Spotify playlist.                   │
│                                     │
│ Artist                              │ <label> sm 700
│ [______________________________]    │ input, 48px, full width
│ [ (search) Search              ]    │ primary, full width < 48rem
│                                     │
│ ─────────────────────────────────── │ hair rule, space-6 above/below
│                                     │
│ setlist.fm link                     │ <label>
│ [https://www.setlist.fm/setlist/…]  │ placeholder (example only)
│ [ (link) Open                  ]    │ secondary, full width
│                                     │
├─────────────────────────────────────┤
│ footer                              │
└─────────────────────────────────────┘
```
Desktop (≥ 48rem): input and button on one row (`[ input ……… ][ Search ]`), button width auto; both forms within `--flow-max`; headline `--text-3xl` at ≥ 64rem, still left-aligned.
- Two separate `<form>`s, each submits on Enter. No search-as-you-type, no autocomplete list.
- Search empty → INVALID_INPUT field state (5.9) without a request (client-side required check uses the same visual).

### 5.2 Artist candidates (always shown, also for one exact match)
```
│ ‹ New search                        │
│                                     │
│ Artist                              │ the Search form stays on top,
│ [arctic monkeys________________]    │ prefilled, so the visitor can refine
│ [ (search) Search              ]    │
│                                     │
│ Pick the Artist                     │ h1 display xl (focus lands here)
│ 3 Artists found for                 │ sm ink-soft
│ "arctic monkeys"                    │
│ ─────────────────────────────────── │
│ Arctic Monkeys                    › │ row = <a>, min-height 56px
│ English rock band from Sheffield    │ disambiguation sm ink-soft
│ ─────────────────────────────────── │
│ The Arctic Monkeys                › │
│ 1960s cover act                     │
│ ─────────────────────────────────── │
│ Arctic Monkeys Tribute            › │ no disambiguation → one line
│ ─────────────────────────────────── │
```
- `<ol>` of links; name in display lg 600, disambiguation text sm. Whole row is the link target.
- One result still shows this list ("1 Artist found for …"); never auto-navigates.
- Searching: Search button shows `(◌) Searching…` (aria-disabled), the previous list stays until results arrive.

No result:
```
│ Artist                              │
│ [arctci monkys_________________]    │
│ [ (search) Search              ]    │
│                                     │
│ No Artist found — check spelling    │ h1 display xl (focus lands here)
│ Nothing on setlist.fm matches       │ body ink-soft
│ "arctci monkys". Try the Artist's   │
│ full name or another spelling.      │
```
The h1 text is fixed copy from the brief. Focus moves to it; the input keeps the query.

### 5.3 Setlist list
```
│ ‹ New search                        │
│                                     │
│ Arctic Monkeys                      │ h1 display 2xl 800 (focus)
│ Setlists on setlist.fm, newest      │ sm ink-soft
│ first                               │
│ ─────────────────────────────────── │
│  27   Madison Square Garden       › │ row = <a>, min 72px
│ Nov   New York, United States       │ venue base 700; city sm ink-soft
│ 2026  21 songs                      │ count sm, tabular
│ ─────────────────────────────────── │
│  24   TD Garden                   › │
│ Nov   Boston, United States         │
│ 2026  18 songs  [(!) Incomplete]    │ caution badge, wraps under count
│ ─────────────────────────────────── │
│  21   Scotiabank Arena            › │
│ Nov   Toronto, Canada               │
│ 2026  19 songs                      │
│ ─────────────────────────────────── │
│ …                                   │
│ [ Load more Setlists           ]    │ secondary, full width
```
- Row grid: `grid-template-columns: 3.5rem minmax(0,1fr) auto`. Date column: day in display xl 800, month + year below in xs 700 (`<time datetime="2026-11-27">`). The date block is the only "ticket stub" accent; it uses ink, not pink.
- Accessible name of the row link: "27 Nov 2026, Madison Square Garden, New York, United States, 18 songs, Incomplete Setlist".
- "1 song" singular. Incomplete badge text "Incomplete" with TriangleAlert; its accessible text "Incomplete Setlist".
- Load more → `(◌) Loading…` in the button (aria-disabled); new rows append below; focus stays on the button; a polite live region says "20 more Setlists loaded" (or "No more Setlists"). When `hasMore` is false the button is removed and a sm ink-soft line reads "That's every Setlist on setlist.fm."
- First load: h1 with the Artist name if known, then `(◌) Loading Setlists…` line (no skeleton shimmer).

Empty:
```
│ Arctic Monkeys                      │ h1
│                                     │
│ No Setlists with songs yet          │ h2 display lg
│ setlist.fm has no Setlist with      │ body ink-soft
│ songs for this Artist.              │
│ [ Search for another Artist    ]    │ secondary (link to /)
```

Desktop: same single column at `--flow-max`; the date column grows to 4.5rem, count and badge move to the right column (`auto`), right-aligned.

### 5.4 Setlist status: Setlist Playlist exists and is current
Shown at once, no preview, no Matching.
```
│ ‹ Setlists of Arctic Monkeys        │
│                                     │
│ Arctic Monkeys                      │ h1 display 2xl
│ 27 Nov 2026                         │ Show line (5.5), base
│ Madison Square Garden,              │
│ New York, United States             │
│                                     │
│ ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓ │ result panel, border-strong
│ ┃ (✓) Setlist Playlist ready      ┃ │ h2 display xl (focus lands here)
│ ┃ It's up to date with setlist.fm.┃ │ body ink-soft
│ ┃                                 ┃ │
│ ┃ [ (↗) Open in Spotify        ]  ┃ │ primary link-button
│ ┃ https://open.spotify.com/       ┃ │ share link as text, sm,
│ ┃ playlist/37i9dQZF1DX…           ┃ │ overflow-wrap:anywhere
│ ┃ [ (⧉) Copy link              ]  ┃ │ secondary → "(✓) Copied" 2 s
│ ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛ │
```
"Open in Spotify" opens in a new tab (`target="_blank" rel="noopener"`, visible ExternalLink icon, accessible name ends "(opens in a new tab)"). Copy confirmation goes to the page's polite live region.

### 5.5 Preview: Matching in progress
```
│ ‹ Setlists of Arctic Monkeys        │
│                                     │
│ Arctic Monkeys                      │ h1 display 2xl (focus)
│ 27 Nov 2026                         │ Show line: date, then venue,
│ Madison Square Garden,              │ then city + country; each part
│ New York, United States             │ its own line on mobile
│                                     │
│ Matching 12 of 42 Performances      │ sm 700, tabular
│ ████████░░░░░░░░░░░░░░░░░░░░░░░░░   │ <progress max=42 value=12>, 8px
│                                     │
│ Main set                            │ Set heading h2 display lg 800
│ ─────────────────────────────────── │
│  1  Sculptures of Anything Goes     │ title display lg 600
│     (✓) Sculptures of Anything Goes │ Match line sm (inks in)
│         by Arctic Monkeys           │
│  2  Brianstorm                      │
│     (◌) Matching…                   │ sm ink-soft (static icon if
│  3  Snap Out of It                  │ reduced motion)
│     (◌) Matching…                   │
```
- Before the total is known: `(◌) Loading the Setlist…` instead of the counter and bar.
- If the stream delivers results only at the end (contract decides), rows render once with their Match lines and the counter alone shows progress. The Create action is not shown until Matching is done.
- Live region (visually hidden, `aria-live="polite"`): "Matching 42 Performances" at start, then at most one update every 5 s ("Matching 20 of 42"), then "Matching done: 38 Matches, 4 Misses". The visible counter is not itself live.

### 5.6 Preview: done (mobile)
```
│ Arctic Monkeys                      │ h1
│ 27 Nov 2026                         │
│ Madison Square Garden,              │
│ New York, United States             │
│                                     │
│ ┌─────────────────────────────────┐ │ caution alert (only for an
│ │(!) Incomplete Setlist            │ │ Incomplete Setlist)
│ │ setlist.fm doesn't list the      │ │
│ │ whole Show. The playlist has     │ │
│ │ only the known songs.            │ │
│ └─────────────────────────────────┘ │
│                                     │
│ 38 Matches                          │ counts <dl>, sm, one per line,
│ 4 Misses                            │ caution text + (⊘) for Misses
│ 2 Unknown Songs not added           │ ink-soft + (?)
│ 1 Tape left out                     │ ink-soft + (▭)
│                                     │
│ Misses                              │ h2 display lg
│ 7  Old Yellow Bricks              › │ in-page links to the rows,
│ 19 Fluorescent Adolescent (Tease) › │ 44px each
│ …                                   │
│                                     │
│ Main set                            │ h2 Set heading, sticky (5.13)
│ ─────────────────────────────────── │
│  1  Sculptures of Anything Goes     │
│     (✓) Sculptures of Anything Goes │
│         by Arctic Monkeys           │
│ ┌─────────────────────────────────┐ │ Miss row: caution-tint bg,
│ │ 7  Old Yellow Bricks            │ │ full 1px caution border
│ │    (⊘) Miss. Not on Spotify     │ │ sm caution 700
│ │        under this Artist.       │ │
│ └─────────────────────────────────┘ │
│  8  I Bet You Look Good on the      │ long titles wrap, number stays
│     Dancefloor                      │ top-aligned
│     (✓) I Bet You Look Good on the  │
│         Dancefloor by Arctic Monkeys│
│  9  (?) Unknown Song                │ ink-soft, display lg 600
│     Not added. Played in Main set.  │ sm ink-soft (+ setlist info)
│ 12  505 / Knee Socks  [Medley]      │ each medley part is its own
│     …                               │ Performance row with a
│                                     │ neutral "Medley" badge
│ 15  Baby I'm Yours  [Cover]         │ neutral badge
│     (✓) Baby I'm Yours by Barbara   │ Match may be the Original
│         Lewis                       │ Artist's version
│                                     │
│ Encore                              │ h2 Set heading
│ ─────────────────────────────────── │
│ 40  R U Mine?                       │
│     (✓) R U Mine? by Arctic Monkeys │
│                                     │
│ Left out                            │ h2 display lg
│ (▭) Tapes are never added:          │ sm ink-soft
│     Intro tape: "Waiting Room"      │ <ul>, sm
│ (✂) Snippets are noted, not added:  │
│     "Fluorescent Adolescent" (tease)│
│                                     │
│ (space so the bar never covers      │ padding-bottom = bar height
│  the last row)                      │
├─────────────────────────────────────┤ sticky bottom bar, paper bg,
│ [ Create playlist              ]    │ --shadow-bar, primary full width
│ Public, in Playset's Spotify account│ xs ink-soft
└─────────────────────────────────────┘
```
Rules:
- Sheet = one `<section>` per Set: `<h2>` Set name (main set label as setlist.fm gives it, "Encore", "Encore 2"…), then `<ol>` of rows. Row number = the Performance's played position, right-aligned in a `3ch` column, display lg, ink-soft.
- Row: title (display lg 600, ink) + Match line (sm): `(✓)` ink-soft icon, track name in ink 700, " by " + Spotify artist in ink-soft. Match lines are text, not links.
- Miss row: `--color-caution-tint` background and full 1px `--color-caution` border (never a side bar), CircleSlash icon, the word "Miss" first, then the reason the server gives. Each Miss row has an `id` the Misses jump list links to; `scroll-margin-top` clears the sticky Set heading.
- Unknown Song row: sits in its played position, "Unknown Song" in display lg ink-soft with CircleHelp, "Not added." plus Set and info. Not counted as a Miss.
- Snippets and Tapes are not rows; they are listed under "Left out" in played order with their info. Tapes are always left out in the web (no question).
- Counts come before the sheet so a 40+ row Setlist is summarised before scrolling; "0 Misses" line is omitted; with no Misses the Misses section is omitted.
- The sticky bar appears when Matching is done. `html { scroll-padding-bottom: <bar height> }` so focused rows are never hidden behind it (WCAG 2.4.11).

### 5.7 Preview: done (desktop ≥ 64rem)
```
┌──────────────────────────────────────────────────────────────────────┐
│ Playset                                                              │
├──────────────────────────────────────────────────────────────────────┤
│ ‹ Setlists of Arctic Monkeys                                         │
│                                                                      │
│ Arctic Monkeys                                 ┌──────────────────┐  │
│ 27 Nov 2026, Madison Square Garden,            │ 38 Matches       │  │ rail 20rem,
│ New York, United States                        │ 4 Misses         │  │ sticky
│                                                │ 2 Unknown Songs  │  │
│ ┌ (!) Incomplete Setlist ────────────────┐     │ 1 Tape left out  │  │
│ └────────────────────────────────────────┘     │                  │  │
│                                                │ Misses           │  │
│ Main set                                       │ 7  Old Yellow …  │  │
│ ─────────────────────────────────────────      │ 19 Fluorescent … │  │
│  1  Sculptures of Anything Goes                │                  │  │
│     (✓) Sculptures of Anything Goes by Arctic  │ [Create playlist]│  │
│  2  Brianstorm                                 │ Public, in       │  │
│     (✓) Brianstorm by Arctic Monkeys           │ Playset's Spotify│  │
│ …                                              │ account          │  │
│                                                └──────────────────┘  │
```
- Rail = `<aside aria-label="Summary">` with a hair border all round, `--space-5` padding, radius none. The rail holds counts, Misses jump list (scrolls inside the rail if longer than the viewport: `max-block-size: calc(100vh - var(--space-7)); overflow-y: auto`), and the action. No sticky bottom bar on desktop.
- Show line on one line (comma-separated) at desktop.
- Medium widths (48–64rem): mobile layout with wider gutters.

### 5.8 Create playlist → Creating… → Playlist created
```
Creating (bar or rail):
│ [ (◌) Creating…                ]    │ same button, aria-disabled,
│ Public, in Playset's Spotify account│ live region: "Creating playlist"

Created (sticky bar removed; panel inserted under the Show line):
│ Arctic Monkeys                      │
│ 27 Nov 2026 …                       │
│ ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓ │
│ ┃ (✓) Playlist created            ┃ │ h2 display xl (focus, scrolled
│ ┃ Arctic Monkeys – 2026-11-27 –   ┃ │ into view); playlist name, sm
│ ┃ New York                        ┃ │
│ ┃ 38 songs, public in Playset's   ┃ │ sm ink-soft
│ ┃ Spotify account.                ┃ │
│ ┃ [ (↗) Open in Spotify        ]  ┃ │ primary
│ ┃ https://open.spotify.com/…      ┃ │ share link text
│ ┃ [ (⧉) Copy link              ]  ┃ │ secondary
│ ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛ │
│ (counts, Misses and sheet stay      │
│  below, unchanged)                  │
```
The verb stays the same: "Create playlist" → "Creating…" → "Playlist created". A concurrent visitor whose create returns the existing link sees the same "Playlist created" panel. On desktop the panel replaces the action in the rail and also appears under the Show line (focus goes to the one under the Show line; the rail shows only "Open in Spotify").

### 5.9 Update playlist (Setlist changed since its Setlist Playlist was made)
```
│ Arctic Monkeys                      │
│ 27 Nov 2026 …                       │
│ ┌─────────────────────────────────┐ │ info alert (sunk bg, hair
│ │(i) This Setlist changed on      │ │ border, Info icon)
│ │ setlist.fm since its playlist   │ │
│ │ was made.                       │ │
│ │ [ (↗) Open current playlist ]   │ │ secondary link-button
│ └─────────────────────────────────┘ │
│ (progress → counts → Misses → sheet │ same as 5.5–5.6
│  exactly as in the Preview)         │
├─────────────────────────────────────┤
│ [ Update playlist              ]    │ primary in the bar / rail
│ Replaces the songs in the same      │ xs ink-soft
│ playlist                            │
```
"Update playlist" → "(◌) Updating…" → panel "(✓) Playlist updated" (same layout as Playlist created). If the Host Account no longer holds the playlist, the server makes it again; the panel then reads "Playlist created".

### 5.10 Errors
One alert component (6.6). The server's `message` is the alert title, its `hint` the body text; the client adds only the action. Placement: form errors under the field; screen errors replace the screen content under the h1/Show line; action errors (Create/Update) replace the action in the bar/rail and go into the page flow under the Show line on mobile. Screen-level errors move focus to the alert's heading; action errors use `role="alert"`.

`INVALID_INPUT` (field-level, e.g. a link that isn't a setlist.fm Setlist):
```
│ setlist.fm link                     │
│ [https://example.com/x_________]    │ 2px caution border,
│ (!) That isn't a setlist.fm         │ aria-invalid, aria-describedby
│ Setlist link.                       │ message sm caution 700
│ Paste a link like                   │ hint sm ink-soft
│ setlist.fm/setlist/…/….html         │
│ [ (link) Open                  ]    │ focus returns to the input
```

`NOT_FOUND` (screen-level):
```
│ ‹ New search                        │
│ ┌─────────────────────────────────┐ │ caution alert
│ │(!) <message>                    │ │ h1 inside the alert (focus)
│ │ <hint>                          │ │
│ │ [ Search for an Artist      ]   │ │ secondary, link to /
│ └─────────────────────────────────┘ │
```

`RATE_LIMITED` (where the action was; e.g. Search, Load more, preview, Create):
```
│ ┌─────────────────────────────────┐ │
│ │(!) <message>                    │ │
│ │ <hint>                          │ │
│ │ You can try again in 0:42       │ │ sm 700 tabular, ticks each
│ │ [ (↻) Try again             ]   │ │ second; aria-disabled until 0:00
│ └─────────────────────────────────┘ │
```
Countdown from `Retry-After`; the text is not live per second. The live region announces once at the start ("Try again in 42 seconds") and once at zero ("You can try again now"); the button then becomes enabled. Focus is not moved when it unlocks.

`UPSTREAM_UNAVAILABLE`:
```
│ ┌─────────────────────────────────┐ │
│ │(!) <message>                    │ │
│ │ <hint>                          │ │
│ │ [ (↻) Try again             ]   │ │ secondary; → "(◌) Trying again…"
│ └─────────────────────────────────┘ │
```

`PLAYLISTS_UNAVAILABLE` (Host Account not connected — preview and create are off; search, Setlist lists and current playlist links still work):
```
│ Arctic Monkeys                      │
│ 27 Nov 2026 …                       │
│ ┌─────────────────────────────────┐ │
│ │(!) Playlist creation is         │ │ fixed title
│ │ temporarily unavailable         │ │
│ │ <hint>                          │ │
│ │ [ Setlists of Arctic Monkeys ]  │ │ secondary, back to the list
│ └─────────────────────────────────┘ │
```
When it arrives at Create/Update, the alert replaces the action and the preview stays visible.

`SETLIST_CHANGED` (at Create/Update):
```
│ ┌─────────────────────────────────┐ │
│ │(i) <message>                    │ │ info alert
│ │ <hint>                          │ │
│ │ [ Load fresh preview        ]   │ │ primary; reruns the preview,
│ └─────────────────────────────────┘ │ focus to the h1 afterwards
```

Never shown: status numbers, exception text, stack traces, the word "error" alone.

### 5.11 Footer (every page, including `/admin`)
```
├─────────────────────────────────────┤ hair rule, space-7 above
│ Setlists from setlist.fm            │ "setlist.fm" is a link
│ Playlists are created in Playset's  │ sm ink-soft
│ Spotify account and are public.     │
│ Terms and Privacy                   │ link, 44px target
└─────────────────────────────────────┘
```
Desktop: the three items on one row, separated by `--space-6` gaps (no dots or pipes), wrapping when needed. The footer is `<footer>` with a `<p>` per item.

### 5.12 Terms and Privacy (`/terms`, layout only; copy comes with Slice 18)
```
│ ‹ Back to Playset                   │
│                                     │
│ Terms and Privacy                   │ h1 display 2xl (focus)
│ Last updated 27 Nov 2026            │ sm ink-soft
│                                     │
│ <h2> section                        │ display lg 800
│ <p> … measure 68ch …                │ body
│ <h2> section                        │
│ <ul> …                              │
```
Single column, `--measure`, no side navigation, no accordions.

### 5.13 `/admin`
Header adds "Admin" (sm 700, ink-soft) after the wordmark; when logged in, a secondary "Log out" button on the right of the header (wraps under on 375 if needed).

Logged out:
```
│ Playset  Admin                      │
├─────────────────────────────────────┤
│ Admin                               │ h1 display 2xl (focus)
│ Log in as the Host Account to see   │ body ink-soft
│ its status and usage.               │
│ [ (log-in) Log in with Spotify ]    │ primary link-button → /admin/login
```

Host Account not connected:
```
│ Playset  Admin          [ Log out ] │
├─────────────────────────────────────┤
│ Admin                               │ h1
│ ┌─────────────────────────────────┐ │ caution alert
│ │(!) Host Account not connected   │ │
│ │ Visitors can search and open    │ │
│ │ playlists. Previews and new     │ │
│ │ playlists are unavailable.      │ │
│ │ [ Reconnect                 ]   │ │ primary → /admin/login
│ └─────────────────────────────────┘ │
│ (config, usage as in the dashboard) │
```

Dashboard (mobile):
```
│ Admin                               │ h1
│                                     │
│ Host Account                        │ h2 display lg
│ (✓) Connected as playset-host       │ body
│ [ Reconnect                    ]    │ secondary
│                                     │
│ Config                              │ h2
│ (✓) SETLISTFM_API_KEY      present  │ <ul>, sm; (x) + "missing" in
│ (✓) SPOTIFY_CLIENT_ID      present  │ caution when absent; values
│ (✓) PLAYSET_HOST_SPOTIFY_ID present │ are never shown; names wrap
│                                     │
│ Usage                               │ h2
│ Playlists made       128            │ <dl>, base, tabular, numbers
│ Opens                1,042          │ right-aligned in a column
│ Rate-limit hits today  3            │
│                                     │
│ Last 30 days                        │ h2
│ Day     Made Upd. Opens             │ <table>, sm, tabular; header
│ 27 Nov    4    1    37  ▇▇▇▇▇       │ row ink 700; bar cell =
│ 26 Nov    2    0    21  ▇▇▇         │ presentational spike bar
│ …                                   │ (aria-hidden), width ∝ opens
│                                     │
│ Top Artists                         │ h2
│ 1 Arctic Monkeys      14 playlists  │ <ol>, sm
│ 2 Fontaines D.C.       9 playlists  │
```
- The ✅ in the brief is rendered as the lucide `CircleCheck` icon plus the word "present", never emoji.
- Table: caption "Setlist Playlists made, updated and opened per day, last 30 days" (visually hidden), zebra rows with `--color-sunk`, newest first; at 375 the bar column is hidden and the table fits without horizontal scroll (4 narrow numeric columns). Days with no events show 0.
- Empty usage: each block says so ("No playlists made yet.", "No opens yet.", "No Artists yet."), the table is replaced by "Nothing in the last 30 days."
- Status call fails → the UPSTREAM_UNAVAILABLE alert with Try again under the h1.
- Desktop: Host Account + Config in the left column, Usage in the right; Last 30 days and Top Artists full width; bar column visible.

## 6. Components

Every interactive element: min 44×44px target (`--target`), visible `:focus-visible` ring = `outline: 3px solid var(--color-spike); outline-offset: 2px` (list rows: `outline-offset: -3px` so the ring isn't clipped). Never `outline: none` without this replacement. Hover styles only under `@media (hover: hover)`. Colour transitions use `--dur-quick`.

### 6.1 Buttons (`<button>`; link-buttons are `<a>` styled the same)
| Variant | Rest | Hover | Disabled / aria-disabled | Loading |
|---|---|---|---|---|
| Primary | bg spike, text on-spike, no border, `--radius-control`, height `--control-h`, padding-inline `--space-5`, text base 700, leading icon 20px gap `--space-2` | bg spike-hover | bg sunk, text ink-soft, `--border-control`, cursor not-allowed | spinning LoaderCircle replaces the leading icon, label "…ing…", `aria-disabled="true"`, clicks ignored |
| Secondary | bg paper, text ink, `--border-control` | bg sunk | same as primary disabled | same |
| Quiet (Back link, Copy link in tight spots) | no border, text ink, underlined | text spike, underline 2px | — | — |
- Full width below 48rem in forms and the sticky bar; auto width above.
- At most one primary button per screen region (form, bar, rail, panel).
- Use `aria-disabled` (keeps focus) for Creating…, Updating…, Searching…, Loading… and the rate-limit Try again; native `disabled` nowhere else is needed.
- Pressed: hover colours plus no transform.

### 6.2 Inputs
- `<label>` above (sm 700, ink, `margin-block-end: var(--space-2)`); input height `--control-h`, full width, bg paper, `--border-control`, `--radius-control`, text base, padding-inline `--space-3`, placeholder ink-soft and only as an example (never the label).
- Hover: border ink. Focus-visible: spike ring. Invalid: `border: 2px solid var(--color-caution)`, `aria-invalid="true"`, message + hint below linked with `aria-describedby`. Disabled is not used.
- Artist input: `type="search"`, `autocomplete="off"`, `enterkeyhint="search"`. Link input: `type="url"`, `inputmode="url"`, `enterkeyhint="go"`.

### 6.3 List rows (Artist candidates, Setlists, Misses jump list)
- Whole row is one `<a>`; `display: grid`; padding-block `--space-3`; border-bottom `--border-hair`; trailing ChevronRight 20px ink-soft.
- Hover: bg sunk. Focus-visible: inset spike ring. Visited: no change.
- Text wraps (see 7); the chevron column never shrinks.

### 6.4 Setlist sheet rows (not interactive)
Described in 5.6. States: Matching (spinner + "Matching…"), Match, Miss, Unknown Song. Medley and Cover use neutral badges.

### 6.5 Badges
- Inline-flex, `--radius-badge`, padding `0 var(--space-2)`, min-height 1.5rem, text xs 700, 16px icon.
- Caution badge ("Incomplete", "Miss" where used as a badge): bg caution-tint, text caution, 1px caution border.
- Neutral badge ("Medley", "Cover"): bg paper, text ink-soft, `--border-control`.
- Badges are never the only carrier of meaning for screen readers: each has accessible text ("Incomplete Setlist").

### 6.6 Alerts
- Box: full 1px border on all sides, radius none, padding `--space-4`, `max-inline-size: var(--measure)`.
- Caution: bg caution-tint, border caution, TriangleAlert icon in caution. Info: bg sunk, 1px `--color-ink-soft` border (`--color-rule` is only 1.4:1, too faint to bound a box), Info icon in ink-soft.
- Layout: icon (20px) + title (base 700, ink) on the first row; message/hint (sm, ink) below; actions row `--space-3` below, buttons follow 6.1.
- Screen-level alerts contain the screen's heading (h1 or h2) with `tabindex="-1"` and receive focus. Action alerts use `role="alert"`.

### 6.7 Progress
- Label line above ("Matching 12 of 42 Performances", sm 700, tabular).
- Native `<progress>` styled: block-size 8px, radius none, track sunk, value spike; `aria-label` equals the label text. Indeterminate (total unknown): no bar, only `(◌) Loading the Setlist…`.
- No progress rings.

### 6.8 Result panel (Setlist Playlist ready / Playlist created / Playlist updated)
- `--border-strong` all round, radius none, padding `--space-5`, CircleCheck in ink, heading h2 display xl with `tabindex="-1"` (receives focus).

### 6.9 Sticky action bar (mobile < 64rem, Preview only)
- `position: sticky; bottom: 0`, bg paper, top hair rule, `--shadow-bar`, padding `--space-3` `--gutter`, plus `env(safe-area-inset-bottom)`.
- Removed after Playlist created/updated, or replaced by the action error alert in the flow.

### 6.10 Focus, headings, live regions
- After each step (candidates, Setlist list, Preview, Playlist created/updated, screen-level error, Terms, Admin) focus moves to the new screen's heading: headings are `tabindex="-1"`, focused with `preventScroll: false`, `scroll-margin-top: var(--space-5)`; programmatic focus on a heading shows no ring (it isn't operable).
- One visually hidden `aria-live="polite"` region per screen (in the layout, always mounted) for: Matching progress (throttled, 5.5), "Creating playlist" / "Updating playlist", "Link copied", "20 more Setlists loaded", rate-limit start/end. Errors from an action use `role="alert"` on the alert itself.
- Sticky Set headings in the sheet: `position: sticky; top: 0; background: var(--color-paper)`, z above rows; they never cover a focused row (`scroll-margin-top` on rows = Set heading height).
- Document `<title>` changes per screen: "Playset", "Arctic Monkeys – Setlists – Playset", "Arctic Monkeys, 27 Nov 2026 – Playset", "Admin – Playset".

### 6.11 Formats
- Dates: `Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })` → "27 Nov 2026"; Setlist list splits it into day / month + year. Admin table: "27 Nov".
- Counts: "1 song" / "21 songs", "1 Match" / "38 Matches", "1 Miss" / "4 Misses", "1 Unknown Song", "1 Tape left out" / "2 Tapes left out". Numbers ≥ 1000 grouped with `Intl.NumberFormat('en-GB')` ("1,042").
- Countdown: m:ss.
- Playlist name exactly as the server gives it (`Artist – YYYY-MM-DD – City`).

## 7. Edge cases

- **Long names at 375px** (e.g. "Godspeed You! Black Emperor", "Kölner Philharmonie Großer Saal", "I Bet You Look Good on the Dancefloor (Live at the Apollo Remastered 2026)"): `overflow-wrap: anywhere` on names, venue, song titles and links; `hyphens: auto` with `<html lang="en">`; every grid/flex child that holds text has `min-width: 0`; badges and chevrons are `flex-shrink: 0` and wrap to the next line rather than squeezing text. No `text-overflow: ellipsis`, no `white-space: nowrap` on names, no line clamping. Share URLs wrap anywhere. Body has `overflow-x: clip` only as a safety net; the check is that nothing needs it.
- **Display size safety:** the Artist h1 uses `--text-2xl` on mobile; a single unbreakable word longer than the column breaks via `overflow-wrap: anywhere` rather than scrolling.
- **40+ Performances, many Misses:**
  - Counts and the Misses jump list sit before the sheet (mobile) or in the sticky rail (desktop), so the visitor knows the outcome without scrolling; each Miss links to its row.
  - Miss rows differ by background, full border, icon and the word "Miss", so they stand out in a long list without relying on colour.
  - Set headings stick while scrolling, so the visitor always knows whether they are in the main set or an Encore.
  - Rows are compact (title display lg is condensed; Match line one sm line), around 64–72px each; played-order numbers stay aligned in a fixed column up to 3 digits.
  - The Create action stays reachable (sticky bar or sticky rail) at any scroll position.
  - With more than 10 Misses the mobile Misses jump list shows the first 10 and a "Show all 23 Misses" quiet button that expands it in place (no modal).
- **Zero Matches:** counts read "0 Matches"; the Create button is replaced by a sm ink-soft line "No songs matched, so there is nothing to put in a playlist." (no action).
- **Text zoom 200% / 320 CSS px reflow:** layout stays single column, the sticky bar may grow taller and `scroll-padding-bottom` follows its measured height.
- **Dark mode:** every wireframe holds in both themes; no image assets exist.

## 8. Banned patterns

From the craft floor Refuse list (none of these are earned by this brief):
- Same-size cards of icon + heading + text as the page structure; any card-based layout; nested cards.
- The hero-metric template (big number, small label, supporting stats, accent) — admin numbers are a plain `<dl>` and a table.
- A kicker or eyebrow above any heading (absolute ban).
- Section numbers (01 / 02 / 03). The only numbers are the Performances' played positions and Top Artist ranks, which are real sequences.
- A modal for a task that needs neither interruption nor protected focus — Playset has no modals or dialogs at all.
- Gradient text.
- Glass and blur as decoration.
- A bar down one side of a rounded (or any) box: one-sided border, inset shadow or pseudo-element, in any colour or state. Use full borders, tints and leading icons.
- Hard offset shadows (`box-shadow: 4px 4px 0`).
- Sparklines, progress rings, and soft-shadowed rounded rectangles standing in for content.
- Monospace as a costume for "technical" — no monospace face anywhere (tabular numerals come from Atkinson).
- A system display face (Impact, Arial Black, the platform sans) as the display voice — Big Shoulders Display is self-hosted; Arial Narrow is only a fallback while it loads.
- Unicode glyphs or emoji standing in for icons (including ✅ ✓ → • ★) — lucide-react only.
- Geometric masks standing in for organic contours.
- Light or dark picked by category — the theme follows the visitor's system.

Also banned in Playset:
- All-caps labels or badges; letter-spaced (tracked-out) small labels.
- Accenting one word or phrase of a headline in a different colour, weight or italic.
- Meta strings joined with middle dots ("A · B · C") or pipes; "WORD — fragment" labels with a spaced em dash (the brief's own "No Artist found — check spelling" is the one exception).
- "→" or other arrows typed into link or button text (directional icons are lucide components).
- Warm cream backgrounds, terracotta/clay accents, near-black `#0B0B0B`/`#111` stand-ins, acid green; Spotify green or the Spotify logo used as Playset's own branding.
- Gradient washes, decorative illustrations, background textures, fake tape or paper images.
- Uniform soft grey drop shadows; shadows on anything except the mobile sticky bar.
- Entrance animations per section, hover lifts/scale, parallax, confetti on success, skeleton shimmer.
- Toasts or snackbars (confirmations are inline + live region); tooltips or hover-only information.
- Search-as-you-type, autocomplete dropdowns, auto-picking a single Artist, infinite scroll (Load more is explicit).
- Placeholder text used as a label; icon-only buttons without visible text.
- Truncating names with ellipsis or line clamps; horizontal scrolling at any width ≥ 320px.
- Centred or justified body text.
- Raw hex/rgb/px in component CSS (tokens only; 0 and 1px hairlines allowed).
- Words to avoid: tracklist, gig, band, entry, item, user (say Visitor in admin copy), unmatched, not found (for a Miss), failure; apologies; exclamation marks; raw status codes or exception text.

## 9. Decisions (approved by the user, 2026-11-27)

Each item below was approved as written: spike pink accent; no theme toggle; "21 songs" in the Setlist list; en-GB dates on screen; Spotify attribution settled in the Slice 18 PRD; both streaming granularities specified until the Slice 15 contract decides.

1. **Spike pink accent** (`#B5135F` / `#FF7EB8`) on cool paper-grey and stage-slate — the main aesthetic risk. Alternative: spike yellow, which can't carry white text and would need a dark-text button.
2. **No theme toggle** — follows the system setting only.
3. **"21 songs"** in the Setlist list instead of "21 Performances" (friendlier for Visitors; Performance stays the term in the Preview counter).
4. **Date format** "27 Nov 2026" (en-GB) on screen; the playlist name keeps `YYYY-MM-DD`.
5. **Spotify attribution** — Spotify's design guidelines may require their logo/attribution next to Spotify content (Match lines, "Open in Spotify"); to be settled in the Slice 18 PRD together with the Terms text. This design reserves a footer slot but adds no Spotify branding.
6. **Streaming granularity** — whether Matches arrive one by one (rows ink in progressively) or all at the end depends on the Slice 15 contract; both are specified in 5.5.
