#!/usr/bin/env bash
# PreToolUse hook: block `git commit` without a DCO sign-off (-s / --signoff).
# The main ruleset needs signed commits and CONTRIBUTING.md needs DCO, so catch it before push.
set -uo pipefail

cmd="$(jq -r '.tool_input.command // empty')"
# Only a real invocation: at the start of the command or after ; & | ( or a newline.
# Mentions of "git commit" inside a heredoc or quoted prose must not trigger it.
[[ "$cmd" =~ (^|[;\&|\(]|$'\n')[[:space:]]*git[[:space:]]+commit([[:space:]]|$) ]] || exit 0

# -s, --signoff, or a short-flag cluster containing s (for example -sS, -sm)
if [[ "$cmd" =~ (^|[[:space:]])(--signoff|-[a-zA-Z]*s[a-zA-Z]*)([[:space:]]|$) ]]; then
  exit 0
fi

echo "Blocked: this repo requires a DCO sign-off. Re-run with 'git commit -s' (commits must also be signed)." >&2
exit 2
