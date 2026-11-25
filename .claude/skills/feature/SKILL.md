---
name: feature
description: Run the Setlist2Playlist feature pipeline — plan → PRD → user approval → failing tests → implementation → PR → user approval to merge. Use when the user types /feature <topic> or asks to build the next slice.
---

# /feature <topic>

Follow these steps in order. Never skip a gate.

## 1. Plan
- Read `CLAUDE.md`, `GLOSSARY.md`, and existing `docs/prd/`.
- If no topic is given, propose the next unbuilt slice from the build order in `CLAUDE.md`.
- Discuss scope with the user until the behaviour is clear (grill briefly: edge cases, non-goals). Resolve any new domain term into `GLOSSARY.md` before moving on.

## 2. Branch
- From an up-to-date `main`: `git switch main && git pull --ff-only` (if a remote exists), then `git switch -c feat/NNNN-slug` (NNNN = upcoming PRD number).

## 3. PRD
- Spawn the `prd-writer` agent with the agreed plan summary.
- Review its output yourself (ACs testable? examples present? glossary terms only?). Fix with it if needed.
- **GATE — show the user the PRD and wait for explicit approval.** Then set its status to `Approved` and commit: `docs(prd): NNNN <title>`.

## 4. Red
- Spawn the `test-writer` agent with: the PRD path and the public module path(s) the feature should expose.
- Verify: every AC has ≥1 test, tests fail for the right reason, no files outside `test/` were touched. Send it back if not.
- Commit: `test(NNNN): failing tests for <title>`.

## 5. Green
- Spawn the `implementer` agent with: the PRD path, test files, and the expected API from the test-writer.
- If it reports a suspected wrong test, bring that to the user — do not let anyone silently edit tests.
- Verify yourself: `npm test` and `npm run typecheck` pass; `git diff main -- test/` shows only test-writer commits.
- Commit: `feat(NNNN): <title>`. Set PRD status to `Implemented`.

## 6. Merge gate
- Push the branch and open a PR to `main` (`gh pr create`) whose body links the PRD and lists the AC → test mapping.
- **GATE — ask the user for approval to merge. Never merge without it.** On approval: `gh pr merge --squash --delete-branch`, then `git switch main && git pull --ff-only`.
