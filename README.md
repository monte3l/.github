# monte3l/.github

[![verify](https://github.com/monte3l/.github/actions/workflows/verify.yml/badge.svg?branch=main)](https://github.com/monte3l/.github/actions/workflows/verify.yml)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/monte3l/.github/badge)](https://securityscorecards.dev/viewer/?uri=github.com/monte3l/.github)
[![REUSE status](https://api.reuse.software/badge/github.com/monte3l/.github)](https://api.reuse.software/info/github.com/monte3l/.github)

The single reference for what is an organization default in `monte3l`, and how
it reaches a repository. The standard it points to is rendered at
[monte3l.com](https://monte3l.com).

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

You need `gh` with admin rights on the repository, and `jq`; see
[Requirements](#requirements). Check any repository against the organization
baseline with this command. It is read-only and exits `1` on drift:

```sh
bin/apply-repo-baseline.sh monte3l/<repo>
```

To start a new repository, add it to `blueprint/projects.json` and the
profile table first (the description, topics and site come from there), then:

```sh
bin/new-repo.sh m3l-example --kind simple            # read-only: shows every file and step
bin/new-repo.sh m3l-example --kind simple --apply    # creates it, after one confirmation
```

It writes the starter files and the workflow templates, creates the repository,
applies the settings GitHub never inherits, shares the organization secrets and
adds the repository to the organization's Apps. `--kind` adds the release
configuration, `--docs` a docs site, `--private` makes it private and
`--scaffold` starts from the groundwork CLI. It needs `gh` as an organization
owner. What is left for a person is printed at the end. See
[New repository](blueprint/README.md#new-repository).

For the whole organization at once, run `/org-drift` in Claude Code from this
repository. [Parity check](#parity-check) lists what the script cannot see.

## How it works

This repository holds data that GitHub reads directly, the scripts that check
and apply it, the tests for those scripts, and the source of the org site. The
principle: **offer a default only where GitHub can deliver it, and describe
everything else as data a script can check.** Where nothing can check a claim,
this README says so.

A change here reaches other repositories in one of four ways:

| Way | What happens |
| --- | --- |
| **Inherited** | GitHub serves the file to every repository that lacks its own copy |
| **Copied** | A person, or `bin/new-repo.sh` for a new repository, copies a template or a starter once. The **template sync** later opens a pull request in each repository whose copy has fallen behind |
| **Applied or checked** | `bin/apply-repo-baseline.sh` compares a setting with the JSON in `blueprint/`, and writes it only with `--apply` |
| **Watched** | Scheduled workflows here report drift, stale pins, upstream policy changes and stale knowledge in tracking issues |

The same repository also builds the org site ([monte3l.com](https://monte3l.com)),
whose home page is `profile/README.md`, and publishes `llms.txt`, a sitemap and
a Markdown copy of every page for agents. It also holds `knowledge/`, a wiki of
decisions and research that an LLM maintains under review, with a source card
behind every claim. The [Parity table](#parity-table) gives the delivery of every
file.

## Non-inheritance: the rule

GitHub reads this repository for a short, fixed list of files. Everything else
a repository needs, it carries itself. These are not defaults, whatever this
repository holds:

| Not a default | Why | What a repository does |
| --- | --- | --- |
| `LICENSE` | GitHub: "You cannot create a default license file." | Keeps its own |
| `CODEOWNERS` | Not in GitHub's list of supported default files | Keeps its own at `.github/CODEOWNERS` |
| `dependabot.yml` | Not in that list | Keeps its own. This organization's convention is a `cooldown` on every entry |
| Workflows already copied from `workflow-templates/` | A template is copied once, so an edit here never reaches the copy by itself | Merges the pull request the template sync opens for a stale managed copy, and keeps any copy it changed on purpose |
| Secrets (`GITLEAKS_LICENSE`, the release and Cloudflare ones, `ANTHROPIC_API_KEY`) | Organization secrets have their own visibility list; repository secrets are per repository | An owner shares or sets them. `bin/new-repo.sh` shares them with a repository it creates |
| GitHub App installations | Settings, not files. They are installed on selected repositories, so a new repository is not covered until it is added | An owner adds it. `bin/new-repo.sh` does |
| Code scanning default setup | A per-repository setting | An owner enables it |
| Organization policy (default repository permission, allowed actions, secret visibility) | Settings, not files | An owner sets it |
| Rulesets, merge settings, Actions policy, labels | Not files. `blueprint/` holds them as data | Someone runs `bin/apply-repo-baseline.sh --apply` |

Two further limits on files that are inherited:

- **Per file, not per folder, for community files.** A repository that has its
  own `CONTRIBUTING.md` uses it and ignores this one.
- **All or nothing for issue forms.** If a repository has any file in its own
  `.github/ISSUE_TEMPLATE/`, none of this repository's issue forms or
  `config.yml` are used there.

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
- **Offered:** four forms (bug report, feature request, question, docs
  problem), a chooser with blank issues off that points vulnerability reports
  at `SECURITY.md` and the support guide, and a pull request template with
  three variants.
- **Variants:** GitHub shows no picker for pull request templates. The default
  is `.github/pull_request_template.md`; an author adds `?template=docs.md`,
  `?template=design-sync.md` or `?template=dependencies-release.md` to the
  pull request URL to get another. The wording is plain and warm, in the UK
  spelling of the Oxford style, and follows `blueprint/README.md`'s rules for
  markdown.
- **A repository adds:** its own `ISSUE_TEMPLATE/` folder if it wants any
  different form. Doing so discards all of these, including the chooser and the
  blank-issues setting.

### Workflow templates

- **Enforced:** nothing. A template is a starting point, and each needs its
  `.properties.json` card to appear.
- **Offered:** `claude`, `commit-lint`, `dco`, `dependency-review`, `docs`,
  `docs-live`, `environments`, `gitleaks`, `labeler`, `release`, `reuse`,
  `scancode`, `scorecard`, `verify`, `workflow-lint`.
- **A repository adds:** the copy. The `main` ruleset requires checks named
  `verify`, `Dependency Review`, `CodeQL`, `Gitleaks`, `DCO sign-off` and `Commit lint`:

| Required check | Provided by |
| --- | --- |
| `verify` | The repository's own workflow. No template provides it |
| `Dependency Review` | The `dependency-review` template. Its job `name:` must stay `Dependency Review`. It reads `.github/dependency-review-config.yml`, a starter in `blueprint/files/`, and fails without it |
| `Gitleaks` | The `gitleaks` template. Its job `name:` must stay `Gitleaks` |
| `CodeQL` | Code scanning default setup, enabled by an owner |
| `DCO sign-off` | The `dco` template. Its job `name:` must stay `DCO sign-off`, and it must not filter by path, or a pull request that skips it can never merge |
| `Commit lint` | The `commit-lint` template. Its job `name:` must stay `Commit lint`, and it must not filter by path. It is a plain template and not a reusable workflow, because a required check from a reusable workflow is reported as `<caller job> / <called job>` |

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
  `.editorconfig`, `REUSE.toml`, `dependabot.yml`, the dependency-review
  config. Workflow controls, found by
  their content and not by file name: workflow lint, REUSE check, DCO check,
  commit lint, the Node pin, Scorecard (public repositories only). The
  release configuration, workflow and immutable-releases setting are reported
  for every repository that `blueprint/release.json` does not exempt. The
  description and topics of a repository listed in `blueprint/projects.json`.
  Open Scorecard alerts are listed too. Adding one is a commit in that repository.
- **A repository adds:** everything the blueprint does not own, including
  `dependabot.yml`, `CODEOWNERS` and `LICENSE`.

> [!NOTE]
> `--apply` changes repository settings. Run the read-only check first, and
> read `blueprint/README.md` before applying to a repository that does not
> produce the six required checks.

### Repository descriptions

What the organization says about each repository is one set of words in three
lengths, kept in `blueprint/projects.json`: a **card line** (up to 120
characters) for the social card, a **description** (up to 200) for the GitHub
About text and the manifest, and the **topics**. The profile table below the
tagline in `profile/README.md` is written from the descriptions.

- **Enforced:** nowhere. The script reports a different GitHub description or
  topic list as `repository description` or `repository topics` and prints the
  `gh repo edit` command. `bin/doc-parity.mjs` checks the wording rules and
  that the profile table carries the descriptions.
- **The wording:** a noun phrase first, plain words addressed to the reader,
  one clause, no final dot or ellipsis, UK spelling in the Oxford style. The full
  rules are in
  `blueprint/README.md`, under "Descriptions".
- **Organization details:** `blueprint/org.json` holds the display name
  (`monte3l`), description and website. An Owner sets them in the organization
  settings. The script does not read them.

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

### Bootstrapping a repository

`bin/new-repo.sh NAME` creates a repository that starts out following the
blueprint. What goes in is `blueprint/bootstrap.json`.

- **Enforced:** only that the list stays complete. `bin/bootstrap-parity.mjs`
  fails the docs check when a starter or a workflow template is neither listed
  nor excluded with a reason.
- **Offered:** the starters in `blueprint/files/` and the workflow templates,
  rendered the way the template sync renders them. The script is read-only until
  `--apply`, never changes an existing repository, and refuses locally what it
  can before it asks GitHub.
- **A repository adds:** its entry in `blueprint/projects.json` and the profile
  table before it is created. Afterwards it fills in the placeholders in its
  starters, adds itself to `blueprint/sync.json`, and registers at reuse.software
  and bestpractices.dev. A docs site also needs a `consumers` entry in
  `blueprint/design-system.json`.

### Keeping workflow copies current

- **Enforced:** nothing a person changed is ever overwritten.
  `blueprint/sync.json` says which templates are managed (`verify`, `release`
  and `claude` are not), and a copy is stale only if it matches a version the
  template really had.
- **Offered:** `bin/template-sync.mjs` compares every consumer's copy with its
  template and reports the stale ones. `template-sync.yml` opens one pull
  request per repository with a stale copy, every Monday at 06:15 UTC and by
  hand, as the `monte3l-sync` App. A refresh that would rename a job is left
  out, because a required check is a job name.
- **A repository adds:** nothing to receive it. It reviews and merges the pull
  request, and keeps a copy custom by changing it. Per-repository data, such as
  an allow-list or a URL, belongs in a config file or a template parameter and
  never in the template, because it would turn every copy custom.

See [Workflow template sync](blueprint/README.md#workflow-template-sync).

### Scheduled checks

Each workflow below runs every Monday (UTC). Findings go to one tracking issue
each, which a later clean run closes, and never block a merge. The template sync
opens pull requests instead.

| Workflow | When | Reports as |
| --- | --- | --- |
| `freshness.yml`, job `pins` | 05:15 | **Pinned tool versions are stale**: a hand-pinned version (`blueprint/pins.json`) is behind a release at least seven days old |
| `freshness.yml`, job `upstream` | 05:15 | **Upstream policy changed**: a policy the standard follows (`blueprint/upstream.json`) moved since a person last reviewed it |
| `freshness.yml`, job `knowledge` | 05:15 | **Knowledge wiki needs review**: a page unreviewed for 180 days, an orphan source card or a dead citation |
| `freshness.yml`, job `copies` | 05:15 | **Workflow copies are behind their templates** |
| `org-audit.yml` | 05:45 | **Org baseline drift**: counts only, because this repository is public |
| `template-sync.yml` | 06:15 | A pull request in each repository with a stale copy |

See [Org audit](blueprint/README.md#org-audit) and
[Keeping the standard current](blueprint/README.md#keeping-the-standard-current).

### Knowledge base and agent files

- **Enforced:** the shape of the wiki. `bin/knowledge-parity.mjs` fails the docs
  check on a page without sources and a review date, a source that does not
  exist, a page the index does not link, or a log entry out of order. Staleness
  is reported weekly and is never a build failure.
- **Offered:** `knowledge/`, with source cards in `knowledge/raw/`, pages in
  `knowledge/wiki/`, an index and an append-only log, read on the site under
  Knowledge. The docs kit also writes `llms.txt`, `llms-full.txt` and
  `sitemap.xml` at the site root, and a Markdown copy of every page.
- **A repository adds:** nothing. A docs site built with the kit publishes the
  same files when its `docs.config.mjs` sets `llms` and `sitemap`.

Nothing private goes in `knowledge/`: this repository is public.

## Parity check

**Settings and design version:**

```sh
bin/apply-repo-baseline.sh monte3l/<repo>
```

It is read-only and exits 1 on drift, or 3 if a call failed and the result
cannot be trusted. `--dry-run` also prints the `gh api` call for each drifted
item. It needs `gh` with admin on the repository, and `jq`. For every
repository in the organization at once, run `bin/org-audit.sh` or `/org-drift`
in Claude Code from this repository. The **Org baseline drift** issue, which
`org-audit.yml` updates every Monday, carries counts only, because this
repository is public. See [Org audit](blueprint/README.md#org-audit).

**What the script cannot see.** Check these by hand:

| Claim | How to check | Result if it fails |
| --- | --- | --- |
| Required check names match the templates | Compare `blueprint/rulesets/main-branch.json` with each copied workflow's job `name:` | Merges block with a check that never reports |
| `GITLEAKS_LICENSE` is shared with the repository | `gh api orgs/monte3l/actions/secrets/GITLEAKS_LICENSE/repositories` | The Gitleaks job fails |
| CodeQL default setup is on | `gh api repos/monte3l/<repo>/code-scanning/default-setup` shows `"state": "configured"` | The `CodeQL` check never reports |
| Every `uses:` is pinned to a SHA | The Actions setting is enforced by the script. Whether a given workflow complies is only found when it runs | The run fails |
| Repository files and workflow controls are correct, not just present | The script only checks that the file exists or the control appears. `.gitattributes` in `m3l-design` must stay `* -text` | A copied default can break checksums |
| Community files and issue forms match the defaults | **No check exists.** Compare by eye | Silent divergence |
| Workflow copies match their templates | `node bin/template-sync.mjs`, which `freshness.yml` runs weekly. A copy a person changed on purpose is never reported | A copy runs an older version of its template |

## Changing a default

Edit the file on a branch and open a pull request. Name the repositories it
affects.

| Change | What reaches repositories when it merges |
| --- | --- |
| Community file, issue form, pull request template | Every repository without its own copy, at once |
| `profile/README.md` | The organization page, at once |
| Workflow template | A pull request in each repository whose managed copy is now stale, opened by the template sync on its next Monday run or by hand, and every repository created later. A copy a person changed is never touched |
| `blueprint/bootstrap.json`, a starter in `blueprint/files/` | Repositories created later by `bin/new-repo.sh`. Nothing already created |
| `blueprint/pins.json`, `blueprint/upstream.json` | Nothing. The weekly freshness issues compare against them |
| `blueprint/*.json` | Nothing until someone runs `--apply`. The read-only check reports the new drift immediately |
| `blueprint/design-system.json` | The `design system` line of the check, at once. Repositories on the old tag show drift until they re-sync |
| `bin/apply-repo-baseline.sh` | Every later run of the script |

Rules for edits:

- Keep each change small.
- Keep `blueprint/README.md`'s file table in step with the blueprint.
- A new starter or workflow template needs an entry in `blueprint/bootstrap.json`
  (and a template one in `blueprint/sync.json`): the docs check fails without it.
- A change to a script or a parity module needs its case in `tests/`.
- When `design-system.json` changes, update `design/README.md` in the same
  commit.
- Commit with `git commit -s`, signed, as a Conventional Commit.

## Parity table

One row per file or group of files. **Delivery** is one of:

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
| Bug report form | `.github/ISSUE_TEMPLATE/bug_report.yml` | **Inherited** (all or nothing, see above) | Nothing, or its own `ISSUE_TEMPLATE/` folder | Script: `issue forms: org defaults` reports a local `ISSUE_TEMPLATE/` that hides them. The form text is not verified |
| Feature request form | `.github/ISSUE_TEMPLATE/feature_request.yml` | **Inherited** (same) | Same | Script: `issue forms: org defaults` reports a local `ISSUE_TEMPLATE/` that hides them. The form text is not verified |
| Docs problem form | `.github/ISSUE_TEMPLATE/docs_problem.yml` | **Inherited** (same) | Same | Script: `issue forms: org defaults` reports a local `ISSUE_TEMPLATE/` that hides them. The form text is not verified |
| Issue chooser, blank issues off | `.github/ISSUE_TEMPLATE/config.yml` | **Inherited** (same) | Same | Script: `issue forms: org defaults` reports a local `ISSUE_TEMPLATE/` that hides them. The form text is not verified |
| Pull request template | `.github/pull_request_template.md` | **Inherited** | Nothing, or its own copy | Not verified |
| Pull request template variants | `.github/PULL_REQUEST_TEMPLATE/` (`docs.md`, `design-sync.md`, `dependencies-release.md`) | **Inherited**. Chosen with `?template=` | Nothing, or its own folder | Not verified |
| Organization profile | `profile/README.md` | **Inherited** (shown on the organization page only) | Nothing | Not verified |
| Claude workflow | `workflow-templates/claude.yml` | **Template** | Copy it, add the `ANTHROPIC_API_KEY` secret | Not verified. Never relax its `author_association` gate |
| Claude template card | `workflow-templates/claude.properties.json` | **Template** | Nothing | `jq empty` in `verify.yml` |
| Dependency Review workflow | `workflow-templates/dependency-review.yml` | **Template** | Copy it, with `.github/dependency-review-config.yml` from `blueprint/files/`: the workflow fails without it. Its job name `Dependency Review` is a required check | Job name matched by hand (see [Parity check](#parity-check)). Script: `dependency review config` |
| Dependency Review card | `workflow-templates/dependency-review.properties.json` | **Template** | Nothing | `jq empty` in `verify.yml` |
| Gitleaks workflow | `workflow-templates/gitleaks.yml` | **Template** | Copy it. Its job name `Gitleaks` is a required check. The organization secret `GITLEAKS_LICENSE` must be shared with the repository | Job name matched by hand. Secret visibility checked by hand |
| Gitleaks card | `workflow-templates/gitleaks.properties.json` | **Template** | Nothing | `jq empty` in `verify.yml` |
| Scorecard workflow | `workflow-templates/scorecard.yml` | **Template** | Copy it, public repositories only. Not a required check | Script: `Scorecard workflow`, and `Scorecard alerts` for every open alert. **Skipped** for private repositories |
| Scorecard card | `workflow-templates/scorecard.properties.json` | **Template** | Nothing | `jq empty` in `verify.yml` |
| ScanCode workflow | `workflow-templates/scancode.yml` | **Template** | Copy it with `blueprint/files/policies.yml` and `scancode-config.yml` | Script: `ScanCode check` (looks for the control, not the file name) |
| ScanCode card | `workflow-templates/scancode.properties.json` | **Template** | Nothing | `jq empty` in `verify.yml` |
| REUSE workflow | `workflow-templates/reuse.yml` | **Template** | Copy it, or run `reuse lint` from a workflow it already has | Script: `REUSE check` (looks for the control, not the file name) |
| REUSE card | `workflow-templates/reuse.properties.json` | **Template** | Nothing | `jq empty` in `verify.yml` |
| DCO workflow | `workflow-templates/dco.yml` | **Template** | Copy it, or check `Signed-off-by` from a workflow it already has under the job name `DCO sign-off`, which the `main` ruleset requires | Script: `DCO check` (looks for the control, not the file name) |
| DCO card | `workflow-templates/dco.properties.json` | **Template** | Nothing | `jq empty` in `verify.yml` |
| Workflow lint workflow | `workflow-templates/workflow-lint.yml` | **Template** | Copy it, or add actionlint and zizmor to a workflow it already has | Script: `workflow lint` (looks for the control, not the file name) |
| Workflow lint card | `workflow-templates/workflow-lint.properties.json` | **Template** | Nothing | `jq empty` in `verify.yml` |
| Commit lint workflow | `workflow-templates/commit-lint.yml` | **Template** | Copy it, or check Conventional Commits from a workflow it already has under the job name `Commit lint` | Script: `commit lint` (looks for the control, not the file name) |
| Commit lint card | `workflow-templates/commit-lint.properties.json` | **Template** | Nothing | `jq empty` in `verify.yml` |
| Release workflow | `workflow-templates/release.yml` | **Template** | Copy it, add any repository-specific job between `prepare` and `finalize`, and set `notify` | Script: `release: workflow` |
| Release card | `workflow-templates/release.properties.json` | **Template** | Nothing | `jq empty` in `verify.yml` |
| Shared release workflows | `.github/workflows/release-prepare.yml`, `release-finalize.yml` | **Not delivered**. Called by each repository's `release.yml`, pinned by commit SHA | Bump the pin when Dependabot opens the pull request | actionlint and zizmor in `workflow-lint.yml` |
| Release configuration | `blueprint/files/release-please/` | **Checked**. Starting points only | Commit its own `release-please-config.json` and `.release-please-manifest.json` | Script: `release: config`, `release: manifest`, `release: workflow pin`, `release: app installation`, `release: app secrets`, `release: immutable releases` |
| Release exemptions | `blueprint/release.json` | **Checked** | Nothing | Script: `SKIP release` for a listed repository. `appUsers` also lists repositories that publish nothing but open pull requests as the release App |
| Verify workflow | `workflow-templates/verify.yml` | **Template** | Copy it, replace the placeholder lane with the repository's own checks, and keep the job name `verify`, which the `main` ruleset requires | Job name matched by hand (see [Parity check](#parity-check)) |
| Verify card | `workflow-templates/verify.properties.json` | **Template** | Nothing | `jq empty` in `verify.yml` |
| Labeler workflow | `workflow-templates/labeler.yml` | **Template** | Copy it and start `.github/labeler.yml` from `blueprint/files/labeler.yml`. Not a required check | Script: `PR labeler` (looks for the control, not the file name) |
| Labeler card | `workflow-templates/labeler.properties.json` | **Template** | Nothing | `jq empty` in `verify.yml` |
| Environments workflow | `workflow-templates/environments.yml` | **Template** | Copy it, add `.github/environments.json`, install the `monte3l-env-janitor` App | Script: the `env-janitor:` items, only for a repository with `.github/environments.json` |
| Environments card | `workflow-templates/environments.properties.json` | **Template** | Nothing | `jq empty` in `verify.yml` |
| Docs deploy workflow | `workflow-templates/docs.yml` | **Template** | Copy it for a repository with a `docs.config.mjs`, then follow `blueprint/docs-site.md` | Script: `docs site: deploy` |
| Docs deploy card | `workflow-templates/docs.properties.json` | **Template** | Nothing | `jq empty` in `verify.yml` |
| Docs live check workflow | `workflow-templates/docs-live.yml` | **Template** | Copy it beside `docs.yml` | Script: `docs site: daily check` |
| Docs live check card | `workflow-templates/docs-live.properties.json` | **Template** | Nothing | `jq empty` in `verify.yml` |
| Repository settings | `blueprint/repo-settings.json` | **Applied** | Nothing after `--apply` | Script: `repository settings` |
| Actions token and PR approval | `blueprint/actions.json` (`workflow`) | **Applied** | Nothing after `--apply` | Script: `Actions: workflow token and PR approval` |
| Fork PR approval | `blueprint/actions.json` (`fork_pr_approval`) | **Applied**. **Skipped** for private repositories | Nothing | Script: `Actions: fork PR approval` |
| SHA pinning required | `blueprint/actions.json` (`sha_pinning`) | **Applied** | Pin every `uses:` to a full commit SHA | Script: `Actions: SHA pinning required` |
| Dependabot alerts and security updates | Hard-coded in the script, no file | **Applied** | Nothing | Script: `security: Dependabot alerts`, `security: Dependabot security updates` |
| Private vulnerability reporting | Hard-coded in the script, no file | **Applied**. **Skipped** for private repositories | Nothing | Script: `security: private vulnerability reporting` |
| `main` ruleset | `blueprint/rulesets/main-branch.json` | **Applied**. **Skipped** on a free-plan private repository | Produce the four required checks | Script: `ruleset: main` |
| `tags` ruleset | `blueprint/rulesets/tags.json` | **Applied**. **Skipped** (same) | Nothing | Script: `ruleset: tags` |
| Labels | `blueprint/labels.json` | **Applied**, create-only | Nothing. An existing label is never rewritten | Script: label lines (they report OK or DRIFT inline) |
| Design version pin | `blueprint/design-system.json` | **Checked** | Merge the re-sync pull request that `design-resync.yml` opens, or record the tag in `design/README.md` and run `sync-design.sh` by hand | Script: `design system` |
| Design re-sync | `.github/workflows/design-resync.yml`, `bin/design-resync-pr.sh` | **Not delivered**. Runs here on `m3l-design`'s `release-published` dispatch and opens a pull request in each repository listed under `consumers` | Review and merge each pull request | shellcheck and actionlint in `verify.yml`, zizmor in `workflow-lint.yml` |
| Descriptions and topics | `blueprint/projects.json` | **Checked** | Set them with `gh repo edit`; the script prints the command | Script: `repository description`, `repository topics` |
| Organization details | `blueprint/org.json` | **Not delivered**. An Owner sets them in the organization settings | Nothing | Not verified. `gh api orgs/monte3l` shows the live values |
| Repository standard files | `blueprint/files/` (`gitleaks.toml`, `gitattributes`, `editorconfig`, `REUSE.toml`, `dependabot.yml`, `dependency-review-config.yml`, `CODEOWNERS`, `SECURITY.md`, `labeler.yml`, `policies.yml`, `scancode-config.yml`, `release-please/`) | **Checked**. Starting points only. `bin/new-repo.sh` copies them into a new repository | Commit its own copy of each | Script: `Gitleaks config`, `line endings`, `editor config`, `REUSE`, `Dependabot`, `dependency review config`, `CODEOWNERS`, `security policy`, `PR labeler`, `ScanCode check` |
| Docs site starters | `blueprint/files/docs.config.mjs`, `deploy-tools/` (with its lockfile), `environments.json`, `dependency-review-config-docs.yml` | **Not delivered**. Starting points. `bin/new-repo.sh --docs` copies them | Copy them for a docs site, see `blueprint/docs-site.md` | Script: the `docs site:` and `env-janitor:` items |
| `CODEOWNERS` | `.github/CODEOWNERS` | **Checked** | Keep its own (never inherited) | Script: `CODEOWNERS` |
| README skeleton | `blueprint/files/README.md` | **Not delivered**. A starting point, copied by `bin/new-repo.sh` or by hand | Copy it and fill it in | Not verified |
| Environment example | `blueprint/environments.example.json` | **Not delivered**. Needs real reviewer ids | Create its own environments | Not verified |
| New repository | `bin/new-repo.sh`, `bin/bootstrap-render.mjs`, `bin/lib/bootstrap.mjs`, `blueprint/bootstrap.json` | **Not delivered**. A tool and the data it reads | Nothing | `shellcheck` and `node --check` in `verify.yml`; `bin/bootstrap-parity.mjs` in the docs check; `tests/` |
| Template sync | `blueprint/sync.json`, `bin/template-sync.mjs`, `bin/lib/template-sync.mjs`, `bin/template-sync-pr.sh`, `.github/workflows/template-sync.yml` | **Not delivered**. Opens pull requests in repositories that hold a stale managed copy | Review and merge them | `shellcheck` and `node --check` in `verify.yml`; `bin/sync-parity.mjs` in the docs check; `tests/` |
| Pins and upstream policies | `blueprint/pins.json`, `blueprint/upstream.json`, `bin/pin-freshness.sh`, `bin/upstream-watch.sh`, `bin/lib/upsert-issue.sh`, `.github/workflows/freshness.yml` | **Not delivered**. Weekly tracking issues | Nothing | `shellcheck` in `verify.yml`; `bin/pin-parity.mjs` in the docs check |
| Org audit | `bin/org-audit.sh`, `.github/workflows/org-audit.yml` | **Not delivered**. The script over every repository, as a weekly counts-only issue | Nothing | `shellcheck` in `verify.yml` |
| Knowledge base | `knowledge/`, `bin/knowledge-parity.mjs`, `bin/knowledge-report.mjs`, `bin/lib/knowledge.mjs` | **Not delivered**. Decisions and research | Nothing | `bin/knowledge-parity.mjs` in the docs check; staleness reported weekly; `tests/` |
| Docs generators and parity | `bin/site/`, `bin/doc-parity.mjs`, `docs.config.mjs` | **Not delivered**. Build the catalog pages and keep the docs and the code in step | Nothing | `build.mjs --check` in `verify.yml` |
| OpenSSF level | `blueprint/openssf.json` | **Checked** | Register the project at bestpractices.dev, or be exempted with a reason | Script: `OpenSSF Best Practices` |
| Claude Code managed settings | `blueprint/claude/managed-settings.json` | **Not delivered**. An Owner pastes it into the Claude admin console | Nothing | Not verified |
| Tests | `tests/` | **Not delivered**. The tests for the scripts and parity gates, run by `verify.yml` | Nothing | `node --test` in `verify.yml` |
| Blueprint guide | `blueprint/README.md` | **Not delivered** | Nothing | Not verified |
| The script | `bin/apply-repo-baseline.sh` | **Not delivered**. It is the tool | Nothing | `bash -n` and `shellcheck` in `verify.yml` |
| This repository's design copy | `design/README.md`, `design/source/`, `design/tokens.css`, `design/SHA256SUMS` | **Not delivered**. Vendored tier: a verbatim copy of an m3l-design release, replaced only by `sync-design.sh` and never edited by hand | Nothing | Script, run against `monte3l/.github`. `build.mjs --check` verifies the copy against `SHA256SUMS` |
| This repository's Dependabot | `.github/dependabot.yml` | **Not delivered** | Nothing | Not verified |
| This repository's verify workflow | `.github/workflows/verify.yml` | **Not delivered**. Produces the `verify` check here | Nothing | Runs on every pull request |
| This repository's dependency review | `.github/workflows/dependency-review.yml`, `.github/dependency-review-config.yml` | **Not delivered** | Nothing | Runs on every pull request |
| This repository's Gitleaks | `.github/workflows/gitleaks.yml` | **Not delivered** | Nothing | Runs on every pull request, weekly, and on demand |
| This repository's DCO and commit lint | `.github/workflows/dco.yml`, `.github/workflows/commit-lint.yml` | **Not delivered** | Nothing | Script, run against `monte3l/.github` |
| This repository's REUSE, workflow lint and Scorecard | `.github/workflows/reuse.yml`, `workflow-lint.yml`, `scorecard.yml` | **Not delivered** | Nothing | Script, run against `monte3l/.github` |
| This repository's ScanCode | `.github/workflows/scancode.yml`, `policies.yml`, `scancode-config.yml` | **Not delivered** | Nothing | Runs on every pull request |
| This repository's docs site, labeler and environments | `docs.config.mjs`, `tools/deploy/`, `.github/workflows/docs.yml`, `docs-live.yml`, `labeler.yml`, `environments.yml`, `.github/labeler.yml`, `.github/environments.json` | **Not delivered**. `docs.config.mjs` also builds the org site from `profile/README.md` | Nothing | `build.mjs --check` in `verify.yml`. The script, run against `monte3l/.github` |
| This repository's repository-standard files | `.gitleaks.toml`, `.gitattributes`, `.editorconfig`, `REUSE.toml`, `LICENSES/MIT.txt` | **Not delivered** | Nothing | Script, run against `monte3l/.github` |
| Agent tooling | `.claude/` (settings, hooks, the `template-invariants-reviewer` agent, and skills such as `org-drift` and `knowledge`) | **Not delivered**. For this repository only | Nothing | Not verified. `/org-drift` runs the script across the organization |
| Agent guidance | `CLAUDE.md` | **Not delivered** | Nothing | Not verified |
| License | `LICENSE` | **Not delivered**. Never inherited | Nothing | Not verified |
| This file | `README.md` | **Not delivered** | Nothing | Not verified |

## Repository status

> [!NOTE]
> **A snapshot, not live data.** Taken on 2026-11-19 with
> `bin/apply-repo-baseline.sh monte3l/<repo>` from `main` at `a3497bf`. One item
> drifts, in this repository. The table gives counts only, because this
> repository is public, as the weekly audit does. Run the script for the current
> result.

| Repository | Visibility | Last baseline run | Result | CodeQL default setup | `GITLEAKS_LICENSE` shared | Inherited community files |
| --- | --- | --- | --- | --- | --- | --- |
| `monte3l/.github` | Public | 2026-11-19 | 50 OK, 1 drift, 2 skipped | Configured | Yes | None. It is the source |
| `monte3l/m3l-design` | Public | 2026-11-19 | 57 OK, 0 drift | Configured | Yes | `CODE_OF_CONDUCT.md`, `SUPPORT.md`, the pull request template, the issue forms |
| `monte3l/m3l-groundwork` | Public | 2026-11-19 | 56 OK, 0 drift, 1 skipped | Configured | Yes | `SUPPORT.md` |
| `monte3l/m3l-prompt-optimizer` | Public | 2026-11-19 | 57 OK, 0 drift | Configured | Yes | `SUPPORT.md` |
| `monte3l/m3l-output-governor` | Public | 2026-11-19 | 57 OK, 0 drift | Configured | Yes | `CODE_OF_CONDUCT.md`, `SUPPORT.md`, the issue forms |
| `monte3l/m3l-claude-mentor` | Public | 2026-11-19 | 57 OK, 0 drift | Configured | Yes | `CODE_OF_CONDUCT.md`, `SUPPORT.md`, the pull request template, the issue forms |
| `monte3l/m3l-plugins` | Public | 2026-11-19 | 52 OK, 0 drift, 1 skipped | Configured | Yes | `CODE_OF_CONDUCT.md`, `SUPPORT.md`, the pull request template, the issue forms |

Every repository has its own `LICENSE` and `.github/CODEOWNERS`, and the script
checks the second. No repository has copied `claude.yml`, and
`ANTHROPIC_API_KEY` is not among the organization's secrets.

## Requirements

- **`gh`, authenticated with admin rights on the repository.** Needed to run the
  baseline script. `bin/new-repo.sh` needs `gh` as an organization owner, with
  the `repo`, `workflow` and `admin:org` scopes.
- **`jq`.** Needed to run the baseline script and to validate the JSON files.
- **Node.js 24.** Pinned in `.node-version`. Runs the docs site build, its
  parity checks, the template sync and the tests. `bin/new-repo.sh --docs` also
  needs `npm`, and `git` is needed throughout.
- **`shellcheck` and Docker.** Optional locally: CI runs shellcheck and
  actionlint, whose image tag is pinned by hand in `verify.yml` and recorded in
  `blueprint/pins.json`.

## Working on this repo

The checks are the `verify` job in `verify.yml`, and CI runs all five. The same
commands run locally:

```sh
# the docs site: links, page coverage, design integrity and every parity check
node design/source/docs-kit/build.mjs --check
# every script parses and passes shellcheck, and every Node script parses
bash -n bin/*.sh bin/lib/*.sh tests/*.sh && shellcheck bin/*.sh bin/lib/*.sh tests/*.sh
node --check bin/*.mjs
# the tests
node --test "tests/*.test.mjs"
# every blueprint and template JSON file is valid
find blueprint workflow-templates -name '*.json' -print0 | xargs -0 -n1 jq empty
# every workflow and template passes actionlint (TAG is the version in blueprint/pins.json)
docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:TAG -color .github/workflows/*.yml workflow-templates/*.yml
```

`tests/` holds the tests: the parity gates, the template classifier (hostile
input included, because it once took minutes on a large file), and
`bin/new-repo.sh` run against stubs and a local bare repository, so nothing is
created anywhere. Run one with `node tests/<name>.test.mjs`, or run the script
under macOS's bash 3.2 with `BASH_BIN=/bin/bash node --test "tests/*.test.mjs"`.
They cannot answer what only GitHub answers. A real run of the bootstrap found a
corrupt lockfile and a branch taken over a tag that stubs could not, so a bug
found that way gets a test for its cause.

The rules for edits are under [Changing a default](#changing-a-default). See
[`CONTRIBUTING.md`](CONTRIBUTING.md) for the pull request workflow.

### Project docs

- [`CONTRIBUTING.md`](CONTRIBUTING.md) -- how to contribute. Its wording is
  written for other repositories.
- [`SECURITY.md`](SECURITY.md) -- reporting a vulnerability.
- [`knowledge/README.md`](knowledge/README.md) -- the index of the knowledge
  base: decisions and research, each page with its sources and review date.
- [`SUPPORT.md`](SUPPORT.md) and [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) --
  the remaining community files that other repositories inherit.
- [`blueprint/README.md`](blueprint/README.md) -- the settings blueprint, the
  repository standard and the README structure.
- [`blueprint/docs-site.md`](blueprint/docs-site.md) -- the docs-site runbook,
  including the Cloudflare setup.
- [`design/README.md`](design/README.md) -- this repository's m3l-design marker.
- [`profile/README.md`](profile/README.md) -- the organization profile page,
  which is also the home page of monte3l.com.
- [`CLAUDE.md`](CLAUDE.md) -- the script's internals and conventions, written
  for Claude Code agents.

## License

[MIT](LICENSE).
