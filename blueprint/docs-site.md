# Docs site standard and Cloudflare runbook

Every `monte3l` repository with a visual or documentation surface gets a docs
site at `<project>.monte3l.com`. The site is built by the **docs kit** that
ships in the `m3l-design` release payload, and deployed to Cloudflare Workers
Static Assets, a Custom Domain under the `monte3l.com` zone (Cloudflare Free
plan). This page is the standard, the one-time setup and the runbook. The
repository itself holds only a config file, its own parity checks and its
deploy wiring.

> [!NOTE]
> Workers Static Assets, not Pages: Cloudflare's own guidance for a new static
> site is "use Workers instead of Pages". Pages keeps working but gets no
> further feature investment. An assets-only Worker needs no script of its own.

## The standard

| Item | Rule |
| --- | --- |
| Tier | Vendored. `design/README.md` records ``- **Version copied:** `vX.Y.Z` `` (m3l-design itself records `Version adopted` plus `Tier: source`) |
| Kit | Run from `design/source/docs-kit/`. Never copy or fork it into the repository: fix it in m3l-design and re-sync |
| Config | `docs.config.mjs` at the repository root. Skeleton: `files/docs.config.mjs` |
| Hostname | `<project>.monte3l.com`. One Worker and one Custom Domain per project, never path-based routing on a shared host |
| Deploy tools | `.github/deploy-tools/` holds `package.json`, a committed `package-lock.json` and `wrangler.jsonc`. Skeleton: `files/deploy-tools/` |
| Workflows | `docs.yml` (build, deploy, smoke) and `docs-live.yml` (daily). Templates: `workflow-templates/docs.yml`, `workflow-templates/docs-live.yml` |
| Gate | The repository's `verify` workflow runs `node design/source/docs-kit/build.mjs --check` on every pull request |
| Homepage | The GitHub repository `homepage`, and the manifest `homepage` if there is one, equal the site URL |
| Parity | Anything the docs state that code defines is checked by a module listed in `parity`. The kit's `lib/parity.mjs` has the helpers |

`bin/apply-repo-baseline.sh` reports each row that has a check as a `docs site`
item. It only looks at a repository that has a `docs.config.mjs`.

### What the kit checks

The full list, with its exit codes, is in the kit's own README, which ships in
every vendored copy at `design/source/docs-kit/README.md`. In short, one
`--check` run fails on a broken link or anchor, an italic span, a tracked
`*.md` file that is neither a page nor excluded, a `SHA256SUMS` mismatch, a
literal in a local stylesheet, more than two alerts in a row, a manifest
`homepage` that is not the site URL, and any message from a parity module.
`check-live.mjs` then compares the deployed site byte for byte with the build.

## One-time setup

Done by hand, before merging the pull request that adds `docs.yml`.

1. **Create a Cloudflare API token** (dashboard: My Profile, API Tokens,
   Create Token, Custom Token).
   - Name: `gh-<repo>-docs`.
   - Permissions: **Account** Workers Scripts **Edit**; **Zone**
     (`monte3l.com`) Workers Routes **Edit**.
   - Zone Resources: the `monte3l.com` zone only, not "All zones".
   - Set a TTL of one year at most, and record the expiry in the repository's
     `SECURITY.md` secrets table.
   - The token cannot be scoped to a single Worker: Workers Scripts Edit is
     account-wide. That is why it is stored as an **environment** secret
     restricted to `main`, not a plain repository secret.
   - A fresh, narrowly scoped token per project, never one shared token.
