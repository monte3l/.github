# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

The `monte3l` organization's `.github` repository. It has no build, no package manager and no tests — it is data GitHub reads directly, plus one bash script. Changes here reach other repositories, so think in terms of blast radius:

- **Root community files** (`CODE_OF_CONDUCT.md`, `CONTRIBUTING.md`, `SECURITY.md`, `SUPPORT.md`) and **`.github/ISSUE_TEMPLATE/` + `.github/pull_request_template.md`** are *live defaults* for every org repo lacking its own copy — a merge here changes them everywhere at once. Wording in these files is written for *other* repositories (e.g. "usually `pnpm verify`"), not this one.
- **`profile/README.md`** is the org's public profile page.
- **`workflow-templates/`** — each `<name>.yml` needs a matching `<name>.properties.json` (name, description, icon, categories) to appear under *Actions → New workflow*. Templates use `$default-branch`, which GitHub substitutes at copy time — keep it, don't hardcode `main`. Already-copied workflows in other repos are *not* updated by edits here.
- **`blueprint/` + `bin/apply-repo-baseline.sh`** — settings GitHub never inherits (rulesets, merge settings, Actions policy, security features, labels), as JSON data, and a script that diffs a repo against them and optionally applies them. `LICENSE`, `CODEOWNERS` and `dependabot.yml` are never inherited either; each repo keeps its own.
- **`design/README.md`** — this repo's marker that it follows m3l-design (content tier: no CSS or fonts are vendored here). `blueprint/design-system.json` pins the release tag (`vX.Y.Z`) every org repo should record; the script only **reports** a missing or stale marker, since adopting is a commit in that repo.

## Commands

```sh
bin/apply-repo-baseline.sh monte3l/REPO             # read-only, exit 1 on drift
bin/apply-repo-baseline.sh monte3l/REPO --dry-run   # also prints the gh api call per drifted item
bin/apply-repo-baseline.sh monte3l/REPO --apply     # mutates the repository — confirm with the user first
```

Needs `gh` (repo admin) and `jq`. Validate edits with `bash -n bin/apply-repo-baseline.sh`, `jq . <file>` on each blueprint JSON, and `shellcheck`/`actionlint` if available (not installed by default).

## Blueprint script internals

- `settle LABEL CURRENT DESIRED METHOD PATH [BODY]` is the single compare-then-act primitive: both sides are `jq -S`-normalized and compared; only on mismatch does it diff/print/apply. `pick` reduces live API JSON to just the keys the blueprint file names — so **a blueprint JSON file owns exactly the keys it lists**; adding a key extends what's enforced, keys not listed are never touched.
- Rulesets are matched to live ones **by `name`** (POST if absent, PUT by id if present) and compared after `normalize_ruleset` (rules sorted by `type`). Renaming a ruleset in a file creates a second ruleset rather than renaming the old one.
- Labels are create-only: an existing label with the same name is never rewritten.
- `PUT /actions/permissions` requires `enabled`/`allowed_actions`, so the SHA-pinning item carries the live values through in its body — follow that pattern for any endpoint whose PUT needs fields the blueprint doesn't own.
- `skip LABEL REASON` prints `SKIP` for items a private repo on a free plan cannot have (fork-PR approval, private vulnerability reporting, rulesets — the latter only on the 403 "Upgrade to GitHub Pro" answer). SKIP is not drift and never sets exit 1.
- `report_file LABEL HINT PATH...` is the report-only primitive for repository files (CODEOWNERS, `.gitleaks.toml`, `.gitattributes`, …): OK if any PATH exists, DRIFT otherwise, never applied. `blueprint/files/` holds the starting points the hints name. A new required file is one `report_file` line plus a row in `blueprint/README.md`'s "Repository standard".
- `environments.example.json` is deliberately not applied (needs real reviewer ids).
- `integration_id` 15368 = GitHub Actions, 57789 = code scanning — global, not org-specific.
- The `main` ruleset requires `verify`, `Dependency Review`, `CodeQL` and `Gitleaks` checks; the `Gitleaks` name must likewise match the job `name:` in `workflow-templates/gitleaks.yml`; the `Dependency Review` name must match the job `name:` in `workflow-templates/dependency-review.yml`. Renaming a job in a template silently breaks merges in every repo using the blueprint.

## Conventions

- Every `uses:` in workflow templates is pinned to a full commit SHA with a `# vX` comment (the blueprint enforces SHA pinning, so an unpinned action would fail in adopting repos). `actions/checkout` always gets `persist-credentials: false`. `.github/dependabot.yml` tracks those pins through a second `github-actions` entry with `directory: /workflow-templates` (Dependabot reads a non-root directory directly, one level, `*.yml`; this is source-level behavior, not documented by GitHub). Both entries use a 7-day `cooldown`. If a scheduled run never opens a PR for a stale template pin, the entry doesn't work: fall back to Renovate scoped to that folder. A bump only changes what newly adopting repos copy, but review `claude.yml` bumps closely, and note that `m3l-groundwork` keeps its own copies that these PRs do not touch.
- Workflows start with top-level `permissions: {}` (or `read-all`/`contents: read`) and grant per job; each has `concurrency` and `timeout-minutes`.
- `claude.yml` gates every trigger on `author_association` ∈ OWNER/MEMBER/COLLABORATOR — never relax this; on public repos it is the only thing stopping outsiders from triggering a write-scoped job holding the API secret. `use_commit_signing: true` exists because the `main` ruleset requires signed commits.
- `gitleaks.yml` pins `GITLEAKS_VERSION` by hand — Dependabot doesn't track it.
- Commits: Conventional Commits, `git commit -s` (DCO sign-off), and signed. Prose style across docs: short, plain sentences explaining **why**, tables for file/option listings, GitHub `> [!WARNING]`-style callouts.
- **m3l-design** is a standing rule for every `monte3l` repo: markdown uses bold (not italics), GitHub alerts matched to severity (max two in a row), plain sentences and tables for tabular data. Copy-based from a published `monte3l/m3l-design` release (`bin/sync-design.sh vX.Y.Z`), never a live dependency. When `blueprint/design-system.json`'s version changes, update the version in `design/README.md` in the same commit. The org standard (content vs vendored tier) is in `blueprint/README.md`'s "Design system" section.
- The blueprint's rationale/checklist lives in `m3l-groundwork`'s `docs/github-blueprint.md`; keep `blueprint/README.md`'s file table in sync when changing blueprint JSON.
