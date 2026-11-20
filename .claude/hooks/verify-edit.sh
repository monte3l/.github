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
  */blueprint/files/*) ;; # starters hold placeholders on purpose, such as `{date}` in ROADMAP.md
  */ROADMAP.md)
    # The one parser behind the `roadmap: sections` baseline item: five headings in
    # order and a valid `reviewed:` date. It runs from the repository this hook belongs
    # to, never from the repository of the edited file: a checkout Claude was only asked
    # to edit could ship its own bin/lib/roadmap.mjs, and this hook would run it. A
    # sibling that copied this hook has no such parser and skips the check.
    own="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
    if command -v node >/dev/null && [[ -f "$own/bin/lib/roadmap.mjs" ]]; then
      out="$(node "$own/bin/lib/roadmap.mjs" <"$file" 2>&1)" || fail "ROADMAP.md does not follow blueprint/tracking.md: $out"
    fi
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
