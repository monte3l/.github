---
url: https://docs.renovatebot.com/presets-customManagers/
accessed: 2026-11-19
---

# Renovate custom managers

**Source:** https://docs.renovatebot.com/presets-customManagers/ · **Kind:** primary · **Accessed:** 2026-11-19

## What it says

- Renovate can update an arbitrary version string with a regex manager (`customManagers` with `customType: regex` and `managerFilePatterns`; `https://docs.renovatebot.com/modules/manager/regex/`). The preset `customManagers:githubActionsVersions` is described as updating `_VERSION` environment variables in GitHub Action files. It reads the datasource and package from a `# renovate: datasource=... depName=...` comment above the key, so `github-releases` is one valid value, not a fixed one.
- `minimumReleaseAge` is its cooldown. It relies on the datasource providing a release timestamp, which for github-releases depends on the registry.
- `platformCommit` makes Renovate commit through the GitHub API, which gives signed commits, but only when it runs as a GitHub App.
- The bot-comparison page (`https://docs.renovatebot.com/bot-comparison/`) compares features and has no guidance on running Renovate and Dependabot in one repository.

## Caveats

- Read by a research agent. Nothing was run: the behaviour is from the documentation only.
