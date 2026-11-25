#!/usr/bin/env bash
# SPDX-FileCopyrightText: Copyright (c) 2026 Enrico Lionello (enri3l) and Giulia Montevecchi (giulmonte), monte3l
# SPDX-License-Identifier: MIT
#
# Tests for bin/new-repo.sh with gh, npx, npm, dig and the baseline stubbed, and a local bare repository as
# the remote. Nothing touches GitHub, the network or your git identity.
#
#   bash tests/new-repo.test.sh                       # with the bash on PATH
#   BASH_BIN=/bin/bash bash tests/new-repo.test.sh    # run the script under test with another bash (macOS 3.2)
#
# It copies the repository's moving parts into a temporary directory, adds a project that does not exist on
# GitHub, and runs the script against stubs. A hand-built fixture is what lets the order of steps, the
# refusals and the failure paths be asserted without creating anything real.
# The check strings are single-quoted on purpose: `eval` expands them later, when RC, OUT, LOG and PIN
# hold the values of that case. Shellcheck cannot see either the expansion or the reads.
# shellcheck disable=SC2016,SC2034
set -uo pipefail
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PIN="$(jq -r '.[] | select(.name == "groundwork scaffold") | .version' "$SRC/blueprint/pins.json")"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
pass=0; failn=0
ok() { pass=$((pass+1)); }
bad() { failn=$((failn+1)); printf 'FAIL: %s\n' "$*"; }
check() { if eval "$2"; then ok; else bad "$1  [$2]"; fi; }

# a copy of the repo's moving parts, with one extra project that does not exist on GitHub
mkdir -p "$T/repo"
cp -R "$SRC/bin" "$SRC/blueprint" "$SRC/workflow-templates" "$SRC/LICENSE" "$SRC/LICENSES" "$SRC/.node-version" "$T/repo/"
jq '. + [{"repo":"zz-test-repo","site":"https://zz-test-repo.monte3l.com","card":"c","description":"A test repository","topics":["testing","bootstrap"]}]' \
  "$T/repo/blueprint/projects.json" > "$T/p.json" && mv "$T/p.json" "$T/repo/blueprint/projects.json"
SCRIPT="$T/repo/bin/new-repo.sh"

mkdir -p "$T/stubs" "$T/remotes/monte3l"
git init -q --bare -b main "$T/remotes/monte3l/zz-test-repo.git"
printf '[user]\n\tname = Test\n\temail = test@example.com\n' > "$T/gitconfig"
# Every git call in this file, and in the script under test, uses this identity and never the real one.
export GIT_CONFIG_GLOBAL="$T/gitconfig" GIT_CONFIG_SYSTEM=/dev/null

cat > "$T/stubs/gh" <<'STUB'
#!/usr/bin/env bash
echo "gh $*" >> "$LOG"
case "$*" in
  "api repos/monte3l/zz-test-repo --jq .full_name")
    if [[ -n "${STUB_EXISTS:-}" ]]; then echo monte3l/zz-test-repo; exit 0; fi
    if [[ -n "${STUB_500:-}" ]]; then echo "gh: Server Error (HTTP 500)" >&2; exit 1; fi
    echo "gh: Not Found (HTTP 404)" >&2; exit 1 ;;
  "api repos/monte3l/zz-test-repo --jq .id") echo 4242 ;;
  "api --paginate user/installations"*) echo "gh: You must authenticate with an access token authorized to a GitHub App (HTTP 403)" >&2; exit 1 ;;
  "api --paginate orgs/monte3l/installations --jq"*)
    [[ -z "${STUB_LIST_FAIL:-}" ]] || { echo "gh: boom (HTTP 500)" >&2; exit 1; }
    printf 'monte3l-release 1\nmonte3l-env-janitor 2\nmonte3l-audit 3\n'; [[ -n "${STUB_NO_SYNC:-}" ]] || printf 'monte3l-sync 4\n'; printf 'other-app 9\n' ;;
  "auth status"*) echo "  - Token scopes: ${STUB_SCOPES:-'admin:org', 'repo', 'workflow'}"; [[ -z "${STUB_AUTH_FAIL:-}" ]] || exit 1 ;;
  "api -X PUT user/installations/"*) [[ -z "${STUB_PUT_FAIL:-}" ]] || exit 1 ;;
  "api -X PUT orgs/monte3l/actions/secrets/"*) [[ -z "${STUB_SECRET_FAIL:-}" ]] || exit 1 ;;
  "api -X PUT repos/monte3l/zz-test-repo/immutable-releases") [[ -z "${STUB_IMMUTABLE_FAIL:-}" ]] || exit 1 ;;
  "repo create"*) [[ -z "${STUB_CREATE_FAIL:-}" ]] || { echo "gh: boom" >&2; exit 1; } ;;
  "repo edit"*) ;;
  "workflow run environments.yml -R monte3l/zz-test-repo") [[ -z "${STUB_DISPATCH_FAIL:-}" ]] || exit 1 ;;
  "run list -R monte3l/zz-test-repo --workflow environments.yml --limit 1 --event workflow_dispatch"*) [[ -n "${STUB_NO_RUN:-}" ]] || echo 777 ;;
  "run view 777 -R monte3l/zz-test-repo --json status,conclusion"*) if [[ -n "${STUB_JANITOR_FAIL:-}" ]]; then echo "completed failure"; elif [[ -n "${STUB_JANITOR_PENDING:-}" ]]; then echo "in_progress "; else echo "completed success"; fi ;;
  "release verify --help") [[ -z "${STUB_GH_OLD:-}" ]] || exit 1 ;;
  "api -X PUT repos/monte3l/zz-test-repo/environments/docs-cloudflare"*) [[ -z "${STUB_ENV_FAIL:-}" ]] || exit 1 ;;
  "api -X POST repos/monte3l/zz-test-repo/environments/docs-cloudflare/deployment-branch-policies"*) [[ -z "${STUB_ENV_FAIL:-}" ]] || exit 1 ;;
  "api -X PUT repos/monte3l/zz-test-repo/environments/env-janitor"*) [[ -z "${STUB_ENV_FAIL:-}" ]] || exit 1 ;;
  "api -X POST repos/monte3l/zz-test-repo/environments/env-janitor/deployment-branch-policies"*) [[ -z "${STUB_ENV_FAIL:-}" ]] || exit 1 ;;
  *) echo "unexpected gh call: $*" >&2; exit 9 ;;
