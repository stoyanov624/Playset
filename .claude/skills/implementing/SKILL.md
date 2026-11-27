---
name: implementing
description: Build Playset Slices end to end — PRD → user approval → red/green TDD (test-writer, implementer) → Ralph review loop until it converges → test quality gate → code-review gate → CI → user-approved push, PR and merge. Runs independent Slices of a Wave in parallel git worktrees. Use when the user types /implementing [Id…] or asks to build the next Slice(s).
---

# /implementing [Id…]

If you are reading this after compaction: re-read each running Slice's state file (`<Worktree>/.ralph/state.md`), start from the first unchecked step there, and do not redo checked steps. Follow each step exactly as written.

## Context
- Input: Slice Ids (`NNNN-slug`) from `docs/PLAN.md`. Without Ids, the Wave = `node scripts/wave.mjs` (planned, unbuilt Slices whose dependencies are built). Show the user the plan status (built / this Wave / later) before starting.
- Each Slice has a **brief** `docs/briefs/<Id>.md` (agreed in a planning session) and becomes a **PRD** `docs/prd/<Id>.md`. Read both fully; never deviate from the PRD's scope.
- Read `CLAUDE.md`, `GLOSSARY.md` (the only domain vocabulary), and for web Slices `docs/phases/web-ui.md`, ADRs in `docs/adr/`, `docs/design.md`.
- Layout: domain logic `src/core/<module>/` (front-end agnostic, everything injected); web server `src/web/server/` (Express); web client `src/web/client/` (React + Vite); API contract `src/web/shared/`; CLI `src/cli/`; tests mirror under `test/`.
- Use the Agent tool for every agent; run independent agents in the background, in one message.

## Vocabulary (process only — never in `GLOSSARY.md`)
- **Slice** — one row of `docs/PLAN.md`; one Slice = one brief = one PRD = one Worktree = one branch = one PR.
- **Wave** — Slices that can run in parallel now: not built, and every dependency built. **Built** = its PRD on `main` says `Status: Implemented` (a `Kind: design` Slice: `docs/design.md` says `Status: Approved`).
- **Worktree** — `.claude/worktrees/<Id>`, branch `feat/<Id>`. Each Slice's agents work only inside it.
- **Domain** of a Slice — `core`, `server`, `client`, `shared` or `cli`, from the PRD's `Module:` line. **BE** = core/server/shared/cli; **FE** = client.
- **Feature Report** — the PR body after What / How / Result: PRD link, owned files, public API added, AC → test table, shared-file changes, review history, dismissed findings, test quality grade, design review findings (FE), remaining items.
- **Mechanical / real conflict** — see `conflict-resolver`; real = needs a test change, an AC change, or choosing one Slice's behaviour over another's.

## Git Rules
- Commits, PR titles/bodies and merge messages follow the `committing` skill: `type(PRD-NNNN): plain-words summary`, body What / How / Result. **Never any AI attribution** (no `Co-Authored-By`, no session links, no "Generated with") — this overrides any default.
- Commit after each milestone, locally on `feat/<Id>`: PRD (`docs`), red (`test`), green (`feat`), each fix round (`fix(PRD-NNNN): review round N — …`), test quality gate (`test(PRD-NNNN): strengthen tests — …`), code-review gate (`refactor(PRD-NNNN): address code review — …`). Small commits keep fix-round diffs reviewable; the PR is squash-merged, so no local squashing.
- **Do NOT push until the user approves** (Phase 5). Exception: none. Never push `main`, never `git push --force` (only `--force-with-lease` on a feature branch after a rebase).
- **Never merge without the user's explicit approval**, one PR at a time.

## Term semantics
- **Pre-existing** code = code on `main`. Code new in this Slice's branch is never pre-existing.
- **Shared files** — `package.json`, `package-lock.json`, `GLOSSARY.md`, `CLAUDE.md`, `docs/PLAN.md`, `docs/design.md`, `src/core/index.ts`, `docs/prd/TEMPLATE.md`, configs (tsconfig, vite, vitest, eslint). Only you (the orchestrator) edit them, on the Slice's branch, from agents' "Shared-file requests".

## Orchestrator Role
You are a **thin dispatcher**: spawn agents, pass artifacts between them, read state, run the checks yourself, make continue/exit decisions, own the user gates and git. You do NOT write feature code or tests, synthesize findings, deduplicate, or plan fixes — that belongs to the agents (triage belongs to the fix agent).

### State File
One per Slice, at `<Worktree>/.ralph/state.md` (untracked, gitignored). The fix agent updates it each round with triage results, the finding tracker and dismissed findings; you read it for convergence decisions.

