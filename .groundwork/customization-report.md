# Customization report

Run by `/customize` on 2026-10-20, adopt mode, against m3l-groundwork 1.0.5 (inventory schema 6).

## Summary

| Item | Result |
| --- | --- |
| Interview | cli, Node, verify stays a hard gate, standard CI, no baseline agents kept |
| What the deep read found | Not a TypeScript project, so the staged TS/pnpm toolchain was not installed |
| Round 1 | 4 guard hooks, 5 baseline skills (4 tailored, 1 retargeted), the `github` and `statusline` packs, a `.gitignore`, `docs.config.mjs` excludes, merged `.claude/settings.json`, new `CLAUDE.md` section |
| Round 2 | `harness-guidance` sweep: 2 findings applied, 7 deferred. `typescript-guidance` skipped (not installed, no TS domain) |
| Grade | `check-harness.mjs`: 53 wiring checks pass, rubric 100% over 30 checks, `claude plugin validate` clean |
| Tracker | `docs/research/harness-refresh.md`: `last-verified=2026-10-20`, `claude-code-version=2.1.304` |

## Conflicts resolved

| File | Resolution |
| --- | --- |
| `.claude/settings.json` | Merged: `$schema`, `permissions.deny`, `timeout` on both hooks, four guards, `statusLine`, `subagentStatusLine`, `claude-security` plugin |
| `CLAUDE.md` | Kept; added a "Claude Code harness" section naming each `.claude/` file |
| `README.md`, `.github/dependabot.yml`, `.github/workflows/dependency-review.yml` | Kept. Taking the baseline would drop the `/workflow-templates` and deploy-tools entries and the `@img/sharp-*` license exemptions |

## Packs

| Pack | Result |
| --- | --- |
| `github` | Installed: `reviewing-dependabot-prs`, `triaging-scan-alerts`, `watching-pr-checks`. No hooks or gate. CodeQL is a required check, so scan alerts exist for `triaging-scan-alerts` |
| `statusline` | Installed: three scripts and both settings keys. Neither key was set in the project, `settings.local.json` or the user settings |
| `harness-extras`, `claude-github`, `supply-chain`, `quality`, `worktrees` | Declined or not offered (reasons in `adoption-decisions.json`) |
| `licensing`, `publishing` | Fresh-only; not installed |

## Round 2 findings

Applied:

- `.claude/hooks/require-signoff.sh`: verified bypasses (`git -C . commit`, `git -c k=v commit`, `env X=1 git commit`, a `-s` from a later command) now block, and a missing `jq` no longer lets commits through. Tested with 22 cases, with and without `jq`.
- `.claude/agents/template-invariants-reviewer.md`: `disallowedTools: Write, Edit, NotebookEdit, Agent` and `maxTurns: 40`.

Where the findings disagreed with what Rounds 0 and 1 shipped:

- The baseline `writing-commits` commits with plain `git commit -m`, which this repo's own sign-off hook blocks. It was rewritten to `git commit -s`.
- The baseline `creating-prs` arms auto-merge; this repo sets `allow_auto_merge: false`. Removed.
- The baseline `triaging-ci` maps failures to `node bin/verify.mjs`, which does not exist here. Remapped to this repo's jobs.
- `guard-protected-paths` protected `dist/` and `coverage/`; repointed at `design/source/**`, `design/tokens.css`, `design/SHA256SUMS` and `_site/`.
- The docs say a hook that fails to start lets the action through unless `onFailure: "block"` is set. The two Write/Edit guards have it; the three Bash hooks do not (deferred).

Deferred (recorded in the tracker's outstanding drift): `onFailure: "block"` on the Bash guards, `disable-model-invocation` on four side-effect skills, NotebookEdit coverage, an `if` pre-filter, `Edit(./.env*)` deny rules and the sandbox, a path-scoped rules file, and Sonnet 5.5 for the reviewer.

## Needs a human read

- `.claude/skills/finishing-work/SKILL.md`: mechanically retargeted only; it mentions journals and spokes the repo does not have, which is harmless.
- `.claude/skills/harness-guidance/SKILL.md`: copied verbatim. Its refresh table still says "the 5 agents" and "the 10 hooks"; this repo has 1 agent and 6 hook registrations. `references/official-sources.md` keeps its upstream text by design.
- `.claude/skills/watching-pr-checks/SKILL.md`, `.claude/skills/reviewing-dependabot-prs/SKILL.md`, `.claude/skills/triaging-scan-alerts/SKILL.md`: installed as shipped by the `github` pack.
- Retargeted gates were run once against the real files: `build.mjs --check`, `bash -n` + shellcheck, `jq empty`, actionlint, `reuse lint`, `node --check` on every new `.mjs`, and a block and an allow payload for each guard. Not exercised: the block path of `guard-git-push-signed.mjs` (it needs an unsigned outgoing commit), and the statusline scripts beyond an empty payload.

## Assumed, not answered

None. Every interview question was answered.

## Skipped

`guard-readonly-bash` was never in scope: `harness-extras` was declined, and no baseline agents were installed.

## Plugins

| Plugin | State |
| --- | --- |
| `claude-security@claude-plugins-official` | Newly enabled in `.claude/settings.json` |
| `context7`, `skill-creator`, `github`, `claude-md-management`, `security-guidance` (all `@anthropic-plugin-directory`) | Already enabled, left unchanged |
| `claude-code-setup` | Was enabled; removed from `.claude/settings.json` by you after this run |
| `typescript-lsp`, `agent-sdk-dev`, `mcp-server-dev` | Offered and declined |

Follow-ups you still have to run, once per machine:

```bash
claude plugin install claude-security@claude-plugins-official --scope project
```

`claude-security` needs Python 3.9+ on `PATH`. The six older entries use `@anthropic-plugin-directory`, which is built in here but is not in the docs' list of official marketplace names, so a collaborator may need to install them by hand too.

## Before you commit

- `git add -N` was used on `docs/research/harness-refresh.md` and `.groundwork/adoption-report.md` so the docs check could see them. Nothing is staged beyond that and nothing is committed.
- `.gitignore` tracks only `.groundwork/adoption-report.md` and this file; `docs.config.mjs` excludes `.groundwork/**` and `docs/research/**` from the docs site, so commit the two together with those files.
- Commits need `git commit -s` and a signature (`require-signoff.sh` enforces the first).
- `/reload-plugins` reported 1 load error during this session. It was not investigated; run `/plugin` to see it.
