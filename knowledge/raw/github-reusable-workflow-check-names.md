---
url: https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows
accessed: 2026-11-19
---

# Reusable workflows and check names

**Source:** https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows · **Kind:** observation · **Accessed:** 2026-11-19

## What it says

- Observed on 2026-11-19 in the check runs of `m3l-groundwork`'s default branch: a job that comes from a reusable workflow is named `<caller job> / <called job>`, for example `Prepare / Release PR and draft`, while a job in the repository's own workflow keeps its plain name, for example `verify`.
- The reuse page documents the syntax, the nesting limit and that a commit SHA is the safest ref.

## Caveats

- The pages checked by a research agent (reuse-workflows, workflow syntax, about status checks and others) do not state the naming. Only the observation and third-party sources do.
- A ruleset's required checks are matched by that name, so converting a required workflow would change its context.
