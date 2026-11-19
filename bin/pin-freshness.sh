#!/usr/bin/env bash
# SPDX-FileCopyrightText: Copyright (c) 2026 Enrico Lionello (enri3l) and Giulia Montevecchi (giulmonte), monte3l
# SPDX-License-Identifier: MIT
#
# Reports hand-pinned tool versions (blueprint/pins.json) that are behind the
# newest upstream release. Dependabot cannot read these values, so this is the
# only thing that notices.
#
#   pin-freshness.sh [PINS-FILE]
#
# A release counts only once it is COOLDOWN_DAYS old (default 7), the same
# delay Dependabot's `cooldown` applies to the action pins, so a bad release
# can be yanked before this asks for it. Prereleases and drafts never count.
# Output is one line per pin, `OK` or `STALE`, then a summary. Nothing is
# changed: a person bumps the pin and `bin/pin-parity.mjs` checks every copy.
#
# Needs gh (any token: the releases are public) and jq.
# Exit codes: 0 all current, 1 at least one stale, 2 usage or tool missing,
# 3 an API call failed.
set -eEuo pipefail
trap 'exit 3' ERR

pins_file="${1:-blueprint/pins.json}"
cooldown_days="${COOLDOWN_DAYS:-7}"

for tool in gh jq sort; do
  command -v "$tool" >/dev/null || { printf 'missing tool: %s\n' "$tool" >&2; exit 2; }
done
[[ -f "$pins_file" ]] || { printf 'no such file: %s\n' "$pins_file" >&2; exit 2; }
[[ "$cooldown_days" =~ ^[0-9]+$ ]] || { printf 'COOLDOWN_DAYS must be a number\n' >&2; exit 2; }

stale=0
while IFS=$'\t' read -r name version upstream prefix; do
  # Newest stable release that has been out for at least the cooldown.
  latest="$(gh api "repos/$upstream/releases?per_page=30" | jq -r --arg prefix "$prefix" --argjson days "$cooldown_days" '
    [ .[] | select(.draft == false and .prerelease == false)
          | select((.published_at | fromdateiso8601) <= (now - $days * 86400)) ]
    | first | .tag_name // empty | ltrimstr($prefix)')"
  if [[ -z "$latest" ]]; then
    printf 'OK     %s: no release older than %s days to compare with\n' "$name" "$cooldown_days"
    continue
  fi
  # Current counts as fresh when it is the newest eligible release or newer
  # (a pin bumped inside the cooldown must not be reported).
  newest="$(printf '%s\n%s\n' "$version" "$latest" | sort -V | tail -n 1)"
  if [[ "$newest" == "$version" ]]; then
    printf 'OK     %s: %s\n' "$name" "$version"
  else
    printf 'STALE  %s: %s -> %s (https://github.com/%s/releases/tag/%s%s)\n' \
      "$name" "$version" "$latest" "$upstream" "$prefix" "$latest"
    stale=$((stale + 1))
  fi
done < <(jq -r '.[] | [.name, .version, .upstream, .tagPrefix] | @tsv' "$pins_file")

printf '\n%s stale (cooldown %s days)\n' "$stale" "$cooldown_days"
[[ "$stale" -eq 0 ]] || exit 1
