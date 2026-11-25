---
url: https://docs.github.com/en/rest/orgs/custom-properties
accessed: 2026-11-25
---

# REST API: organization custom properties

**Source:** https://docs.github.com/en/rest/orgs/custom-properties · **Kind:** primary · **Accessed:** 2026-11-25

## What it says

- To define or update properties (`PATCH /orgs/{org}/properties/schema`), the caller must be an organization administrator, or a user (or a user on a team) with the fine-grained permission `custom_properties_org_definitions_manager`.
- The page contains no plan-availability statement.

## Caveats

- Read through a fetch tool that summarizes the page, so the wording above is a paraphrase of the tool's answer.
- The page did not list a token scope or GitHub App permission for the endpoint.
- The probe used `PUT /orgs/{org}/properties/schema/{name}` (one property), which the summary did not cover. See [the observation](github-custom-properties-observation.md).
