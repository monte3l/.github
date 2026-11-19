# Security Policy

<!-- Starting point for SECURITY.md. `{repo}` is replaced by `bin/new-repo.sh`;
     replace every other placeholder in braces by hand and delete this comment. The
     advisory URL must stay absolute: a repository that inherits the org default
     scores 4 on Scorecard's Security-Policy check. -->

## Scope

This covers `{repo}`: {what it contains, and which part of it carries the main risk, in two sentences}.

## Supported versions

| Version | Supported |
| --- | --- |
| {Latest release, or the latest commit on `main`} | Yes |
| Anything else | No |

{One sentence on who maintains it and what that means for fixes.}

## Reporting a vulnerability

Use GitHub's [private vulnerability reporting](https://github.com/monte3l/{repo}/security/advisories/new) for this repository.

> [!IMPORTANT]
> Do not open a public issue for a suspected vulnerability.

Include the affected version, the steps to reproduce and the impact you think it has. You should get an acknowledgment within 7 days, and you will hear back before a fix ships.

## Response process

1. **Acknowledge** the report within 7 days.
2. **Triage.** Reproduce it, and decide its severity and scope.
3. **Fix privately** in a security advisory's temporary private fork. A confirmed vulnerability of medium or higher severity is fixed within 60 days of confirmation, and a critical one as fast as a review allows.
4. **Request a CVE** through the advisory when the issue warrants one.
5. **Publish** the advisory once the fix is released, crediting the reporter unless they ask not to be.

## What you can and cannot expect

**What this project guarantees.** {The properties a reader can rely on, each one checked by something in CI.}

**What it does not guarantee.** {What is out of scope, so a reader does not assume it.}

## Dependency and code-scanning findings

Dependency Review fails a pull request that adds a dependency with a high or critical known vulnerability or a license outside the allow-list. CodeQL fails it on a new alert of error severity or critical or high security severity. Gitleaks scans for secrets.

## Accepted OpenSSF Scorecard findings

Background, not policy: this explains the Scorecard results for anyone who looks them up. `scorecard.yml` runs weekly and surfaces its findings as Code Scanning alerts. A new repository gets several on its first run (Maintained, Fuzzing and others it cannot satisfy yet). One that is dismissed instead of fixed is listed here with the reason, and the dismissal cites this section. Do not turn a dismissed finding into a standing bypass.

| Check | Score | Why it stays |
| --- | --- | --- |
| None yet | | |
