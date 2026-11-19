---
url: https://docs.github.com/en/code-security/dependabot/working-with-dependabot/dependabot-options-reference
accessed: 2026-11-19
---

# Dependabot options reference

**Source:** https://docs.github.com/en/code-security/dependabot/working-with-dependabot/dependabot-options-reference · **Kind:** primary · **Accessed:** 2026-11-19

## What it says

- Dependabot applies a default cooldown of 3 days to version updates even when `cooldown` is not configured. The default does not apply to security updates.
- `default-days` sets the cooldown for every dependency without a specific rule. The semver-specific options do not work for Docker, GitHub Actions, Terraform or Helm.
- The github-actions ecosystem updates `uses:` references in workflow files, including reusable workflows (`https://docs.github.com/en/code-security/dependabot/working-with-dependabot/keeping-your-actions-up-to-date-with-dependabot`). No page says it reads an arbitrary version string such as an environment variable.

## Quotes

> "default cooldown period of 3 days"

## Caveats

- That Dependabot does not read an arbitrary version string is a conclusion from the absence of any such statement, not a quotation.