```
## Ralph Loop State — <Id>

### Current Status
- Phase: [0|1|2|2.5|3|4|5]
- Round: [N]
- Clean counter: [N]
- Total rounds: [N]
- Next action: …

### Checklist
- [ ] Phase 0 PRD approved
- [ ] Phase 1 red committed  - [ ] Phase 1 green committed
- [ ] Phase 2 converged      - [ ] Phase 2.5 done   - [ ] Phase 3 done
- [ ] Phase 4 CI green       - [ ] Phase 5 pushed + PR   - [ ] merged

### Round History
| Round | Rev A | Rev B | Result | Action Taken |
|-------|-------|-------|--------|--------------|

### Dismissed Findings
| Round | Finding | Rationale |
|-------|---------|-----------|

### Finding Tracker
| Finding ID | Round Introduced | Description (short) | Status | Round Resolved | Round Recurred |
|------------|-----------------|----------------------|--------|---------------|----------------|
```
Statuses: `open` → `fixed` → `recurred` (if it comes back). Finding IDs: `R<round>-<BE|FE>-<A|B>-<n>`.

Before starting any phase or round, **re-read the state file**.

### Re-anchoring
At each phase boundary and each Ralph Loop round, re-read the relevant section of this skill. State the Slice, phase, round, clean counter and next action before continuing.

### Parallel Slices
Slices of a Wave run independently, each in its own Worktree with its own state file: never wait for one Slice to advance another. Agent prompts always start with: `WORKTREE: <absolute path>. Work only inside this directory; run every command with it as cwd; never touch the main checkout.` Setup per Slice:
```
git worktree add .claude/worktrees/<Id> -b feat/<Id> main
(cd .claude/worktrees/<Id> && npm ci)
```
Server and client Slices can run in parallel only when the API contract already exists on `main` (a `shared` Slice built first, or the contract fully specified in both briefs). If not, stop and plan it with the user.

## Required Context Loading
Before writing code or reviewing, every agent MUST load its domain's rules — non-negotiable. Rule files are **not** loaded automatically for agents inside a Worktree, so name them in every prompt.

| Domain | Rules to read | Skills |
|---|---|---|
| core / cli | `CLAUDE.md` (Architecture, Product rules, External API facts), `.claude/rules/tests.md` | — |
| server | `.claude/rules/web-server.md`, `.claude/rules/web-shared.md`, `.claude/rules/tests.md` | — |
| shared | `.claude/rules/web-shared.md`, `.claude/rules/tests.md` | — |
| client | `.claude/rules/web-client.md`, `.claude/rules/web-shared.md`, `.claude/rules/tests.md`, `docs/design.md`, `.claude/references/impeccable/craft-floor.md` | implementers: `vercel-react-best-practices` (client rules only) |

Reviewers check against project rules only — do not invoke external skills. Do not search for additional skills beyond these.

---

## Phase 0: PRD → user gate
Update the state file: Phase 0.
1. Spawn `prd-writer` (Worktree, PRD number from the Id, brief path; FE: `docs/design.md`; name any API contract change).
2. Review the PRD yourself: testable ACs with examples, glossary terms only, `Depends on:` and `Module:` filled, "Changes to earlier PRDs" checked against **every** earlier PRD it touches. Send back until good.
3. **GATE — present all PRDs of the Wave together; the user approves or rejects each.** Approved → `Status: Approved`, commit `docs(PRD-NNNN): …`. Rejected → revise or drop from the Wave.
A `Kind: design` Slice instead: design pass with the `frontend-design` skill (concept grounded in the subject, 4–6 named colour tokens, self-hosted fonts and type scale, a wireframe per screen, banned patterns incl. the craft-floor Refuse list) → `docs/design.md` `Status: Draft` → user approves → `Approved` → straight to Phase 5.

## Phase 1: Implementation (TDD, split red/green)
Update the state file: Phase 1, Round 0, Clean counter 0.

**Plan contract requirement:** a server or client Slice needs the API contract (routes, methods, zod request/response schemas, error codes) defined in `src/web/shared/` on `main` or exactly in its PRD. If vague, resolve with the user before spawning agents. The shared contract is written first; the client consumes it and never re-declares a shape.

1. **Red — `test-writer`** (model: opus). Worktree, PRD, public entry point (e.g. `src/core/<module>`, `src/web/server/app`), rules files of the domain. It never reads `src/`. Order of tests:
   - core / cli: public-API behaviour per AC → edge cases, error paths.
   - server: route behaviour through `createApp(fakes)` with supertest (status, body shape, each error code, no secret leaks) → adapter tests (SQLite record on `:memory:`).
   - client: screen behaviour with Testing Library + user-event against a fake API client (happy, loading, empty, each error code, keyboard) → axe check per screen.
