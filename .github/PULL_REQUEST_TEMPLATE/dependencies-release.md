Thank you. Use this template for a dependency update or a release pull request, with `?template=dependencies-release.md` on the pull request URL.

## What it changes

<!-- A dependency: which one, from which version to which, and why now. A release: the version, and where the changelog came from. -->

## Checklist

- [ ] The repository's full check passes
- [ ] A dependency update: you read the release notes, and nothing in them affects this repository
- [ ] A release pull request: the version matches the commits since the last tag, and only the changelog, the version files and the manifest changed
- [ ] Every commit is signed off (`git commit -s`) and signed, and the title is a Conventional Commit
- [ ] A release pull request is merged with a merge commit, and only by an owner who means to publish
