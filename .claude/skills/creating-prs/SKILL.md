---
name: creating-prs
description: >-
  Run this repo's checks, push the branch, open a PR that fills the pull request
  template, and confirm it is mergeable. Use for /creating-prs, "open a PR",
  "create a pull request", "ship this for review", or after finishing a change.
  Requires gh CLI auth.
---

# creating-prs

Takes a branch with committed work to an open, mergeable PR. `main` is
protected by a ruleset: every change goes through a PR, needs a code-owner
approval of the last push, resolved threads, signed commits and the required
checks (`verify`, `Dependency Review`, `CodeQL`, `Gitleaks`, `DCO sign-off`).
Auto-merge is off for this repo (`allow_auto_merge: false` in
`blueprint/repo-settings.json`), so a human merges.

## Steps

### 1: Preflight

Confirm you are not on `main` and `git status --porcelain` is empty. Branches
are named `feat/<slug>`, `fix/<slug>` or `ci/<slug>`.

### 2: Resync

```bash
git fetch origin
git rebase origin/main
```

### 3: Run the repo's checks

These are the commands `.github/workflows/verify.yml` runs. Run the ones that
match what you touched, and all of them for anything under `bin/`,
`blueprint/`, `workflow-templates/`, `design/` or `docs.config.mjs`:

```bash
node design/source/docs-kit/build.mjs --check        # docs site + parity checks
bash -n bin/apply-repo-baseline.sh && shellcheck bin/apply-repo-baseline.sh
find blueprint workflow-templates -name '*.json' -print0 | xargs -0 -n1 jq empty
actionlint .github/workflows/*.yml workflow-templates/*.yml
```

`shellcheck` and `actionlint` may be missing locally; CI still runs them, so say
so in the PR rather than skipping silently.

### 4: Review before pushing

For a change under `workflow-templates/`, `blueprint/`, `design/` or
`.github/workflows/`, dispatch the `template-invariants-reviewer` agent over the
diff. Fix every FAIL it reports first: it checks the cross-file rules no linter
covers, such as job names that the `main` ruleset requires.

### 5: Push

```bash
git push -u origin <branch>
```

Never force-push a shared branch. After a rebase use `--force-with-lease`.

### 6: Open the PR

Read `.github/pull_request_template.md` and follow it. The title is a
Conventional Commit summarizing the whole PR (imperative, at most 70 chars). In
"What and why", say what reaches other repositories: a live community-file
default or a blueprint change takes effect org-wide on merge. Tick the checklist
honestly, and leave `pnpm verify` unticked in favour of the commands from step 3
(that wording in the template is written for other repositories).

```bash
gh pr create --title "<title>" --body "$(cat <<'EOF'
<body>
EOF
)"
```

### 7: Confirm mergeability

```bash
gh pr view --json mergeable,mergeStateStatus
```

If `CONFLICTING`, resolve it now. Then report the PR URL and stop: a human
review and merge follow. Use `/watching-pr-checks` to follow the checks and
`/finishing-work` once it merges.

## Notes

- Use `gh` for every GitHub operation here.
- Never arm auto-merge or merge on the user's behalf.