2. **Coverage check (you):** every AC has ≥1 test named `AC-n: …`; tests fail for the right reason (missing behaviour, not a typo or import error); only the Slice's `test/` folder touched. Else send back. Commit `test(PRD-NNNN): …`.
3. **Green — `implementer`** (model: opus). Worktree, PRD, tests, expected API, rules files, skills. Minimum code to pass, then refactor its own new code only (re-read rules, no public-interface changes, tests stay green; time-box: stop if refactoring exceeds implementation time). It never edits `test/`; a suspected wrong test → it stops and reports → you bring it to the user. Nobody silently edits tests.
4. **Verify (you, never trust "all green"):** `npm test`, `npm run typecheck`, `npm run lint` (once it exists) green in the Worktree; `git diff main -- test/` holds only the test-writer commit. Apply shared-file requests. Commit `feat(PRD-NNNN): …`.

### Done Checklist (implementer and every fix agent)
- [ ] `npm test`, `npm run typecheck`, `npm run lint` green, run within the last action (not stale)
- [ ] No TODO, FIXME or HACK in new code
- [ ] Comments only where they explain *why*, in domain words — never "PRD/AC/Slice" numbers
- [ ] No unused code (locals, parameters, exports, imports, files)
- [ ] No hard-coded values that belong in config or design tokens
- [ ] New public API exported only where the PRD says (shared-file request for `src/core/index.ts`)
- [ ] Nothing changed outside the Slice's own folders

### Stall Detection
If an agent runs **3 full test cycles without progress** (same tests failing, same errors), stop it and report the blocker to the user.

---

## Phase 2: Ralph Loop
Update the state file: Phase 2.
The Ralph Loop compensates for the probabilistic nature of LLM reviews: repeat review → fix until statistically clean.

### Review Scaling
| Diff scope (`git diff main...HEAD`, excluding docs) | Reviewers |
|---|---|
| BE-only, < 500 lines | 1 BE (combined checklist) |
| FE-only, < 500 lines | 1 FE (combined checklist) |
| ≥ 500 lines in a domain | 2 for that domain (A = correctness, B = architecture) |

### Step 1: Review (fresh agents in parallel, model: sonnet)
Re-read the state file. Increment the round. State round and clean counter, then spawn fresh `general-purpose` reviewers (read-only use: they must not edit files). Fresh context prevents anchoring bias. Every reviewer loads its domain's rules, works on `git diff main...HEAD` only, and may read surrounding code for context.

**Cross-round context (Round 2+):** give each reviewer the triage summaries of the **last 2 rounds**, the **full** dismissed list and the Finding Tracker table, framed as: "Recent fixes: […]. Dismissed findings: […]. Finding status: […]. Do not re-flag dismissed items unless you have NEW evidence. Focus on verifying recent fixes and finding genuinely new issues."

**Diff scope rule:** only flag newly added or modified lines. Pre-existing issues go under "Pre-existing (out of scope)" and don't count for convergence. **Cross-cutting:** BE reviewers may read the client's API layer and FE reviewers the server routes and `src/web/shared/` to verify contract alignment; mismatches go under "Cross-cutting".

**TDD compliance:** the `test(PRD-NNNN)` commit must come before the `feat(PRD-NNNN)` commit and `git diff main -- test/` must hold only test-writer and test-gate changes. Flag Critical if not.

**Severity:** Critical = bug, crash, security hole, secret leak, data loss. Important = breaks a rules file, `CLAUDE.md` product rule, or glossary term; degrades maintainability. Minor = style, naming, inconsistency without effect on correctness.

#### BE reviewer (core / server / shared / cli)
- Bugs, logic errors, edge cases, undefined handling, races (concurrent create/update of one Setlist Playlist)
- Error handling: `PlaysetError` hierarchy in core; server error catalogue — generic codes, visitor-readable message/hint, nothing internal leaked
- Security: input validated with zod, no secrets/tokens in responses or logs, CSP/helmet, rate limits, admin cookie and Host Account id check, only allowed URL prefixes
- Domain correctness vs `CLAUDE.md` product rules (played order, Tapes, snippets, medleys, Unknown Songs, Incomplete Setlist, Match rules)
- Architecture: core front-end agnostic and injected; thin routes; `createApp(deps)`; config read once; SQL only in the SQLite adapter
- Test quality: behaviour verified, not calls; no network; fixtures
- Naming (glossary), file organization, dead code, unused imports; contract cross-check

