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
# Exit codes: 0 clean (and any --dry-run or --apply run), 1 drift found in
# --check, 2 usage or a missing tool, 3 a call failed, so the result cannot be
# trusted (a scheduled audit must not read that as drift).
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
set -eEuo pipefail
# Any command that stops the script is a failed call, not drift: exit 3, so
# exit 1 means one thing only.
trap 'exit 3' ERR

usage() {
  sed -n '2,26p' "$0" | sed 's/^# \{0,1\}//'
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
# GitHub does not return the merge settings to every caller: with no token every
# key is absent (null), and a read-only token is expected to see the same. That
# is not drift, the setting could not be seen. An admin token sees all of them.
# Assigned first, so a jq failure stops the script instead of reading as zero.
settings_seen="$(jq '[.[] | select(. != null)] | length' <<<"$current")"
if [[ "$settings_seen" -eq 0 ]]; then
  skip "repository settings" "the token cannot see them"
else
  settle "repository settings" "$current" "$desired" PATCH "repos/$repo"
fi

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
# A 404 is read as "off". GitHub also answers a token without admin access with
# 404, so such a token still shows drift. A 403 means the token cannot read the
# setting: say so with SKIP instead of reporting a feature that may well be on
# as drift. Any other failure is a failed call.
security_feature() {
  local label="$1" path="$2" body flag
  if body="$(gh api "repos/$repo/$path" 2>&1)"; then
    flag="$(jq -r 'if type == "object" and has("enabled") then .enabled else true end' <<<"${body:-null}" 2>/dev/null || echo true)"
  elif grep -q 'HTTP 404' <<<"$body"; then
    flag=false
  elif grep -q 'HTTP 403' <<<"$body"; then
    skip "$label" "the token cannot read it, HTTP 403"
    return 0
  else
    printf '%s\n' "$body" >&2
    exit 3
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
    exit 3
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
    bypass_hidden="$(jq '.bypass_actors == null' <<<"$current")"
    if [[ "$bypass_hidden" == "true" ]]; then
      # GitHub does not show the bypass actors to every caller. Compare the rest,
      # which such a token does see, and say what was not seen. The body stays
      # the full blueprint ruleset, as for an admin. A PUT needs admin access,
      # and an admin sees the bypass actors, so --apply never takes this branch.
      skip "ruleset: $name: bypass actors" "the token cannot see them"
      settle "ruleset: $name" "$(jq -S 'del(.bypass_actors)' <<<"$current")" "$(jq -S 'del(.bypass_actors)' <<<"$desired")" PUT "repos/$repo/rulesets/$id" "$desired"
    else
      settle "ruleset: $name" "$current" "$desired" PUT "repos/$repo/rulesets/$id"
    fi
  fi
done

# --- labels (created when missing; an existing label is never rewritten) ------
# Listing labels needs Issues or Pull requests read, which a read-only App token
# may not have on a private repository: say so with SKIP instead of stopping.
labels_source="$here/labels.json"
if ! have="$(gh label list --repo "$repo" --limit 200 --json name --jq '.[].name' 2>&1)"; then
  # Only a 403 means the token lacks the permission. Any other failure (a 5xx,
  # a rate limit, the network) is a failed call, not a skipped item.
  if grep -q 'HTTP 403' <<<"$have"; then
    skip "labels" "cannot list labels (the token needs Issues or Pull requests read)"
    labels_source=/dev/null
  else
    printf '%s\n' "$have" >&2
    exit 3
  fi
fi
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
done < <(jq -c '.[]' "$labels_source")

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

report_file "CODEOWNERS" "start from blueprint/files/CODEOWNERS; the main ruleset requires a code-owner approval" \
  .github/CODEOWNERS CODEOWNERS docs/CODEOWNERS
report_file "security policy" "start from blueprint/files/SECURITY.md, with an absolute advisory URL; the org default has no link, so a repository inheriting it scores 4 on Scorecard's Security-Policy" \
  SECURITY.md .github/SECURITY.md docs/SECURITY.md
report_file "Gitleaks config" "copy blueprint/files/gitleaks.toml" .gitleaks.toml
report_file "line endings" "copy blueprint/files/gitattributes" .gitattributes
report_file "editor config" "copy blueprint/files/editorconfig" .editorconfig
report_file "REUSE" "start from blueprint/files/REUSE.toml and add LICENSES/" REUSE.toml
report_file "dependency review config" "copy blueprint/files/dependency-review-config.yml: the Dependency Review workflow reads it, and fails without it" .github/dependency-review-config.yml

# report_placeholders LABEL STARTER HINT PATH...: DRIFT when the first PATH that
# exists still carries a prompt from blueprint/files/STARTER, which means the
# starter was copied and never filled in. SKIP when no PATH exists, because
# report_file already says so. The phrases come from the starter itself, see
# bin/lib/leftover-placeholders.sh.
report_placeholders() {
  local label="$1" starter="$2" hint="$3" path text="" left rc=0
  shift 3
  # `|| true`: file_content fails on a missing file, and an assignment that fails
  # would trip this script's ERR trap (exit 3, "could not be checked").
  for path in "$@"; do
    text="$(file_content "$path" || true)"
    [[ -n "$text" ]] && break
  done
  if [[ -z "$text" ]]; then
    skip "$label" "no $*"
    return
  fi
  left="$("$here/../bin/lib/leftover-placeholders.sh" "$here/files/$starter" <<<"$text")" || rc=$?
  [[ "$rc" -le 1 ]] || {
    printf 'error: leftover-placeholders.sh failed for %s (exit %s)\n' "$starter" "$rc" >&2
    exit 3
  }
  if [[ "$rc" -eq 0 ]]; then
    printf 'OK     %s: %s\n' "$label" "$path"
    ok=$((ok + 1))
  else
    drift=$((drift + 1))
    printf 'DRIFT  %s: %s still has %s unfilled prompt(s), the first is "%s"\n' "$label" "$path" "$(grep -c . <<<"$left")" "${left%%$'\n'*}"
    [[ "$mode" == "check" ]] || printf '         needs a commit in %s: %s\n' "$repo" "$hint"
  fi
}

report_placeholders "security policy: placeholders" SECURITY.md "fill in every {...} prompt and delete the starter comment: blueprint/files/SECURITY.md says what each one asks for" \
  SECURITY.md .github/SECURITY.md docs/SECURITY.md
report_placeholders "README: placeholders" README.md "fill in every {...} prompt: blueprint/files/README.md says what each one asks for" README.md

# --- tracking (blueprint/tracking.md) -----------------------------------------
report_file "roadmap" "start from blueprint/files/ROADMAP.md; blueprint/tracking.md says what each section holds" \
  ROADMAP.md docs/ROADMAP.md
report_file "decision records" "start from blueprint/files/decisions/; .github keeps its decisions in knowledge/" \
  docs/decisions/README.md knowledge/README.md

# The sections and the `reviewed:` date are read by bin/lib/roadmap.mjs, the one
# parser the tests cover. With no ROADMAP the `roadmap` item above already says
# so, and this one is skipped rather than counted twice. Age is not judged here:
# the docs kit reports a page that has not been reviewed for 180 days.
roadmap_text="$(file_content ROADMAP.md || true)"
[[ -n "$roadmap_text" ]] || roadmap_text="$(file_content docs/ROADMAP.md || true)"
if [[ -z "$roadmap_text" ]]; then
  skip "roadmap: sections" "no ROADMAP.md to read"
elif ! command -v node >/dev/null 2>&1; then
  skip "roadmap: sections" "node is not installed"
else
  roadmap_code=0
  roadmap_problems="$(node "$here/../bin/lib/roadmap.mjs" --today "$(date -u +%Y-%m-%d)" <<<"$roadmap_text")" || roadmap_code=$?
  if [[ "$roadmap_code" -eq 0 ]]; then
    printf 'OK     roadmap: sections\n'
    ok=$((ok + 1))
  elif [[ "$roadmap_code" -eq 1 ]]; then
    drift=$((drift + 1))
    printf 'DRIFT  roadmap: sections: %s\n' "$(paste -sd';' - <<<"$roadmap_problems" | sed 's/;/; /g')"
    [[ "$mode" == "check" ]] || printf '         needs a commit in %s: see blueprint/tracking.md for the five sections and the reviewed date\n' "$repo"
  else
    printf 'roadmap: sections: the parser failed (exit %s)\n' "$roadmap_code" >&2
    exit 3
  fi
fi

# A repository with any file in .github/ISSUE_TEMPLATE gets none of the org's
# forms, not even the ones it has no copy of. .github is where the defaults
# live, so it is the one repository that has the folder.
if [[ "${repo#*/}" == ".github" ]]; then
  skip "issue forms: org defaults" "this repository holds the org defaults"
elif gh api "repos/$repo/contents/.github/ISSUE_TEMPLATE" >/dev/null 2>&1; then
  drift=$((drift + 1))
  printf 'DRIFT  issue forms: org defaults: .github/ISSUE_TEMPLATE hides every org issue form\n'
  [[ "$mode" == "check" ]] || printf '         needs a commit in %s: delete .github/ISSUE_TEMPLATE so the org forms apply (Bug, Feature and Task types, and the Project)\n' "$repo"
else
  printf 'OK     issue forms: org defaults\n'
  ok=$((ok + 1))
fi

# A local pull request template replaces the org's, the way a local issue form
# does. Some repositories need their own checks, so a local template is allowed
# as long as it keeps the three items the org's carries: the sign-off, the
# Conventional Commit title and the regression test. Several templates in
# .github/PULL_REQUEST_TEMPLATE/ also replace it. Report only.
check_pr_template() {
  local path text="" missing=""
  if [[ "${repo#*/}" == ".github" ]]; then
    skip "pull request template: org checklist" "this repository holds the org defaults"
    return
  fi
  for path in .github/pull_request_template.md .github/PULL_REQUEST_TEMPLATE.md pull_request_template.md PULL_REQUEST_TEMPLATE.md docs/pull_request_template.md docs/PULL_REQUEST_TEMPLATE.md; do
    text="$(file_content "$path" || true)"
    [[ -z "$text" ]] || break
  done
  if [[ -z "$text" ]]; then
    if gh api "repos/$repo/contents/.github/PULL_REQUEST_TEMPLATE" >/dev/null 2>&1; then
      drift=$((drift + 1))
      printf 'DRIFT  pull request template: org checklist: .github/PULL_REQUEST_TEMPLATE/ replaces the org template\n'
      [[ "$mode" == "check" ]] || printf '         needs a commit in %s: use one .github/pull_request_template.md that keeps the org checklist, or delete the folder\n' "$repo"
    else
      printf 'OK     pull request template: org checklist: the org template applies\n'
      ok=$((ok + 1))
    fi
    return
  fi
  grep -Eqi 'git commit -s' <<<"$text" || missing+="the sign-off, "
  grep -Eqi 'Conventional Commit' <<<"$text" || missing+="the Conventional Commit title, "
  grep -Eqi 'regression test' <<<"$text" || missing+="the regression test, "
  if [[ -z "$missing" ]]; then
    printf 'OK     pull request template: org checklist: the local template keeps it\n'
    ok=$((ok + 1))
  else
    drift=$((drift + 1))
    printf 'DRIFT  pull request template: org checklist: the local template lacks %s\n' "${missing%, }"
    [[ "$mode" == "check" ]] || printf '         needs a commit in %s: copy those lines from the org template, or delete the local one\n' "$repo"
  fi
}
check_pr_template

# Compiled output is not source: a committed dist/ goes stale against src/ and
# cannot be reviewed as a diff (OpenSSF Baseline OSPS-QA-05.01 names generated
# executable artifacts). Release assets and the package are built in CI. Report only.
check_committed_dist() {
  if gh api "repos/$repo/contents/dist" >/dev/null 2>&1; then
    drift=$((drift + 1))
    printf 'DRIFT  build output: dist not committed: dist/ is in the repository\n'
    [[ "$mode" == "check" ]] || printf '         needs a commit in %s: git rm -r dist, add it to .gitignore, and build it in CI\n' "$repo"
  else
    printf 'OK     build output: dist not committed\n'
    ok=$((ok + 1))
  fi
}
check_committed_dist

# The checks below look for the control, not a file name: a repository may run
# it from its own workflow (for example a `reuse lint` step inside `verify.yml`)
# and a second copy of the template would only duplicate it.
workflows_text=""
workflow_names=""
scancode_wf=""
while IFS= read -r wf; do
  wf_text="$(file_content ".github/workflows/$wf" || true)"
  workflows_text+="$wf_text"$'\n'
  workflow_names+="$wf"$'\n'
  # The workflow that runs ScanCode, for `ScanCode: last run`.
  if [[ -z "$scancode_wf" ]] && grep -q 'aboutcode-org/scancode-action' <<<"$wf_text"; then
    scancode_wf="$wf"
  fi
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
report_workflow "ScanCode check" "copy workflow-templates/scancode.yml with blueprint/files/policies.yml and scancode-config.yml" \
  'aboutcode-org/scancode-action'
report_workflow "DCO check" "copy workflow-templates/dco.yml, or check Signed-off-by from a workflow that already runs" \
  'Signed-off-by'
report_workflow "commit lint" "copy workflow-templates/commit-lint.yml, or check Conventional Commits from a workflow that already runs under the job name Commit lint" \
  'name: Commit lint'
report_workflow "PR labeler" "copy workflow-templates/labeler.yml and start .github/labeler.yml from blueprint/files/labeler.yml" \
  'actions/labeler'

# ScanCode is not a required check (the action is beta), so a red run on main
# blocks no merge and nobody reads it: main stayed red for days that way. Report
# the last push run, the way `env-janitor: last run` does. Report only.
check_scancode_last_run() {
  local state
  if [[ -z "$scancode_wf" ]]; then
    skip "ScanCode: last run" "no workflow runs aboutcode-org/scancode-action"
    return
  fi
  state="$(gh run list --repo "$repo" --workflow "$scancode_wf" --event push --limit 1 --json status,conclusion \
    --jq '.[0] | if . == null then "none" elif .status != "completed" then "in progress" else .conclusion end' 2>/dev/null)" || state="none"
  case "$state" in
    success)
      printf 'OK     ScanCode: last run: success\n'
      ok=$((ok + 1))
      ;;
    "in progress")
      skip "ScanCode: last run" "a run is in progress"
      ;;
    *)
      drift=$((drift + 1))
      printf 'DRIFT  ScanCode: last run: %s\n' "${state:-none}"
      [[ "$mode" == "check" ]] || printf '         open the run of %s on main: a license named only as data goes in scancode-config.yml by exact path\n' "$scancode_wf"
      ;;
  esac
}
check_scancode_last_run

