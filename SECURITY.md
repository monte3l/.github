# Security Policy

This is the default security policy for repositories in the `monte3l`
organization. A repository with its own `SECURITY.md` overrides it.

## Reporting a vulnerability

Use GitHub's [private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
on the repository concerned: open its **Security** tab, then **Report a
vulnerability**. The direct link is
`https://github.com/monte3l/<repository>/security/advisories/new`; for this
repository it is
[`monte3l/.github`](https://github.com/monte3l/.github/security/advisories/new).

> [!IMPORTANT]
> Do not open a public issue for a suspected vulnerability.

Include the affected version, reproduction steps, and the impact you think
it has.

## What to expect

| Step        | Target                                                                  |
| ----------- | ----------------------------------------------------------------------- |
| Acknowledge | Within 7 days                                                           |
| Fix         | Within 60 days of confirming a medium-or-higher severity vulnerability |
| Disclose    | A published GitHub security advisory, crediting you unless you decline  |

These are targets for small maintainer teams, not a service-level agreement.
A repository's own `SECURITY.md` states which versions it supports.

## Scope

A vulnerability in a `monte3l` repository or in what it publishes. Issues in
a third-party dependency belong with that dependency's maintainers, unless
this project uses it in a way that makes the problem worse.

## Secrets

A repository that uses a secret lists it in its own `SECURITY.md`, so a
reader can see what a leaked copy would reach and when it expires.

| Column      | What to write                                                      |
| ----------- | ------------------------------------------------------------------ |
| Secret      | The name, as it appears in the workflow                            |
| Scope       | Organization, repository, or environment (prefer an environment)   |
| Reaches     | What an attacker holding it could do                               |
| Expiry      | One year at most. A key that cannot expire is rotated every year   |

If a secret is exposed, revoke it first, then clean up the history.

## Accepted OpenSSF Scorecard findings

> [!NOTE]
> This section describes the `monte3l/.github` repository itself. A repository
> that inherits this file lists its own findings in its own `SECURITY.md`.

Background, not policy: this explains the Scorecard results for anyone who
looks them up. `scorecard.yml` runs weekly and surfaces its findings as Code
Scanning alerts. The ones below are dismissed as deliberate or time-based, not
defects. Do not "fix" the first one into a standing bypass.

| Check | Score | Why it stays |
| ----- | ----- | ------------ |
| Branch-Protection | 8 | The top tier asks for two approvals. The organization has two members, so a PR has one reviewer who is not its author, and requiring two would block every merge unless a standing bypass existed. The `main` ruleset has an empty bypass list on purpose. Every other protection is on: a code-owner approval, approval of the last push, stale-review dismissal, an up-to-date branch, required checks, signed commits, and no force-push or deletion |
| Code-Review | 2 | The first commits landed before the `main` ruleset existed. Every PR since needs a code-owner approval, so the approved share rises as PRs merge. The alert is dismissed only until the score reaches 10 |
| Maintained | 0 | Scorecard scores any repository under 90 days old as 0. This one was created on 2026-09-29, so it resolves itself on 2026-12-28 |
| Fuzzing | 0 | Not applicable. The repository holds Markdown, JSON and one bash script that calls `gh`. It has no parser of untrusted input, and no dependencies to fuzz |
| CII-Best-Practices | 0 | Not applicable. This is a community-health and configuration repository, not a software project with releases, tests or a build. The code repositories register for the badge instead |
