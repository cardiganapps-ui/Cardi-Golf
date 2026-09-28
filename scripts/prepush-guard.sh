#!/usr/bin/env bash
# ── Claude Code PreToolUse hook (Bash) ──
# Reads the tool call from stdin; when it is a `git push`, runs the
# preflight first and blocks the push (exit 2) if anything fails, so a
# broken commit never reaches GitHub. Everything else passes through.
set -uo pipefail
input="$(cat)"
cmd="$(printf '%s' "$input" | python3 -c 'import json,sys
try: print(json.load(sys.stdin).get("tool_input",{}).get("command",""))
except Exception: print("")')"
# Any form of `git push` (git -C dir push, git --no-pager push, chained commands).
if ! printf '%s' "$cmd" | grep -Eq '(^|[^[:alnum:]_-])git([[:space:]]+-[^[:space:]]+([[:space:]]+[^-[:space:]][^[:space:]]*)?)*[[:space:]]+push([[:space:]]|$)'; then
  exit 0
fi

root="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
log=/tmp/nachos-preflight.log
if bash "$root/scripts/preflight.sh" > "$log" 2>&1; then
  exit 0
fi
{
  echo "Push blocked: preflight failed. CI runs these exact commands, so this push would go red."
  echo "Fix the failures below, then push again."
  grep -E '^\s*✗|error|Error|FAIL' "$log" | head -40
  echo "(full log: $log)"
} >&2
exit 2