#### FE reviewer (client)
- Bugs, undefined handling, render branches, stale TanStack Query state, URL ↔ screen state
- Error handling by `code`; message/hint shown as given
- Accessibility: semantic HTML, labels, focus moves to the new heading, live region for progress, keyboard path, 44px targets
- Security: no `dangerouslySetInnerHTML`, no tokens or keys in the bundle, only our API
- Design: tokens only, `docs/design.md` followed, nothing from the craft-floor Refuse list
- Performance: needless re-renders, bundle weight, client rules of `vercel-react-best-practices`
- Test quality: role/label queries, axe per screen, states covered
- Naming (glossary words in UI text), file organization, reuse, dead code; contract cross-check

With 2 reviewers per domain: A = correctness (bugs, security, tests, contract), B = architecture (rules, patterns, performance, naming, organization). Both load the same context.

#### Review Output Format
```
## [BE/FE] Review — <Id> — Round N
### Critical (must fix)
1. [file:line] Description — why it matters
### Important (should fix)
### Minor (could fix)
### Cross-cutting
### Suggestions (max 3, does not block convergence)
### Pre-existing (out of scope)
```
No issues → "No issues found." Cross-cutting findings count toward convergence at their severity.

**FE Slices, every round:** also run the `web-design-guidelines` skill on the changed client files and add its findings to the FE review (Important if it breaks `web-client.md`, else Minor).

### Step 2: Fix + Triage (model: opus)
If any non-pre-existing finding exists, spawn a fresh `implementer` (the fix agent) with all reviewer outputs and the state file. It owns triage → fix:

**Triage (before any code):**
1. Read all reviews of this round and the state file.
2. **Deduplicate** — several findings may be one root cause.
3. **Recurrence** — a finding matching one marked `fixed` (same file, issue type, same or adjacent lines) → mark `recurred`, flag "Recurring — root cause fix required". **2+ `recurred`** → oscillation response: review all fix-round diffs together, find the cascading side effect, root-cause before fixing.
4. **Dismiss** wrong, already-handled or intentional findings — each with the finding reference and evidence (rules file section, `CLAUDE.md` rule, PRD AC, ADR).
5. **Prioritize** — Critical first, architecture before surface, root cause over symptom.
6. Contradicting reviewers → decide by rules files and codebase.
7. Suggestions — fix only if trivial.

**Dismissal guardrail:** > 50 % dismissed → pause and tell the user (reviewers miscalibrated or dismissals too aggressive).
**Abort threshold:** 5+ Critical in one round → group by root cause; 3+ sharing one → fix the root cause; diverse across subsystems → report to the user before restarting Phase 1. Never discard work without analysis.

**Fix:**
- Load the domain's rules; each fix traceable to a finding; no unrelated changes.
- A fix that changes behaviour needs a test: the fix agent **does not write tests** — it lists the missing test and you spawn `test-writer` for it first (red), then the fix (green). A fix that would change an existing test or an AC → stop and bring it to the user.
- Satisfy the Done Checklist. You verify and commit `fix(PRD-NNNN): review round N — …`.

**Update State** (fix agent): new findings `open`, fixed `fixed`, recurred `recurred` with round, dismissed with rationale, a short triage summary for cross-round context. All dismissed → you update the state file and go to convergence.

### Step 3: Convergence Check
Re-read the state file; update round history and counters.
- **Hard clean** = zero Critical/Important/Minor after dismissals (suggestions-only counts as hard clean).
- **Soft clean** = only Minor.
- **Dirty** = any Critical or Important → clean counter back to 0. A soft clean doesn't reset it.

| Condition | Action |
|---|---|
| 2 consecutive hard clean | **EXIT** — high confidence |
| 1 hard + 1 soft clean (either order) | **EXIT** — acceptable |
| 3 consecutive soft clean | **EXIT** — Minors stable |
| otherwise, < 10 rounds | **CONTINUE** |
| 10 rounds | **EXIT** — report remaining as debt |

