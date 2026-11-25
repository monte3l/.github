---
url: https://docs.github.com/en/rest/orgs/custom-properties
accessed: 2026-11-25
---

# Custom properties on the Free plan: what the API answered

**Source:** https://docs.github.com/en/rest/orgs/custom-properties · **Kind:** observation · **Accessed:** 2026-11-25

## What it says

All calls were made by a person's admin token (scope `admin:org`) against the `monte3l` organization, which is on the Free plan.

- 2026-11-24: `GET /orgs/monte3l/properties/schema` returned 200 and an empty list.
- 2026-11-25: `PUT /orgs/monte3l/properties/schema/zz-plan-probe` with `value_type=string` and `required=false` returned **200 OK** and the new definition (`source_type` organization, `values_editable_by` org_actors).
- 2026-11-25: `DELETE` of the same property returned 204, and the schema listing was `[]` again. Nothing was left behind.

## Caveats

- Only the definition endpoint was tried. Setting a value on a repository (`PATCH /orgs/{org}/properties/values`) and reading values were not tried.
- The Copilot suggestions feature needs a Copilot plan, per [the guide](github-custom-properties-guide.md). It was not tried.
- The result is for the plan the organization was on that day. GitHub's pages state no plan rule, so a later change would not show in the docs.
