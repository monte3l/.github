Thank you for improving the docs. Choose this template with `?template=docs.md` on the pull request URL.

## What and why

<!-- Which page changes, and what was wrong, unclear or missing? -->

## Checklist

- [ ] The docs gate passes (the docs kit's `build.mjs --check`), or the repository's full check does
- [ ] The markdown follows the m3l-design rules: bold, never italics or underlines; an alert matched to its severity, never more than two in a row; tables for tabular data
- [ ] The spelling is UK in the Oxford style: organization and standardize, but colour, behaviour and catalogue
- [ ] Links and anchors work in the rendered page
- [ ] Every commit is signed off (`git commit -s`) and signed
- [ ] The title is a Conventional Commit. Use `docs:`, except for a file that ships in a release, such as m3l-design's `source/`: `docs:` is never released, so that is `fix(docs):`
