#!/usr/bin/env bash
# ── Claude Code PreToolUse hook (Bash) ──
# Reads the tool call from stdin. When it is a `git push`, refuses a push to
# `main` and runs the preflight in the tree being pushed, blocking the push
# (exit 2) if anything fails. Everything else passes through.
# The logic lives in prepush-guard.py.
exec python3 "$(dirname "$0")/prepush-guard.py"
