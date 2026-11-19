---
reviewed: 2026-11-19
sources:
  - raw/github-template-repositories.md
  - raw/copier-updating.md
  - raw/github-actions-sha-pinning-policy.md
  - raw/github-reusable-workflow-check-names.md
---

# Bootstrapping and keeping repositories in sync: options

**Status:** Research. Nothing here is decided or built. · **Reviewed:** 2026-11-19

New repositories are set up from a checklist, and files copied from the workflow templates never receive later changes. This page records what is known about the options before any is chosen.

## The problem

GitHub copies files and branches from a [template repository](../raw/github-template-repositories.md), and the page says nothing about settings, rulesets, secrets or labels, so those have to be applied separately, which the baseline script does. The copied branches have unrelated histories, so a later change to the template cannot be merged into them. A copied workflow is therefore a one-time copy.

## The options

| Option | After creation | Notes |
| --- | --- | --- |
| Reusable workflows, called from thin copies | A pin bump updates every repository | The [SHA-pinning policy](../raw/github-actions-sha-pinning-policy.md) does not cover reusable workflows, so a tag is allowed. A SHA is still the safest ref |
| Copier | `copier update` brings a project to a newer template version | [Documented](../raw/copier-updating.md) with an answers file and conflict handling. Actively maintained. Not evaluated against the TypeScript scaffolder |
| A pull-request job like the design re-sync | One signed bot pull request per repository | Already works for `design/`. Needs a rule for files a repository has customised |

## The risk that decides the scope

A job that comes from a reusable workflow is [named `caller / called`](../raw/github-reusable-workflow-check-names.md) in the check runs, for example `Prepare / Release PR and draft`. The main ruleset requires six checks by their exact names, so converting a required workflow would change its context and could block every merge until the ruleset is changed. That points to converting only the workflows that are not required checks, and keeping the required ones as copies that a sync job refreshes.

## Open questions

- Whether the SHA-pinning policy covers a reusable workflow referenced by SHA was not checked.
- Whether Copier suits the scaffolder, or a pull-request sync job is enough.
- Which copied files a repository is allowed to customise, and how a sync job tells a customised copy from a stale one.
