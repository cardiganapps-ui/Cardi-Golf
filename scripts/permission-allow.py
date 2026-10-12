#!/usr/bin/env python3
"""PermissionRequest hook: answer «allow» for the Claude Code Remote tools Diego never wants to be asked about.

The allow list in .claude/settings.json already names them, but the session's
MCP server may be spelled differently (Claude_Code_Remote, claude-code-remote),
so this matches the tool by its last part and nothing else. Any other tool gets
no answer and goes through the normal permission flow.
"""
import json
import sys

ALWAYS = {"send_later", "subscribe_pr_activity"}

try:
    event = json.load(sys.stdin)
except Exception:
    sys.exit(0)

name = str(event.get("tool_name", ""))
if name.startswith("mcp__") and name.split("__")[-1] in ALWAYS:
    print(json.dumps({"hookSpecificOutput": {"hookEventName": "PermissionRequest", "decision": {"behavior": "allow"}}}))
