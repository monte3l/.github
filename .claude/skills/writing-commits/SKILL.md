---
name: writing-commits
description: >-
  Inspect the staged diff, pick the Conventional Commit type and scope, draft an
  imperative subject of at most 70 chars, decide whether a body is needed, add
  Co-Authored-By when AI-assisted, then commit with a DCO sign-off (`git commit
  -s`). Use for "commit this", "write a commit", "stage and commit".
---

# writing-commits

Every commit in this repo is Conventional Commits, carries a `Signed-off-by:`
line and is cryptographically signed. The `main` ruleset requires signed
commits and the `DCO sign-off` check fails the PR without the trailer, so a
commit missing either only costs a round trip later.

## Checklist

- [ ] Read `git diff --staged`; understand every changed file
- [ ] Pick the type and scope from the tables below
- [ ] Subject: imperative, lowercase after `type(scope):`, at most 70 chars, no
      trailing period
- [ ] Body when the why is not obvious from the diff; omit for mechanical changes
- [ ] `Co-Authored-By:` footer when Claude authored the commit
- [ ] Commit with `git commit -s` (never `--no-gpg-sign`, never `-c commit.gpgsign=false`)

## Step 1: Understand the change

```bash
git diff --staged
git log main..HEAD --oneline
```

The staged diff is the source of truth; the log keeps subjects from repeating
across a branch.

## Step 2: Pick the type and scope

| Type | Use when |
| --- | --- |
| `feat` | New or changed behavior that other repos or the site see: a blueprint setting, a workflow template, a community-file default |
| `fix` | A defect in a script, template, blueprint file or the docs site |
| `ci` | This repo's own `.github/workflows/` only |
| `docs` | Prose only: README, CONTRIBUTING, `blueprint/*.md`, CLAUDE.md |
| `chore` | Dependency bumps, `.claude/` harness, vendored design re-syncs, formatting |
| `refactor` | Restructuring with no behavior change |

Scopes seen in this repo's history: `blueprint`, `deps`, `design`. Add one only
when it names the area a reader would otherwise have to guess. A `feat!`/`fix!`
needs a `BREAKING CHANGE:` footer: changing a blueprint file or a live
community-file default reaches every org repo at once, so say so.

## Step 3: Subject and body

The subject names the change, not the files: `feat(blueprint): require the DCO
sign-off check on main`. A body is worth writing when the change alters what
other repositories inherit, when a job or ruleset name changes (renaming one
silently breaks merges in adopting repos), or when the reason is not visible in
the diff. Skip it for a dependency bump, a re-sync or a one-line CI tweak.

```
<1-2 sentences: what changed and why>

- <a constraint or decision the diff does not show>

Co-Authored-By: <exact model name from your environment> <noreply@anthropic.com>
```

Use the exact model name from the environment, never one copied from an
example. `Co-Authored-By:` is the only Claude trailer allowed: never add a
`Claude-Session:` or any other `Claude-*` line.

## Step 4: Commit

```bash
git commit -s -F - <<'EOF'
<type>(<scope>): <subject>

<body>
EOF
```

`-s` adds the `Signed-off-by:` trailer from `user.name`/`user.email`, which must
match the commit's author or committer email or the `DCO sign-off` job rejects
it. Signing comes from the repo's `commit.gpgsign` setting; if it fails, fix the
key rather than turning it off. `.claude/hooks/require-signoff.sh` blocks a
`git commit` without `-s` before it runs.
