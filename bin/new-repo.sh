#!/usr/bin/env bash
# Creates a new monte3l repository that starts out following the blueprint.
#
#   new-repo.sh NAME [--kind library|plugin|simple] [--claude] [--private]
#                    [--docs] [--scaffold] [--dry-run | --apply [--yes]]
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
#   --docs      adds a docs site (monte3l.com standard): the docs kit config, the
#               deploy tools and workflows, the environment cleanup, and the
#               design vendored from the pinned m3l-design release. The docs
#               gate runs on the result before anything is created. Not with
#               --scaffold yet
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
# files, make one signed-off commit, create the repository, add it to the
# organization's Apps (installed on selected repositories only), share the
# organization secrets with it (the baseline reports a missing one but does not
# share it) and turn on immutable releases when it has a release kind, then
# push `main` (the ruleset does not exist yet, so this is the only direct push
# the repository ever gets, and the Apps and secrets come first because the push
# starts Gitleaks and Release), set the topics, run `apply-repo-baseline.sh
# --apply` (settings, rulesets, labels) and run the baseline check.
#
# Needs gh (an organization owner; the repo, workflow and admin:org scopes), git,
# jq and node. Placeholders in the starters are always listed at the end, and do
# not change the exit code: a person fills them in.
#
# Exit codes: 0 done, the check is clean and nothing needs a person, 1 done, but
# the check reports drift or a step needs a person (a new public repository
# normally ends 1: Scorecard alerts and the REUSE and bestpractices.dev
# registrations cannot be settled on day one), 2 usage or
# an input that is refused, 3 a call failed (after the repository was created,
# the message says how to finish).
#
# Environment, for tests only: NEW_REPO_POLL_SECONDS (seconds between polls; default 5),
# NEW_REPO_BASELINE (the baseline script to run),
# NEW_REPO_REMOTE_BASE (where `origin` points; default https://github.com) and
# NEW_REPO_DESIGN_SYNC (a command run as `CMD TAG DIR` instead of cloning
# m3l-design and running its bin/sync-design.sh).
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
docs=0
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
  if ((stage < 2)); then
    printf '  share the organization secrets (%s) with it, as the Secrets step does, before the push\n' "${org_secrets[*]}" >&2
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
    --docs) docs=1 ;;
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
((docs == 0 || scaffold == 0)) || die "--docs and --scaffold cannot be combined yet: the scaffold has its own docs setup"

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
if [[ "$mode" == apply ]] && ((docs)); then
  # --docs runs bin/sync-design.sh, which verifies the release with `gh release verify` (gh 2.81 or later),
  # and checks the deploy lockfile with npm ci. Say so now, not after the confirmation.
  command -v npm >/dev/null 2>&1 || die "npm is required for --docs (it checks the deploy lockfile)"
  gh release verify --help >/dev/null 2>&1 || die "gh is too old for --docs: bin/sync-design.sh needs gh release verify (gh 2.81 or later)"
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
((docs)) && render_args+=(--docs)
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
# The organization secrets this repository must be shared: from the data (by the options given), plus the release App's.
org_secrets=()
# The environments a docs repository creates, and the secrets each holds (blueprint/env-secrets.json).
docs_envs=(docs-cloudflare env-janitor)
while IFS= read -r secret; do org_secrets+=("$secret"); done < <(jq -r '.orgSecrets[]?' "$work/result.json")
if [[ -n "$kind" ]]; then
  while IFS= read -r secret; do org_secrets+=("$secret"); done < <(jq -r '.secrets[]?' "$here/../blueprint/release.json")
fi
description="$(jq -er .description <<<"$project")"
site="$(jq -er .site <<<"$project")"
visibility="public"
((private)) && visibility="private"

printf 'new-repo: %s/%s (%s, kind: %s, claude: %s, docs: %s, scaffold: %s)\n\n' "$owner" "$name" "$visibility" "${kind:-none}" "$((claude))" "$((docs))" "$((scaffold))"
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
if [[ "$(jq '.todo | length' "$work/result.json")" != 0 ]]; then
  printf '\nAfterwards, for a person:\n'
  jq -r '.todo[] | "  - " + .' "$work/result.json"
