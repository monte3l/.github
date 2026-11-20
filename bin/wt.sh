#!/usr/bin/env bash
# SPDX-FileCopyrightText: Copyright (c) 2026 Enrico Lionello (enri3l) and Giulia Montevecchi (giulmonte), monte3l
# SPDX-License-Identifier: MIT
#
# Creates an isolated worktree of a sibling repository, off a freshly fetched
# origin/main, and prints its path. Implementation work never happens in a
# shared checkout; for this repository use EnterWorktree instead.
#
#   wt.sh REPO BRANCH [--base REF]
#
#   REPO    the sibling repository's directory name (for example m3l-design)
#   BRANCH  the new branch (for example feat/freshness-docs-kit)
#   --base  start point (default origin/main)
#
# The checkouts are found next to this repository's main checkout, or under
# M3L_ROOT when set. The worktree goes to ROOT/REPO.wt/BRANCH, with "/" in the
# branch replaced by "-". Exit codes: 0 created, 2 usage or a missing
# repository, 3 a git call failed.
set -euo pipefail
trap 'exit 3' ERR

usage() {
  sed -n '5,18p' "$0" | sed 's/^# \{0,1\}//' >&2
  exit 2
}

repo="" branch="" base="origin/main"
while [[ $# -gt 0 ]]; do
  case "$1" in
    -h | --help) usage ;;
    --base) base="${2:?--base needs a ref}"; shift 2 ;;
    -*) echo "unknown option: $1" >&2; usage ;;
    *)
      if [[ -z "$repo" ]]; then repo="$1"
      elif [[ -z "$branch" ]]; then branch="$1"
      else usage; fi
      shift
      ;;
  esac
done
[[ -n "$repo" && -n "$branch" ]] || usage

if [[ -n "${M3L_ROOT:-}" ]]; then
  root="$M3L_ROOT"
else
  # The main checkout of this repository, even when run from one of its worktrees.
  common="$(git -C "$(dirname "$0")" rev-parse --path-format=absolute --git-common-dir)"
  root="$(dirname "$(dirname "$common")")"
fi

checkout="$root/$repo"
if ! git -C "$checkout" rev-parse --git-dir >/dev/null 2>&1; then
  echo "not a git repository: $checkout" >&2
  exit 2
fi

target="$root/$repo.wt/${branch//\//-}"
if [[ -e "$target" ]]; then
  echo "already exists: $target" >&2
  exit 2
fi

git -C "$checkout" fetch --quiet origin
mkdir -p "$root/$repo.wt"
git -C "$checkout" worktree add --quiet "$target" -b "$branch" "$base"
printf '%s\n' "$target"
