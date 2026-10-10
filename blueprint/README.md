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
| `rulesets/main-branch.json` | The `main` ruleset, taken from `m3l-groundwork`: signed commits, no force-push or delete, PRs with resolved threads, and `verify`, `Dependency Review`, `CodeQL` and `Gitleaks` required |
| `rulesets/tags.json`     | Tags cannot be moved or deleted; creating one stays allowed so releases can tag                            |
| `repo-settings.json`     | Merge settings: merge commit and squash allowed, rebase off, delete head branches after merge             |
| `actions.json`           | Read-only workflow token, workflows cannot approve PRs, approve fork PR runs for all outside contributors, SHA pinning required |
| `labels.json`            | Labels that Dependabot and the baseline's scheduled audit apply, coloured with m3l-design's status primitives. Labels are create-only, so existing repositories keep their old colours |
| `design-system.json`     | The m3l-design version every repository should record in `design/README.md`. Checked by the script, never applied |
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
([artifact](https://claude.ai/artifact/AyFoi7PNmQJXLyKUyBxHyk)). It is copied
into each project, never imported: there is no `@monte3l/m3l-design`
dependency, and a repository may diverge deliberately. The version to record
is pinned in `design-system.json`, and the script reports a repository whose
`design/README.md` is missing or names another version. It cannot fix that,
because adopting the system is a commit in the repository.

| Tier     | When                                                              | What to do                                                                                                                                                       |
| -------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Content  | Markdown only: no CSS, fonts, rendered pages or terminal colour   | Follow the markdown rules below. Add `design/README.md` with a line ``- **Version adopted:** `<id>` ``. See this repository's own `design/README.md`.            |
| Vendored | Any CSS, HTML, docs site or coloured terminal output              | Copy the artifact verbatim into `design/source/` and record ``- **Version copied:** `<id>` ``. Keep local divergence in `design/local/`. Never hand-edit `source/`. |

Markdown rules, for both tiers: **bold** instead of italics or underlines, a
GitHub alert matched to the severity of the point (never more than two in a
row, and `[!CAUTION]` only for data loss or anything irreversible), plain
direct sentences, and a table for tabular data.

To move to a newer version, re-sync file by file and update the recorded
version in the same commit. `m3l-groundwork/design/README.md` documents the
vendored layout in full. Its `templates/**` stay brand-neutral on purpose, so
anything a repository emits into other projects is not styled.

## Not covered

Secrets, GitHub App installations, code scanning default setup, and
organization policy (default repository permission, secret visibility,
allowed actions). Those need an organization owner. See the checklist linked
above.
