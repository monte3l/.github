#!/usr/bin/env bash
# SPDX-FileCopyrightText: Copyright (c) 2026 Enrico Lionello (enri3l) and Giulia Montevecchi (giulmonte), monte3l
# SPDX-License-Identifier: MIT
#
# Runs bin/apply-repo-baseline.sh, read-only, against every repository in the
# organization and writes one report. This is the scheduled form of the
# /org-drift skill; the workflow is .github/workflows/org-audit.yml.
#
#   org-audit.sh [--owner OWNER] [--repos a,b,c] [--findings FILE] [--public]
#
#   --owner     the organization (default monte3l)
#   --repos     only these repositories, by name (default: every repository
#               that is not archived and not a fork)
#   --findings  also write the findings to FILE. The file is empty when there is
#               nothing to report, and its content only changes when a finding
#               does, so a tracking issue is not rewritten for nothing.
#   --public    publishable output: counts only, on stdout and in FILE, and no
#               progress lines. Which repository differs, and in which setting,
#               would tell an outsider where to aim, so CI uses this mode and
#               nothing per-repository is ever printed, written or logged.
#
# Without --public, the full report (a summary table, then the drift and error
# tables) goes to stdout and the findings file holds the two tables. The
# baseline runs one repository at a time, since it makes many API calls each.
# It never passes --apply.
#
# Needs gh and jq. The token needs what the baseline needs to read: repository
# Administration, Contents, Actions, Metadata and code scanning alerts, and the
# organization's secrets and Administration, all read-only. An App installation
# token works: the baseline reports what such a token cannot read as SKIP
# (labels need Issues read, environment secrets need Environments read).
#
# Exit codes: 0 no drift, 1 drift, 2 usage or a missing tool, 3 a repository
# could not be checked (takes precedence over 1, so a broken audit is never
# read as a clean one).
set -eEuo pipefail
trap 'exit 3' ERR

usage() {
  sed -n '5,35p' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-2}"
}

owner="monte3l"
repos=""
findings_file=""
public=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --owner) [[ $# -ge 2 ]] || usage; owner="$2"; shift 2 ;;
    --repos) [[ $# -ge 2 ]] || usage; repos="$2"; shift 2 ;;
    --findings) [[ $# -ge 2 ]] || usage; findings_file="$2"; shift 2 ;;
    --public) public=1; shift ;;
    -h | --help) usage 0 ;;
    *) echo "unknown argument: $1" >&2; usage ;;
  esac
done

command -v gh >/dev/null || { echo "gh is required" >&2; exit 2; }
command -v jq >/dev/null || { echo "jq is required" >&2; exit 2; }

baseline="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/apply-repo-baseline.sh"
[[ -x "$baseline" ]] || { echo "cannot run $baseline" >&2; exit 2; }

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

if [[ -n "$repos" ]]; then
  names="${repos//,/ }"
  for name in $names; do
    [[ "$name" =~ ^[A-Za-z0-9._-]+$ ]] || { echo "not a repository name: $name" >&2; exit 2; }
  done
else
  names="$(gh api --paginate "orgs/$owner/repos?type=all&per_page=100" \
    --jq '.[] | select(.archived | not) | select(.fork | not) | .name' | sort)"
fi
[[ -n "$names" ]] || { echo "no repositories to audit" >&2; exit 2; }

# Table cells cannot hold a pipe.
cell() { local text="$1"; printf '%s' "${text//|/\\|}"; }

summary="" drift_rows="" design_rows="" error_rows=""
total_drift=0 total_errors=0 total_repos=0 drifted_repos=0 total_skipped=0
for name in $names; do
  [[ "$public" -eq 1 ]] || printf 'auditing %s/%s\n' "$owner" "$name" >&2
  total_repos=$((total_repos + 1))
  code=0
  "$baseline" "$owner/$name" >"$work/$name.out" 2>"$work/$name.err" || code=$?

  if [[ "$code" -ne 0 && "$code" -ne 1 ]]; then
    reason="$(grep -v '^[[:space:]]*$' "$work/$name.err" | tail -n 1 || true)"
    [[ -n "$reason" ]] || reason="the baseline exited with code $code"
    error_rows+="| $name | $(cell "$reason") |"$'\n'
    summary+="| $name | - | - | - |"$'\n'
    total_errors=$((total_errors + 1))
    continue
  fi

  n_ok="$(grep -c '^OK  ' "$work/$name.out" || true)"
  n_drift="$(grep -c '^DRIFT  ' "$work/$name.out" || true)"
  n_skip="$(grep -c '^SKIP  ' "$work/$name.out" || true)"
  summary+="| $name | $n_ok | $n_drift | $n_skip |"$'\n'
  total_skipped=$((total_skipped + n_skip))
  total_drift=$((total_drift + n_drift))
  [[ "$n_drift" -eq 0 ]] || drifted_repos=$((drifted_repos + 1))

  while IFS= read -r line; do
    item="${line#DRIFT  }"
    case "$item" in
      "design system"*) design_rows+="| $name | $(cell "$item") |"$'\n'  ;;
      *) drift_rows+="| $name | $(cell "$item") |"$'\n' ;;
    esac
  done < <(grep '^DRIFT  ' "$work/$name.out" || true)
