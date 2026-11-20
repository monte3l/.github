// SPDX-FileCopyrightText: Copyright (c) 2026 Enrico Lionello (enri3l) and Giulia Montevecchi (giulmonte), monte3l
// SPDX-License-Identifier: MIT

// bin/template-sync-pr.sh decides what the sync App may commit to another repository, so its refusals are
// tested for real: a temporary git checkout, the script's own jq and git, and DRY_RUN=1, which ends before
// any call to GitHub. The allowed starter paths are read from the real blueprint/sync.json.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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
 * @param {Record<string, string>} before
 * @param {Record<string, string | { text: string, mode?: number }>} after
 */
function sync_(before, after) {
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
  const result = spawnSync("bash", [script, "monte3l/m3l-x", dir], { encoding: "utf8", env: { ...process.env, DRY_RUN: "1" } });
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
