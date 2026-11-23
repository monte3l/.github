#!/usr/bin/env bash
# PreToolUse hook: block `git commit` without a DCO sign-off (-s / --signoff).
# The main ruleset needs signed commits and CONTRIBUTING.md needs DCO, so catch it before push.
# Fails closed for commits: without jq it matches against the raw hook payload instead of exiting 0.
set -uo pipefail

payload="$(cat)"
if command -v jq >/dev/null 2>&1; then
  cmd="$(printf '%s' "$payload" | jq -r '.tool_input.command // empty')"
elif command -v perl >/dev/null 2>&1; then
  # No jq: pull the command string out of the JSON by hand and undo its escapes.
  cmd="$(printf '%s' "$payload" | perl -0ne 'if (/"command"\s*:\s*"((?:[^"\\]|\\.)*)"/s) { $c = $1; $c =~ s/\\n/\n/g; $c =~ s/\\(["\\\/])/$1/g; print $c }')"
else
  cmd="$payload"
fi

# Heredoc bodies and quoted strings (commit messages) must not count: drop their content,
# then split into one simple command per line on ; & | ( ) and newlines.
if command -v perl >/dev/null 2>&1; then
  cmd="$(printf '%s' "$cmd" | perl -0pe 's/(<<-?\s*([\x27"]?)(\w+)\2)([^\n]*)\n.*?\n[ \t]*\3[ \t]*(?=\n|\z)/$1$4/gs; s/"(?:[^"\\]|\\.)*"/""/gs; s/\x27[^\x27]*\x27/\x27\x27/gs')"
fi
# shellcheck disable=SC2020 # one newline per separator character is intended
cmd="$(printf '%s' "$cmd" | tr ';&|()' '\n\n\n\n\n')"

# `git`, optionally behind env/command/VAR=value and with global options (-C dir, -c k=v, --git-dir=...) before `commit`.
prefix='^[[:space:]]*((env|command|exec|time|nohup)[[:space:]]+|[A-Za-z_][A-Za-z0-9_]*=[^[:space:]]*[[:space:]]+)*'
globals='([[:space:]]+(-C[[:space:]]+[^[:space:]]+|-c[[:space:]]+[^[:space:]]+|--[A-Za-z-]+(=[^[:space:]]+)?))*'
commit_re="${prefix}git${globals}[[:space:]]+commit([[:space:]]|\$)"
# -s, --signoff, or a short-flag cluster containing s (for example -sS, -sm), within the same command
signoff_re='(^|[[:space:]])(--signoff|-[a-zA-Z]*s[a-zA-Z]*)([[:space:]]|$)'

while IFS= read -r line; do
  [[ "$line" =~ $commit_re ]] || continue
  [[ "$line" =~ $signoff_re ]] && continue
  echo "Blocked: this repo requires a DCO sign-off. Re-run with 'git commit -s' (commits must also be signed)." >&2
  exit 2
done <<<"$cmd"
exit 0
