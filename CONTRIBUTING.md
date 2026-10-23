# Contributing

This is the default contributing guide for repositories in the `monte3l`
organization. A repository with its own `CONTRIBUTING.md` overrides it, so
read that one first if it exists.

## Before you start

- **Open an issue first** for anything beyond a small fix, so the direction
  is agreed before you spend time on it.
- Some repositories accept pull requests from collaborators only. If you
  can't open a pull request, the issue is the contribution: a maintainer
  will pick it up.
- Report a suspected security vulnerability privately. See
  [`SECURITY.md`](SECURITY.md). Never in a public issue.

## Commits

| Rule                                                 | Why                                                  |
| ---------------------------------------------------- | ---------------------------------------------------- |
| [Conventional Commits](https://www.conventionalcommits.org) | The changelog and version bump come from the message |
| `Signed-off-by:` trailer (`git commit -s`)           | Developer Certificate of Origin: you may submit this |
| GPG- or SSH-signed (`commit.gpgsign true`)           | Protected branches reject unsigned commits           |

If a commit fails to sign, fix the signing key. Do not turn signing off: the
commit would only be rejected later, at merge time.

## Pull requests

1. Branch off the default branch as `feat/<slug>` or `fix/<slug>`.
2. Run the repository's full check (usually `pnpm verify`) before pushing.
3. Fill in the pull request template. A docs, design-sync or
   dependency-or-release change has its own: add `?template=docs.md`,
   `design-sync.md` or `dependencies-release.md` to the pull request URL.
   Add tests for new behaviour and a regression test for a fix.
4. Resolve every review thread. A pull request merges when its required
   checks pass and its threads are resolved.

## Design

Anything visual, and the markdown in every repository, follows
**m3l-design**, the organization's design system. A repository records which
version it follows in `design/README.md`. How to adopt it is in the
[blueprint](https://github.com/monte3l/.github/tree/main/blueprint#design-system).

## Conduct

Everyone taking part is bound by the
[Code of Conduct](CODE_OF_CONDUCT.md).