2. **Get the account ID** (dashboard sidebar, or the Workers & Pages overview).
3. **Create the GitHub environment**, so the token is scoped to protected
   deploys only:

   ```sh
   gh api -X PUT repos/monte3l/<repo>/environments/docs-cloudflare \
     -f 'deployment_branch_policy[protected_branches]=false' \
     -f 'deployment_branch_policy[custom_branch_policies]=true'
   gh api -X POST repos/monte3l/<repo>/environments/docs-cloudflare/deployment-branch-policies \
     -f name=main
   gh secret set CLOUDFLARE_API_TOKEN --env docs-cloudflare --repo monte3l/<repo>
   gh secret set CLOUDFLARE_ACCOUNT_ID --env docs-cloudflare --repo monte3l/<repo>
   ```

   The new environment also needs the weekly `env-janitor` cleanup, with
   `docs-cloudflare` in its policy. See
   [Environment cleanup](README.md#environment-cleanup).

4. **Confirm no existing DNS record** collides with the hostname:
   `dig <project>.monte3l.com` should return nothing before the first deploy. A
   Custom Domain fails to attach if the hostname already carries a CNAME. For
   the apex (`monte3l.com`, the org site), check the zone's apex records first.
5. **Zone-wide security settings** (dashboard, `monte3l.com` zone, all on the
   Free plan). They apply to every site on the zone, so they are set once:
   - SSL/TLS, Edge Certificates: **Always Use HTTPS** on, **Minimum TLS
     Version** 1.3, **TLS 1.3** on. Clients limited to TLS 1.2 cannot connect.
   - SSL/TLS, Overview: encryption mode **Full (strict)**, otherwise visitors
     can see a 526.
   - DNS: **DNSSEC** on. Check with `dig +short DS monte3l.com @1.1.1.1`.
   - Keep zone-wide **HSTS** off. HSTS is sent per response from `_headers`,
     which the kit generates and which is the single source of truth. A zone
     HSTS setting replaces the per-response header, and its `preload` commits
     every subdomain of `monte3l.com` to HTTPS.
   - Keep **JavaScript detections** off (`enable_js` in the Bot Management API,
     separate from Bot Fight Mode). With it on, Cloudflare injects an inline
     script into every HTML page. `_headers` allows only the theme script's
     hash and a static site cannot issue per-response nonces, so the browser
     blocks the script and logs a CSP violation on each page view. Read it with
     `GET /zones/<zone id>/bot_management` (token permission: Bot Management
     Read).
   - Keep **Bot Fight Mode** off as well: it returned a 403 to the smoke job's
     runner.
   - Leave **Speed Brain** and **Network Error Logging** as they are. They add
     response headers the kit does not set, and the live check ignores extra
     headers.
   - Defer **CAA records**. Custom Domains issue Advanced Certificates, which
     Cloudflare's automatic CAA convenience does not cover. Adding a CAA record
     without listing every CA an Advanced Certificate might use risks a failed
     re-issuance.
6. **First deploy.** Merging the pull request that adds `docs.yml` runs the
   `build`, `deploy` and `smoke` jobs on the next push to `main`. A green
   `wrangler deploy` step means the upload succeeded. The `smoke` job then
   checks the live site: every page, the 404 page and every asset must equal
   the built file, and each response must carry every header from `_headers`
   with the exact value. `docs-live.yml` repeats the check daily against a
   fresh build of `main`, so a zone setting changed in the dashboard shows up
   as a failed run. A 403 in either means a bot-protection setting was
   switched back on. By hand: `curl -sI https://<project>.monte3l.com`, and
   `https://<project>.monte3l.com/does-not-exist` must return a real 404.
7. **Do not install the Cloudflare Workers & Pages GitHub App.** It is only for
   Cloudflare's Git integration, which this setup does not use: `wrangler
   deploy` from GitHub Actions needs no app. Uninstall or de-scope it if it is
   there.
8. **Set the repository homepage** to the site URL (`gh repo edit
   monte3l/<repo> --homepage https://<project>.monte3l.com`), and the manifest
   `homepage` to the same value. The `docs site: homepage` item and the kit's
   `--check` compare them.

## Wiring a new site

1. Add `design/README.md` with the vendored marker, then run
   `bin/sync-design.sh vX.Y.Z <repo>` from an m3l-design checkout.
2. Copy `files/docs.config.mjs` to the repository root and fill it in. List
   every tracked `*.md` file under `pages` or `exclude`, with a reason for each
   exclusion: the kit fails on any it does not know about.
3. Copy `files/deploy-tools/` to `.github/deploy-tools/`, rename the Worker and
   the hostname, and run `npm install --package-lock-only
   --ignore-scripts --prefix .github/deploy-tools` once to commit the lockfile.
4. Copy `workflow-templates/docs.yml` and `workflow-templates/docs-live.yml`
   into `.github/workflows/`, and set the environment URL.
5. Add `node design/source/docs-kit/build.mjs --check` to the `verify`
   workflow, with `actions/setup-node` reading `.node-version`.
6. Add an `npm` entry for `/.github/deploy-tools` to `dependabot.yml`, with a
   one-day cooldown, and the `sharp` libvips allowance to
   `dependency-review.yml` (copy it from m3l-design's workflow).
7. Add the parity module the repository needs, listed in `parity`.
8. Add the site to `blueprint/projects.json` in this repository.
9. Run `bin/apply-repo-baseline.sh monte3l/<repo>` and fix any `docs site`
   drift.

## The `.html` redirect hop

`wrangler.jsonc` sets `html_handling: "auto-trailing-slash"`, Cloudflare's
default, rather than `"none"`, because `"none"` breaks `/` (no automatic
`index.html` at the root path). The cost is that every link the kit generates
points at an explicit `.html` file, and Cloudflare 307-redirects each to the
extensionless path before serving it. That is one extra, edge-served hop per
navigation. It is accepted, not a bug.

## The `overrides` floor

`.github/deploy-tools/package.json` carries two `overrides`. `undici: ^7.29.1`,
because wrangler's miniflare resolves an `undici` with open advisories. `sharp:
^0.35.5`, because miniflare pins `sharp` 0.35.4 exactly, which carries
GHSA-wq5f-xc86-pv6w. Drop each once miniflare itself requires the fixed
version.