esac
STUB
cat > "$T/stubs/npx" <<'STUB'
#!/usr/bin/env bash
echo "npx $*" >> "$LOG"
dir=""; for a in "$@"; do [[ "$a" == /* ]] && dir="$a"; done
mkdir -p "$dir/.github/workflows" "$dir/src"; [[ -n "${STUB_SCAFFOLD_BRANCH:-}" ]] && b="$STUB_SCAFFOLD_BRANCH" || b=main
echo "# scaffolded readme" > "$dir/README.md"; printf "name: Dependency Review\n" > "$dir/.github/workflows/dependency-review.yml"
printf 'name: CI\njobs:\n  verify:\n    name: verify\n' > "$dir/.github/workflows/ci.yml"
git -C "$dir" init -q -b "$b"
STUB
cat > "$T/stubs/baseline" <<'STUB'
#!/usr/bin/env bash
echo "baseline $*" >> "$LOG"
case "$2" in
  --apply) exit "${STUB_APPLY_RC:-0}" ;;
  --check) printf 'OK     a thing\n'; [[ -z "${STUB_DRIFT:-}" ]] || printf 'DRIFT  release: config\n'; exit "${STUB_CHECK_RC:-$([[ -n "${STUB_DRIFT:-}" ]] && echo 1 || echo 0)}" ;;
esac
STUB
cat > "$T/stubs/npm" <<'STUB'
#!/usr/bin/env bash
echo "npm $* (in $PWD)" >> "$LOG"
case "$1" in
  ci) [[ -z "${STUB_NPM_CI_FAIL:-}" ]] || exit 1 ;;
esac
STUB
cat > "$T/stubs/design-sync" <<'STUB'
#!/usr/bin/env bash
echo "design-sync $*" >> "$LOG"
mkdir -p "$2/design/source/docs-kit"
echo "/* tokens */" > "$2/design/tokens.css"
cat > "$2/design/source/docs-kit/build.mjs" <<'JS'
import { appendFileSync } from "node:fs";
appendFileSync(process.env.LOG, "gate ran\n");
process.exit(process.env.STUB_GATE_FAIL ? 1 : 0);
JS
STUB
cat > "$T/stubs/dig" <<'STUB'
#!/usr/bin/env bash
echo "dig $*" >> "$LOG"
[[ -z "${STUB_DIG:-}" ]] || echo "cname.example.net."
STUB
chmod +x "$T/stubs/"*

run() { # run ARGS... ; env passes through; sets OUT, RC, LOG
  LOG="$T/log.$RANDOM"; : > "$LOG"; export LOG
  OUT="$(PATH="$T/stubs:$PATH" GIT_CONFIG_GLOBAL="$T/gitconfig" GIT_CONFIG_SYSTEM=/dev/null NEW_REPO_POLL_SECONDS=0 NEW_REPO_BASELINE="$T/stubs/baseline" NEW_REPO_DESIGN_SYNC="${DESIGN_SYNC_OVERRIDE-$T/stubs/design-sync}" NEW_REPO_REMOTE_BASE="${REMOTE_BASE_OVERRIDE:-file://$T/remotes}" "${BASH_BIN:-bash}" "$SCRIPT" "$@" 2>&1 </dev/null)"; RC=$?
}
reset_remote() { rm -rf "$T/remotes/monte3l/zz-test-repo.git"; git init -q --bare -b main "$T/remotes/monte3l/zz-test-repo.git"; }

# ---- plan mode creates nothing
run zz-test-repo --kind library
check "plan exits 0" '[[ $RC == 0 ]]'
check "plan says nothing was created" 'grep -q "Nothing was created" <<<"$OUT"'
check "plan lists files" 'grep -q "+ .github/workflows/gitleaks.yml" <<<"$OUT"'
check "plan makes no create/edit/put call" '! grep -qE "^gh (repo|api -X)" "$LOG"'
check "plan calls no baseline" '! grep -q "^baseline" "$LOG"'
check "plan lists placeholders for a person" 'grep -q "REPLACE-WITH-PACKAGE" <<<"$OUT"'
check "plan warns gpgsign is off" 'grep -q "commit.gpgsign is not on" <<<"$OUT"'
run zz-test-repo
check "no kind is noted" 'grep -q "No --kind" <<<"$OUT"'
check "no kind writes no release config" '! grep -q "release-please-config.json" <<<"$OUT"'
run zz-test-repo --private --kind simple
check "private is noted" 'grep -q "Private:" <<<"$OUT"'
run zz-test-repo --claude --kind simple
check "claude adds claude.yml" 'grep -q "+ .github/workflows/claude.yml" <<<"$OUT"'
run zz-test-repo --kind simple --scaffold
check "scaffold plan drops verify.yml" '! grep -q "+ .github/workflows/verify.yml" <<<"$OUT" && grep -q "scaffold.s own ci.yml" <<<"$OUT"'

# ---- refusals
run zz-test-repo --kind bogus
check "unknown kind is refused (2)" '[[ $RC == 2 ]] && grep -q "is not a kind" <<<"$OUT"'
run not-in-projects
check "project not in projects.json is refused (2)" '[[ $RC == 2 ]] && grep -q "not in blueprint/projects.json" <<<"$OUT"'
STUB_EXISTS=1 run zz-test-repo
check "existing repository is refused (2)" '[[ $RC == 2 ]] && grep -q "already exists" <<<"$OUT"'
STUB_500=1 run zz-test-repo
check "an unclear answer is a failure (3), not free" '[[ $RC == 3 ]]'
run "bad name!"
check "bad name is refused (2)" '[[ $RC == 2 ]]'
run zz-test-repo --yes
check "--yes without --apply is refused (2)" '[[ $RC == 2 ]]'
run zz-test-repo --kind
check "--kind without a value is refused (2)" '[[ $RC == 2 ]]'
run zz-test-repo --bogus
check "unknown flag is refused (2)" '[[ $RC == 2 ]]'
run zz-test-repo --apply
check "apply with no terminal and no --yes is refused (2)" '[[ $RC == 2 ]] && ! grep -q "^gh repo create" "$LOG"'

# ---- apply
reset_remote
run zz-test-repo --kind simple --apply --yes
check "apply: placeholders are listed but exit is 0 when the check is clean" '[[ $RC == 0 ]] && grep -q "fill in README.md" <<<"$OUT"'
check "apply: public repo created with description and site" 'grep -q "^gh repo create monte3l/zz-test-repo --public --description=A test repository --homepage=https://zz-test-repo.monte3l.com" "$LOG"'
check "apply: both topics set" 'grep -q "add-topic testing" "$LOG" && grep -q "add-topic bootstrap" "$LOG"'
check "apply: baseline --apply then --check" 'awk "/^baseline/{print \$3}" "$LOG" | paste -sd, - | grep -q "^--apply,--check$"'
check "apply: order is create, Apps, secrets, topics, baseline apply, check" 'awk "/^gh repo create/{a=NR} /^gh repo edit/{b=NR} /^baseline .* --apply/{c=NR} /^gh api -X PUT user/{d=NR} /^gh api -X PUT orgs/{f=NR} /^baseline .* --check/{e=NR} END{exit !(a<d && d<f && f<b && b<c && c<e)}" "$LOG"'
check "apply: all four Apps added, other-app not" '[[ $(grep -c "^gh api -X PUT user/installations" "$LOG") == 4 ]] && grep -q "installations/4/repositories/4242" "$LOG" && ! grep -q "installations/9/" "$LOG"'
check "apply: main was pushed with files" 'git -C "$T/remotes/monte3l/zz-test-repo.git" ls-tree -r --name-only main | grep -q "^.github/workflows/gitleaks.yml$"'
check "apply: commit is signed off" 'git -C "$T/remotes/monte3l/zz-test-repo.git" log -1 --format=%B main | grep -q "^Signed-off-by: Test <test@example.com>$"'
check "apply: one commit only" '[[ $(git -C "$T/remotes/monte3l/zz-test-repo.git" rev-list --count main) == 1 ]]'
check "apply: release placeholder removed, version 0.0.0" 'git -C "$T/remotes/monte3l/zz-test-repo.git" show main:.release-please-manifest.json | grep -q "0.0.0" && ! git -C "$T/remotes/monte3l/zz-test-repo.git" show main:release-please-config.json | grep -q bootstrap-sha'
check "apply: README has the repo name" 'git -C "$T/remotes/monte3l/zz-test-repo.git" show main:README.md | grep -q zz-test-repo'
check "apply: sync snippet printed" 'grep -q "\"zz-test-repo\": { \"flags\": \[\] }" <<<"$OUT"'

reset_remote
STUB_PUT_FAIL=1 run zz-test-repo --kind simple --apply --yes
check "a refused App call is MANUAL, not a crash" 'grep -q "MANUAL monte3l-release" <<<"$OUT" && [[ $RC == 1 ]]'
reset_remote
STUB_DRIFT=1 run zz-test-repo --kind simple --apply --yes
check "drift in the final check shows and is exit 1" 'grep -q "DRIFT  release: config" <<<"$OUT" && [[ $RC == 1 ]]'
reset_remote
STUB_CREATE_FAIL=1 run zz-test-repo --kind simple --apply --yes
check "create failure is 3 with no recovery text" '[[ $RC == 3 ]] && ! grep -q "was created before that" <<<"$OUT"'
reset_remote
STUB_APPLY_RC=3 run zz-test-repo --kind simple --apply --yes
check "baseline failure after create is 3 with recovery text" '[[ $RC == 3 ]] && grep -q "was created before that" <<<"$OUT" && grep -q -- "--apply" <<<"$OUT"'
reset_remote
STUB_CHECK_RC=3 run zz-test-repo --kind simple --apply --yes
check "a failing final check is 3" '[[ $RC == 3 ]]'

# ---- scaffold: the scaffold wins
reset_remote
run zz-test-repo --kind simple --scaffold --apply --yes
check "scaffold: npx ran with fresh mode" 'grep -q "^npx --yes @monte3l/groundwork@$PIN .* --fresh --skip-install --name zz-test-repo" "$LOG"'
check "scaffold: its README is kept, not overwritten" 'git -C "$T/remotes/monte3l/zz-test-repo.git" show main:README.md | grep -q "scaffolded readme"'
check "scaffold: its ci.yml is kept and verify.yml is not added" 'git -C "$T/remotes/monte3l/zz-test-repo.git" ls-tree -r --name-only main | grep -q "^.github/workflows/ci.yml$" && ! git -C "$T/remotes/monte3l/zz-test-repo.git" ls-tree -r --name-only main | grep -q "^.github/workflows/verify.yml$"'
check "scaffold: org files are still added" 'git -C "$T/remotes/monte3l/zz-test-repo.git" ls-tree -r --name-only main | grep -q "^.gitleaks.toml$"'
check "scaffold: README placeholders of the scaffold are not reported" '! grep -q "fill in README.md" <<<"$OUT"'


# ---- the reviewer's findings
reset_remote
run zz-test-repo --apply --yes --kind simple
check "apply passes the scopes check with a full token" '[[ $RC == 0 ]]'
STUB_SCOPES="'repo', 'admin:org'" run zz-test-repo --kind simple --apply --yes
check "a token without workflow scope is refused before anything is created (2)" '[[ $RC == 2 ]] && grep -q "lacks the workflow scope" <<<"$OUT" && ! grep -q "^gh repo create" "$LOG"'
STUB_SCOPES="'repo', 'workflow'" run zz-test-repo --kind simple --apply --yes
check "a token without admin:org is refused (2)" '[[ $RC == 2 ]] && grep -q "admin:org" <<<"$OUT"'
STUB_SCOPES="'repo', 'workflow'" run zz-test-repo --kind simple
check "plan does not need the scopes" '[[ $RC == 0 ]]'
STUB_EXISTS=1 run zz-test-repo --kind bogus
check "a bad kind is refused before GitHub is asked (2)" '[[ $RC == 2 ]] && grep -q "is not a kind" <<<"$OUT" && ! grep -q "^gh api" "$LOG"'
run zz-test-repo --kind simple --apply
check "no --yes and no terminal: refused, and no scaffold ran" '[[ $RC == 2 ]] && ! grep -q "^npx" "$LOG" && ! grep -q "^gh repo create" "$LOG"'
run zz-test-repo --kind simple --scaffold --apply
check "scaffold is not run before the confirmation" '[[ $RC == 2 ]] && ! grep -q "^npx" "$LOG"'

reset_remote
REMOTE_BASE_OVERRIDE="file://$T/nowhere" run zz-test-repo --kind simple --apply --yes
check "a failed push is 3 and the recovery text names the push" '[[ $RC == 3 ]] && grep -q "was created before that" <<<"$OUT" && grep -q "push -u origin main" <<<"$OUT"'
kept="$(sed -n "s/^kept: //p" <<<"$OUT" | head -n 1)"
check "the rendered files are kept for the retry" '[[ -n "$kept" && -f "$kept/repo/README.md" ]]'
check "the recovery says nothing about the ruleset first" '! grep -q "apply-repo-baseline.sh.*--apply" <<<"${OUT%%push -u origin main*}"'
rm -rf "$kept"

reset_remote
STUB_LIST_FAIL=1 run zz-test-repo --kind simple --apply --yes
check "a failed installation list is its own message, not 'not found'" 'grep -q "could not list the organization" <<<"$OUT" && ! grep -q "not found" <<<"$OUT" && [[ $RC == 1 ]]'
reset_remote
STUB_NO_SYNC=1 run zz-test-repo --kind simple --apply --yes
check "an App not installed on the org is MANUAL" 'grep -q "MANUAL monte3l-sync: not installed" <<<"$OUT" && [[ $RC == 1 ]]'
reset_remote
STUB_CHECK_RC=3 run zz-test-repo --kind simple --apply --yes
check "a failing final check gets the recovery text too" '[[ $RC == 3 ]] && grep -q "was created before that" <<<"$OUT"'

reset_remote
STUB_SCAFFOLD_BRANCH=master run zz-test-repo --kind simple --scaffold --apply --yes
check "a scaffold that chose another branch is renamed to main before the push" 'git -C "$T/remotes/monte3l/zz-test-repo.git" rev-parse --verify -q main >/dev/null'
check "a scaffold workflow that overlaps an org one is listed for review" 'grep -q "review .github/workflows/dependency-review.yml" <<<"$OUT"'
run zz-test-repo --kind simple --scaffold
check "scaffold plan says a scaffolded file may be kept" 'grep -q "a file the scaffold writes first is kept" <<<"$OUT"'
run zz-test-repo --kind library
check "library: the manifest key is reported" 'grep -q "must be the package paths" <<<"$OUT"'
run zz-test-repo --help
check "--help prints the header and not the shell options" '[[ $RC == 0 ]] && grep -q "^Exit codes:" <<<"$OUT" && ! grep -q "set -eEuo" <<<"$OUT"'

# ---- second review
reset_remote
STUB_SCOPES="admin:org, repo, workflow" run zz-test-repo --kind simple --apply --yes
check "unquoted scopes (an older gh) are accepted" '[[ $RC == 0 ]]'
reset_remote
STUB_SCOPES="none" run zz-test-repo --kind simple --apply --yes
check "scopes: none is not a refusal (a fine-grained token lists none)" '[[ $RC == 0 ]]'
reset_remote
STUB_AUTH_FAIL=1 run zz-test-repo --kind simple --apply --yes
check "a failing gh auth status (another account) does not stop the run" '[[ $RC == 0 ]]'
STUB_SCOPES="'repo', 'workflow', 'admin:org_hook'" run zz-test-repo --kind simple --apply --yes
check "admin:org_hook is not admin:org" '[[ $RC == 2 ]] && grep -q "admin:org scope" <<<"$OUT"'
reset_remote
REMOTE_BASE_OVERRIDE="file://$T/nowhere" run zz-test-repo --kind simple --apply --yes
check "the retry push authenticates like the real one" 'grep -q "credential.helper=.!gh auth git-credential. push -u origin main" <<<"$OUT"'
rm -rf "$(sed -n "s/^kept: //p" <<<"$OUT" | head -n 1)"
reset_remote
run zz-test-repo --kind simple --scaffold --apply --yes
check "everything the scaffold kept is listed" 'grep -q "were kept as they are: .*README.md" <<<"$OUT"'
check "no false error line on a normal run" '! grep -q "a call failed" <<<"$OUT"'
run zz-test-repo --kind simple
check "no false error line in plan mode" '! grep -q "a call failed" <<<"$OUT"'
reset_remote
STUB_LIST_FAIL=1 run zz-test-repo --kind simple --apply --yes
check "a failed installation list does not print the recovery text of a crash" '! grep -q "a call failed" <<<"$OUT" && ! grep -q "was created before that" <<<"$OUT"'

# ---- the first real run's findings
reset_remote
run zz-test-repo --kind simple --apply --yes
check "secrets: GITLEAKS_LICENSE and both release secrets are shared with the repo" 'grep -q "^gh api -X PUT orgs/monte3l/actions/secrets/GITLEAKS_LICENSE/repositories/4242" "$LOG" && grep -q "secrets/RELEASE_APP_CLIENT_ID/repositories/4242" "$LOG" && grep -q "secrets/RELEASE_APP_PRIVATE_KEY/repositories/4242" "$LOG"'
check "immutable releases are turned on for a repo with a kind" 'grep -q "^gh api -X PUT repos/monte3l/zz-test-repo/immutable-releases" "$LOG"'
check "the verify placeholder is listed for a person" 'grep -q "verify.yml: replace the placeholder step" <<<"$OUT"'
reset_remote
run zz-test-repo --apply --yes
check "no kind: only GITLEAKS_LICENSE is shared, and releases are not touched" 'grep -q "secrets/GITLEAKS_LICENSE" "$LOG" && ! grep -q "RELEASE_APP" "$LOG" && ! grep -q "immutable-releases" "$LOG"'
reset_remote
STUB_SECRET_FAIL=1 run zz-test-repo --kind simple --apply --yes
check "a refused secret share is MANUAL with the command, and exit 1" 'grep -q "MANUAL GITLEAKS_LICENSE" <<<"$OUT" && grep -q "gh api -X PUT orgs/monte3l/actions/secrets/GITLEAKS_LICENSE/repositories/4242" <<<"$OUT" && [[ $RC == 1 ]]'
reset_remote
STUB_IMMUTABLE_FAIL=1 run zz-test-repo --kind simple --apply --yes
check "a refused immutable-releases call is MANUAL, and exit 1" 'grep -q "MANUAL immutable releases" <<<"$OUT" && [[ $RC == 1 ]]'
run zz-test-repo --kind simple --private
check "private: scorecard and dependency-review are not written" '! grep -q "workflows/scorecard.yml" <<<"$OUT" && ! grep -q "workflows/dependency-review.yml" <<<"$OUT" && grep -q "dependency-review-config.yml" <<<"$OUT"'
run zz-test-repo --kind simple
check "public: scorecard and dependency-review are written" 'grep -q "workflows/scorecard.yml" <<<"$OUT" && grep -q "workflows/dependency-review.yml" <<<"$OUT"'
check "plan lists the secret share and immutable releases" 'grep -q "share the organization secrets" <<<"$OUT" && grep -q "immutable releases" <<<"$OUT"'
run zz-test-repo --kind simple --scaffold
check "scaffold plan has no verify todo (the scaffold defines the check)" '! grep -q "placeholder step" <<<"$OUT"'

# ---- the second real run: Apps and secrets before the push
reset_remote
run zz-test-repo --kind simple --apply --yes
check "the Apps and secrets come before the push (the push starts Gitleaks and Release)" 'awk "/^created:/{a=NR} /== Apps ==/{b=NR} /== Secrets and releases ==/{c=NR} /^pushed:/{d=NR} END{exit !(a<b && b<c && c<d)}" <<<"$OUT"'
reset_remote
REMOTE_BASE_OVERRIDE="file://$T/nowhere" run zz-test-repo --kind simple --apply --yes
check "a failed push still left the secrets shared (they were first)" 'grep -q "secrets/GITLEAKS_LICENSE/repositories/4242" "$LOG"'
check "the recovery text says the secrets are shared before the push" 'grep -q "share the organization secrets (GITLEAKS_LICENSE" <<<"$OUT"'
rm -rf "$(sed -n "s/^kept: //p" <<<"$OUT" | head -n 1)"
reset_remote
run zz-test-repo --kind simple --apply --yes
check "public: the Scorecard first-run alerts are listed" 'grep -q "Scorecard opens alerts on its first run" <<<"$OUT"'
reset_remote
run zz-test-repo --kind simple --private --apply --yes
check "private: no Scorecard alert line" '! grep -q "Scorecard opens alerts" <<<"$OUT"'
run zz-test-repo --kind simple
check "plan order: apps and secrets before the push" 'awk "/add the repository to the Apps/{a=NR} /share the organization secrets/{b=NR} /push main/{c=NR} END{exit !(a<b && b<c)}" <<<"$OUT"'

# ---- the docs option
run zz-test-repo --kind simple --docs
check "docs plan lists the docs files" 'miss=0; for f in docs.config.mjs tools/deploy/wrangler.jsonc tools/deploy/package.json .github/workflows/docs.yml .github/workflows/docs-live.yml .github/workflows/environments.yml .node-version .github/environments.json LICENSES/OFL-1.1.txt design/README.md; do grep -q "+ $f" <<<"$OUT" || miss=1; done; [[ $miss == 0 ]]'
check "docs plan says the design is vendored and the gate runs first" 'grep -q "vendor the design: bin/sync-design.sh of m3l-design v" <<<"$OUT" && grep -q "nothing is created if it fails" <<<"$OUT"'
check "docs plan lists both environments and the four environment secrets" 'grep -q "create the docs-cloudflare env-janitor environments" <<<"$OUT" && grep -q "set the environment secrets" <<<"$OUT" && for n in CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID JANITOR_APP_CLIENT_ID JANITOR_APP_PRIVATE_KEY; do grep -q "$n" <<<"$OUT" || exit 1; done'
check "docs plan lists the three todos for a person" 'grep -q "dig zz-test-repo.monte3l.com" <<<"$OUT" && grep -q "add .node-version\|.node-version, so a pull request" <<<"$OUT" && grep -q "\"consumers\" in blueprint/design-system.json" <<<"$OUT"'
check "docs plan runs nothing: no npm, no design sync" '! grep -q "^npm\|^design-sync" "$LOG"'
run zz-test-repo --docs --scaffold
check "--docs with --scaffold is refused (2)" '[[ $RC == 2 ]] && grep -q "cannot be combined" <<<"$OUT"'
run zz-test-repo --kind simple
check "no docs: no docs files, no Cloudflare secrets" '! grep -q "docs.config.mjs" <<<"$OUT" && ! grep -q "CLOUDFLARE" <<<"$OUT"'

reset_remote
run zz-test-repo --kind simple --docs --apply --yes
check "docs apply: design vendored at the pinned tag into the repo dir" 'grep -q "^design-sync v[0-9]" "$LOG"'
check "docs apply: no npm install runs (nothing is resolved at bootstrap), the lockfile is the reviewed starter" '! grep -q "^npm install" "$LOG"'
check "docs apply: npm ci --dry-run runs inside the deploy directory" 'grep -q "^npm ci --dry-run --ignore-scripts (in .*/tools/deploy)$" "$LOG"'
check "docs apply: the gate ran BEFORE the repository was created" 'awk "/^gate ran/{g=NR} /^gh repo create/{c=NR} END{exit !(g && c && g<c)}" "$LOG"'
check "docs apply: the environment is created after the repo and before the Apps" 'awk "/^gh repo create/{a=NR} /environments\/docs-cloudflare\/deployment/{b=NR} /^gh api -X PUT user/{c=NR} END{exit !(a<b && b<c)}" "$LOG"'
check "docs apply: the environment branch policy is main" 'grep -q "deployment-branch-policies -f name=main" "$LOG"'
check "docs apply: the Cloudflare secrets are NOT shared from the organization" '! grep -q "secrets/CLOUDFLARE_API_TOKEN/repositories" "$LOG" && ! grep -q "secrets/CLOUDFLARE_ACCOUNT_ID/repositories" "$LOG"'
check "docs apply: without a terminal the four values are left for a person, with the command (exit 1)" 'for n in CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID JANITOR_APP_CLIENT_ID JANITOR_APP_PRIVATE_KEY; do grep -q "bin/env-secrets.sh set $n --repo zz-test-repo --owner monte3l" <<<"$OUT" || exit 1; done; ! grep -q "^gh secret set" "$LOG" && [[ $RC == 1 ]]'
# The lock is large: capture it first, because `git show | grep -q` makes git take SIGPIPE when grep exits early,
# and pipefail then calls a successful match a failure.
check "docs apply: the starter lockfile has the repository's name, not PROJECT" 'lock="$(git -C "$T/remotes/monte3l/zz-test-repo.git" show main:tools/deploy/package-lock.json)"; grep -q "\"name\": \"zz-test-repo-deploy-tools\"" <<<"$lock" && ! grep -q PROJECT <<<"$lock"'
check "docs apply: vendored files and the lockfile are in the first commit" 'files="$(git -C "$T/remotes/monte3l/zz-test-repo.git" ls-tree -r --name-only main)"; grep -q "^design/tokens.css$" <<<"$files" && grep -q "^tools/deploy/package-lock.json$" <<<"$files" && grep -q "^docs.config.mjs$" <<<"$files"'
check "docs apply: the vendored marker is in the commit" 'git -C "$T/remotes/monte3l/zz-test-repo.git" show main:design/README.md | grep -q "^- \*\*Tier:\*\* vendored$"'
check "docs apply: the site URL and host are filled in" 'git -C "$T/remotes/monte3l/zz-test-repo.git" show main:tools/deploy/wrangler.jsonc | grep -q "zz-test-repo.monte3l.com" && git -C "$T/remotes/monte3l/zz-test-repo.git" show main:docs.config.mjs | grep -q "siteUrl: \"https://zz-test-repo.monte3l.com\""'
check "docs apply: the todos are printed" 'grep -q "dig zz-test-repo.monte3l.com" <<<"$OUT"'

reset_remote
STUB_GATE_FAIL=1 run zz-test-repo --kind simple --docs --apply --yes
check "a failing docs gate is 3 and nothing is created" '[[ $RC == 3 ]] && grep -q "docs gate fails" <<<"$OUT" && ! grep -q "^gh repo create" "$LOG" && ! grep -q "was created before that" <<<"$OUT"'
reset_remote
STUB_ENV_FAIL=1 run zz-test-repo --kind simple --docs --apply --yes
check "a refused environment call is MANUAL and exit 1" 'grep -q "MANUAL docs-cloudflare" <<<"$OUT" && [[ $RC == 1 ]]'
reset_remote
run zz-test-repo --kind simple --apply --yes
check "no docs: no npm, no design sync, no environment" '! grep -q "^npm\|^design-sync\|docs-cloudflare\|env-janitor" "$LOG"'

# ---- the --docs review
run zz-test-repo --kind simple --docs
check "plan header shows docs" 'grep -q "docs: 1" <<<"$OUT"'
check "plan: no DNS warning when dig finds nothing" '! grep -q "Warning: dig reports" <<<"$OUT"'
STUB_DIG=1 run zz-test-repo --kind simple --docs
check "plan: a DNS record for the host is a warning" 'grep -q "Warning: dig reports a record for zz-test-repo.monte3l.com" <<<"$OUT" && [[ $RC == 0 ]]'
run zz-test-repo --kind simple
check "no docs: dig is not run" '! grep -q "^dig" "$LOG"'
STUB_GH_OLD=1 run zz-test-repo --kind simple --docs --apply --yes
check "an old gh is refused before anything is created (2)" '[[ $RC == 2 ]] && grep -q "gh is too old for --docs" <<<"$OUT" && ! grep -q "^gh repo create" "$LOG"'
STUB_GH_OLD=1 run zz-test-repo --kind simple --docs
check "plan does not need the newer gh" '[[ $RC == 0 ]]'
STUB_GH_OLD=1 run zz-test-repo --kind simple --apply --yes
check "without --docs the gh version is not asked" '! grep -q "release verify" "$LOG"'

reset_remote
run zz-test-repo --kind simple --docs --apply --yes
check "the design sync hook prints a warning when it is used" 'grep -q "warning: NEW_REPO_DESIGN_SYNC is set" <<<"$OUT"'
check "the environment is made from a JSON body (real booleans), not -f strings" 'grep -q "^gh api -X PUT repos/monte3l/zz-test-repo/environments/docs-cloudflare --input -" "$LOG" && ! grep -q "deployment_branch_policy\[" "$LOG"'
check "docs: the env-janitor environment is created, limited to main, and its secrets are not shared from the organization" 'grep -q "^gh api -X PUT repos/monte3l/zz-test-repo/environments/env-janitor --input -" "$LOG" && grep -q "environments/env-janitor/deployment-branch-policies -f name=main" "$LOG" && ! grep -q "secrets/JANITOR_APP_CLIENT_ID/repositories" "$LOG" && ! grep -q "secrets/JANITOR_APP_PRIVATE_KEY/repositories" "$LOG"'
check "docs: the dig todo says it is for before the first deploy" 'grep -q "should return nothing before the first deploy" <<<"$OUT"'
reset_remote
STUB_ENV_FAIL=1 run zz-test-repo --kind simple --docs --apply --yes
check "a refused environment call shows the reason in the manual step" 'grep -q "MANUAL docs-cloudflare: refused" <<<"$OUT" && grep -q "MANUAL env-janitor: refused" <<<"$OUT"'

# the real clone path: the TAG is fetched by its full ref, never a branch of the same name
mkdir -p "$T/mk" && rm -rf "$T/mk/d" "$T/remotes/monte3l/m3l-design.git" && git init -q "$T/mk/d" && (
  cd "$T/mk/d" && mkdir -p bin && cat > bin/sync-design.sh <<'SYNC'
#!/usr/bin/env bash
echo "TAGGED-SYNC $*" >> "$LOG"
mkdir -p "$2/design/source/docs-kit"
echo "/* tokens */" > "$2/design/tokens.css"
printf 'process.exit(0);\n' > "$2/design/source/docs-kit/build.mjs"
SYNC
  git add bin && git commit -q -s -m "the release" && git tag "$(jq -r .version "$T/repo/blueprint/design-system.json")"
  sed -i.bak 's/TAGGED-SYNC/BRANCH-SYNC-ATTACK/' bin/sync-design.sh && rm -f bin/sync-design.sh.bak && git commit -q -s -a -m "attacker branch" && git branch "$(jq -r .version "$T/repo/blueprint/design-system.json")" ) \
  && git clone -q --bare "$T/mk/d" "$T/remotes/monte3l/m3l-design.git"
reset_remote
DESIGN_SYNC_OVERRIDE='' run zz-test-repo --kind simple --docs --apply --yes
check "real path: the tagged sync-design.sh ran" 'grep -q "^TAGGED-SYNC v[0-9]" "$LOG"'
check "real path: a branch named like the tag was NOT run" '! grep -q "BRANCH-SYNC-ATTACK" "$LOG"'
check "real path: no hook warning" '! grep -q "NEW_REPO_DESIGN_SYNC is set" <<<"$OUT"'

# ---- the third real run: the lockfile
reset_remote
run zz-test-repo --kind simple --docs --apply --yes
check "docs apply: npm ci --dry-run validated the lockfile before anything was created" 'awk "/^npm ci --dry-run/{n=NR} /^gh repo create/{c=NR} END{exit !(n && c && n<c)}" "$LOG"'
reset_remote
STUB_NPM_CI_FAIL=1 run zz-test-repo --kind simple --docs --apply --yes
check "a lockfile npm ci refuses is refused (3), nothing created" '[[ $RC == 3 ]] && grep -q "npm ci refuses the deploy lockfile" <<<"$OUT" && ! grep -q "^gh repo create" "$LOG"'

# ---- the cleanup dry run (found by the third real run)
run zz-test-repo --kind simple --docs
check "docs plan lists the cleanup dry run" 'grep -q "dispatch environments.yml once, a dry run" <<<"$OUT"'
run zz-test-repo --kind simple
check "no docs: no cleanup dispatch in the plan" '! grep -q "dispatch environments.yml" <<<"$OUT"'
reset_remote
run zz-test-repo --kind simple --docs --apply --yes
check "docs apply: environments.yml is dispatched and its success is shown" 'grep -q "^gh workflow run environments.yml -R monte3l/zz-test-repo" "$LOG" && grep -q "OK     environments.yml: success" <<<"$OUT"'
check "docs apply: the dispatch comes after the baseline apply and before the check" 'awk "/^baseline .* --apply/{a=NR} /^gh workflow run environments.yml/{d=NR} /^baseline .* --check/{c=NR} END{exit !(a<d && d<c)}" "$LOG"'
reset_remote
run zz-test-repo --kind simple --apply --yes
check "no docs: nothing is dispatched" '! grep -q "workflow run" "$LOG"'
reset_remote
STUB_JANITOR_FAIL=1 run zz-test-repo --kind simple --docs --apply --yes
check "a red cleanup run is a manual step with the state, exit 1" 'grep -q "MANUAL environments.yml: completed failure" <<<"$OUT" && [[ $RC == 1 ]]'
reset_remote
STUB_DISPATCH_FAIL=1 run zz-test-repo --kind simple --docs --apply --yes
check "a refused dispatch is a manual step, exit 1" 'grep -q "MANUAL environments.yml: not started" <<<"$OUT" && [[ $RC == 1 ]]'
reset_remote
STUB_NO_RUN=1 run zz-test-repo --kind simple --docs --apply --yes
check "a run that never appears is a manual step, exit 1" 'grep -q "MANUAL environments.yml: not started" <<<"$OUT" && [[ $RC == 1 ]]'
reset_remote
STUB_JANITOR_PENDING=1 run zz-test-repo --kind simple --docs --apply --yes
check "a run that never completes is bounded and is a manual step" 'grep -q "MANUAL environments.yml" <<<"$OUT" && [[ $RC == 1 ]]'

printf '\n%s passed, %s failed\n' "$pass" "$failn"
[[ $failn == 0 ]]
