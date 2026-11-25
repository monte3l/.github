# Log

What was added, checked or decided in the [knowledge base](README.md), oldest first. Each entry is a heading of the form `## [date] kind | title`, with the kind one of `ingest`, `query`, `lint` or `decision`, and the log only grows at the end.

## [2026-11-19] ingest | LLM wiki, llms.txt and RAG

Compared Karpathy's wiki pattern, llms.txt, DeepWiki and retrieval over embeddings. Five source cards. Decision recorded: two layers, no retrieval. The documented limits of llms.txt are on the page.

## [2026-11-19] ingest | The weekly org audit

Recorded why the audit is a script and why it publishes counts only, from the design review and the first scheduled runs. Six source cards. Includes the false positive of the first run and the measurement that explained it.

## [2026-11-19] ingest | Pinned tools and upstream policies

Recorded the two watchers in `freshness.yml`. Five source cards. A recheck against the live commit history corrected the Scorecard churn figure, and added a blind spot of the Scorecard signal as an open question.

## [2026-11-19] ingest | Bootstrapping and template sync

Research only, nothing decided. Four source cards. The reusable-workflow check-name observation is what limits the scope of any conversion.

## [2026-11-19] decision | Do not move the harness refresh tracker into the wiki

The tracker at `docs/research/harness-refresh.md` is read and written by the `harness-guidance` skill and listed by the `customize` skill, so moving it would break both, and it would publish maintainer notes on the public site. The index links to it instead.

## [2026-11-19] lint | Fact-check against the primary sources

A second reader re-fetched the primary pages behind the cards. Corrected: the Best Practices repository has no versioned releases, only 135 SBOM-artefact releases (the card had said none), its commit list was the eight newest and not all, Allstar's push date had been mixed up with safe-settings', and four sentences overstated what a card said. Added a card for the Baseline releases so that claim has a source. Unchanged: every quote and every version number checked.

## [2026-11-19] decision | monte3l.com opts in to llms.txt

Kit 1.4.0 reached all six consumers, and this site set `llms` and `sitemap` with a one-line summary on every page. The two generated pages, the template catalog and the baseline-check catalog, return their own Markdown, so an agent gets them as tables instead of a link to HTML. The llms.txt page was corrected: it had said the site did not publish the files.

## [2026-11-19] ingest | Workflow copies and template sync

