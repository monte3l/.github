---
reviewed: 2026-11-20
---

# Roadmap

What this repository intends to do, and not do, over roughly the next year. It lists what is still ahead. What has shipped is in the git history. Work that can be closed is a GitHub issue, linked from here. What stays true until something changes is written here, so it survives outside any one tool. The rule for which goes where is [Tracking work](blueprint/tracking.md).

## Now

- **Keep the standard current.** The scheduled checks report and a person decides: `freshness.yml` (pinned tools, upstream policies, the knowledge wiki, stale workflow copies), `org-audit.yml`, `template-sync.yml` and `project-backfill.yml`. A finding never blocks a merge.
- **Bring every repository to the tracking policy.** The baseline items `roadmap`, `roadmap: sections`, `decision records` and `issue forms: org defaults` say what is left.

## Next 12 months

- **Prove the Project backfill adds an issue.** Tracked in [#118](https://github.com/monte3l/.github/issues/118). The scheduled run on 2026-11-23 added two issues, so the add step is proven. Still unshown is a run from outside the org.
- **Put the Claude Code sandbox behind the managed settings.** The console policy matches Bash command text, so it does not stop `bash -c '...'` or an absolute path, and it is a client-side control on a machine without admin rights. The sandbox is the planned follow-up that closes both gaps. See [Claude Code managed settings](blueprint/README.md#claude-code-managed-settings). There is no date, and no issue until someone commits to it.
- **Open "Docs pages need review" from the docs kit's freshness report.** The report is in m3l-design 1.5.0 and reaches a repository with its design re-sync. The weekly `docs-freshness` job in the docs workflow templates is built and turns it into an issue, and it ran on 2026-11-23. Its issue open and close path has never met a stale page. Until it does, the release re-read in [Tracking work](blueprint/tracking.md#the-roadmap-file) is the only check on a ROADMAP.

## Known limits

- **The script cannot set what needs an organization owner.** That is secrets, GitHub App installations, code scanning default setup, and organization policy (default repository permission, secret visibility, allowed actions). See [Not covered](blueprint/README.md#not-covered).
- **The weekly checks publish counts only.** This repository is public, so per-repository drift is never in an issue, a summary, a log or an artifact. The detail needs a local run of `bin/org-audit.sh`.
- **Scorecard's check list can change under a stable name.** A check's behaviour can change without its name or risk level changing, which the upstream watcher cannot see. See [Pinned tools and upstream policies](knowledge/wiki/pin-and-policy-freshness.md).
- **Eight harness hardening items are deferred by owner decision.** None is breakage. They are listed with the reason each was deferred in `docs/research/harness-refresh.md`, under "Deferred".
- **A custom copy of a workflow is never refreshed.** The template sync updates only a copy that strictly matches an older template version, so one that was changed on purpose is left alone and is not reported as stale. See [Keeping copied workflows current](knowledge/wiki/template-sync-options.md).

## Unverified

Each wiki page under `knowledge/wiki/` ends with what it could not verify, with the date it was last reviewed, and the harness tracker keeps its own list. The open ones that matter:

- **Whether org custom properties are available on the Free plan.** Tracked in [#119](https://github.com/monte3l/.github/issues/119). See [The weekly org audit](knowledge/wiki/org-audit-decisions.md).
- **The watchers' issue-creating path.** The pin and upstream watchers have only run in dry-run, because everything has been current. Tracked in [#156](https://github.com/monte3l/.github/issues/156). `freshness.yml` has no recorded run on GitHub at all. See [Pinned tools and upstream policies](knowledge/wiki/pin-and-policy-freshness.md).
- **The project backfill from outside the org.** Tracked in [#118](https://github.com/monte3l/.github/issues/118). The add step itself ran on 2026-11-23 and added two issues.
- **Whether any provider reads `llms.txt`.** None is confirmed. See [LLM wiki, llms.txt and RAG](knowledge/wiki/llm-wiki-and-llms-txt.md).
- **How the sync config file behaves outside what its source says.** It was read from the action's source and not run. See [Keeping copied workflows current](knowledge/wiki/template-sync-options.md).
- **Whether the `if` pre-filter on git commands matches `env git commit`, and whether NotebookEdit input uses `notebook_path`.** Both are noted as unverified in `docs/research/harness-refresh.md`.

## What this project will not do

- **Block a merge on a finding.** A scheduled finding is a report, and a person decides. Never bump a `reviewed` date to clear one.
- **Publish per-repository drift.** Which repository lacks which protection tells an outsider where to aim, so the public output is counts.
- **Apply what GitHub never inherits on a repository's behalf.** `LICENSE`, `CODEOWNERS` and `dependabot.yml` stay each repository's own. The script reports a missing one and never writes it.
- **Take a live dependency on m3l-design.** The design system is copied from a published release, on purpose.
- **Put anything private in the knowledge wiki.** The repository is public.
