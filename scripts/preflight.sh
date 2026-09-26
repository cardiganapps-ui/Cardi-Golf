#!/usr/bin/env bash
# ── Preflight ──
# Exactly what CI runs, in the same order, with the exit code preserved.
# The Claude Code hook in .claude/settings.json runs it before every
# `git push` and blocks the push when it fails. Never judge a check by
# output piped through `tail`/`grep`: a pipe swallows the exit code.
# Steps the package.json doesn't define yet are skipped, so this is
# already safe before the app is scaffolded (M0).
set -uo pipefail
cd "$(dirname "$0")/.."

if [ ! -f package.json ]; then
  echo "✓ preflight: no package.json yet — nothing to check"
  exit 0
fi

has_script() {
  node -e 'process.exit(require("./package.json").scripts?.[process.argv[1]] ? 0 : 1)' "$1"
}

steps=("typecheck" "lint" "test" "build")
failed=()
for s in "${steps[@]}"; do
  if ! has_script "$s"; then
    printf '  – %s (not defined yet, skipped)\n' "$s"
    continue
  fi
  printf '\n\033[1m▸ npm run %s\033[0m\n' "$s"
  if npm run --silent "$s"; then
    printf '  ✓ %s\n' "$s"
  else
    printf '  ✗ %s\n' "$s"
    failed+=("$s")
  fi
done

echo
if [ ${#failed[@]} -eq 0 ]; then
  echo "✓ preflight clean — this push will not fail CI"
  exit 0
fi
echo "✗ preflight failed: ${failed[*]} — fix before pushing (CI runs these same commands)"
exit 1
