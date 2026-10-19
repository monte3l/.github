# monte3l

Open-source tooling for TypeScript projects and Claude Code.

| Project                                                     | What it is                                                                                                                                      |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| [m3l-groundwork](https://github.com/monte3l/m3l-groundwork) | A CLI that bootstraps a TypeScript project with a strict toolchain and Claude Code setup, or read-only surveys an existing one. Its `/customize` plugin then tailors the result to current guidance. Docs at [groundwork.monte3l.com](https://groundwork.monte3l.com). |
| [m3l-prompt-optimizer](https://github.com/monte3l/m3l-prompt-optimizer) | A Claude Code plugin that refines the prompts you type using Anthropic's prompt-engineering guidance. Clear prompts pass through unchanged. Docs at [prompt-optimizer.monte3l.com](https://prompt-optimizer.monte3l.com). |
| [m3l-output-governor](https://github.com/monte3l/m3l-output-governor) | Measures where Claude Code's output tokens go and records which levers cut them: effort and the built-in Concise output style. |
| [m3l-design](https://github.com/monte3l/m3l-design)         | The design system: tokens, components and contrast tables, copied into every monte3l repository. |
| [.github](https://github.com/monte3l/.github)               | Organization defaults: community health files, issue and pull request templates, workflow templates, and a repository settings blueprint.        |

## Starting a new repository

New repositories start from the [blueprint](https://github.com/monte3l/.github/tree/main/blueprint)
in this organization's `.github` repository. It covers the settings GitHub
never inherits: rulesets, merge settings, Actions policy, security features
and labels.

## Design system

Every repository follows **m3l-design**, the organization's design system.
Markdown-only repositories adopt its writing rules. Repositories with a visual
surface also copy its styles. The standard is in the
[blueprint](https://github.com/monte3l/.github/tree/main/blueprint#design-system).
