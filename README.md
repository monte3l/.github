# monte3l/.github

[![verify](https://github.com/monte3l/.github/actions/workflows/verify.yml/badge.svg?branch=main)](https://github.com/monte3l/.github/actions/workflows/verify.yml)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/monte3l/.github/badge)](https://securityscorecards.dev/viewer/?uri=github.com/monte3l/.github)
[![REUSE status](https://api.reuse.software/badge/github.com/monte3l/.github)](https://api.reuse.software/info/github.com/monte3l/.github)

The single reference for what is an organization default in `monte3l`, and how
it reaches a repository.

> [!IMPORTANT]
> **Anything this README does not list as an organization default is not
> applied as one.** See [Non-inheritance](#non-inheritance-the-rule) before you
> assume a repository gets something from here.

## Who is this for

- An **owner starting a repository** who wants to know which settings and files
  they must add themselves, and how to check they got them right.
- Someone **changing a default** who needs to know which repositories the change
  reaches, and when.
- Anyone asking **why a repository did not get a file or setting**. The answer
  is usually that GitHub does not inherit it.

## Quickstart

You need `gh`, authenticated with admin rights on the repository, and `jq`.
Check any repository against the organization baseline with this command. It is
read-only and exits `1` on drift:

```sh
bin/apply-repo-baseline.sh monte3l/<repo>
```

To start a new repository:

1. Add `design/README.md` with the m3l-design tag from
   `blueprint/design-system.json`. See [Design system](#design-system).
2. Copy the README skeleton from `blueprint/files/README.md`. The order it
   follows is in `blueprint/README.md`, under "README structure".
3. Copy the workflow templates you need from `workflow-templates/`, and the
   starting points in `blueprint/files/`.
4. Run the check above and fix what it reports.
5. Read [`blueprint/README.md`](blueprint/README.md), then run the script with
   `--apply` to write the settings GitHub never inherits.

For the whole organization at once, run `/org-drift` in Claude Code from this
repository. [Parity check](#parity-check) lists what the script cannot see.

## Non-inheritance: the rule

GitHub reads this repository for a short, fixed list of files. Everything else
a repository needs, it carries itself. These are not defaults, whatever this
repository holds:

| Not a default | Why | What a repository does |
| --- | --- | --- |
| `LICENSE` | GitHub: "You cannot create a default license file." | Keeps its own |
| `CODEOWNERS` | Not in GitHub's list of supported default files | Keeps its own at `.github/CODEOWNERS` |
| `dependabot.yml` | Not in that list | Keeps its own. This organization's convention is a `cooldown` on every entry |
| Workflows already copied from `workflow-templates/` | A template is copied once. Later edits here never reach the copy | Updates its copy by hand |
| Secrets (`GITLEAKS_LICENSE`, `ANTHROPIC_API_KEY`) | Organization secrets have their own visibility list; repository secrets are per repository | An owner shares or sets them |
| GitHub App installations | Settings, not files | An owner installs them |
| Code scanning default setup | A per-repository setting | An owner enables it |
| Organization policy (default repository permission, allowed actions, secret visibility) | Settings, not files | An owner sets it |
| Rulesets, merge settings, Actions policy, labels | Not files. `blueprint/` holds them as data | Someone runs `bin/apply-repo-baseline.sh --apply` |

Two further limits on files that are inherited:

- **Per file, not per folder, for community files.** A repository that has its
  own `CONTRIBUTING.md` uses it and ignores this one.
- **All or nothing for issue forms.** If a repository has any file in its own
  `.github/ISSUE_TEMPLATE/`, none of this repository's issue forms or
  `config.yml` are used there.

## Scope and principle

This repository holds data that GitHub reads directly, plus one bash script. It
has no build and no tests. The principle: **offer a default only where GitHub
can deliver it, and describe everything else as data a script can check.**
Where nothing can check a claim, this README says so.

## Categories

### Community files

`CODE_OF_CONDUCT.md`, `CONTRIBUTING.md`, `SECURITY.md` and `SUPPORT.md`.

- **Enforced:** nothing. GitHub serves them to any repository that has no copy
  of its own.
- **Offered:** the wording. It is written for other repositories, for example
  "usually `pnpm verify`".
- **A repository adds:** a copy only if it needs different wording. It must add
  its own `LICENSE`.

### Issue forms and the pull request template

- **Enforced:** nothing.
- **Offered:** three forms, a chooser with blank issues off that points
  vulnerability reports at `SECURITY.md`, and a pull request template.
- **A repository adds:** its own `ISSUE_TEMPLATE/` folder if it wants any
  different form. Doing so discards all of these, including the chooser and the
  blank-issues setting.

### Workflow templates

- **Enforced:** nothing. A template is a starting point, and each needs its
  `.properties.json` card to appear.
- **Offered:** `claude`, `dependency-review`, `gitleaks`, `reuse`, `scorecard`,
  `workflow-lint`.
- **A repository adds:** the copy. The `main` ruleset requires checks named
  `verify`, `Dependency Review`, `CodeQL`, `Gitleaks` and `DCO sign-off`:

| Required check | Provided by |
| --- | --- |
| `verify` | The repository's own workflow. No template provides it |
| `Dependency Review` | The `dependency-review` template. Its job `name:` must stay `Dependency Review` |
| `Gitleaks` | The `gitleaks` template. Its job `name:` must stay `Gitleaks` |
| `CodeQL` | Code scanning default setup, enabled by an owner |
| `DCO sign-off` | The `dco` template. Its job `name:` must stay `DCO sign-off`, and it must not filter by path, or a pull request that skips it can never merge |

> [!WARNING]
> **Renaming a job in a template silently breaks merges** in every repository
> that copied it and uses the `main` ruleset. A copy made earlier keeps the old
> name.

### Blueprint settings

`blueprint/` is JSON data. `bin/apply-repo-baseline.sh` compares it with a
repository and, only with `--apply`, writes it.

- **Enforced:** only where someone runs `--apply`. A blueprint file owns
  exactly the keys it lists.
- **Applied items:** repository settings, Actions token permission, fork PR
  approval, SHA pinning, Dependabot alerts, Dependabot security updates,
  private vulnerability reporting, the `main` and `tags` rulesets, and labels.
- **Skipped, not drift:** items a private repository on a free plan cannot
  have. The script prints `SKIP`.
- **Matched by name:** a ruleset is found by `name`. Renaming one in a file
  creates a second ruleset on the next `--apply`.
- **Reported, never applied:** the repository standard in `blueprint/README.md`.
  Files: `CODEOWNERS`, `SECURITY.md`, Gitleaks config, `.gitattributes`,
  `.editorconfig`, `REUSE.toml`, `dependabot.yml`. Workflow controls, found by
  their content and not by file name: workflow lint, REUSE check, DCO check,
  the Node pin, Scorecard (public repositories only). Open Scorecard alerts
  are listed too. Adding one is a commit in that repository.
- **A repository adds:** everything the blueprint does not own, including
  `dependabot.yml`, `CODEOWNERS` and `LICENSE`.

> [!NOTE]
> `--apply` changes repository settings. Run the read-only check first, and
> read `blueprint/README.md` before applying to a repository that does not
> produce the four required checks.

### Design system

Every repository follows **m3l-design**
([monte3l/m3l-design](https://github.com/monte3l/m3l-design)), copied from a
published release and never imported.

- **Enforced:** only that `design/README.md` records the tag pinned in
  `blueprint/design-system.json`. The script reports a mismatch and cannot fix
  it, because adopting is a commit in the repository.
- **Offered:** two tiers. Content tier: markdown rules and a marker line.
  Vendored tier: `bin/sync-design.sh vX.Y.Z <repo>` from an `m3l-design`
  checkout, with local changes in `design/local/`.
- **Not checked:** that `design/source/` is unedited
  (`cd design && shasum -a 256 -c SHA256SUMS` does that in a vendored
  repository), and that the markdown rules are followed.

## Parity check

**Settings and design version:**

```sh
bin/apply-repo-baseline.sh monte3l/<repo>
```

It is read-only and exits 1 on drift. `--dry-run` also prints the `gh api` call
for each drifted item. It needs `gh` with admin on the repository, and `jq`.
For every repository in the organization at once, run `/org-drift` in Claude
Code from this repository.

**What the script cannot see.** Check these by hand:

| Claim | How to check | Result if it fails |
| --- | --- | --- |
| Required check names match the templates | Compare `blueprint/rulesets/main-branch.json` with each copied workflow's job `name:` | Merges block with a check that never reports |
| `GITLEAKS_LICENSE` is shared with the repository | `gh api orgs/monte3l/actions/secrets/GITLEAKS_LICENSE/repositories` | The Gitleaks job fails |
| CodeQL default setup is on | `gh api repos/monte3l/<repo>/code-scanning/default-setup` shows `"state": "configured"` | The `CodeQL` check never reports |
| Every `uses:` is pinned to a SHA | The Actions setting is enforced by the script. Whether a given workflow complies is only found when it runs | The run fails |
| Repository files and workflow controls are correct, not just present | The script only checks that the file exists or the control appears. `.gitattributes` in `m3l-design` must stay `* -text` | A copied default can break checksums |
| Community files, issue forms and workflow copies match the defaults | **No check exists.** Compare by eye | Silent divergence |

## Changing a default

Edit the file on a branch and open a pull request. Name the repositories it
affects.

| Change | What reaches repositories when it merges |
| --- | --- |
| Community file, issue form, pull request template | Every repository without its own copy, at once |
| `profile/README.md` | The organization page, at once |
| Workflow template | Nothing already copied. Only repositories that copy it later |
| `blueprint/*.json` | Nothing until someone runs `--apply`. The read-only check reports the new drift immediately |
| `blueprint/design-system.json` | The `design system` line of the check, at once. Repositories on the old tag show drift until they re-sync |
| `bin/apply-repo-baseline.sh` | Every later run of the script |

Rules for edits:

- Keep each change small.
- Keep `blueprint/README.md`'s file table in step with the blueprint.
- When `design-system.json` changes, update `design/README.md` in the same
  commit.
- Commit with `git commit -s`, signed, as a Conventional Commit.

## Parity table

One row per tracked file. **Delivery** is one of:

| Delivery | Meaning |
| --- | --- |
| **Inherited** | GitHub applies it to every repository that lacks its own |
| **Template** | Offered under Actions, New workflow. Copied once by a person |
| **Applied** | `bin/apply-repo-baseline.sh --apply` writes it to the repository |
| **Checked** | The script compares and reports. It never changes it |
| **Not delivered** | Applies to this repository only, or is reference material |

| Item | Source path | Delivery | What a repository does itself | How it is verified |
| --- | --- | --- | --- | --- |
| Code of conduct | `CODE_OF_CONDUCT.md` | **Inherited** | Nothing, or its own copy | Not verified. `gh api repos/monte3l/<repo>/community/profile` shows whether one is found |
| Contributing guide | `CONTRIBUTING.md` | **Inherited** | Nothing, or its own copy. Wording is written for other repositories | Not verified |
| Security policy | `SECURITY.md` | **Inherited**, but every repository needs its own copy to score above 4 on Scorecard. Private vulnerability reporting must be on | Its own copy with an absolute advisory URL and an accepted-findings table | Script: `security policy`, `security: private vulnerability reporting` |
| Support | `SUPPORT.md` | **Inherited** | Nothing, or its own copy | Not verified |
| Bug report form | `.github/ISSUE_TEMPLATE/bug_report.yml` | **Inherited** (all or nothing, see above) | Nothing, or its own `ISSUE_TEMPLATE/` folder | Not verified |
| Feature request form | `.github/ISSUE_TEMPLATE/feature_request.yml` | **Inherited** (same) | Same | Not verified |
| Question form | `.github/ISSUE_TEMPLATE/question.yml` | **Inherited** (same) | Same | Not verified |
| Issue chooser, blank issues off | `.github/ISSUE_TEMPLATE/config.yml` | **Inherited** (same) | Same | Not verified |
| Pull request template | `.github/pull_request_template.md` | **Inherited** | Nothing, or its own copy | Not verified |
| Organization profile | `profile/README.md` | **Inherited** (shown on the organization page only) | Nothing | Not verified |
| Claude workflow | `workflow-templates/claude.yml` | **Template** | Copy it, add the `ANTHROPIC_API_KEY` secret | Not verified. Never relax its `author_association` gate |
| Claude template card | `workflow-templates/claude.properties.json` | **Template** | Nothing | `jq empty` in `verify.yml` |
| Dependency Review workflow | `workflow-templates/dependency-review.yml` | **Template** | Copy it. Its job name `Dependency Review` is a required check | Job name matched by hand (see [Parity check](#parity-check)) |
| Dependency Review card | `workflow-templates/dependency-review.properties.json` | **Template** | Nothing | `jq empty` in `verify.yml` |
| Gitleaks workflow | `workflow-templates/gitleaks.yml` | **Template** | Copy it. Its job name `Gitleaks` is a required check. The organization secret `GITLEAKS_LICENSE` must be shared with the repository | Job name matched by hand. Secret visibility checked by hand |
| Gitleaks card | `workflow-templates/gitleaks.properties.json` | **Template** | Nothing | `jq empty` in `verify.yml` |
| Scorecard workflow | `workflow-templates/scorecard.yml` | **Template** | Copy it, public repositories only. Not a required check | Script: `Scorecard workflow`, and `Scorecard alerts` for every open alert. **Skipped** for private repositories |
| Scorecard card | `workflow-templates/scorecard.properties.json` | **Template** | Nothing | `jq empty` in `verify.yml` |
| REUSE workflow | `workflow-templates/reuse.yml` | **Template** | Copy it, or run `reuse lint` from a workflow it already has | Script: `REUSE check` (looks for the control, not the file name) |
| REUSE card | `workflow-templates/reuse.properties.json` | **Template** | Nothing | `jq empty` in `verify.yml` |
| DCO workflow | `workflow-templates/dco.yml` | **Template** | Copy it, or check `Signed-off-by` from a workflow it already has under the job name `DCO sign-off`, which the `main` ruleset requires | Script: `DCO check` (looks for the control, not the file name) |
| DCO card | `workflow-templates/dco.properties.json` | **Template** | Nothing | `jq empty` in `verify.yml` |
| Workflow lint workflow | `workflow-templates/workflow-lint.yml` | **Template** | Copy it, or add actionlint and zizmor to a workflow it already has | Script: `workflow lint` (looks for the control, not the file name) |
| Workflow lint card | `workflow-templates/workflow-lint.properties.json` | **Template** | Nothing | `jq empty` in `verify.yml` |
| Verify workflow | `workflow-templates/verify.yml` | **Template** | Copy it, replace the placeholder lane with the repository's own checks, and keep the job name `verify`, which the `main` ruleset requires | Job name matched by hand (see [Parity check](#parity-check)) |
| Verify card | `workflow-templates/verify.properties.json` | **Template** | Nothing | `jq empty` in `verify.yml` |
| Repository settings | `blueprint/repo-settings.json` | **Applied** | Nothing after `--apply` | Script: `repository settings` |
| Actions token and PR approval | `blueprint/actions.json` (`workflow`) | **Applied** | Nothing after `--apply` | Script: `Actions: workflow token and PR approval` |
| Fork PR approval | `blueprint/actions.json` (`fork_pr_approval`) | **Applied**. **Skipped** for private repositories | Nothing | Script: `Actions: fork PR approval` |
| SHA pinning required | `blueprint/actions.json` (`sha_pinning`) | **Applied** | Pin every `uses:` to a full commit SHA | Script: `Actions: SHA pinning required` |
| Dependabot alerts and security updates | Hard-coded in the script, no file | **Applied** | Nothing | Script: `security: Dependabot alerts`, `security: Dependabot security updates` |
| Private vulnerability reporting | Hard-coded in the script, no file | **Applied**. **Skipped** for private repositories | Nothing | Script: `security: private vulnerability reporting` |
| `main` ruleset | `blueprint/rulesets/main-branch.json` | **Applied**. **Skipped** on a free-plan private repository | Produce the four required checks | Script: `ruleset: main` |
| `tags` ruleset | `blueprint/rulesets/tags.json` | **Applied**. **Skipped** (same) | Nothing | Script: `ruleset: tags` |
| Labels | `blueprint/labels.json` | **Applied**, create-only | Nothing. An existing label is never rewritten | Script: label lines (they report OK or DRIFT inline) |
| Design version pin | `blueprint/design-system.json` | **Checked** | Record that tag in `design/README.md`, then run `sync-design.sh` if it has a visual surface | Script: `design system` |
| Repository standard files | `blueprint/files/` (`gitleaks.toml`, `gitattributes`, `editorconfig`, `REUSE.toml`, `dependabot.yml`) | **Checked**. Starting points only | Commit its own copy of each | Script: `Gitleaks config`, `line endings`, `editor config`, `REUSE`, `Dependabot` |
| `CODEOWNERS` | `.github/CODEOWNERS` | **Checked** | Keep its own (never inherited) | Script: `CODEOWNERS` |
| README skeleton | `blueprint/files/README.md` | **Not delivered**. A starting point, copied by hand | Copy it and fill it in | Not verified |
| Environment example | `blueprint/environments.example.json` | **Not delivered**. Needs real reviewer ids | Create its own environments | Not verified |
| Blueprint guide | `blueprint/README.md` | **Not delivered** | Nothing | Not verified |
| The script | `bin/apply-repo-baseline.sh` | **Not delivered**. It is the tool | Nothing | `bash -n` and `shellcheck` in `verify.yml` |
| This repository's design marker | `design/README.md` | **Not delivered**. Content tier for this repository only | Nothing | Script, run against `monte3l/.github` |
| This repository's Dependabot | `.github/dependabot.yml` | **Not delivered** | Nothing | Not verified |
| This repository's verify workflow | `.github/workflows/verify.yml` | **Not delivered**. Produces the `verify` check here | Nothing | Runs on every pull request |
| This repository's dependency review | `.github/workflows/dependency-review.yml` | **Not delivered** | Nothing | Runs on every pull request |
| This repository's Gitleaks | `.github/workflows/gitleaks.yml` | **Not delivered** | Nothing | Runs on every pull request, weekly, and on demand |
| This repository's REUSE, workflow lint and Scorecard | `.github/workflows/reuse.yml`, `workflow-lint.yml`, `scorecard.yml` | **Not delivered** | Nothing | Script, run against `monte3l/.github` |
| This repository's repository-standard files | `.gitleaks.toml`, `.gitattributes`, `.editorconfig`, `REUSE.toml`, `LICENSES/MIT.txt` | **Not delivered** | Nothing | Script, run against `monte3l/.github` |
| Agent tooling | `.claude/` (settings, hooks, `template-invariants-reviewer` agent, `org-drift` skill) | **Not delivered**. For this repository only | Nothing | Not verified. `/org-drift` runs the script across the organization |
| Agent guidance | `CLAUDE.md` | **Not delivered** | Nothing | Not verified |
| License | `LICENSE` | **Not delivered**. Never inherited | Nothing | Not verified |
| This file | `README.md` | **Not delivered** | Nothing | Not verified |

## Repository status

> [!NOTE]
> **A snapshot, not live data.** Taken on 2026-10-19 with
> `bin/apply-repo-baseline.sh monte3l/<repo>` from `main` at `d7b1cea`. The
> only drift is three repository files in `m3l-design`. Run the script for the
> current result.

| Repository | Visibility | Last baseline run | Result | CodeQL default setup | `GITLEAKS_LICENSE` shared | Inherited community files |
| --- | --- | --- | --- | --- | --- | --- |
| `monte3l/.github` | Public | 2026-10-19 | 21 OK, 0 drift | Configured | Yes | None. It is the source |
| `monte3l/m3l-design` | Public | 2026-10-19 | 18 OK, 3 drift: Gitleaks config, editor config, Scorecard workflow | Configured | Yes | All |
| `monte3l/m3l-groundwork` | Public | 2026-10-19 | 21 OK, 0 drift | Configured | Yes | `SUPPORT.md` |
| `monte3l/m3l-prompt-optimizer` | Public | 2026-10-19 | 21 OK, 0 drift | Configured | Yes | `CODE_OF_CONDUCT.md`, `SUPPORT.md` |
| `monte3l/m3l-output-governor` | Public | 2026-10-19 | 21 OK, 0 drift | Configured | Yes | Everything except the pull request template |

Every repository has its own `LICENSE` and `.github/CODEOWNERS`, and the
script confirms both through its `CODEOWNERS` line. No repository has copied
`claude.yml`, so `ANTHROPIC_API_KEY` is not set anywhere.

## Working on this repo

This repository has no build and no tests. CI (`verify.yml`) runs these:

```sh
bash -n bin/apply-repo-baseline.sh
shellcheck bin/apply-repo-baseline.sh
find blueprint workflow-templates -name '*.json' -print0 | xargs -0 -n1 jq empty
docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:1.7.7 -color .github/workflows/*.yml workflow-templates/*.yml
```

The rules for edits are under [Changing a default](#changing-a-default).

### Project docs

- [`CONTRIBUTING.md`](CONTRIBUTING.md), [`SECURITY.md`](SECURITY.md),
  [`SUPPORT.md`](SUPPORT.md) and [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) --
  the community files other repositories inherit. Their wording is written for
  those repositories.
- [`blueprint/README.md`](blueprint/README.md) -- the settings blueprint, the
  repository standard and the README structure.
- [`design/README.md`](design/README.md) -- this repository's m3l-design marker.
- [`profile/README.md`](profile/README.md) -- the organization profile page.
- [`CLAUDE.md`](CLAUDE.md) -- the script's internals and conventions, written
  for Claude Code agents.

## License

MIT, see [`LICENSE`](LICENSE).
