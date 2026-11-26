#!/usr/bin/env bash
# SPDX-FileCopyrightText: Copyright (c) 2026 Enrico Lionello (enri3l) and Giulia Montevecchi (giulmonte), monte3l
# SPDX-License-Identifier: MIT
#
# Turns the answer file that `bin/bestpractices-sync.mjs --write` put into a
# project repository's checkout into a pull request, committed through the API
# as the sync App.
#
#   bestpractices-sync-pr.sh OWNER/REPO CONSUMER-DIR
#
# Run by .github/workflows/bestpractices-sync.yml, once per repository, after
# the write step. Nothing here decides what changed on bestpractices.dev: it
# commits what is on disk, and only one file, `.bestpractices.json` or
# `.project.d/bestpractices.json`. Anything else in the change set means the
# checkout is not what the workflow made, and nothing is sent.
#
# Environment:
#   GH_TOKEN   an App installation token for OWNER/REPO (contents and pull
#              requests write). Required, unless DRY_RUN=1.
#   DRY_RUN=1  print what would happen and change nothing
#
# The commit goes through the GraphQL createCommitOnBranch mutation, as in
# bin/template-sync-pr.sh: GitHub signs a commit an App makes through the API,
# which the `main` ruleset's signed-commits rule needs, and the pull request
# then runs the required checks, which a GITHUB_TOKEN pull request would not.
#
# The same content gives the same branch, so a rerun finds its own pull request
# and never opens a second. One a person closed without merging is not opened
# again: closing it was an answer. An older open pull request of this script is
# closed when a newer one replaces it, but only if the sync App alone committed
# to it.
#
# Exit codes: 0 done or nothing to do, 1 refused or failed, 2 usage.
set -euo pipefail

usage() {
  printf 'usage: %s OWNER/REPO CONSUMER-DIR\n' "${0##*/}" >&2
  exit 2
}
[[ $# -eq 2 ]] || usage
repo="$1"
dir="$2"
[[ "$repo" =~ ^monte3l/[A-Za-z0-9._-]+$ ]] || {
  printf 'error: %s is not a monte3l repository\n' "$repo" >&2
  exit 2
}
dry_run="${DRY_RUN:-0}"
[[ "$dry_run" == 1 || -n "${GH_TOKEN:-}" ]] || {
  printf 'error: GH_TOKEN is not set\n' >&2
  exit 2
}
bot='monte3l-sync[bot]'
signoff="Signed-off-by: $bot <358743682+monte3l-sync[bot]@users.noreply.github.com>"
prefix='chore/bestpractices-sync-'
title='chore: sync the OpenSSF Best Practices answers from bestpractices.dev'
max_bytes=1000000
# In a workflow run the log of this public repository is readable by anyone. Say how many files and
# bytes, never which file or branch. A run by hand prints the full detail.
ci=0
if [[ "${GITHUB_ACTIONS:-}" == true ]]; then ci=1; fi

die() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

# A failed `gh` call names the repository, the branch or the pull request title in its message. In a
# workflow that log is public, so the call's stderr is dropped and the script says only that it failed.
gh_() {
  if [[ "$ci" == 1 ]]; then
    gh "$@" 2>/dev/null || die "a GitHub call failed"
  else
    gh "$@"
  fi
}

cd "$dir"
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || die "$dir is not a git checkout"

# Stage only to read the change set: nothing is committed locally, and the checkout holds no credential.
git add -A
if git diff --cached --quiet; then
  if [[ "$ci" == 1 ]]; then printf 'the answer file is current: nothing to do\n'; else printf '%s: the answer file is current: nothing to do\n' "$repo"; fi
  exit 0
fi

changed="$(git diff --cached --name-only --no-renames)"
case "$changed" in
  .bestpractices.json | .project.d/bestpractices.json) ;;
  *)
    if [[ "$ci" == 1 ]]; then
      die "the change is not exactly one answer file, so none is sent"
    fi
    die "the change is not exactly one of .bestpractices.json and .project.d/bestpractices.json, so none is sent: $(tr '\n' ' ' <<<"$changed")"
    ;;
esac
raw="$(git diff --cached --raw --no-renames)"
# A new file is a plain addition and an existing one a modification: nothing is deleted, renamed or a link.
status="$(awk '{ print $5 }' <<<"$raw")"
[[ "$status" == A || "$status" == M ]] || die "the answer file may only be added or modified"
mode="$(awk '{ print $2 }' <<<"$raw")"
[[ "$mode" == 100644 ]] || die "the answer file is not a plain 100644 file, so the API cannot commit it"
size="$(wc -c <"$changed" | tr -d ' ')"
((size <= max_bytes)) || die "the answer file is $size bytes, over the $max_bytes the API call is kept to"
jq -e 'type == "object"' "$changed" >/dev/null 2>&1 || die "the answer file is not a JSON object"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
base64 <"$changed" | tr -d '\n' >"$work/contents"
jq -nc --arg path "$changed" --rawfile contents "$work/contents" '{path: $path, contents: $contents}' >"$work/additions.jsonl"
branch="$prefix$(printf '%s %s\n' "$changed" "$(git hash-object "$changed")" | git hash-object --stdin | cut -c1-12)"
if [[ "$ci" == 1 ]]; then
  printf '1 file, %d bytes (%s)\n' "$size" "$([[ "$status" == A ]] && echo new || echo changed)"
