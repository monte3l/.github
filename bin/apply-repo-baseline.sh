#!/usr/bin/env bash
# Compare a repository's GitHub settings with the blueprint in ../blueprint,
# and optionally bring it in line.
#
#   apply-repo-baseline.sh OWNER/REPO [--check | --dry-run | --apply]
#
#   --check    (default) read-only; prints OK or DRIFT per item, exits 1 on drift
#   --dry-run  read-only; also prints the gh command each drifted item would run
#   --apply    runs those commands
#
# Every item is compared with the live state first, so a second --apply run
# changes nothing. Items a private repository on a free plan cannot have
# (fork-PR approval, private vulnerability reporting, rulesets) print SKIP,
# which is not drift. The design-system, docs-site and repository-file items only report:
# adopting m3l-design or adding a file is a commit in the repository, which no
# API call can make. Open Scorecard alerts are report-only for the same reason:
# the fix is a commit, or a dismissal that cites SECURITY.md. For a repository
# that runs the weekly cleanup, the env-janitor environment, its main-only
# branch policy and the repository's access to the org-level janitor secrets
# are applied. The App installation, the secrets themselves and the pinned
# planner commit only report. Needs gh (authenticated, repository admin, plus
# admin:org to read or share org secrets) and jq.
set -euo pipefail

usage() {
  sed -n '2,22p' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-2}"
}

repo=""
mode="check"
for arg in "$@"; do
  case "$arg" in
    --check) mode="check" ;;
    --dry-run) mode="dry-run" ;;
    --apply) mode="apply" ;;
    -h | --help) usage 0 ;;
    -*) echo "unknown option: $arg" >&2; usage ;;
    *) [[ -z "$repo" ]] || usage; repo="$arg" ;;
  esac
