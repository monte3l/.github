---
name: org-drift
description: Report how far every monte3l repository has drifted from the org baseline in `blueprint/`. Runs the read-only `bin/apply-repo-baseline.sh` against each repo and summarises OK, DRIFT and SKIP per repo and per item, including design-system marker drift. Use when the user types /org-drift or asks for an org-wide drift, baseline or compliance check.
disable-model-invocation: true
---

# org-drift

Compare every repository in the `monte3l` organization against this repo's blueprint and report the result as one table. The check is read-only. It exists so the user can see the whole org at once instead of running the script repo by repo.

## Rules

- Run the script in its default check mode only. Never pass `--apply`: it mutates repository settings, and `--dry-run` adds nothing the report needs.
- Exit code 1 from the script means drift was found. It is a result, not a failure, so keep going to the next repo.
- Exit code 2 means a tool is missing or an option was wrong. Stop and tell the user.

## Steps

1. Confirm the working directory is this repo (`bin/apply-repo-baseline.sh` exists) and that `gh auth status` succeeds.
2. List the repos: `gh repo list monte3l --json name,isArchived,isFork --limit 200`. Skip archived repos and forks, and say how many were skipped.
3. For each remaining repo, run `bin/apply-repo-baseline.sh monte3l/<repo>` and capture the output and exit code. Run them one after another: the script makes many `gh api` calls and parallel runs risk rate limits.
4. Parse each output line by its prefix. The script prints `OK`, `DRIFT` or `SKIP`, then the item label. The last line is a summary count.
5. Report the results as described below.

## Report

Start with a summary table, one row per repo:

| Repo | OK | DRIFT | SKIP |
|---|---|---|---|

Then list every drifted item, grouped by repo, in a second table:

| Repo | Item | Detail |
|---|---|---|

Give the design-system item its own mention when it drifts. The script only reports it, because adopting m3l-design is a commit in that repo, not a setting. Say which case it is: marker missing, or version differs from the one pinned in `blueprint/design-system.json`.

Treat SKIP as informational. It means a private repo on a free plan cannot have that feature, and it never counts as drift.

## Finish

End with the exact command to fix one repo, for example `bin/apply-repo-baseline.sh monte3l/<repo> --apply`, and state that it mutates the repository and needs the user's confirmation. Do not run it.
