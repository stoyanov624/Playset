# Brief 0024-artist-suggestions-client — Artist suggestions while typing

Kind: feature
Slice: 24
Depends on: 22
Module: src/web/client (and the Artist-field parts of `docs/design.md`)

The plan agreed with the user in the planning session. `/implementing`'s `prd-writer` turns it into `docs/prd/0024-artist-suggestions-client.md`. Rules: `.claude/rules/web-client.md`; look: `docs/design.md`; contract: `src/web/shared` (Slice 22). Direction: `docs/phases/artist-suggestions.md`.

## Problem
A Visitor has to type a whole name, press Search and pick from a list, and a misspelt name ends at "No Artist found". Seeing matching Artists while typing is faster and catches spelling early.

## Goal
The Artist field on `/` (and on the candidates screen) is an accessible combobox: after 2 characters a list of matching Artists appears under it; picking one goes straight to that Artist's Setlists. Submitting the form works as today, except that a misspelt name now lists MusicBrainz candidates (see below).

## Behaviour
- **Combobox (WAI-ARIA 1.2 pattern, list autocomplete without inline completion):** input `role="combobox"`, `aria-autocomplete="list"`, `aria-expanded`, `aria-controls` → `<ul role="listbox">` with `<li role="option" id=… aria-selected>`; `aria-activedescendant` on the input points at the highlighted option; DOM focus stays in the input. The visible `<label>Artist</label>` stays.
- **Keys:** ArrowDown/ArrowUp move the highlight (wrapping; ArrowDown opens a closed list with results); Enter on a highlighted option picks it; Enter with no highlight submits the form (today's flow); Escape closes the list (second Escape clears nothing — leaves the text); Tab closes the list and moves on without picking; Home/End stay text keys.
- **Mouse/touch:** click or tap an option picks it; each option ≥ 44px high; clicking outside closes the list.
- **Pick** → `/artists/:mbid` with `{ artistName }` in navigation state (as candidates do) plus `fromSuggestion: "musicbrainz"` when the source was MusicBrainz.
- **Requests:** `artistSuggestionDebounceMs` (300) after the last keystroke, only when the trimmed text has ≥ `artistSuggestionMinLength` (2); the previous request is aborted (fetch `AbortSignal`) and a late answer for older text is never shown. Through the typed API client (new `suggestArtists(name, signal)`) and TanStack Query keyed by the trimmed name.
- **States while typing (never move focus, never block typing or Search):**
  - < 2 characters: no list.
  - Waiting/loading: the previous list stays; a quiet `(◌) Looking…` line in the popup when there is no previous list.
  - Results: options (name; disambiguation sm ink-soft below). When the answer's suggestions are from MusicBrainz, a sm ink-soft line above them: "Nothing on setlist.fm by that name. Close matches:".
  - Empty: one sm ink-soft line "No suggestions. Press Search to look on setlist.fm." (not an option).
  - `RATE_LIMITED` / `UPSTREAM_UNAVAILABLE` / `INTERNAL`: the list closes silently; the Search button still works (it shows its own errors). `INVALID_INPUT` can't happen from the UI (client checks length).
  - Live region: polite "8 suggestions" / "No suggestions" once per settled answer (not per keystroke).
- **Candidates screen after Search:** when the candidates are from MusicBrainz (`source`), the same sm ink-soft line "Nothing on setlist.fm by that name. Close matches:" is shown above the list, never auto-picked; picking one passes `fromSuggestion: "musicbrainz"` like a suggestion pick. "No Artist found" only when both sources have none.
- **Setlist list for an Artist setlist.fm doesn't know** (server answers 200 with no Setlists, no Artist name, `hasMore: false`): heading = the picked name (from navigation state) or "Artist"; h2 "No Setlists on setlist.fm"; body "setlist.fm has no Setlists for this Artist yet." plus, when `fromSuggestion` is MusicBrainz, "This Artist was found on MusicBrainz, so setlist.fm may not know it."; secondary link "Search for another Artist". The existing "No Setlists with songs yet" state stays for Artists setlist.fm knows (Artist name present).

## Wireframe (375px, tokens from `docs/design.md`)
```
│ Artist                              │ <label> sm 700
│ [radioh|_______________________]    │ input, --control-h, --border-control
│ ┌─────────────────────────────────┐ │ listbox: bg paper, 1px ink-soft border, radius none,
│ │ Radiohead                       │ │ directly under the input, full input width, in flow
│ │ English rock band               │ │ (pushes the Search button down; no overlay, no shadow)
│ ├─────────────────────────────────┤ │ hair rule between options
│ │▓Radiohead Tribute▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│ │ highlighted = bg sunk + inset 3px spike outline
│ ├─────────────────────────────────┤ │
│ │ Radiohead Jazz                  │ │ name base 700 (text font, not display), min 44px
│ └─────────────────────────────────┘ │ max 8 options, no inner scroll
│ [ (search) Search              ]    │ primary, unchanged
```
Desktop ≥ 48rem: the listbox spans the input only (not the button), below the input+button row. Highlight uses `--color-sunk` + spike outline; no pink fill (pink stays for the one primary action). Long names wrap (`overflow-wrap: anywhere`), never ellipsis. Reduced motion: no transition on open.

## Decisions already made
- `docs/design.md` is amended by this Slice (approved with the PRD): 5.1's "No search-as-you-type, no autocomplete list" and the banned "Search-as-you-type, autocomplete dropdowns" are lifted **for the Artist field only**; add this wireframe as 5.1a and the combobox to 6.2. Auto-pick, modals, toasts stay banned.
- No suggestions on the setlist.fm link field. No inline completion of the typed text.
- Picking skips the candidates screen; the candidates screen keeps its own form with the same combobox.

## Non-goals
- No server or contract change. No "recent searches".

## Open questions for the PRD writer
- Should the popup also appear on the candidates screen's prefilled field before the Visitor types? Recommend: no, only after an edit.

## Acceptance hints
- Testing Library + user-event with a fake API client and fake timers: debounce (no call before 300 ms, one call after a burst), stale answer ignored, abort called; ArrowDown/Up/Enter/Escape/Tab; click pick navigates with state; Enter without highlight submits as today.
- `aria-expanded`, `aria-activedescendant` and option `aria-selected` follow the highlight; axe clean with the list open, empty and closed.
- Each error code closes the list and leaves Search working; MusicBrainz note shown only for MusicBrainz answers.
- Unknown-on-setlist.fm Setlist list: both wordings, with and without `fromSuggestion`.
