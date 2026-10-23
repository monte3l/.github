Thank you for keeping the design copy current. Choose this template with `?template=design-sync.md` on the pull request URL.

## What was synced

- m3l-design version: `vX.Y.Z`
- <!-- The changelog entries that matter in this repository, if any. -->

## Checklist

- [ ] `design/` came from `bin/sync-design.sh vX.Y.Z <repo>`, not from hand edits, and the sync printed no warning
- [ ] `design/README.md` records the same version
- [ ] The docs gate (`design/source/docs-kit/build.mjs --check`) and `reuse lint` pass
- [ ] If the release adds or changes brand files, `REUSE.toml` and `LICENSES/` carry the brand licence
- [ ] The release is published. A re-sync of an unpublished version stays a draft
- [ ] Every commit is signed off (`git commit -s`) and signed, and the title is a Conventional Commit such as `chore(design): re-sync m3l-design vX.Y.Z`
