# Harness refresh tracker

<!-- harness-refresh: last-verified=2026-10-22 claude-code-version=2.1.308 -->

Living record of `harness-guidance` (refresh mode) sweeps — the per-facet,
per-source state a run diffs against, so each sweep reports what
**changed** since the last one instead of rediscovering the whole `.claude/`
surface from scratch. Updated **in place** on every run, never as a new
dated file.

First sweep: 2026-10-20, run from `/customize` (cli, Node, standard CI). Coverage note: the changelog was read back to 2.1.295 only (that entry is cut off in the page; 2.1.297, 2.1.298 and 2.1.303 are absent from the file), and the settings, hooks and skills reference pages were read to roughly their first 100k to 200k characters. Off-allowlist domains (`claude.dev`, `agentskills.io`) were rejected, not fetched. Sources are on `code.claude.com/docs/en/`, `platform.claude.com`, `anthropic.com` and the `anthropics` GitHub org.

Second sweep: 2026-10-22, run from `/customize` (m3l-groundwork 1.1.0 re-run, same interview answers). Changelog delta 2.1.305 to 2.1.308 read; none of it touches this repo's hooks, skills or agent. The settings, hooks and sub-agents pages were again read only to roughly their first 100k characters (the hooks page is about 273k), so the hooks section "Block the action when a hook fails" and the tail of the sub-agents page are unread.

## Outstanding drift

Applied on 2026-10-22:

- `.claude/settings.json`: the five `enabledPlugins` entries on `@anthropic-plugin-directory` (context7, skill-creator, github, claude-md-management, security-guidance) now use `@claude-plugins-official`. On this machine the org's `strictKnownMarketplaces` blocks the built-in Anthropic Directory, so those five failed to load (`claude plugin list`), and `claude-plugins-official` is the docs' own official name. Each exists in that marketplace. Collaborators still run `claude plugin install <name>@claude-plugins-official --scope project` once, and project-scope plugins wait for workspace trust.

Applied on 2026-10-20:

- `.claude/hooks/require-signoff.sh` now matches `git` global options (`git -C dir commit`, `git -c k=v commit`, `env`/`command` prefixes), checks `-s` only inside the commit's own command, and still blocks commits when `jq` is missing (it reads the command with `perl` instead).
- `.claude/agents/template-invariants-reviewer.md` gained `disallowedTools: Write, Edit, NotebookEdit, Agent` and `maxTurns: 40`, so its read-only guarantee no longer rests on prose alone.

Deferred (owner decision, none is breakage):

| Item | Why deferred | Where |
| --- | --- | --- |
| `onFailure: "block"` on the three Bash PreToolUse guards | A broken guard would then block every Bash call; `guard-git-push-signed.mjs` and `guard-double-background.mjs` also swallow parse errors with exit 0, which `onFailure` does not change | `.claude/settings.json` |
| `disable-model-invocation: true` on `creating-prs`, `writing-commits`, `finishing-work`, `reviewing-dependabot-prs` | Docs' own side-effect skills set it, but natural-language triggers ("commit this") would stop working | `.claude/skills/*/SKILL.md` |
| NotebookEdit in the Write/Edit guards | The repo has no notebooks. NotebookEdit input uses `notebook_path` (the guards read `file_path`), so the scripts would need changing as well | `.claude/settings.json`, `.claude/hooks/guard-*.mjs` |
| `"if": "Bash(git commit*)"` pre-filter | Best-effort only; the script regex stays authoritative | `.claude/settings.json` |
| `Edit(./.env*)`, `Edit(./secrets/**)` deny rules and `sandbox.enabled` | A `Read` deny already blocks Edit and Write on the same path (v2.1.228+); only NotebookEdit is uncovered, so an `Edit` deny gains little. `Read` deny is best-effort for Grep/Glob and does not cover scripts or `grep -r`; only the sandbox enforces at OS level, and it is off by default. If enabled, add `failIfUnavailable: true` and `allowUnsandboxedCommands: false`. Never put `sandbox.allowNestedUserNamespaces` (2.1.305) in the project file: it opens a hole in the file protections and the docs say a repository cannot turn it on | `.claude/settings.json` |
| Bash `PreToolUse` hook (or `permissions.deny`) to enforce the reviewer's "read-only commands only" | `disallowedTools` cannot limit single commands, so that limit is prose only. Dropping Bash would break its `git diff` and `jq` steps | `.claude/agents/template-invariants-reviewer.md` |
| Move "Blueprint script internals" and "Docs site" into a path-scoped `.claude/rules/*.md` | `CLAUDE.md` is 80+ lines, under the 200-line target | `CLAUDE.md` |
| Sonnet 5.5 for the reviewer | Eval-driven only; no official page names an effort level for read-only review | `.claude/agents/template-invariants-reviewer.md` |

