---
url: https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f
accessed: 2026-11-19
---

# Karpathy's llm-wiki gist

**Source:** https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f · **Kind:** primary · **Accessed:** 2026-11-19

## What it says

- An "idea file" meant to be pasted into a coding agent, not software. Created 2026-04-04, one revision. It says of itself that it is intentionally abstract.
- Three layers: raw sources that the LLM reads but never edits, a wiki the LLM owns entirely, and a schema document (CLAUDE.md or AGENTS.md) that tells the LLM how the wiki is structured and what workflow to follow.
- Three operations: ingest (one source can touch 10 to 15 wiki pages), query (a good answer can be filed back as a page) and lint (contradictions, stale claims, orphan pages, missing cross-references, data gaps).
- Two special files: index.md, a catalog updated on every ingest, and log.md, append-only, with headings such as `## [2026-04-02] ingest | Article Title` so a grep can list the latest entries.
- Suggested tooling: Obsidian as the viewer, qmd as an optional local search engine, and plain git for history.

## Quotes

> "the wiki is a persistent, compounding artifact"
> the index approach "works surprisingly well at moderate scale (~100 sources, ~hundreds of pages)"

## Caveats

- The creation date and revision count were read from the gist page by a research agent. A second reader could not re-check them, because the gist API answered 502 and 500.
- Only the first part of the page (about 40,000 of 100,000 characters) was read verbatim, which covers the whole gist body. The rest is a comment thread.
- The comments are mostly promotion for other products. One reports a wiki-only setup scoring 0.64 against 0.89 for a retrieval pipeline on 77 questions, and says compiling drops detail. That is an anecdote, not a result, and it is unverified.
