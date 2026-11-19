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
