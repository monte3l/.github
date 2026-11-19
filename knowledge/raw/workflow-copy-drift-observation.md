---
url: https://github.com/monte3l/.github/blob/main/bin/template-sync.mjs
accessed: 2026-11-19
---

# How far the workflow copies have drifted from their templates

**Source:** https://github.com/monte3l/.github/blob/main/bin/template-sync.mjs · **Kind:** observation · **Accessed:** 2026-11-19

## What it says

- Measured on 2026-11-19 across the six consumer repositories and the 15 workflow templates: 76 copies exist.
- Compared byte for byte (with `$default-branch` filled in), 23 were identical, 13 equalled an older template version and 40 matched none.
- Rendered for each repository and compared the way the tool does (a lenient comparison for "nothing to do", a strict one for "stale"), the 67 copies of the 12 managed templates split into 23 identical, 25 equivalent, 5 stale and 14 custom. The other 9 copies, all custom, are of the unmanaged `release` and `verify`.
- The 8 copies that looked stale by bytes (4 of `commit-lint`, 4 of `gitleaks`) differ from their template only in comments, which a template edit on the same day had touched, so they are equivalent and nothing needs refreshing. The 5 stale copies are all `workflow-lint`: the template's tool versions were bumped and those repositories never received the bump.
- The 14 custom managed copies are: 6 `dependency-review` (a per-repository package allow-list sits in the workflow), 3 `docs-live`, 1 `docs`, 1 `environments`, 2 `gitleaks` and 1 `workflow-lint`.
- The apparent customisation was mostly data in the workflow and one documented variant. Five of the six `docs` copies differ only in the site URL, and `m3l-design`'s differs because it builds from `source/docs-kit` and not `design/source/docs-kit`. Five repositories run `check-live.mjs --metadata` in `docs-live`, which the template tells adopters to do when `docs.config.mjs` has a manifest; the template's optional block matches 3 of them, and `m3l-groundwork` and `m3l-prompt-optimizer` put it in the same command, so theirs stay custom.
- The two custom `gitleaks` copies differ from the template only in the order of the keys under `env:`. `m3l-groundwork`'s `workflow-lint` is custom because it carries its own header comment, which the strict comparison counts.
- Two diffs first thought to be real were cosmetic: three `scorecard` copies lack a header comment and have a longer comment on one line, and `m3l-groundwork` carries its own copyright header.

## Caveats

- Taken by the tool that the decisions here are built on, at one moment: the counts change as templates and repositories change.
- Whether a copy equals an older template version depends on `git log --follow` finding the template's history. A copy made from a version before the template existed in this repository counts as custom.
- The lenient comparison ignores every line that starts with `#`, including a shell comment, a heredoc heading or a JavaScript private field inside a `run:` or `script:` block. That can make two different copies look equivalent, which only ever means nothing happens. It must never decide that a copy is stale, and an early version of the tool did: a copy with a step commented out on purpose was called stale. Stale is now a strict match in which comments count, and a test pins it.
