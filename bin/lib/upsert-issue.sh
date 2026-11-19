#!/usr/bin/env bash
# SPDX-FileCopyrightText: Copyright (c) 2026 Enrico Lionello (enri3l) and Giulia Montevecchi (giulmonte), monte3l
# SPDX-License-Identifier: MIT
#
# Keeps one tracking issue per concern, so a scheduled check reports a finding
# once instead of opening a new issue or a reminder every run.
#
#   upsert-issue.sh TITLE LABEL[,LABEL...] BODY-FILE [--clean]
#
# LABEL may be a comma-separated list. The first label identifies the issue (an
# issue is matched by exact title plus that label); every label is applied when
# the issue is opened, and each one that the repository lacks is created.
#
# Without --clean: opens the issue if no open issue with that exact title and
# first label exists. If one exists and the findings changed, it rewrites the body and
# adds one comment. If they did not change, nothing happens.
# With --clean: closes the open issue with a comment, or does nothing if none.
#
# "Changed" means the SHA-256 of BODY-FILE differs from the fingerprint stored
# in a trailing HTML comment of the issue body.
#
# Environment:
#   GH_TOKEN             a token with issues write on the repository
#   GITHUB_REPOSITORY    OWNER/REPO. Falls back to the current checkout's remote.
#   DRY_RUN=1            print what would happen and change nothing
#
# Exit codes: 0 done or nothing to do, 2 usage, 3 a gh call failed.
set -eEuo pipefail
trap 'exit 3' ERR

usage() {
  printf 'usage: %s TITLE LABEL[,LABEL...] BODY-FILE [--clean]\n' "${0##*/}" >&2
  exit 2
}
[[ $# -eq 3 || ( $# -eq 4 && "$4" == "--clean" ) ]] || usage
title="$1"
labels="$2"
label="${labels%%,*}"
body_file="$3"
clean=0
[[ $# -eq 4 ]] && clean=1
[[ -f "$body_file" ]] || usage

repo_args=()
[[ -n "${GITHUB_REPOSITORY:-}" ]] && repo_args=(-R "$GITHUB_REPOSITORY")
dry="${DRY_RUN:-}"

run() {
  if [[ -n "$dry" ]]; then
    printf 'would run: gh %s\n' "$*"
  else
    gh "$@"
  fi
}

if command -v sha256sum >/dev/null; then
  fingerprint="$(sha256sum "$body_file" | cut -d' ' -f1)"
else
  fingerprint="$(shasum -a 256 "$body_file" | cut -d' ' -f1)"
fi

# `gh --jq` takes no --arg, so the JSON goes through jq itself.
existing="$(gh issue list "${repo_args[@]}" --state open --label "$label" --limit 100 --json number,title,body \
  | jq -r --arg t "$title" '
      [.[] | select(.title == $t)] | first // empty
      | [.number, ((.body | capture("<!-- fp:(?<fp>[0-9a-f]+) -->") | .fp) // "")] | @tsv')"
number="${existing%%$'\t'*}"
old_fp="${existing#*$'\t'}"
[[ -n "$existing" ]] || { number=""; old_fp=""; }

if [[ "$clean" -eq 1 ]]; then
  if [[ -z "$number" ]]; then
    printf 'no open issue "%s": nothing to close\n' "$title"
  else
    run issue close "${repo_args[@]}" "$number" --comment "The latest scheduled run found nothing to report."
    printf 'closed #%s "%s"\n' "$number" "$title"
  fi
  exit 0
fi

full_body="$(mktemp)"
trap 'rm -f "$full_body"' EXIT
{ cat "$body_file"; printf '\n\n<!-- fp:%s -->\n' "$fingerprint"; } >"$full_body"

if [[ -z "$number" ]]; then
  # The labels normally come from blueprint/labels.json; create any the
  # repository does not have yet so the first finding is not lost.
  label_args=()
  if [[ -z "$dry" ]]; then
    existing_labels="$(gh label list "${repo_args[@]}" --limit 200 --json name --jq '.[].name')"
  fi
  IFS=',' read -r -a label_list <<<"$labels"
  for one in "${label_list[@]}"; do
    [[ -n "$one" ]] || continue
    label_args+=(--label "$one")
    if [[ -z "$dry" ]] && ! grep -qxF "$one" <<<"$existing_labels"; then
      color="692746"
      description="Scheduled check findings"
      if [[ -f blueprint/labels.json ]]; then
        color="$(jq -r --arg l "$one" '.[] | select(.name == $l) | .color' blueprint/labels.json | head -n 1)"
        description="$(jq -r --arg l "$one" '.[] | select(.name == $l) | .description' blueprint/labels.json | head -n 1)"
        [[ -n "$color" ]] || color="692746"
        [[ -n "$description" ]] || description="Scheduled check findings"
      fi
      gh label create "${repo_args[@]}" "$one" --color "$color" --description "$description" || true
    fi
  done
  run issue create "${repo_args[@]}" --title "$title" "${label_args[@]}" --body-file "$full_body"
  printf 'opened "%s"\n' "$title"
elif [[ "$old_fp" == "$fingerprint" ]]; then
  printf '#%s "%s" is unchanged\n' "$number" "$title"
else
  run issue edit "${repo_args[@]}" "$number" --body-file "$full_body"
  run issue comment "${repo_args[@]}" "$number" --body "The findings changed. The description above is current."
  printf 'updated #%s "%s"\n' "$number" "$title"
fi
