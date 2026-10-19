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
# which is not drift. The design-system and repository-file items only report:
# adopting m3l-design or adding a file is a commit in the repository, which no
# API call can make. Needs gh
# (authenticated, repository admin) and jq.
set -euo pipefail

usage() {
  sed -n '2,17p' "$0" | sed 's/^# \{0,1\}//'
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
report_file "Gitleaks config" "copy blueprint/files/gitleaks.toml" .gitleaks.toml
report_file "line endings" "copy blueprint/files/gitattributes" .gitattributes
report_file "editor config" "copy blueprint/files/editorconfig" .editorconfig
report_file "REUSE" "start from blueprint/files/REUSE.toml and add LICENSES/" REUSE.toml
# The checks below look for the control, not a file name: a repository may run
# it from its own workflow (for example a `reuse lint` step inside `verify.yml`)
# and a second copy of the template would only duplicate it.
workflows_text=""
while IFS= read -r wf; do
  workflows_text+="$(file_content ".github/workflows/$wf")"$'\n'
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
# Scorecard publishes results for public repositories only.
if [[ "$private" == "true" ]]; then
  skip "Scorecard workflow" "private repository"
else
  report_workflow "Scorecard workflow" "copy workflow-templates/scorecard.yml" 'ossf/scorecard-action'
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

printf '\n%s ok, %s drift, %s skipped (%s mode)\n' "$ok" "$drift" "$skipped" "$mode"
if [[ "$mode" == "check" && "$drift" -gt 0 ]]; then
  exit 1
fi
