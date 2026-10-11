#!/usr/bin/env bash
# PostToolUse hook: run the matching verify.yml check on the file just edited.
# Exit 2 feeds the error back to Claude. Tools missing locally are skipped; CI still runs them.
set -uo pipefail

file="$(jq -r '.tool_input.file_path // empty')"
[[ -n "$file" && -f "$file" ]] || exit 0

fail() { printf '%s\n' "$1" >&2; exit 2; }

case "$file" in
  */blueprint/*.json | */workflow-templates/*.json)
    out="$(jq empty "$file" 2>&1)" || fail "Invalid JSON in $file: $out"
    ;;
  */bin/*.sh)
    out="$(bash -n "$file" 2>&1)" || fail "Syntax error in $file: $out"
    if command -v shellcheck >/dev/null; then
      out="$(shellcheck "$file" 2>&1)" || fail "shellcheck failed for $file: $out"
    fi
    ;;
  */workflow-templates/*.yml | */.github/workflows/*.yml)
    if command -v actionlint >/dev/null; then
      out="$(actionlint "$file" 2>&1)" || fail "actionlint failed for $file: $out"
    fi
    ;;
esac
exit 0
