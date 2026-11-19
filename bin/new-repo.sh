#!/usr/bin/env bash
# Creates a new monte3l repository that starts out following the blueprint.
#
#   new-repo.sh NAME [--kind library|plugin|simple] [--claude] [--private]
#                    [--scaffold] [--dry-run | --apply [--yes]]
#
#   (default)   read-only: checks the inputs, renders every file into a temporary
#               directory and prints what --apply would do. Creates nothing.
#   --kind K    adds the release configuration of that kind. Without it the
#               release items report drift, unless blueprint/release.json
#               exempts the repository.
#   --claude    adds the Claude Code workflow (claude.yml, which needs a secret)
#   --private   creates a private repository. On the Free plan the ruleset and
#               two other items cannot exist there: the baseline prints SKIP.
#               Scorecard and Dependency Review are not written: they need a
#               public repository
#   --scaffold  runs the pinned, published @monte3l/groundwork CLI first, in
#               fresh mode, for a TypeScript project. Whatever it writes wins:
#               this script only adds the files that are missing
#   --apply     does it, after one confirmation (--yes skips the question)
#
# The repository must be in blueprint/projects.json already (and its row in
# profile/README.md), because the description, topics and site come from there.
# It must not exist: this script never changes an existing repository, which is
# what apply-repo-baseline.sh is for. What goes in is blueprint/bootstrap.json.
#
# With --apply, in this order: ask once, run the scaffold if asked, render the
# files, make one signed-off commit, create the repository and push `main` (the
# ruleset does not exist yet, so this is the only direct push the repository
# ever gets), set the topics, run `apply-repo-baseline.sh --apply` (settings,
# rulesets, labels), add the repository to the organization's Apps (installed on
# selected repositories only), share the organization secrets with it (the
# baseline reports a missing one but does not share it) and turn on immutable
# releases when it has a release kind, and run the baseline check.
#
# Needs gh (an organization owner; the repo, workflow and admin:org scopes), git,
# jq and node. Placeholders in the starters are always listed at the end, and do
# not change the exit code: a person fills them in.
#
# Exit codes: 0 done, the check is clean and nothing was refused by an App call,
# 1 done, but the check reports drift or an App call needs a person, 2 usage or
# an input that is refused, 3 a call failed (after the repository was created,
# the message says how to finish).
#
# Environment, for tests only: NEW_REPO_BASELINE (the baseline script to run) and
# NEW_REPO_REMOTE_BASE (where `origin` points; default https://github.com).
set -eEuo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
owner=monte3l
baseline="${NEW_REPO_BASELINE:-$here/apply-repo-baseline.sh}"
remote_base="${NEW_REPO_REMOTE_BASE:-https://github.com}"
apps=(monte3l-release monte3l-env-janitor monte3l-audit monte3l-sync)
# Hand-pinned like gitleaks: blueprint/pins.json tracks it, and bin/pin-parity.mjs keeps this line in step.
scaffold_package='@monte3l/groundwork@1.2.1'

name=""
kind=""
claude=0
private=0
scaffold=0
mode="plan"
yes=0

stage=0 # 1 the repository exists, 2 main is pushed, 3 the topics are set, 4 the settings are applied
work=""
keep_work=0
repo_dir=""

usage() {
  awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$0"
  exit "${1:-2}"
}
die() {
  printf 'error: %s\n' "$*" >&2
  exit 2
}

# What a person does to finish, by the stage a failure happened in.
recovery() {
  ((stage >= 1)) || return 0
  printf '\n%s/%s was created before that. To finish by hand:\n' "$owner" "$name" >&2
  if ((stage < 2)); then
    keep_work=1
    printf "  git -C %s -c credential.helper= -c credential.helper='!gh auth git-credential' push -u origin main\n" "$repo_dir" >&2
    printf '  (the rendered files stay there until you are done)\n' >&2
    printf '  (or start over: delete the repository, gh repo delete %s/%s, which needs the delete_repo scope)\n' "$owner" "$name" >&2
  fi
  if ((stage < 3)); then
    printf '  gh repo edit %s/%s --add-topic TOPIC     # for each topic in blueprint/projects.json\n' "$owner" "$name" >&2
  fi
  if ((stage < 4)); then
    printf '  %s %s/%s --apply\n' "$baseline" "$owner" "$name" >&2
  fi
  printf '  %s %s/%s --check\n' "$baseline" "$owner" "$name" >&2
  printf '  and add the repository to the Apps (organization settings, GitHub Apps): %s\n' "${apps[*]}" >&2
}
on_error() {
  # Bash 3.2 (macOS /bin/bash) runs this trap inside a $(...) even when it is the test of an `if`, and
  # bash 5 runs it in the subshell of one too. Only the main shell reports; a subshell just ends.
  ((BASH_SUBSHELL == 0)) || exit 3
  printf 'error: a call failed (line %s)\n' "$1" >&2
  recovery
  exit 3
}
cleanup() {
  if [[ -n "$work" ]]; then
    if ((keep_work)); then printf 'kept: %s\n' "$work" >&2; else rm -rf "$work"; fi
  fi
}
trap 'on_error $LINENO' ERR
trap cleanup EXIT

