// SPDX-FileCopyrightText: Copyright (c) 2026 Enrico Lionello (enri3l) and Giulia Montevecchi (giulmonte), monte3l
// SPDX-License-Identifier: MIT

// bin/env-secrets.sh against a stub gh on PATH. The stub logs every call's arguments, keeps what
// `gh secret set` received on standard input, and answers the environment and secret reads from files.
// The point of the tests: the value reaches gh on standard input only, a refused write is named and
// fails the run, and a repository without the environment is skipped on a 404 but not on any other error.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

const root = path.join(import.meta.dirname, "..");
const script = path.join(root, "bin", "env-secrets.sh");
const VALUE = "s3cret-value-DO-NOT-LEAK";

const STUB = `#!/usr/bin/env bash
D="$GH_STUB_DIR"
echo "gh $*" >> "$D/calls.log"
case "$1 $2" in
  "api --paginate") cat "$D/repos.txt" ;;
  "secret set")
    r="\${@: -1}"; r="\${r#monte3l/}"
    cat > "$D/stdin.$r.$3"
    ! grep -qx "$r" "$D/fail.txt" ;;
  "api repos/monte3l/"*)
    IFS=/ read -r _ _ r _ env rest <<<"$2"
    if [[ -f "$D/broken-$r" ]]; then echo "gh: Forbidden (HTTP 403)" >&2; exit 1; fi
    if [[ -z "$rest" ]]; then
      grep -qx "$r" "$D/env-$env.txt" || { echo "gh: Not Found (HTTP 404)" >&2; exit 1; }
    else
      cat "$D/secrets-$r-$env.txt" 2>/dev/null || true
    fi ;;
  *) echo "unexpected gh call: $*" >&2; exit 9 ;;
esac
`;

/** @param {{ repos?: string[], envs?: Record<string, string[]>, fail?: string[], secrets?: Record<string, string[]>, broken?: string[] }} world */
function setup(world = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "env-secrets-"));
  const bin = path.join(dir, "bin");
  mkdirSync(bin);
  writeFileSync(path.join(bin, "gh"), STUB);
  chmodSync(path.join(bin, "gh"), 0o755);
  writeFileSync(path.join(dir, "repos.txt"), (world.repos ?? ["alpha", "beta", "gamma"]).join("\n") + "\n");
  for (const [env, repos] of Object.entries(world.envs ?? { "env-janitor": ["alpha", "beta"], "docs-cloudflare": ["alpha"] })) {
    writeFileSync(path.join(dir, `env-${env}.txt`), repos.join("\n") + "\n");
  }
  writeFileSync(path.join(dir, "fail.txt"), (world.fail ?? []).join("\n") + "\n");
  for (const [key, rows] of Object.entries(world.secrets ?? {})) {
    writeFileSync(path.join(dir, `secrets-${key}.txt`), rows.join("\n") + "\n");
  }
  for (const r of world.broken ?? []) writeFileSync(path.join(dir, `broken-${r}`), "");
  return { dir, bin };
}

function run(world, args, input = "") {
  const { dir, bin } = setup(world);
  const r = spawnSync("bash", [script, ...args], {
    encoding: "utf8",
    input,
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, GH_STUB_DIR: dir },
  });
  const log = existsSync(path.join(dir, "calls.log")) ? readFileSync(path.join(dir, "calls.log"), "utf8") : "";
  return { status: r.status, out: r.stdout, err: r.stderr, log, dir };
}

test("set writes the value to the environment of every repository that has it, on standard input", () => {
  const r = run({}, ["set", "JANITOR_APP_PRIVATE_KEY"], VALUE);
  assert.equal(r.status, 0, r.err);
  assert.match(r.out, /OK     alpha: JANITOR_APP_PRIVATE_KEY set in env-janitor/);
  assert.match(r.out, /OK     beta: JANITOR_APP_PRIVATE_KEY set in env-janitor/);
  assert.doesNotMatch(r.out, /gamma/, "a repository without the environment is skipped");
  assert.equal(readFileSync(path.join(r.dir, "stdin.alpha.JANITOR_APP_PRIVATE_KEY"), "utf8"), VALUE);
  assert.match(r.log, /gh secret set JANITOR_APP_PRIVATE_KEY --env env-janitor --repo monte3l\/alpha/);
});

test("the value is never in an argument, the output or the error stream", () => {
  const r = run({}, ["set", "CLOUDFLARE_API_TOKEN"], VALUE);
  assert.equal(r.status, 0, r.err);
  for (const text of [r.log, r.out, r.err]) assert.ok(!text.includes(VALUE), "the value leaked");
});

