---
name: featuring
description: Run the Playset feature pipeline in parallel waves using git worktrees — plan → PRDs → user approval → failing tests → implementation → PRs → user-approved merges, with a conflict-resolver for cross-feature conflicts. Use when the user types /featuring [topic…] or asks to build the next slice(s).
---

# /featuring [topic…]

You (the main session) are the **orchestrator**. You never write feature code or tests yourself; agents do. You own the user gates, the shared files, and the merges. Never skip a gate.
Every commit, PR and merge message follows the `committing` skill (no AI attribution, ever).

## Vocabulary (process only — not domain terms, never put these in GLOSSARY.md)
- **Slice** — one row of the Slices table in `docs/PLAN.md`; one Slice = one PRD = one branch = one PR.
- **Wave** — the set of Slices that can run in parallel now: not yet built, and every PRD in their `Depends on:` is merged into `main`. A single topic is a Wave of one.
- **Worktree** — `.claude/worktrees/NNNN-slug`, a git worktree on branch `feat/NNNN-slug`. Each Slice's agents work only inside its Worktree.
- **Feature Report** — the PR description of a Slice: PRD link, owned files, public API added, AC → test table, shared-file requests.
- **Mechanical conflict** — a conflict fixable by editing code only, with every test of both Slices passing.
- **Real conflict** — resolving it would need a test change, an AC change, or picking one Slice's behaviour over another's.

## Ownership rules (prevent conflicts)
- Each Slice owns `src/core/<module>/` and `test/<module>/` (CLI Slice owns `src/cli/`). Agents touch nothing else.
- **Shared files** — `package.json`, `package-lock.json`, `GLOSSARY.md`, `CLAUDE.md`, `docs/PLAN.md`, `src/core/index.ts`, `docs/prd/TEMPLATE.md`, configs — are edited **only by you** (or the conflict-resolver during merges). Agents list needed changes (new dependency, new glossary term, new export) under "Shared-file requests" in their report; you apply them on the Slice's branch before opening its PR.

