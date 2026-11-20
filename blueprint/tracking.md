# Tracking work

Where a `monte3l` project records what it knows, what it does not, what is wrong
and what comes next. One rule decides it: **a statement that stays true until
something changes lives in a file in the repository. Work that can be finished
is an issue.** Files travel with the code and survive outside any one tool.
Issues can be assigned, closed and counted.

## Where each kind of item goes

| Item | Place | Tool |
| ---- | ----- | ---- |
| Bug | Issue | Type **Bug**, from the bug form |
| Committed new work | Issue, in a milestone or the org Project. `ROADMAP.md` links it under Now or Next 12 months | Type **Feature** or **Task** |
| Direction not yet committed | `ROADMAP.md`, Next 12 months, or a Discussion in Ideas | None |
| Gap, drift or inconsistency | Issue. The scheduled checks open theirs the same way | Type **Gap** |
| Tech debt or a deprecation | Issue with a target milestone | Type **Debt** |
| Known limit that is accepted | `ROADMAP.md`, Known limits. Link an issue if a fix is planned | None |
| Unverified claim | `ROADMAP.md`, Unverified: the claim, its source and a date | Type **Verify** issue when someone intends to check it |
| Non-goal | `ROADMAP.md`, What this project will not do | None |
| Decision | `docs/decisions/`, one record each | MADR, minimal form |
| Question, support request or idea | Discussions in `monte3l/.github` | Convert to an issue once someone commits |
| Vulnerability | Private report, then a security advisory | Never an issue: see [SECURITY.md](../SECURITY.md) |

> [!WARNING]
> Never put a suspected vulnerability, a credential or a private detail in an
> issue, a Discussion or a roadmap line. All of them are public. GitHub's own
> guidance is to publish a security policy and to discuss and fix a
> vulnerability privately in a repository security advisory.

## Issue types

The org defines six types. An issue has one. The issue forms set the first three,
and the person who triages sets the rest.

| Type | Use it for |
| ---- | ---------- |
| **Bug** | Something is broken, or behaves differently from what the docs say |
| **Feature** | A new capability, or a committed change to what the project does |
| **Task** | Other actionable work that is neither a defect nor a new capability |
| **Gap** | Drift or inconsistency between the docs, the code and the standard |
| **Debt** | A known shortcut to pay down, or a feature scheduled for removal |
| **Verify** | A claim someone intends to check before it can be relied on |

`blueprint/issue-types.json` records them. Nothing applies it, because issue
types belong to the organization and a rename there must change the three forms
in the same commit.

Labels say **where**, types say **what**. The four `area:*` labels from
`blueprint/labels.json` stay. The `freshness` label marks a finding that a
scheduled check opened, whatever its type, and its org-wide search is how the
count is published. Priority and the target date are issue fields, not labels.

## The roadmap file

Each repository has one `ROADMAP.md`, in the root or in `docs/`. It has these
sections, in this order. A heading may carry a qualifier after the name, such as
`## Now: the 1.x series`.

| Section | What it holds |
| ------- | ------------- |
| **Now** | What is under way or released next, each item linked to its issue or milestone |
| **Next 12 months** | What the project means to do, and what would change the plan |
| **Known limits** | What it does not do, or does only partly, and has chosen to accept |
| **Unverified** | Claims it relies on but has not checked, as a table of claim, source and date |
| **What this project will not do** | What a reader might expect and should not, with the reason |

The file starts with `reviewed: YYYY-MM-DD` in its frontmatter. Set it when you
re-read the file and found it true. **Never change it to clear a report.** The
docs kit reports a page that has gone 180 days without a commit or a newer
`reviewed:` date, and a ROADMAP is a docs page like any other. Keep the heading
`Next 12 months`: the OpenSSF Best Practices answer for a roadmap links to it.

A limit says what it is, who it affects and what would change it. An unverified
claim names who said it and when. Neither is an issue until someone means to act.

## Decisions

