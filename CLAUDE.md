# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

The `monte3l` organization's `.github` repository. It has no package manager and no test suite — it is data GitHub reads directly, one bash script, and the source of the org docs site (monte3l.com), which the vendored m3l-design docs kit builds. Changes here reach other repositories, so think in terms of blast radius:

- **Root community files** (`CODE_OF_CONDUCT.md`, `CONTRIBUTING.md`, `SECURITY.md`, `SUPPORT.md`) and **`.github/ISSUE_TEMPLATE/` + `.github/pull_request_template.md`** are *live defaults* for every org repo lacking its own copy — a merge here changes them everywhere at once. Wording in these files is written for *other* repositories (e.g. "usually `pnpm verify`"), not this one.
- **`profile/README.md`** is the org's public profile page.
- **`workflow-templates/`** — each `<name>.yml` needs a matching `<name>.properties.json` (name, description, icon, categories) to appear under *Actions → New workflow*. Templates use `$default-branch`, which GitHub substitutes at copy time — keep it, don't hardcode `main`. Already-copied workflows in other repos are *not* updated by edits here.
- **`blueprint/` + `bin/apply-repo-baseline.sh`** — settings GitHub never inherits (rulesets, merge settings, Actions policy, security features, labels), as JSON data, and a script that diffs a repo against them and optionally applies them. `LICENSE`, `CODEOWNERS` and `dependabot.yml` are never inherited either; each repo keeps its own.
- **`design/README.md`** — this repo's marker that it follows m3l-design (vendored tier: `design/source/`, `tokens.css` and `SHA256SUMS` are a verbatim copy, replaced only by `sync-design.sh`; never hand-edit them). `blueprint/design-system.json` pins the release tag (`vX.Y.Z`) every org repo should record; the script only **reports** a missing or stale marker, since adopting is a commit in that repo.

## Docs site

The org site (monte3l.com) is built from this repo by the docs kit in `design/source/docs-kit/` (`docs.config.mjs` is its config). Its home page is `profile/README.md`. Two generators in `bin/site/` render the workflow-template catalog and the baseline-check catalog from `workflow-templates/` and `bin/apply-repo-baseline.sh`, and `bin/doc-parity.mjs` fails the build when documentation and code disagree: the blueprint README's "Repository standard" table against the script's item labels (`bin/lib/baseline-items.mjs` is the one parser), every template against its `.properties.json`, `design-system.json` against `design/README.md`, and `blueprint/projects.json` against the profile README's project table.

- **A new baseline item** is one `report_file`/`report_workflow` line, or an `INLINE_ITEMS` entry in `bin/lib/baseline-items.mjs` if it prints its own OK/DRIFT line, plus a row in the README table with its label in the "Reported as" column. The parity check fails until both exist.
- **A new project** goes in `blueprint/projects.json` and in `profile/README.md`'s table, with its site link on its row.
- **A new `.md` file** must be added to `pages` or `exclude` (with a reason) in `docs.config.mjs`.
- The deploy and smoke wiring is `.github/workflows/docs.yml` and `docs-live.yml`, copied from `workflow-templates/`. The Cloudflare setup is `blueprint/docs-site.md`. Pushing to `main` deploys, so the first deploy waits for the `docs-cloudflare` environment to exist.

## Commands

```sh
bin/apply-repo-baseline.sh monte3l/REPO             # read-only, exit 1 on drift
bin/apply-repo-baseline.sh monte3l/REPO --dry-run   # also prints the gh api call per drifted item
bin/apply-repo-baseline.sh monte3l/REPO --apply     # mutates the repository — confirm with the user first
```

Needs `gh` (repo admin) and `jq`. Validate edits with `bash -n bin/apply-repo-baseline.sh`, `jq . <file>` on each blueprint JSON, `shellcheck`/`actionlint` if available (not installed by default), and `node design/source/docs-kit/build.mjs --check` for the site and its parity checks (Node 24, `.node-version`).

## Blueprint script internals

