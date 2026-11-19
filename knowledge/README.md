# Knowledge base

Decisions, research and the reasons behind how the `monte3l` organization works, kept as an interlinked set of pages. It follows the pattern in [Karpathy's LLM wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f): raw sources stay untouched, an LLM maintains the pages that interpret them, and a schema tells it how.

The [engineering standard](../blueprint/README.md) is not here. It is written by people and checked against the code. This is where the reasoning around it lives, so that a decision is not rediscovered.

## Pages

| Page | Status | What it answers |
| --- | --- | --- |
| [LLM wiki, llms.txt and RAG](wiki/llm-wiki-and-llms-txt.md) | Decision | What the docs use to serve agents, and what they do not |
| [The weekly org audit](wiki/org-audit-decisions.md) | Decision | Why the audit is a script, what it publishes, what it cannot see |
| [Pinned tools and upstream policies](wiki/pin-and-policy-freshness.md) | Decision | How versions Dependabot cannot read, and policies other people change, are watched |
| [Keeping copied workflows current](wiki/template-sync-options.md) | Decision | How stale workflow copies are found and refreshed, and why reusable workflows wait |

## How it is kept

- **Every claim cites a source card.** A card under `knowledge/raw/` records one external page: its URL, the date it was read, what it says and what it does not. A card is never rewritten to say something else. A later reading is recorded as a `Re-read` line at its end, and a reading that changes the facts is a new card. They are not on this site, and the [cards are on GitHub](https://github.com/monte3l/.github/tree/main/knowledge/raw).
- **Every page has a review date**, shown under its title. A page not reviewed for 180 days is reported once a week in one issue, which never blocks a merge.
- **Every change goes through a pull request,** like any other documentation, and passes the same checks. The [log](log.md) records what was added, checked or decided, oldest first.
- **Unverified claims are marked** as such, in a section of their own on each page.

The maintainer's instructions are in `knowledge/CLAUDE.md`, and `/knowledge` in Claude Code runs the three operations: ingest, query and lint.

## Related

- The [harness refresh tracker](https://github.com/monte3l/.github/blob/main/docs/research/harness-refresh.md) is a separate living record, updated by the `harness-guidance` skill, and is not part of this wiki.