Measured 76 workflow copies against their templates and rewrote the template-sync page from research to a decision. Three new cards (the measurement, the dependency-review config file, gitleaks' config lookup) and a re-read line on the App permissions card. Two things first believed were corrected by checking: the `--metadata` step is a per-repository variant, not a template improvement, and `GITLEAKS_CONFIG` is redundant. A review then found that the first classifier could call a copy with a step commented out stale, which would have let a sync overwrite it, and that three of my own statements were wrong (a copy total of 63 that is 67, a claim about the gitleaks template, and a reading of the dependency-review config keys). All are fixed and the log of this decision says how.

## [2026-11-19] decision | Sync before reusable workflows, with a separate App

Defer reusable workflows. Refresh only copies that equal an older template version. Open the pull requests from a separate `monte3l-sync` App rather than widening the release App.

## [2026-11-19] decision | Allow-lists move to a config file

The package allow-list left the `dependency-review` workflow for `.github/dependency-review-config.yml`, so the copies stop being custom and the template sync can cover them. The action source showed that the file must exist and hold at least one key, so a starter file with an empty list is part of the standard and a baseline item requires it. Migrating the six consumers is one pull request each, because the workflow and its file must land together or the required check fails.

## [2026-11-19] decision | A repository starts from data, and the Apps are added by the script

New repositories come from `blueprint/bootstrap.json`, which a parity check keeps in step with the starters and templates, and `bin/new-repo.sh` creates one from it. Checking the live Apps showed they are installed on selected repositories and not all, as the audit documentation said, so a new repository is added to them as a step. Groundwork's scaffold wins on every file it writes, and the org `verify` workflow is left out when it runs, because its own `ci.yml` already defines that check. The docs site and the environment cleanup are excluded with the reason until their prerequisites are produced.

## [2026-11-19] decision | The first real run found three gaps

Running `bin/new-repo.sh` for real on a throwaway private repository showed three things its stub tests could not. A new repository is shared no organization secret, so Gitleaks and Release failed on the first push, and `apply-repo-baseline.sh` reports a missing release secret but does not share it: the script now shares `GITLEAKS_LICENSE` and, with a kind, the release App's secrets, and turns on immutable releases. A private repository cannot run Scorecard or Dependency Review, so those two templates are written only for a public one. The placeholder `verify` step fails on purpose, so the script lists it for a person. The earlier plan said the baseline shares the organization secrets: that was wrong, it does so only for the environment cleanup's.

## [2026-11-19] decision | Secrets and Apps come before the first push

A second real run, public with kind `plugin`, showed Gitleaks and Release failing again on the first push although the secrets were now shared: the push starts them at once, and the secrets were shared minutes later. The Apps, secrets and immutable releases now come before the push. What a new public repository still has afterwards is not a defect: the Scorecard alerts of its first run, and the reuse.software and bestpractices.dev registrations.

## [2026-11-19] decision | A docs site is an option of the bootstrap, gated before anything is created

`bin/new-repo.sh --docs` adds a docs site. Running the real docs gate on a rendered repository found three things its data had wrong before any repository existed: the design folder's marker must be excluded from the pages, an `exclude` entry that matches no file fails the kit, and the README skeleton links to a `CONTRIBUTING.md` that a docs repository does not have. The gate now runs on the result before the repository is created. A docs repository's Dependabot, dependency-review config and README differ from the plain ones, so the data picks between starters with `requires` and its negation.

## [2026-11-19] decision | The third real run found a corrupt lockfile, and a missing green run

Running `bin/new-repo.sh --docs` for real on a throwaway public repository, with the Cloudflare secrets left out so the deploy could not touch the production zone, found two things the stubs hid. The deploy lockfile was made with `npm install --package-lock-only --prefix DIR` from another directory, and with a temporary directory under macOS's symlinked `/var` npm wrote this machine's paths into it, so the deploy's `npm ci` reported every package missing. It now runs inside the deploy directory, and the lockfile is checked (no path of this machine, and `npm ci --dry-run` accepts it) before anything is created. And a new repository has never run the environment cleanup, which the baseline wants green once: the script now dispatches it as a dry run and waits. The earlier first-push failures (Gitleaks, Release) were confirmed fixed.

## [2026-11-19] decision | The tests live in the repository and run in verify

The suites behind the "all passing" claims of the last pull requests lived only in a temporary session folder: a reboot could have deleted them, CI never ran them, and the README said the repository had no tests. They are now in `tests/` (the parity gates, the template classifier with hostile input, the bootstrap renderer, and the 130-case harness for `bin/new-repo.sh` against stubs and a local bare repository) and `verify` runs them. A deliberate break of the classifier's rule that a custom copy is never called stale makes thirteen cases fail, so the suite can fail. The rule for a bug found only by a real run, such as the corrupt lockfile or the branch taken over a tag, is that it gets a test for its cause. What a stub cannot answer stays unverified until a real run, and the pull request says so.

## [2026-11-19] decision | The deploy lockfile is a reviewed starter, not generated at bootstrap

Scorecard's Pinned-Dependencies check flagged the `npm install --package-lock-only` in the docs bootstrap (`npmCommand not pinned by hash`). The finding was fair: the script resolved a docs site's transitive dependencies from the network at bootstrap time, unreviewed, and the same step had already produced a corrupt lockfile once. The lockfile is now a starter, `blueprint/files/deploy-tools/package-lock.json`, taken from this repository's own Dependabot-maintained lock, with an integrity hash for every package, and a Dependabot entry keeps the starter current (it had drifted to wrangler 4.151.1 against 4.162.0). The script copies it and only proves with `npm ci --dry-run` that it still matches `package.json`. A test checks that the pair agrees, which is npm's own rule, without the network.

## [2026-11-20] decision | Scheduled findings share a `freshness` label, and page age comes from git

Eight scheduled workflows across the organization open issues, and nothing tied them together. The five callers of `bin/lib/upsert-issue.sh` in this repository now also add the `freshness` label (the script takes a comma-separated list, matches an issue by its first label and adds a missing label to an issue that is already open), so one search lists what is waiting. The scheduled workflows in the other repositories join as their own changes land. `org-audit.yml` prints only the counts, because this repository is public. The roll-up for scheduled findings is a label and a search, because that needs no setup in the other repositories; it shows what a scheduled check found, and is not a planning tool. Decided for the work that follows: a docs page's age is its last git commit date unless a `reviewed` date is newer, so authors write nothing and a person can still confirm a page without editing it. Reusable workflows for `verify` were rejected, because GitHub names such a check `<job> / <reusable job>` and the `main` ruleset requires `verify`. Not yet verified by a real run: the org-wide search with the audit App token.

## [2026-11-20] decision | Tracking is files for what stays true and issues for work that can close

A project had no rule for where limits, unverified claims, gaps and plans go: each kept a `ROADMAP.md`, and the rest sat in prose in four other places. `blueprint/tracking.md` now sets one rule: a statement that stays true lives in `ROADMAP.md`, and work that can be finished is an issue with one of six org types (Bug, Feature, Task, Gap, Debt, Verify). One org Project gives the cross-repository view. It sits beside the `freshness` label, which still marks a finding that a scheduled check opened. The ten issue types the org had belonged to an unrelated workspace and no issue used one, so they were replaced.

The Project cannot rely on the issue forms alone: GitHub adds an issue through `projects:` only when its author can write to the Project, and the Free plan allows one auto-add rule. `bin/project-backfill.sh` adds what they miss, and its test found that a failed repository listing read as a clean run until the listing was read into a variable first. Everything new reports only and blocks nothing.

## [2026-11-25] ingest | Org custom properties on the Free plan

Defining an organization custom property works on the Free plan (a probe property was created and deleted; GitHub's pages state no plan rule). Three cards added, the six existing sources of the org audit page were re-read (Allstar is now v4.7), and its review date was set.
