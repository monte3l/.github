---
url: https://github.com/actions/dependency-review-action
accessed: 2026-11-19
---

# dependency-review-action: the config file

**Source:** https://github.com/actions/dependency-review-action · **Kind:** primary · **Accessed:** 2026-11-19

## What it says

- The action takes a `config-file` input: a path in the repository (`./.github/dependency-review-config.yml`) or `OWNER/REPO/FILE@BRANCH`.
- The config schema accepts `allow_dependencies_licenses`, an array of package URLs (`src/schemas.ts`). The parser turns hyphens in the file's keys into underscores (`parseConfigFile` in `src/config.ts`), so both spellings work, and the README's own config-file example uses hyphens. So the per-repository package allow-list can live in a file instead of the workflow.
- The file's values and the workflow's inputs are merged as `{...externalConfig, ...inlineConfig}` (`src/config.ts`), so an input set in the workflow overrides the same key in the file.

## Caveats

- Read from the action's source on 2026-11-19 by the author and again by a second reader. It was not run. A list value may also be a comma-separated string.

**Re-read:** 2026-11-19 at the commit pinned in `workflow-templates/dependency-review.yml` (`a1d282b`). `readConfigFile` throws "Unable to fetch or parse config file" when the file cannot be read, so a workflow that sets `config-file` needs the file in every repository. `parseConfigFile` calls `Object.keys` on the parsed YAML, so an empty or comment-only file throws too. The inline values are filtered for `undefined` before the merge, so a key the workflow does not set never hides the file's value.
