#!/usr/bin/env bash
# Starts one Ralph loop per Slice of the current Wave, in parallel, each in its own Worktree.
# Run from the main checkout after planning, and again after each approval or merge.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
git fetch --quiet origin

# Remove Worktrees whose PR is merged.
for wt in .claude/worktrees/*/; do
  [ -d "$wt" ] || continue
  id="$(basename "$wt")"
  if [ "$(gh pr view "feat/$id" --json state --jq .state 2>/dev/null)" = "MERGED" ]; then
    git worktree remove --force "$wt" && git branch -D "feat/$id" >/dev/null 2>&1 || true
    rm -f ".ralph/status/$id"
    echo "removed merged Worktree $id"
  fi
done

ids="$(node scripts/ralph/wave.mjs)"
[ -n "$ids" ] || { echo "No Slice is ready. Plan the next Slices (docs/PLAN.md + docs/briefs/)."; exit 0; }

pids=()
for id in $ids; do
  wt=".claude/worktrees/$id"
  if [ ! -d "$wt" ]; then
    if git ls-remote --exit-code --heads origin "feat/$id" >/dev/null 2>&1; then
      git worktree add "$wt" -B "feat/$id" "origin/feat/$id"
    else
      git worktree add "$wt" -b "feat/$id" origin/main
    fi
    (cd "$wt" && npm ci --silent)
  fi
  echo "starting loop for $id"
  scripts/ralph/loop.sh "$wt" &
  pids+=($!)
done

for pid in "${pids[@]}"; do wait "$pid" || true; done
echo; echo "Wave status:"
for id in $ids; do printf '  %-32s %s\n' "$id" "$(cat ".ralph/status/$id" 2>/dev/null || echo '?')"; done
