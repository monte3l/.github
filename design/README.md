# design/ -- m3l-design, vendored

This repository follows **m3l-design**, the shared design system for
everything published under the `monte3l` GitHub org.

- **Source:** [github.com/monte3l/m3l-design](https://github.com/monte3l/m3l-design)
- **Version copied:** `v1.1.0`
- **Last re-synced:** 2026-10-20
- **Tier:** vendored

## What "vendored tier" means here

This repository publishes the org docs site (monte3l.com), so it carries a
copy of the system: `source/`, `tokens.css` and `SHA256SUMS`, replaced
wholesale by `bin/sync-design.sh` from an m3l-design checkout. The docs kit in
`source/docs-kit/` builds the site, and its `--check` verifies the copy against
`SHA256SUMS`. Never hand-edit `source/`. Local divergence goes in `local/`,
which a sync never touches, and the kit holds it to `var(--token)` values only.

The markdown conventions apply as well:

| Rule | Why |
| --- | --- |
| **Bold**, not italics or underlines, for emphasis | Italics and underlines make text run together |
| A GitHub alert (`> [!NOTE]`, `[!WARNING]`, `[!CAUTION]`) for anything the reader must not miss | Each severity has its own glyph, so it survives without colour |
| Never stack more than two alerts, and never use `[!CAUTION]` for plain emphasis | The Callout component's own rule |
| Plain, direct sentences | Part of the system's voice |
| Tabular data goes in a table | Easier to scan than a list pretending to be one |

The one visual choice made here, the label colours in
`blueprint/labels.json`, uses the system's status primitives:
`color-blue-600` (`166eb9`) for `dependencies` and `color-red-600`
(`9e2d28`) for `security`.

## Governance

Copy-based, never a live dependency. The standard for every `monte3l`
repository, including the vendored tier for repositories with a visual
surface, is in [`blueprint/README.md`](../blueprint/README.md#design-system).
When the pinned version in `blueprint/design-system.json` changes, update
the version above in the same change.
