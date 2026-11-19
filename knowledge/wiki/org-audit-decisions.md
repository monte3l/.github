---
reviewed: 2026-11-19
sources:
  - raw/ossf-allstar.md
  - raw/github-safe-settings.md
  - raw/ossf-scorecard-monitor.md
  - raw/github-rulesets-plans.md
  - raw/github-app-permissions.md
  - raw/github-api-visibility-observation.md
---

# The weekly org audit: why it is built this way

**Status:** Decision · **Reviewed:** 2026-11-19

Every Monday `org-audit.yml` runs the read-only baseline check over every repository and keeps one issue, **Org baseline drift**. It uses a read-only GitHub App token, and because this repository is public it publishes **counts only**. A person reads the detail locally with `bin/org-audit.sh`.

## Why a script and not a tool

The settings the baseline checks (rulesets, merge settings, Actions policy, labels, security features, required files) are already data in `blueprint/`. What was missing was a schedule and somewhere to report.

| Option | What it would add | Why not |
| --- | --- | --- |
| [OpenSSF Allstar](../raw/ossf-allstar.md) | Enforcement of branch protection, SECURITY.md and similar | Its list of policies has no rulesets, merge settings, labels or REUSE, and it has to be self-hosted |
| [safe-settings](../raw/github-safe-settings.md) | Policy as code with drift reversion | It is built to apply settings (it can dry-run and revert drift), not to audit read-only, and has to be run as an App or a scheduled Action |
| [scorecard-monitor](../raw/ossf-scorecard-monitor.md) | Score aggregation | Still a beta, with no release in about two and a half years |
| Organization rulesets | Central enforcement | [Needs the Team plan](../raw/github-rulesets-plans.md): the organization is on Free and the API answered 403 |

## What it publishes, and why

A public issue, job summary, log or artifact is readable by anyone, and a list of which repository lacks which protection tells an outsider where to aim. So the scheduled run publishes only how many repositories differ and by how many items. The workflow takes no inputs, because a dispatch input shows on the public run page and a step's `env:` value shows in the public log. That reasoning came from a review of the workflow and was not checked against GitHub's documentation.

## What it cannot see

A read-only caller is not shown every field. [Measured on 2026-11-19](../raw/github-api-visibility-observation.md): with no token the five merge settings come back null and a ruleset's bypass actors are left out. The baseline therefore skips them under the App token, and only a local admin run checks the merge settings and who may bypass the rulesets.

The job summary prints a skipped-items count. On the first clean run it was 32: 4 items that do not apply anywhere, 7 that only an admin token can run (one per repository, consistent with the installation-listing check that [accepts a user token only](../raw/github-app-permissions.md)), and 21 blind spots (three per repository). A change in that number without a reason means the audit's view changed.

## The false positive, and the lesson

The first scheduled run opened an issue saying all 7 repositories differ by 21 items. An admin token found none. The first theory, that a failed read of the three security features was being read as "feature off", fitted the arithmetic (three per repository) but was wrong: one of those endpoints answers without any token. A local run as the App showed the real items, and the cause was the fields a read-only caller is not shown.

The lesson is to get the real item names before fixing. They cannot come from the public run, so a helper that mints an App token locally makes that possible. A read that fails for a reason other than "off" must also never be reported as drift: a 404 is read as off, a 403 is a skip, and anything else is a failed call.

## Open questions

- What the installation token is shown for each individual field was not measured. The match is indirect.
- Whether organization-level custom properties are available on the Free plan was not established.
