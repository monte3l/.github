---
url: https://docs.github.com/en/rest/authentication/permissions-required-for-github-apps
accessed: 2026-11-19
---

# Permissions required for GitHub Apps

**Source:** https://docs.github.com/en/rest/authentication/permissions-required-for-github-apps · **Kind:** primary · **Accessed:** 2026-11-19

## What it says

- `GET /user/installations/{installation_id}/repositories` needs a user access token. The permissions table lists it for UAT only, not for an installation token. So a check that lists the repositories of an installation cannot run under an App installation token.
- `GET /orgs/{org}/rulesets` is listed under organization Administration with write access, even though it only reads.
- `GET /repos/{owner}/{repo}/vulnerability-alerts` and `automated-security-fixes` are listed under repository Administration with read access, for both token kinds.

## Caveats

- The first fact was read on the page on 2026-11-19. The second was read by a research agent.