A decision that shaped the project is one file in `docs/decisions/`, numbered in
the order it was made, in the minimal form of
[MADR](https://adr.github.io/madr/): context, options, decision, consequences.
An accepted record is not edited. A later one that replaces it says so, and the
old record links forward. `monte3l/.github` keeps its decisions as pages of the
`knowledge/` wiki, which count as its records.

## Milestones and the org Project

A **milestone** is a repository's release or a dated target. Use one when work
is bound to a release, and not otherwise.

The org Project **monte3l roadmap** is the one cross-repository view: a table, a
board by Status and a roadmap by target date. It shows issues from every
repository. Use it for work that spans repositories or needs a priority. A
repository's own issue list is enough for the rest.

The issue forms add a new issue to the Project through `projects:`, but GitHub
does that only when the person filing the issue can write to the Project. A
report from outside the org is created and left off the board. A scheduled job
adds what the forms miss, and the Project's one built-in auto-add rule covers a
single repository on the Free plan, so the job is required, not optional.

| Field | Source |
| ----- | ------ |
| Status | The Project's own field, with the default automations on |
| Type | The issue type |
| Priority, Target date | Org issue fields, shown on the issue and in the Project |

## Discussions

Questions, support requests and ideas are Discussions in `monte3l/.github`: the
**Q&A** and **Ideas** categories. GitHub's guidance is that Discussions suit open
questions and early ideas, and issues suit work someone will do. Convert a
Discussion to an issue once someone commits to it.

## What the baseline reports

These items only report. A missing one is a commit in the repository, and none
of them blocks a merge. They are in [Repository standard](README.md#repository-standard).

| Reported as | Meaning |
| ----------- | ------- |
| `roadmap` | The repository has `ROADMAP.md` or `docs/ROADMAP.md` |
| `roadmap: sections` | It has the five sections in order and a valid `reviewed:` date |
| `issue forms: org defaults` | The repository has no `.github/ISSUE_TEMPLATE/` of its own |
| `decision records` | It has `docs/decisions/README.md`, or `knowledge/README.md` for `.github` |

A repository with its own `ISSUE_TEMPLATE/` receives none of the org forms, not
even the ones it has no copy of. That is why the baseline reports it. A
repository that truly needs an extra form must carry the whole org set and keep
it equal by hand, and it says why in its README.

## A new repository

`bin/new-repo.sh` starts a repository with `ROADMAP.md` and `docs/decisions/`
from `blueprint/files/`, with the repository name and today's date filled in. A
person then writes the sections.

## One-time setup (an Owner)

The org settings are not applied by a script, because they belong to the
organization. They are done once.

| Step | Where | Notes |
| ---- | ----- | ----- |
| Issue types | Organization settings, Planning, Issue types | The six above. Check that no issue uses a type before you delete it |
| Issue fields | Organization settings, Planning, Issue fields | Priority and Target date. Make a field public if outsiders should see it |
| Project | Organization, Projects | **monte3l roadmap**, linked to every repository, with Table, Board and Roadmap views. Add the Priority and Target date issue fields in the Project's field settings |
| Discussions | Organization settings, Discussions | Source repository `monte3l/.github`, with Q&A and Ideas |
| Backfill App | Organization settings, GitHub Apps | `monte3l-planning`, no webhook. Organization permission **Projects**: read and write. Repository permissions **Issues** and **Metadata**: read |
| Backfill environment | `monte3l/.github`, Settings, Environments | `project-backfill`, deployment branches limited to `main`, with the secrets `PLANNING_APP_CLIENT_ID` and `PLANNING_APP_PRIVATE_KEY` |
| Project number | `monte3l/.github`, Settings, Variables | `PLANNING_PROJECT_NUMBER`, the number in the Project's address |

The backfill is `.github/workflows/project-backfill.yml`. It runs weekly and by
hand, and by hand it only counts unless `dry_run` is turned off. Its log and
summary carry counts only, because this repository is public.
