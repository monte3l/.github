#!/usr/bin/env bash
# Turns the working tree that bin/sync-design.sh just changed in a consumer
# repository into a pull request, committed through the API as the release App.
#
#   design-resync-pr.sh OWNER/REPO TAG CONSUMER-DIR
#
# Run by .github/workflows/design-resync.yml, once per consumer, after the sync
# step. Nothing here syncs: it commits what is already on disk.
#
# Environment:
#   GH_TOKEN    an App installation token for OWNER/REPO (contents and pull
#               requests write). Required.
#   NOTES_FILE  the m3l-design release notes, shown in the pull request body
#   DRY_RUN=1   print what would happen and change nothing
#
# The commit goes through the GraphQL createCommitOnBranch mutation: GitHub
# signs a commit an App makes through the API, which the `main` ruleset's
# signed-commits rule needs, and the pull request then runs the required checks,
# which a GITHUB_TOKEN pull request would not. createCommitOnBranch cannot set a
# file mode, so a changed file that is not a plain 100644 file stops the script
# instead of silently losing its mode.
#
# Exit codes: 0 done or nothing to do, 1 refused or failed, 2 usage.
set -euo pipefail

usage() {
  printf 'usage: %s OWNER/REPO TAG CONSUMER-DIR\n' "${0##*/}" >&2
  exit 2
}
[[ $# -eq 3 ]] || usage
repo="$1"
tag="$2"
dir="$3"
[[ "$repo" =~ ^monte3l/[A-Za-z0-9._-]+$ ]] || {
  printf 'error: %s is not a monte3l repository\n' "$repo" >&2
  exit 2
}
[[ "$tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || {
  printf 'error: tag must look like v1.2.3, got %s\n' "$tag" >&2
  exit 2
}
[[ -n "${GH_TOKEN:-}" ]] || {
  printf 'error: GH_TOKEN is not set\n' >&2
  exit 2
}
dry_run="${DRY_RUN:-0}"
bot='monte3l-release[bot]'
signoff="Signed-off-by: $bot <333264726+monte3l-release[bot]@users.noreply.github.com>"
branch="chore/design-$tag"
title="chore(design): re-sync m3l-design $tag"
max_bytes=3000000

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
  printf '%s is already at %s: nothing to do\n' "$repo" "$tag"
  exit 0
fi

# A mode other than 100644 on an added or changed file cannot be sent.
bad_mode="$(git diff --cached --raw --no-renames | awk '$2 != "100644" && $2 != "000000" { print $2, $NF }')"
[[ -z "$bad_mode" ]] || die "these files are not plain 100644 files, so the API cannot commit them: $bad_mode"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
: >"$work/additions.jsonl"
: >"$work/deletions.jsonl"
total=0
changed=0
while IFS= read -r -d '' status && IFS= read -r -d '' path; do
  changed=$((changed + 1))
  case "$status" in
    D) jq -nc --arg path "$path" '{path: $path}' >>"$work/deletions.jsonl" ;;
    A | M)
      size="$(wc -c <"$path" | tr -d ' ')"
      total=$((total + size))
      base64 <"$path" | tr -d '\n' >"$work/contents"
      jq -nc --arg path "$path" --rawfile contents "$work/contents" '{path: $path, contents: $contents}' >>"$work/additions.jsonl"
      ;;
    *) die "unexpected change '$status' for $path" ;;
  esac
done < <(git diff --cached --name-status --no-renames -z)
((total <= max_bytes)) || die "the change adds $total bytes, over the $max_bytes the API call is kept to: run bin/sync-design.sh by hand"
printf '%s: %d changed file(s), %d bytes added\n' "$repo" "$changed" "$total"

if [[ "$dry_run" == 1 ]]; then
  git diff --cached --name-status --no-renames
  printf 'dry run: would commit %s to %s and open "%s"\n' "$branch" "$repo" "$title"
  exit 0
