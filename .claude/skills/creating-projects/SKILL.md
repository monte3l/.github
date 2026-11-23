---
name: creating-projects
description: >-
  Set up a new monte3l project end to end: register it in this repo, create the
  GitHub repository from the org blueprint with bin/new-repo.sh, then prepare the
  developer's machine (clone, signing check, worktree, worktree guard). Use only
  for /creating-projects NAME. Creates a repository and changes org settings, so
  it asks before every step that mutates anything.
disable-model-invocation: true
argument-hint: NAME
---

# creating-projects

Takes a project name to a repository that follows the org blueprint on GitHub and
a ready checkout on this machine. The remote half is `bin/new-repo.sh`; this
skill adds what surrounds it: the registration it requires, the preflight that
saves a failed run, the follow-up pull requests and the local half.

Run it from a worktree of this repository (`monte3l/.github`), because the
registration is a pull request here. The shared checkout is read-only by rule:
`guard-shared-checkout.mjs` blocks edits there, so `EnterWorktree` first.

## Rules

- **Confirm each mutating step on its own.** Registering, creating the
  repository, cloning and editing the workspace file each get their own yes. An
  answer to one never covers the next, because the steps change different things
  and some cannot be undone (a created repository, organization secrets shared).
- **Show the plan before `--apply`.** `new-repo.sh` without `--apply` renders
  everything and creates nothing. The user decides from that output, not from
  your summary of it.
- **Never weaken signing or sign-off.** The `main` ruleset rejects unsigned
  commits, so turning `commit.gpgsign` off only moves the failure to merge time.
  Fix the key instead.
- **Every commit is `git commit -s`** (DCO sign-off) and signed. When a step
  says "commit", write the command out with `-s`, even when `/writing-commits`
  does it: the DCO check fails a commit without the trailer, and the ruleset
  needs the signature.
- **Never invent project content.** The description, ROADMAP sections and
  placeholders are the owner's words. Ask, and write what they say.
- **This repository is public.** Put no per-repository detail in an issue,
  PR comment or log here beyond the registration itself.
- **Never merge a pull request yourself.** `gh pr merge` asks, and the user
  merges.

## Phase 0: Inputs and preflight (read-only)

Take NAME from the argument; if it is missing, ask. Then collect, asking only
for what is not already clear:

| Input | Values | Notes |
| --- | --- | --- |
| kind | `library`, `plugin`, `simple` (from `.kinds` in `blueprint/bootstrap.json`) | Without one, the release items report drift |
| `--claude` | yes/no | Adds `claude.yml`, which needs a secret |
| `--private` | yes/no | On the Free plan the ruleset and two other items cannot exist, and the baseline prints SKIP for them. That is not drift |
| `--docs` or `--scaffold` | at most one | The script refuses both together. Ask about `--scaffold` whenever the project is TypeScript: it runs the pinned `@monte3l/groundwork` CLI, and a plan shown without it is a plan for a different repository. Say this before showing any plan, not after |
| site, card, description, topics | text | Go in `blueprint/projects.json`; the wording rules are in `blueprint/README.md`, "Descriptions" |

Then check, and stop at the first failure with the fix command:

1. `gh auth status` lists `repo`, `workflow` and `admin:org` scopes
   (`gh auth refresh -s <scope>`).
2. `git config commit.gpgsign` is `true`, a signing key is set and `user.email`
   is set.
3. `node --version` matches `.node-version`; `jq` exists. For `--docs` also
   `npm` and gh 2.81 or later (`gh release verify --help`).
4. `gh api repos/monte3l/NAME` answers 404. If the repository exists, stop:
   `new-repo.sh` only creates. Offer `bin/apply-repo-baseline.sh monte3l/NAME`
   (read-only) to see how far it is from the baseline, and `/org-drift` for the
   whole org.

## Phase 1: Register the project (pull request, merges first)

`new-repo.sh` refuses a name that is not in `blueprint/projects.json`, and reads
it from the checkout, so the registration lands on `main` before the script runs.

1. Skip this phase if NAME is already in `projects.json` and in the profile
   table. Say so.
2. In a worktree off a freshly fetched `origin/main` (not the one you are in if
   it holds unrelated or untracked changes: leave those where they are), add the `projects.json` entry
   (`repo`, `site`, `card`, `description`, `topics`) and the row in
   `profile/README.md`: the description, a full stop, then the site link.
   Follow the entries already there for shape.
3. Validate: `jq . blueprint/projects.json`,
   `node design/source/docs-kit/build.mjs --check` (this runs the parity check
   that compares the two) and `node --test "tests/*.test.mjs"`.
