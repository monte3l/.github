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

**Re-read:** 2026-11-19 — the Workflows repository permission. This page's table lists `PUT` and `DELETE /repos/{owner}/{repo}/contents/{path}`, `POST /git/refs`, `PATCH /git/refs/{ref}`, `POST /releases` and `PATCH /releases/{id}` as needing it in addition, for both token kinds. A different page, "Choosing permissions for a GitHub App" (`https://docs.github.com/en/apps/creating-github-apps/setting-up-a-github-app/choosing-permissions-for-a-github-app`), says an app that needs to edit Actions files in `.github/workflows` should request it. The GraphQL `createCommitOnBranch` mutation, which the design re-sync uses, is not in this page's table, so whether it needs the permission is not documented here. Observed the same day: the release App holds contents write, pull requests write and metadata read, and no workflows permission.

**Re-read:** 2026-11-25 — the three endpoints in the first caveat above are listed as before. The last 5,604 characters of the page were not read.
