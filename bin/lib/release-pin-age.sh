#!/usr/bin/env bash
# SPDX-FileCopyrightText: Copyright (c) 2026 Enrico Lionello (enri3l) and Giulia Montevecchi (giulmonte), monte3l
# SPDX-License-Identifier: MIT
#
# Says whether the commits a repository pins the shared release workflows at
# already contain the newest change to them.
#
#   release-pin-age.sh SHARED-REPO FILE FILE PIN...
#
# SHARED-REPO is OWNER/REPO, each FILE a path in it (the two workflows), each PIN
# a 40-character commit that the repository's `release.yml` calls them at. Nothing
# moves a pin: the shared repository has no tags for Dependabot to follow. A pin
# can sit on the default branch and still miss a later change, so this compares
# each pin with the newest commit that touched either file.
#
# Prints the newest commit. Exit codes: 0 every pin has it, 1 a pin is behind it
# (the line is `PIN NEWEST`, for the first pin that is), 2 usage, 3 a GitHub call
# failed, 4 the history of the files was read and is empty.
#
# A failed call is never an answer. The caller has already compared every pin with
# the default branch (`release: workflow pin`), so a compare that fails here is a
# rate limit, a network error or a token problem, and calling it "not behind" would
# report a pin as current that was never looked at.
set -euo pipefail

[[ $# -ge 4 ]] || {
  printf 'usage: %s SHARED-REPO FILE FILE PIN...\n' "${0##*/}" >&2
  exit 2
}
repo="$1"
files=("$2" "$3")
shift 3

# The newest commit that touched either file, by committer date. `gh` writes its
# own error to stderr, which is left visible.
lines=""
for file in "${files[@]}"; do
  line="$(gh api "repos/$repo/commits?sha=main&path=$file&per_page=1" \
    --jq '.[0] | select(. != null) | "\(.commit.committer.date) \(.sha)"')" || exit 3
  [[ -z "$line" ]] || lines+="$line"$'\n'
done
[[ -n "$lines" ]] || exit 4
newest="$(sort <<<"$lines" | tail -n 1 | cut -d' ' -f2)"

for pin in "$@"; do
  status="$(gh api "repos/$repo/compare/$newest...$pin" --jq .status)" || exit 3
  if [[ "$status" != "identical" && "$status" != "ahead" ]]; then
    printf '%s %s\n' "$pin" "$newest"
    exit 1
  fi
done
printf '%s\n' "$newest"
