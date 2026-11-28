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
| Direction not yet committed | `ROADMAP.md`, Next 12 months, or a Discussion in Ideas. A members-only idea may be a draft item in the org Project | None |
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
| **Unverified** | Claims it relies on but has not checked: a table of claim, source and date, or a link to a ledger file (for example `UNVERIFIED.md`) that holds each claim, its result and when it was last looked at. Do not copy a ledger into the roadmap |
| **What this project will not do** | What a reader might expect and should not, with the reason |

The file starts with `reviewed: YYYY-MM-DD` in its frontmatter. Set it when you
re-read the file and found it true, and re-read it at each release. **Never
change it to clear a report.** The docs kit's page-freshness report (m3l-design
1.5.0 and later) flags a page that has gone 180 days without a commit or a newer
`reviewed:` date, and a ROADMAP is a docs page like any other. A repository
gets that report with its design re-sync, so until it has synced, the release
re-read is the only check. Keep the heading `Next 12 months`: the OpenSSF Best
Practices answer for a roadmap links to it.

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

The org Project **monte3l planning** is the organization's hub. It is private,
so only members see it, and it exists so that nobody has to open each repository
to know what is going on. It shows, for every repository:

| Shows | How it gets there |
| ----- | ----------------- |
| Issues and pull requests, bots included | Added by the hourly sync |
| Milestones | The built-in Milestone field, and markers on the Roadmap view |
| Ideas | Open discussions in the **Ideas** category, mirrored as draft items with **Kind** = Idea discussion. A member may also write a draft straight into the Project for an idea that is not for the public |
| Releases | Stable releases of the last 30 days, mirrored as draft items with **Kind** = Release. Pre-releases and drafts are left out |
| Roadmaps | Each repository's `ROADMAP.md`, linked from the Project README. The Roadmap view plots Start date and Target date |

A Project can hold only issues, pull requests and draft issues. Discussions,
milestones and releases cannot be items, which is why the last three rows are
fields, drafts and links. A mirror is read-only in spirit: the discussion or the
release stays the source, and the draft carries its link in **Source**.

The issue forms add a new issue to the Project through `projects:`, but GitHub
does that only when the person filing the issue can write to the Project. A
report from outside the org is created and left off the board, and the Project's
one built-in auto-add rule covers a single repository on the Free plan. The sync
(`project-sync.yml`) runs hourly and fills in what both miss. It adds and
updates, and never removes or archives an item.

| Field | Source |
| ----- | ------ |
| Status | The Project's own field: Backlog, Todo, In progress, In review, Done, Not planned, Duplicate. GitHub's issue statuses (public preview) use the same names and follow it when the names match |
| Type | The issue type |
| Priority, Effort, Start date, Target date | Org issue fields, shown on the issue and in the Project |
| Kind, Source | Project fields the sync sets on a mirrored draft |

The views are listed in `blueprint/project.json`, which `bin/project-config.mjs`
checks against the live Project:

| View | Answers |
| ---- | ------- |
| My work | What is assigned to me |
| Review requests | Pull requests waiting on me |
| In flight | What is under way, by Status |
| Triage | Issues with no Priority |
| Pull requests | Every open pull request, by repository |
| Ideas | Mirrored discussions and members' drafts |
| Roadmap | What ships when, by Start date and Target date |
| Recently changed | What was closed, merged or released in the last 30 days |
| All open | Everything not Done, by repository |

Closed and merged items are archived after 30 days without an update, so
**Recently changed** is the last 30 days and the Project does not fill up.

## Discussions

Questions, support requests and ideas are Discussions in `monte3l/.github`: the
**Q&A** and **Ideas** categories. GitHub's guidance is that Discussions suit open
questions and early ideas, and issues suit work someone will do. Convert a
Discussion to an issue once someone commits to it. The org Project mirrors the
open **Ideas** discussions, so members see them next to the work.

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
| Issue fields | Organization settings, Planning, Issue fields | Priority, Effort, Start date and Target date, which every organization starts with. Make a field public if outsiders should see it |
| Project | Organization, Projects | **monte3l planning**, private, linked to every repository. Run `bin/project-config.mjs` to see what differs from `blueprint/project.json`, and `--apply` to set the title, README, Status options, fields and views. It never deletes anything |
| Project, by hand | The Project's own settings | What the API cannot set, printed by `bin/project-config.mjs` as `SKIP` lines: each view's grouping, sort, slice and roadmap dates, and the built-in workflows (Item added to Backlog, Item closed and Pull request merged to Done, auto-archive after 30 days, auto-add of sub-issues) |
| Discussions | Organization settings, Discussions | Source repository `monte3l/.github`, with Q&A and Ideas |
| Sync App | Organization settings, GitHub Apps | `monte3l-planning`, no webhook. Organization permission **Projects**: read and write. Repository permissions **Issues**, **Pull requests**, **Discussions**, **Contents** and **Metadata**: read. After adding a permission, accept it on the organization's installation |
| Sync environment | `monte3l/.github`, Settings, Environments | `project-backfill`, deployment branches limited to `main`, with the secrets `PLANNING_APP_CLIENT_ID` and `PLANNING_APP_PRIVATE_KEY`. The name is from the job's first version and is kept so no secret has to move |
| Project number | `monte3l/.github`, Settings, Variables | `PLANNING_PROJECT_NUMBER`, the number in the Project's address. The number does not change when the Project is renamed |

The sync is `.github/workflows/project-sync.yml`, which runs `bin/project-sync.mjs`.
It runs hourly and by hand, and by hand it only counts unless `dry_run` is turned
off. Its log and summary carry counts only, because this repository is public.
