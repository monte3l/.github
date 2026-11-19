---
url: https://github.com/ossf/best-practices-badge/tree/main/criteria
accessed: 2026-11-19
---

# OpenSSF Best Practices criteria

**Source:** https://github.com/ossf/best-practices-badge/tree/main/criteria · **Kind:** primary · **Accessed:** 2026-11-19

## What it says

- The criteria live under `criteria/` in the best-practices-badge repository, which moved from the coreinfrastructure organization to ossf (the old name redirects).
- The eight newest commits touching the directory: 2026-09-03 (update to Baseline v2026.08.28), 2026-06-25 (organization rename), 2026-06-02, 2026-04-09, 2026-03-24, 2026-03-02, 2026-02-05 and 2025-12-12. Older ones exist: 2025-12-05 (Baseline phase 2) and 2024-01-29 and earlier (GitHub API).
- The repository has no versioned releases. Its 135 GitHub releases on 2026-11-19 were all SBOM artefacts, named `sbom-staging-<date>-<hash>` and `sbom-production-<date>-<hash>`, so a watcher on releases would fire on noise. The commits are the only meaningful change feed. No JSON endpoint for the criteria was found: `https://www.bestpractices.dev/criteria/*.json` answered 406.

## Caveats

- Some commits are not criteria changes, such as the rename. A new Baseline release can trigger this source and the Baseline source together.
