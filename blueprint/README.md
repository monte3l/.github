# Repository blueprint

The GitHub-side settings a new `monte3l` repository should have, as data plus
one script that compares a repository with it and can bring it in line.

A template repository cannot carry these: GitHub copies files and branches
only, not rulesets, Actions policy, security features, labels or merge
settings. The reasoning and the full checklist are in
[`docs/github-blueprint.md`](https://github.com/monte3l/m3l-groundwork/blob/main/docs/github-blueprint.md)
in `m3l-groundwork`.

## Files

| File                     | What it holds                                                                                              |
| ------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `rulesets/main-branch.json` | The `main` ruleset, taken from `m3l-groundwork`: signed commits, no force-push or delete, PRs with one code-owner approval (and approval of the last push) and resolved threads, and branches up to date with `main`, and `verify`, `Dependency Review`, `CodeQL`, `Gitleaks` and `DCO sign-off` required |
| `rulesets/tags.json`     | Tags cannot be moved or deleted; creating one stays allowed so releases can tag                            |
| `repo-settings.json`     | Merge settings: merge commit and squash allowed, rebase off, delete head branches after merge             |
| `actions.json`           | Read-only workflow token, workflows cannot approve PRs, approve fork PR runs for all outside contributors, SHA pinning required |
| `labels.json`            | Labels that Dependabot and the baseline's scheduled audit apply, coloured with m3l-design's status primitives. Labels are create-only, so existing repositories keep their old colours |
| `design-system.json`     | The m3l-design release tag (`vX.Y.Z`) every repository should record in `design/README.md`. Checked by the script, never applied |
| `projects.json`          | Every monte3l repository and its docs-site URL. The org site's project cards and `profile/README.md`'s table are checked against it |
| `docs-site.md`           | The docs site standard, the Cloudflare one-time setup and the runbook. See [Docs site](#docs-site) |
| `files/`                 | Starting points for files a repository commits itself: `gitleaks.toml`, `gitattributes`, `editorconfig`, `REUSE.toml`, `dependabot.yml`, a `README.md` skeleton, and for a docs site `docs.config.mjs` and `deploy-tools/`. The script only checks that the repository has the matching file, and does not check the README at all |
| `environments.example.json` | An example `npm-publish` environment. Not applied by the script: it needs real reviewer ids            |
| `../workflow-templates/environments.yml` | The weekly `env-janitor` cleanup workflow. See [Environment cleanup](#environment-cleanup) |

`integration_id` values in the `main` ruleset are GitHub's own apps (15368 is
GitHub Actions, 57789 is code scanning), so they are the same in every
organization.

## Use

```sh
bin/apply-repo-baseline.sh monte3l/NEW-REPO             # read-only comparison, exit 1 on drift
bin/apply-repo-baseline.sh monte3l/NEW-REPO --dry-run   # also shows what --apply would run
bin/apply-repo-baseline.sh monte3l/NEW-REPO --apply     # changes the repository
```

It needs `gh` authenticated with admin rights on the repository, and `jq`.
Each item is compared with the live state first, so running `--apply` twice
changes nothing the second time. Existing labels are never rewritten. A
private repository on a free plan cannot have fork-PR approval, private
vulnerability reporting or rulesets: the script prints `SKIP` for those and
does not count them as drift.

> [!WARNING]
> The blueprint requires the `verify`, `Dependency Review`, `CodeQL`,
> `Gitleaks` and `DCO sign-off` checks and SHA-pinned actions. `Gitleaks` also needs the
> `GITLEAKS_LICENSE` organization secret to be shared with the repository.
> Applying it to a repository that does not produce those checks, or that
> uses unpinned actions, blocks merges and fails workflows until that is
> fixed. Run `--check` first.

## Design system

Every `monte3l` repository follows **m3l-design**
([monte3l/m3l-design](https://github.com/monte3l/m3l-design)). It is copied
into each project from a published release, never imported: there is no
`@monte3l/m3l-design` dependency, and a repository may diverge deliberately.
The version to record is a release tag, `vX.Y.Z`, pinned in
`design-system.json`. The script reports a repository whose `design/README.md`
is missing or names another version. It cannot fix that, because adopting the
system is a commit in the repository.

| Tier     | When                                                              | What to do                                                                                                                                                                                                                              |
| -------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Content  | Markdown only: no CSS, fonts, rendered pages or terminal colour   | Follow the markdown rules below. Add `design/README.md` with a line ``- **Version adopted:** `vX.Y.Z` ``. See this repository's own `design/README.md`.                                                                                  |
| Vendored | Any CSS, HTML, docs site or coloured terminal output              | Add `design/README.md` with ``- **Version copied:** `vX.Y.Z` ``, then run `bin/sync-design.sh vX.Y.Z <repo>` from a `m3l-design` checkout. Keep local divergence in `design/local/`. Never hand-edit `source/`. |
| Source   | `m3l-design` itself, and only it                                  | The repository root is the release payload. `design/README.md` records ``- **Version adopted:** `vX.Y.Z` `` and ``- **Tier:** source``. |

`sync-design.sh` downloads the release, verifies its attestation and
checksums, then replaces `design/source/`, `design/tokens.css` and
`design/SHA256SUMS` and rewrites the marker. It never creates the marker and
never touches `design/local/`. Prove a copy is unedited with
`cd design && shasum -a 256 -c SHA256SUMS`.

The vendored payload includes the **docs kit**, which builds and gates a docs
site. See [Docs site](#docs-site).

Markdown rules, for every tier: **bold** instead of italics or underlines, a
GitHub alert matched to the severity of the point (never more than two in a
row, and `[!CAUTION]` only for data loss or anything irreversible), plain
direct sentences, and a table for tabular data.

To move to a newer version, run the script again and commit the result,
including the marker. `m3l-groundwork/design/README.md` documents the vendored
layout in full. Its `templates/**` stay brand-neutral on purpose, so anything a
repository emits into other projects is not styled.

## Docs site

A repository with a visual or documentation surface gets a docs site at
`<project>.monte3l.com`, built by the docs kit in the vendored m3l-design
payload and deployed to Cloudflare Workers Static Assets. The repository keeps
a `docs.config.mjs`, its own parity checks and its deploy wiring, and nothing
else. [`docs-site.md`](docs-site.md) is the standard, the one-time Cloudflare
setup and the steps to wire a new site, and `projects.json` lists every site.

The script reports a repository that has a `docs.config.mjs` and lacks the
vendored tier marker, the kit gate in a workflow, the deploy and smoke jobs, a
scheduled live check, or a `homepage` set to its `monte3l.com` URL. Those are
the `docs site` items below.

## Environment cleanup

GitHub creates an environment the first time a job references it and never
removes it. A repository with at least one deployment environment (a
`docs-cloudflare` docs site, an `npm-publish` release gate) therefore also
carries the `env-janitor` environment and the weekly cleanup workflow.
`m3l-groundwork` is the reference implementation, and its
`docs/environment-janitor.md` explains the App permissions and the policy
format.

| Piece | Where |
| --- | --- |
| Workflow | Copy `workflow-templates/environments.yml` to `.github/workflows/environments.yml`. It checks out `m3l-groundwork`'s `bin/` at a pinned commit and runs the cleanup script, so there is one copy of the code |
| Policy | `.github/environments.json` lists every environment the repository's workflows reference, each with a `retain` window and the settings to check for drift. Keep `env-janitor` in it with `retain: 0`. An environment not listed is deleted, unless it has required reviewers or secrets, in which case it is reported and left alone |
| App | Install `monte3l-env-janitor` on the repository (organization settings, GitHub Apps, selected repositories). Never organization-wide |
| Environment | `env-janitor`, restricted to `main`, holding the secrets `JANITOR_APP_CLIENT_ID` and `JANITOR_APP_PRIVATE_KEY` |

```sh
gh api -X PUT repos/monte3l/<repo>/environments/env-janitor \
  -f 'deployment_branch_policy[protected_branches]=false' \
  -f 'deployment_branch_policy[custom_branch_policies]=true'
gh api -X POST repos/monte3l/<repo>/environments/env-janitor/deployment-branch-policies \
  -f name=main
gh secret set JANITOR_APP_CLIENT_ID --env env-janitor --repo monte3l/<repo>
gh secret set JANITOR_APP_PRIVATE_KEY --env env-janitor --repo monte3l/<repo>
```

Run the workflow once with `dry_run` left on and read the job summary before
the first scheduled run applies anything. Add every new `environment:` name to
`.github/environments.json` in the same change that introduces it, and list
the two secrets in the repository's `SECURITY.md`.

## README structure

Every `monte3l` repository's `README.md` follows one order, so a reader who
knows one knows them all. `files/README.md` is the skeleton to copy, and
`m3l-groundwork/README.md` is the worked example. Nothing checks it: it is a
convention a reviewer applies.

| Order | Section | What it holds |
| ----- | ------- | ------------- |
| 1 | Title and badges | Only badges for checks the repository really runs |
| 2 | Opening paragraph | What it is and what it does for the reader, with a docs-site link if there is one. At most one alert before Quickstart |
| 3 | Who is this for | Two or three bullets, each naming a reader and their problem |
| 4 | Quickstart | Prerequisites in one sentence, the shortest path to a first result, and what to do next |
| 5 | How it works | The concept, in prose |
| 6 | Reference sections | One table per thing a reader looks up |
| 7 | Requirements | Tools and versions, and where each is pinned |
| 8 | Working on this repo | The check commands, then Project docs: a link to every other doc in the repository |
| 9 | Versioning policy | Only for a repository that publishes releases |
| 10 | License | One line linking `LICENSE` |

A repository drops a section only when it has nothing to say there, and keeps
the order of the rest. Refer to another section with an anchor link, not with
its name in quotes. A script that reads a README by section name (for example
`m3l-prompt-optimizer`'s `doc-parity.mjs`) must change in the same commit as
the heading it reads.

## Repository standard

GitHub cannot inherit these, so the script only reports a missing file or
control (`DRIFT`, never applied). Each is a commit in the repository. The
**Reported as** column is the label the script prints, and
`bin/doc-parity.mjs` fails when this table and the script disagree.

| Item | Reported as | Standard | Starting point |
| ---- | ----------- | -------- | -------------- |
| `CODEOWNERS` | `CODEOWNERS` | Required: the `main` ruleset asks for a code-owner approval | Write one, usually `* @enri3l @giulmonte` |
| `SECURITY.md` | `security policy` | Required in the repository itself, with an absolute advisory URL and an accepted-findings table: a repository that inherits the org default scores 4 on Scorecard's Security-Policy check | `m3l-groundwork/SECURITY.md`, `m3l-output-governor/SECURITY.md` |
| Gitleaks config | `Gitleaks config` | `.gitleaks.toml` extends the default rules; the workflow passes it as `GITLEAKS_CONFIG` | `files/gitleaks.toml` |
| Line endings and editor | `line endings`, `editor config` | `.gitattributes` with `* text=auto eol=lf`, and `.editorconfig` (utf-8, lf, 2 spaces, final newline). A repository that hashes raw bytes keeps `* -text` instead: see the note below | `files/gitattributes`, `files/editorconfig` |
| REUSE | `REUSE`, `REUSE check` | `REUSE.toml` plus `LICENSES/`, checked by `reuse lint` in CI, from any workflow. Required because every repository that vendors m3l-design ships its OFL-1.1 fonts next to MIT files | `files/REUSE.toml`, `workflow-templates/reuse.yml` |
| Workflow lint | `workflow lint` | actionlint and zizmor on every change to a workflow, from any workflow | `workflow-templates/workflow-lint.yml` |
| Scorecard | `Scorecard workflow`, `Scorecard alerts` | Public repositories only. Open alerts are fixed or dismissed with a reason | `workflow-templates/scorecard.yml` |
| DCO check | `DCO check` | Every non-merge commit in a pull request carries a `Signed-off-by:` trailer that matches its author or committer email. `DCO sign-off` is a required check in the `main` ruleset, so its job `name:` must stay `DCO sign-off` and the workflow must not filter by path | `workflow-templates/dco.yml` |
| Dependabot | `Dependabot` | `.github/dependabot.yml` with the `github-actions` ecosystem, a 7-day cooldown, and one `npm` entry per lockfile directory (1-day cooldown) | `files/dependabot.yml` |
| Node pin | `Node pin` | No workflow writes a version number after `node-version:`: use `node-version-file: .node-version` | `.node-version` |
| Design system | `design system` | `design/README.md` records the version `design-system.json` pins | See [Design system](#design-system) |
| Docs site: tier | `docs site: tier` | Only for a repository with a `docs.config.mjs`: the vendored tier, or the source tier for m3l-design | [`docs-site.md`](docs-site.md) |
| Docs site: gate | `docs site: gate` | `docs-kit/build.mjs --check` runs from a workflow, on every pull request | `files/docs.config.mjs` |
| Docs site: deploy | `docs site: deploy` | The workflow builds, runs `wrangler deploy`, then smoke-tests the live site | `workflow-templates/docs.yml` |
| Docs site: daily check | `docs site: daily check` | One workflow has both a schedule and `docs-kit/check-live.mjs` | `workflow-templates/docs-live.yml` |
| Docs site: homepage | `docs site: homepage` | The GitHub repository `homepage` is its `https://*.monte3l.com` URL | `gh repo edit --homepage` |

The workflow items (workflow lint, REUSE check, Scorecard) look for the
control in the text of the repository's workflows, not for a file name: a
`reuse lint` step inside `verify.yml` counts, and a second workflow would only
duplicate it. The file items look for the file.

> [!NOTE]
> A repository whose `SHA256SUMS` covers raw bytes (`m3l-design`) must keep
> `.gitattributes` as `* -text`. The script only checks that the file exists,
> so copying `files/gitattributes` over it passes the check and breaks the
> checksums.

Rules the script cannot check, so a reviewer does:

- **Workflows:** top-level `permissions: {}` or read-only, widened per job;
  `persist-credentials: false` on every checkout; `timeout-minutes` and
  `concurrency` on every job; never `pull_request_target`; every action pinned
  to a SHA with a version comment.
- **Checks:** the required `verify` status comes from one fail-closed job
  that `needs` every lane (format, lint, build, test, and so on). Lanes are
  separate jobs, never a matrix, so a failure names its concern, and the job
  requires an explicit `success` from each lane, so a cancelled or skipped one
  fails it. Start from `workflow-templates/verify.yml`; `m3l-groundwork`'s
  `ci.yml` is the worked example.
- **Tool pins:** a CI tool lives in its own folder with a lockfile and installs
  with `npm ci --ignore-scripts`. If the tool needs its install scripts to run
  (a tool that downloads its own binary does), say so in `SECURITY.md` as an
  accepted risk. Node is pinned in `.node-version`, and no workflow writes a
  version number after `node-version:`: use `node-version-file: .node-version`.
  A lane that tracks the newest release on purpose may say `node-version: current`.
  The script checks this one.
- **Secrets:** scope a secret to an environment where possible, give it an
  expiry of one year at most (rotate yearly if it cannot expire), and list it
  in the repository's `SECURITY.md`. The org `SECURITY.md` shows the table.
- **Releases, for a repository that publishes artifacts:** OIDC trusted
  publishing with no stored token, provenance, a build attestation, a
  CycloneDX SBOM, and an environment with two required reviewers gating the
  publish job. `m3l-groundwork`'s `release.yml` and `docs/github-blueprint.md`
  are the reference implementation.

> [!NOTE]
> The `main` ruleset now asks for one code-owner approval, an approval of the
> last push, and a branch up to date with `main` before merging. With two
> owners, every pull request needs the other one.
> Applying it changes the repository the moment `--apply` runs.

## Scorecard findings

`scorecard.yml` publishes its findings as Code Scanning alerts. The script
lists every open one as `DRIFT`, so an alert is either fixed or dismissed with
a reason, never left open.

| Check | Resolution |
| ----- | ---------- |
| Security-Policy | Fix it: the repository's own `SECURITY.md` with an absolute advisory URL |
| CII-Best-Practices | Fix it, for a code repository: register at bestpractices.dev, reach Passing at least, add the badge to the README title block, keep the answers in `.bestpractices.json` and list that file in `REUSE.toml`. A repository with no code (`.github`) dismisses it as not applicable. Reference: `m3l-groundwork` |
| Code-Review | Dismiss it only while the score still climbs after the `main` ruleset's adoption. Every PR since needs an approval, so it self-corrects. Re-check at 10 |
| Branch-Protection (8) | Dismiss it. The two-approval tier needs a standing bypass with two org members, and the empty bypass list is deliberate |
| Maintained | Dismiss it. It is time-based and clears 90 days after the repository's creation |
| Fuzzing | Dismiss it when the repository has no parser of untrusted input, and say what its inputs are instead |

Dismiss as **won't fix**, with a comment that names the reason and the PR that
documented it:

```sh
gh api -X PATCH repos/monte3l/REPO/code-scanning/alerts/N \
  -f state=dismissed -f dismissed_reason="won't fix" \
  -f dismissed_comment="Reason. See SECURITY.md (PR #N)."
```

The reason lives in an `## Accepted OpenSSF Scorecard findings` section of the
repository's `SECURITY.md`: a table of Check, Score and Why it stays, as in
`m3l-output-governor`. Do not turn a dismissed finding into a standing bypass.

## Claude Code guards

`m3l-groundwork` is the source of truth for the hooks that keep a Claude Code
session inside the org's rules. Copy them, never link them, and keep each copy
identical apart from its header, as `repair-core-bare.mjs` does.

| Hook | Blocks | Needs |
| ---- | ------ | ----- |
| `guard-secret-writes.mjs` | A write (`Write`, `Edit`) that puts a real secret on disk | Node only |
| `guard-git-push-signed.mjs` | A `git push` with an unsigned outgoing commit, where signing is on | `bin/lib/signed-range.mjs` copied beside it |
| `require-signoff.sh` | A `git commit` without `-s` | `jq`; the copy in `.github/.claude/hooks/` |

Every `main` ruleset requires signed commits and the org asks for a DCO
sign-off, so the hooks catch a rejected push before it happens. The script does
not check for them: whether a repository runs Claude Code is its own decision.

## Not covered

Secrets, GitHub App installations, code scanning default setup, and
organization policy (default repository permission, secret visibility,
allowed actions). Those need an organization owner. See the checklist linked
above.
