#!/usr/bin/env bash
# Turns the workflow files that `bin/template-sync.mjs --write` put into a
# consumer repository's checkout into a pull request, committed through the API
# as the sync App.
#
#   template-sync-pr.sh OWNER/REPO CONSUMER-DIR
#
# Run by .github/workflows/template-sync.yml, once per repository, after the
# write step. Nothing here decides what is stale: it commits what is on disk,
# and only files under .github/workflows/.
#
# Environment:
#   GH_TOKEN   an App installation token for OWNER/REPO (contents, pull requests
#              and workflows write). Required, unless DRY_RUN=1.
#   DRY_RUN=1  print what would happen and change nothing
#
# The commit goes through the GraphQL createCommitOnBranch mutation, as in
# bin/design-resync-pr.sh: GitHub signs a commit an App makes through the API,
# which the `main` ruleset's signed-commits rule needs, and the pull request
# then runs the required checks, which a GITHUB_TOKEN pull request would not.
#
# A pull request this script opened for the same files is never opened twice,
# and one a person closed without merging is not opened again: closing it was an
# answer. An older open pull request of this script is closed when it is
# replaced, but only if the sync App alone committed to it.
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
prefix='chore/template-sync-'
title='ci: refresh workflow copies from the org templates'
max_bytes=1000000

die() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

cd "$dir"
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || die "$dir is not a git checkout"

# Stage only to read the change set: nothing is committed locally, and the
# checkout holds no credential.
git add -A
if git diff --cached --quiet; then
  printf '%s: every copy is current: nothing to do\n' "$repo"
  exit 0
fi

# The only thing this script may send is a workflow file it was handed. Anything
# else in the change set means the checkout is not what the workflow made.
other="$(git diff --cached --name-only --no-renames | grep -Ev '^\.github/workflows/[A-Za-z0-9._-]+\.yml$' || true)"
[[ -z "$other" ]] || die "these changes are not workflow files, so none is sent: $other"
# Only a change to a file the repository already has: a sync refreshes, never adds or removes.
nonmod="$(git diff --cached --raw --no-renames | awk '$5 != "M" { print $5, $NF }')"
[[ -z "$nonmod" ]] || die "a sync only modifies existing workflow files, got: $nonmod"
bad_mode="$(git diff --cached --raw --no-renames | awk '$2 != "100644" { print $2, $NF }')"
[[ -z "$bad_mode" ]] || die "these files are not plain 100644 files, so the API cannot commit them: $bad_mode"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
: >"$work/additions.jsonl"
fingerprint=''
total=0
files=()
while IFS= read -r -d '' path; do
  files+=("$path")
  size="$(wc -c <"$path" | tr -d ' ')"
  total=$((total + size))
  fingerprint+="$path $(git hash-object "$path")"$'\n'
  base64 <"$path" | tr -d '\n' >"$work/contents"
  jq -nc --arg path "$path" --rawfile contents "$work/contents" '{path: $path, contents: $contents}' >>"$work/additions.jsonl"
done < <(git diff --cached --name-only --no-renames -z)
((total <= max_bytes)) || die "the change adds $total bytes, over the $max_bytes the API call is kept to"
# Same files, same content: same branch, so a repeated run finds its own pull request.
branch="$prefix$(printf '%s' "$fingerprint" | git hash-object --stdin | cut -c1-12)"
printf '%s: %d workflow file(s), %d bytes: %s\n' "$repo" "${#files[@]}" "$total" "${files[*]}"

if [[ "$dry_run" == 1 ]]; then
  git diff --cached --stat --no-renames
  printf 'dry run: would commit %s to %s and open "%s"\n' "$branch" "$repo" "$title"
  exit 0
fi

default="$(gh api "repos/$repo" --jq .default_branch)"
base="$(gh api "repos/$repo/git/ref/heads/$default" --jq .object.sha)"
[[ "$(git rev-parse HEAD)" == "$base" ]] || die "$default moved while the run was working: run it again"

existing="$(gh pr list -R "$repo" --head "$branch" --state all --json state --jq 'map(.state) | join(",")')"
if [[ -n "$existing" ]]; then
  printf '%s already has a pull request for these files (%s): not opening another\n' "$repo" "$existing"
  exit 0
fi
# A branch with no pull request is what a run that failed half way leaves.
gh api -X DELETE "repos/$repo/git/refs/heads/$branch" >/dev/null 2>&1 || true

gh api -X POST "repos/$repo/git/refs" -f "ref=refs/heads/$branch" -f "sha=$base" >/dev/null
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
  gh api graphql --input - >"$work/commit.json"; then
  gh api -X DELETE "repos/$repo/git/refs/heads/$branch" >/dev/null 2>&1 || true
  die "could not commit to $branch"
fi
if jq -e '.errors' "$work/commit.json" >/dev/null 2>&1; then
  gh api -X DELETE "repos/$repo/git/refs/heads/$branch" >/dev/null 2>&1 || true
  die "the API refused the commit: $(jq -c '.errors' "$work/commit.json")"
fi

# shellcheck disable=SC2016 # the backticks are literal Markdown
body="$(
  printf 'Refreshes workflow files in this repository that run an **older version** of their template in `monte3l/.github`:\n\n'
  for path in "${files[@]}"; do printf -- '- `%s`\n' "$path"; done
  printf '\nA file is refreshed only if it matched, apart from blank lines, the SPDX header and action pins, a version the template really had. A workflow someone changed on purpose is never touched, and neither is one whose refresh would rename a job (a required check is a job name).\n\n'
  printf 'The files are the current template for this repository, so **their action pins are the template'"'"'s**: a pin can be tied to an input in the same file, so they move together. Dependabot here keeps them current afterwards. Read the diff, as a template change can alter what a workflow does. The required checks run on this pull request as on any other.\n\n'
  printf 'Opened by `template-sync.yml` in `monte3l/.github`. Rules: [Workflow template sync](https://github.com/monte3l/.github/blob/main/blueprint/README.md#workflow-template-sync).\n'
)"
url="$(gh pr create -R "$repo" --head "$branch" --base "$default" --title "$title" --body "$body")"
printf 'opened %s\n' "$url"
new_number="${url##*/}"

# An older pull request of this script is replaced by this one, which is computed
# from the current files, but only when the bot alone committed to it.
while IFS=$'\t' read -r number; do
  [[ "$number" != "$new_number" ]] || continue
  authors="$(gh pr view "$number" -R "$repo" --json commits --jq '[.commits[].authors[].login] | unique | join(",")')"
  if [[ "$authors" == "$bot" ]]; then
    gh pr close "$number" -R "$repo" --delete-branch --comment "Superseded by $url, which refreshes the same files from the current templates."
  else
    printf 'left #%s open: it has commits by %s\n' "$number" "$authors"
  fi
done < <(gh pr list -R "$repo" --state open --author "app/monte3l-sync" --json number,headRefName --jq ".[] | select(.headRefName | startswith(\"$prefix\")) | .number")
