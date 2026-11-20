#!/usr/bin/env bash
# SPDX-FileCopyrightText: Copyright (c) 2026 Enrico Lionello (enri3l) and Giulia Montevecchi (giulmonte), monte3l
# SPDX-License-Identifier: MIT
#
# Says which placeholders from a blueprint starter a repository's copy still has.
#
#   leftover-placeholders.sh STARTER < FILE
#
# STARTER is a file in blueprint/files/ (SECURITY.md, README.md) and FILE is the
# repository's copy, on standard input. The placeholders are read from the
# starter itself, so a new one is caught without editing this script: every
# `{...}` prompt in it (its first 40 characters), the unreplaced `{repo}` token
# and the starter's own `<!-- Starting point` comment. A phrase is reported only
# when it is still in FILE word for word, so a README with a `{ "json": 1 }`
# example, or a paragraph a person wrote, is never flagged.
#
# Prints one leftover phrase per line. Exit codes: 0 none left, 1 some left,
# 2 usage.
set -euo pipefail

[[ $# -eq 1 && -f "$1" ]] || {
  printf 'usage: %s STARTER < FILE\n' "${0##*/}" >&2
  exit 2
}
starter="$1"
text="$(cat)"

# A prompt starts with `{` and a letter and runs to the next brace; `{repo}` is
# too short to match, which is why it is added by hand.
phrases="$({
  grep -oE '\{[A-Za-z][^{}]{11,40}' "$starter" || true
  printf '%s\n' '{repo}' '<!-- Starting point'
} | sort -u)"

found=0
while IFS= read -r phrase; do
  if grep -qF -- "$phrase" <<<"$text"; then
    printf '%s\n' "$phrase"
    found=1
  fi
done <<<"$phrases"
exit "$found"