test("set maps the name to its environment from blueprint/env-secrets.json", () => {
  const r = run({}, ["set", "CLOUDFLARE_ACCOUNT_ID"], "acct");
  assert.match(r.log, /--env docs-cloudflare --repo monte3l\/alpha/);
  assert.doesNotMatch(r.log, /secret set .*monte3l\/beta/, "beta has no docs-cloudflare environment");
});

test("--repo writes one repository only, and does not list the organization", () => {
  const r = run({}, ["set", "JANITOR_APP_CLIENT_ID", "--repo", "beta"], "id");
  assert.equal(r.status, 0, r.err);
  assert.doesNotMatch(r.log, /orgs\/monte3l\/repos/);
  assert.match(r.log, /--repo monte3l\/beta/);
  assert.doesNotMatch(r.log, /secret set .*monte3l\/alpha/);
});

test("a refused write names the repository, fails the run, and still tries the others", () => {
  const r = run({ fail: ["alpha"] }, ["set", "JANITOR_APP_PRIVATE_KEY"], VALUE);
  assert.equal(r.status, 1);
  assert.match(r.out, /FAIL   alpha: JANITOR_APP_PRIVATE_KEY was refused in env-janitor/);
  assert.match(r.out, /OK     beta/);
  assert.match(r.out, /1 set, 1 failed/);
  assert.ok(!r.out.includes(VALUE) && !r.err.includes(VALUE));
});

test("a name that is not in blueprint/env-secrets.json is refused before any call", () => {
  const r = run({}, ["set", "GITLEAKS_LICENSE"], VALUE);
  assert.equal(r.status, 2);
  assert.match(r.err, /not listed in blueprint\/env-secrets\.json/);
  assert.equal(r.log, "");
});

test("an empty value is refused", () => {
  const r = run({}, ["set", "CLOUDFLARE_API_TOKEN"], "");
  assert.equal(r.status, 2);
  assert.doesNotMatch(r.log, /secret set/);
});

test("set exits non-zero when no repository has the environment", () => {
  const r = run({ envs: { "env-janitor": [], "docs-cloudflare": [] } }, ["set", "JANITOR_APP_CLIENT_ID"], "id");
  assert.equal(r.status, 1);
  assert.match(r.out, /0 set, 0 failed/);
});

test("an environment read that fails with anything but 404 stops the run instead of skipping the repository", () => {
  const r = run({ broken: ["beta"] }, ["set", "JANITOR_APP_CLIENT_ID"], "id");
  assert.equal(r.status, 3);
  assert.match(r.err, /cannot read the environment env-janitor of beta/);
});

test("usage errors exit 2", () => {
  assert.equal(run({}, []).status, 2);
  assert.equal(run({}, ["frobnicate"]).status, 2);
  assert.equal(run({}, ["set"]).status, 2);
  assert.equal(run({}, ["check", "--repo", "alpha"]).status, 2);
});

const FRESH = "2026-11-27T10:00:00Z";
const OLD = "2026-11-01T10:00:00Z";
const both = (ts) => [`JANITOR_APP_CLIENT_ID ${ts}`, `JANITOR_APP_PRIVATE_KEY ${ts}`];

test("check is clean when every copy is present and from the same rotation", () => {
  const r = run(
    {
      envs: { "env-janitor": ["alpha", "beta"], "docs-cloudflare": [] },
      secrets: { "alpha-env-janitor": both(FRESH), "beta-env-janitor": both("2026-11-27T10:00:30Z") },
    },
    ["check"],
  );
  assert.equal(r.status, 0, r.out + r.err);
  assert.match(r.out, /0 drift/);
});

test("check flags a copy that a rotation missed, and a copy that is missing", () => {
  const r = run(
    {
      envs: { "env-janitor": ["alpha", "beta"], "docs-cloudflare": [] },
      secrets: { "alpha-env-janitor": both(FRESH), "beta-env-janitor": ["JANITOR_APP_CLIENT_ID " + OLD] },
    },
    ["check"],
  );
  assert.equal(r.status, 1);
  assert.match(r.out, /DRIFT  beta: JANITOR_APP_PRIVATE_KEY is missing from env-janitor/);
  assert.match(r.out, /DRIFT  beta: JANITOR_APP_CLIENT_ID is stale/);
  assert.doesNotMatch(r.out, /DRIFT  alpha/);
});

test("check prints names and dates only", () => {
  const r = run({ envs: { "env-janitor": ["alpha"], "docs-cloudflare": [] }, secrets: { "alpha-env-janitor": both(FRESH) } }, ["check"]);
  assert.ok(!r.out.includes(VALUE));
  assert.doesNotMatch(r.log, /secret set/);
});