### Round 5 checkpoint
Round 5 with zero consecutive clean rounds → pause; diagnose with the Finding Tracker (many `recurred` = fixes don't land; flat count, different findings = fix regressions; no reviewer agreement = miscalibration); act (one opus agent reviews all fix-round diffs together / tighten reviewer prompts with codebase examples / you look at the root cause), then resume. The 10-round cap still applies.

---

## Phase 2.5: Test Quality Gate
Update the state file: Phase 2.5.
1. **Inspect** (fresh agent per domain touched, model: sonnet): read every test file in `git diff main...HEAD --name-only -- test/` **in full** plus the code it tests, and `.claude/rules/tests.md`. Score each file on: correctness (specific assertions that would catch real bugs), coverage (happy, error, boundary, empty; every AC), isolation (no shared mutable state, no order dependence), fakes (only injected services faked, realistic shapes, no testing the fake), naming (`AC-n: …`, behaviour in words), anti-patterns (tautologies, snapshot-only, `toBeTruthy`/`toBeInTheDocument` without value checks, `data-testid` where a role works, missing negative paths, implementation-detail tests). Output per file: tests, grade A–F, issues `[Critical/Important/Minor] [file:line]`, strengths; then an overall report with what is NOT tested.
2. **Fix all findings** — `test-writer` (it owns `test/`), model: opus. Critical, Important and Minor; no dismissals, no deferrals. It may now read the code under test to strengthen tests but must not change `src/`. If a stronger test fails, that's a real bug → `implementer` fixes it (Phase 2 fix rules).
3. You verify green and commit `test(PRD-NNNN): strengthen tests — …`. List every changed existing test in the Feature Report.

## Phase 3: Code Review Gate
Update the state file: Phase 3.
1. Run the `code-review` skill on the Worktree against `main` (Standards = `CLAUDE.md` + the domain's rules files; Spec = the PRD). Review only; read the findings, don't act yet.
2. Findings → fresh `implementer` with the Phase 2 Step 2 triage discipline in full (dedupe, recurrence vs the tracker, dismissals with evidence, Critical/Important fixed, Minor at discretion, tests via `test-writer` first). Severity calibration and the > 50 % guardrail apply.
3. Re-run `code-review`. Critical or Important left → one more pass. **Cap: 3 passes**, then record the rest as debt in the state file.
4. Commit `refactor(PRD-NNNN): address code review — …` if anything changed.

## Phase 4: CI Gate (model: sonnet)
Update the state file: Phase 4. Spawn an agent to run, in the Worktree:
```
npm ci && npm run typecheck && npm run lint && npm test && npm run build
```
Fix failures (trivial → that agent via `implementer` rules; non-trivial → opus `implementer`) and re-run until fully green. **FE Slices:** then start the app on a free port (`PLAYSET_WEB_PORT`, from 3100), spawn `design-review` (Worktree, URL, PRD), stop the app; Blocker/High findings → `implementer` and re-run this phase; Medium/Nit go to the Feature Report.
**Flaky rule:** a test that passes on re-run without code changes is flaky — re-run up to 2 times to confirm, and list it in the report.

## Phase 5: Final Report → push → merge
Update the state file: Phase 5; re-read it for accurate reporting. Set the PRD to `Status: Implemented` and commit `docs(PRD-NNNN): mark implemented`.

Report to the user per Slice:
1. **What was implemented** — files, behaviour, key decisions, shared-file changes
2. **Tests** — counts by kind, AC coverage
3. **Review history** — rounds, findings, fixes (from the state file)
4. **Dismissed findings** — with rationale
5. **Test quality gate** — findings, fixes, final grade
6. **Remaining items** — suggestions, pre-existing issues, debt, limitations
7. **Flaky tests**
8. **Confidence** — 2 hard clean = high; hard + soft = acceptable; 3 soft = adequate; 10 rounds = flag debt

**GATE — ask the user to approve the push and the PR text.** On approval: `git push -u origin feat/<Id>`, `gh pr create --base main` with title = squash subject and body = What / How / Result + Feature Report (per `committing`).

**GATE — merge, one PR at a time** (suggest fewest dependents first). On approval: `gh pr merge <n> --squash --delete-branch --subject … --body …` (per `committing`); `git switch main && git pull --ff-only`. Then for every other open Slice of the Wave, in its Worktree: `git fetch origin && git rebase origin/main`, `npm ci` if the lockfile changed, `npm test`, `npm run typecheck`, `npm run lint`.
- Clean and green → `git push --force-with-lease` if already pushed.
- Conflict or newly failing checks → spawn `conflict-resolver` (Worktree, git state or failing output, Feature Reports via `gh pr view <n> --json body`, both PRD paths). `RESOLVED` → verify green yourself, push with lease. `ESCALATED` → push notification `Real conflict: <Id> vs <Id> — needs your decision`, present `.conflict-brief.md`, plan the fix with the user (PRD change → user approves → test-writer → implementer).

After a merge: `git worktree remove .claude/worktrees/<Id>` and `git branch -D feat/<Id>`. When the Wave is done, report merged and parked Slices and the next Wave (`node scripts/wave.mjs`). If a PRD changed a dependency, update `docs/PLAN.md` in a `chore` PR.
