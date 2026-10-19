# Security Policy

This is the default security policy for repositories in the `monte3l`
organization. A repository with its own `SECURITY.md` overrides it.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting on the repository concerned:
open its **Security** tab, then **Report a vulnerability**.

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
