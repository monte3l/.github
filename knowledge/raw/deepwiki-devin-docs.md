---
url: https://docs.devin.ai/work-with-devin/deepwiki
accessed: 2026-11-19
---

# DeepWiki, in Devin's documentation

**Source:** https://docs.devin.ai/work-with-devin/deepwiki · **Kind:** vendor · **Accessed:** 2026-11-19

## What it says

- DeepWiki generates a wiki for a repository: architecture diagrams, documentation and links to the source. The wiki can be steered with a `.devin/wiki.json` file. Both its fields, `repo_notes` and `pages`, are required, and `pages` must list at least one page.
- Generation runs at three effort levels: Low is free, Medium costs about 5 to 10 ACUs and High about 20 to 40. Medium and High need a subscription or credits.
- A free version that works with public GitHub repositories is available, and a public DeepWiki MCP provides basic documentation and Q&A.

## Caveats

- deepwiki.com itself answered HTTP 429 when fetched on 2026-11-19, so nothing was read there.
- The page does not name the MCP endpoint or its tools, and does not say whether private repositories are supported. Both are unverified.
