# monte3l/.github

Organization-wide defaults for `monte3l` repositories. GitHub reads this
repository for anything a repository does not define for itself.

| Path                                          | What it does                                                                                     |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `CODE_OF_CONDUCT.md`, `CONTRIBUTING.md`, `SECURITY.md`, `SUPPORT.md` | Default community health files, shown on any repository without its own copy |
| `.github/ISSUE_TEMPLATE/`, `.github/pull_request_template.md` | Default issue forms and pull request template. Blank issues are off                |
| `profile/README.md`                           | The organization's profile page                                                                  |
| `workflow-templates/`                         | Workflows offered under **Actions, New workflow** in every repository: dependency review, Gitleaks, Scorecard, and a guarded `@claude` mention workflow |
| `blueprint/`, `bin/apply-repo-baseline.sh`    | Ruleset and settings data for new repositories, and the script that applies it. See [`blueprint/README.md`](blueprint/README.md) |

## What GitHub does not inherit

`LICENSE`, `CODEOWNERS` and `dependabot.yml` are never defaults: each
repository keeps its own. Rulesets, Actions policy, security settings and
labels are not files at all, which is why `blueprint/` exists. Details in
GitHub's docs on
[default community health files](https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/creating-a-default-community-health-file).

## Changing a default

Edit the file on a branch and open a pull request. A change here reaches every
repository that relies on the default as soon as it merges, so keep edits
small and say in the pull request which repositories are affected.

## License

MIT, see [`LICENSE`](LICENSE).