4. Commit with `/writing-commits`, open the pull request with `/creating-prs`,
   and watch it with `/watching-pr-checks`.
5. Wait for the user to merge it. Then `/finishing-work`, so the next phase
   runs from a fresh `origin/main`.

## Phase 2: Create the remote repository

From a worktree on fresh `origin/main`:

1. Run `bin/new-repo.sh NAME [flags]` **without** `--apply`. Show the user the
   whole output: files, placeholders, the afterwards list, and any warning
   (signing, an existing DNS record for `--docs`, no kind, private).
2. Ask for explicit confirmation. The script changes organization settings (it
   adds the repository to four Apps and shares organization secrets), not only
   the new repository.
3. On a yes, run `bin/new-repo.sh NAME [flags] --apply --yes`. `--yes` is needed
   because there is no terminal to ask on; the user's answer here stands in for
   the prompt, and `.claude/settings.json` asks once more.
4. Read the exit code as the script defines it:

   | Exit | Meaning | What to do |
   | --- | --- | --- |
   | 0 | Done, check clean | Continue |
   | 1 | Done, with leftovers | Normal for a public repository (Scorecard alerts, REUSE and bestpractices.dev registration). List them, continue |
   | 2 | An input was refused, nothing created | Fix the input, run again |
   | 3 | A call failed, possibly after the repository exists | Relay the script's recovery block exactly. Never re-run `new-repo.sh --apply`: the repository now exists, so it would only exit 2. Offer the recovery commands one at a time, each with its own yes (`apply-repo-baseline.sh ... --apply` changes settings), then carry on to Phase 3 as step 5 describes |

5. Keep the script's "What is left for a person" list and the `syncEntry` line.
   Phases 3 to 5 use them. After an exit 3 the script never printed them, but
   `node bin/bootstrap-render.mjs NAME [same flags] --out <empty scratch dir>`
   prints the same `syncEntry`, `unfilled` and `todo` as JSON. It is offline and
   writes only to that directory, so it is safe to run. Do not stop at the
   failure and leave the rest undone: the repository exists and the registration
   follow-ups still apply.

## Phase 3: Sync entry (second, small pull request)

Add the `syncEntry` the script printed to `repos` in `blueprint/sync.json`.
Validate with `node design/source/docs-kit/build.mjs --check` (it runs
`sync-parity`), then commit and open the pull request as in Phase 1. The
registration could not carry it, because the repository did not exist yet.

## Phase 4: The developer's machine

Each step below is confirmed on its own.

1. **Clone** to `$M3L_ROOT/NAME`, or next to this repository's main checkout
   when `M3L_ROOT` is unset (the root `bin/wt.sh` uses; normally
   `~/workspaces/monte3l/NAME`):
   `gh repo clone monte3l/NAME <root>/NAME`.
2. **Check identity** in the clone: `git -C <root>/NAME config user.email` and
   `commit.gpgsign`. The clone inherits the global config. Warn if the email is
   not the one the user signs with. Never edit global git config unasked.
3. **Workspace file.** If `<root>/monte3l.code-workspace` has no folder for
   NAME, offer to add `{"path": "NAME"}`. It sits outside every repository, so
   ask first.
4. **First worktree**, never an edit in the new repo's main checkout:
   `bin/wt.sh NAME chore/first-setup`. It prints the path; work there.
5. **Leftovers in that worktree**, from the script's list:
   - Wire `.claude/hooks/guard-shared-checkout.mjs` into
     `.claude/settings.json`. Copy the two entries (a `Bash` one with
     `"if": "Bash(git *)"`, and one under `Write|Edit|NotebookEdit`) from
     `blueprint/README.md`, "Worktree guard". Until then the hook does nothing.
   - Fill the placeholders the script listed, and the five ROADMAP sections
     (`blueprint/tracking.md` says what each holds). Ask the user for the
     content.
   - After `--scaffold`, run `/customize`, and install dependencies.
6. Commit with `git commit -s` (via `/writing-commits`), push, and open the pull
   request with `/creating-prs`.

## Phase 5: Report

End with one table of what was done and what is left, so the user can see the
state at a glance:

| Step | State |
| --- | --- |
| Registered in `.github` | PR link, merged or open |
| Repository created | URL, exit code |
| Sync entry | PR link |
| Local clone, worktree, guard | path |

Then the leftovers for a person (REUSE and bestpractices.dev registration,
Scorecard alerts, any `MANUAL` lines, unmerged pull requests) and the closing
check, which is read-only:

```sh
bin/apply-repo-baseline.sh monte3l/NAME
```

Exit 1 there means drift; some is expected on day one, and the output says which
items. Do not run `--apply` on the baseline to clear it without asking: it
changes repository settings.