done
[[ "$repo" == */* ]] || usage

command -v gh >/dev/null || { echo "gh is required" >&2; exit 2; }
command -v jq >/dev/null || { echo "jq is required" >&2; exit 2; }

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/../blueprint" && pwd)"
ok=0 drift=0 skipped=0

# settle LABEL CURRENT DESIRED METHOD PATH [BODY]
# CURRENT and DESIRED are JSON already reduced to the keys the blueprint owns.
# BODY is what METHOD PATH is sent; it defaults to DESIRED.
settle() {
  local label="$1" current="$2" desired="$3" method="$4" path="$5"
  local body="${6:-$3}"
  if [[ "$(jq -S . <<<"$current")" == "$(jq -S . <<<"$desired")" ]]; then
    printf 'OK     %s\n' "$label"
    ok=$((ok + 1))
    return
  fi
  drift=$((drift + 1))
  printf 'DRIFT  %s\n' "$label"
  if [[ "$mode" != "apply" ]]; then
    diff <(jq -S . <<<"$current") <(jq -S . <<<"$desired") | sed 's/^/         /' || true
  fi
  case "$mode" in
    dry-run) printf '         would run: gh api -X %s %s --input <(desired json)\n' "$method" "$path" ;;
    apply)
      jq -c . <<<"$body" | gh api -X "$method" "$path" --input - >/dev/null
      printf '         applied\n'
      ;;
  esac
}

# skip LABEL REASON: an item this repository's plan cannot have. Not drift.
skip() {
  printf 'SKIP   %s (%s)\n' "$1" "$2"
  skipped=$((skipped + 1))
}

# pick DESIRED_JSON < CURRENT_JSON: keep only the keys DESIRED names.
pick() {
  jq --argjson d "$1" '. as $c | $d | with_entries(.value = $c[.key])'
}

# --- repository settings -----------------------------------------------------
desired="$(jq -c . "$here/repo-settings.json")"
live_repo="$(gh api "repos/$repo")"
private="$(jq -r .private <<<"$live_repo")"
current="$(pick "$desired" <<<"$live_repo")"
settle "repository settings" "$current" "$desired" PATCH "repos/$repo"

# --- Actions policy ----------------------------------------------------------
desired="$(jq -c .workflow "$here/actions.json")"
current="$(gh api "repos/$repo/actions/permissions/workflow" | pick "$desired")"
settle "Actions: workflow token and PR approval" "$current" "$desired" PUT "repos/$repo/actions/permissions/workflow"

# The contributor-approval endpoint exists for public repositories only.
if [[ "$private" == "true" ]]; then
  skip "Actions: fork PR approval" "private repository"
else
  desired="$(jq -c .fork_pr_approval "$here/actions.json")"
  current="$(gh api "repos/$repo/actions/permissions/fork-pr-contributor-approval" | pick "$desired")"
  settle "Actions: fork PR approval" "$current" "$desired" PUT "repos/$repo/actions/permissions/fork-pr-contributor-approval"
fi

# PUT /actions/permissions also needs `enabled`, so the body carries the live
# `enabled` and `allowed_actions` along with the one key the blueprint owns.
desired="$(jq -c .sha_pinning "$here/actions.json")"
live="$(gh api "repos/$repo/actions/permissions")"
current="$(pick "$desired" <<<"$live")"
body="$(jq -c --argjson d "$desired" '{enabled, allowed_actions} + $d' <<<"$live")"
settle "Actions: SHA pinning required" "$current" "$desired" PUT "repos/$repo/actions/permissions" "$body"

# --- security features -------------------------------------------------------
# Each GET is 404 (or enabled:false) when the feature is off.
security_feature() {
  local label="$1" path="$2" body flag
  if body="$(gh api "repos/$repo/$path" 2>/dev/null)"; then
    flag="$(jq -r 'if type == "object" and has("enabled") then .enabled else true end' <<<"${body:-null}" 2>/dev/null || echo true)"
  else
    flag=false
  fi
  settle "$label" "{\"enabled\": $flag}" '{"enabled": true}' PUT "repos/$repo/$path" '{}'
}
security_feature "security: Dependabot alerts" vulnerability-alerts
security_feature "security: Dependabot security updates" automated-security-fixes
if [[ "$private" == "true" ]]; then
  skip "security: private vulnerability reporting" "private repository"
else
  security_feature "security: private vulnerability reporting" private-vulnerability-reporting
fi

# --- rulesets ----------------------------------------------------------------
normalize_ruleset() {
  jq -S '{name, target, enforcement, bypass_actors, conditions, rules: (.rules | sort_by(.type))}'
}
# A private repository on a free plan answers 403 "Upgrade to GitHub Pro". Only
# that answer is a skip; any other failure still stops the script.
if ! existing="$(gh api "repos/$repo/rulesets" 2>&1)"; then
  if grep -q 'Upgrade to GitHub Pro' <<<"$existing"; then
    existing=""
    skip "rulesets" "not available on this plan for a private repository"
  else
    printf '%s\n' "$existing" >&2
    exit 1
  fi
fi
for file in "$here"/rulesets/*.json; do
  [[ -n "$existing" ]] || break
  desired="$(normalize_ruleset <"$file")"
  name="$(jq -r .name <<<"$desired")"
  id="$(jq -r --arg n "$name" '.[] | select(.name == $n) | .id' <<<"$existing")"
  if [[ -z "$id" ]]; then
    settle "ruleset: $name" '{"missing": true}' '{"missing": false}' POST "repos/$repo/rulesets" "$desired"
  else
    current="$(gh api "repos/$repo/rulesets/$id" | normalize_ruleset)"
    settle "ruleset: $name" "$current" "$desired" PUT "repos/$repo/rulesets/$id"
  fi
done

# --- labels (created when missing; an existing label is never rewritten) ------
have="$(gh label list --repo "$repo" --limit 200 --json name --jq '.[].name')"
while IFS= read -r label; do
  name="$(jq -r .name <<<"$label")"
  if grep -Fxq -- "$name" <<<"$have"; then
    printf 'OK     label: %s\n' "$name"
    ok=$((ok + 1))
    continue
  fi
  drift=$((drift + 1))
  printf 'DRIFT  label: %s (missing)\n' "$name"
  color="$(jq -r .color <<<"$label")"
  description="$(jq -r .description <<<"$label")"
  case "$mode" in
    dry-run) printf '         would run: gh label create %s --color %s --repo %s\n' "$name" "$color" "$repo" ;;
    apply)
      gh label create "$name" --color "$color" --description "$description" --repo "$repo" >/dev/null
      printf '         applied\n'
      ;;
  esac
done < <(jq -c '.[]' "$here/labels.json")

# --- design system (report only: adopting it is a commit in the repository) ---
# The marker file must exist and name the pinned m3l-design version. Nothing
# here can be applied through the API, so --dry-run and --apply only say what to do.
marker_path="$(jq -r .marker "$here/design-system.json")"
pinned="$(jq -r .version "$here/design-system.json")"
if marker="$(gh api "repos/$repo/contents/$marker_path" --jq .content 2>/dev/null | base64 -d 2>/dev/null)" && [[ -n "$marker" ]]; then
  # shellcheck disable=SC2016 # the backticks are literal markdown in the sed regex
  found="$(sed -nE 's/^- \*\*Version (copied|adopted):\*\* `([^`]+)`.*/\2/p' <<<"$marker" | head -n 1)"
  if [[ "$found" == "$pinned" ]]; then
    printf 'OK     design system: %s\n' "$pinned"
    ok=$((ok + 1))
    problem=""
  else
    problem="${marker_path} records version '${found:-none}', blueprint pins '${pinned}'"
  fi
else
  problem="no ${marker_path}"
fi
if [[ -n "${problem:-}" ]]; then
  drift=$((drift + 1))
  printf 'DRIFT  design system: %s\n' "$problem"
  [[ "$mode" == "check" ]] || printf '         needs a commit in %s: see blueprint/README.md "Design system"\n' "$repo"
fi

# --- repository files (report only: adopting them is a commit in the repository) ---
# GitHub never inherits these, so the script can only say which are missing. The
# starting points live in blueprint/files/ and workflow-templates/.

# file_content PATH: the file's text, or nothing and a failing status when absent.
file_content() {
  gh api "repos/$repo/contents/$1" --jq .content 2>/dev/null | base64 -d 2>/dev/null
}

# report_file LABEL HINT PATH...: OK when any PATH exists, DRIFT otherwise.
report_file() {
  local label="$1" hint="$2" path
  shift 2
  for path in "$@"; do
    if [[ -n "$(file_content "$path")" ]]; then
      printf 'OK     %s: %s\n' "$label" "$path"
      ok=$((ok + 1))
      return
    fi
  done
  drift=$((drift + 1))
  printf 'DRIFT  %s: none of %s\n' "$label" "$*"
  [[ "$mode" == "check" ]] || printf '         needs a commit in %s: %s\n' "$repo" "$hint"
}

report_file "CODEOWNERS" "write one; the main ruleset requires a code-owner approval" \
  .github/CODEOWNERS CODEOWNERS docs/CODEOWNERS
report_file "security policy" "write one with an absolute advisory URL; the org default has no link, so a repository inheriting it scores 4 on Scorecard's Security-Policy" \
  SECURITY.md .github/SECURITY.md docs/SECURITY.md
report_file "Gitleaks config" "copy blueprint/files/gitleaks.toml" .gitleaks.toml
report_file "line endings" "copy blueprint/files/gitattributes" .gitattributes
report_file "editor config" "copy blueprint/files/editorconfig" .editorconfig
report_file "REUSE" "start from blueprint/files/REUSE.toml and add LICENSES/" REUSE.toml
# The checks below look for the control, not a file name: a repository may run
# it from its own workflow (for example a `reuse lint` step inside `verify.yml`)
# and a second copy of the template would only duplicate it.
workflows_text=""
workflow_names=""
while IFS= read -r wf; do
  workflows_text+="$(file_content ".github/workflows/$wf")"$'\n'
  workflow_names+="$wf"$'\n'
done < <(gh api "repos/$repo/contents/.github/workflows" --jq '.[] | select(.type == "file") | .name' 2>/dev/null || true)

# report_workflow LABEL HINT PATTERN...: OK when every PATTERN (an extended
# regex) matches somewhere in the repository's workflows, DRIFT otherwise.
report_workflow() {
  local label="$1" hint="$2" pattern
  shift 2
  for pattern in "$@"; do
    if ! grep -Eq -- "$pattern" <<<"$workflows_text"; then
      drift=$((drift + 1))
      printf 'DRIFT  %s: no workflow matches /%s/\n' "$label" "$pattern"
      [[ "$mode" == "check" ]] || printf '         needs a commit in %s: %s\n' "$repo" "$hint"
      return
    fi
  done
  printf 'OK     %s\n' "$label"
  ok=$((ok + 1))
}

report_workflow "workflow lint" "copy workflow-templates/workflow-lint.yml, or add the missing linter to a workflow that already runs" \
  'actionlint' 'zizmor'
report_workflow "REUSE check" "copy workflow-templates/reuse.yml, or run reuse lint from a workflow that already runs" \
  'reuse lint|fsfe/reuse-action'
report_workflow "DCO check" "copy workflow-templates/dco.yml, or check Signed-off-by from a workflow that already runs" \
  'Signed-off-by'
report_workflow "commit lint" "copy workflow-templates/commit-lint.yml, or check Conventional Commits from a workflow that already runs under the job name Commit lint" \
  'name: Commit lint'
report_workflow "PR labeler" "copy workflow-templates/labeler.yml and start .github/labeler.yml from blueprint/files/labeler.yml" \
  'actions/labeler'

# A literal version number after `node-version:` forks the pin from
# `.node-version`, which is the single source. `node-version-file:` is the
# allowed form, and so is a non-numeric value such as `current` (a lane that
# tracks the newest release on purpose). Comments do not count.
if grep -Eq -- '^[[:space:]-]*node-version:[[:space:]]*["'\'']?[0-9]' <<<"$workflows_text"; then
  drift=$((drift + 1))
  printf 'DRIFT  Node pin: a workflow hardcodes a node-version number\n'
  [[ "$mode" == "check" ]] || printf '         use node-version-file: .node-version in %s\n' "$repo"
else
  printf 'OK     Node pin: no hardcoded node-version\n'
  ok=$((ok + 1))
fi

# Scorecard publishes results for public repositories only.
if [[ "$private" == "true" ]]; then
  skip "Scorecard workflow" "private repository"
else
  report_workflow "Scorecard workflow" "copy workflow-templates/scorecard.yml" 'ossf/scorecard-action'
fi

# Open Scorecard alerts: fix each, or dismiss it as "won't fix" with a comment
# that cites the accepted-findings section of the repository's SECURITY.md.
# Report only. A repository without code scanning answers with an error, which
# is a SKIP rather than drift.
if [[ "$private" != "true" ]]; then
  if alerts="$(gh api "repos/$repo/code-scanning/alerts?tool_name=Scorecard&state=open&per_page=100" \
    --jq '.[] | "\(.number) \(.rule.id)"' 2>/dev/null)"; then
    if [[ -z "$alerts" ]]; then
      printf 'OK     Scorecard alerts: none open\n'
      ok=$((ok + 1))
    else
      while read -r number rule; do
        drift=$((drift + 1))
        printf 'DRIFT  Scorecard alert #%s: %s\n' "$number" "$rule"
        [[ "$mode" == "check" ]] || printf '         fix it, or dismiss it citing the accepted-findings section of SECURITY.md in %s\n' "$repo"
      done <<<"$alerts"
    fi
  else
    skip "Scorecard alerts" "code scanning unavailable"
  fi
fi

# Dependabot must exist and keep the github-actions ecosystem, the one every
# repository has regardless of language.
dependabot="$(file_content .github/dependabot.yml || file_content .github/dependabot.yaml || true)"
if grep -q 'package-ecosystem: *"\{0,1\}github-actions' <<<"$dependabot"; then
  printf 'OK     Dependabot: github-actions ecosystem\n'
  ok=$((ok + 1))
else
  drift=$((drift + 1))
  printf 'DRIFT  Dependabot: .github/dependabot.yml is missing or has no github-actions ecosystem\n'
  [[ "$mode" == "check" ]] || printf '         needs a commit in %s: start from blueprint/files/dependabot.yml\n' "$repo"
fi

# --- docs site (report only; applies only to a repository that has one) ---
# docs.config.mjs is the docs kit's config, so its presence is what makes a
# repository a docs-site repository. Everything here is a commit, never an API
# call, except the homepage, which `gh repo edit --homepage` can set.
if [[ -z "$(file_content docs.config.mjs)" ]]; then
  skip "docs site" "no docs.config.mjs"
else
  docs_marker="$(file_content "$marker_path")"
  # shellcheck disable=SC2016 # the backticks are literal markdown in the grep regex
  if grep -Eq '^- \*\*Version copied:\*\* `v[0-9]' <<<"$docs_marker" ||
    { grep -Eq '^- \*\*Version adopted:\*\* `v[0-9]' <<<"$docs_marker" && grep -Eq '^- \*\*Tier:\*\* source' <<<"$docs_marker"; }; then
    printf 'OK     docs site: tier\n'
    ok=$((ok + 1))
  else
    drift=$((drift + 1))
    printf 'DRIFT  docs site: tier: %s needs "Version copied" (vendored), or "Version adopted" plus "Tier: source" for m3l-design\n' "$marker_path"
    [[ "$mode" == "check" ]] || printf '         needs a commit in %s: see blueprint/docs-site.md\n' "$repo"
  fi
  report_workflow "docs site: gate" "run node design/source/docs-kit/build.mjs --check from verify.yml, see blueprint/docs-site.md" \
    'docs-kit/build\.mjs --check'
  report_workflow "docs site: deploy" "copy workflow-templates/docs.yml" \
    'docs-kit/build\.mjs --out' 'wrangler deploy' 'docs-kit/check-live\.mjs --site'
  # The daily check must sit in the same workflow as its schedule, not merely
  # somewhere among the repository's workflows.
  daily=""
  while IFS= read -r wf; do
    [[ -n "$wf" ]] || continue
    text="$(file_content ".github/workflows/$wf")"
    if grep -Eq '^[[:space:]]*schedule:' <<<"$text" && grep -Eq 'docs-kit/check-live\.mjs' <<<"$text"; then
      daily="$wf"
      break
    fi
  done <<<"$workflow_names"
  if [[ -n "$daily" ]]; then
    printf 'OK     docs site: daily check (%s)\n' "$daily"
    ok=$((ok + 1))
  else
    drift=$((drift + 1))
    printf 'DRIFT  docs site: daily check: no workflow has both a schedule and docs-kit/check-live.mjs\n'
    [[ "$mode" == "check" ]] || printf '         needs a commit in %s: copy workflow-templates/docs-live.yml\n' "$repo"
  fi
  homepage="$(jq -r '.homepage // ""' <<<"$live_repo")"
  if [[ "$homepage" =~ ^https://([a-z0-9-]+\.)?monte3l\.com/?$ ]]; then
    printf 'OK     docs site: homepage %s\n' "$homepage"
    ok=$((ok + 1))
  else
    drift=$((drift + 1))
    printf 'DRIFT  docs site: homepage is "%s", not an https://*.monte3l.com URL\n' "$homepage"
    [[ "$mode" == "check" ]] || printf '         gh repo edit %s --homepage https://<project>.monte3l.com\n' "$repo"
  fi
fi

# --- release (report only; applies to every repository not exempt in release.json) ---
# The standard is the shared release workflows, so a repository either calls
# them from its own release.yml or is listed as exempt with a reason. The
# configuration is a commit, never an API call. The exempt list is data here
# because "which repositories publish releases" is an org decision, not
# something a file in the repository can declare for itself.
release_exempt="$(jq -r --arg name "${repo##*/}" '.exempt[$name] // empty' "$here/release.json")"
if [[ -n "$release_exempt" ]]; then
  skip "release" "$release_exempt"
else
  release_prepare="$(jq -r .workflow "$here/release.json")"
  release_finalize="${release_prepare/prepare/finalize}"
  report_file "release: config" "start from blueprint/files/release-please/ and save it as release-please-config.json" \
    release-please-config.json
  report_file "release: manifest" "start from blueprint/files/release-please/manifest.json and save it as .release-please-manifest.json" \
    .release-please-manifest.json
  report_workflow "release: workflow" "copy workflow-templates/release.yml" \
    "${release_prepare//./\\.}@[0-9a-f]{40}" \
    "${release_finalize//./\\.}@[0-9a-f]{40}"
  # Immutable releases lock a tag and its assets when the release is published.
  # Report only: the org-wide setting is the intended way to turn them on, and
  # a repository-level exception is the owner's call.
  if immutable="$(gh api "repos/$repo/immutable-releases" --jq .enabled 2>/dev/null)"; then
    if [[ "$immutable" == "true" ]]; then
      printf 'OK     release: immutable releases\n'
      ok=$((ok + 1))
    else
      drift=$((drift + 1))
      printf 'DRIFT  release: immutable releases: off\n'
      [[ "$mode" == "check" ]] || printf '         turn them on for all repositories in the organization settings, under Repository, General, Releases\n'
    fi
  else
    skip "release: immutable releases" "setting unavailable"
  fi
fi

# --- env-janitor (applied: the environment, its branch policy, org-secret access) ---
# Only a repository with .github/environments.json runs the weekly cleanup. The
# App installation and the secrets themselves are never touched here: installing
# an App is an org setting, and a secret needs key material this script does not
# hold. The pinned planner commit and the last run only report.

# The planner's import graph in m3l-groundwork. A commit touching any of these
# changes what a consuming repository's pin runs. Keep it in step with the
# imports of bin/cleanup-environments.mjs.
janitor_files=(bin/cleanup-environments.mjs bin/lib/environment-cleanup.mjs bin/lib/report.mjs bin/lib/term.mjs)
janitor_secrets=(JANITOR_APP_CLIENT_ID JANITOR_APP_PRIVATE_KEY)
janitor_env="env-janitor"
planner_repo="monte3l/m3l-groundwork"
owner="${repo%%/*}"
repo_id="$(jq -r .id <<<"$live_repo")"

if [[ -z "$(file_content .github/environments.json)" ]]; then
  skip "env-janitor" "no .github/environments.json"
else
  # The environment only scopes the job to main; it holds no reviewers or timer,
  # so replacing its settings with PUT loses nothing.
  desired='{"deployment_branch_policy":{"protected_branches":false,"custom_branch_policies":true}}'
  if live="$(gh api "repos/$repo/environments/$janitor_env" 2>/dev/null)"; then :; else live='{}'; fi
  current="$(jq -c '{deployment_branch_policy: (.deployment_branch_policy // null)}' <<<"$live")"
  settle "env-janitor: environment" "$current" "$desired" PUT "repos/$repo/environments/$janitor_env"

  # Missing main is added. Extra policies are reported and never removed.
  if policies="$(gh api "repos/$repo/environments/$janitor_env/deployment-branch-policies" --jq '[.branch_policies[].name]' 2>/dev/null)"; then :; else policies='[]'; fi
  policies="$(jq -c . <<<"$policies")"
  if [[ "$policies" == '["main"]' ]]; then
    printf 'OK     env-janitor: branch policy: main only\n'
    ok=$((ok + 1))
  else
    drift=$((drift + 1))
    printf 'DRIFT  env-janitor: branch policy: %s, want ["main"]\n' "$policies"
    if jq -e 'index("main") != null' <<<"$policies" >/dev/null; then
      [[ "$mode" == "check" ]] || printf '         extra policies are never removed here: delete them by hand in %s\n' "$repo"
    else
      case "$mode" in
        dry-run) printf '         would run: gh api -X POST repos/%s/environments/%s/deployment-branch-policies -f name=main\n' "$repo" "$janitor_env" ;;
        apply)
          gh api -X POST "repos/$repo/environments/$janitor_env/deployment-branch-policies" -f name=main >/dev/null
          printf '         applied\n'
          ;;
      esac
    fi
  fi

  # The two secrets are org-level, visibility "selected". This applies one org
  # write: adding this repository to each secret's list. It never creates a
  # secret or widens its visibility.
  secret_problems="" secret_unshared=()
  for secret in "${janitor_secrets[@]}"; do
    if ! visibility="$(gh api "orgs/$owner/actions/secrets/$secret" --jq .visibility 2>/dev/null)"; then
      secret_problems+="$secret cannot be read (missing, or the token lacks admin:org); "
    elif [[ "$visibility" != "selected" ]]; then
      secret_problems+="$secret has visibility '$visibility', want selected; "
    elif ! shared_ids="$(gh api --paginate "orgs/$owner/actions/secrets/$secret/repositories" --jq '.repositories[].id' 2>/dev/null)"; then
      secret_problems+="$secret's repository list cannot be read; "
    elif ! grep -Fxq -- "$repo_id" <<<"$shared_ids"; then
      secret_problems+="$secret is not shared with $repo; "
      secret_unshared+=("$secret")
    fi
  done
  if [[ -z "$secret_problems" ]]; then
    printf 'OK     env-janitor: org secrets: shared with this repository\n'
    ok=$((ok + 1))
  else
    drift=$((drift + 1))
    printf 'DRIFT  env-janitor: org secrets: %s\n' "${secret_problems%; }"
    # The + form keeps an empty array from tripping `set -u` on bash 3.2 (macOS).
    for secret in ${secret_unshared[@]+"${secret_unshared[@]}"}; do
      case "$mode" in
        dry-run) printf '         would run: gh api -X PUT orgs/%s/actions/secrets/%s/repositories/%s\n' "$owner" "$secret" "$repo_id" ;;
        apply)
          gh api -X PUT "orgs/$owner/actions/secrets/$secret/repositories/$repo_id" >/dev/null
          printf '         applied: %s\n' "$secret"
          ;;
      esac
    done
    [[ "$mode" == "check" ]] || printf '         a missing secret needs: gh secret set <name> --org %s --visibility selected --repos <repo,...>\n' "$owner"
  fi

  # An environment secret wins over an org one, so a leftover copy keeps the
  # old key alive after a rotation. Never deleted here.
  leftover=""
  if env_secrets="$(gh api "repos/$repo/environments/$janitor_env/secrets" --jq '.secrets[].name' 2>/dev/null)"; then
    leftover="$(grep -E '^JANITOR_APP_' <<<"$env_secrets" | tr '\n' ' ' || true)"
  fi
  if [[ -z "$leftover" ]]; then
    printf 'OK     env-janitor: no environment secrets\n'
    ok=$((ok + 1))
  else
    drift=$((drift + 1))
    printf 'DRIFT  env-janitor: no environment secrets: %sstill set, and they override the org secrets\n' "$leftover"
    if [[ "$mode" != "check" ]]; then
      for secret in $leftover; do
        printf '         gh secret delete %s --env %s --repo %s\n' "$secret" "$janitor_env" "$repo"
      done
    fi
  fi

  # Org secrets reach every workflow in the repository on any branch, so only
  # environments.yml may name them.
  stray=""
  while IFS= read -r wf; do
    [[ -n "$wf" && "$wf" != "environments.yml" ]] || continue
    if grep -q 'JANITOR_APP_' <<<"$(file_content ".github/workflows/$wf")"; then
      stray+="$wf "
    fi
  done <<<"$workflow_names"
  if [[ -z "$stray" ]]; then
    printf 'OK     env-janitor: secret references: only environments.yml\n'
    ok=$((ok + 1))
  else
    drift=$((drift + 1))
    printf 'DRIFT  env-janitor: secret references: %sname the janitor secrets\n' "$stray"
    [[ "$mode" == "check" ]] || printf '         move the use into environments.yml, or the org secrets reach more than the cleanup job\n'
  fi

  # The pinned planner commit. m3l-groundwork itself runs its own bin/. Two
  # tiers: the pin must be on main, and must contain the newest commit that
  # touched the planner's files. Merely trailing main is fine.
  env_wf="$(file_content .github/workflows/environments.yml)"
  if [[ -z "$env_wf" ]]; then
    drift=$((drift + 1))
    printf 'DRIFT  env-janitor: planner pin: no .github/workflows/environments.yml\n'
    [[ "$mode" == "check" ]] || printf '         needs a commit in %s: copy workflow-templates/environments.yml\n' "$repo"
  elif ! grep -q "repository: $planner_repo" <<<"$env_wf"; then
    skip "env-janitor: planner pin" "runs its own bin/"
  else
    pin="$(grep -A2 "repository: $planner_repo" <<<"$env_wf" | sed -nE 's/^[[:space:]]*ref:[[:space:]]*([0-9a-f]{40}).*/\1/p' | head -n 1 || true)"
    janitor_sha="$(for f in "${janitor_files[@]}"; do
      gh api "repos/$planner_repo/commits?sha=main&path=$f&per_page=1" \
        --jq '.[0] | select(. != null) | "\(.commit.committer.date) \(.sha)"' 2>/dev/null || true
    done | sort | tail -n 1 | cut -d' ' -f2)"
    pin_problem=""
    if [[ -z "$pin" ]]; then
      pin_problem="no 40-character ref after repository: $planner_repo"
    elif [[ -z "$janitor_sha" ]]; then
      pin_problem="cannot read the planner's history in $planner_repo"
    elif ! to_main="$(gh api "repos/$planner_repo/compare/$pin...main" --jq '"\(.status) \(.ahead_by)"' 2>/dev/null)"; then
      pin_problem="${pin:0:7} is not a commit of $planner_repo"
    elif [[ "${to_main%% *}" == "diverged" || "${to_main%% *}" == "behind" ]]; then
      pin_problem="${pin:0:7} is not on main"
    elif janitor_vs_pin="$(gh api "repos/$planner_repo/compare/$janitor_sha...$pin" --jq .status 2>/dev/null)" &&
      [[ "$janitor_vs_pin" != "identical" && "$janitor_vs_pin" != "ahead" ]]; then
      pin_problem="${pin:0:7} predates the planner change ${janitor_sha:0:7}"
    fi
    if [[ -z "$pin_problem" ]]; then
      printf 'OK     env-janitor: planner pin %s (%s behind main, no planner change since)\n' "${pin:0:7}" "${to_main##* }"
      ok=$((ok + 1))
    else
      drift=$((drift + 1))
      printf 'DRIFT  env-janitor: planner pin: %s\n' "$pin_problem"
      [[ "$mode" == "check" ]] || printf '         review https://github.com/%s/compare/%s...main, then move ref: in %s\n' "$planner_repo" "${pin:0:7}" "$repo"
    fi
  fi

  # One green run shows the App is installed, the secrets resolve and the policy
  # is clean. A red one can also be real policy drift: read the job summary.
  conclusion="$(gh run list --repo "$repo" --workflow environments.yml --limit 1 --json conclusion --jq '.[0].conclusion // "none"' 2>/dev/null)" || conclusion="none"
  if [[ "$conclusion" == "success" ]]; then
    printf 'OK     env-janitor: last run: success\n'
    ok=$((ok + 1))
  else
    drift=$((drift + 1))
    printf 'DRIFT  env-janitor: last run: %s\n' "${conclusion:-in progress}"
    [[ "$mode" == "check" ]] || printf '         dispatch environments.yml with dry_run on and read the job summary: the App installation, a secret or the policy may be the cause\n'
  fi
fi

printf '\n%s ok, %s drift, %s skipped (%s mode)\n' "$ok" "$drift" "$skipped" "$mode"
if [[ "$mode" == "check" && "$drift" -gt 0 ]]; then
  exit 1
fi