- `settle LABEL CURRENT DESIRED METHOD PATH [BODY]` is the single compare-then-act primitive: both sides are `jq -S`-normalized and compared; only on mismatch does it diff/print/apply. `pick` reduces live API JSON to just the keys the blueprint file names — so **a blueprint JSON file owns exactly the keys it lists**; adding a key extends what's enforced, keys not listed are never touched.
- Rulesets are matched to live ones **by `name`** (POST if absent, PUT by id if present) and compared after `normalize_ruleset` (rules sorted by `type`). Renaming a ruleset in a file creates a second ruleset rather than renaming the old one.
- Labels are create-only: an existing label with the same name is never rewritten.
- `PUT /actions/permissions` requires `enabled`/`allowed_actions`, so the SHA-pinning item carries the live values through in its body — follow that pattern for any endpoint whose PUT needs fields the blueprint doesn't own.
- `skip LABEL REASON` prints `SKIP` for items a private repo on a free plan cannot have (fork-PR approval, private vulnerability reporting, rulesets — the latter only on the 403 "Upgrade to GitHub Pro" answer). SKIP is not drift and never sets exit 1.
- `report_file LABEL HINT PATH...` is the report-only primitive for repository files (CODEOWNERS, `.gitleaks.toml`, `.gitattributes`, …): OK if any PATH exists, DRIFT otherwise, never applied. `blueprint/files/` holds the starting points the hints name. A new required file is one `report_file` line plus a row in `blueprint/README.md`'s "Repository standard".
- `report_workflow LABEL HINT PATTERN...` is the same idea for workflow controls: every extended-regex PATTERN must match the concatenated text of the repo's workflows. Use it, not `report_file`, for anything a repository may run from a workflow it already has.
- The `docs site` items apply only to a repository with a `docs.config.mjs` (otherwise one `SKIP`). `docs site: daily check` loops over the workflow files itself, because the schedule and the live check must be in the same file; that is why the first workflow loop also records `workflow_names`.
- `environments.example.json` is deliberately not applied (needs real reviewer ids).
- The `env-janitor:` items apply only to a repository with `.github/environments.json` (otherwise one `SKIP`). `--apply` sets the environment, its `main` policy and the repository's access to the two org secrets: that last one is an **org-level** write (`PUT orgs/OWNER/actions/secrets/NAME/repositories/ID`), so confirm before `--apply` on a repository that should not hold the App key. Secrets are never created or deleted, and extra branch policies are never removed. `janitor_files` mirrors the imports of `m3l-groundwork`'s `bin/cleanup-environments.mjs`: the pin item reports a consumer whose `ref:` predates the newest commit touching them. `settle` and `skip` labels need no README row, but every inline item does (`INLINE_ITEMS`).
- `integration_id` 15368 = GitHub Actions, 57789 = code scanning — global, not org-specific.
- The `main` ruleset requires `verify`, `Dependency Review`, `CodeQL`, `Gitleaks` and `DCO sign-off` checks; the `Gitleaks` name must likewise match the job `name:` in `workflow-templates/gitleaks.yml`, and `DCO sign-off` the job `name:` in `workflow-templates/dco.yml` (which must not filter by path: a skipped required check never reports); the `Dependency Review` name must match the job `name:` in `workflow-templates/dependency-review.yml`. Likewise `verify` must stay the job `name:` of the aggregator in `workflow-templates/verify.yml`; its `needs` list is the only place lanes are enumerated. Renaming a job in a template silently breaks merges in every repo using the blueprint.

## Claude Code harness

What `.claude/` wires up here. Hooks block by exiting 2; a hook script that cannot start never blocks, except the ones marked `onFailure: block` in `.claude/settings.json`.

