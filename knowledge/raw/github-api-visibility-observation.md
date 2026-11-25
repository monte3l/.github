---
url: https://docs.github.com/en/rest/repos/repos#get-a-repository
accessed: 2026-11-19
---

# What a read-only caller is shown

**Source:** https://docs.github.com/en/rest/repos/repos#get-a-repository · **Kind:** observation · **Accessed:** 2026-11-19

## What it says

- On 2026-11-19, `GET /repos/monte3l/m3l-design` with no token returned `allow_auto_merge`, `allow_merge_commit`, `allow_rebase_merge`, `allow_squash_merge` and `delete_branch_on_merge` as null. With an admin token they were present, including the `false` values.
- `GET` on a ruleset with no token left out `bypass_actors`. With an admin token it was an empty list.
- A local run of the baseline as the read-only `monte3l-audit` App, on the same day, reported exactly three drift items on every repository: `repository settings`, `ruleset: main` and `ruleset: tags`. An admin token found none.

## Caveats

- What the installation token is shown for each field was not measured directly. The match is between the no-token view, the App-token drift list and the fix that cleared it.
- The documentation page was not re-read for the rule that withholds these fields.

**Re-read:** 2026-11-25 — the "Get a repository" page does not say that admin or push access withholds these fields. It says "To view merge-related settings, you must have the contents:read and contents:write permissions", which is a token permission. That is a documented reason a token without it would not be shown them, and it was not tested here. The observation above is unchanged.
