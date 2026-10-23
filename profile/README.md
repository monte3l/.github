# monte3l

Open-source tooling for TypeScript projects and Claude Code.

| Project | What it is |
| --- | --- |
| [m3l-groundwork](https://github.com/monte3l/m3l-groundwork) | A CLI that sets up a TypeScript project with a strict toolchain and Claude Code, or surveys an existing one read-only, plus a /customize skill that tailors it to current guidance. Docs at [groundwork.monte3l.com](https://groundwork.monte3l.com). |
| [m3l-prompt-optimizer](https://github.com/monte3l/m3l-prompt-optimizer) | A Claude Code plugin that refines the prompts you type using Anthropic's prompt-engineering guidance, and passes clear prompts through unchanged. Docs at [prompt-optimizer.monte3l.com](https://prompt-optimizer.monte3l.com). |
| [m3l-output-governor](https://github.com/monte3l/m3l-output-governor) | A Claude Code plugin that measures where your output tokens go and records which levers cut them, such as effort and the built-in Concise output style. Docs at [output-governor.monte3l.com](https://output-governor.monte3l.com). |
| [m3l-plugins](https://github.com/monte3l/m3l-plugins) | A Claude Code plugin marketplace with one catalogue for every plugin the organization publishes, each pinned to a release. Docs at [plugins.monte3l.com](https://plugins.monte3l.com). |
| [m3l-design](https://github.com/monte3l/m3l-design) | The monte3l design system, with tokens, components and contrast tables, copied into every monte3l repository. Docs at [design.monte3l.com](https://design.monte3l.com). |
| [.github](https://github.com/monte3l/.github) | The organization defaults for monte3l, with community health files, issue and pull request templates, workflow templates and a repository settings blueprint. Docs at [monte3l.com](https://monte3l.com). |

## Quickstart

Bootstrap a TypeScript project with a strict toolchain and a Claude Code setup:

```bash
npx @monte3l/groundwork my-app
```

Add the organization's plugin marketplace to Claude Code, then refine the
prompts you type and measure where its output tokens go:

```text
/plugin marketplace add monte3l/m3l-plugins
/plugin install m3l-prompt-optimizer@monte3l
/plugin install m3l-output-governor@monte3l
```

Each project's README says what it needs and what to do next.

## Starting a new repository

New repositories start from the [blueprint](https://github.com/monte3l/.github/tree/main/blueprint)
in this organization's `.github` repository. It covers the settings GitHub
never inherits: rulesets, merge settings, Actions policy, security features
and labels. It also holds a
[README skeleton](https://github.com/monte3l/.github/blob/main/blueprint/files/README.md)
that every repository's README follows.

## Design system

Every repository follows **m3l-design**, the organization's design system.
Markdown-only repositories adopt its writing rules. Repositories with a visual
surface also copy its styles. The standard is in the
[blueprint](https://github.com/monte3l/.github/tree/main/blueprint#design-system).
