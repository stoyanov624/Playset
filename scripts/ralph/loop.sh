#!/usr/bin/env bash
# Runs Ralph rounds for one Slice inside its Worktree until a round prints
# `RALPH: WAIT …` or `RALPH: DONE …`. Usage: scripts/ralph/loop.sh <worktree-path>
set -uo pipefail

WT="$(cd "$1" && pwd)"
ID="$(basename "$WT")"
MAIN="$(git -C "$WT" worktree list --porcelain | sed -n '1s/^worktree //p')"
STATE="$MAIN/.ralph"
mkdir -p "$STATE/logs" "$STATE/status"
LOG="$STATE/logs/$ID.log"
STATUS="$STATE/status/$ID"
MAX="${RALPH_MAX_ROUNDS:-25}"

ALLOWED=(
  Read Edit Write Glob Grep Agent Skill TodoWrite WebSearch WebFetch
  "Bash(git:*)" "Bash(npm:*)" "Bash(npx:*)" "Bash(node:*)" "Bash(ls:*)" "Bash(cat:*)"
  "Bash(gh pr create:*)" "Bash(gh pr view:*)" "Bash(gh pr edit:*)" "Bash(gh pr ready:*)" "Bash(gh pr list:*)"
  "Bash(lsof:*)" "Bash(kill:*)" "mcp__playwright"
)
DENIED=(
  "Bash(gh pr merge:*)" "Bash(git push origin main:*)" "Bash(git push origin HEAD:main:*)"
  "Bash(git push -f:*)" "Bash(rm -rf:*)" "Edit(.claude/**)" "Write(.claude/**)"
  "Edit(scripts/ralph/**)" "Write(scripts/ralph/**)"
)

notify() {
  command -v osascript >/dev/null 2>&1 &&
    osascript -e "display notification \"$1\" with title \"Ralph $ID\"" >/dev/null 2>&1 || true
}

for ((round = 1; round <= MAX; round++)); do
  echo "=== $(date '+%F %T') round $round" >>"$LOG"
  out="$(cd "$WT" && claude -p "$(cat "$WT/.claude/implement-ralph.md")

SLICE: $ID" \
    --permission-mode acceptEdits \
    --allowedTools "${ALLOWED[@]}" \
    --disallowedTools "${DENIED[@]}" 2>&1)"
  printf '%s\n' "$out" >>"$LOG"
  signal="$(printf '%s\n' "$out" | grep -E '^RALPH: (NEXT|WAIT|DONE)' | tail -1)"
  case "$signal" in
    "RALPH: NEXT"*) echo "$signal" >"$STATUS" ;;
    "RALPH: WAIT"* | "RALPH: DONE"*) echo "$signal" >"$STATUS"; notify "$signal"; exit 0 ;;
    *) echo "RALPH: WAIT no-signal (round $round, see $LOG)" >"$STATUS"; notify "no signal"; exit 1 ;;
  esac
done
echo "RALPH: WAIT max-rounds ($MAX)" >"$STATUS"; notify "max rounds"; exit 1
