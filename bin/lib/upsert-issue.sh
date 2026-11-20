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
#   ISSUE_TYPE           the org issue type a new issue gets. Default Gap: a scheduled
#                        finding is drift or staleness. Empty sets none. If the type
#                        cannot be set (the org lacks it, or an older gh has no --type),
#                        the issue is opened without it, so no finding is lost.
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
issue_type="${ISSUE_TYPE-Gap}"

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

# `gh --jq` takes no --arg, so the JSON goes through jq itself. Fields: number,
# the issue's labels (comma-joined) and the stored fingerprint, which may be empty
# and so comes last: a tab is whitespace to `read`, and an empty middle field would
# be skipped.
existing="$(gh issue list "${repo_args[@]}" --state open --label "$label" --limit 100 --json number,title,body,labels \
  | jq -r --arg t "$title" '
      [.[] | select(.title == $t)] | first // empty
      | [.number, ([(.labels // [])[].name] | join(",")), ((.body | capture("<!-- fp:(?<fp>[0-9a-f]+) -->") | .fp) // "")] | @tsv')"
number=""
have_labels=""
old_fp=""
[[ -z "$existing" ]] || IFS=$'\t' read -r number have_labels old_fp <<<"$existing"

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

IFS=',' read -r -a label_list <<<"$labels"

# ensure_labels NAME...: creates each label the repository lacks. The colour and
# description come from blueprint/labels.json when it is in the working
# directory, so the first finding is not lost to a missing label.
repo_labels=""
ensure_labels() {
  local one color description
  [[ -z "$dry" ]] || return 0
  [[ -n "$repo_labels" ]] || repo_labels="$(gh label list "${repo_args[@]}" --limit 200 --json name --jq '.[].name')"
  for one in "$@"; do
    grep -qxF "$one" <<<"$repo_labels" && continue
    color="692746"
    description="Scheduled check findings"
    if [[ -f blueprint/labels.json ]]; then
      color="$(jq -r --arg l "$one" '.[] | select(.name == $l) | .color' blueprint/labels.json | head -n 1)"
      description="$(jq -r --arg l "$one" '.[] | select(.name == $l) | .description' blueprint/labels.json | head -n 1)"
      [[ -n "$color" ]] || color="692746"
      [[ -n "$description" ]] || description="Scheduled check findings"
    fi
    gh label create "${repo_args[@]}" "$one" --color "$color" --description "$description" || true
  done
}

# add_missing_labels: an issue opened before a label joined the list has the
# first label only. Add what it lacks, so a later run does not leave it out of
# the search that the new label exists for.
add_missing_labels() {
  local one joined missing=()
  for one in "${label_list[@]}"; do
    [[ -n "$one" ]] || continue
    grep -qxF "$one" < <(tr ',' '\n' <<<"$have_labels") || missing+=("$one")
  done
  [[ ${#missing[@]} -gt 0 ]] || return 0
  ensure_labels "${missing[@]}"
  joined="$(IFS=,; printf '%s' "${missing[*]}")"
  run issue edit "${repo_args[@]}" "$number" --add-label "$joined"
  printf '#%s "%s" gained the label(s) %s\n' "$number" "$title" "$joined"
}

if [[ -z "$number" ]]; then
  label_args=()
  ensure_labels "${label_list[@]}"
  for one in "${label_list[@]}"; do
    [[ -n "$one" ]] && label_args+=(--label "$one")
  done
  created=0
  if [[ -n "$issue_type" ]]; then
    if run issue create "${repo_args[@]}" --title "$title" "${label_args[@]}" --type "$issue_type" --body-file "$full_body"; then
      created=1
    else
      printf 'could not open the issue with type %s: checking, then opening it without a type\n' "$issue_type" >&2
      # A failure after the issue was created would make a second one on retry.
      again="$(gh issue list "${repo_args[@]}" --state open --label "$label" --limit 100 --json title \
        | jq -r --arg t "$title" '[.[] | select(.title == $t)] | length')"
      [[ "$again" -eq 0 ]] || created=1
    fi
  fi
  [[ "$created" -eq 1 ]] || run issue create "${repo_args[@]}" --title "$title" "${label_args[@]}" --body-file "$full_body"
  printf 'opened "%s"\n' "$title"
elif [[ "$old_fp" == "$fingerprint" ]]; then
  add_missing_labels
  printf '#%s "%s" is unchanged\n' "$number" "$title"
else
  run issue edit "${repo_args[@]}" "$number" --body-file "$full_body"
  run issue comment "${repo_args[@]}" "$number" --body "The findings changed. The description above is current."
  add_missing_labels
  printf 'updated #%s "%s"\n' "$number" "$title"
fi
