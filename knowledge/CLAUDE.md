# Knowledge base: instructions for the maintainer

This directory is an LLM-maintained wiki in the shape of Karpathy's pattern. You maintain it; a person reviews every change in a pull request. Read this file before you touch anything here.

## Layers

| Layer | Path | Who writes it | Rule |
| --- | --- | --- | --- |
| Source cards | `knowledge/raw/<slug>.md` | You, one per external page | Never rewrite a card to fit a conclusion. To record that you read it again, append a `**Re-read:** YYYY-MM-DD` line saying what changed, and leave `accessed` alone. A new reading that changes the facts is a new card |
| Wiki pages | `knowledge/wiki/<slug>.md` | You | Interpret the cards. Every claim cites one |
| Index | `knowledge/README.md` | You | Lists every wiki page. Update it on every ingest |
| Log | `knowledge/log.md` | You | Append-only. Never edit or reorder an entry |
| Schema | this file | You and a person, together | Change it when a rule here keeps being wrong |

## Shapes

A **source card** starts with frontmatter and records exactly one external page:

```
---
url: https://...
accessed: YYYY-MM-DD
---
```

then `# Title`, a line `**Source:** <url> · **Kind:** primary|vendor|community|observation · **Accessed:** <date>`, and the sections **What it says**, **Quotes** (each at most 25 words, only if the wording matters) and **Caveats**. Paraphrase. Record what you checked yourself and what a tool or a person told you, and say which. An observation is something measured, with the date.

A **wiki page** starts with frontmatter:

```
---
reviewed: YYYY-MM-DD
sources:
  - raw/<card>.md
---
```

then `# Title`, directly under it a line `**Status:** Decision|Research|Runbook · **Reviewed:** <same date>` (the build checks it matches the frontmatter), a one-paragraph answer, the body, a section **What is unverified** or **Open questions**, and links to related pages. Link a card as `../raw/<card>.md`. Never state an external fact that no card supports. A fact about this repository may link to the file instead.

A **log entry** is `## [YYYY-MM-DD] kind | title`, with kind one of `ingest`, `query`, `lint` or `decision`, then one to three lines.

## Operations

- **Ingest.** Read the source yourself. Write its card first, then update or create the pages it changes, then the index, then the log. Say in the card what you could not read. One source can touch several pages. Do not let a card sit uncited: the weekly report lists an orphan.
- **Query.** Answer from the wiki and cite the pages. If the answer is new knowledge, offer to file it as a page. If the wiki does not know, say so instead of filling the gap from memory.
- **Lint.** Look for contradictions between pages, a claim without a card, a page whose card has been superseded, an orphan card, a page missing from the index, and a `reviewed` date older than 180 days. Report; fix only what the person asks you to.

Setting `reviewed` means you re-read the sources, or checked that they have not changed. Never bump it to clear the weekly report, and never set it to a date that has not happened: the report lists a future date.

## Rules

- **The repository is public.** Nothing private goes in: no secret, no credential, no personal detail, and never a list of which repository lacks which protection. The org audit publishes counts only, and so does this wiki. A finding that was the same on every repository and has been fixed is history and may be recorded, in general terms.
- **Do not restate the standard.** `blueprint/` and the README are written by people and checked against the code. Link to them. A second copy would drift.
- **Follow m3l-design:** **bold**, never italics. GitHub alerts matched to severity, at most two in a row. Tables for tabular data. Short, plain sentences.
- **Facts over fluency.** If you did not verify it, it goes under unverified, with who said it.
- **A new wiki page** needs a `pages` entry in `docs.config.mjs` (`out` as `knowledge/<slug>.html`) and a row in the index. A new card needs nothing there: `knowledge/raw/**` is excluded from the site.
- **Never edit** `blueprint/`, the standard, or any file outside `knowledge/` as part of an ingest, except `docs.config.mjs` for the line above. Changes leave through a pull request.

## Checks

| Command | What it checks |
| --- | --- |
| `node design/source/docs-kit/build.mjs --check` | The site builds, links resolve, and `bin/knowledge-parity.mjs` passes: frontmatter, sources that exist, a page in the index and in `docs.config.mjs`, log order |
| `node bin/knowledge-report.mjs` | What needs a person: a stale page, an orphan card, a dead citation. Read-only, never fails a build |
