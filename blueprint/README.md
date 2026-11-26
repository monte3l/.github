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
| `labels.json`            | Labels that Dependabot, the baseline's scheduled audit and the PR labeler apply, coloured with m3l-design's primitives: status colours for `dependencies`, `security` and `freshness`, the brand colour for the four shared `area:*` labels. `freshness` marks every issue a scheduled check opens, so one search (`gh search issues --owner monte3l --state open --label freshness`) lists what is waiting across the organization; `org-audit.yml` prints only the counts, because this repository is public. Labels are create-only, so existing repositories keep their old colours |
| `design-system.json`     | The m3l-design release tag (`vX.Y.Z`) every repository should record in `design/README.md`, and `consumers`, the repositories `design-resync.yml` opens re-sync pull requests in. The tag is checked by the script, never applied. See [Design system](#design-system) |
| `release.json`           | The shared release workflow the script looks for in each repository's workflows, and the repositories exempt from releasing, each with its reason. Checked by the script, never applied. See [Releases](#releases) |
| `dependabot-exemptions.json` | The lockfile folders a repository leaves out of `dependabot.yml` on purpose, each with its reason, keyed by repository and folder. The `Dependabot: lockfile folders` item reads it. A folder that is not here and has no `npm` entry is drift |
| `projects.json`          | Every monte3l repository: its docs-site URL, card line, description and topics. The org site's project cards, `profile/README.md`'s table and each repository's GitHub description and topics are checked against it. See [Descriptions](#descriptions) |
| `openssf.json`           | The OpenSSF Best Practices level every public repository should reach (`minimum`: a metal level and a Baseline level), and the repositories exempt from it, each with its reason. Checked by the script, never applied |
| `pins.json`              | The tool versions pinned by hand because Dependabot does not read them (`GITLEAKS_VERSION`, the actionlint image, zizmor): the version, the upstream repository, the text each listed file must contain. `bin/pin-parity.mjs` checks every copy offline, and `.github/workflows/freshness.yml` reports a stale pin weekly. Never applied by the script |
| `upstream.json`          | The upstream policies the standard follows (the OpenSSF Scorecard checks, the OpenSSF Baseline, the OpenSSF Best Practices criteria, the REUSE specification) and the value of each that a person last reviewed. `bin/upstream-watch.sh` compares them weekly and `.github/workflows/freshness.yml` reports a change in one issue. Never applied by the script. See [Keeping the standard current](#keeping-the-standard-current) |
| `sync.json`              | How the template sync treats each workflow template and each verbatim starter (`managed` or `unmanaged`), the paths a starter may be kept at, the optional blocks a repository takes (its flags), and which repositories are consumers, with the paths where one keeps a file elsewhere. `bin/sync-parity.mjs` checks it against `workflow-templates/`, `files/`, `bootstrap.json` and `projects.json`. Never applied by the script. See [Workflow template sync](#workflow-template-sync) |
| `bootstrap.json`         | What a new repository starts with: the starter files, the workflow templates, the optional parts (`--kind`, docs, Claude, environments) and where each is written. Never applied by the script. `bin/bootstrap-parity.mjs` fails the docs check if a starter or template is neither listed nor excluded with a reason, or if an entry points at a missing file, writes a path twice or outside the repository, or has a key or condition nobody defined |
| `org.json`               | The organization's display name, description and website. Never applied or checked by the script, because it is an org setting. An Owner sets it, see [Descriptions](#descriptions) |
| `tracking.md`            | Where a project records bugs, gaps, limits, unverified claims, decisions and planned work, with which tool, and the one-time org setup. See [Tracking work](tracking.md) |
| `issue-types.json`       | The organization's six issue types (Bug, Feature, Task, Gap, Debt, Verify). A record: issue types are an org setting, so nothing applies it |
| `../.github/workflows/project-backfill.yml`, `../bin/project-backfill.sh` | The weekly run that adds issues the forms could not to the org Project. It adds only, and publishes counts only. See [Tracking work](tracking.md#milestones-and-the-org-project) |
| `../.github/workflows/bestpractices-sync.yml`, `../bin/bestpractices-sync.mjs`, `../bin/lib/bestpractices.mjs`, `../bin/bestpractices-sync-pr.sh` | The daily run that keeps each registered project's `.bestpractices.json` and its bestpractices.dev answers in step. It publishes counts only. See [OpenSSF Best Practices sync](#openssf-best-practices-sync) |
| `docs-site.md`           | The docs site standard, the Cloudflare one-time setup and the runbook. See [Docs site](#docs-site) |
| `files/`                 | Starting points for files a repository commits itself: `gitleaks.toml`, `gitattributes`, `editorconfig`, `REUSE.toml`, `dependency-review-config.yml`, `SECURITY.md` (a starting point with placeholders) and `CODEOWNERS`, and for a docs site `docs.config.mjs`, `deploy-tools/`, `environments.json` (the environment cleanup policy) and `dependency-review-config-docs.yml` (the `sharp` exemptions), `policies.yml` and `scancode-config.yml` (the ScanCode license policy and ignored paths), `dependabot.yml`, `labeler.yml`, `guard-shared-checkout.mjs` (the worktree guard, see [Worktree guard](#worktree-guard)), `require-signoff.sh` (the sign-off guard, see [Sign-off guard](#sign-off-guard)), `guard-secret-writes.mjs`, `guard-double-background.mjs`, `guard-shell-portability.mjs`, `guard-git-push-signed.mjs` and `signed-range.mjs` (see [Other guards](#other-guards)), `check-plugin-metadata.mjs` (a plugin repository's manifest parity check, see [Claude Code plugins](#claude-code-plugins); not bootstrapped), a `README.md` skeleton, `ROADMAP.md` and `decisions/` (the roadmap and decision-record starters), `release-please/` (the release configuration starters), and for a docs site `docs.config.mjs` and `deploy-tools/`. The script only checks that the repository has the matching file, and does not check the README at all |
| `environments.example.json` | An example `npm-publish` environment. Not applied by the script: it needs real reviewer ids            |
| `claude/managed-settings.json` | The Claude Code policy for the whole Claude Team organization, pasted into the admin console by an Owner. Never applied by the script. See [Claude Code managed settings](#claude-code-managed-settings) |
| `../bin/new-repo.sh`, `../bin/bootstrap-render.mjs` | Creates a repository that starts out following this blueprint. See [New repository](#new-repository) |
| `../.github/workflows/template-sync.yml`, `../bin/template-sync-pr.sh` | Opens the pull requests that refresh stale workflow copies. See [Refreshing stale copies](#refreshing-stale-copies) |
| `../.github/workflows/org-audit.yml`, `../bin/org-audit.sh` | The weekly read-only run of the script over every repository, reported in one tracking issue. See [Org audit](#org-audit) |
| `../workflow-templates/environments.yml` | The weekly `env-janitor` cleanup workflow. See [Environment cleanup](#environment-cleanup) |
| `../workflow-templates/release.yml`, `commit-lint.yml` | The release caller and the Conventional Commits check. The shared workflows they call are `../.github/workflows/release-prepare.yml` and `release-finalize.yml`. See [Releases](#releases) |

`integration_id` values in the `main` ruleset are GitHub's own apps (15368 is
GitHub Actions, 57789 is code scanning), so they are the same in every
organization.

## Use

```sh
bin/apply-repo-baseline.sh monte3l/NEW-REPO             # read-only comparison, exit 1 on drift, 3 if a call failed
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
> `Gitleaks`, `DCO sign-off` and `Commit lint` checks and SHA-pinned actions. `Gitleaks` also needs the
> `GITLEAKS_LICENSE` organization secret to be shared with the repository.
> Applying it to a repository that does not produce those checks, or that
> uses unpinned actions, blocks merges and fails workflows until that is
> fixed. Run `--check` first.

## New repository

The whole path, from the registration pull request to the local checkout, is in
[Starting a new project](new-project.md). This section covers the script.

`bin/new-repo.sh NAME` creates a repository that starts out following the
blueprint, so the first baseline check has little to report. It is read-only
until `--apply`: without it, it renders every file into a temporary directory
and prints what it would do. The repository must be in `projects.json` already
(and in the profile table), because its description, topics and site come from
there, and it must not exist: the script never changes an existing repository.

What goes in is `bootstrap.json`: the starters, the workflow templates (rendered
the way the template sync renders them, so the copies classify as identical and
stay current) and the design marker. `--kind` adds the release configuration of
that kind, `--claude` the Claude Code workflow and `--private` makes the
repository private. `--scaffold` runs the pinned, published `@monte3l/groundwork` first;
what it writes wins, the script only adds what is missing, and the org `verify`
workflow is left out because the scaffold's own `ci.yml` already defines that
check.

With `--apply`, in this order:

| Step | Why this order |
| --- | --- |
| One signed-off commit, then create the repository | Nothing is pushed yet |
| Add the repository to the four Apps | They are installed on selected repositories, so a new one is not covered until it is added. The first real run showed gh's OAuth token is accepted; GitHub documents the call for a classic token, so another kind may be refused: that is listed for a person (organization settings, GitHub Apps, Configure, repositories), never a failure |
| Share the organization secrets (`GITLEAKS_LICENSE`, and the release App's when there is a kind) and turn on immutable releases | A new repository is shared no organization secret by default, and the baseline reports a missing release secret but does not share it. This comes **before the push**, because the push starts Gitleaks and Release at once, and a secret shared afterwards does not rescue those first runs. Both are organization or repository writes, covered by the confirmation |
| Push `main` | The ruleset does not exist yet, so this is the one direct push the repository ever gets |
| Set the topics | They come from `projects.json` |
| `apply-repo-baseline.sh --apply` | Settings, ruleset and labels |
| `apply-repo-baseline.sh --check`, then the list of what is left | Placeholders in the starters, the `sync.json` entry to add, the reuse.software and bestpractices.dev registrations, and for a public repository the Scorecard alerts of its first run |

Exit `0` means done, the check is clean and nothing needs a person, `1` done but
the check reports drift or a step needs a person (a new public repository
normally ends `1`: the Scorecard alerts and the two registrations cannot be
settled on day one), `2` a refused input,
`3` a failed call. The placeholders left in the starters are always listed at
the end and never change the exit code: a person fills them in. After a failure
past the point where the repository exists, the message says how to finish by
hand, and if the push was what failed it keeps the rendered files for the retry.

It needs `gh` as an organization owner, with the `repo`, `workflow` (the push
includes workflow files) and `admin:org` scopes, which it checks before creating
anything. `--scaffold` runs a **pinned** version of the CLI, recorded in
`pins.json` like `GITLEAKS_VERSION`, and asks before running it.

A private repository gets neither `scorecard.yml` (it cannot check itself out) nor `dependency-review.yml` (it needs a public repository or Code Security), and the first push always shows the placeholder `verify` step failing: it fails on purpose until a person replaces it with the repository's checks.

`--docs` adds a docs site, which is most of the nine steps of
[Wiring a new site](docs-site.md#wiring-a-new-site): the docs kit config, the
deploy tools with a reviewed, committed lockfile (copied from a starter that Dependabot keeps current, so no `npm install` runs at bootstrap), the `docs`, `docs-live`, `docs-freshness` and
`environments` workflows, `.node-version`, the environment cleanup policy, the
`sharp` exemptions in the dependency-review config, a Dependabot entry for
`tools/deploy`, and the design **vendored** from the pinned m3l-design release by
its own `bin/sync-design.sh`, which verifies the attestation. The release is fetched by its full tag ref, never by a name that a branch could also have, because the script then runs it with your credentials. It runs the real
docs gate (`build.mjs --check`) on the result **before anything is created**, so
a site that would fail its first deploy fails on your machine. It then creates the
`docs-cloudflare` and `env-janitor` environments limited to `main`, asks for the
four secrets they hold (a hidden prompt on a terminal, otherwise listed as steps for a
person) and, after the settings, dispatches the cleanup workflow
once as a dry run and waits for it: the baseline wants one green run of it, and
it proves the App, the secrets and the policy resolve together. Left for a person: the Cloudflare DNS check, a docs lane in
`verify.yml` so a pull request is gated, and the repository's entry in
`design-system.json`'s `consumers`. It cannot be combined with `--scaffold` yet.
Its starters for the two options differ (a docs repository's Dependabot,
dependency-review config and README), and `bootstrap.json` chooses between them
with `requires` and `!requires`.

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

### Re-syncing from a release

`m3l-design`'s release workflow sends `release-published` to this repository
(`notify: [".github"]`). `.github/workflows/design-resync.yml` then opens one
pull request per repository listed under `consumers` in `design-system.json`,
and one here that also moves the pin. Each runs the real `sync-design.sh` of
that tag, so the release is verified the same way as by hand, and
`bin/design-resync-pr.sh` commits the result as the release App, so GitHub
signs it and the required checks run on the pull request.

| Rule | Why |
| ---- | --- |
| The tag must be a published, stable release of `monte3l/m3l-design`, named `vX.Y.Z` | The payload only names the release. The files come from that release, never from the dispatch |
| A dispatch for a tag older than the pin does nothing | It would move every repository backwards |
| A newer release closes the open re-sync pull request of an older one, if only the release App committed to it | Two open re-syncs of the same files would conflict. A person's commits are never discarded |
| A file that is not a plain `100644` file stops the run | The API commit cannot set a file mode |
| Nothing adapts a repository to the new version | A person reads the release notes and the checks before merging |

Run it by hand for a missed tag or one repository:
`gh workflow run design-resync.yml -R monte3l/.github -f tag=v1.3.2 -f repositories="m3l-plugins"`.
A new repository that vendors `m3l-design` goes in `consumers`.

The vendored payload includes the **docs kit**, which builds and gates a docs
site. See [Docs site](#docs-site).

Markdown rules, for every tier: **bold** instead of italics or underlines, a
GitHub alert matched to the severity of the point (never more than two in a
row, and `[!CAUTION]` only for data loss or anything irreversible), plain
direct sentences, and a table for tabular data.

To move to a newer version, run the script again and commit the result,
including the marker. You rarely need to: when `m3l-design` publishes a
release, `design-resync.yml` (below) does it. `m3l-groundwork/design/README.md` documents the vendored
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

## Descriptions

What monte3l says about each repository is one set of words in three lengths,
all kept in `projects.json`, so the GitHub page, the manifest, the org profile
and the social card never drift apart.

| Text | Where it lives | Rule |
| --- | --- | --- |
| **Card line** | `projects.json` `card` only. `m3l-design`'s `bin/build-brand.mjs --social` prints it on the repository's social card | Up to 120 characters, so it fits two card lines without an ellipsis |
| **Description** | `projects.json` `description`, the GitHub About text, and the manifest's `description` (`package.json` or `plugin.json`) | Up to 200 characters. The card line, expanded. The docs kit's `--metadata` check keeps the manifest and GitHub in step |
| **Profile row** | `profile/README.md`'s table: the description, a full stop, then the link to the docs site | Written from the description, never edited on its own |
| **Topics** | `projects.json` `topics`, set on GitHub | One to eight, lowercase words joined by hyphens. `claude-code` for a Claude Code project, plus what it is |

**Wording**, for the card line and the description alike:

- Open with a noun phrase for what it is: "A CLI that…", "A Claude Code plugin that…", "The design system…".
- Plain words, addressed to the reader where it fits: "the prompts you type", "where your output tokens go".
- One clause. No colon or semicolon list.
- No final dot and no ellipsis. A card or an About line just stops.
- UK spelling in the Oxford style: `-ize` as in organization and standardize, but colour, behaviour, catalogue and licence. Names such as `color-*` tokens, `/customize` and `LICENSE` are identifiers, so they are never respelled. "Claude Code" is always capitalized.
- Name monte3l only where it is the point: the marketplace, the design system and this repository. Elsewhere the card and the page already say it.

**Organization details** (`org.json`): the display name is `monte3l`, as in prose; only the logo is set in capitals. The description is the profile's tagline without its full stop. An Owner sets these in the organization settings, or with
`gh api -X PATCH orgs/monte3l -f name=... -f description=... -f blog=...`.

`bin/doc-parity.mjs` fails on a card line or description that breaks these rules, a profile row that does not carry its description, and a profile tagline that is not `org.json`'s description. To change a text, edit `projects.json`, rewrite the profile row, change the manifest in the repository and run `gh repo edit` (the script prints the command). Then render the social card again with `node bin/build-brand.mjs --social <dir>` in `m3l-design` and upload it in the repository's settings.

## Org audit

`.github/workflows/org-audit.yml` runs `bin/apply-repo-baseline.sh` in its
default, read-only mode against every repository every Monday, through
`bin/org-audit.sh --public`. It keeps one issue in this repository, **Org
baseline drift**, labelled `area:ci` and `freshness`: opened or rewritten when the counts
change, closed when the organization is clean. It is the scheduled form of the
`/org-drift` skill.

> [!IMPORTANT]
> This repository is public, so the issue, the job summary, the logs and any
> artifact are readable by anyone. The scheduled run therefore publishes
> **counts only**: how many repositories differ and how many items. Which
> repository differs, and in which setting, would tell an outsider where to
> aim, so it never leaves your machine. Read the detail with `bin/org-audit.sh`
> (or `/org-drift` in Claude Code) and an admin token. Do not add per-repository
> output to the workflow, to a summary or to an artifact.

| Exit code | Meaning | What the audit does |
| --- | --- | --- |
| 0 | No drift | Closes the issue |
| 1 | Drift | Rewrites the issue with the new counts. The run stays green, because the issue is the report |
| 2 | Usage or a missing tool | Fails the run |
| 3 | A call failed, so a repository could not be checked | Counts it in the issue where it can, and fails the run, so a broken audit is never read as a clean one |

The workflow has no inputs. A dispatch input is shown on the public run page,
and a step's `env:` value in the public log, so naming a repository there would
publish it. To audit one repository, run `bin/org-audit.sh --repos NAME` locally.

### One-time setup (an Owner)

| Step | Where | Value |
| --- | --- | --- |
| Create the App | Organization settings, GitHub Apps | `monte3l-audit`, no webhook, no user authorization. **Read-only** repository permissions: Actions, Administration, Contents, Environments, Issues, Metadata, Code scanning alerts. **Read-only** organization permissions: Administration, Secrets. A later change to the permissions stays pending until an Owner accepts it on the installation, and the workflow's `permission-*` inputs must not ask for more than the installation holds |
| Install it | The App's page | **Selected repositories**: every repository today. A new repository is **not** covered until it is added here, so the audit does not read it |
| Create the environment | `monte3l/.github`, Settings, Environments | `org-audit`, deployment branches limited to `main`, no reviewers needed |
| Add two environment secrets | Same environment | `AUDIT_APP_CLIENT_ID` and `AUDIT_APP_PRIVATE_KEY` |

> [!WARNING]
> The App's private key can read every repository's settings and the names of
> the organization's secrets. It belongs only in the `org-audit` environment.
> The workflow mints the token in one step and passes it to no other, and
> `.github/environments.json` lists the environment so the weekly cleanup does
> not remove it.

The App has no write permission. The issue is written with the workflow's own
`GITHUB_TOKEN`. **Issues** read lets it list labels on a private repository and
**Environments** read lets it read environment secrets. A token without them
prints `SKIP` for those two items, never a false `OK`. The token covers every repository the App is installed on,
which `zizmor` flags (`github-app`); the workflow ignores that one finding on
that one line, with the reason beside it.

### What "no drift" covers

**No drift** means none in the items that ran. Under the App token the baseline
prints `SKIP`, which is not drift, for what it cannot read, and the issue shows
counts only, so a closed issue is not proof that everything was verified. The
job summary says how many items were skipped. Run `bin/org-audit.sh` with your
own admin token now and then: its report has a SKIP column per repository.

> [!IMPORTANT]
> The scheduled run cannot see the merge settings or **who may bypass the
> rulesets**. A change to either shows up only in a local admin run, so run one
> after anything that touches rulesets or repository settings.

| Item | Skipped under the App token | Until |
| --- | --- | --- |
| `release: app installation` | Always. GitHub's `GET /user/installations/{id}/repositories` accepts a user access token only | Never: only an admin token can run it |
| `labels` | Only if the token lacks **Issues** read (the App has it) | The token has it |
| `env-janitor: environment secrets`, `docs-cloudflare: environment secrets` | Only if the token lacks **Environments** read (the App has it) | The token has it |
| `env-janitor: org secrets`, `docs-cloudflare: org secrets` | Only if the token cannot read the organization's secrets (**Secrets** read at the organization) | The token has it |
| `security: Dependabot alerts`, `security: Dependabot security updates` | Only if GitHub answers the token with a 403. A 404 is read as off, so a token that GitHub answers with 404 still shows drift | The token can read those settings |
| `repository settings` (the merge settings) | When GitHub does not return them to the token, so every key reads as absent. It does not, with no token at all | Never for the read-only App, as far as I know. Only a local admin run checks them |
| `ruleset: NAME: bypass actors` | When GitHub does not show who may bypass the ruleset to the token. The rest of the ruleset (rules, conditions, enforcement) is still compared | Never for the read-only App, as far as I know. Only a local admin run checks who may bypass the rulesets |
| Items a plan cannot have (rulesets and fork-PR approval on a private free-plan repository, OpenSSF for `.github`) | On any token | The plan changes |

## Keeping the standard current

The standard follows policies that other people change: which checks OpenSSF
Scorecard runs, what the OpenSSF Baseline and the Best Practices criteria
require, and what the REUSE specification says. Nothing told us when one moved.
`.github/workflows/freshness.yml` now compares each with the value a person last
reviewed, every Monday, and keeps one issue, **Upstream policy changed**, up to
date. It closes the issue when nothing differs.

| Source | What counts as a change | Why that signal |
| --- | --- | --- |
| OpenSSF Scorecard checks | A check added, removed or re-rated (name and risk level) | The file also changes for doc-link fixes, so the last commit would fire most weeks |
| OpenSSF Baseline | A new release of `ossf/security-baseline` | It publishes tagged releases |
| OpenSSF Best Practices criteria | A new commit under `criteria/` in `ossf/best-practices-badge` | It has no releases, and the commits there change the criteria |
| REUSE specification | A new released heading in `fsfe/reuse-website`'s `CHANGELOG.md` | The site has no releases or tags |

The workflow only reports, and it never accepts a change. To review one:

1. Read the linked change.
2. If the standard should follow, update what `affects` in
   `blueprint/upstream.json` names. A re-rated Scorecard check can change which
   findings to fix or dismiss, and a new Baseline release can raise the level in
   `openssf.json`.
3. Run `bin/upstream-watch.sh --accept NAME` and commit `blueprint/upstream.json`
   in the same pull request.

> [!NOTE]
> `--accept` states that you have looked. Do not run it to silence the issue.
> The first values in `upstream.json` record what each source said on the day the
> watcher was added. They are a starting point, not proof that the standard was
> checked against them.

## Workflow template sync

A workflow copied from `workflow-templates/` is never updated by GitHub, so a
change to a template used to reach no repository. `bin/template-sync.mjs`
compares each consumer's copy with the template, read-only, and
`freshness.yml` reports the result every Monday in one issue, **Workflow copies
are behind their templates**. The issue and the job summary hold **counts only**
(`--public`): how many copies are behind and in how many repositories, never which
one. The repository is public and a name would tell an outsider where to aim. Run
`node bin/template-sync.mjs` with `gh` access for the full comparison. Eleven
verbatim starters are compared the same way, see [Starters](#starters).

The log of `template-sync.yml` follows the same rule, and a test drives both scripts
through every path it can reach to hold it (`tests/sync-log-public.test.mjs`). In a
workflow run (`GITHUB_ACTIONS=true`):

- `template-sync.mjs --write` prints only `refreshed N copies`. Its error messages, in
  the plan job too, name no repository, file, template or `gh` text.
- A copy held back because its refresh would rename a job is not mentioned in the log.
- `template-sync-pr.sh` prints how many files and bytes, never which files, versions,
  branch, title or commit author. A refusal says how many changes it refused, and a
  failed `gh` call says only that it failed, with its own message dropped.

Run by hand, both print the full detail and the full messages: that is the audit view.
What a public log still shows:

| What | Why |
| --- | --- |
| The repository being refreshed | The step environment, the token action's inputs and `actions/checkout` print it, not these scripts. The names are already public in `sync.json`. |
| That a leg ran for it | A leg exists only for a repository with a stale copy, so its existence says that one is behind. Not which file, how far, or why. |
| The URL of the pull request it opened | The script prints it, and it holds the repository name. The pull request is public in the other repository. |

A failure that is not one of those cases, such as an uncaught error from `jq`, can still
print what the tool prints. The script does not trap every exit.

The template is first **rendered** for the repository: `https://PROJECT.monte3l.com`
becomes its site, and a block between `# sync:if FLAG` and `# sync:end` stays
only in a repository that has that flag in `sync.json`. Then the two are
compared in two ways, on purpose not equally forgiving. A **lenient** comparison
ignores comments, blank lines, the SPDX header and action pins, and can only
decide that nothing needs doing. A **strict** comparison ignores everything
except the SPDX header, blank lines and pins, and decides that a copy is stale.
A line that starts with `#` is not always a comment: inside a script it can be a
heredoc heading, and a person who commented a step out leaves one behind.
Dependabot owns the pins in each repository.

| State | Meaning | What happens |
| --- | --- | --- |
| Identical | The copy is the rendered template | Nothing |
| Equivalent | Same text once comments, blank lines and pins are ignored | Nothing |
| **Stale** | Strictly equal to an **older** version of the template | Reported |
| Custom | Anything else: a person's change | Never reported, never overwritten |

The error to avoid is calling a custom copy stale, because a refresh would
overwrite someone's work. So a copy is stale only if it strictly matches a
version the template really had, and nothing looser. The tool also stops with an
error, and never reports "nothing", when it cannot read a repository in full or
the template history is missing, because the weekly job closes its issue on a
clean result.

Keep per-repository data out of a template. A package allow-list or a URL in the
file turns every copy custom. A URL is a parameter (`PROJECT`), an optional step
is a `sync:if` block, and data belongs in a config file the workflow reads.
`workflow-templates/docs-live.yml` has one block (`manifest`): `--metadata` fails
when `docs.config.mjs` has no `manifest`, so only a repository with one takes it.
`workflow-templates/release.yml` has another (`assets`, the tarball job), but it
is `unmanaged`, so nothing renders it per repository: it reaches a repository only
when a person copies the file and removes the markers. A copy made through
Actions, New workflow keeps the markers as comments, which is why that job also
tests a repository variable at run time (see [Releases](#releases)).

`verify.yml` and `release.yml` are `unmanaged`: their lanes and inputs belong to
each repository, and no `sync:if` flag can say which lanes a repository has.
`claude.yml` is `managed`: its options (authentication, `--allowedTools`) are
comments to uncomment, so a copy that someone changed reads as custom and is never
touched, and one that is only an older version gets the current gate on who may
trigger it.

### Starters

Eleven verbatim files from `files/` are compared the same way: `CODEOWNERS`,
`editorconfig`, `gitattributes`, `gitleaks.toml`, `guard-shared-checkout.mjs`
(the worktree guard), `require-signoff.sh` (the sign-off guard),
`guard-secret-writes.mjs`, `guard-double-background.mjs`,
`guard-shell-portability.mjs`, `guard-git-push-signed.mjs` and
`signed-range.mjs` (its helper), see
[Claude Code guards](#claude-code-guards). A repository may keep one at
a few paths (`CODEOWNERS` at `.github/`, the root or `docs/`). They are listed
under `starters` in `sync.json`, and the first path is where a new repository
gets the file, which `bin/sync-parity.mjs` checks against `bootstrap.json`. A
repository that keeps a file elsewhere says so under `repos.<name>.paths`, which
is also how `m3l-mentor` and `m3l-groundwork` show their `ci.yml` as the
`verify` copy.

Two optional keys keep a refresh from doing harm. A starter may list `requires`
(the push guard requires `signed-range.mjs`, which it imports): it is refreshed
only when every starter it needs, in the same repository, is current or is
refreshed in the same run. Beside a helper that is custom, missing or skipped it
is held back (`H4` in the table, `HELD` in the data), nothing is written for it,
and the findings (the local run, never the public issue) say so: `m3l-x: .claude/hooks/guard-git-push-signed.mjs is 4
versions behind its starter, but is not refreshed: bin/lib/signed-range.mjs is
custom. Refresh the pair together by hand`. A repository may also leave a
template or starter out for good with `repos.<name>.skip` (a list of names): it
is not read, written or reported (`skip` in the table), which is how a repository
that keeps its own version on purpose says so. `bin/sync-parity.mjs` fails on a
`requires` that names no starter, and on a `skip` that names neither a template
nor a starter.

A repository may also keep extra verbatim copies of a starter, its twins:
`m3l-groundwork` emits a project from `templates/core`, which holds a copy of each
guard and of the push guard's helper beside the one the repository runs itself, and
its own test requires the two to match. `repos.<name>.twins` maps a starter to a
list of paths (`"signed-range.mjs": ["templates/core/bin/lib/signed-range.mjs"]`).
Each twin is a unit of its own, shown as `STARTER+1`, `STARTER+2` in the table, and
refreshed exactly like the starter's main copy: the same history decides whether
it is stale (only an older version is, so a twin that someone edited stays
custom), it keeps the header it has or none, and `bin/template-sync-pr.sh` sends
its path because `sync.json` names it.

A twin is refreshed on its own, even when the main copy of the same starter in that
repository is custom. A repository that pins the two to match (`m3l-groundwork`'s
`org-guard-starters` test) then sees its CI fail on the sync pull request, which is
visible and is the point: someone brings the other copy up to date. A twin of a
starter that `requires` another waits for the twin of that one, and the two are paired
by position in their lists, so list a guard's twin and its helper's twin at the same
place; with no twin at that position the main copy is the one it waits for. Skipping a
starter skips its twins. `bin/sync-parity.mjs` fails on twins of something that is not
a starter, on a value that is not a non-empty list of paths, and on a path that leaves
the repository, is already the path of a starter or of another twin, or equals a
repository `paths` value. `bin/template-sync.mjs` stops with exit 2 on the same
malformed values.

Most copies are custom on purpose. `m3l-design`'s `.gitattributes` keeps bytes
exact for its checksums, and `m3l-prompt-optimizer`'s gitleaks config allows its
fake test keys. A custom copy is never reported and never overwritten. Only a
copy that strictly equals an older version of the starter is refreshed, and only
at a path `sync.json` lists, under `starters` or in the repository's own
`paths`: `bin/template-sync-pr.sh` reads that list and refuses any other file. A
refresh keeps the SPDX header the copy has, in the `#` or the `//` form, at the
top of the file or after a shebang, and a copy with none gets none. A line that
says SPDX anywhere else is the file's own text, so such a copy is custom and
never overwritten. A repository decides
what header its files carry (REUSE, or an inline check such as
`m3l-groundwork`'s `check-license-headers`), and a workflow that lost its header
fails that check. The comparison ignores the header, so the refreshed file reads
as equivalent on the next run. A file that holds per-repository content (`SECURITY.md`,
`REUSE.toml`, `dependency-review-config.yml`) is not a starter here. The
baseline's placeholder items check the first two for a starter that was never
filled in.

### Refreshing stale copies

`.github/workflows/template-sync.yml` opens one pull request per repository that
has a stale managed copy. It is started by hand (`gh workflow run
template-sync.yml -f dry_run=false -f repositories="m3l-plugins"`) and, with
`dry_run` on (the default), only lists what would change.

| Rule | Why |
| --- | --- |
| Only a **stale** managed copy is written, with the current template rendered for that repository | A custom copy is someone's work |
| A copy whose refresh would change the set of job names is left out, and said so in the log | A required check is a job name: renaming one stops merges |
| Only existing files are sent, and only a workflow under `.github/workflows/` or a file at a path listed in `sync.json` (a starter's paths, or the repository's own `paths`). The script refuses anything else | A sync refreshes, it never adds or removes, and the App cannot be made to write elsewhere |
| The file is the template with the **template's pins** | A pin can be tied to an input in the same file: an older `zizmor-action` cannot install a newer zizmor `version`. Dependabot in the repository moves the pins on afterwards |
| One branch per set of files (`chore/template-sync-<hash>`): a repeated run finds its own pull request, and one a person closed is not opened again | Closing it was an answer |
| A newer pull request closes an older one of the bot, if only the bot committed to it | A person's commits are never discarded |
| The commit goes through the API as the App | GitHub signs it, and the required checks run on the pull request |

It uses its own App, **`monte3l-sync`**: repository permissions `contents`,
`pull requests` and `workflows` write and `metadata` read, no webhook, installed
only on the consumers listed in `sync.json` and on the projects registered at
bestpractices.dev (see [OpenSSF Best Practices sync](#openssf-best-practices-sync),
which also needs `issues` write), never on `.github`. The key is in
the `template-sync` environment of `monte3l/.github` (`SYNC_APP_CLIENT_ID`,
`SYNC_APP_PRIVATE_KEY`), limited to `main` and listed in
`.github/environments.json`. The release App stays without `workflows`. Each
leg mints a token for the one repository it changes.

The workflow runs every Monday at 06:15 UTC, an hour after the weekly
`freshness.yml` issue reports what is stale, and a scheduled run is a real one:
it opens the pull requests. A run that finds nothing stale opens nothing, and a
person still reviews and merges each pull request. Started by hand it only
reports, unless `dry_run` is turned off.

## OpenSSF Best Practices sync

A project's answers live twice: in `.bestpractices.json` and on
bestpractices.dev. Without a job, every change, however small, is typed into
the other one by hand. `bestpractices-sync.yml` compares the two for every
registered project, criterion by criterion, and closes the gap. It finds a
project by its repository URL, and trusts it only when the repository's own
README badge names it: anyone can claim a URL on the site, but only someone who
can commit to the repository can add the badge. A project with no badge, or a
badge for another id, is reported as unchecked and nothing is written for it.
Registering on bestpractices.dev and adding the badge is all it takes to be
included. A repository in `openssf.json`'s `exempt`, a private one, an archived
one and a fork are skipped.

Which side is ahead is decided against the last answer both sides held, not
against a timestamp: the site keeps none per criterion.

| File vs last agreed | Site vs last agreed | What happens |
| --- | --- | --- |
| Same as the site | Any | Nothing: recorded as agreed |
| Unchanged | Changed | **Site ahead.** A pull request from `monte3l-sync` puts the site's answer in the file |
| Changed | Unchanged | **Repo ahead.** The project's tracking issue gets a link that opens the site's form with the file's answers filled in |
| Changed | Changed, and different | **Conflict.** The issue lists both answers. Nothing is changed |

The last agreed answers are a hidden `bp-agreed` line in the tracking issue
(`OpenSSF Best Practices sync`, labels `bestpractices-sync` and `freshness`), one
short hash per criterion. Every checked project has one: it is open while a
person has something to do, and closed otherwise, so it only holds the line.
The `bestpractices-sync` label is created by the job, not by the baseline, which
would otherwise report it missing in every repository.

A project with no such line yet gets **no guess**: the last agreed answer is
"unset" for every criterion. An answer on one side only goes to the other (a
file answer the site lacks becomes a link to save, and a site answer the file
lacks goes into a pull request), and an answer on both sides that differs is a
conflict, listed once with both texts for a person to settle. Deciding which
side is newer from the site's last edit overwrote better wording in the file and
pruned answers the site never had, so the job does not do it. The line only
records answers both sides were seen to share. A line from version 1, written by
the first runs, is ignored for the same reason.

> [!IMPORTANT]
> One step stays with a person: the **Save** click for a change made in the
> file. bestpractices.dev only saves an answer when a logged-in person submits
> the form, and offers a job no token to do it. The proposal link fills the form
> in and forces exactly the changed answers, so the click is all that is left.
> The other way to write, a copied session cookie, expires after 48 hours and is
> not what the site recommends, so this job does not use it.

What counts as a difference is strict on purpose:

| Rule | Why |
| --- | --- |
| A justification differing by one character is a difference | The point is that a small change needs no manual edit |
| Line endings and trailing whitespace do not count | Editors and the site's form add them |
| `?`, `unknown` and a missing key are the same answer | The site ignores `?` in the file |
| A criterion is synced only if it is in the upstream `criteria.yml` or `baseline_criteria.yml` at the commit `upstream.json` records as reviewed | A file's other keys (`name`, `description`) are never touched |
| `achieve_passing` and `achieve_silver` are not synced | BadgeApp sets them from the level below |
| A status the site would reject (an unknown word, `N/A` where it is not allowed) is reported, and the file is not rewritten while one remains | Rewriting would silently drop it |

The workflow runs every day at 05:30 UTC, and a scheduled run is a real one.
Started by hand it only reports, unless `dry_run` is turned off. A bestpractices.dev
outage makes that project unchecked, never a pull request, and the run fails
after the others were handled.

| Rule | Why |
| --- | --- |
| The pull request branch is `chore/bestpractices-sync-<hash>` and the commit goes through the API as the App | A rerun finds its own pull request, a closed one is not opened again, and GitHub signs the commit |
| Only one file is sent: `.bestpractices.json` or `.project.d/bestpractices.json` | A checkout holding anything else is not what the workflow made |
| The file keeps its own key order and spelling, and an unchanged value is left as written | A pull request shows the answers that moved, not a reordered file. A new answer goes after the last key, or right after its status key for a justification, and a file that does not exist yet is written in criteria order |
| A symbolic link anywhere on the answer file's path stops the write | The checkout comes from the project, and the tools are checked out next to it |
| A pull request does not overwrite a criterion changed in the file | That one goes to the issue as a link |
| Requests to bestpractices.dev go at one a second | The pace the site asks for |
| A run page and a log hold counts only | This repository is public |

It uses the same App as [Workflow template sync](#workflow-template-sync),
`monte3l-sync`, with one more repository permission, **issues write**: the
tracking issue lives in the project's own repository. The issue step gets its
own token with that permission alone, and the pull request step a token without
it. One leg runs at a time, because the pace to bestpractices.dev holds inside a
process, not across jobs. The key is in the
`bestpractices-sync` environment of `monte3l/.github` (`SYNC_APP_CLIENT_ID`,
`SYNC_APP_PRIVATE_KEY`), limited to `main` and listed in
`.github/environments.json`. Raising the App's permissions asks each installation
to accept them, and the App must be installed on every project it syncs.

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
| Environment | `env-janitor`, restricted to `main`. It scopes the job to `main` and holds its two secrets |
| Secrets | `JANITOR_APP_CLIENT_ID` and `JANITOR_APP_PRIVATE_KEY` are **secrets of the `env-janitor` environment** of each repository that runs the cleanup, set with `bin/env-secrets.sh set NAME`. They are not organization secrets |

The script creates the environment and adds the `main` branch policy. It also
removes the repository from an organization secret of the same name, but only
once the environment holds the secrets:

```sh
bin/apply-repo-baseline.sh monte3l/<repo> --dry-run   # read what it would do
bin/apply-repo-baseline.sh monte3l/<repo> --apply
```

It never creates or deletes a secret, or installs the App: those need the key
material or an org setting. `env-secrets.sh` writes the values. It also reports the pinned planner commit and
whether the last run succeeded, as the `env-janitor:` items in
[Repository standard](#repository-standard).

> [!WARNING]
> An org secret reaches every workflow in each repository it is shared with,
> on any branch a collaborator pushes, where an environment secret reaches
> only the job running on `main` in that environment. The key can mint an
> `administration: write` token for every repository the App is installed on,
> so it is kept out of the organization's secrets. Only `environments.yml` may
> reference the two secrets, and the script reports any other workflow that
> does, and any organization secret of the same name still shared with the
> repository.

To rotate the App's key, generate a new one in the App's settings, then run
`bin/env-secrets.sh set JANITOR_APP_PRIVATE_KEY` (the value is read from a hidden
prompt and written to every repository's `env-janitor` environment), run
`bin/env-secrets.sh check` to confirm no copy is stale, dispatch one
repository's workflow with `dry_run` on, and delete the old key. Rotate on any exposure, on a change of maintainer, and yearly, since
the key does not expire.

Run the workflow once with `dry_run` left on and read the job summary before
the first scheduled run applies anything. Add every new `environment:` name to
`.github/environments.json` in the same change that introduces it, and list
the two secrets in the repository's `SECURITY.md` as secrets of the `env-janitor` environment.

## Releases

Every repository releases the same way: Conventional Commits in, one release
pull request, a draft release, an attested and published release. The
shared part lives here, and a repository adds only what is its own (an npm
publish, a tarball).

```text
repo release.yml
  prepare   calls release-prepare.yml   release PR, or on merge: tag + DRAFT release
  <own job> runs only if a release was created; attaches assets to the draft
  finalize  calls release-finalize.yml  attest assets, publish, dispatch to consumers
```

| Step | Who | What |
| ---- | --- | ---- |
| Commit | A person | A Conventional Commit. `commit lint` fails a pull request whose title or commits are not |
| Release PR | `release-prepare.yml` | release-please opens or updates one pull request with the version bump and changelog. Review and merge it like any other |
| Draft | `release-prepare.yml` | On merge it tags the commit and creates a **draft** release |
| Assets | The repository's own job | Attaches its files to the draft. A repository with no assets has no such job |
| Publish | `release-finalize.yml` | Attests the assets, if there are any, and attaches the attestation's bundle to the draft as `<tag>.sigstore.json`, because OpenSSF Scorecard's Signed-Releases check only reads release assets (`attest: false` skips both for a repository whose own job already attested them and attached its own bundle), then publishes. Publishing is last because an immutable release locks its tag and assets. GitHub attests an immutable release itself, so a release with no assets has an attestation only when immutable releases are on for the repository |
| Notify | `release-finalize.yml` | Sends `release-published` to each repository in `notify`, so a consumer such as `m3l-plugins` can open its pin pull request |

The pull request and its commits are made as the **release App**, not
`GITHUB_TOKEN`. A `GITHUB_TOKEN` pull request triggers no required checks, and
GitHub signs a commit the App makes through the API, so the `main` ruleset's
signed-commits rule holds with no bypass actor.

### Verifying a release

`gh release verify <tag>` checks the release attestation GitHub makes for an
immutable release, and `gh release verify-asset <tag> <file>` checks one
downloaded file against it. Neither needs any option.

An asset can carry a second attestation, made by the workflow that attested it.
`gh attestation verify <file> -R <owner/repo>` accepts it only when the signer
workflow lives in that same repository, so it passes for a file the repository's
own job attested (`m3l-groundwork`, `m3l-output-governor`) and **fails with a
misleading `verifying with issuer "sigstore.dev"` for a file `release-finalize.yml`
attested** (`m3l-design`), because that workflow is in `monte3l/.github`. Name the
signer:

```sh
gh attestation verify <file> -R monte3l/<repo> --signer-repo monte3l/.github
```

### One-time setup (an Owner)

| What | Value |
| ---- | ----- |
| The `monte3l-release` GitHub App, owned by the organization and installed on selected repositories (every repository today; add a new one) | Contents and Pull requests write. Metadata read. Nothing else |
| Organization secret `RELEASE_APP_CLIENT_ID` | The App's client ID, shared with the repositories that release. A secret, like `JANITOR_APP_CLIENT_ID`, so both Apps are set up the same way |
| Organization secret `RELEASE_APP_PRIVATE_KEY` | The App's private key, shared with the repositories that release. Rotate it yearly like any other secret |
| Allowed actions | `googleapis/release-please-action@*` in the organization's allowed-actions list. Actions the shared workflows use that GitHub owns need nothing. Without the entry every `Release` run fails at startup with "is not allowed", and a run that failed that way cannot be re-run |
| Immutable releases | Organization settings, Repository, General, Releases. It affects future releases only. Every repository that releases publishes draft-first, so it is safe to turn on for all of them. A repository whose `release.yml` uploads an asset after publishing must not have it on, because an immutable release does not allow that |

For every **new** repository, an Owner also adds it to the `monte3l-release`
App's installation and shares the two secrets with it. Both are checked and
neither is applied, because the App's private key can mint a token for every
repository in the installation: a repository whose workflows can read it can
act as the App across all of them, so sharing it is a decision, not a default.
Without them the first release fails at the step that makes the token, with an
error that names neither.

### Adopting in a repository

1. Copy the starter that matches the repository from `files/release-please/` to
   `release-please-config.json`, and `manifest.json` to
   `.release-please-manifest.json`. Set `bootstrap-sha` to the commit of the
   last release, so release-please does not release the history again, and the
   manifest to the current version.
2. Copy `workflow-templates/release.yml` and `commit-lint.yml`.
3. Set `notify` in `release.yml` to the repositories that consume this one.
4. Put any repository-specific job between `prepare` and `finalize`. A repository that ships a source tarball can use the `assets` block of `release.yml`: it checks the tag through the API with the token (so a private repository works), runs `git archive`, runs `scripts/release-sbom.mjs` if the repository has one (it writes `<tarball>.cdx.json`) and uploads to the draft. It attests nothing: `finalize` attests every asset on the draft by glob, and `actions/attest` takes one literal file for `sbom-path`, never a glob, which is why a spelled-out SBOM path broke releases. The SBOM is then a signed asset, not a predicate of the tarball. A repository that wants that keeps its own job and sets `attest: false`.
   - **Opt-in twice.** The job runs only when the repository variable `RELEASE_ASSETS` is `true`, so a copy made through Actions, New workflow, which keeps the `# sync:if assets` / `# sync:end` markers as comments and so contains the job, skips it and still publishes (`finalize` uses `!failure()` so that a skipped job does not skip it). It also needs a `.node-version` file. Set the variable, and drop the marker lines.
   - **No effect by itself.** `release` is `unmanaged` and `bin/lib/bootstrap.mjs` renders with no flags, so the `assets` flag reaches a repository only when a person copies the block.
5. Keep `exclude-paths` in a root package's configuration (the `plugin.json` and `simple.json` starters carry `.claude`, `.github`, `LICENSES` and `docs`). release-please releases a `fix:` or `feat:` commit, and a commit that changes only those paths would cut a release with nothing new in it. List the repository's other non-payload folders (`bin`, `tests`, `tools`) too. The `library.json` starter has none: its packages live under `packages/`, so a change outside them is not in any package.

| Starter | For | Tag |
| ------- | --- | --- |
| `plugin.json` | A Claude Code plugin: the version lives in `.claude-plugin/plugin.json` | `<name>--vX.Y.Z` |
| `simple.json` | A repository with no package manifest, such as `m3l-design` | `vX.Y.Z` |
| `library.json` | An npm package in `packages/` | `<package>@X.Y.Z` |

Tag formats are not unified on purpose. Each is read by something else: the
plugin form by Claude Code's dependency resolution, `vX.Y.Z` by
`sync-design.sh`, and the package form by npm tooling.

The `DCO sign-off` check is required and the release pull request's commit is
made by the App, so every release configuration carries a top-level `signoff`
with the App's identity, `monte3l-release[bot]
<333264726+monte3l-release[bot]@users.noreply.github.com>`. The email is the
commit author's, which is what the check compares. Without it the release pull
request cannot merge.

> [!IMPORTANT]
> A package published to npm registers the **caller's** file name as its
> trusted publisher, which is `release.yml` in the repository. npm does not look
> at the shared workflow's name, and renaming the caller breaks publishing.

> [!NOTE]
> `Commit lint` is a required check in the `main` ruleset. A repository that
> never reports it cannot merge, so a new repository copies the template before
> the ruleset is applied to it.

The shared workflows are pinned in each caller by full commit SHA like any
action, and Dependabot's `github-actions` entry keeps the pin current. A change
to them reaches a repository only through that pull request.

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
control (`DRIFT`, never applied). Each is a commit in the repository. The two
exceptions are the `env-janitor` branch policy and dropping an org-secret share, which
`--apply` sets because they are settings, not files. The
**Reported as** column is the label the script prints, and
`bin/doc-parity.mjs` fails when this table and the script disagree.

| Item | Reported as | Standard | Starting point |
| ---- | ----------- | -------- | -------------- |
| `CODEOWNERS` | `CODEOWNERS` | Required: the `main` ruleset asks for a code-owner approval | `files/CODEOWNERS` (`* @enri3l @giulmonte`) |
| `SECURITY.md` | `security policy` | Required in the repository itself, with an absolute advisory URL and an accepted-findings table: a repository that inherits the org default scores 4 on Scorecard's Security-Policy check | `files/SECURITY.md`; `m3l-groundwork/SECURITY.md` and `m3l-output-governor/SECURITY.md` are worked examples |
| Starter placeholders | `security policy: placeholders`, `README: placeholders` | The copy of `SECURITY.md` and of `README.md` has none of the `{...}` prompts of its starter left, and no `{repo}` token or starter comment. The prompts are read from the starter, so a new one is caught without editing the script, and a README's own braces (a JSON example, a template path) are never flagged. `bin/lib/leftover-placeholders.sh` does the comparison | `files/SECURITY.md`, `files/README.md` |
| Gitleaks config | `Gitleaks config` | `.gitleaks.toml` extends the default rules; the workflow passes it as `GITLEAKS_CONFIG` | `files/gitleaks.toml` |
| Dependency review config | `dependency review config` | `.github/dependency-review-config.yml`: the packages this repository exempts from the license check by package URL. `workflow-templates/dependency-review.yml` reads it (`config-file`) and fails without it, and the action also fails on an empty file, so it holds at least one key. The allowed licenses stay in the workflow, the same everywhere: an exemption in the workflow would make the copy differ from the template | `files/dependency-review-config.yml` |
| Line endings and editor | `line endings`, `editor config` | `.gitattributes` with `* text=auto eol=lf` (the starter also marks `*.woff2` binary, for the fonts a docs site vendors), and `.editorconfig` (utf-8, lf, 2 spaces, final newline). A repository that hashes raw bytes keeps `* -text` instead: see the note below | `files/gitattributes`, `files/editorconfig` |
| REUSE | `REUSE`, `REUSE check` | `REUSE.toml` plus `LICENSES/`, checked by `reuse lint` in CI, from any workflow. Required because every repository that vendors m3l-design ships its OFL-1.1 fonts next to MIT files. The copyright holder is `Enrico Lionello (enri3l) and Giulia Montevecchi (giulmonte), monte3l` in `LICENSE` and `REUSE.toml`, and the README badge is the REUSE API one, so register the repository at api.reuse.software | `files/REUSE.toml`, `workflow-templates/reuse.yml` |
| ScanCode | `ScanCode check`, `ScanCode: last run` | A workflow running `aboutcode-org/scancode-action` with `check-compliance`, and a `policies.yml` listing every license the repository may contain. REUSE trusts what a file declares, so a copied third-party file with only a license notice passes `reuse lint` under the catch-all MIT entry. ScanCode reads the text and fails on any license the policy does not list. Not a required check in the `main` ruleset, because the action is still beta, so the last `push` run of its workflow is reported instead: a red run on `main` blocks nothing and is easy to miss. The action itself prints only counts (`MISSING: 1`), so the template adds a step that names each flagged file in the log and the job summary. A license that a file names only as data (a test string, a policy list) goes in `scancode-config.yml` by exact path, never by a wildcard. See [Why ScanCode and not the other scanners](#why-scancode-and-not-the-other-scanners) | `files/policies.yml`, `files/scancode-config.yml`, `workflow-templates/scancode.yml` |
| Claude Code plugin | `plugin: validate`, `plugin: metadata check`, `plugin: root CLAUDE.md`, `plugin: marketplace.json` | Only for a repository with `.claude-plugin/plugin.json`: a workflow runs `claude plugin validate --strict` and `check-plugin-metadata.mjs`, there is no `CLAUDE.md` at the root (keep it in `.claude/`), and the repository ships no `marketplace.json`. The rules and their reasons are in [Claude Code plugins](#claude-code-plugins) | `.claude/CLAUDE.md` |
| Workflow lint | `workflow lint` | actionlint and zizmor on every change to a workflow, from any workflow | `workflow-templates/workflow-lint.yml` |
| Scorecard | `Scorecard workflow`, `Scorecard alerts` | Public repositories only. Open alerts are fixed or dismissed with a reason | `workflow-templates/scorecard.yml` |
| REUSE API | `REUSE API` | Public repositories only. Registered at api.reuse.software and `compliant` there, because the README's REUSE badge reads that service. An Owner registers it, and the script never applies it | [api.reuse.software/register](https://api.reuse.software/register) |
| OpenSSF Best Practices | `OpenSSF Best Practices` | Public repositories only, unless `openssf.json` exempts the repository with a reason. The project named by the README's bestpractices.dev badge reaches the `minimum` level (Silver) and 100% of the `minimum` Baseline level (3). Someone answers the criteria on the site, and the script never applies it | [bestpractices.dev](https://www.bestpractices.dev), answers kept in `.bestpractices.json` |
| DCO check | `DCO check` | Every non-merge commit in a pull request carries a `Signed-off-by:` trailer that matches its author or committer email. `DCO sign-off` is a required check in the `main` ruleset, so its job `name:` must stay `DCO sign-off` and the workflow must not filter by path | `workflow-templates/dco.yml` |
| PR labeler | `PR labeler` | A workflow runs `actions/labeler`, and `.github/labeler.yml` maps paths to labels. The four shared `area:*` labels come from `labels.json`; a label that is specific to the repository is created once by hand with `--color 554d50` | `workflow-templates/labeler.yml`, `files/labeler.yml` |
| Commit lint | `commit lint` | A pull request's title and every non-merge commit are Conventional Commits, because the release workflow reads them. The job `name:` is `Commit lint` and the workflow does not filter by path. It is a required check in the `main` ruleset: see [Releases](#releases) | `workflow-templates/commit-lint.yml` |
| Roadmap | `roadmap`, `roadmap: sections` | `ROADMAP.md` in the root or in `docs/`, with the sections Now, Next 12 months, Known limits, Unverified and What this project will not do, in that order, and a `reviewed:` date in its frontmatter. A heading may carry a qualifier (`## Now: the 1.x series`). Where each kind of item goes is in [Tracking work](tracking.md). Age is not judged here: the docs kit's page-freshness report (m3l-design 1.5.0 and later, reaching a repository with its design re-sync) covers a page that has not been reviewed for 180 days | `files/ROADMAP.md` |
| Decision records | `decision records` | `docs/decisions/README.md`, with one numbered MADR file per decision. `.github` keeps its decisions in `knowledge/`, so `knowledge/README.md` counts there | `files/decisions/` |
| Issue forms | `issue forms: org defaults` | No `.github/ISSUE_TEMPLATE/` of its own. GitHub gives a repository the org forms only when it has none, so one local file hides all of them, and with them the issue type and the Project that the forms set. `.github` holds the defaults, so it is skipped | The forms in `.github/ISSUE_TEMPLATE/` of this repository |
| Pull request template | `pull request template: org checklist` | Either no template of its own, so the org's applies, or one that keeps the org's three items: the sign-off (`git commit -s`), the Conventional Commit title and the regression test. A local template replaces the org's the way a local issue form does, so a repository may add its own checks but not drop these. Several templates in `.github/PULL_REQUEST_TEMPLATE/` replace it too. `.github` itself is skipped | `.github/pull_request_template.md` of this repository |
| Build output | `build output: dist not committed` | No `dist/` in the repository. Compiled output goes stale against `src/` and cannot be reviewed as a diff, and OpenSSF Baseline OSPS-QA-05.01 names generated executable artifacts. The package and the release assets are built in CI | `.gitignore` |
| Release config | `release: config`, `release: manifest` | `release-please-config.json` and `.release-please-manifest.json`, unless `release.json` exempts the repository | `files/release-please/` |
| Release workflow | `release: workflow` | `release.yml` calls both shared workflows, each pinned to a full commit SHA | `workflow-templates/release.yml` |
| Release workflow pin | `release: workflow pin` | Each pinned SHA is a commit on `.github`'s default branch. A commit that lived only on a pull request branch, which a squash merge drops, fails every release that copied it | `workflow-templates/release.yml` |
| Release workflow pin age | `release: workflow pin age` | Each pinned SHA already contains the newest change to `release-prepare.yml` and `release-finalize.yml` on `.github`'s default branch. Nothing moves a pin: this repository has no tags for Dependabot to follow, so a pin that is behind stays behind until a person reviews the compare link the script prints and moves it. Skipped when the pin is not on the default branch, which `release: workflow pin` reports | `workflow-templates/release.yml` |
| Release App | `release: app installation`, `release: app secrets` | The repository is in the `monte3l-release` App's installation, and can read the org secrets `RELEASE_APP_CLIENT_ID` and `RELEASE_APP_PRIVATE_KEY`. Checked for every repository that releases and for each one `release.json` lists under `appUsers` (`m3l-plugins`, which opens pin pull requests as the App). Never applied: see [Releases](#releases) | Installation settings of the App, and `gh api -X PUT orgs/OWNER/actions/secrets/NAME/repositories/ID` |
| Immutable releases | `release: immutable releases` | Publishing a release locks its tag and assets. Turn it on for the whole organization | See [Releases](#releases) |
| Dependabot | `Dependabot` | `.github/dependabot.yml` with the `github-actions` ecosystem, a 7-day cooldown, and one `npm` entry per lockfile directory, none under the root `.github/` (1-day cooldown) | `files/dependabot.yml` |
| Dependabot lockfiles | `Dependabot: lockfile folders` | Every folder that holds a `package-lock.json`, `npm-shrinkwrap.json`, `pnpm-lock.yaml` or `yarn.lock` has an `npm` entry in `dependabot.yml`, by `directory` or a `directories` glob, or is listed with its reason in `dependabot-exemptions.json`. Security updates cover every lockfile either way; version updates need an entry, because `directory` is required. The `npm` ecosystem also covers pnpm and yarn. Skipped when the file list is too large to read. See [Audit scope](#audit-scope) | `files/dependabot.yml` |
| Node pin | `Node pin` | No workflow writes a version number after `node-version:`: use `node-version-file: .node-version` | `.node-version` |
| Design system | `design system` | `design/README.md` records the version `design-system.json` pins | See [Design system](#design-system) |
| Docs site: tier | `docs site: tier` | Only for a repository with a `docs.config.mjs`: the vendored tier, or the source tier for m3l-design | [`docs-site.md`](docs-site.md) |
| Docs site: gate | `docs site: gate` | `docs-kit/build.mjs --check` runs from a workflow, on every pull request | `files/docs.config.mjs` |
| Docs site: parity | `docs site: parity` | `docs.config.mjs` lists at least one `parity` module. The gate proves the docs are well formed, and a parity module proves they still say what the code does, so a repository without one has docs that can drift unseen. Comment lines do not count, and the array may span lines | `files/docs.config.mjs`, `design/source/docs-kit/lib/parity.mjs` |
| Docs site: deploy | `docs site: deploy` | The workflow builds, runs `wrangler deploy`, then smoke-tests the live site | `workflow-templates/docs.yml` |
| Docs site: daily check | `docs site: daily check` | One workflow has both a schedule and `docs-kit/check-live.mjs` | `workflow-templates/docs-live.yml` |
| Docs site: homepage | `docs site: homepage` | The GitHub repository `homepage` is its `https://*.monte3l.com` URL | `gh repo edit --homepage` |
| Repository description | `repository description` | Only for a repository in `projects.json`: the GitHub description is that file's `description`, word for word | `gh repo edit --description` |
| Repository topics | `repository topics` | Only for a repository in `projects.json`: the GitHub topics are that file's `topics`, in any order | `gh repo edit --add-topic` |
| Janitor: branch policy | `env-janitor: branch policy` | Only for a repository with `.github/environments.json`: the `env-janitor` environment deploys from `main` only. `--apply` adds `main` and never removes another policy | [Environment cleanup](#environment-cleanup) |
| Janitor: environment secrets | `env-janitor: environment secrets` | The `env-janitor` environment holds `JANITOR_APP_CLIENT_ID` and `JANITOR_APP_PRIVATE_KEY` (`blueprint/env-secrets.json`). The script prints the `bin/env-secrets.sh set` command for each missing one and never sets one | [Environment cleanup](#environment-cleanup) |
| Janitor: org secrets | `env-janitor: org secrets` | No organization secret of those names is shared with the repository or has a visibility other than `selected`, because an org secret reaches every workflow on every branch. `--apply` removes the repository from the list, and only once the environment holds both | [Environment cleanup](#environment-cleanup) |
| Janitor: secret references | `env-janitor: secret references` | Only `environments.yml` names the two secrets | `workflow-templates/environments.yml` |
| Docs deploy: branch policy | `docs-cloudflare: branch policy` | Only for a repository with a `docs-cloudflare` environment: it deploys from `main` only. `--apply` adds `main` and never removes another policy. The environment secrets are not reported as in order while it does not | [docs-site.md](docs-site.md) |
| Docs deploy: environment secrets | `docs-cloudflare: environment secrets` | Only for a repository with a `docs-cloudflare` environment: it holds `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. The script prints the `bin/env-secrets.sh set` command for each missing one and never sets one | [docs-site.md](docs-site.md) |
| Docs deploy: org secrets | `docs-cloudflare: org secrets` | No organization secret of those names is shared with the repository or has a visibility other than `selected`. `--apply` removes the repository from the list, and only once the environment holds both | [docs-site.md](docs-site.md) |
| Docs deploy: secret references | `docs-cloudflare: secret references` | Only `docs.yml` names the two Cloudflare secrets | `workflow-templates/docs.yml` |
| Janitor: planner pin | `env-janitor: planner pin` | `environments.yml` pins an `m3l-groundwork` commit that is on `main` and contains the newest change to the planner's files. Trailing `main` is fine. `m3l-groundwork` itself is skipped | `workflow-templates/environments.yml` |
| Janitor: last run | `env-janitor: last run` | The last `environments.yml` run succeeded. A red run can also be real policy drift: read its job summary | Dispatch with `dry_run` on |

The workflow items (workflow lint, REUSE check, ScanCode check, Scorecard) look for the
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
- **Tool pins:** a CI tool lives in its own folder, `tools/<name>/` (`tools/ci`,
  `tools/deploy`, `tools/dev`), with a lockfile, and installs with
  `npm ci --ignore-scripts`. Never put it under the repository-root `.github/`:
  Dependabot's update job ends at `create_pull_request` with a 400 "invalid or
  unauthorized changes" there, so no bump PR is ever opened. A nested `.github`
  path works, but only the root one is affected. The cause is not confirmed by
  GitHub: see dependabot-core
  [#15237](https://github.com/dependabot/dependabot-core/issues/15237) and
  [#15721](https://github.com/dependabot/dependabot-core/issues/15721), both
  open. `bin/apply-repo-baseline.sh` reports an entry under `/.github` as
  `Dependabot` drift. If the tool needs its install scripts to run
  (a tool that downloads its own binary does), say so in `SECURITY.md` as an
  accepted risk. Node is pinned in `.node-version`, and no workflow writes a
  version number after `node-version:`: use `node-version-file: .node-version`.
  A lane that tracks the newest release on purpose may say `node-version: current`.
  The script checks this one.
- **Secrets:** scope a secret to an environment where possible, give it an
  expiry of one year at most (rotate yearly if it cannot expire), and list it
  in the repository's `SECURITY.md`. The org `SECURITY.md` shows the table.
- **Publishing, for a repository that ships to a registry:** OIDC trusted
  publishing with no stored token, provenance, a build attestation, a
  CycloneDX SBOM, and an environment with two required reviewers gating the
  publish job. This is the repository's own job between the shared
  `prepare` and `finalize` (see [Releases](#releases)).
  `m3l-groundwork`'s `release.yml` and `docs/github-blueprint.md` are the
  reference implementation.

> [!NOTE]
> The `main` ruleset now asks for one code-owner approval, an approval of the
> last push, and a branch up to date with `main` before merging. With two
> owners, every pull request needs the other one.
> Applying it changes the repository the moment `--apply` runs.

## Why ScanCode and not the other scanners

REUSE records what a file declares. It cannot tell that a file says something
else. ScanCode reads the license text inside each file, so it fills that gap.
The other tools in the same space overlap checks the repositories already run.

| Tool | Overlaps with | Decision |
| ---- | ------------- | -------- |
| license-eye `header` | `reuse lint`. It cannot annotate files without comment syntax (the `.woff2` fonts) and its docs do not cover `REUSE.toml` | Not used |
| license-eye `dependency` | `dependency-review.yml`, which already enforces an `allow-licenses` list on every pull request. Every repository has no runtime dependencies | Not used |
| ORT | `dependency-review.yml` for licenses, Dependabot and OSV for advisories. It needs about 5 GiB of heap, and its action pulls rules from `ort-config` on `main` | Not used |
| ScanCode | Nothing: no other check reads license text inside files | `workflow-templates/scancode.yml` |

The action is in beta (`v0.1`), so `ScanCode` is not in the `main` ruleset's
required checks. It pins its ScanCode.io image by digest. Add `ScanCode` to the
ruleset only after a release marks it stable and a few weeks of runs show no
false positives.

The policy is an allowlist: `compliance-fail-level: MISSING` fails on a license
the repository's `policies.yml` does not list. Add a license there only after
checking that the project can accept its terms, as for `dependency-review.yml`.

## Scorecard findings

`scorecard.yml` publishes its findings as Code Scanning alerts. The script
lists every open one as `DRIFT`, so an alert is either fixed or dismissed with
a reason, never left open.

| Check | Resolution |
| ----- | ---------- |
| Security-Policy | Fix it: the repository's own `SECURITY.md` with an absolute advisory URL |
| CII-Best-Practices | Fix it, for a code repository: register at bestpractices.dev, reach the `minimum` in `openssf.json` (Silver and Baseline 3), add the badge to the README title block, keep the answers in `.bestpractices.json`. `REUSE.toml`'s `**` catch-all already covers that file, so it needs no entry of its own. A repository that publishes no releases or packages (`.github`) dismisses it as not applicable and is listed under `exempt` in `openssf.json`. Reference: `m3l-groundwork` |
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

A **new public repository gets several alerts on its first run**: Maintained and
Fuzzing, for example, cannot pass for a repository with no history, and
BranchProtection can show up from the scan that ran before the ruleset was
applied. That is expected, not a defect of `bin/new-repo.sh`. The `SECURITY.md`
starter already has the section to list them in.

## Audit scope

Three rules keep the dependency checks readable. The script checks only the
third one (`Dependabot: lockfile folders`); the first two are conventions.

| Rule | Why |
| ---- | --- |
| A release audits production dependencies only. The audit of every dependency, development ones included, runs on a schedule and opens an issue labelled `freshness` | A release blocked by an advisory in a development-only dependency stopped a release once, and the advisory was later withdrawn. A scheduled audit still finds the finding without holding a release for it |
| Each pnpm `overrides` entry (in `pnpm-workspace.yaml` or `package.json`) carries a comment with its reason and the advisory or issue id it works around | An override has no expiry: without the reason nobody can tell when it is safe to drop. Dependabot's documentation says nothing about `overrides`, so this is a convention, not a documented rule |
| A lockfile folder without an `npm` entry in `dependabot.yml` is listed in `dependabot-exemptions.json` with the reason | Security updates still cover the lockfile, but version updates need an entry |

## Claude Code plugins

Every plugin the organization publishes is listed in one marketplace,
[`monte3l/m3l-plugins`](https://github.com/monte3l/m3l-plugins). Its name is
`monte3l`, so a plugin installs as `<plugin>@monte3l`. A plugin repository does
not run a marketplace of its own: Claude Code allows one marketplace per name,
and a second one splits each plugin's install id.

| Rule | Why |
| ---- | --- |
| The plugin repository ships no `marketplace.json` | One marketplace, one install id per plugin |
| `version` lives only in `.claude-plugin/plugin.json`, and is bumped on every release | Claude Code treats a set `version` as the update signal, so an unbumped version means users never update. The catalog entry carries none, so the two cannot disagree |
| A release is a tag `<name>--vX.Y.Z`, the form `claude plugin tag` uses, created by the shared release workflow | The tags ruleset and immutable releases stop the tag from moving, and the catalog pins it. `m3l-groundwork` is the exception: its plugin version mirrors the CLI, so its tag is `@monte3l/groundwork@X.Y.Z` |
| The README's Quickstart, Settings and Manage sections give every command as both `claude plugin …` and `/plugin …` | Users install from a shell script or from a session, and should not have to translate. A plugin with `userConfig` options lists them in Settings with the ways to set them, and never shows a secret passed on the command line |
| `claude plugin validate --strict .` runs in the repository's `verify` | A manifest error should fail before a release, not after |
| `tools/ci/check-plugin-metadata.mjs` (the starter `files/check-plugin-metadata.mjs`, never in the plugin root's `bin/`) runs in the repository's `verify`, with `GH_TOKEN: ${{ github.token }}`: `description` equals the GitHub description, and `keywords`, if set, equal the GitHub topics | A plugin's top-level `bin/` is not a place for CI tools. The plugins reference says of it: "Files here are on the Bash tool's PATH while the plugin is enabled, so Claude runs them as bare commands. claude.ai and Cowork don't install a plugin that has this directory". A CI script there would be on every user's PATH, and a plugin with the directory does not install on claude.ai. The baseline item looks for the file name in a workflow, so any folder outside `bin/` satisfies it. Claude Code's plugin reference makes `description`, `keywords` and `author` optional and ties none of them to GitHub, so `validate` cannot catch a manifest that drifted from the repository, the org site and the catalog entry. Four such fixes landed after the merge. The check compares with the live repository: change the GitHub setting first (`gh repo edit`), then the manifest, then re-run the check. The baseline already holds the GitHub side to `projects.json` |
| `author` is `{ "name": "Enrico Lionello" }`, and `keywords` is set | Guidance, not checked. `author.name` is the only required part of `author`; the other plugins carry just the name, and one adds an email. `keywords` is discovery tags, and a set that equals the topics gives search the same words everywhere |
| No `CLAUDE.md` at the plugin root; keep it in `.claude/` | `validate --strict` warns about a root `CLAUDE.md`, and Claude Code does not load it from a plugin |
| Listing is a pull request to `m3l-plugins` that adds an entry pinned to the tag and its full commit SHA, with a `homepage` on `monte3l.com` and a `description` identical to `plugin.json` | `bin/check-catalog.mjs` fails the pull request otherwise |
| An entry's `source` is `url` or `git-subdir` with a full `https://github.com/` URL | The `github` source type and `owner/repo` shorthand clone over SSH, which fails for anyone without a GitHub key |

> [!IMPORTANT]
> A release does not reach users when the tag is pushed. It reaches them when
> the pin in `m3l-plugins` moves, which is a pull request there. Its daily
> `pins` workflow opens an issue when a pin is stale, and
> `node bin/bump-pins.mjs --apply` rewrites it.

The managed settings below allow `monte3l/m3l-plugins` and register it as
`monte3l`. A plugin listed anywhere else is blocked on a managed machine.

## Claude Code guards

`m3l-groundwork` is the source of truth for the hooks that keep a Claude Code
session inside the org's rules. Copy them, never link them, and keep each copy
identical apart from its header, as `repair-core-bare.mjs` does.

| Hook | Blocks | Needs |
| ---- | ------ | ----- |
| `guard-secret-writes.mjs` | A write (`Write`, `Edit`, `NotebookEdit`) that puts a real secret on disk | Node only; the starter `files/guard-secret-writes.mjs`, see [Other guards](#other-guards) |
| `guard-double-background.mjs` | A Bash call that backgrounds a command twice (`run_in_background` plus `&` or `nohup`) | Node only; the starter `files/guard-double-background.mjs` |
| `guard-shell-portability.mjs` | A Bash call that is certain to fail in zsh or on macOS (see [Shell portability guard](#shell-portability-guard)) | Node only; the starter `files/guard-shell-portability.mjs` |
| `guard-git-push-signed.mjs` | A `git push` with an unsigned outgoing commit, where signing is on | `bin/lib/signed-range.mjs` or `.claude/hooks/lib/signed-range.mjs`, the starter `files/signed-range.mjs`; the starter `files/guard-git-push-signed.mjs` |
| `require-signoff.sh` | A `git commit` without `-s` | `jq` or `perl`; the starter `files/require-signoff.sh`, see [Sign-off guard](#sign-off-guard) |
| `guard-shared-checkout.mjs` | An edit, a `git commit` or a new branch in a repository's main checkout | Node only; the starter `files/guard-shared-checkout.mjs`, see [Worktree guard](#worktree-guard) |

Every `main` ruleset requires signed commits and the org asks for a DCO
sign-off, so the hooks catch a rejected push before it happens. The script does
not check for them: whether a repository runs Claude Code is its own decision.

A hook that can block sets `"onFailure": "block"` next to its `timeout`. Claude
Code treats a hook that cannot start, times out or exits with any code but 0 or
2 as a non-blocking error and lets the call through, so without it a crashed
guard allows everything. A hook that only asks may leave it out. A hook that
can answer `deny` (`guard-public-issues.mjs` exits 2 on a per-repository drift
line) counts as one that can block, though it also asks.
`tests/harness-settings.test.mjs` fails for a hook in this repository's
`settings.json` that does neither, and lists the two that only ask.

### Sign-off guard

`require-signoff.sh` blocks `git commit` without `-s` (also behind `git -C`,
`git -c` and `env`) and fails closed without `jq`. The sign-off is a deliberate
act, so the hook blocks the commit and never adds the trailer for you. The DCO
check stays the real gate: a local hook can be skipped.

The file is a starter: a new repository gets it from `bootstrap.json`, and the
template sync refreshes a copy that is an older version of it (`sync.json`).
Wire it in the existing `Bash` matcher of `.claude/settings.json`, run through
`bash` so the entry does not depend on the file being executable, which neither
the bootstrap nor the sync sets:

```json
{
  "type": "command",
  "command": "bash \"$CLAUDE_PROJECT_DIR/.claude/hooks/require-signoff.sh\"",
  "timeout": 30,
  "onFailure": "block"
}
```

`tests/harness-starter.test.mjs` keeps the starter identical to this
repository's own hook, and `tests/harness-signoff.test.mjs` runs it.

### Other guards

`guard-secret-writes.mjs`, `guard-double-background.mjs`,
`guard-shell-portability.mjs` and `guard-git-push-signed.mjs` are starters too,
with `signed-range.mjs` (the helper of the push guard). A new repository gets it
in `bin/lib/`; the sync also finds and refreshes a copy at `.claude/hooks/lib/`, where
a repository whose root is a plugin has no `bin/`. The copy in this repository is the one that runs and the one
`tests/harness-starter.test.mjs` compares with the starter. Wire each in
`.claude/settings.json`: the secret guard inside a `Write|Edit|NotebookEdit`
matcher (a notebook edit names its file `notebook_path` and carries
`new_source`, which the guard reads like `file_path` and `content`), the other
three inside `Bash`.

```json
{
  "type": "command",
  "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/guard-secret-writes.mjs\"",
  "timeout": 30,
  "onFailure": "block"
}
```

Use the same entry with `guard-double-background.mjs`,
`guard-shell-portability.mjs` or `guard-git-push-signed.mjs` for the three
`Bash` hooks.

A guard that can block fails closed: a payload it cannot read as JSON, or one
that is not an object (`null`, a number, a string, `true` or an array such as `[]`),
exits 2 with `could not read the hook payload`.
`onFailure: "block"` covers a crash but not a deliberate `exit 0`, and `0` means
allow. The push guard keeps one documented exception: when it cannot work out
the outgoing range it lets the push go, because the `main` ruleset requires
signed commits anyway. `tests/harness-guards-fail-closed.test.mjs` runs all
four.

Failing closed has a cost: three of the guards run on every `Bash` call and the
fourth on every file write, so if Claude Code stopped sending a JSON object on
stdin, all of those calls would be refused, and the secret guard would also
refuse the edit that repairs a hook. Only an unreadable payload blocks. An
object whose fields changed is judged by the fields it has, as before, so a
renamed field does not lock a session. To get out, remove the entry from
`.claude/settings.json` with an editor in a terminal, outside Claude Code.
After a Claude Code upgrade, try one repository before the sync pull requests
for the others are merged: the sync opens one per repository, and a repository
whose copy is custom is never touched.

These guards are local, best-effort checks on the command or the text Claude
Code is about to run, not a security boundary. They read the command line, so a
command built at run time (a variable, a sourced script) or a secret split over
several lines can get past them; the signed-commits ruleset, Gitleaks and the DCO
check are what hold. A change to what a guard detects goes through the starter,
so every copy gets it.

What the guards read, so a change to them can be judged:

- **Push guard.** It reads a command line the way a shell does: a push inside
  `&&`, `|`, a subshell, `$(...)` or `bash -c` counts, `git -C DIR` and a literal
  `cd DIR` before it name the repository, and the refs a refspec names
  (`HEAD:refs/heads/x`, `+branch`, `--all`) are what it vets, not only `HEAD`. A
  push option whose value looks like a flag (`-o -n`) is not a dry run. A long
  option is read by its unique prefix as git does (`--mir`, `--dry`), and one the
  guard does not know vets every branch. A plain tag ref sent to a tag
  (`refs/tags/v1`, `refs/tags/v1:refs/tags/x`), and a deletion, are not vetted;
  any other destination, a branch or a bare name such as `main` that git matches
  against the remote's refs, and any source that is a revision (`refs/tags/v1~1`),
  is vetted as its commit. A command word that is an expansion (`$G push`,
  `sudo $G push`, `env X=1 $G push`, a backtick) is read as a possible git; an
  expansion that is only an argument is not. Git runs only in the repository the
  hook runs in, its worktrees and `CLAUDE_PROJECT_DIR`, and with `gpg.program`,
  `core.fsmonitor` and the other program settings of the repository overridden,
  because a repository's own config can name programs git then runs. A push from
  another real directory goes unvetted here, like a range the guard cannot work
  out; the signed-commits ruleset holds. A directory that cannot be placed is not
  "somewhere else": a `-C` or `cd` operand built at run time (`"$W"`, `$(...)`, a
  backtick, `~`) or one that is no directory makes the guard vet the hook's own
  repository for it. Two coarse rules fail towards vetting where a push cannot be
  read, each counting as a push of every branch, so the guard blocks only if some
  branch holds an unsigned commit that is not yet pushed: a line with a shell
  (`sh`, `bash`, `zsh`, `dash`, `ksh`) or `xargs` in it that also has the words
  `git` and `push` anywhere (`echo 'git push' | sh`, `xargs -I{} sh -c {}`), and a
  redirection or `{fd}` word where git's subcommand or a push's operand belongs
  (`git 2>/dev/null push`, `git push >/dev/null 2>&1`). They keep no state per
  pipeline and read no operand, on purpose: every attempt to follow where a
  script comes from found another shape. `echo foo | sh -c 'ls'`,
  `cat x | xargs ls` have no `git` and `push` together, and `git status 2>&1`
  has its redirection after the subcommand, not in its place, so they pass. Not
  covered: a command built so that no text of it says git (a
  sourced script, a variable holding a whole command, `eval "$X"`), a shell fed a
  script that does not spell out `git push`, an expansion used as the subcommand
  (`git $S origin`), and an expansion after `sudo -u USER`, whose user name is
  read as the command. The guard is best-effort: the signed-commits ruleset on the
  remote is what holds.
- **Secret guard.** The keys it reads are `NPM_TOKEN`, `GITHUB_TOKEN`, `GH_TOKEN`, the three
  `AWS_*` ones and `API_KEY`. A name that only contains one (`MY_API_KEY`) is not matched: a
  project that needs one adds it to `SECRET_KEYS`, which makes its copy custom, so
  `template-sync` stops refreshing it. A key may be quoted (`"NPM_TOKEN": "..."`) and in
  any case; a key in backticks is prose about it. The value is the quoted string, or the run
  up to a space, comma or bracket. It is a placeholder only when it is only dots, starts with a reference (`${X}`, `$X`,
  `process.env.X`, `os.environ[...]`, `ENV[...]`, `getenv(...)`, `secrets.X`) or
  has a marker word set off by a delimiter (`your_token`, `example-key`); a
  marker inside a longer run (`s3cr3tfake...`) does not make a real value one.
  A lookup is a placeholder only for itself: a literal default after it
  (`os.environ.get("X", "<token>")`, `getenv("X") || "<token>"`,
  `process.env.X ?? '<token>'`, `${X:-<token>}`) is read as a value too, and a
  value that only starts like a lookup (`ENV-<token>`, `getenv-<token>`,
  `env.<token>`) is a value, not a lookup, and so is a closed reference with more
  value stuck to it (`${X}"<token>"`). A literal after a default operator
  (`|| "<token>"`, `?? '<token>'`, `or "<token>"`) is read after a reference or a
  plain value. A JavaScript template literal's interpolation of names and numbers
  (`${randomToken()}`, `${makeToken(32)}`, `${tokens.make(len, kind)}`,
  `${process.env.NPM_TOKEN}`) is a reference too, so test code that builds a token at run
  time is not refused. The body must match a strict grammar: a path of names, called
  or not with names and numbers, where a name has at most 32 characters (letters, digits
  and underscores, not starting with a digit) and a number at most 4 digits. A string, a
  template, an operator, a `$`, a nested call, a longer name or a longer number
  (`${X || "<token>"}`, `${fn("<token>")}`, `${a.b.<token>}`, `${make(12345678901234567890)}`)
  is outside it and is read as a value. Inside it, every name must also be a name: not
  spelled like a token (`${ghp_...}`) and not a run of 16 or more letters and digits that
  looks like a secret, and a short name with a digit and capitals (`accessToken2`) is a
  name. `$NAME` and a bare `${NAME}` are a reference only when NAME is
  a name: at most 40 characters, not beginning like a token (`ghp_`, `sk_`, `AKIA`, ...,
  unless it is a short snake_case name of letters such as `npm_config_cache`), and an
  environment variable's name (`GITHUB_TOKEN`, `npm_config_x`) or letters and underscores
  (`githubTokenForTests`). Anything else after a dollar sign (`$ghp_<token>`, a long
  random run) is a value.
  Whatever the first value is, a
  placeholder (`changeme`, `<token>`, an empty string) or a reference included,
  nothing after it is trusted by its shape: the whole rest of the line is split at
  quotes, operators and delimiters, and a run of 16 or more characters with a
  token prefix (`ghp_`, `sk-`, `AKIA`, `key-` with a digit in the part right after
  the hyphen, ...), or with letters and digits, that is not a placeholder, a path,
  a URL, a `NAME_LIKE_THIS` or a hyphenated name of lowercase words
  (`m3l-output-governor`) is a secret. A repository or package name is not one:
  every part of it starts with a letter and is a plain word or a short part of at
  most four characters that has a digit (`m3l`, `v2`, `s3`), at most two of those,
  and one is a plain word of three letters or more (a part of eight or more
  letters that are all hex digits, such as `deadbeef`, is not a word). So
  `key-value-store-v2` and `key-manager-v2-prod` are names. A token has a long
  part that mixes letters and digits (`key-a1b2c3d4...`), or groups of short ones
  (`ab12-cd34-ef56`), or a part that starts with a digit, as a UUID does.
  So a list element, a concatenation, a second argument or a JSON sibling after a
  value is read, and a line that holds a placeholder or a reference and a
  secret-looking run is refused. Not covered: a secret split across parts (`"ab" +
  "cd"`) or under 16 characters; one with no digit and no token prefix (letters
  only); a lowercase snake_case run, which is read as a name; a lowercase
  hyphenated run of plain words, or one with a short part that has a digit, which
  is read as a name; a token whose shape is only a prefix this list does not know;
  a name inside an interpolation that is a random run of fewer than 16 characters, or of
  letters only (a longer body is outside the grammar and read as a value); a short body
  outside the grammar, which a value of fewer than 16 characters passes whatever it is
  (a bare `${accessToken2}` is allowed only because the value is shorter than 16
  characters, not as a reference);
  and a secret written as a path or after a domain-like prefix. The other way, a real name with three or more short
  parts that carry a digit and 16 or more characters (`aws-s3-bucket-name-v2-eu1`),
  a part that starts with a digit (`key-rotation-job-2024`), and a long camelCase name
  that has a digit inside an interpolation (`${ctx.runner.accessToken2Value}`) are
  still blocked, by design: each is the shape of a token, and the edit that needs it
  names it another way.
  `ghp_`, `gho_`, `ghu_`, `ghs_` and `ghr_` tokens are blocked on their own.
  `tests/harness-guards-hardening.test.mjs` runs it over every tracked file of
  this repository and expects no hit, so the guard never refuses the edit that
  repairs a file the repository already holds.
- **Push guard and its helper are one unit.** `guard-git-push-signed.mjs` loads
  `signed-range.mjs` from `bin/lib/` or, where the root is a plugin and keeps no
  `bin/`, from `.claude/hooks/lib/` (the first copy that serves it wins). The sync reads
  only the first copy it finds, so keep one copy, not two. The template sync refreshes
  each file on its own. A guard beside a helper that is missing or older does not crash (under
  `onFailure: "block"` that would refuse every `Bash` call): it blocks a command
  that looks like a push, saying to refresh both files, and lets any other command
  through. They are refreshed together: `guard-git-push-signed.mjs` lists
  `signed-range.mjs` under `requires` in `sync.json`, so the sync never refreshes
  the guard in a repository whose helper is custom or missing (a finding says so),
  and refreshes both when both are stale. A repository that keeps its own helper
  refreshes the pair by hand, or lists the guard under `skip`.

### Shell portability guard

`guard-shell-portability.mjs` blocks a Bash call that is certain to fail in the
shell Claude Code runs it in. A scan of 12,600 distinct Bash commands from past
sessions in the org's repositories found about 950 failed calls in 28 days, and
most were the same few mistakes written for bash or GNU tools. Each cost a turn.

The guard blocks only where the failure is certain, never where it is merely
possible, because a guard that blocks a command that works is worse than the
mistake it prevents. It reads the shell from `$SHELL` and the system from
`process.platform`, so a Linux or bash user never sees it fire.

| Where | What it blocks | Why it always fails |
| ----- | -------------- | ------------------- |
| zsh | An unquoted `*` or `?` in a `--flag=value` word, such as `--include=*.ts` or `--format=%G?` | No file is named like that, so zsh stops with `no matches found` and runs nothing |
| zsh | An unquoted `?name=` in a word, such as `gh api repos/x/y?ref=z` | The same `no matches found` |
| zsh | A plain path glob that matches nothing in the working directory, such as `docs/*.md` | zsh stops before the command starts. Checked only in the first command of a line with no `cd`, `pushd`, `setopt`, `source` or `noglob`, because a later command may have created the files |
| zsh | A variable set to a quoted string with spaces, then used unquoted as a command, after `for x in`, or after `set --` | zsh does not split it: the command is not found, the loop runs once, or `$2` is empty |
| macOS | `sed -i SCRIPT` without a suffix argument | BSD `sed` reads the script as the backup suffix |
| macOS | `cat -A`, `head -n 0`, `head -n -N` | BSD `cat` has no `-A`, and BSD `head` rejects a count of 0 or less |

One rule is left out on purpose: an unquoted word that starts with `=`
(`echo =====`). It failed in every session until 19 November 2026 and ran fine
after, so it depends on a zsh option the guard cannot see.

Replayed over the same commands, the guard flagged 362. Of those, 334 failed
with the matching shell error. The other 28 misbehaved without one: a `set --
$pr` loop leaves `$2` empty, and a `for r in $repos` loop runs once. A command
the parser cannot read is allowed. The entry is the one shown under
[Other guards](#other-guards), and `tests/harness-guard-shell-portability.test.mjs`
holds a case for each rule and for what must pass.

### Worktree guard

Implementation happens in a linked worktree off `origin/main`, never in a
shared checkout. `guard-shared-checkout.mjs` turns that rule into a hook: it
blocks an edit, a `git commit`, `git switch -c` and `git checkout -b` in a main
checkout, and allows `git pull` and `git worktree add`. It is stricter than
`guard-branch-isolation.mjs`, which only blocks `src/` and `tests/` writes while
a checkout is on `main`, so a repository keeps both. It reads the directory from
the hook input's `cwd`, because `CLAUDE_PROJECT_DIR` stays at the folder the
session started in even after it enters a worktree. A `git -C "$W"` or `cd "$W"`
is judged in the directory `W` names when the same command line set it to a
literal value once, outright, and the name appears nowhere else on the line except
as the operand of that `git -C` or `cd` (`W=../wt; git -C "$W" commit`). Outright
means not after `&&` or `||` anywhere before it (a newline after one continues it)
and not inside `if`, `case`, a loop or a brace group: one doubtful word (`read`,
`eval`, `source`, `if`, `then`, `done`, `{`, `!`, another `=`) drops every variable
of the line. A variable it cannot resolve is judged from `cwd`, and a `cd`
followed by `;` still counts both places, because the `cd` may have failed. A
command or subcommand that is a substitution (`git $(echo commit)`,
``git `echo commit` ``, `$(echo git) commit`) cannot be read and is judged as
writing, and so is a command word that is an expansion (`$G commit`), after a
prefix (`sudo`, `env X=1`, `time`, `xargs`, `if ...; then`) too. An expansion that
is only an argument (`cp $A $B`) is not. Not read: an expansion after
`sudo -u USER`, whose user name is taken for the command. It also covers `NotebookEdit` (the file is the
notebook's `notebook_path`). It fails open on a payload it cannot read, because
failing closed would refuse every `Bash` call if Claude Code changed its input;
`onFailure: "block"` covers a crash or a timeout.

The file is a starter: a new repository gets it from `bootstrap.json`, and the
template sync refreshes a copy that is an older version of it (`sync.json`,
`starters`). Copying the file does nothing until `.claude/settings.json` runs
it. Add the two entries, the `Bash` one inside the existing `Bash` matcher and
the other inside `Write|Edit|NotebookEdit`:

```json
{
  "type": "command",
  "if": "Bash(git *)",
  "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/guard-shared-checkout.mjs\"",
  "timeout": 30,
  "onFailure": "block"
}
```

```json
{
  "type": "command",
  "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/guard-shared-checkout.mjs\"",
  "timeout": 30,
  "onFailure": "block"
}
```

`tests/harness-starter.test.mjs` keeps the starter identical to this
repository's own hook, which is the one that runs here.

## Working conventions

Rules that no linter in the standard enforces, written down because the same
fix kept landing by hand in several repositories. A test or a baseline item
backs each one where the rule can be checked.

### Shell scripts

A script that runs under `set -e` and `trap 'exit 3' ERR` must not read a
list from process substitution when a failed call would then read as "nothing
to do". In `while read ... done < <(gh ...)` the status of the substitution is
lost, so a failed `gh` call ends the loop with no items and the script reports
a clean run. Read the list into a variable first, which does reach the trap:

```bash
repos="$(gh repo list "$OWNER" --json name --jq '.[].name')"
while IFS= read -r name; do ...; done <<<"$repos"
```

Where the empty list is the right answer when the call fails, say so with
`|| true` inside the substitution and a comment. ShellCheck knows the sibling
problem as SC2155 (`local x=$(cmd)` hides the status of `cmd`), which it
reports by default. Its optional check for masked returns (SC2312) is not
enabled: it reports 60 places in these scripts and their tests, nearly all
fine, which would bury the real ones. `tests/shell-process-substitution.test.mjs` is a ratchet
instead: it counts the unguarded `< <(` sites per script and fails when a
script gains one. Convert a site to the variable form and lower its number in
the test.

### Bash commands that Claude Code runs

On macOS the shell is usually zsh, and zsh does not split an unquoted
`$variable` into words the way bash does (zsh FAQ, 3.1). `for x in $list` runs
once with the whole string, and `gh pr view $number` gets an empty argument when
the variable is unset. Use an array (`"${items[@]}"`), `${=var}` for one
deliberate split, or write each argument out. This showed up in at least eight
commands across five repositories before it was written down.

Past sessions in the seven repositories logged about 950 failed Bash results
between 26 October and 23 November 2026. These mistakes recurred the most, so
write the right form the first time:

| Mistake | What happens | Write instead |
| ------- | ------------ | ------------- |
| Unquoted glob: `--include=*.ts`, `ls dir/FILE*`, `--format=%G?` | zsh stops with `no matches found` before the command starts | Quote it: `--include='*.ts'` |
| `?` in a URL: `gh api repos/x/y?ref=z` | The same `no matches found` | Quote the whole URL |
| `C="node cli.js"; $C pack` | zsh looks for a program named `node cli.js` | An array, `${=C}` or a function |
| `echo == text` | In default zsh, `==` is read as a command lookup and stops with `= not found`. It ran fine after 19 November 2026, so it depends on a zsh option | Quote it: `echo '== text'` |
| `sed -i 's/a/b/' file` | BSD `sed` reads `s/a/b/` as the backup suffix | Use the `Edit` tool, or `sed -i ''` |
| `cat -A`, `head -c 0`, `head -n -3` | BSD tools lack these | `od -c`, or `awk` |
| `pnpm -s`, `pnpm -s knip` | pnpm 12 rejects `-s` | `pnpm --silent` or `pnpm run` |
| `sleep 90; gh pr checks N` | Claude Code blocks a foreground `sleep` | `gh pr checks N --watch`, or `Monitor` with an until-loop |

A session in a worktree also refuses a command it cannot prove stays inside the
worktree. A `for` loop, a `cd DIR;` before `git`, a heredoc next to `git`, or a
scratch path that contains `.github` all trip it, and about 190 refusals in
`.github` and `m3l-groundwork` came from that. Keep each call short and
single-purpose, and pass the repository with `git -C` or `gh --repo` instead of
`cd`.

### Working with Claude Code

Two habits the maintainers stated again and again, in at least four
repositories, and that were only in memory files. They are org policy, not
Anthropic guidance, and no check enforces them.

- **Create and edit skills through `/skill-creator`.** Do not hand-write a
  `SKILL.md`: the skill-creator plugin interviews, drafts and tests it. Its use
  is optional in Anthropic's documentation; here it is the rule.
- **Verify a fact against the official source before acting on it.** For
  Claude Code, the Claude API, GitHub, a tool or a standard, read the vendor's
  current page and cite it in the pull request, or say that none exists. Do not
  rely on recalled behaviour, and say "unverified" where a page did not load.

### Files that a tool writes

A file written by the template sync, the design re-sync, release-please or
pnpm is not formatted by the repository's formatter, so a formatter that
checks it fails every pull request that tool opens. List such files where the
formatter looks, once per repository:

| Formatter | How | Official page |
| --------- | --- | ------------- |
| Prettier | `.prettierignore` (gitignore syntax) for `design/` and the synced starters. An `overrides` entry with `files` and `"options": { "parser": "json-stringify" }` for the JSON that release-please rewrites, such as `.claude-plugin/plugin.json` and `.release-please-manifest.json`. The parser's whitespace resembles `JSON.stringify()`, which is what release-please writes; that match is observed in two repositories, not documented | prettier.io/docs/ignore, prettier.io/docs/configuration, prettier.io/docs/options |
| Biome | A negated pattern in `files.includes` (`!design/**`). `!!` also leaves the path out of project analysis | biomejs.dev/guides/configure-biome |
| ESLint | `globalIgnores([".claude/hooks/guard-*.mjs", "bin/lib/signed-range.mjs"])` (or `".claude/hooks/lib/signed-range.mjs"` where the helper lives there) in `eslint.config.js`, the helper from `eslint/config` that the ESLint page names for ignoring files and directories. Patterns are relative to the config file | eslint.org/docs/latest/use/configure/ignore |
| editorconfig-checker | `Exclude` in `.editorconfig-checker.json`, a regular expression per entry | github.com/editorconfig-checker/editorconfig-checker |

The files to list are the vendored `design/` copy, the JSON and YAML a release or
`pnpm` rewrites, and every starter the sync refreshes, at the paths `sync.json`
gives:

| Starter | Path |
| --- | --- |
| The worktree guard, the secret guard, the double-background guard, the shell portability guard, the push guard | `.claude/hooks/guard-shared-checkout.mjs`, `.claude/hooks/guard-secret-writes.mjs`, `.claude/hooks/guard-double-background.mjs`, `.claude/hooks/guard-shell-portability.mjs`, `.claude/hooks/guard-git-push-signed.mjs` |
| The push guard's helper | `bin/lib/signed-range.mjs`, or `.claude/hooks/lib/signed-range.mjs` where the root is a plugin and keeps no `bin/` |
| The sign-off guard | `.claude/hooks/require-signoff.sh` |
| The config files | `.gitattributes`, `.editorconfig`, `.gitleaks.toml`, `CODEOWNERS` (`.github/`, the root or `docs/`) |

A repository without a formatter has nothing to do. Two reasons to list them:

- **Formatting a verbatim copy turns it into a custom copy.** The sync then never
  reports or refreshes it again, and the repository keeps an old guard without
  anyone noticing.
- **A refresh the formatter rejects fails the repository's `Format check`.** The
  starters are written to the org's style, which a repository's Prettier or
  Biome configuration may disagree with, and a refresh pull request cannot pass
  its own required check. The first guard refresh failed this way in
  `m3l-claude-mentor`, and a dry run showed `m3l-groundwork` would.

**A repository's own tests of a starter follow the starter's version.** A test
that pins what a guard did last month fails when the sync refreshes it, which is
what a refresh pull request is for. The change from fail-open to fail-closed
guards broke three tests in `m3l-claude-mentor` and a fake `git` in
`m3l-plugins`, each pinning the old behaviour. When a refresh fails a test, change
the test to the new behaviour, and never the starter: an edited copy is custom.
The starters' own tests are in this repository (`tests/harness-*.test.mjs`) and
cover the contract, so a repository that only wants the guard to run needs none
of its own.

### Lines two pull requests both edit

A list that every change touches is a merge conflict waiting to happen: the one line that names every script in `verify.yml` was edited by most pull requests that added a script (`.github` had six reported conflicts, most there). Two rules remove the common cases.

- **Check scripts by glob, not by name.** `bash -n` reads one script and takes the rest as arguments, so a list on one line checked only the first. Loop over `bin/**/*.sh` with `shopt -s globstar nullglob` and pass the same array to `shellcheck`. Fail when a glob matches nothing, so a moved folder cannot turn the check into a pass. `.github/workflows/verify.yml` is the example.
- **A file that only grows at its end can merge by union.** In `.gitattributes`, `docs/log.md merge=union` keeps both sides' added lines instead of conflicting. Git does not order them, so use it only where a check or a reader copes with that (`knowledge/log.md` here, whose entries `bin/knowledge-parity.mjs` checks for date order). The `gitattributes` starter carries the line as a comment, because a path other repositories lack would be noise.

A merge queue would remove the remaining catch-up merges. It is not adopted: every required workflow needs a `merge_group` trigger first.

## Claude Code managed settings

`claude/managed-settings.json` is the organization policy for Claude Code. An
Owner pastes it into **Organization settings > Claude Code > Managed settings**
in the claude.ai admin console, and every member receives it. It is additive:
it adds rules on top of each repository's own `.claude/settings.json` and
hooks, and never replaces them. This file is the reviewed source, so change it
here by pull request and paste the result, never edit the console alone.

> [!WARNING]
> Never set `allowManagedHooksOnly` or `allowManagedPermissionRulesOnly`. Each
> one silently turns off the guard hooks and permission rules in every
> repository, and nothing in a repository can detect it.

| Setting | Value | Why |
| ------- | ----- | --- |
| `forceLoginMethod`, `forceLoginOrgUUID` | `claudeai`, the Monte3L organization | Only members of this organization can use Claude Code. A wrong UUID locks everyone out |
| `requiredMinimumVersion` | `2.1.283` | The first version that understands `deniedModels`. Older clients would ignore it |
| `syncClaudeAiSkills`, `syncClaudeAiPlugins` | `false` | Skills and plugins enabled on a personal claude.ai account no longer load. Existing synced items move to `.trash/` |
| `disableClaudeAiConnectors` | `true` | claude.ai connectors are not fetched in the terminal, IDE extensions or Agent SDK. Cloud sessions and the desktop app are not covered |
| `availableModels`, `deniedModels` | Family aliases, minus Haiku 4.5 and Opus 4.7 | A family alias covers the whole family, so legacy models need an explicit deny. `model` stays a per-user choice |
| `attribution.sessionUrl` | `false` | No claude.ai session link in commits made from cloud or Remote Control sessions. The trailer and PR text are unchanged |
| `strictKnownMarketplaces`, `extraKnownMarketplaces` | `anthropics/claude-plugins-official`, `monte3l/m3l-plugins`, `skills-dir` | One identity per marketplace. `skills-dir` keeps plugins under `~/.claude/skills/` loading |
| `autoMode.environment` | `$defaults` plus the monte3l context | The classifier treats `github.com/monte3l`, `*.monte3l.com` and the publish environments as known. Without `$defaults` the built-in rules are lost |
| `permissions.disableBypassPermissionsMode` | `disable` | No `--dangerously-skip-permissions`. Auto mode stays available |
| `permissions.deny` | Secrets, force-push, `--no-verify`, `--admin`, `gh repo delete`, `Edit` of lockfiles and `.git/**` | The secrets list is the union of the repository lists, in the recursive form. The git rules are standing rules in every repository. The `Edit` denies for `pnpm-lock.yaml`, `package-lock.json`, `yarn.lock` and `.git/**` are local policy, not Anthropic guidance (its examples deny only `.env` and `secrets/**`): a lockfile is changed by `pnpm install`, not by hand. Deny rules from every scope add up and a lower scope cannot override one, so a repository that carried the same four entries can drop them. The rule covers Claude's file tools and the Bash commands Claude Code recognizes as writing a file (`sed`, `tee`, a redirect); `pnpm install`, `npm install` and Dependabot are not affected. The force-push rules end in a space before the `*` (`git push --force *`), so `--force-with-lease` is not denied and reaches its `ask` rule: deny is checked first, and `--force*` would also match it (`tests/managed-settings.test.mjs`) |
| `permissions.ask` | `gh api` writes, `gh secret`, `gh pr merge`, releases and publishing, `git push origin main`, `git reset --hard`, `sudo`, global installs, a bare `chezmoi apply` | The actions the auto mode classifier blocked most often, now a prompt instead of a block |
| `permissions.allow` | Read-only `git`, `gh`, shell commands and the documentation domains | The read-only commands that dominate real usage, so they stop prompting |
| `companyAnnouncements` | One line | The short version of the rules above |

Each repository keeps what only it needs: hooks, `enabledPlugins`, and the
`guard-*` scripts listed under [Claude Code guards](#claude-code-guards).
Managed hooks are left out on purpose, because a hook needs a path that exists
on every machine and a missing module blocks with `onFailure: block`.

### Before the marketplace allowlist goes live

The allowlist also applies to plugins that are already enabled. A plugin whose
marketplace is not registered stops loading. Repositories that enable plugins
as `name@anthropic-plugin-directory` are affected, because that name is not a
registered marketplace on a machine. Change those entries to
`name@claude-plugins-official` first, and confirm with `/plugin` that every
plugin still loads.

### Change the policy

1. Edit `claude/managed-settings.json` in a branch and run `jq empty` on it.
2. Open a pull request. Say which setting changed and what evidence supports it.
3. After the merge, an Owner pastes the file into the console. Clients pick it up at the next launch and then hourly.
4. Run `claude doctor` in a fresh session. It lists any entry the client rejected.

An invalid entry is dropped with a warning, and some invalid keys fail closed:
an unreadable `strictKnownMarketplaces` becomes an empty allowlist that blocks
every marketplace. Check the file before pasting it.

### Verify

| Check | Expected |
| ----- | -------- |
| `/status` | `Enterprise managed settings` appears in the setting sources |
| `/model` | Only the allowed models, and no Haiku 4.5 or Opus 4.7 |
| `/mcp` | No claude.ai connectors |
| `~/.claude/skills/synced/` | Moved to `~/.claude/skills/.trash/` |
| `claude --dangerously-skip-permissions` | Refused |
| `cat .env` | Denied |
| `gh api -X PATCH ...` | Prompts |
| `git status`, `WebFetch` of code.claude.com | Runs without a prompt |
| A write to `.env` in a repository with `guard-secret-writes` | Still blocked, which shows the policy is additive |

> [!NOTE]
> Bash rules match the command text. They do not stop `bash -c '...'` or an
> absolute path, and a `Read` deny does not cover `grep -r` run outside the
> sandbox. The console policy is also a client-side control on a machine
> without admin rights. The sandbox is the planned follow-up that closes both
> gaps. The sources are the
> [managed settings](https://code.claude.com/docs/en/managed-settings),
> [permissions](https://code.claude.com/docs/en/permissions) and
> [plugin policy](https://code.claude.com/docs/en/plugins/org) pages.

## Not covered

Secrets, GitHub App installations, code scanning default setup, and
organization policy (default repository permission, secret visibility,
allowed actions). Those need an organization owner. See the checklist linked
above.
