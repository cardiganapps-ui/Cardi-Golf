"""Claude Code PreToolUse hook for the GitHub MCP write tools (QA-10).

`push_files`, `create_or_update_file` and `delete_file` commit straight to a
branch, around the git pre-push guard. On `main` (or with no branch named,
which means the default branch) they are refused: `main` deploys to
production and changes only by merging a green PR.
"""

import json
import sys

try:
    call = json.load(sys.stdin)
except Exception:
    sys.exit(0)
branch = (call.get("tool_input") or {}).get("branch") or ""
if branch.strip() in ("", "main", "refs/heads/main"):
    print(
        f"Blocked: {call.get('tool_name', 'this GitHub write')} on {branch or 'the default branch'}. "
        "Commit to a claude/<topic> branch and open a PR; main changes only by merging a green PR (QA-10).",
        file=sys.stderr,
    )
    sys.exit(2)
sys.exit(0)
