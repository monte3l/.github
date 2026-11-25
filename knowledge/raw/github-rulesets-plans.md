---
url: https://docs.github.com/en/organizations/managing-organization-settings/creating-rulesets-for-repositories-in-your-organization
accessed: 2026-11-19
---

# Which plans can have rulesets

**Source:** https://docs.github.com/en/organizations/managing-organization-settings/creating-rulesets-for-repositories-in-your-organization · **Kind:** primary · **Accessed:** 2026-11-19

## What it says

- Organization rulesets need GitHub Team or Enterprise: "For customers on GitHub Team or GitHub Enterprise plans you can create rulesets in your organization."
- Repository rulesets work on public repositories with GitHub Free (the About rulesets page, `https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets`).
- Requiring a workflow through a ruleset was announced as generally available for GitHub Enterprise Cloud on 2023-10-11 (`https://github.blog/changelog/2023-10-11-requiring-workflows-with-repository-rules-is-generally-available/`).

## Caveats

- Observed on 2026-11-19: this organization is on the Free plan, and `GET /orgs/monte3l/rulesets` answered 403 "Upgrade to GitHub Team to enable this feature".
- No newer page confirming that required workflows reached other plans was found.

**Re-read:** 2026-11-25 — the introduction still says organization rulesets are for GitHub Team or Enterprise plans.