| File | What it does |
| --- | --- |
| `.claude/hooks/require-signoff.sh` | Blocks `git commit` without `-s` (the DCO check and the signed-commits ruleset need both) |
| `.claude/hooks/guard-git-push-signed.mjs` | Blocks `git push` when an outgoing commit is unsigned, if `commit.gpgsign` is on |
| `.claude/hooks/guard-double-background.mjs` | Blocks a Bash call that backgrounds a command twice (`run_in_background` plus `&`/`nohup`) |
| `.claude/hooks/guard-protected-paths.mjs` | Blocks edits to `design/source/**`, `design/tokens.css`, `design/SHA256SUMS` and `_site/`: re-sync the design copy with `sync-design.sh` instead |
| `.claude/hooks/guard-secret-writes.mjs` | Blocks writing `.env*` files and literal tokens or keys; `${{ secrets.X }}` references are fine |
| `.claude/hooks/verify-edit.sh` | After an edit, runs the matching `verify.yml` check (`jq`, `bash -n` + shellcheck, actionlint) when the tool is installed |
| `.claude/hooks/statusline.mjs` | The status line, with `.claude/hooks/statusline-layout.mjs` and `.claude/hooks/subagent-statusline.mjs` for layout and subagent rows |
| `.claude/agents/template-invariants-reviewer.md` | Read-only reviewer for the cross-file rules no linter checks; run it before a PR touching templates, blueprint, design or workflows |
| `.claude/skills/org-drift/SKILL.md` | Reports drift between an org repo and the blueprint |
| `.claude/skills/writing-commits/SKILL.md` | Conventional Commits with `git commit -s` and the `Co-Authored-By` trailer |
| `.claude/skills/creating-prs/SKILL.md` | Runs the `verify.yml` commands locally, pushes and opens a PR from the template; never arms auto-merge |
| `.claude/skills/finishing-work/SKILL.md` | After a merge: pull `main`, delete merged branches, prune refs |
| `.claude/skills/triaging-ci/SKILL.md` | Maps a failing job to its workflow and a local reproduction |
| `.claude/skills/watching-pr-checks/SKILL.md`, `.claude/skills/reviewing-dependabot-prs/SKILL.md`, `.claude/skills/triaging-scan-alerts/SKILL.md` | `gh`-based PR check watching, Dependabot batch review, code-scanning triage |
| `.claude/skills/harness-guidance/SKILL.md` | Refreshes this harness against Anthropic's guidance; its tracker is `docs/research/harness-refresh.md` |
| `.claude/skills/customize/SKILL.md` | The m3l-groundwork adoption skill; its output is `.groundwork/customization-report.md` |

`.groundwork/` holds the adoption record. Only its two reports are tracked (see `.gitignore`), and `docs.config.mjs` excludes `.groundwork/**` and `docs/research/**` from the docs site.

## Conventions

- Every `uses:` in workflow templates is pinned to a full commit SHA with a `# vX` comment (the blueprint enforces SHA pinning, so an unpinned action would fail in adopting repos). `actions/checkout` always gets `persist-credentials: false`. `.github/dependabot.yml` tracks those pins through a second `github-actions` entry with `directory: /workflow-templates` (Dependabot reads a non-root directory directly, one level, `*.yml`; this is source-level behavior, not documented by GitHub). Both entries use a 7-day `cooldown`. If a scheduled run never opens a PR for a stale template pin, the entry doesn't work: fall back to Renovate scoped to that folder. A bump only changes what newly adopting repos copy, but review `claude.yml` bumps closely, and note that `m3l-groundwork` keeps its own copies that these PRs do not touch.
- Workflows start with top-level `permissions: {}` (or `read-all`/`contents: read`) and grant per job; each has `concurrency` and `timeout-minutes`.
- `claude.yml` gates every trigger on `author_association` ∈ OWNER/MEMBER/COLLABORATOR — never relax this; on public repos it is the only thing stopping outsiders from triggering a write-scoped job holding the API secret. `use_commit_signing: true` exists because the `main` ruleset requires signed commits.
- `gitleaks.yml` pins `GITLEAKS_VERSION` by hand — Dependabot doesn't track it. Same for the actionlint image tag and zizmor `version` in `workflow-lint.yml`.
- Commits: Conventional Commits, `git commit -s` (DCO sign-off), and signed. Prose style across docs: short, plain sentences explaining **why**, tables for file/option listings, GitHub `> [!WARNING]`-style callouts.
- **m3l-design** is a standing rule for every `monte3l` repo: markdown uses bold (not italics), GitHub alerts matched to severity (max two in a row), plain sentences and tables for tabular data. Copy-based from a published `monte3l/m3l-design` release (`bin/sync-design.sh vX.Y.Z`), never a live dependency. When `blueprint/design-system.json`'s version changes, re-sync `design/` (`sync-design.sh vX.Y.Z <this repo>`) in the same commit, which also rewrites the version in `design/README.md`; the parity check compares the two. The org standard (content vs vendored tier) is in `blueprint/README.md`'s "Design system" section.
- The blueprint's rationale/checklist lives in `m3l-groundwork`'s `docs/github-blueprint.md`; keep `blueprint/README.md`'s file table in sync when changing blueprint JSON.
