---
reviewed: 2026-11-19
sources:
  - raw/karpathy-llm-wiki.md
  - raw/llmstxt-org.md
  - raw/google-llms-txt-statement.md
  - raw/anthropic-docs-llms-files.md
  - raw/deepwiki-devin-docs.md
---

# LLM wiki, llms.txt and RAG: what the organization docs use

**Status:** Decision · **Reviewed:** 2026-11-19

The organization's docs serve agents with two layers. The first is deterministic: `llms.txt` and a markdown copy of every page, generated from the same sources as the site. The second is this knowledge base, an LLM-maintained wiki for synthesized knowledge, gated like any other documentation. Retrieval over embeddings is not used.

## The options

| Approach | Who writes the content | How an agent finds it | Fit here |
| --- | --- | --- | --- |
| Karpathy's LLM wiki | An LLM, from immutable raw sources | A catalog file (`index.md`) read directly, plus a log | **Adopted** for synthesized knowledge, in this directory |
| llms.txt with a markdown copy of each page | A generator, from the pages themselves | A curated link list at `/llms.txt`, one copy per page | **Adopted** for the standard and the docs, in the docs kit |
| DeepWiki | An LLM, generated from a repository | A hosted wiki, Q&A and an MCP server | Not adopted: its free tier covers public repositories, and private-repository support is unverified |
| Retrieval over embeddings (RAG) | Anything | A vector or hybrid search | Not adopted: the corpus is tens of pages |

## Why two layers

**The standard and the blueprint are not synthesized.** Their source of truth is code and JSON, and `bin/doc-parity.mjs` fails the build when prose and code disagree. A second copy written by an LLM could drift from both without any test noticing. So those pages stay human-written, and an agent reads them through llms.txt.

**Synthesized knowledge has no other home.** Decisions, research and the reasons behind a design are written once and then become stale. Karpathy's pattern fits that: raw sources stay immutable, an LLM maintains the pages that interpret them, and a lint pass looks for contradictions, orphans and stale claims ([the gist](../raw/karpathy-llm-wiki.md)). Here every page cites source cards, a person reviews every change in a pull request, and `bin/knowledge-parity.mjs` enforces the shape.

## Layer one: llms.txt

The docs kit in `monte3l/m3l-design` writes `llms.txt`, a `.md` copy of every Markdown page, an optional `llms-full.txt` and a `sitemap.xml`, all opt-in. It follows [llmstxt.org](../raw/llmstxt-org.md): an H1, a blockquote summary, then link lists per section, with an Optional section agents may skip.

Observed on the deployed design site (design.monte3l.com) on 2026-11-19: the files answer 200 with content types `text/plain`, `application/xml` and `text/markdown`, none with a declared charset, and the home page advertises them with `rel="describedby"` and `rel="alternate"` links. The organization site (monte3l.com) does not publish them yet: it answered 404 for `/llms.txt` the same day, because it has not adopted the kit release or opted in.

## Why no retrieval layer

Karpathy gives the index approach a scale of about 100 sources and hundreds of pages, and the organization has seven repositories. A vector store would add hosting and a re-index step for no gain at that size. Revisit when the wiki or the docs grow far beyond that.

## What is unverified

- **No provider is confirmed to read llms.txt.** [The proposal](../raw/llmstxt-org.md) does not say any does. [Google says](../raw/google-llms-txt-statement.md) Search ignores it, and [Anthropic publishes its own](../raw/anthropic-docs-llms-files.md) without that showing it reads others'. The files are cheap and harmless, and their benefit to agents is real but not guaranteed.
- **llms-full.txt is a convention,** not part of the proposal, which is why it has its own switch.
- **A wiki can lose detail.** One commenter on the gist reports a wiki-only setup scoring below a retrieval pipeline, and says compiling drops detail. That is an anecdote. It is the reason every claim here cites a card with a link, so the detail is one click away.
- **DeepWiki** ([Devin's docs](../raw/deepwiki-devin-docs.md)) was not tried. Its site answered 429 when fetched.

## Related

- [The weekly org audit](org-audit-decisions.md) shows the same rule at work: what a public repository publishes is a decision, not a default.
