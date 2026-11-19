---
url: https://llmstxt.org/
accessed: 2026-11-19
---

# The llms.txt proposal (v2)

**Source:** https://llmstxt.org/ · **Kind:** primary · **Accessed:** 2026-11-19

## What it says

- Proposed by Jeremy Howard, published 2024-09-03 and last modified 2026-08-10. The page is version 2, updated from two years of adoption.
- A markdown file at `/llms.txt`, at the site root or any subpath. The most specific file that covers a URL applies.
- Format, in order: an H1 with the site name (the only required part), a blockquote summary, optional prose sections without headings, then H2 sections that are lists of `[name](url)` links with optional notes. An H2 named Optional holds links an agent may skip when it needs less context.
- Each page that agents may need should have a clean markdown copy at the same URL with `.md` appended or replacing the extension, and `index.html.md` or `index.md` for a directory.
- Discovery: `rel="alternate" type="text/markdown"` for a page's copy and `rel="describedby"` for the llms.txt that covers it, as HTML link elements or an HTTP Link header.
- It says OpenAI, Anthropic and Gemini publish llms.txt files for their own developer docs, and that the file is meant for inference rather than training.

## Caveats

- The page does not say that any LLM provider reads llms.txt when answering. Publishing one is not the same as being consumed.
- The page never mentions llms-full.txt: zero occurrences when checked on 2026-11-19. That file is a convention of docs platforms, not part of the proposal.
