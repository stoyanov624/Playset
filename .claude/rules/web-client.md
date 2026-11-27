---
paths:
  - "src/web/client/**"
  - "test/web/client/**"
---

# Web client rules (React + Vite)

Direction: `docs/phases/web-ui.md`. Look: `docs/design.md` (the approved design lock). Shared API contract: `.claude/rules/web-shared.md`.

## Libraries
- React with function components; React Router (the URL holds where the visitor is — Artist search, chosen Artist, chosen Setlist — so links and Back work); TanStack Query for every server call (loading, error, caching).
- No global state library. No Tailwind, no component kits. Icons only from `lucide-react`; never emoji or Unicode glyphs as icons. Fonts self-hosted via Fontsource (no Google Fonts or other third-party requests — visitors' data stays with us).
- The `vercel-react-best-practices` skill applies for client rules only (skip Next.js, RSC and server rules).

## Code
- Strict TypeScript, no `any`, no non-null `!` to silence the compiler.
- One component per file, with its `*.module.css` next to it. Tests live under `test/web/client/` mirroring the folder.
- Colours, spacing, radii, fonts and type sizes come only from the tokens in `docs/design.md` (CSS custom properties in one tokens file). No raw hex, rgb or px values in component CSS other than 0 and 1px hairlines.
- Nothing from the **Refuse** list in `.claude/references/impeccable/craft-floor.md`, and nothing from the banned patterns in `docs/design.md`.
- The client talks only to our server through one typed API client (`src/web/client/api/`), built on the shared contract. Never call setlist.fm or Spotify from the browser.
- The API client is injected (React context) so tests pass a fake.

## Words
- UI text uses `GLOSSARY.md` terms (Setlist, Artist, Show, Performance, Match, Miss, Tape, Incomplete Setlist, Setlist Playlist…); never "tracklist", "gig", "band".
- Errors show the server's `message` and `hint` as given; the client picks behaviour from `code` (retry button, Retry-After countdown, "Playlist creation is temporarily unavailable"). Never show raw status codes or exception text.
- Buttons keep one verb through the flow ("Create playlist" → "Creating…" → "Playlist created"). Empty and error states say what to do next. No apologies, no exclamation marks.

## Accessibility (WCAG 2.2 AA)
- Semantic HTML first (`main`, `nav`, headings in order, `button` for actions, `a` for navigation, lists for lists); ARIA only where HTML can't say it.
- Every input has a visible `<label>`. Visible `:focus-visible` on everything interactive.
- After each step (results, Setlist list, preview, created) focus moves to the new screen's heading.
- Matching progress is announced in an `aria-live="polite"` region.
- Touch targets ≥ 44×44 px; works at 375 px wide with no horizontal scroll; contrast ≥ 4.5:1 (3:1 for large text and UI parts); `prefers-reduced-motion` turns motion off.

## Tests
- Vitest + jsdom + Testing Library + `@testing-library/user-event`. Find elements as a person does: `getByRole`/`getByLabelText`/`getByText`; `data-testid` only when nothing else works.
- The API client is a fake passed into the app; no MSW, no network.
- Every screen has an axe check (`vitest-axe`) with no violations.
- Cover loading, empty and each error `code` the screen handles, plus keyboard use of the main action.
- `npm test`, `npm run typecheck` and `npm run lint` must be green.
