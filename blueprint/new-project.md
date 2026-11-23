# Starting a new project

A new `monte3l` project takes two pull requests in this repository, one script
run that creates the GitHub repository, and a local checkout. This page is the
whole path, with the commands, in the order they run. The script's own options
and the order of its steps are in [New repository](README.md#new-repository).

In Claude Code, `/creating-projects NAME` walks the same steps and asks before
each one that changes something. Everything below can be done without it.

> [!NOTE]
> The order matters. The script reads the project's description, topics and site
> from `blueprint/projects.json` in the checkout it runs from, so the registration
> must be merged to `main` **before** the repository is created.

## The path at a glance

In this page, **the monorepo root** is `~/workspaces/monte3l` (or `$M3L_ROOT`),
the folder that holds every project's main checkout, and **a worktree of
`.github`** is a folder made with `git worktree add` or `EnterWorktree` from
`~/workspaces/monte3l/.github`. Commands that name a path start from the folder
the step says.

| Step | Run from | Changes | Who |
| --- | --- | --- | --- |
| 1. Decide and check | Any directory | Nothing | You |
| 2. Register the project | A new worktree of `.github` | `projects.json`, `profile/README.md` | You write and merge, checks run themselves |
| 3. Plan the repository | A worktree of `.github` on fresh `origin/main` | Nothing | The script, read-only |
| 4. Create the repository | The same worktree of `.github` | A repository, App installations, shared secrets, its settings | The script, after one confirmation |
| 5. Add the sync entry | A second new worktree of `.github` | `sync.json` | You write and merge |
| 6. Set up your machine | The monorepo root, `~/workspaces/monte3l` | A clone, a workspace entry, a worktree | You |
| 7. Finish the starters | The new repository's worktree | Placeholders, ROADMAP, hook wiring | You |
| 8. Check the result | Any worktree of `.github` | Nothing | The script, read-only |

## 1. Decide and check

Decide these before you start. They are the script's inputs.

| Input | Values | Notes |
| --- | --- | --- |
| Name | `m3l-` plus a short word | Must not exist yet |
| `--kind` | `library`, `plugin` or `simple` | Adds the release configuration. Without one the release items report drift |
| `--claude` | on or off | Adds `claude.yml`. The `ANTHROPIC_API_KEY` secret is not an organization secret, so you add it to the repository yourself |
| `--private` | on or off | On the Free plan the ruleset and two other items cannot exist, and the baseline prints `SKIP` for them. That is not drift |
| `--docs` or `--scaffold` | at most one | `--docs` adds a docs site. `--scaffold` runs the pinned `@monte3l/groundwork` CLI first, for a TypeScript project. The script refuses both together |
| Site, card line, description, topics | Text | The wording rules are in [Descriptions](README.md#descriptions) |

Then check your machine. **Run from:** any directory. Each command should succeed before you go on.

```sh
gh auth status                       # lists the repo, workflow and admin:org scopes
gh auth refresh -s admin:org         # only if a scope is missing (repeat with -s workflow, -s repo)

git config commit.gpgsign            # must print true
git config user.signingkey           # must print a key
git config user.email                # must be the address you sign with

node --version                       # must match the major version in .node-version
jq --version
gh api repos/monte3l/NAME            # must answer 404: the repository must not exist
```

`--docs` also needs `npm` and gh 2.81 or later (`gh release verify --help` must
work). You must be an organization owner, because the script changes
organization settings.

> [!WARNING]
> Never turn `commit.gpgsign` off to get past a failure. The `main` ruleset
> rejects unsigned commits, so that only moves the failure to merge time. Fix the
> signing key instead.

## 2. Register the project

The script refuses a name that is not in `blueprint/projects.json`, and the
profile page lists every project, so both change in one pull request.

**Run from:** the main checkout of `.github` for the first block, which only creates the worktree, and then from the new worktree
for everything else in this step. Never edit in the main checkout (a hook blocks edits there):

```sh
cd ~/workspaces/monte3l/.github
git fetch origin
git worktree add .claude/worktrees/register-NAME -b chore/register-NAME origin/main
cd .claude/worktrees/register-NAME
```

In Claude Code, use `EnterWorktree` instead.

Add an entry to `blueprint/projects.json`, following the ones already there:

```json
{"repo": "m3l-NAME", "site": "https://NAME.monte3l.com", "card": "…", "description": "…", "topics": ["…"]}
```

Add a row to the table in `profile/README.md`: the description, a full stop,
then the link to the site. The card line, description and topics have
[wording rules](README.md#descriptions) that `bin/doc-parity.mjs` enforces.

Validate, then commit with a sign-off and open the pull request. **Run from:** the worktree
`~/workspaces/monte3l/.github/.claude/worktrees/register-NAME`:

```sh
jq . blueprint/projects.json
node design/source/docs-kit/build.mjs --check       # runs the parity check that compares the two files
node --test "tests/*.test.mjs"                      # about a minute

git add blueprint/projects.json profile/README.md
git commit -s -m "chore(projects): register m3l-NAME"
git push -u origin chore/register-NAME
gh pr create --fill
gh pr checks --watch
```

`-s` adds the DCO sign-off, and your signing key signs the commit. Both are
required. Merge the pull request when the checks are green, then update the main checkout
(**run from:** `~/workspaces/monte3l/.github`, not the worktree):

```sh
cd ~/workspaces/monte3l/.github
git pull
```

Skip this step if the name is already in `projects.json` and in the profile
table.

## 3. Plan the repository

**Run from:** a worktree of `.github` on fresh `origin/main`, with the registration in it. You can create one
the way step 2 does, with a name such as `create-NAME`; the script locates `blueprint/` relative to its own file, so
it must be run as `bin/new-repo.sh` from that worktree. Run the script **without** `--apply`. It checks every input, renders every file into a
temporary directory and prints what it would do. It creates nothing.

```sh
bin/new-repo.sh m3l-NAME --kind plugin                       # add --claude, --private, --docs or --scaffold as decided
```

Read the whole output: the files, the placeholders, the list of what is left for
a person, and any warning (signing, an existing DNS record for `--docs`, no
kind, private). Decide from that output.

## 4. Create the repository

**Run from:** the same worktree as step 3.

> [!WARNING]
> `--apply` creates a repository and changes **organization** settings: it adds
> the repository to four Apps and shares organization secrets with it. It cannot
> be undone by re-running it.

```sh
bin/new-repo.sh m3l-NAME --kind plugin --apply               # same flags as the plan; asks once on a terminal
```

In a session with no terminal, add `--yes` after you have confirmed.

With `--apply`, in this order, the script:

1. Runs the scaffold, if you asked for it.
2. Renders the starters and workflow templates from `bootstrap.json`.
3. Makes one signed-off commit and creates the repository.
4. Adds the repository to the `monte3l-release`, `monte3l-env-janitor`,
   `monte3l-audit` and `monte3l-sync` Apps.
5. Shares the organization secrets with it, and turns on immutable releases when
   there is a kind.
6. Pushes `main`. The ruleset does not exist yet, so this is the one direct push
   the repository ever gets.
7. Sets the topics from `projects.json`.
8. Applies the baseline (settings, ruleset, labels).
9. Runs the baseline check and prints what is left for a person.

Keep the output. You need the **`syncEntry`** line and the list of what is left.

| Exit | Meaning | What to do |
| --- | --- | --- |
| 0 | Done, the check is clean | Continue |
| 1 | Done, with leftovers | Normal for a public repository: the Scorecard alerts and the reuse.software and bestpractices.dev registrations cannot be settled on day one. Continue |
| 2 | An input was refused, nothing was created | Fix the input and run again |
| 3 | A call failed | The message says how to finish by hand. **Do not run `--apply` again**: the repository exists, so it would only exit 2 |

After an exit 3 the script never printed the `syncEntry` and the list. This
prints them as JSON, offline, into a scratch directory (run from the same worktree):

```sh
node bin/bootstrap-render.mjs m3l-NAME --kind plugin --out "$(mktemp -d)"
```

To see how far a repository is from the baseline at any time, or to fix drift
after a failure (read the diff first, `--apply` changes settings), run from the same worktree:

```sh
bin/apply-repo-baseline.sh monte3l/m3l-NAME                  # read-only; exit 1 means drift
bin/apply-repo-baseline.sh monte3l/m3l-NAME --dry-run        # also prints each gh api call
bin/apply-repo-baseline.sh monte3l/m3l-NAME --apply          # changes the repository
```

## 5. Add the sync entry

The registration pull request could not carry this, because the repository did
not exist yet. **Run from:** a new worktree of `.github` off fresh `origin/main` (made like step 2, for example
`.claude/worktrees/sync-NAME`, branch `chore/sync-NAME`), not the step 2 worktree. Add the `syncEntry` the
script printed to `repos` in `blueprint/sync.json`. It says which flags the
repository uses and where its starters live when they differ from the default.

```sh
node design/source/docs-kit/build.mjs --check              # runs sync-parity
git add blueprint/sync.json
git commit -s -m "chore(sync): add m3l-NAME"
git push -u origin chore/sync-NAME
gh pr create --fill
```

For a repository with a docs site, also add its name to `consumers` in
`blueprint/design-system.json`, so a new `m3l-design` release opens its re-sync
pull request there.

## 6. Set up your machine

**Run from:** the monorepo root, `~/workspaces/monte3l` (or `$M3L_ROOT`), for every command and file in this step.

```sh
gh repo clone monte3l/m3l-NAME m3l-NAME

git -C m3l-NAME config user.email                           # the clone inherits the global config:
git -C m3l-NAME config commit.gpgsign                       # check both, never edit the global one
```

Add the project to `monte3l.code-workspace`, which sits outside every
repository:

```json
{"path": "m3l-NAME"}
```

Then create the first worktree. Never edit in the new repository's main
checkout:

```sh
.github/bin/wt.sh m3l-NAME chore/first-setup
```

It prints the path, `~/workspaces/monte3l/m3l-NAME.wt/chore-first-setup`. Work there, and for every
later change run `wt.sh` again (or `git worktree add`) off a freshly fetched
`origin/main`.

## 7. Finish the starters

**Run from:** the new repository's worktree, `~/workspaces/monte3l/m3l-NAME.wt/chore-first-setup`. Fill in what the script left for a person.

| Task | Why |
| --- | --- |
| Wire `.claude/hooks/guard-shared-checkout.mjs` into `.claude/settings.json`. Copy the two entries from [Worktree guard](README.md#worktree-guard) | The file is already there, but it does nothing until the settings run it |
| Replace the placeholder step in `.github/workflows/verify.yml` with the repository's checks | It fails on purpose, and `verify` is a required check. A scaffolded repository has its own `ci.yml` instead |
| Fill the placeholders the script listed, such as those in `README.md` and `SECURITY.md` | They are the owner's words |
| Write the five sections of `ROADMAP.md`. [Tracking work](tracking.md) says what each holds | The baseline reports `roadmap: sections` until they exist |
| After `--scaffold`, run `/customize` and install the dependencies | It tailors the scaffold to the project |
| For `--docs`, add `node design/source/docs-kit/build.mjs --check` to `verify.yml` with `actions/setup-node` reading `.node-version`, and check the DNS record ([Docs site runbook](docs-site.md)) | A pull request is gated as well as a push to `main`. A Custom Domain cannot attach over an existing CNAME |

Commit and open the pull request (same worktree):

```sh
git add -A
git commit -s -m "chore: fill the starter files"
git push -u origin chore/first-setup
gh pr create --fill
gh pr checks --watch
```

Merge when green, then run from `~/workspaces/monte3l/m3l-NAME` (the main checkout, not the worktree) to update it
and remove the merged worktree:

```sh
git pull
git worktree remove ../m3l-NAME.wt/chore-first-setup
git branch -d chore/first-setup
```

## 8. Check the result

```sh
bin/apply-repo-baseline.sh monte3l/m3l-NAME
```

**Run from:** any worktree of `.github`, for example the one from step 3, because the script lives in
`.github/bin/`. It is read-only. Exit 1 means drift, and some is
normal on day one: the output names the items. Do not run `--apply` to clear it
without reading what it changes.

What a person still does, outside this flow:

- Register the repository at reuse.software and bestpractices.dev.
- Triage the Scorecard alerts from the first run of a public repository.
- Read any `MANUAL` lines the script printed. The App installation can be
  refused for a token that is not a classic one, and is then listed under
  organization settings, GitHub Apps, Configure, repositories.
- Merge the pull requests from steps 5 and 7.

> [!NOTE]
> This repository is public. Keep per-repository detail out of its issues, pull
> request comments and logs, beyond the registration itself.