done

if [[ "$public" -eq 1 ]]; then
  # Counts only. Nothing below this point may name a repository or an item.
  {
    if [[ "$total_drift" -gt 0 ]]; then
      printf '**%s** of %s repositories differ from the baseline (**%s** items).\n\n' "$drifted_repos" "$total_repos" "$total_drift"
    fi
    if [[ "$total_errors" -gt 0 ]]; then
      printf '**%s** of %s repositories could not be checked.\n\n' "$total_errors" "$total_repos"
    fi
    if [[ "$total_drift" -gt 0 || "$total_errors" -gt 0 ]]; then
      cat <<'TEXT'
This repository is public, so the detail is not published here. Read it with `bin/org-audit.sh`, or `/org-drift` in Claude Code, from a checkout of this repository, using a token with admin access to the organization.
TEXT
    fi
  } >"$work/findings.md"
  [[ -z "$findings_file" ]] || cp "$work/findings.md" "$findings_file"
  printf '## Org baseline: %s\n\n' "$owner"
  if [[ -s "$work/findings.md" ]]; then cat "$work/findings.md"; else printf 'No drift.\n'; fi
  # Only in the summary, never in the findings: a clean organization with a few
  # legitimate skips must still close the issue. A count is safe to publish.
  printf '\nSkipped items: **%s**. They do not apply, or the App token cannot read them. "No drift" means none in the items that ran.\n' "$total_skipped"
  [[ "$total_errors" -eq 0 ]] || exit 3
  [[ "$total_drift" -eq 0 ]] || exit 1
  exit 0
fi

# The part that goes in the tracking issue: findings only, nothing that changes
# without a finding changing.
{
  if [[ -n "$drift_rows" ]]; then
    printf '### Drifted items\n\n| Repo | Item |\n| --- | --- |\n%s\n' "$drift_rows"
  fi
  if [[ -n "$design_rows" ]]; then
    cat <<'TEXT'
### Design system

The script only reports this: adopting m3l-design is a commit in that repository. The version to record is in `blueprint/design-system.json`.

| Repo | Item |
| --- | --- |
TEXT
    printf '%s\n' "$design_rows"
  fi
  if [[ -n "$error_rows" ]]; then
    printf '### Repositories that could not be checked\n\n| Repo | Last error line |\n| --- | --- |\n%s\n' "$error_rows"
  fi
} >"$work/findings.md"
[[ -z "$findings_file" ]] || cp "$work/findings.md" "$findings_file"

printf '## Org baseline: %s\n\n| Repo | OK | DRIFT | SKIP |\n| --- | --- | --- | --- |\n%s\n' "$owner" "$summary"
if [[ -s "$work/findings.md" ]]; then
  cat "$work/findings.md"
else
  printf 'No drift.\n'
fi

[[ "$total_errors" -eq 0 ]] || exit 3
[[ "$total_drift" -eq 0 ]] || exit 1
