---
reviewed: 2026-11-19
sources:
  - raw/workflow-copy-drift-observation.md
  - raw/github-template-repositories.md
  - raw/copier-updating.md
  - raw/github-actions-sha-pinning-policy.md
  - raw/github-reusable-workflow-check-names.md
  - raw/dependency-review-config-file.md
  - raw/gitleaks-config-precedence.md
  - raw/github-app-permissions.md
---

# Keeping copied workflows current

**Status:** Decision · **Reviewed:** 2026-11-19

A workflow copied from `workflow-templates/` is never updated by GitHub. The decision is to keep copies current with a sync that refreshes only copies that provably equal an older template version, and to defer reusable workflows. The classifier, a weekly report, the job that opens the refresh pull requests and the allow-list config file are built.

## The problem

GitHub copies the files and branches of a [template repository](../raw/github-template-repositories.md) with unrelated histories, so a later change to the template cannot be merged into a repository made from it. A workflow copied from `workflow-templates/` is likewise a one-time copy: nothing in this repository ever updated one. The baseline script sets up the settings GitHub does not copy, but nothing refreshed a workflow.

## What was measured

[Measured on 2026-11-19](../raw/workflow-copy-drift-observation.md): 76 copies in six repositories. By bytes, 23 are identical, 13 equal an older template version and 40 match none, which looks like a fleet of customised files. It is not.

| After rendering and comparing | Copies |
| --- | --- |
| Identical | 23 |
| Equivalent: only comments, blank lines or pins differ | 25 |
| **Stale**: strictly equal to an older version | **5** |
| Custom, managed templates | 14 |
| Custom, `release` and `verify` (unmanaged) | 9 |

The apparent customisation was three different things. **Data in the logic**: five of the six `docs` copies differ only in the site URL, and `dependency-review` carries a per-repository package allow-list in all six. **A documented variant**: five repositories run `check-live.mjs --metadata` in `docs-live`, which the template tells them to do when `docs.config.mjs` names a manifest. **Real per-repository work**: the `release` and `verify` lanes. Eight copies that looked stale by bytes (four `commit-lint`, four `gitleaks`) differ only in comments, so refreshing them would have been noise. The five that are stale are all `workflow-lint`: the tool versions were bumped in the template and those repositories never received it.

The 14 custom managed copies are 6 `dependency-review`, 3 `docs-live`, 1 `docs` (`m3l-design` builds from a different path), 1 `environments` (`m3l-groundwork` runs its own cleanup), 2 `gitleaks` (the same variable in another key order) and 1 `workflow-lint` (`m3l-groundwork`'s own header comment).

## Decisions

- **Sync first, reusable workflows deferred.** The drift is stale copies and data in the logic, which a sync and a little data extraction fix. A reusable workflow is [named `caller / called`](../raw/github-reusable-workflow-check-names.md) in the check runs, which would change a required check's context, and the [pinning policy](../raw/github-actions-sha-pinning-policy.md) does not cover it. Revisit if a template changes so often that rewriting whole files becomes the bottleneck.
- **Stale means a strict match with a version the template really had.** The one harmful error is calling a customised copy stale, because a refresh would overwrite someone's work. So two comparisons are made. A lenient one ignores comments, blank lines, the SPDX header and action pins, and decides only that nothing needs doing. A strict one ignores everything except those and decides that a copy is stale, because a line that starts with `#` is not always a comment: inside a script it is a shell comment, a heredoc heading or a private field, and a person who commented a step out has left one behind. An early version used the lenient comparison for both and called such copies stale. Dependabot owns the pins in each repository.
- **A variant is a marked block, not a fork.** A `# sync:if manifest` block in `docs-live.yml` is kept only in a repository whose flags include `manifest`, because `--metadata` fails when there is no manifest to compare. The tool checks each flag against the repository's own `docs.config.mjs`. The block matches three of the five repositories that have a manifest; the other two put `--metadata` in the same command, or renamed the job, and stay custom.
- **Data stays out of templates.** The package allow-list can move to `.github/dependency-review-config.yml`: the [action's config schema](../raw/dependency-review-config-file.md) accepts it, and an input set in the workflow overrides the file, so the workflow must stop setting it. The action fails on a missing file and on one with no key, so every repository needs the file and a starter holds `allow-dependencies-licenses: []`. The site URL is a parameter filled from `projects.json`.
- **`GITLEAKS_CONFIG` is redundant, and nothing is changed for it.** [Gitleaks](../raw/gitleaks-config-precedence.md) already reads `.gitleaks.toml` at the scan root. The template sets the variable anyway, so do all six copies, and the two copies called custom differ only in key order.
- **The bot is a separate App.** Editing a workflow file needs the Workflows permission, which [the release App does not hold](../raw/github-app-permissions.md). With it, whoever holds the key could open a pull request that changes what CI runs. A separate App, installed on the consumers only and with its key in a protected environment, keeps that apart from releasing. It will only open pull requests, and a person merges.

## What exists and what is next

Built: the allow-list config file (the template reads `.github/dependency-review-config.yml`, and a baseline item requires it), `template-sync.yml`, which opens the refresh pull requests as the `monte3l-sync` App, `bin/template-sync.mjs`, a read-only classifier that stops with an error, and never reports "nothing", when it cannot read a repository or the template history, `blueprint/sync.json`, a parity gate on that file, and a weekly job that keeps one issue for the stale copies and for a flag that disagrees with a repository. Next: `bin/new-repo.sh`.

## What is unverified

- **The config-file behaviour** (a missing or keyless file fails, an empty list is accepted) was read from the action's source at `a1d282b`, not run. The first consumer migration settles it.
- **Settled by the first real runs on 2026-11-19:** `createCommitOnBranch` committed a workflow file with the Workflows permission, GitHub signed the commit, and a later run closed the older bot pull request. The documented table lists only the REST endpoints, so this was not knowable from it.
- **That a same-repository pull request's workflows run with the repository's secrets** is general GitHub behaviour that was not re-read for this page. It is the reason the permission is treated as significant.
- **[Copier](../raw/copier-updating.md)** was not evaluated against the TypeScript scaffolder. The sync above does not need it.
