---
url: https://github.com/gitleaks/gitleaks
accessed: 2026-11-19
---

# gitleaks: how the config file is found

**Source:** https://github.com/gitleaks/gitleaks · **Kind:** primary · **Accessed:** 2026-11-19

## What it says

- The order of precedence is the `--config` flag, then the environment variable `GITLEAKS_CONFIG` (a path), then `GITLEAKS_CONFIG_TOML` (the file's content), then `(target path)/.gitleaks.toml`.
- A repository with `.gitleaks.toml` at the root of what is scanned needs no variable at all.

## Caveats

- Observed on 2026-11-19: `workflow-templates/gitleaks.yml` sets `GITLEAKS_CONFIG: .gitleaks.toml` itself, since 2026-10-19, and all six copies set it. Each of those repositories has the file at the root, so the line changes nothing for any of them.
- The two `gitleaks` copies that the template sync calls custom set the same variable. They differ only in the order of the keys under `env:`, which the comparison treats as a person's change to be safe.
