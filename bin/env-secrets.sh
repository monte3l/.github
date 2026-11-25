#!/usr/bin/env bash
# SPDX-FileCopyrightText: Copyright (c) 2026 Enrico Lionello (enri3l) and Giulia Montevecchi (giulmonte), monte3l
# SPDX-License-Identifier: MIT
#
# Sets or audits the secrets that live in a GitHub environment, listed in
# blueprint/env-secrets.json. This is the rotation command: one value goes to the
# environment of every repository that has it, so no copy is left behind with the
# old credential.
#
#   env-secrets.sh set NAME [--repo REPO] [--owner OWNER]
#   env-secrets.sh check [--owner OWNER]
#
#   set    reads the value from standard input (a hidden prompt on a terminal),
#          never from an argument, so it does not reach a process list or the
#          shell history. It sets NAME in the environment the JSON file maps it
#          to, in REPO (a name, default: every repository of OWNER that has the
#          environment). A refused write names the repository and never the value.
#   check  prints each secret's name, repository and update time, and flags a
#          copy that is missing from an environment that exists, or older than
#          the newest copy of the same name by more than an hour (a rotation
#          that stopped halfway). It reads names and dates only.
#   --owner the organization (default monte3l)
#
# Exit codes: 0 done, 1 a write failed or check found drift, 2 usage or a missing
# tool, 3 a gh call failed. Needs gh with repository Environments and Secrets
# write for set, read for check, and jq.
set -eEuo pipefail
trap 'exit 3' ERR

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/../blueprint" && pwd)"
map="$here/env-secrets.json"

usage() {
  sed -n '5,23p' "$0" | sed 's/^# \{0,1\}//' >&2
  exit 2
}

for tool in gh jq; do
  command -v "$tool" >/dev/null 2>&1 || { printf 'missing tool: %s\n' "$tool" >&2; exit 2; }
done

cmd="${1:-}"
[[ "$cmd" == "set" || "$cmd" == "check" ]] || usage
shift
name="" repo_only="" owner="monte3l"
if [[ "$cmd" == "set" ]]; then
  [[ $# -ge 1 && "$1" != -* ]] || usage
  name="$1"
  shift
fi
while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo) repo_only="${2:?--repo needs a name}"; shift 2 ;;
    --owner) owner="${2:?--owner needs a name}"; shift 2 ;;
    *) usage ;;
  esac
done
[[ "$cmd" == "set" || -z "$repo_only" ]] || usage

# The repositories to look at: one, or every live repository of the owner.
repos() {
  if [[ -n "$repo_only" ]]; then
    printf '%s\n' "$repo_only"
  else
    gh api --paginate "orgs/$owner/repos" --jq '.[] | select(.archived | not) | select(.fork | not) | .name'
  fi
}

# has_env REPO ENV: whether the repository has the environment. A 404 is "no";
# any other failure stops the run, since "no" would skip a repository silently.
has_env() {
  local out
  if out="$(gh api "repos/$owner/$1/environments/$2" 2>&1 >/dev/null)"; then
    return 0
  elif grep -q 'HTTP 404' <<<"$out"; then
    return 1
  fi
  printf 'cannot read the environment %s of %s: %s\n' "$2" "$1" "${out%%$'\n'*}" >&2
  exit 3
}

if [[ "$cmd" == "set" ]]; then
  env="$(jq -r --arg n "$name" '.environments | to_entries[] | select(.value | index($n)) | .key' "$map")"
  [[ -n "$env" ]] || { printf '%s is not listed in blueprint/env-secrets.json\n' "$name" >&2; exit 2; }

  if [[ -t 0 ]]; then
    read -r -s -p "Value for $name: " value
    printf '\n' >&2
  else
    value="$(cat)"
  fi
  [[ -n "$value" ]] || { printf 'no value given\n' >&2; exit 2; }

  repo_list="$(repos)"
  failed=0 done_count=0
  while IFS= read -r r; do
    [[ -n "$r" ]] || continue
    if [[ -z "$repo_only" ]] && ! has_env "$r" "$env"; then
      continue
    fi
    if printf '%s' "$value" | gh secret set "$name" --env "$env" --repo "$owner/$r" >/dev/null 2>&1; then
      printf 'OK     %s: %s set in %s\n' "$r" "$name" "$env"
      done_count=$((done_count + 1))
    else
      printf 'FAIL   %s: %s was refused in %s\n' "$r" "$name" "$env"
      failed=$((failed + 1))
    fi
  done <<<"$repo_list"
  unset value
  printf '%s set, %s failed\n' "$done_count" "$failed"
  [[ "$failed" -eq 0 && "$done_count" -gt 0 ]] || exit 1
  exit 0
fi

# check: one row per copy, then the flags. Epoch seconds make the hour compare exact.
rows="$(mktemp)"
trap 'rm -f "$rows"' EXIT
drift=0
repo_list="$(repos)"
env_list="$(jq -r '.environments | keys[]' "$map")"
while IFS= read -r env; do
  while IFS= read -r r; do
    [[ -n "$r" ]] || continue
    has_env "$r" "$env" || continue
    held="$(gh api "repos/$owner/$r/environments/$env/secrets" --jq '.secrets[] | "\(.name) \(.updated_at)"')"
    wanted="$(jq -r --arg e "$env" '.environments[$e][]' "$map")"
    while IFS= read -r secret; do
      line="$(grep -F -- "$secret " <<<"$held" || true)"
      if [[ -z "$line" ]]; then
        printf 'DRIFT  %s: %s is missing from %s\n' "$r" "$secret" "$env"
        drift=$((drift + 1))
      else
        stamp="${line#* }"
        epoch="$(jq -nr --arg t "$stamp" '$t | fromdateiso8601')"
        printf '%s %s %s %s\n' "$secret" "$epoch" "$r" "$stamp" >>"$rows"
        printf 'OK     %s: %s in %s, updated %s\n' "$r" "$secret" "$env" "$stamp"
      fi
    done <<<"$wanted"
  done <<<"$repo_list"
done <<<"$env_list"

# A copy more than an hour behind the newest of its name was not part of the last rotation.
if [[ -s "$rows" ]]; then
  # shellcheck disable=SC2094 # the file is only read while the loop runs, never written
  while read -r secret epoch r stamp; do
    newest="$(awk -v s="$secret" '$1 == s && $2 > m { m = $2 } END { print m }' "$rows")"
    if [[ $((newest - epoch)) -gt 3600 ]]; then
      printf 'DRIFT  %s: %s is stale (updated %s, newer copies exist)\n' "$r" "$secret" "$stamp"
      drift=$((drift + 1))
    fi
  done <"$rows"
fi
printf '%s drift\n' "$drift"
[[ "$drift" -eq 0 ]] || exit 1