fi
if ((docs)) && command -v dig >/dev/null 2>&1; then
  # A Custom Domain fails to attach over an existing record, and the first deploy runs on the first push.
  if [[ -n "$(dig +short "$(jq -r '.site | sub("^https://"; "")' <<<"$project")" 2>/dev/null)" ]]; then
    printf '\nWarning: dig reports a record for %s. A Cloudflare Custom Domain fails to attach over an existing CNAME, so the first deploy would fail. Remove the record first.\n' "$(jq -r '.site | sub("^https://"; "")' <<<"$project")"
  fi
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
  if ((docs)); then
    printf '  - vendor the design: bin/sync-design.sh of m3l-design %s, then check the deploy lockfile starter with npm ci --dry-run\n' "$(jq -r .version "$here/../blueprint/design-system.json")"
    printf '  - run the docs gate (build.mjs --check) on the result: nothing is created if it fails\n'
  fi
  printf '  - make one signed-off commit and create %s/%s (%s: "%s")\n' "$owner" "$name" "$visibility" "$description"
  ((docs)) && printf '  - create the %s environments, each limited to main\n' "${docs_envs[*]}"
  printf '  - add the repository to the Apps: %s\n' "${apps[*]}"
  printf '  - share the organization secrets with it: %s (organization-level writes)\n' "$(printf '%s ' "${org_secrets[@]}")"
  ((docs)) && printf '  - set the environment secrets (bin/env-secrets.sh: a hidden prompt on a terminal, otherwise listed for you): %s\n' "$(jq -r '[.environments[][]] | join(", ")' "$here/../blueprint/env-secrets.json")"
  [[ -z "$kind" ]] || printf '  - turn on immutable releases for it, which the release workflow needs\n'
  printf '  - push main, which starts Gitleaks and Release: the Apps and secrets come first for that reason\n'
  printf '  - set the topics: %s\n' "$(jq -r '.topics | join(", ")' <<<"$project")"
  printf '  - run apply-repo-baseline.sh --apply (settings, ruleset, labels)\n'
  ((docs)) && printf '  - dispatch environments.yml once, a dry run, and wait: the baseline wants one green run of the cleanup\n'
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
if ((docs)); then
  # The design is copied from the pinned release, with its attestation checked by sync-design.sh itself.
  design_tag="$(jq -r .version "$here/../blueprint/design-system.json")"
  [[ "$design_tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "blueprint/design-system.json has \"$design_tag\" as the version, which is not a release tag like v1.4.0"
  printf '# vendoring m3l-design %s\n' "$design_tag"
  if [[ -n "${NEW_REPO_DESIGN_SYNC:-}" ]]; then
    printf 'warning: NEW_REPO_DESIGN_SYNC is set, so %s runs instead of the verified sync-design.sh\n' "$NEW_REPO_DESIGN_SYNC" >&2
    "$NEW_REPO_DESIGN_SYNC" "$design_tag" "$repo_dir"
  else
    # Fetch the tag by its full ref. `git clone --branch TAG` takes a branch of the same name first, and
    # this script then runs the cloned sync-design.sh with your credentials.
    mkdir "$work/m3l-design"
    git -C "$work/m3l-design" init -q
    git -C "$work/m3l-design" fetch -q --depth 1 "$remote_base/$owner/m3l-design.git" "refs/tags/$design_tag"
    git -C "$work/m3l-design" checkout -q --detach FETCH_HEAD
    bash "$work/m3l-design/bin/sync-design.sh" "$design_tag" "$repo_dir"
  fi
  # The deploy workflow installs with npm ci, so the lockfile is committed. It is a starter
  # (blueprint/files/deploy-tools/), reviewed here and kept current by Dependabot, with an integrity hash for
  # every package: nothing is resolved from the network at bootstrap. npm ci --dry-run only proves it still
  # matches package.json, and it fails the whole run before anything is created if it does not.
  if ! (cd "$repo_dir/tools/deploy" && npm ci --dry-run --ignore-scripts >/dev/null 2>&1); then
    printf 'error: npm ci refuses the deploy lockfile (it does not match tools/deploy/package.json), so nothing was created\n' >&2
    exit 3
  fi
fi
git -C "$repo_dir" add -A
if ((docs)); then
  # The same gate the first push will run. A docs site that fails it would fail its first deploy.
  if ! (cd "$repo_dir" && node design/source/docs-kit/build.mjs --check); then
    printf 'error: the docs gate fails on the rendered repository, so nothing was created\n' >&2
    exit 3
  fi
fi
git -C "$repo_dir" commit -q -s -m "chore: start from the org blueprint" \
  -m "Files from monte3l/.github blueprint/bootstrap.json, rendered by bin/new-repo.sh."
# A scaffold that ran git init may have chosen another branch name.
git -C "$repo_dir" branch -M main
printf 'committed: %s\n' "$(git -C "$repo_dir" log -1 --format='%h %G?')"

# 4. the repository, its Apps and secrets, then the push
visibility_flag=--public
((private)) && visibility_flag=--private
gh repo create "$owner/$name" "$visibility_flag" --description="$description" --homepage="$site" >/dev/null
stage=1
printf 'created: %s/%s\n' "$owner" "$name"
manual=()
repo_id="$(gh api "repos/$owner/$name" --jq .id)"
if ((docs)); then
  # The deploy job and the weekly cleanup each run in an environment limited to main. The four secrets
  # they use are set in those environments, not shared from the organization (see "Environment secrets").
  printf '\n== environments ==\n'
  for env_name in "${docs_envs[@]}"; do
    # The branch policy flags are JSON booleans, which gh api -f would send as strings.
    if env_error="$(printf '%s' '{"deployment_branch_policy":{"protected_branches":false,"custom_branch_policies":true}}' |
      gh api -X PUT "repos/$owner/$name/environments/$env_name" --input - 2>&1 >/dev/null)" &&
      env_error="$(gh api -X POST "repos/$owner/$name/environments/$env_name/deployment-branch-policies" -f name=main -f type=branch 2>&1 >/dev/null)"; then
      printf 'OK     %s, limited to main\n' "$env_name"
    else
      manual+=("create the $env_name environment limited to main: see blueprint/docs-site.md, One-time setup, step 3 (${env_error%%$'\n'*})")
      printf 'MANUAL %s: refused (%s)\n' "$env_name" "${env_error%%$'\n'*}"
    fi
  done
fi
# The Apps are installed on selected repositories, so a new repository is added by hand otherwise
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

# What a new repository is not given by itself: the organization secrets, and immutable releases, which
# the release workflow needs. All of it is in place before the push, because the push starts Gitleaks and
# Release, and a secret shared afterwards does not save those first runs.
printf '\n== Secrets and releases ==\n'
for secret in "${org_secrets[@]}"; do
  if gh api -X PUT "orgs/$owner/actions/secrets/$secret/repositories/$repo_id" >/dev/null 2>&1; then
    printf 'OK     %s shared\n' "$secret"
  else
    manual+=("share the organization secret $secret: gh api -X PUT orgs/$owner/actions/secrets/$secret/repositories/$repo_id")
    printf 'MANUAL %s: the call was refused\n' "$secret"
  fi
done
# Environment secrets: the Cloudflare and janitor credentials are read only by a job in their environment.
# The values are typed here or later by a person, never passed to this script or read from the organization.
if ((docs)); then
  printf '\n== Environment secrets ==\n'
  # The list comes in on fd 3, so standard input stays the terminal for the prompt and the -t test.
  env_secret_pairs="$(jq -r '.environments | to_entries[] | .key as $e | .value[] | "\($e) \(.)"' "$here/../blueprint/env-secrets.json")"
  while IFS=' ' read -r -u 3 env_name secret; do
    if [[ -t 0 ]]; then
      if "$here/env-secrets.sh" set "$secret" --repo "$name" --owner "$owner" >/dev/null; then
        printf 'OK     %s set in %s\n' "$secret" "$env_name"
        continue
      fi
      printf 'MANUAL %s: not set in %s\n' "$secret" "$env_name"
    else
      printf 'MANUAL %s: set it in %s\n' "$secret" "$env_name"
    fi
    manual+=("set $secret in the $env_name environment of $owner/$name: bin/env-secrets.sh set $secret --repo $name --owner $owner")
  done 3<<<"$env_secret_pairs"
fi
if [[ -n "$kind" ]]; then
  if gh api -X PUT "repos/$owner/$name/immutable-releases" >/dev/null 2>&1; then
    printf 'OK     immutable releases on\n'
  else
    manual+=("turn on immutable releases: gh api -X PUT repos/$owner/$name/immutable-releases")
    printf 'MANUAL immutable releases: the call was refused\n'
  fi
fi

git -C "$repo_dir" remote add origin "$remote_base/$owner/$name.git"
git -C "$repo_dir" -c credential.helper= -c credential.helper='!gh auth git-credential' push -q -u origin main
stage=2
printf 'pushed: main\n'

while IFS= read -r topic; do
  gh repo edit "$owner/$name" --add-topic "$topic" >/dev/null
done < <(jq -r '.topics[]' <<<"$project")
stage=3

# 6. the settings
printf '\n== apply-repo-baseline.sh --apply ==\n'
"$baseline" "$owner/$name" --apply
stage=4

# The cleanup workflow has never run in a new repository, and the baseline wants one green run of it: it
# shows the App installation, the secrets and the policy all resolve together. A dry run changes nothing.
if ((docs)); then
  printf '\n== environment cleanup: one dry run ==\n'
  poll="${NEW_REPO_POLL_SECONDS:-5}"
  janitor_state=""
  if gh workflow run environments.yml -R "$owner/$name" >/dev/null 2>&1; then
    run_id=""
    tries=0
    while [[ -z "$run_id" && $tries -lt 12 ]]; do
      run_id="$(gh run list -R "$owner/$name" --workflow environments.yml --limit 1 --event workflow_dispatch --json databaseId --jq '.[0].databaseId // empty' 2>/dev/null || true)"
      [[ -n "$run_id" ]] || sleep "$poll"
      tries=$((tries + 1))
    done
    if [[ -n "$run_id" ]]; then
      tries=0
      while [[ "$janitor_state" != completed* && $tries -lt 60 ]]; do
        janitor_state="$(gh run view "$run_id" -R "$owner/$name" --json status,conclusion --jq '.status + " " + (.conclusion // "")' 2>/dev/null || true)"
        [[ "$janitor_state" == completed* ]] || sleep "$poll"
        tries=$((tries + 1))
      done
    fi
  fi
  if [[ "$janitor_state" == "completed success" ]]; then
    printf 'OK     environments.yml: success\n'
  else
    manual+=("dispatch environments.yml in $owner/$name with dry_run on and read the job summary: it did not finish green (${janitor_state:-it could not be started or found})")
    printf 'MANUAL environments.yml: %s\n' "${janitor_state:-not started}"
  fi
fi

# 7. the check
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
((private)) || printf '  - Scorecard opens alerts on its first run (Maintained, Fuzzing and others a new repository cannot satisfy yet): fix them, or dismiss them citing the accepted findings in SECURITY.md\n'
((scaffold)) && printf "  - m3l-groundwork's dependency-review.yml does not read .github/dependency-review-config.yml yet\n"
for item in "${manual[@]+"${manual[@]}"}"; do
  [[ -n "$item" ]] || continue
  printf '  - %s\n' "$item"
done
printf '\nhttps://github.com/%s/%s\n' "$owner" "$name"
((rc == 0 && ${#manual[@]} == 0)) || exit 1
