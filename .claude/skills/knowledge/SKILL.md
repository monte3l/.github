---
name: knowledge
description: Maintain the knowledge/ wiki. Ingest a source into a source card and the wiki pages it changes, answer a question from the wiki with citations, or lint the wiki for contradictions, orphans and stale pages. Use when the user types /knowledge, or asks to add research to the wiki, to ask the wiki, or to check it.
disable-model-invocation: true
---

# knowledge

Maintain the LLM-maintained wiki in `knowledge/`, in the shape of Karpathy's pattern: immutable source cards in `knowledge/raw/`, interpreting pages in `knowledge/wiki/`, an index, an append-only log, and a schema. A person reviews every change in a pull request.

## First

Read `knowledge/CLAUDE.md`. It is the schema: the shapes of a card, a page and a log entry, the rules, and the checks. Do not rely on memory of it. Then pick the operation from the argument: `ingest <url, file or topic>`, `query <question>`, or `lint`. With none, ask which.

## Ingest

1. **Read the source yourself**, in full where you can. If a fetch fails or a page is only partly read, say so in the card. Do not describe what you did not read.
2. **Write the card first**, `knowledge/raw/<slug>.md`: frontmatter `url` and `accessed` (today), then what it says, quotes of at most 25 words only where the wording matters, and caveats. Record who checked each fact: you, a tool, or a person.
3. **Update or create the wiki pages** the source changes. A new page needs frontmatter with `reviewed` (today) and `sources`, the visible `**Status:** … · **Reviewed:** …` line, and a section of what is unverified. Every claim cites a card with `../raw/<slug>.md`.
4. **Update the index** (`knowledge/README.md`) and, for a new page, add its `pages` entry in `docs.config.mjs` with `out` as `knowledge/<slug>.html`.
5. **Append to the log**, `## [today] ingest | title`, with one to three lines. Never edit an earlier entry.
6. **Check**: `node design/source/docs-kit/build.mjs --check`, which runs `bin/knowledge-parity.mjs`, and `node bin/knowledge-report.mjs`. Stage new files with `git add` first, because the kit reads `git ls-files`.

## Query

Answer from the wiki and cite the pages. If the question is not covered, say so plainly instead of answering from memory, and offer to ingest a source. If the answer is new knowledge worth keeping, offer to file it as a page, then follow Ingest.

## Lint

Read every page and card, run `node bin/knowledge-report.mjs`, and report as a table: page or card, problem, suggested fix. Look for:

- a contradiction between two pages
- a claim with no card behind it, or a card that says less than the page claims
- a page whose card has since been superseded
- an orphan card, a dead citation, or a page missing from the index
- a `reviewed` date older than 180 days, or one set without re-reading the sources

Report only. Fix what the person asks you to, and append a `lint` entry to the log for any change.

## Rules

- **The repository is public.** No secret, no credential, no personal detail, and no per-repository finding from the org audit.
- **Never bump `reviewed` to clear the report,** and never set it to a future date. It means you re-read the sources.
- **Never rewrite a card to fit a conclusion.** To record a re-read, append a `**Re-read:** YYYY-MM-DD` line saying what changed and leave `accessed` alone. A reading that changes the facts is a new card.
- **Do not restate the standard.** Link to `blueprint/` and the README.
- **Edit nothing outside `knowledge/`,** except the `docs.config.mjs` line a new page needs.
- Commit with `writing-commits` and open the pull request with `creating-prs`. Never push to `main`.
