---
url: https://github.com/ossf/allstar
accessed: 2026-11-19
---

# OpenSSF Allstar

**Source:** https://github.com/ossf/allstar · **Kind:** primary · **Accessed:** 2026-11-19

## What it says

- A GitHub App that enforces policies on repositories: branch protection, binary artifacts, CODEOWNERS, outside collaborators, SECURITY.md, secret scanning, dangerous workflows, Actions rules, admins and generic Scorecard checks. Its actions are log, issue (one issue per policy) and fix.
- Version 4.6, released 2026-08-31 (GitHub API). The repository is actively pushed to.
- The OpenSSF-hosted app is reported as retired, so it has to be run by the organization, as a scheduled Action in a `.allstar` repository or as a daemon. Repositories can opt in or out.
- Open issues get a reminder comment every 24 hours, and the interval is not configurable.

## Caveats

- Read by a research agent, not by the author of this card. Release dates come from the GitHub API.
- That it cannot check rulesets, merge settings, labels or REUSE is an inference from its list of policies, not a statement on the page.

**Re-read:** 2026-11-25 — the latest release is now v4.7 (2026-11-20, GitHub API), not 4.6. The README still lists the same ten policies and says the hosted app is retired. Nothing the audit page relies on changed.
