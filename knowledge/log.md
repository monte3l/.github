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

