#!/usr/bin/env bash
# SPDX-FileCopyrightText: Copyright (c) 2026 Enrico Lionello (enri3l) and Giulia Montevecchi (giulmonte), monte3l
# SPDX-License-Identifier: MIT

# Adds every open issue of the organization's repositories to the org Project.
#
# Why this exists: an issue form adds a new issue to the Project through
# `projects:` only when the person filing it can write to the Project, so a
# report from outside the org is created and left off the board. The Project's
# own auto-add rule covers one repository on the Free plan. This fills in what
# both miss, and it never removes or edits an item.
#
#   project-backfill.sh [--dry-run]
#
# Environment:
#   GH_TOKEN   a token that can write the org's Projects and read its issues
#              (the monte3l-planning App: Projects write, Issues read)
#   OWNER      the organization
#   PROJECT    the Project's number
#
# The repository is public, so the output is counts only: never a repository
# name or an issue URL. With --dry-run nothing is added.
#
# Exit codes: 0 done, 2 usage or a missing tool, 3 any failed call.

set -eEuo pipefail
trap 'exit 3' ERR

usage() {
  printf 'usage: %s [--dry-run]\n' "${0##*/}" >&2
  exit 2
}

dry=0
case "$#:${1:-}" in
  0:) ;;
  1:--dry-run) dry=1 ;;
  *) usage ;;
esac

for tool in gh jq; do
  command -v "$tool" >/dev/null 2>&1 || { printf 'missing tool: %s\n' "$tool" >&2; exit 2; }
done
[[ -n "${OWNER:-}" ]] || { printf 'OWNER is not set\n' >&2; exit 2; }
[[ -n "${PROJECT:-}" ]] || { printf 'PROJECT is not set\n' >&2; exit 2; }
[[ "$PROJECT" =~ ^[0-9]+$ ]] || { printf 'PROJECT must be a number\n' >&2; exit 2; }

# The Project's node id, and the node id of every issue already on it.
# shellcheck disable=SC2016 # the dollar signs are GraphQL variables
project_id="$(gh api graphql -f owner="$OWNER" -F number="$PROJECT" -f query='
  query($owner: String!, $number: Int!) { organization(login: $owner) { projectV2(number: $number) { id } } }' \
  --jq '.data.organization.projectV2.id')"
[[ -n "$project_id" && "$project_id" != "null" ]] || { printf 'the Project was not found or is not readable\n' >&2; exit 3; }

# shellcheck disable=SC2016 # the dollar signs are GraphQL variables
on_project="$(gh api graphql --paginate -f owner="$OWNER" -F number="$PROJECT" -f query='
  query($owner: String!, $number: Int!, $endCursor: String) {
    organization(login: $owner) { projectV2(number: $number) {
      items(first: 100, after: $endCursor) {
        pageInfo { hasNextPage endCursor }
        nodes { content { ... on Issue { id } } }
      }
    } }
  }' --jq '.data.organization.projectV2.items.nodes[].content.id // empty')"

# Each list is read into a variable first: a failure inside `< <(...)` does not
# reach the ERR trap, and a failed listing would read as "no repositories, done".
repo_names="$(gh repo list "$OWNER" --limit 200 --no-archived --json name --jq '.[].name')"

seen=0
present=0
added=0
repos=0
while IFS= read -r name; do
  [[ -n "$name" ]] || continue
  repos=$((repos + 1))
  issue_nodes="$(gh api --paginate "repos/$OWNER/$name/issues?state=open&per_page=100" --jq '.[] | select(.pull_request | not) | .node_id')"
  while IFS= read -r node; do
    [[ -n "$node" ]] || continue
    seen=$((seen + 1))
    if grep -qxF -- "$node" <<<"$on_project"; then
      present=$((present + 1))
      continue
    fi
    if [[ "$dry" -eq 0 ]]; then
      # shellcheck disable=SC2016 # the dollar signs are GraphQL variables
      gh api graphql -f project="$project_id" -f content="$node" -f query='
        mutation($project: ID!, $content: ID!) { addProjectV2ItemById(input: {projectId: $project, contentId: $content}) { item { id } } }' >/dev/null
    fi
    added=$((added + 1))
  done <<<"$issue_nodes"
done <<<"$repo_names"

verb="added"
[[ "$dry" -eq 0 ]] || verb="would be added"
printf '%s open issues in %s repositories: %s already on the Project, %s %s\n' "$seen" "$repos" "$present" "$added" "$verb"
