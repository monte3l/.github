import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const wt = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../bin/wt.sh");

let tmp;
let root;

function sh(cwd, ...args) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}

function run(...args) {
  return spawnSync("bash", [wt, ...args], { encoding: "utf8", env: { ...process.env, M3L_ROOT: root } });
}

before(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "harness-wt-")));
  root = path.join(tmp, "workspaces");
  const origin = path.join(tmp, "origin.git");
  const clone = path.join(root, "m3l-x");
  fs.mkdirSync(root);
  sh(tmp, "init", "-q", "--bare", "-b", "main", origin);
  sh(tmp, "clone", "-q", origin, clone);
  sh(clone, "-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "-q", "--allow-empty", "-m", "one");
  sh(clone, "push", "-q", "origin", "HEAD:main");
  // A commit that exists only on origin: the worktree must start from it.
  const other = path.join(tmp, "other");
  sh(tmp, "clone", "-q", origin, other);
  sh(other, "-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "-q", "--allow-empty", "-m", "two");
  sh(other, "push", "-q", "origin", "HEAD:main");
});

after(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe("bin/wt.sh", () => {
  it("fetches first, bases on origin/main and prints the path", () => {
    const r = run("m3l-x", "feat/topic");
    assert.equal(r.status, 0, r.stderr);
    const target = r.stdout.trim();
    assert.equal(target, path.join(root, "m3l-x.wt", "feat-topic"));
    assert.equal(sh(target, "rev-parse", "--abbrev-ref", "HEAD"), "feat/topic");
    assert.equal(sh(target, "log", "-1", "--format=%s"), "two");
  });

  it("refuses an existing target, an unknown repository and missing arguments with exit 2", () => {
    assert.equal(run("m3l-x", "feat/topic").status, 2);
    assert.equal(run("nope", "b").status, 2);
    assert.equal(run("m3l-x").status, 2);
    assert.equal(run("--help").status, 2);
  });
});
