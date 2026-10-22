# Customization report

Run by `/customize` on 2026-10-22, adopt mode, against m3l-groundwork 1.1.0 (inventory schema 6). This is the second run: the first was on 2026-10-20 against 1.0.5. The earlier report is in git history.

## Summary

| Item | Result |
| --- | --- |
| Interview | cli, Node, verify stays a hard gate, standard CI, no baseline agents kept. Every answer matches the first run |
| What the deep read found | Still not a TypeScript project, so the staged toolchain stays out. The harness from 2026-10-20 is intact. Groundwork 1.1.0 only adds the `frontend` and `service` packs, an npm Dependabot block and plugin-map changes, none of which fit |
| Round 1 | No installs: no additions, no conflict changes, no packs. No plugin enabled |
| Round 2 | `harness-guidance` sweep: 1 finding applied, the earlier deferrals stand. `typescript-guidance` skipped (not installed, no TS domain) |
| Grade | Staged `check-harness.mjs`: 53 wiring checks pass, rubric 100% over 30 checks, `claude plugin validate` clean |
| Tracker | `docs/research/harness-refresh.md`: `last-verified=2026-10-22`, `claude-code-version=2.1.308` |

## Conflicts resolved

All 13 kept as they were, repeating the 2026-10-20 resolutions: `.claude/settings.json`, `CLAUDE.md`, `README.md`, `.github/dependabot.yml`, `.github/workflows/dependency-review.yml`, `.gitignore`, `.claude/hooks/guard-protected-paths.mjs`, the skills `creating-prs`, `finishing-work`, `harness-guidance`, `triaging-ci` and `writing-commits`, and the tracker. The CLI stages only absent files, so there was no newer upstream copy to merge for these.

## Packs

| Pack | Result |
| --- | --- |
| `github`, `statusline` | Already installed, unchanged |
| `harness-extras`, `claude-github`, `supply-chain`, `quality`, `worktrees` | Declined again. `supply-chain`'s workflows already exist here |
| `frontend`, `service` | New in 1.1.0. Not offered as a fit: this repo builds no UI and serves no API |
| `licensing`, `publishing` | Fresh-only; not installed |

## Round 2 findings

Applied:

- `.claude/settings.json`: the five `enabledPlugins` entries on `@anthropic-plugin-directory` (context7, skill-creator, github, claude-md-management, security-guidance) now use `@claude-plugins-official`. On this machine the org's `strictKnownMarketplaces` blocks the built-in Anthropic Directory, so those five failed to load. That is very likely the "1 load error" the first report left uninvestigated. `claude-plugins-official` is the docs' own name, and each plugin exists there.

Where the findings disagreed with what Rounds 0 and 1 shipped:

- The first tracker called `@anthropic-plugin-directory` built in and usable. On this machine it is built in but blocked by organization policy.
- A `Read` deny already blocks Edit and Write on the same path (v2.1.228+), so the `Edit(./.env*)` deny rule deferred last time would only add NotebookEdit coverage.
- The reviewer's "read-only commands only" limit on Bash is prose. `disallowedTools` cannot limit single commands, and forks skip tool filters, so the guarantee holds only when it is invoked by name.

Deferred (recorded in the tracker): `onFailure: "block"` on the three Bash guards, `disable-model-invocation` on four side-effect skills, NotebookEdit in the Write/Edit guards (its `tool_input` shape is unverified), the `if` pre-filter, the sandbox and `Edit` deny rules, a path-scoped rules file, a Bash hook for the reviewer, and Sonnet 5.5 for the reviewer.

## README re-derived (requested during the run)

`README.md` was compared with the org's "README structure" standard in `blueprint/README.md`, its skeleton `blueprint/files/README.md`, and the other five repositories' READMEs. Changes:

- Added **How it works**, from the old "Scope and principle" and placed before the reference sections. It now also names the three delivery routes and the docs site.
- Added **Requirements** (`gh`, `jq`, Node 24, shellcheck and Docker) and linked it from Quickstart.
- Linked monte3l.com in the opening paragraph.
- **Working on this repo** now lists the `docs-kit --check` step that CI runs, with a comment per command, and points to `CONTRIBUTING.md`.
- **Project docs** now names `SECURITY.md` and `blueprint/docs-site.md`. License is one line, as in the skeleton.
- Workflow templates "Offered" list and the Parity table now cover `commit-lint`, `dco`, `docs`, `docs-live`, `environments`, `labeler`, `release` and `verify`, plus a row for this repository's own docs site, labeler and environments files.
- No Versioning policy section: `blueprint/release.json` exempts this repository from releases.

`node design/source/docs-kit/build.mjs --check` passes. Not done: the **Repository status** table is a dated snapshot (2026-10-19, five repositories, no `m3l-plugins`). Refreshing it needs a read-only `bin/apply-repo-baseline.sh` run against each repository.

## Needs a human read

- `.claude/skills/finishing-work/SKILL.md` and `.claude/skills/harness-guidance/SKILL.md`: unchanged from the first run (mechanically retargeted and verbatim). The latter still says "the 5 agents" and "the 10 hooks".
- `.claude/skills/customize/`: replaced from the 1.1.0 copy in `.groundwork/customize/`. Four files changed (`SKILL.md`, `step-3-round-1.md`, `pack-map.ts`, `plugin-map.ts`); the other three were identical. Check it before committing.
- The gate retargeted last time was not re-run this time because nothing was retargeted. Still not exercised: the block path of `guard-git-push-signed.mjs` and the statusline scripts beyond an empty payload.

## Assumed, not answered

None. Every interview question was answered.

## Skipped

`guard-readonly-bash` was never in scope: `harness-extras` was declined and no baseline agents are installed. `typescript-guidance` is not installed and this repo has no TypeScript domain, so its sweep did not run.

## Plugins

| Plugin | State |
| --- | --- |
| `context7`, `skill-creator`, `github`, `claude-md-management`, `security-guidance` | Renamed from `@anthropic-plugin-directory` to `@claude-plugins-official` (Round 2) |
| `claude-security@claude-plugins-official` | Already enabled, unchanged |
| `typescript-lsp`, `agent-sdk-dev`, `mcp-server-dev`, `claude-code-setup` | Offered again and declined |

Follow-ups, once per machine (and for each collaborator):

```bash
for p in context7 skill-creator github claude-md-management security-guidance claude-security; do
  claude plugin install "$p@claude-plugins-official" --scope project
done
```

`claude-security` needs Python 3.9+ on `PATH`. `claude plugin list` still shows stale `@anthropic-plugin-directory` installs from earlier sessions; they no longer match anything in `.claude/settings.json` and can be uninstalled.

## Before you commit

- Changed files: `.claude/settings.json`, `.claude/skills/customize/` (four files), `README.md`, `docs/research/harness-refresh.md`, `.groundwork/adoption-report.md` and this file. Nothing is staged or committed.
- `.gitignore` already tracks only the two reports and ignores the rest of `.groundwork/`, so no change was needed there. A teammate's clone holds the two reports but no inventory.
- Commits need `git commit -s` and a signature (`require-signoff.sh` enforces the first). Suggested split: `fix(claude)` for the plugin ids and the `/customize` copy, `docs` for the README.