while (($#)); do
  case "$1" in
    --kind)
      [[ $# -ge 2 && "$2" != -* ]] || die "--kind needs a value"
      kind="$2"
      shift
      ;;
    --claude) claude=1 ;;
    --private) private=1 ;;
    --scaffold) scaffold=1 ;;
    --dry-run) mode="plan" ;;
    --apply) mode="apply" ;;
    --yes) yes=1 ;;
    -h | --help) usage 0 ;;
    -*) die "cannot use \"$1\"" ;;
    *)
      [[ -z "$name" ]] || die "one repository name only"
      name="$1"
      ;;
  esac
  shift
done
[[ -n "$name" ]] || usage 2
[[ "$name" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] || die "\"$name\" is not a repository name"
[[ "$yes" == 0 || "$mode" == apply ]] || die "--yes only goes with --apply"

for tool in gh git jq node; do
  command -v "$tool" >/dev/null 2>&1 || die "$tool is required"
done

# Everything that can be refused without asking GitHub is refused first: a typo should cost nothing.
jq -e --arg name "$name" 'any(.[]; .repo == $name)' "$here/../blueprint/projects.json" >/dev/null ||
  die "$name is not in blueprint/projects.json: add it, and its row in profile/README.md, first"
if [[ -n "$kind" ]]; then
  jq -e --arg kind "$kind" '.kinds | index($kind) != null' "$here/../blueprint/bootstrap.json" >/dev/null ||
    die "\"$kind\" is not a kind (use $(jq -r '.kinds | join(", ")' "$here/../blueprint/bootstrap.json"))"
fi
# The organization secrets this repository must be shared: from the data, plus the release App's when it releases.
org_secrets=()
while IFS= read -r secret; do org_secrets+=("$secret"); done < <(jq -r '.orgSecrets[]?' "$here/../blueprint/bootstrap.json")
if [[ -n "$kind" ]]; then
  while IFS= read -r secret; do org_secrets+=("$secret"); done < <(jq -r '.secrets[]?' "$here/../blueprint/release.json")
fi
if [[ "$mode" == apply ]]; then
  # A token that cannot push a workflow file would fail after the repository exists. Only a classic or
  # OAuth token lists its scopes: for any other kind there is nothing to check here.
  scopes="$( (gh auth status --active --hostname github.com 2>&1 || true) | sed -n 's/.*Token scopes: //p' | head -n 1 | tr -d "',")"
  if [[ -n "$scopes" && "$scopes" != none ]]; then
    for scope in repo workflow admin:org; do
      grep -qw -- "$scope" <<<"$scopes" || die "the gh token lacks the $scope scope (gh auth refresh -s $scope)"
    done
  fi
fi

work="$(mktemp -d)"
repo_dir="$work/repo"

# The repository must not exist. A missing one answers 404, and nothing else is "free".
if existing="$(gh api "repos/$owner/$name" --jq .full_name 2>&1)"; then
  die "$existing already exists. This script only creates: to check it, run apply-repo-baseline.sh $owner/$name"
elif ! grep -q 'HTTP 404' <<<"$existing"; then
  printf 'error: could not tell whether %s/%s exists: %s\n' "$owner" "$name" "$existing" >&2
  exit 3
fi

render_args=("$name")
[[ -z "$kind" ]] || render_args+=(--kind "$kind")
((claude)) && render_args+=(--claude)
((private)) && render_args+=(--private)
((scaffold)) && render_args+=(--scaffold)

# render OUT [--keep-existing]: writes the files into OUT and the report into $work/result.json
render() {
  local out="$1" rc=0
  shift
  node "$here/bootstrap-render.mjs" "${render_args[@]}" --out "$out" "$@" >"$work/result.json" || rc=$?
  ((rc == 0)) || exit "$rc"
}

# 1. what would be written, shown before anything runs
mkdir -p "$work/preview"
render "$work/preview"
project="$(jq -c .project "$work/result.json")"
description="$(jq -er .description <<<"$project")"
site="$(jq -er .site <<<"$project")"
visibility="public"
((private)) && visibility="private"

printf 'new-repo: %s/%s (%s, kind: %s, claude: %s, scaffold: %s)\n\n' "$owner" "$name" "$visibility" "${kind:-none}" "$((claude))" "$((scaffold))"
printf 'Files (%s):\n' "$(jq '.written | length' "$work/result.json")"
jq -r '.written[] | "  + " + .' "$work/result.json"
jq -r '.left[] | "  - " + .' "$work/result.json"
if ((scaffold)); then
  printf '  (a file the scaffold writes first is kept, so some of these may not be written)\n'
fi
if [[ "$(jq '.unfilled | length' "$work/result.json")" != 0 ]]; then
  printf '\nA person fills these in (placeholders still in the files):\n'
  jq -r '.unfilled[] | "  " + .to + ": " + (.found | join(", "))' "$work/result.json"
fi
if [[ -z "$kind" ]]; then
  printf '\nNo --kind: the release items will report drift until release-please is set up (or blueprint/release.json exempts the repository).\n'
fi
if ((private)); then
  printf '\nPrivate: on the Free plan the ruleset and two other items cannot exist, and the baseline prints SKIP for them.\n'
fi
if [[ "$(git config --get commit.gpgsign || true)" != true ]]; then
  printf '\nWarning: commit.gpgsign is not on, so the first commit will not be signed. Later commits must be: the ruleset requires it.\n'
fi

if [[ "$mode" == plan ]]; then
  printf '\nWith --apply this would, in order:\n'
  ((scaffold)) && printf '  - run npx %s in fresh mode (code from npm, run with your credentials in the environment), then add the files above\n' "$scaffold_package"
  printf '  - make one signed-off commit, create %s/%s (%s: "%s") and push main\n' "$owner" "$name" "$visibility" "$description"
  printf '  - set the topics: %s\n' "$(jq -r '.topics | join(", ")' <<<"$project")"
  printf '  - run apply-repo-baseline.sh --apply (settings, ruleset, labels, and the organization'"'"'s secret access: an org-level write)\n'
  printf '  - add the repository to the Apps: %s\n' "${apps[*]}"
  printf '  - share the organization secrets with it: %s (organization-level writes)\n' "$(printf '%s ' "${org_secrets[@]}")"
  [[ -z "$kind" ]] || printf '  - turn on immutable releases for it, which the release workflow needs\n'
  printf '  - run the baseline check and print what is left\n'
  printf '\nNothing was created. Run again with --apply.\n'
  exit 0
fi

# 2. one confirmation, before the scaffold or anything else runs
if ((yes == 0)); then
  [[ -t 0 ]] || die "--apply needs a terminal to ask on: add --yes to confirm without one"
  question="Create $owner/$name ($visibility), and change organization settings as listed?"
  ((scaffold)) && question="Run npx $scaffold_package, then create $owner/$name ($visibility), and change organization settings as listed?"
  read -r -p "$question [y/N] " reply || reply=""
  [[ "$reply" == y || "$reply" == Y ]] || die "not confirmed: nothing was created"
fi

# 3. the files
mkdir -p "$repo_dir"
if ((scaffold)); then
  printf '# scaffold: npx %s\n' "$scaffold_package"
  (cd "$work" && npx --yes "$scaffold_package" "$repo_dir" --fresh --skip-install --name "$name" </dev/null)
  render "$repo_dir" --keep-existing
else
  render "$repo_dir"
fi
[[ -d "$repo_dir/.git" ]] || git -C "$repo_dir" init -q -b main
git -C "$repo_dir" add -A
git -C "$repo_dir" commit -q -s -m "chore: start from the org blueprint" \
  -m "Files from monte3l/.github blueprint/bootstrap.json, rendered by bin/new-repo.sh."
# A scaffold that ran git init may have chosen another branch name.
git -C "$repo_dir" branch -M main
printf 'committed: %s\n' "$(git -C "$repo_dir" log -1 --format='%h %G?')"

# 4. the repository
visibility_flag=--public
((private)) && visibility_flag=--private
gh repo create "$owner/$name" "$visibility_flag" --description="$description" --homepage="$site" >/dev/null
stage=1
printf 'created: %s/%s\n' "$owner" "$name"
git -C "$repo_dir" remote add origin "$remote_base/$owner/$name.git"
git -C "$repo_dir" -c credential.helper= -c credential.helper='!gh auth git-credential' push -q -u origin main
stage=2
printf 'pushed: main\n'

while IFS= read -r topic; do
  gh repo edit "$owner/$name" --add-topic "$topic" >/dev/null
done < <(jq -r '.topics[]' <<<"$project")
stage=3

# 5. the settings
printf '\n== apply-repo-baseline.sh --apply ==\n'
"$baseline" "$owner/$name" --apply
stage=4

# 6. the Apps are installed on selected repositories, so a new repository is added by hand otherwise
manual=()
repo_id="$(gh api "repos/$owner/$name" --jq .id)"
printf '\n== Apps ==\n'
if installations="$(gh api --paginate "orgs/$owner/installations" --jq '.installations[] | .app_slug + " " + (.id | tostring)' 2>&1)"; then
  for app in "${apps[@]}"; do
    id="$(awk -v app="$app" '$1 == app { print $2 }' <<<"$installations")"
    if [[ -z "$id" ]]; then
      manual+=("$app is not installed on the organization: install it, and add the repository")
      printf 'MANUAL %s: not installed on %s\n' "$app" "$owner"
    elif gh api -X PUT "user/installations/$id/repositories/$repo_id" >/dev/null 2>&1; then
      printf 'OK     %s\n' "$app"
    else
      manual+=("add the repository to the $app App (the call was refused)")
      printf 'MANUAL %s: the call was refused\n' "$app"
    fi
  done
else
  manual+=("add the repository to the Apps: the installations could not be listed (${installations%%$'\n'*})")
  printf 'MANUAL could not list the organization'"'"'s installations: %s\n' "${installations%%$'\n'*}"
fi

# 7. what a private repository does not get by itself: the organization secrets (a failed Gitleaks or
# Release run otherwise), and immutable releases, which the release workflow needs
printf '\n== Secrets and releases ==\n'
for secret in "${org_secrets[@]}"; do
  if gh api -X PUT "orgs/$owner/actions/secrets/$secret/repositories/$repo_id" >/dev/null 2>&1; then
    printf 'OK     %s shared\n' "$secret"
  else
    manual+=("share the organization secret $secret: gh api -X PUT orgs/$owner/actions/secrets/$secret/repositories/$repo_id")
    printf 'MANUAL %s: the call was refused\n' "$secret"
  fi
done
if [[ -n "$kind" ]]; then
  if gh api -X PUT "repos/$owner/$name/immutable-releases" >/dev/null 2>&1; then
    printf 'OK     immutable releases on\n'
  else
    manual+=("turn on immutable releases: gh api -X PUT repos/$owner/$name/immutable-releases")
    printf 'MANUAL immutable releases: the call was refused\n'
  fi
fi

# 8. the check
printf '\n== apply-repo-baseline.sh --check ==\n'
rc=0
"$baseline" "$owner/$name" --check >"$work/check.txt" 2>&1 || rc=$?
grep -v '^OK' "$work/check.txt" || true
if ((rc != 0 && rc != 1)); then
  printf 'error: the check itself failed (exit %s)\n' "$rc" >&2
  recovery
  exit 3
fi

printf '\n== What is left for a person ==\n'
if [[ "$(jq '.unfilled | length' "$work/result.json")" != 0 ]]; then
  jq -r '.unfilled[] | "  - fill in " + .to' "$work/result.json"
fi
jq -r '.todo[]? | "  - " + .' "$work/result.json"
jq -r '.kept[]? | select(startswith(".github/workflows/") or . == "design/README.md") | "  - review " + . + ": the scaffold wrote it, so it may not match the org template or the required check names"' "$work/result.json"
if [[ "$(jq '.kept | length' "$work/result.json")" != 0 ]]; then
  printf '  - the scaffold wrote these, so they were kept as they are: %s. Compare them with the org starters\n' "$(jq -r '.kept | join(", ")' "$work/result.json")"
fi
printf '  - add to blueprint/sync.json "repos": %s\n' "$(jq -r .syncEntry "$work/result.json")"
printf '  - register the repository at https://api.reuse.software/register, and on bestpractices.dev\n'
((scaffold)) && printf "  - m3l-groundwork's dependency-review.yml does not read .github/dependency-review-config.yml yet\n"
for item in "${manual[@]+"${manual[@]}"}"; do
  [[ -n "$item" ]] || continue
  printf '  - %s\n' "$item"
done
printf '\nhttps://github.com/%s/%s\n' "$owner" "$name"
((rc == 0 && ${#manual[@]} == 0)) || exit 1
