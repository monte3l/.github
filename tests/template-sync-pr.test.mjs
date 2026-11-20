// SPDX-FileCopyrightText: Copyright (c) 2026 Enrico Lionello (enri3l) and Giulia Montevecchi (giulmonte), monte3l
// SPDX-License-Identifier: MIT

// bin/template-sync-pr.sh decides what the sync App may commit to another repository, so its refusals are
// tested for real: a temporary git checkout, the script's own jq and git, and DRY_RUN=1, which ends before
// any call to GitHub. The allowed starter paths are read from the real blueprint/sync.json.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

const root = path.join(import.meta.dirname, "..");
const script = path.join(root, "bin", "template-sync-pr.sh");
const sync = JSON.parse(readFileSync(path.join(root, "blueprint", "sync.json"), "utf8"));
const WORKFLOW_TITLE = "ci: refresh workflow copies from the org templates";
const MIXED_TITLE = "chore: refresh copies of the org templates and starters";

const git = (cwd, ...args) =>
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", ...args], { cwd, encoding: "utf8" });

/**
 * A consumer checkout with `before` committed, then `after` written over it (a string writes a file,
 * null leaves it as committed). Returns the script's result in DRY_RUN mode.
 * With `config`, the script runs from a copy that has that sync.json (a string is written as is), so the
 * allowed paths can be varied; `repo` is the repository name it is asked about.
 * @param {Record<string, string>} before
 * @param {Record<string, string | { text: string, mode?: number }>} after
 * @param {{ config?: object | string, repo?: string }} [options]
 */
function sync_(before, after, { config, repo = "m3l-x" } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "consumer-"));
  git(dir, "init", "-q");
  const write = (rel, text, mode) => {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    writeFileSync(path.join(dir, rel), text);
    if (mode) chmodSync(path.join(dir, rel), mode);
  };
  for (const [rel, text] of Object.entries(before)) write(rel, text);
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "base");
  for (const [rel, value] of Object.entries(after)) typeof value === "string" ? write(rel, value) : write(rel, value.text, value.mode);
  let run = script;
  if (config !== undefined) {
    const tree = mkdtempSync(path.join(tmpdir(), "tool-"));
    mkdirSync(path.join(tree, "bin"));
    mkdirSync(path.join(tree, "blueprint"));
    cpSync(script, path.join(tree, "bin", "template-sync-pr.sh"));
    writeFileSync(path.join(tree, "blueprint", "sync.json"), typeof config === "string" ? config : JSON.stringify(config));
    run = path.join(tree, "bin", "template-sync-pr.sh");
  }
  const result = spawnSync("bash", [run, `monte3l/${repo}`, dir], { encoding: "utf8", env: { ...process.env, DRY_RUN: "1" } });
  return { status: result.status, out: result.stdout, err: result.stderr };
}

const BASE = {
  ".github/workflows/dco.yml": "name: dco\n",
  ".gitleaks.toml": "# old\n",
  ".editorconfig": "root = true\n",
  "README.md": "# x\n",
  "docs/other.toml": "x = 1\n",
};

test("the starter paths come from sync.json, so the test knows what is allowed", () => {
  const allowed = Object.values(sync.starters).flatMap((s) => s.paths);
  for (const p of [".gitleaks.toml", ".editorconfig", ".gitattributes", ".github/CODEOWNERS"]) assert.ok(allowed.includes(p), p);
});

test("a workflow alone is sent, with the title it always had", () => {
  const { status, out, err } = sync_(BASE, { ".github/workflows/dco.yml": "name: dco v2\n" });
  assert.equal(status, 0, err);
  assert.match(out, new RegExp(`would commit .* and open "${WORKFLOW_TITLE}"`));
});

test("a starter alone is sent, under the generic title", () => {
  const { status, out, err } = sync_(BASE, { ".gitleaks.toml": "# new\n" });
  assert.equal(status, 0, err);
  assert.match(out, new RegExp(`and open "${MIXED_TITLE}"`));
});

test("a workflow and a starter together are one pull request with the generic title", () => {
  const { status, out, err } = sync_(BASE, { ".github/workflows/dco.yml": "name: dco v2\n", ".editorconfig": "root = false\n" });
  assert.equal(status, 0, err);
  assert.match(out, /2 file\(s\)/);
  assert.match(out, new RegExp(`and open "${MIXED_TITLE}"`));
});

test("a file that is neither a workflow nor a listed starter is refused, and nothing at all is sent", () => {
  const { status, err } = sync_(BASE, { ".github/workflows/dco.yml": "name: dco v2\n", "README.md": "# changed\n" });
  assert.equal(status, 1);
  assert.match(err, /neither a workflow file nor a starter a sync may refresh.*README\.md/);
});

test("a path that looks like a starter but is not listed is refused", () => {
  const { status, err } = sync_(BASE, { "docs/other.toml": "x = 2\n" });
  assert.equal(status, 1);
  assert.match(err, /docs\/other\.toml/);
});

test("a workflow outside .github/workflows is refused", () => {
  const { status, err } = sync_({ ...BASE, "scripts/ci.yml": "a: 1\n" }, { "scripts/ci.yml": "a: 2\n" });
  assert.equal(status, 1);
  assert.match(err, /scripts\/ci\.yml/);
});

test("a sync refreshes and never adds: a new starter file is refused", () => {
  const { status, err } = sync_(BASE, { ".gitattributes": "* text=auto\n" });
  assert.equal(status, 1);
  assert.match(err, /only modifies existing files/);
});

test("an executable starter is refused, because the API commits plain files only", () => {
  const { status, err } = sync_(BASE, { ".editorconfig": { text: "root = false\n", mode: 0o755 } });
  assert.equal(status, 1);
  assert.match(err, /not plain 100644 files/);
});

test("no change is nothing to do", () => {
  const { status, out } = sync_(BASE, {});
  assert.equal(status, 0);
  assert.match(out, /every copy is current: nothing to do/);
});

// A repository that keeps a starter somewhere of its own says so in `repos.<name>.paths`, and the CLI writes there.
const OWN = { starters: { x: { mode: "managed", paths: [".x"] } }, repos: { "m3l-x": { paths: { x: "conf/x" } } } };
const OWN_BASE = { ...BASE, "conf/x": "a\n", ".x": "a\n" };

test("a path a repository names for itself is sent for that repository", () => {
  const { status, out, err } = sync_(OWN_BASE, { "conf/x": "b\n" }, { config: OWN });
  assert.equal(status, 0, err);
  assert.match(out, /1 file\(s\)/);
});

test("the same path is refused for a repository that did not name it", () => {
  const { status, err } = sync_(OWN_BASE, { "conf/x": "b\n" }, { config: OWN, repo: "m3l-y" });
  assert.equal(status, 1);
  assert.match(err, /conf\/x/);
});

test("a starter's own paths are still sent when the repository has an override elsewhere", () => {
  const { status, err } = sync_(OWN_BASE, { ".x": "b\n" }, { config: OWN });
  assert.equal(status, 0, err);
});

test("a sync.json that cannot be read stops the script with its own message", () => {
  const { status, err } = sync_(BASE, { ".gitleaks.toml": "# new\n" }, { config: "not json" });
  assert.equal(status, 1);
  assert.match(err, /cannot read the allowed paths from blueprint\/sync\.json/);
});