Notes:

- `statusline.mjs` may hardcode Sonnet 5.5 cache-read pricing, which changed in 2.1.296. Not read in either sweep.
- Sonnet 5.5's default effort still differs between the Claude Code model-config page (`medium`) and the platform effort and models pages (`high`). No repo file depends on it. The sub-agents page does not say what an omitted `effort` defaults to.
- `claude-sonnet-4-5-20250929` retires 2026-11-30, `claude-haiku-4-5-20251001` not before 2026-10-15 and `claude-opus-4-5-20251101` not before 2026-11-24. No repo file pins any 4.x ID.
- The NotebookEdit guard row stands, but whether NotebookEdit's `tool_input` uses `notebook_path` is unverified: log a real payload before changing the matcher, because a guard that reads an empty `file_path` fails open.
- `"if"` takes exactly one permission rule and only runs on tool events. `Bash(git commit*)` would miss `git -C x commit` and `env git commit`, which `require-signoff.sh` catches, so a broader pattern is needed if it is ever added.
- Optional tidy-ups, none required: `effort: medium` is Opus 5.5's default, and the `Write, Edit, NotebookEdit, Agent` entries in `disallowedTools` are redundant with the `tools` allowlist. Several skill descriptions are imperative where the platform guidance prefers third person.
- `.claude/skills/customize/SKILL.md` is 287 lines (limit 500). After a compaction an invoked skill keeps only its first 5,000 tokens.
- `/doctor prompt-audit` (2.1.283+) and `/skill-doctor` (2.1.252+) can check `CLAUDE.md`, rules and skill costs. Not run.

## Facet state

| Facet                        | Last verified | Notes |
| ---------------------------- | ------------- | ----- |
| `models-tiering`             | 2026-10-22    | `claude-opus-5-5` / `effort: medium` valid and current. Retirement not before: opus-5-5 2027-09-22, sonnet-5-5 2027-09-28, haiku-5-5 2027-10-07, fable-5-1 2027-09-01 (the older 5.0 IDs are earlier, from 2027-06-09). At least 60 days' notice |
| `cc-features-settings`       | 2026-10-22    | `$schema`, `statusLine` (`padding`, `refreshInterval`), `subagentStatusLine`, permission syntax and `permissions.deny` current. The plugin marketplace id drift is applied (see above). 33 hook events; `settings.local.json` is auto-excluded from git on first write and is ignored in `.gitignore` here |
| `agent-subagent-design`      | 2026-10-22    | One read-only reviewer; every frontmatter field is documented; forks skip tool filters, so the read-only guarantee holds only when invoked by name |
| `skills-context-engineering` | 2026-10-22    | Descriptions under the 1,024 cap and the 1,536 listing cap; bodies under 500 lines (`customize` longest at 287); `CLAUDE.md` 82 lines against the 200-line target |
| `hooks-lifecycle`            | 2026-10-22    | Exit-2 contract and `onFailure: "block"` (2.1.295) confirmed; 33 hook events; handler fields, timeouts and payload fields match the scripts |
