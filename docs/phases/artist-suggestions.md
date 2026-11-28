# Phase 3 — Web only, Artist suggestions

Status: planned (2026-11-28) as Slices 20–24 in `docs/PLAN.md`; briefs in `docs/briefs/0020`–`0024`.
Read this when planning or building these Slices; it is not needed for other work.

## Why

The web app is the only front-end Playset keeps: the `playset` CLI and the core code only it uses go (ADR 0003, written with Slice 20). Visitors misspell Artist names and don't know setlist.fm's spelling, so the Artist field suggests Artists while they type, and a misspelt name still finds the Artist through MusicBrainz when setlist.fm finds nothing, in suggestions and on Search alike.

## Shape

- Slice 20 removes the CLI first, porting the web-relevant rules' tests to the steps before deleting anything. The rest builds on the slimmer core.
- Suggestions: setlist.fm Artist search first; MusicBrainz (`docs/research/musicbrainz-artist-search.md`) only when setlist.fm has none and the typed name has ≥ 3 characters. A MusicBrainz id is used as-is on setlist.fm; an Artist setlist.fm doesn't know has no Setlists, which the Setlist list says plainly.
- Request budget: the browser waits 300 ms after the last keystroke and cancels stale requests; the server caches answers by normalised name and limits suggestions per IP; one shared MusicBrainz throttle (≥ 1.1 s between calls, server-wide) next to the existing setlist.fm one. MusicBrainz trouble (503, timeout, no contact configured) never shows as an error: the suggestions are just setlist.fm's.
- MusicBrainz requires a `User-Agent` with a contact; the operator sets it (`PLAYSET_MUSICBRAINZ_CONTACT`), never a personal address in the repo. Without it the fallback is off and `/admin` shows it missing.
- Submitting the Artist form uses the same fallback: when setlist.fm finds no Artist for the submitted name, the candidates list comes from MusicBrainz, so Search and suggestions never disagree ("radiohed" → Radiohead in both). Candidates carry a `source`; auto-pick (exact normalised name match) applies to setlist.fm candidates only — MusicBrainz ones are always shown for the Visitor to pick, because they are fuzzy matches. The 1.1 s MusicBrainz throttle and 503 hold-back are shared with suggestions.

## Supersedes in Phase 2 docs

- `docs/phases/web-ui.md` "No search-as-you-type" and `docs/design.md` (5.1 note, banned "Search-as-you-type, autocomplete dropdowns") — lifted for the Artist field only by Slice 24; auto-picking and modals stay banned.
- "The CLI stays as it is" (`docs/phases/web-ui.md`, ADR 0002's last consequence) — superseded by ADR 0003.