# Claude Code plugin rules (blueprint/README.md, "Claude Code plugins"). A plugin
# is a repository with .claude-plugin/plugin.json; any other repository skips.
# Report only.
check_plugin_rules() {
  if [[ -z "$(file_content .claude-plugin/plugin.json || true)" ]]; then
    skip "plugin: rules" "no .claude-plugin/plugin.json"
    return
  fi
  report_workflow "plugin: validate" "run claude plugin validate --strict . from a workflow that already runs (the repository's verify), see Claude Code plugins in blueprint/README.md" \
    'claude plugin validate( [^#]*)?--strict'
  report_workflow "plugin: metadata check" "copy blueprint/files/check-plugin-metadata.mjs to tools/ci/ (not bin/: a plugin's own bin/ is put on the Bash tool's PATH) and run it from the repository's verify, see Claude Code plugins in blueprint/README.md" \
    'check-plugin-metadata\.mjs'
  if [[ -n "$(file_content CLAUDE.md || true)" ]]; then
    drift=$((drift + 1))
    printf 'DRIFT  plugin: root CLAUDE.md: CLAUDE.md sits at the plugin root\n'
    [[ "$mode" == "check" ]] || printf '         needs a commit in %s: move it to .claude/CLAUDE.md, because validate --strict warns about it and Claude Code does not load it from a plugin\n' "$repo"
  else
    printf 'OK     plugin: root CLAUDE.md: none\n'
    ok=$((ok + 1))
  fi
  if [[ -n "$(file_content .claude-plugin/marketplace.json || true)" ]]; then
    drift=$((drift + 1))
    printf 'DRIFT  plugin: marketplace.json: the plugin repository ships its own marketplace\n'
    [[ "$mode" == "check" ]] || printf '         needs a commit in %s: delete it and list the plugin in monte3l/m3l-plugins, one marketplace gives one install id per plugin\n' "$repo"
  else
    printf 'OK     plugin: marketplace.json: none\n'
    ok=$((ok + 1))
  fi
}
check_plugin_rules

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

