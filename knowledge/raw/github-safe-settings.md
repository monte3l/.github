---
url: https://github.com/github/safe-settings
accessed: 2026-11-19
---

# github/safe-settings

**Source:** https://github.com/github/safe-settings · **Kind:** primary · **Accessed:** 2026-11-19

## What it says

- Policy as code: settings live in an `admin` repository and are applied by a GitHub App or a scheduled Action. It manages repository settings, branch protection, rulesets, labels, teams, custom properties, environments and autolinks.
- It can dry-run on pull requests, revert drift when a webhook arrives, and sync on a schedule, because webhooks are not always delivered. Version 3.0.0, released 2026-10-05.
- Its default exclusions include `.github`, `admin` and `safe-settings`.

## Caveats

- Read by a research agent, and its README checked again by a second reader. It is built to apply settings from an admin repository: it can dry-run on pull requests and revert drift, and the page does not describe a read-only audit mode. It has to be run, as a GitHub App or a scheduled Action.
- Whether it covers the Actions policy and the security features was not confirmed on the page.
