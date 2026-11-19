#!/usr/bin/env bash
# SPDX-FileCopyrightText: Copyright (c) 2026 Enrico Lionello (enri3l) and Giulia Montevecchi (giulmonte), monte3l
# SPDX-License-Identifier: MIT
#
# Reports upstream policies that changed since a person last looked at them
# (blueprint/upstream.json): the OpenSSF Scorecard checks, the OpenSSF Baseline,
# the OpenSSF Best Practices criteria and the REUSE specification. The
# organization's standard follows these, and nothing else notices when they move.
#
#   upstream-watch.sh [--accept [NAME]] [FILE]
#
# Without --accept, prints one line per source, `OK` or `CHANGED`, then a
# summary. Nothing is changed. A person reads the linked change, updates
# blueprint/ if the standard should follow, and then runs --accept so the new
# value becomes the reviewed one.
#
# --accept records the current value as reviewed, for every source or only NAME,
# and rewrites FILE. It is a statement that you have looked: do not run it to
# silence a report.
#
# What counts as a change, per kind:
#   scorecard-checks   the set of checks and their risk levels. A new, removed
#                      or re-rated check. Documentation edits do not count
#   latest-release     the newest release tag of a repository
#   last-commit        the newest commit that touches a path
#   changelog-heading  the newest released heading of a CHANGELOG.md
#
# Needs gh (any token: everything read is public), jq, and awk. FILE defaults
# to blueprint/upstream.json.
# Exit codes: 0 nothing changed, 1 something changed, 2 usage or a missing tool,
# 3 a call failed.
set -eEuo pipefail
trap 'exit 3' ERR
# One sort order everywhere: a locale that ignores `-` would sort the recorded
# value differently from CI and report a change that is not one.
export LC_ALL=C

usage() {
  sed -n '5,31p' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-2}"
}

accept=0
accept_name=""
file="blueprint/upstream.json"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --accept)
      accept=1
      if [[ $# -ge 2 && "$2" != -* && ! -f "$2" ]]; then accept_name="$2"; shift; fi
      shift
      ;;
    -h | --help) usage 0 ;;
    -*) echo "unknown option: $1" >&2; usage ;;
    *) file="$1"; shift ;;
  esac
done

for tool in gh jq awk base64 sort comm; do
  command -v "$tool" >/dev/null || { echo "missing tool: $tool" >&2; exit 2; }
done
[[ -f "$file" ]] || { echo "no such file: $file" >&2; exit 2; }

# current KIND REPO PATH: the value now.
current() {
  local kind="$1" repo="$2" path="$3"
  case "$kind" in
    scorecard-checks)
      # "Name=Risk" for every check, sorted, on one line.
      # A check with no risk line prints "Name=?" so it is not silently missed, and
      # a later top-level key ends the section.
      gh api "repos/$repo/contents/$path" --jq .content | base64 -d | awk '
        function flush() { if (name != "" && !seen) print name "=?"; name = "" }
        /^checks:/ { inchecks = 1; next }
        inchecks && /^[^ #]/ { flush(); inchecks = 0 }
        inchecks && /^  [A-Za-z0-9-]+:[[:space:]]*$/ { flush(); name = $1; sub(/:$/, "", name); seen = 0 }
        inchecks && /^    risk:/ { print name "=" $2; seen = 1 }
        END { flush() }' | sort | tr '\n' ' ' | sed 's/ $//'
      ;;
    latest-release) gh api "repos/$repo/releases/latest" --jq .tag_name ;;
    last-commit) gh api "repos/$repo/commits?path=$path&per_page=1" --jq '.[0].sha' ;;
    changelog-heading)
      # The newest released heading, `## 3.3 - 2024-11-14`: the first one that
      # starts with a digit, so `## Unreleased` is skipped.
      # awk reads all of its input, so an early exit cannot close the pipe on
      # base64 and trip pipefail, and it exits 0 when there is no such heading.
      gh api "repos/$repo/contents/$path" --jq .content | base64 -d | awk '!found && /^## [0-9]/ { found = 1; sub(/^## /, ""); print }'
      ;;
    *) return 1 ;;
  esac
}

# explain KIND REPO PATH OLD NEW: what moved, with a link to read.
explain() {
  local kind="$1" repo="$2" path="$3" old="$4" new="$5"
  case "$kind" in
    scorecard-checks)
      local added removed
      added="$(comm -13 <(tr ' ' '\n' <<<"$old" | sort) <(tr ' ' '\n' <<<"$new" | sort) | tr '\n' ' ' | sed 's/ $//')"
      removed="$(comm -23 <(tr ' ' '\n' <<<"$old" | sort) <(tr ' ' '\n' <<<"$new" | sort) | tr '\n' ' ' | sed 's/ $//')"
      printf 'now: %s; was: %s (https://github.com/%s/blob/main/%s)' "${added:-none}" "${removed:-none}" "$repo" "$path"
      ;;
    changelog-heading) printf '%s -> %s (https://github.com/%s/blob/main/%s)' "$old" "$new" "$repo" "$path" ;;
    *) printf '%s -> %s (https://github.com/%s/compare/%s...%s)' "${old:0:12}" "${new:0:12}" "$repo" "$old" "$new" ;;
  esac
}

changed=0
matched=0
updated="$(mktemp)"
trap 'rm -f "$updated" "$updated.next"' EXIT
cp "$file" "$updated"

while IFS=$'\t' read -r name kind repo path reviewed; do
  [[ "$path" != "-" ]] || path=""
  case "$kind" in
    scorecard-checks | latest-release | last-commit | changelog-heading) ;;
    *) printf 'unknown kind "%s" for %s in %s\n' "$kind" "$name" "$file" >&2; exit 2 ;;
  esac
  if [[ "$accept" -eq 1 && -n "$accept_name" && "$name" != "$accept_name" ]]; then continue; fi
  matched=$((matched + 1))
  now="$(current "$kind" "$repo" "$path")"
  [[ -n "$now" ]] || { printf 'could not read %s\n' "$name" >&2; exit 3; }
  if [[ "$accept" -eq 1 ]]; then
    jq --arg n "$name" --arg v "$now" 'map(if .name == $n then .reviewed = $v else . end)' "$updated" >"$updated.next"
    mv "$updated.next" "$updated"
    printf 'ACCEPT  %s: %s\n' "$name" "${now:0:80}"
  elif [[ "$now" == "$reviewed" ]]; then
    printf 'OK      %s: %s\n' "$name" "${reviewed:0:40}"
  elif [[ -z "$reviewed" ]]; then
    printf 'CHANGED %s: nothing reviewed yet, run --accept after reading it\n' "$name"
    changed=$((changed + 1))
  else
    printf 'CHANGED %s: %s\n' "$name" "$(explain "$kind" "$repo" "$path" "$reviewed" "$now")"
    changed=$((changed + 1))
  fi
done < <(jq -r '.[] | [.name, .kind, .repo, (.path // "-"), .reviewed] | @tsv' "$file")

if [[ "$accept" -eq 1 ]]; then
  [[ "$matched" -gt 0 ]] || { printf 'no source named "%s" in %s\n' "$accept_name" "$file" >&2; exit 2; }
  cp "$updated" "$file"
  exit 0
fi
printf '\n%s changed\n' "$changed"
[[ "$changed" -eq 0 ]] || exit 1
