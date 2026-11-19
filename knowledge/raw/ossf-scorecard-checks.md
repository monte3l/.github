---
url: https://github.com/ossf/scorecard/blob/main/docs/checks/internal/checks.yaml
accessed: 2026-11-19
---

# OpenSSF Scorecard check definitions

**Source:** https://github.com/ossf/scorecard/blob/main/docs/checks/internal/checks.yaml · **Kind:** primary · **Accessed:** 2026-11-19

## What it says

- The file says it is "the source of truth for all check descriptions and remediation steps". On 2026-11-19 it defined 20 checks, each with a risk level (Critical, High, Medium or Low).
- A check is a key at two-space indent under `checks:`, with a `risk:` line at four spaces.

## Caveats

- Observed churn: the last five commits touching the file span about a month: 2026-10-19 (Azure DevOps branch-protection mapping), 2026-10-28 (two: GitHub Actions pinned to immutable releases now count as pinned, and LGTM.com references removed) and 2026-11-18 (two: a documentation link fix and a link-check job). A watcher on the file's last commit would fire most weeks.
- That is why the wiki's watcher fingerprints check names and risk levels. It has a blind spot: a check's behaviour or description can change without either changing, as the immutable-release change on 2026-10-28 did.