fi

default="$(gh api "repos/$repo" --jq .default_branch)"
base="$(gh api "repos/$repo/git/ref/heads/$default" --jq .object.sha)"
[[ "$(git rev-parse HEAD)" == "$base" ]] || die "$default moved while the run was working: run it again"

# A pull request for this tag is open or merged: a repeated dispatch must not
# open a second one. One closed without merging is not a reason to stop.
if [[ "$(gh pr list -R "$repo" --head "$branch" --state all --json state --jq '[.[] | select(.state != "CLOSED")] | length')" != 0 ]]; then
  printf '%s already has an open or merged pull request for %s\n' "$repo" "$tag"
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
  --slurpfile additions "$work/additions.jsonl" --slurpfile deletions "$work/deletions.jsonl" \
  '{query: $query, variables: {input: {
    branch: {repositoryNameWithOwner: $repo, branchName: $branch},
    message: {headline: $title, body: $signoff},
    expectedHeadOid: $oid,
    fileChanges: {additions: $additions, deletions: $deletions}}}}' |
  gh api graphql --input - >"$work/commit.json"; then
  gh api -X DELETE "repos/$repo/git/refs/heads/$branch" >/dev/null 2>&1 || true
  die "could not commit to $branch"
fi
if jq -e '.errors' "$work/commit.json" >/dev/null 2>&1; then
  gh api -X DELETE "repos/$repo/git/refs/heads/$branch" >/dev/null 2>&1 || true
  die "the API refused the commit: $(jq -c '.errors' "$work/commit.json")"
fi

notes=''
if [[ -n "${NOTES_FILE:-}" && -s "$NOTES_FILE" ]]; then
  notes="$(head -c 3000 "$NOTES_FILE")"
fi
# shellcheck disable=SC2016 # the backticks are literal Markdown
body="$(
  printf 'Re-syncs `design/` to m3l-design **%s**, copied by `bin/sync-design.sh` from the verified release: `gh release verify`, `verify-asset` and `SHA256SUMS` all passed.\n\n' "$tag"
  printf 'Opened by `design-resync.yml` in `monte3l/.github` when m3l-design published the release. It changes only what the script writes (`design/` and, where the repository keeps one, `LICENSES/LicenseRef-MONTE3L-Brand.txt`). Nothing adapts this repository to the new version, so read the release notes and the required checks (the docs kit gate, `reuse lint`) before merging.\n\n'
  printf '### m3l-design %s\n\n%s\n\n[Release page](https://github.com/monte3l/m3l-design/releases/tag/%s)\n' "$tag" "${notes:-No release notes were available.}" "$tag"
)"
url="$(gh pr create -R "$repo" --head "$branch" --base "$default" --title "$title" --body "$body")"
printf 'opened %s\n' "$url"
new_number="${url##*/}"

# An older design pull request this one replaces is closed, but only when the
# bot alone committed to it: a person's commits are never discarded.
while IFS=$'\t' read -r number head; do
  [[ "$number" != "$new_number" ]] || continue
  old_tag="${head#chore/design-}"
  [[ "$old_tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || continue
  [[ "$(printf '%s\n%s\n' "$old_tag" "$tag" | sort -V | tail -n 1)" == "$tag" && "$old_tag" != "$tag" ]] || continue
  authors="$(gh pr view "$number" -R "$repo" --json commits --jq '[.commits[].authors[].login] | unique | join(",")')"
  if [[ "$authors" == "$bot" ]]; then
    gh pr close "$number" -R "$repo" --delete-branch --comment "Superseded by $url, which re-syncs to $tag."
  else
    printf 'left #%s open: it has commits by %s\n' "$number" "$authors"
  fi
done < <(gh pr list -R "$repo" --state open --author "app/monte3l-release" --json number,headRefName --jq '.[] | select(.headRefName | startswith("chore/design-v")) | [.number, .headRefName] | @tsv')