# --- REUSE API and OpenSSF Best Practices (report only; public repositories) ---
# Both are registrations on a service outside GitHub, so no API call here can
# fix them: an Owner registers the repository, and for OpenSSF someone answers
# the criteria on bestpractices.dev. A service that cannot be reached is a
# SKIP, not drift, so an outage never fails a run.
if [[ "$private" == "true" ]]; then
  skip "REUSE API" "private repository"
  skip "OpenSSF Best Practices" "private repository"
elif ! command -v curl >/dev/null; then
  skip "REUSE API" "curl is not installed"
  skip "OpenSSF Best Practices" "curl is not installed"
else
  # REUSE API: the README badge only resolves once the repository is registered
  # and has been checked at least once.
  reuse_reply="$(curl -sS --max-time 20 -w '\n%{http_code}' "https://api.reuse.software/status/github.com/$repo" 2>/dev/null || true)"
  reuse_code="${reuse_reply##*$'\n'}"
  reuse_json="${reuse_reply%$'\n'*}"
  case "$reuse_code" in
    200)
      reuse_status="$(jq -r '.status // "unknown"' <<<"$reuse_json" 2>/dev/null || echo unknown)"
      if [[ "$reuse_status" == "compliant" ]]; then
        printf 'OK     REUSE API: compliant\n'
        ok=$((ok + 1))
      else
        drift=$((drift + 1))
        printf 'DRIFT  REUSE API: status is %s\n' "$reuse_status"
        [[ "$mode" == "check" ]] || printf '         an "uninitialised" repository was registered but never checked; otherwise run reuse lint and open https://api.reuse.software/info/github.com/%s\n' "$repo"
      fi
      ;;
    404)
      drift=$((drift + 1))
      printf 'DRIFT  REUSE API: not registered at api.reuse.software\n'
      [[ "$mode" == "check" ]] || printf '         an Owner registers it at https://api.reuse.software/register\n'
      ;;
    *) skip "REUSE API" "api.reuse.software unreachable" ;;
  esac

  # OpenSSF Best Practices: the project is found by the badge in the README, and
  # openssf.json holds the level to reach and the repositories exempt from it.
  bp_exempt="$(jq -r --arg name "${repo##*/}" '.exempt[$name] // empty' "$here/openssf.json")"
  if [[ -n "$bp_exempt" ]]; then
    skip "OpenSSF Best Practices" "$bp_exempt"
  else
    bp_readme=""
    for readme_path in README.md readme.md .github/README.md docs/README.md; do
      bp_readme="$(file_content "$readme_path" || true)"
      [[ -z "$bp_readme" ]] || break
    done
    bp_id="$(grep -oE 'bestpractices\.dev/projects/[0-9]+' <<<"$bp_readme" | head -n 1 | grep -oE '[0-9]+$' || true)"
    bp_level_min="$(jq -r .minimum.level "$here/openssf.json")"
    bp_baseline_min="$(jq -r .minimum.baseline "$here/openssf.json")"
    if [[ -z "$bp_id" ]]; then
      drift=$((drift + 1))
      printf 'DRIFT  OpenSSF Best Practices: the README has no bestpractices.dev badge\n'
      [[ "$mode" == "check" ]] || printf '         register the project at https://www.bestpractices.dev and add both badges to the README\n'
    else
      bp_reply="$(curl -sS --max-time 20 -w '\n%{http_code}' "https://www.bestpractices.dev/projects/$bp_id.json" 2>/dev/null || true)"
      bp_code="${bp_reply##*$'\n'}"
      bp_json="${bp_reply%$'\n'*}"
      case "$bp_code" in
        200)
          # A reply of another shape (an error page that is still JSON) is a
          # SKIP too: the summary below must never run on it, or set -e would
          # end the whole run.
          if bp_summary="$(jq -r --arg min "$bp_level_min" --argjson baseline "$bp_baseline_min" '
            def rank: {in_progress: 0, passing: 1, silver: 2, gold: 3}[.] // 0;
            if (type == "object" and ((.badge_level // "in_progress") | type) == "string") then
              (.badge_level // "in_progress") as $level
              | (.["badge_percentage_baseline_\($baseline)"] // 0) as $base
              | [(if ($level | rank) >= ($min | rank) then "ok" else "low" end),
                 "\($level), Baseline \($baseline) at \($base)%"] | @tsv
            else error("unexpected reply") end' <<<"$bp_json" 2>/dev/null)"; then
            if [[ "${bp_summary%%$'\t'*}" == "ok" && "${bp_summary#*$'\t'}" == *"at 100%" ]]; then
              printf 'OK     OpenSSF Best Practices: %s (project %s)\n' "${bp_summary#*$'\t'}" "$bp_id"
              ok=$((ok + 1))
            else
              drift=$((drift + 1))
              printf 'DRIFT  OpenSSF Best Practices: %s, want %s with Baseline %s at 100%% (project %s)\n' "${bp_summary#*$'\t'}" "$bp_level_min" "$bp_baseline_min" "$bp_id"
              [[ "$mode" == "check" ]] || printf '         answer the open criteria at https://www.bestpractices.dev/projects/%s\n' "$bp_id"
            fi
          else
            skip "OpenSSF Best Practices" "unexpected reply from bestpractices.dev"
          fi
          ;;
        404)
          drift=$((drift + 1))
          printf 'DRIFT  OpenSSF Best Practices: project %s from the README badge does not exist\n' "$bp_id"
          [[ "$mode" == "check" ]] || printf '         fix the project id in the README badges\n'
          ;;
        *) skip "OpenSSF Best Practices" "bestpractices.dev unreachable" ;;
      esac
    fi
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

# Dependabot cannot open a pull request for an npm directory under the
# repository-root .github/: the update job ends at create_pull_request with a
# 400 "invalid or unauthorized changes" (dependabot-core #15237 and #15721).
# A tool folder lives in tools/<name>/ instead (blueprint/README.md, "Tool pins").
if grep -Eq 'directory: *["'\'']?/\.github(/|["'\'']|$)' <<<"$dependabot"; then
  drift=$((drift + 1))
  printf 'DRIFT  Dependabot: an entry points under the root .github/, where Dependabot cannot open pull requests\n'
  [[ "$mode" == "check" ]] || printf '         move the folder to tools/<name>/ in %s and update dependabot.yml\n' "$repo"
else
  printf 'OK     Dependabot: no entry under the root .github/\n'
  ok=$((ok + 1))
fi

# Security updates cover every lockfile, but version updates need an entry: the
# `directory` option is required, and without it Dependabot cannot open a pull
# request. `package-ecosystem: npm` also covers pnpm and yarn lockfiles
# (docs.github.com, Dependabot options reference). A lockfile folder with no npm
# entry is reported, unless blueprint/dependabot-exemptions.json says why the
# repository leaves it out. Report only.
#
# The awk reads `directory:` and `directories:` values of each npm entry. It
# assumes `package-ecosystem` is the first key of an entry, as in every
# repository and in the starter.
check_dependabot_lockfiles() {
  local tree path name dir pattern covered entries missing="" exempt="" reason lock_dirs=""
  tree="$(gh api "repos/$repo/git/trees/HEAD?recursive=1" --jq 'if .truncated then "TRUNCATED" else (.tree[] | select(.type == "blob") | .path) end')"
  # A failed call is not swallowed: it reaches the ERR trap (exit 3, "could not be checked").
  if [[ -z "$tree" || "$tree" == "TRUNCATED" ]]; then
    skip "Dependabot: lockfile folders" "the file list of the repository is empty or too large to read"
    return
  fi
  while IFS= read -r path; do
    name="${path##*/}"
    case "$name" in
      package-lock.json | npm-shrinkwrap.json | pnpm-lock.yaml | yarn.lock) ;;
      *) continue ;;
    esac
    if [[ "$path" == */* ]]; then dir="/${path%/*}"; else dir="/"; fi
    lock_dirs+="$dir"$'\n'
  done <<<"$tree"
  if [[ -z "$lock_dirs" ]]; then
    printf 'OK     Dependabot: lockfile folders: no lockfile\n'
    ok=$((ok + 1))
    return
  fi
  # Read into a variable first: a failure inside `< <(...)` never reaches the ERR trap.
  entries="$(awk '
    /^[[:space:]]*#/ { next }
    { sub(/[[:space:]]+#.*/, "") }
    /^[[:space:]]*-[[:space:]]+package-ecosystem:/ {
      eco = $0; sub(/.*package-ecosystem:[[:space:]]*/, "", eco); gsub(/["\047[:space:]]/, "", eco)
      in_list = 0; next
    }
    /^[[:space:]]*directory:/ {
      v = $0; sub(/.*directory:[[:space:]]*/, "", v); gsub(/["\047[:space:]]/, "", v)
      if (eco == "npm" && v != "") print v
      in_list = 0; next
    }
    /^[[:space:]]*directories:/ { in_list = 1; next }
    in_list && /^[[:space:]]*-[[:space:]]*/ {
      v = $0; sub(/^[[:space:]]*-[[:space:]]*/, "", v); gsub(/["\047[:space:]]/, "", v)
      if (eco == "npm" && v != "") print v
      next
    }
    { in_list = 0 }
  ' <<<"$dependabot")"
  lock_dirs="$(sort -u <<<"$lock_dirs")"
  while IFS= read -r dir; do
    [[ -n "$dir" ]] || continue
    covered=""
    while IFS= read -r pattern; do
      [[ -n "$pattern" ]] || continue
      # An entry is a path, or with `directories` a glob.
      # shellcheck disable=SC2053
      if [[ "$dir" == $pattern ]]; then covered=1; break; fi
    done <<<"$entries"
    [[ -z "$covered" ]] || continue
    reason="$(jq -r --arg repo "${repo#*/}" --arg dir "$dir" '.[$repo][$dir] // empty' "$here/dependabot-exemptions.json")"
    if [[ -n "$reason" ]]; then exempt+="$dir, "; else missing+="$dir, "; fi
  done <<<"$lock_dirs"
  if [[ -n "$missing" ]]; then
    drift=$((drift + 1))
    printf 'DRIFT  Dependabot: lockfile folders: no npm entry for %s\n' "${missing%, }"
    [[ "$mode" == "check" ]] || printf '         add an npm entry per folder to .github/dependabot.yml in %s, or record the reason in blueprint/dependabot-exemptions.json\n' "$repo"
  elif [[ -n "$exempt" ]]; then
    printf 'OK     Dependabot: lockfile folders: %s exempt (blueprint/dependabot-exemptions.json)\n' "${exempt%, }"
    ok=$((ok + 1))
  else
    printf 'OK     Dependabot: lockfile folders\n'
    ok=$((ok + 1))
  fi
}
check_dependabot_lockfiles

# --- docs site (report only; applies only to a repository that has one) ---
# docs.config.mjs is the docs kit's config, so its presence is what makes a
# repository a docs-site repository. Everything here is a commit, never an API
# call, except the homepage, which `gh repo edit --homepage` can set.
docs_config="$(file_content docs.config.mjs || true)"
if [[ -z "$docs_config" ]]; then
  skip "docs site" "no docs.config.mjs"
else
  docs_marker="$(file_content "$marker_path" || true)"
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
  # The gate only proves the docs are well formed. A parity module is what proves
  # they still say what the code does, so a repository without one is reported.
  if "$here/../bin/lib/docs-config-parity.sh" <<<"$docs_config"; then
    printf 'OK     docs site: parity\n'
    ok=$((ok + 1))
  else
    drift=$((drift + 1))
    printf 'DRIFT  docs site: parity: docs.config.mjs lists no parity module, so nothing checks the docs against the code\n'
    [[ "$mode" == "check" ]] || printf '         needs a commit in %s: add scripts/doc-parity.mjs and list it under parity: (design/source/docs-kit/lib/parity.mjs has the helpers)\n' "$repo"
  fi
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

# --- description and topics (report only; applies to a repository in projects.json) ---
# The GitHub description and topics are the repository's public one-liner, so
# they come from blueprint/projects.json, the same file the org site and the
# social cards read. Setting them is a `gh repo edit`, which the script prints
# and never runs, like the homepage above.
project="$(jq -c --arg name "${repo#*/}" '.[] | select(.repo == $name)' "$here/projects.json")"
if [[ -z "$project" ]]; then
  skip "description and topics" "not listed in blueprint/projects.json"
else
  want_description="$(jq -r .description <<<"$project")"
  have_description="$(jq -r '.description // ""' <<<"$live_repo")"
  if [[ "$have_description" == "$want_description" ]]; then
    printf 'OK     repository description\n'
    ok=$((ok + 1))
  else
    drift=$((drift + 1))
    printf 'DRIFT  repository description is "%s", the blueprint says "%s"\n' "$have_description" "$want_description"
    [[ "$mode" == "check" ]] || printf '         gh repo edit %s --description "%s"\n' "$repo" "$want_description"
  fi
  want_topics="$(jq -c '.topics | sort' <<<"$project")"
  have_topics="$(jq -c '(.topics // []) | sort' <<<"$live_repo")"
  if [[ "$have_topics" == "$want_topics" ]]; then
    printf 'OK     repository topics\n'
    ok=$((ok + 1))
  else
    drift=$((drift + 1))
    printf 'DRIFT  repository topics are %s, the blueprint says %s\n' "$have_topics" "$want_topics"
    if [[ "$mode" != "check" ]]; then
      printf '         gh repo edit %s' "$repo"
      jq -r '.topics[] | " --add-topic " + .' <<<"$project" | tr -d '\n'
      printf '\n'
    fi
  fi
fi

# --- release (report only; applies to every repository not exempt in release.json) ---
# The standard is the shared release workflows, so a repository either calls
# them from its own release.yml or is listed as exempt with a reason. The
# configuration is a commit, never an API call. The exempt list is data here
# because "which repositories publish releases" is an org decision, not
# something a file in the repository can declare for itself.
# report_release_app: the release App checks. Called for every repository that
# releases and for each one release.json lists under "appUsers", a repository
# that publishes no release but still opens pull requests as the App.
report_release_app() {
  # The release App makes the release pull request and the tag, so a repository
  # needs to be in its installation and to be able to read its two secrets. A
  # repository that is not fails its first release at "make a token", with an
  # error that names neither. Report only, never applied: the private key can
  # mint a token for every repository in the installation, so sharing it with a
  # repository is an Owner's decision, unlike the env-janitor key.
  release_app="$(jq -r .app "$here/release.json")"
  release_owner="${repo%%/*}"
  release_repo_id="$(jq -r .id <<<"$live_repo")"
  if install_id="$(gh api "orgs/$release_owner/installations" --jq ".installations[] | select(.app_slug == \"$release_app\") | .id" 2>/dev/null)" &&
    [[ -n "$install_id" ]] &&
    install_repos="$(gh api --paginate "user/installations/$install_id/repositories" --jq '.repositories[].full_name' 2>/dev/null)"; then
    if grep -Fxq -- "$repo" <<<"$install_repos"; then
      printf 'OK     release: app installation: %s\n' "$release_app"
      ok=$((ok + 1))
    else
      drift=$((drift + 1))
      printf 'DRIFT  release: app installation: %s is not installed on %s\n' "$release_app" "$repo"
      [[ "$mode" == "check" ]] || printf '         add it in the %s installation settings of the organization\n' "$release_app"
    fi
  else
    skip "release: app installation" "cannot read the $release_app installation (needs admin:org and a token that may list it)"
  fi
  release_secret_problems=""
  release_unshared=()
  while IFS= read -r secret; do
    if ! visibility="$(gh api "orgs/$release_owner/actions/secrets/$secret" --jq .visibility 2>/dev/null)"; then
      release_secret_problems+="$secret cannot be read (missing, or the token lacks admin:org); "
    elif [[ "$visibility" == "selected" ]]; then
      if ! shared_ids="$(gh api --paginate "orgs/$release_owner/actions/secrets/$secret/repositories" --jq '.repositories[].id' 2>/dev/null)"; then
        release_secret_problems+="$secret's repository list cannot be read; "
      elif ! grep -Fxq -- "$release_repo_id" <<<"$shared_ids"; then
        release_secret_problems+="$secret is not shared with $repo; "
        release_unshared+=("$secret")
      fi
    elif [[ "$visibility" == "private" && "$private" != "true" ]]; then
      release_secret_problems+="$secret is visible to private repositories only; "
    fi
  done < <(jq -r '.secrets[]' "$here/release.json")
  if [[ -z "$release_secret_problems" ]]; then
    printf 'OK     release: app secrets: readable by this repository\n'
    ok=$((ok + 1))
  else
    drift=$((drift + 1))
    printf 'DRIFT  release: app secrets: %s\n' "${release_secret_problems%; }"
    if [[ "$mode" != "check" ]]; then
      for secret in ${release_unshared[@]+"${release_unshared[@]}"}; do
        printf '         an Owner shares it: gh api -X PUT orgs/%s/actions/secrets/%s/repositories/%s\n' "$release_owner" "$secret" "$release_repo_id"
      done
    fi
  fi
}

release_exempt="$(jq -r --arg name "${repo##*/}" '.exempt[$name] // empty' "$here/release.json")"
if [[ -n "$release_exempt" ]]; then
  skip "release" "$release_exempt"
  if jq -e --arg name "${repo##*/}" '.appUsers | index($name) != null' "$here/release.json" >/dev/null; then
    report_release_app
  fi
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
  # A pin must be a commit of the shared repository's default branch. One that
  # only lived on a pull request branch (a squash merge drops it) still
  # resolves for a while, then fails every release of every repository that
  # copied it. `compare` says `ahead` or `identical` when the pin is an
  # ancestor of main, and `diverged` or `behind` when it is not.
  shared_repo="${release_prepare%%/.github/workflows/*}"
  release_pins="$(grep -Eo "(${release_prepare//./\\.}|${release_finalize//./\\.})@[0-9a-f]{40}" <<<"$workflows_text" | sed 's/.*@//' | sort -u || true)"
  if [[ -z "$release_pins" ]]; then
    skip "release: workflow pin" "no release workflow call pinned by SHA"
  else
    pin_problem=""
    pin_short=""
    while IFS= read -r pin; do
      pin_short+="${pin:0:7} "
      if ! pin_status="$(gh api "repos/$shared_repo/compare/$pin...main" --jq .status 2>/dev/null)"; then
        pin_problem="${pin:0:7} is not a commit of $shared_repo"
      elif [[ "$pin_status" != "ahead" && "$pin_status" != "identical" ]]; then
        pin_problem="${pin:0:7} is not on the main branch of $shared_repo ($pin_status)"
      fi
    done <<<"$release_pins"
    if [[ -z "$pin_problem" ]]; then
      printf 'OK     release: workflow pin %s\n' "${pin_short% }"
      ok=$((ok + 1))
    else
      drift=$((drift + 1))
      printf 'DRIFT  release: workflow pin: %s\n' "$pin_problem"
      [[ "$mode" == "check" ]] || printf '         move the pin in %s to a commit of %s main\n' "$repo" "$shared_repo"
    fi
    # A pin that is on main can still miss a later change to the shared workflows,
    # and nothing moves it: this repository has no tags for Dependabot to follow.
    # bin/lib/release-pin-age.sh compares each pin with the newest commit that
    # touched either shared file. Skipped when a pin itself is wrong, which the
    # item above reports.
    if [[ -z "$pin_problem" ]]; then
      pin_list=()
      while IFS= read -r pin; do pin_list+=("$pin"); done <<<"$release_pins"
      age_rc=0
      age_out="$("$here/../bin/lib/release-pin-age.sh" "$shared_repo" "${release_prepare#"$shared_repo"/}" "${release_finalize#"$shared_repo"/}" "${pin_list[@]}")" || age_rc=$?
      if [[ "$age_rc" -eq 0 ]]; then
        printf 'OK     release: workflow pin age %s\n' "${age_out:0:7}"
        ok=$((ok + 1))
      elif [[ "$age_rc" -eq 1 ]]; then
        drift=$((drift + 1))
        age_newest="${age_out##* }"
        printf 'DRIFT  release: workflow pin age: %s predates the change %s to the shared release workflows\n' "${age_out:0:7}" "${age_newest:0:7}"
        [[ "$mode" == "check" ]] || printf '         review https://github.com/%s/compare/%s...main, then move the pin in %s\n' "$shared_repo" "${age_out:0:7}" "$repo"
      elif [[ "$age_rc" -eq 4 ]]; then
        skip "release: workflow pin age" "cannot read the history of the shared release workflows"
      else
        printf 'error: release-pin-age.sh failed (exit %s)\n' "$age_rc" >&2
        exit 3
      fi
    fi
  fi
  report_release_app
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

# --- env-janitor (applied: the environment, its branch policy, dropping the org-secret share) ---
# Only a repository with .github/environments.json runs the weekly cleanup. The
# App installation and the secrets themselves are never touched here: installing
# an App is an org setting, and a secret needs key material this script does not
# hold. The pinned planner commit and the last run only report.

# The planner's import graph in m3l-groundwork. A commit touching any of these
# changes what a consuming repository's pin runs. Keep it in step with the
# imports of bin/cleanup-environments.mjs.
janitor_files=(bin/cleanup-environments.mjs bin/lib/environment-cleanup.mjs bin/lib/report.mjs bin/lib/term.mjs)
IFS=' ' read -r -a janitor_secrets <<<"$(jq -r '.environments["env-janitor"] | join(" ")' "$here/env-secrets.json")"
janitor_env="env-janitor"
planner_repo="monte3l/m3l-groundwork"
owner="${repo%%/*}"
repo_id="$(jq -r .id <<<"$live_repo")"

# env_secret_state ENV SECRET...: reads names and sharing, never values. Sets
#   es_missing        secrets the environment does not hold (a 404 means it has none)
#   es_shared         organization secrets shared with this repository
#   es_all            organization secrets whose visibility is not "selected"
#   es_unreadable     the environment's secrets could not be read
#   es_org_unreadable an organization secret could not be read (not a 404)
# Each is a space-separated list or empty.
env_secret_state() {
  local env="$1" secret out ids held=""
  shift
  es_missing="" es_shared="" es_all="" es_unreadable="" es_org_unreadable=""
  if out="$(gh api "repos/$repo/environments/$env/secrets" --jq '.secrets[].name' 2>&1)"; then
    held="$out"
  elif ! grep -q 'HTTP 404' <<<"$out"; then
    es_unreadable=1
  fi
  for secret in "$@"; do
    grep -Fxq -- "$secret" <<<"$held" || es_missing+="$secret "
    if out="$(gh api "orgs/$owner/actions/secrets/$secret" --jq .visibility 2>&1)"; then
      # Only "selected" has a repository list. "all" and "private" reach this repository without being on
      # one, and a value this script does not know is not safe to assume narrow: all three are drift.
      if [[ "$out" != "selected" ]]; then
        es_all+="$secret "
      elif ! ids="$(gh api --paginate "orgs/$owner/actions/secrets/$secret/repositories" --jq '.repositories[].id' 2>/dev/null)"; then
        es_org_unreadable=1
      elif grep -Fxq -- "$repo_id" <<<"$ids"; then
        es_shared+="$secret "
      fi
    elif ! grep -q 'HTTP 404' <<<"$out"; then
      es_org_unreadable=1
    fi
  done
}

# drop_org_shares SECRET...: removes this repository from each organization
# secret's list (an org-level write), or says it would.
drop_org_shares() {
  local secret
  for secret in "$@"; do
    case "$mode" in
      dry-run) printf '         would run: gh api -X DELETE orgs/%s/actions/secrets/%s/repositories/%s\n' "$owner" "$secret" "$repo_id" ;;
      apply)
        gh api -X DELETE "orgs/$owner/actions/secrets/$secret/repositories/$repo_id" >/dev/null
        printf '         applied: %s\n' "$secret"
        ;;
    esac
  done
}

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
  # The secrets are only as narrow as the environment: held in one open to any branch they are no better
  # than an organization secret, so they are not reported as in order then.
  env_locked=""
  if [[ "$policies" == '["main"]' && "$(jq -S . <<<"$current")" == "$(jq -S . <<<"$desired")" ]]; then env_locked=1; fi
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

  # The two secrets live in the environment, not in the organization: an
  # organization secret reaches every workflow on every branch, an environment
  # secret only a job on main in that environment. The check reads names only.
  env_secret_state "$janitor_env" "${janitor_secrets[@]}"
  if [[ -n "$es_unreadable" ]]; then
    skip "env-janitor: environment secrets" "cannot read them (the token needs Environments read)"
  elif [[ -z "$es_missing" && -z "$env_locked" ]]; then
    drift=$((drift + 1))
    printf 'DRIFT  env-janitor: environment secrets: held, but the environment is not limited to main\n'
  elif [[ -z "$es_missing" ]]; then
    printf 'OK     env-janitor: environment secrets\n'
    ok=$((ok + 1))
  else
    drift=$((drift + 1))
    printf 'DRIFT  env-janitor: environment secrets: %snot set\n' "$es_missing"
    if [[ "$mode" != "check" ]]; then
      for secret in $es_missing; do
        printf '         bin/env-secrets.sh set %s --repo %s\n' "$secret" "$repo"
      done
    fi
  fi

  # An organization secret that still names this repository defeats the
  # environment copy. --apply removes the repository from its list, and only
  # when the environment already holds the secret: it never leaves the job
  # without one. It never creates or deletes a secret.
  if [[ -n "$es_org_unreadable" ]]; then
    skip "env-janitor: org secrets" "cannot read them (the token needs admin:org)"
  elif [[ -z "$es_shared$es_all" ]]; then
    printf 'OK     env-janitor: org secrets\n'
    ok=$((ok + 1))
  else
    drift=$((drift + 1))
    printf 'DRIFT  env-janitor: org secrets: %s%sstill reach this repository\n' "$es_shared" "$es_all"
    [[ -z "$es_all" ]] || printf '         %snot limited to selected repositories: narrow them by hand\n' "$es_all"
    if [[ "$mode" != "check" && -n "$es_shared" ]]; then
      if [[ -n "$es_missing" ]]; then
        printf '         not removed: set the environment secrets first\n'
      else
        # shellcheck disable=SC2086 # a space-separated list of names, split on purpose
        drop_org_shares $es_shared
      fi
    fi
  fi

  # Only environments.yml may name them: no other workflow should declare that
  # it needs the janitor App's key.
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
  env_wf="$(file_content .github/workflows/environments.yml || true)"
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

# --- docs-cloudflare (reported; --apply drops the org share once the environment holds the secrets) ---
# Only a repository whose deploy runs in the docs-cloudflare environment. The
# environment itself is not created here: new-repo.sh and the docs runbook do.
IFS=' ' read -r -a cloudflare_secrets <<<"$(jq -r '.environments["docs-cloudflare"] | join(" ")' "$here/env-secrets.json")"
cloudflare_env="docs-cloudflare"
if ! gh api "repos/$repo/environments/$cloudflare_env" >/dev/null 2>&1; then
  skip "docs-cloudflare" "no $cloudflare_env environment"
else
  # The environment only scopes the deploy to main (the job's `url` is set in the workflow, not here), so
  # replacing its settings with PUT loses nothing. The check reads the environment it just found.
  desired='{"deployment_branch_policy":{"protected_branches":false,"custom_branch_policies":true}}'
  if live="$(gh api "repos/$repo/environments/$cloudflare_env" 2>/dev/null)"; then :; else live='{}'; fi
  current="$(jq -c '{deployment_branch_policy: (.deployment_branch_policy // null)}' <<<"$live")"
  settle "docs-cloudflare: environment" "$current" "$desired" PUT "repos/$repo/environments/$cloudflare_env"

  # Missing main is added. Extra policies are reported and never removed.
  if policies="$(gh api "repos/$repo/environments/$cloudflare_env/deployment-branch-policies" --jq '[.branch_policies[].name]' 2>/dev/null)"; then :; else policies='[]'; fi
  policies="$(jq -c . <<<"$policies")"
  env_locked=""
  if [[ "$policies" == '["main"]' && "$(jq -S . <<<"$current")" == "$(jq -S . <<<"$desired")" ]]; then env_locked=1; fi
  if [[ "$policies" == '["main"]' ]]; then
    printf 'OK     docs-cloudflare: branch policy: main only\n'
    ok=$((ok + 1))
  else
    drift=$((drift + 1))
    printf 'DRIFT  docs-cloudflare: branch policy: %s, want ["main"]\n' "$policies"
    if jq -e 'index("main") != null' <<<"$policies" >/dev/null; then
      [[ "$mode" == "check" ]] || printf '         extra policies are never removed here: delete them by hand in %s\n' "$repo"
    else
      case "$mode" in
        dry-run) printf '         would run: gh api -X POST repos/%s/environments/%s/deployment-branch-policies -f name=main\n' "$repo" "$cloudflare_env" ;;
        apply)
          gh api -X POST "repos/$repo/environments/$cloudflare_env/deployment-branch-policies" -f name=main >/dev/null
          printf '         applied\n'
          ;;
      esac
    fi
  fi

  env_secret_state "$cloudflare_env" "${cloudflare_secrets[@]}"
  if [[ -n "$es_unreadable" ]]; then
    skip "docs-cloudflare: environment secrets" "cannot read them (the token needs Environments read)"
  elif [[ -z "$es_missing" && -z "$env_locked" ]]; then
    drift=$((drift + 1))
    printf 'DRIFT  docs-cloudflare: environment secrets: held, but the environment is not limited to main\n'
  elif [[ -z "$es_missing" ]]; then
    printf 'OK     docs-cloudflare: environment secrets\n'
    ok=$((ok + 1))
  else
    drift=$((drift + 1))
    printf 'DRIFT  docs-cloudflare: environment secrets: %snot set\n' "$es_missing"
    if [[ "$mode" != "check" ]]; then
      for secret in $es_missing; do
        printf '         bin/env-secrets.sh set %s --repo %s\n' "$secret" "$repo"
      done
    fi
  fi

  if [[ -n "$es_org_unreadable" ]]; then
    skip "docs-cloudflare: org secrets" "cannot read them (the token needs admin:org)"
  elif [[ -z "$es_shared$es_all" ]]; then
    printf 'OK     docs-cloudflare: org secrets\n'
    ok=$((ok + 1))
  else
    drift=$((drift + 1))
    printf 'DRIFT  docs-cloudflare: org secrets: %s%sstill reach this repository\n' "$es_shared" "$es_all"
    [[ -z "$es_all" ]] || printf '         %snot limited to selected repositories: narrow them by hand\n' "$es_all"
    if [[ "$mode" != "check" && -n "$es_shared" ]]; then
      if [[ -n "$es_missing" ]]; then
        printf '         not removed: set the environment secrets first\n'
      else
        # shellcheck disable=SC2086 # a space-separated list of names, split on purpose
        drop_org_shares $es_shared
      fi
    fi
  fi

  # Only docs.yml may name them: an environment secret is read by a job in the
  # environment, and no other workflow should declare that it needs one.
  stray=""
  while IFS= read -r wf; do
    [[ -n "$wf" && "$wf" != "docs.yml" ]] || continue
    if grep -q 'CLOUDFLARE_API_TOKEN\|CLOUDFLARE_ACCOUNT_ID' <<<"$(file_content ".github/workflows/$wf")"; then
      stray+="$wf "
    fi
  done <<<"$workflow_names"
  if [[ -z "$stray" ]]; then
    printf 'OK     docs-cloudflare: secret references: only docs.yml\n'
    ok=$((ok + 1))
  else
    drift=$((drift + 1))
    printf 'DRIFT  docs-cloudflare: secret references: %sname the Cloudflare secrets\n' "$stray"
    [[ "$mode" == "check" ]] || printf '         move the use into docs.yml\n'
  fi
fi

printf '\n%s ok, %s drift, %s skipped (%s mode)\n' "$ok" "$drift" "$skipped" "$mode"
if [[ "$mode" == "check" && "$drift" -gt 0 ]]; then
  exit 1
fi