else
  printf '%s: %s, %d bytes (%s)\n' "$repo" "$changed" "$size" "$([[ "$status" == A ]] && echo new || echo changed)"
fi

if [[ "$dry_run" == 1 ]]; then
  if [[ "$ci" == 1 ]]; then
    printf 'dry run: would commit and open a pull request\n'
  else
    git diff --cached --stat --no-renames
    printf 'dry run: would commit %s to %s and open "%s"\n' "$branch" "$repo" "$title"
  fi
  exit 0
fi

default="$(gh_ api "repos/$repo" --jq .default_branch)"
base="$(gh_ api "repos/$repo/git/ref/heads/$default" --jq .object.sha)"
if [[ "$(git rev-parse HEAD)" != "$base" ]]; then
  if [[ "$ci" == 1 ]]; then die "the default branch moved while the run was working: run it again"; fi
  die "$default moved while the run was working: run it again"
fi

existing="$(gh_ pr list -R "$repo" --head "$branch" --state all --json state --jq 'map(.state) | join(",")')"
if [[ -n "$existing" ]]; then
  if [[ "$ci" == 1 ]]; then
    printf 'a pull request for this content already exists (%s): not opening another\n' "$existing"
  else
    printf '%s already has a pull request for this content (%s): not opening another\n' "$repo" "$existing"
  fi
  exit 0
fi
# A branch with no pull request is what a run that failed half way leaves.
gh api -X DELETE "repos/$repo/git/refs/heads/$branch" >/dev/null 2>&1 || true

gh_ api -X POST "repos/$repo/git/refs" -f "ref=refs/heads/$branch" -f "sha=$base" >/dev/null
# shellcheck disable=SC2016 # the dollar signs are GraphQL variables
query='mutation($input: CreateCommitOnBranchInput!) { createCommitOnBranch(input: $input) { commit { oid } } }'
if ! jq -n \
  --arg query "$query" --arg repo "$repo" --arg branch "$branch" --arg oid "$base" \
  --arg title "$title" --arg signoff "$signoff" \
  --slurpfile additions "$work/additions.jsonl" \
  '{query: $query, variables: {input: {
    branch: {repositoryNameWithOwner: $repo, branchName: $branch},
    message: {headline: $title, body: $signoff},
    expectedHeadOid: $oid,
    fileChanges: {additions: $additions}}}}' |
  gh api graphql --input - >"$work/commit.json" 2>"$work/commit.err"; then
  gh api -X DELETE "repos/$repo/git/refs/heads/$branch" >/dev/null 2>&1 || true
  if [[ "$ci" == 1 ]]; then die "could not commit the file"; fi
  cat "$work/commit.err" >&2
  die "could not commit to $branch"
fi
if jq -e '.errors' "$work/commit.json" >/dev/null 2>&1; then
  gh api -X DELETE "repos/$repo/git/refs/heads/$branch" >/dev/null 2>&1 || true
  if [[ "$ci" == 1 ]]; then die "the API refused the commit ($(jq '.errors | length' "$work/commit.json") error(s))"; fi
  die "the API refused the commit: $(jq -c '.errors' "$work/commit.json")"
fi

# shellcheck disable=SC2016 # the backticks are literal Markdown
body="$(
  printf 'Brings answers that were changed on [bestpractices.dev](https://www.bestpractices.dev) into `%s`, so the file and the site say the same.\n\n' "$changed"
  printf 'Only criteria changed on the site since the file and the site last agreed are touched, and each takes the **site'"'"'s answer**. A criterion changed in this file is never overwritten: it goes to the tracking issue as a link to save on the site. Keys that are not criteria stay as they are.\n\n'
  printf 'If an answer here is wrong, correct it on the site, not in this pull request: the next run would bring it back. Closing this pull request without merging leaves the file as it is.\n\n'
  printf 'Opened by `bestpractices-sync.yml` in `monte3l/.github`. Rules: [OpenSSF Best Practices sync](https://github.com/monte3l/.github/blob/main/blueprint/README.md#openssf-best-practices-sync).\n'
)"
url="$(gh_ pr create -R "$repo" --head "$branch" --base "$default" --title "$title" --body "$body")"
printf 'opened %s\n' "$url"
new_number="${url##*/}"

# An older pull request of this script is replaced by this one, which is computed from the current
# answers, but only when the bot alone committed to it.
older="$(gh_ pr list -R "$repo" --state open --author "app/monte3l-sync" --json number,headRefName --jq ".[] | select(.headRefName | startswith(\"$prefix\")) | .number")"
for number in $older; do
  [[ "$number" != "$new_number" ]] || continue
  authors="$(gh_ pr view "$number" -R "$repo" --json commits --jq '[.commits[].authors[].login] | unique | join(",")')"
  if [[ "$authors" == "$bot" ]]; then
    if [[ "$ci" == 1 ]]; then
      # `gh pr close` reports the pull request's title and the deleted branch: say neither in a public log.
      gh pr close "$number" -R "$repo" --delete-branch --comment "Superseded by $url, which is computed from the current answers." >/dev/null 2>&1 ||
        die "could not close an older pull request"
      printf 'closed an older pull request\n'
    else
      gh pr close "$number" -R "$repo" --delete-branch --comment "Superseded by $url, which is computed from the current answers."
    fi
  else
    if [[ "$ci" == 1 ]]; then
      printf 'left an older pull request open: it has commits by someone else\n'
    else
      printf 'left #%s open: it has commits by %s\n' "$number" "$authors"
    fi
  fi
done
