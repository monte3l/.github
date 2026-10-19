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
| `rulesets/main-branch.json` | The `main` ruleset, taken from `m3l-groundwork`: signed commits, no force-push or delete, PRs with one code-owner approval (and approval of the last push) and resolved threads, and branches up to date with `main`, and `verify`, `Dependency Review`, `CodeQL` and `Gitleaks` required |
| `rulesets/tags.json`     | Tags cannot be moved or deleted; creating one stays allowed so releases can tag                            |
| `repo-settings.json`     | Merge settings: merge commit and squash allowed, rebase off, delete head branches after merge             |
| `actions.json`           | Read-only workflow token, workflows cannot approve PRs, approve fork PR runs for all outside contributors, SHA pinning required |
| `labels.json`            | Labels that Dependabot and the baseline's scheduled audit apply, coloured with m3l-design's status primitives. Labels are create-only, so existing repositories keep their old colours |
| `design-system.json`     | The m3l-design release tag (`vX.Y.Z`) every repository should record in `design/README.md`. Checked by the script, never applied |
| `files/`                 | Starting points for files a repository commits itself: `gitleaks.toml`, `gitattributes`, `editorconfig`, `REUSE.toml`, `dependabot.yml` and a `README.md` skeleton. The script only checks that the repository has the matching file, and does not check the README at all |
| `environments.example.json` | An example `npm-publish` environment. Not applied by the script: it needs real reviewer ids            |

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
> The blueprint requires the `verify`, `Dependency Review`, `CodeQL` and
> `Gitleaks` checks and SHA-pinned actions. `Gitleaks` also needs the
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

`sync-design.sh` downloads the release, verifies its attestation and
checksums, then replaces `design/source/`, `design/tokens.css` and
`design/SHA256SUMS` and rewrites the marker. It never creates the marker and
never touches `design/local/`. Prove a copy is unedited with
`cd design && shasum -a 256 -c SHA256SUMS`.

Markdown rules, for both tiers: **bold** instead of italics or underlines, a
GitHub alert matched to the severity of the point (never more than two in a
row, and `[!CAUTION]` only for data loss or anything irreversible), plain
direct sentences, and a table for tabular data.

To move to a newer version, run the script again and commit the result,
including the marker. `m3l-groundwork/design/README.md` documents the vendored
layout in full. Its `templates/**` stay brand-neutral on purpose, so anything a
repository emits into other projects is not styled.

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

GitHub cannot inherit these, so the script only reports a missing file
(`DRIFT`, never applied). Each is a commit in the repository.

| Item | Standard | Starting point |
| ---- | -------- | -------------- |
| `CODEOWNERS` | Required: the `main` ruleset asks for a code-owner approval | Write one, usually `* @enri3l @giulmonte` |
| Gitleaks config | `.gitleaks.toml` extends the default rules; the workflow passes it as `GITLEAKS_CONFIG` | `files/gitleaks.toml` |
| Line endings and editor | `.gitattributes` with `* text=auto eol=lf`, and `.editorconfig` (utf-8, lf, 2 spaces, final newline). A repository that hashes raw bytes keeps `* -text` instead: see the note below | `files/gitattributes`, `files/editorconfig` |
| REUSE | `REUSE.toml` plus `LICENSES/`, checked by `reuse lint` in CI, from any workflow. Required because every repository that vendors m3l-design ships its OFL-1.1 fonts next to MIT files | `files/REUSE.toml`, `workflow-templates/reuse.yml` |
| Workflow lint | actionlint and zizmor on every change to a workflow, from any workflow | `workflow-templates/workflow-lint.yml` |
| Scorecard | Public repositories only | `workflow-templates/scorecard.yml` |
| Dependabot | `.github/dependabot.yml` with the `github-actions` ecosystem, a 7-day cooldown, and one `npm` entry per lockfile directory (1-day cooldown) | `files/dependabot.yml` |

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
- **Tool pins:** a CI tool lives in its own folder with a lockfile and installs
  with `npm ci --ignore-scripts`. If the tool needs its install scripts to run
  (a tool that downloads its own binary does), say so in `SECURITY.md` as an
  accepted risk. Node is pinned in `.node-version`.
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

## Not covered

Secrets, GitHub App installations, code scanning default setup, and
organization policy (default repository permission, secret visibility,
allowed actions). Those need an organization owner. See the checklist linked
above.
