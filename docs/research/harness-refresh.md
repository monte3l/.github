# Harness refresh tracker

<!-- harness-refresh: last-verified=2026-10-20 claude-code-version=2.1.304 -->

Living record of `harness-guidance` (refresh mode) sweeps — the per-facet,
per-source state a run diffs against, so each sweep reports what
**changed** since the last one instead of rediscovering the whole `.claude/`
surface from scratch. Updated **in place** on every run, never as a new
dated file.

First sweep: 2026-10-20, run from `/customize` (cli, Node, standard CI). Coverage note: the changelog was read back to 2.1.295 only (that entry is cut off in the page; 2.1.297, 2.1.298 and 2.1.303 are absent from the file), and the settings, hooks and skills reference pages were read to roughly their first 100k to 200k characters. Off-allowlist domains (`claude.dev`, `agentskills.io`) were rejected, not fetched. Sources are on `code.claude.com/docs/en/`, `platform.claude.com`, `anthropic.com` and the `anthropics` GitHub org.

## Outstanding drift

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
| `Edit(./.env*)`, `Edit(./secrets/**)` deny rules and `sandbox.enabled` | `Read` deny is best-effort for Grep/Glob and does not cover scripts or `grep -r`; only the sandbox enforces at OS level | `.claude/settings.json` |
| Move "Blueprint script internals" and "Docs site" into a path-scoped `.claude/rules/*.md` | `CLAUDE.md` is 80+ lines, under the 200-line target | `CLAUDE.md` |
| Sonnet 5.5 for the reviewer | Eval-driven only; no official page names an effort level for read-only review | `.claude/agents/template-invariants-reviewer.md` |

Notes:

- Six `enabledPlugins` entries use `@anthropic-plugin-directory`. That name is not in the docs' list of official marketplace names, but `claude plugin marketplace list` shows it as built in on this machine. A project-scope entry does not install the plugin for collaborators until they run the install command.
- `statusline.mjs` may hardcode Sonnet 5.5 cache-read pricing, which changed in 2.1.296. Not read in this sweep.
- Sonnet 5.5's default effort differs between the Claude Code model-config page (`medium`) and the platform effort page (`high`). No repo file depends on it.
- `claude-sonnet-4-5-20250929` retires 2026-11-30. No repo file pins it.

## Facet state

| Facet                        | Last verified | Notes |
| ---------------------------- | ------------- | ----- |
| `models-tiering`             | 2026-10-20    | `claude-opus-5-5` / `effort: medium` valid and current; Claude 5 IDs active, retirement not before 2027-09 |
| `cc-features-settings`       | 2026-10-20    | `$schema`, `statusLine`, wildcard permission syntax and `permissions.deny` all current; see the deferred hardening rows |
| `agent-subagent-design`      | 2026-10-20    | One read-only reviewer; hardened with `disallowedTools` and `maxTurns`; forks skip tool filters (2.1.302) |
| `skills-context-engineering` | 2026-10-20    | All descriptions 255-781 characters, well under the 1,024 and 1,536 caps; body sizes under 500 lines |
| `hooks-lifecycle`            | 2026-10-20    | Exit-2 contract and `onFailure: "block"` (2.1.295) confirmed; 33 hook events; `require-signoff.sh` gaps fixed |
