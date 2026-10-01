"""Claude Code PreToolUse hook for Bash: guard every `git push`.

1. A push to `main` is refused (QA-10). `main` deploys to production and the
   free plan has no branch protection; `main` changes only by merging a
   green PR.
2. The preflight runs in the tree being pushed, and a failure blocks the
   push (exit 2), so a broken commit never reaches GitHub. That tree is the
   one the command names (`cd <dir> && ... git push`, `git -C <dir> push`),
   not the session's: a push from a worktree used to be checked against the
   main checkout and went out red.

Anything that is not a push passes through (exit 0).

For tests: PREPUSH_PREFLIGHT replaces the preflight command (run in the
pushed tree), PREPUSH_LOG the log path.
"""

import json
import os
import re
import shlex
import subprocess
import sys

PUSH = re.compile(r"(?:^|[^\w-])git((?:\s+-\S+(?:\s+[^-\s]\S*)?)*)\s+push(?=\s|$)([^;&|\n]*)")


def blocked(message: str) -> None:
    print(message, file=sys.stderr)
    sys.exit(2)


def main() -> None:
    try:
        cmd = json.load(sys.stdin).get("tool_input", {}).get("command", "") or ""
    except Exception:
        cmd = ""
    m = PUSH.search(cmd)
    if not m:
        sys.exit(0)
    git_opts, push_args = m.group(1), m.group(2)

    root = os.environ.get("CLAUDE_PROJECT_DIR") or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    # The directory the push runs in: `git -C <dir>`, else the last `cd <dir>` before it.
    target = None
    c = re.search(r"-C\s+(\S+)", git_opts)
    if c:
        target = c.group(1)
    else:
        cds = re.findall(r"(?:^|[;&|]\s*)cd\s+(\S+)", cmd[: m.start()])
        if cds:
            target = cds[-1]
    target = (target or root).strip("\"'")
    if not os.path.isabs(target):
        target = os.path.join(root, target)

    # 1. Never to main.
    try:
        words = shlex.split(push_args)
    except ValueError:
        words = push_args.split()
    if any(w in ("--all", "--mirror") for w in words):
        blocked("Push blocked: --all/--mirror would push main too. Push one claude/<topic> branch.")
    refspecs = [w for w in words if not w.startswith("-")][1:]  # after the remote
    def to_main(spec: str) -> bool:
        dest = spec.split(":")[-1].lstrip("+")
        return dest in ("main", "refs/heads/main")
    current = subprocess.run(["git", "-C", target, "rev-parse", "--abbrev-ref", "HEAD"], capture_output=True, text=True).stdout.strip()
    if any(to_main(s) for s in refspecs) or (not refspecs and current == "main") or any(s == "HEAD" and current == "main" for s in refspecs):
        blocked(
            "Push blocked: never push to main (QA-10). Push a claude/<topic> branch and open a PR; "
            "main changes only by merging a green PR."
        )

    # 2. Preflight in the tree being pushed.
    log = os.environ.get("PREPUSH_LOG", "/tmp/polo-preflight.log")
    override = os.environ.get("PREPUSH_PREFLIGHT")
    with open(log, "w") as out:
        if override:
            code = subprocess.run(["bash", "-c", override], cwd=target, stdout=out, stderr=subprocess.STDOUT).returncode
        else:
            code = subprocess.run(["bash", os.path.join(target, "scripts", "preflight.sh")], stdout=out, stderr=subprocess.STDOUT).returncode
    if code == 0:
        sys.exit(0)
    with open(log) as f:
        lines = [l.rstrip() for l in f if re.search(r"^\s*✗|error|Error|FAIL", l)][:40]
    blocked(
        "\n".join(
            [f"Push blocked: preflight failed in {target}. CI runs these exact commands, so this push would go red.", "Fix the failures below, then push again.", *lines, f"(full log: {log})"]
        )
    )


main()