## 1. Plan the Wave
- `git switch main && git pull --ff-only`. Read `docs/PLAN.md` (Slices, dependencies, Wave rules), `GLOSSARY.md`, and `docs/prd/`.
- Work out what is built: a Slice is built when its PRD is on `main` with status `Implemented`. Dependencies come from `docs/PLAN.md` until a Slice has a PRD; after that, from its `Depends on:`.
- Without a topic: propose the Wave = all unbuilt Slices whose dependencies are all built. Show the user the plan status (built / this Wave / later). With topics: those Slices (refuse any whose dependencies aren't merged, and say why).
- Short planning conversation with the user per Slice (behaviour, edge cases, non-goals, `Depends on:`). Resolve new domain terms into `GLOSSARY.md` on `main` first (commit via the user-approved PR path, or batch into the first Slice's branch if the user prefers).
- Assign PRD numbers now (consecutive), so parallel writers don't collide.

## 2. Create Worktrees
For each Slice, from the repo root:
```
git worktree add .claude/worktrees/NNNN-slug -b feat/NNNN-slug main
(cd .claude/worktrees/NNNN-slug && npm ci)
```
Record each absolute Worktree path. Every agent prompt starts with: `WORKTREE: <absolute path>. Work only inside this directory; run every command with it as cwd; never touch the main checkout.`

## 3. PRDs (parallel) → user gate
- Spawn one `prd-writer` per Slice **in the background, in one message**, each with its Worktree path, PRD number, and agreed plan.
- Review each PRD yourself (testable ACs, examples, glossary terms only, `Depends on:` filled).
- **GATE — present all PRDs of the Wave together; the user approves or rejects each individually.** Rejected → revise with prd-writer, or drop from the Wave.
- Approved → set status `Approved`, commit in its Worktree (per the `committing` skill): `docs(PRD-NNNN): <plain-words summary>`.

## 4. Red → Green (parallel per Slice)
For every approved Slice, as its own background pipeline (Slices don't wait for each other):
1. Spawn `test-writer` (Worktree path, PRD path, public module path e.g. `src/core/<module>`).
2. Coverage check yourself: every AC has ≥1 test, tests fail for the right reason, only `test/<module>/` touched. Else send it back.
   Commit (per `committing`): `test(PRD-NNNN): <plain-words summary>`.
3. Spawn `implementer` (Worktree path, PRD, tests, expected API). If it reports a suspected wrong test → bring it to the user; nobody silently edits tests.
4. Verify in the Worktree: `npm test` and `npm run typecheck` green; `git diff main -- test/` contains only the test-writer commit. Apply shared-file requests. Set PRD status `Implemented`.
   Commit (per `committing`): `feat(PRD-NNNN): <plain-words summary>`.
5. `git push -u origin feat/NNNN-slug` and `gh pr create --base main`; title and body per the `committing` skill (What / How / Result + **Feature Report**).

## Web UI Slices (extra steps)
A UI Slice is any Slice that touches `src/web/client/`.
- **Design lock first.** Before the first UI Slice, a design pass (the `frontend-design` skill) produces `docs/design.md`: concept grounded in the subject (printed setlists, tour posters), 4–6 named colour tokens, fonts and type scale, a wireframe per screen, banned patterns. It is a shared file owned by you, and the **user approves it like a PRD**. Every UI PRD links it; changing the look later means changing `docs/design.md` first, with approval.
- **Rules:** every Slice touching `src/web/` follows `.claude/rules/web-server.md`, `web-client.md`, `web-shared.md`. Name the matching file(s) in every agent prompt — rule files are not loaded automatically for agents working in a Worktree. Verify step 4 also runs `npm run lint`.
- **Scaffold:** the first web Slice adds the web dependencies (Express 5, zod, helmet, better-sqlite3, React, React Router, TanStack Query, lucide-react, Fontsource, Testing Library, vitest-axe, supertest) and ESLint (typescript-eslint, react-hooks, jsx-a11y) with `npm run lint`; you apply these shared-file changes.
- **Styling:** plain CSS Modules + the tokens from `docs/design.md`. No Tailwind, no component kits.
- **Prompts:** `prd-writer` gets `docs/design.md`; `test-writer` adds an axe check (`vitest-axe`) for every screen it renders; `implementer` reads `docs/design.md` and the `vercel-react-best-practices` skill (client rules only — no Next.js/RSC/server rules).
- **After step 4 (green), before the PR**, in the Worktree:
  1. `web-design-guidelines` review of the changed client files (you run the skill, findings `file:line`).
  2. Start the app, then spawn `design-review` (Worktree path, URL, PRD) — screenshots at 375 / 768 / 1440, flows, a11y, states.
  3. Blockers and High findings go back to `implementer` (it never changes tests); a finding that needs a test or AC change goes to the user. Medium/Nit are listed in the Feature Report under "Design review".

## 5. Merge one at a time → user gate
Repeat until the Wave's PRs are all merged or parked:
1. **GATE — ask the user to approve merging one PR** (suggest the order: fewest dependents first). Never merge without approval.
2. On approval: `gh pr merge <n> --squash --delete-branch --subject … --body …` (message per `committing`); `git switch main && git pull --ff-only`.
3. For every other open branch of the Wave, in its Worktree: `git fetch origin && git rebase origin/main`, then `npm ci` (if lockfile changed), `npm test`, `npm run typecheck`.
   - Clean and green → `git push --force-with-lease`; the PR is ready for its gate.
   - Rebase conflict **or** newly failing tests/typecheck → spawn `conflict-resolver` (see 6).
4. After a PR merges: `git worktree remove .claude/worktrees/NNNN-slug` and `git branch -D feat/NNNN-slug` locally.

## 6. Conflicts
Spawn `conflict-resolver` with: the conflicted Worktree path, the git state (rebase in progress or failing test output), and the **Feature Reports** (PR bodies via `gh pr view <n> --json body`) and PRD paths of both the merged Slice and the conflicted one.
- **Resolved (mechanical)** → verify green yourself, `git push --force-with-lease`, continue step 5.
- **Escalated (real)** → it leaves a conflict brief. Then:
  1. Send the user a push notification (PushNotification tool): `Real conflict: NNNN vs MMMM — needs your decision`.
  2. Present the brief and plan the resolution with the user. Other Slices keep going.
  3. If a PRD changes → user approves the PRD change → `test-writer` updates tests → `implementer` → verify → push. Otherwise apply the agreed plan via `implementer`.

## Finish
Report the Wave: merged PRs, parked Slices and why, Worktrees removed, and the next Wave per `docs/PLAN.md`. If a PRD changed a dependency, update `docs/PLAN.md` in a `chore` PR.
