// SPDX-FileCopyrightText: Copyright (c) 2026 Enrico Lionello (enri3l) and Giulia Montevecchi (giulmonte), monte3l
// SPDX-License-Identifier: MIT

// bin/project-backfill.sh against a stub `gh`, so no call leaves the machine.
// Run with: node --test "tests/*.test.mjs"
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

const SCRIPT = path.join(import.meta.dirname, "..", "bin", "project-backfill.sh");

// The stub answers what `gh` would print AFTER its own --jq, keyed on what the call asks for.
const STUB = `#!/usr/bin/env bash
printf '%s\\n' "$*" >>"$STUB_LOG"
[[ -z "\${STUB_FAIL:-}" ]] || { [[ "$*" == *"$STUB_FAIL"* ]] && exit 1; }
case "$*" in
  *"repo list"*) printf '%s\\n' alpha beta ;;
  *"repos/monte3l/alpha/issues"*) printf '%s\\n' I_a1 I_a2 ;;
  *"repos/monte3l/beta/issues"*) printf '%s\\n' I_b1 ;;
  *addProjectV2ItemById*) for arg in "$@"; do [[ "$arg" == content=* ]] && printf '%s\\n' "$arg" >>"$STUB_ADDS"; done; : ;;
  *"items(first"*) printf '%s\\n' I_a1 ;;
  *projectV2*) printf '%s\\n' "\${STUB_PROJECT_ID-PVT_1}" ;;
esac
`;

function run(args = [], env = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "backfill-"));
  writeFileSync(path.join(dir, "gh"), STUB);
  chmodSync(path.join(dir, "gh"), 0o755);
  const log = path.join(dir, "log");
  const adds = path.join(dir, "adds");
  writeFileSync(log, "");
  writeFileSync(adds, "");
  const result = spawnSync("bash", [SCRIPT, ...args], {
    encoding: "utf8",
    env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, OWNER: "monte3l", PROJECT: "5", STUB_LOG: log, STUB_ADDS: adds, ...env },
  });
  return { ...result, log: readFileSync(log, "utf8"), adds: readFileSync(adds, "utf8").split("\n").filter(Boolean) };
}

test("it adds only the issues that are not on the Project yet", () => {
  const r = run();
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.adds, ["content=I_a2", "content=I_b1"], "an item already on the Project is not added again");
});

test("the output is counts only: no repository name, no issue id", () => {
  const r = run();
  assert.equal(r.stdout.trim(), "3 open issues in 2 repositories: 1 already on the Project, 2 added");
  assert.ok(!/alpha|beta|I_a|I_b/.test(r.stdout + r.stderr));
});

test("--dry-run adds nothing and says so", () => {
  const r = run(["--dry-run"]);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.adds, []);
  assert.match(r.stdout, /2 would be added/);
});

test("a Project that cannot be read is a failed call, exit 3, and nothing is added", () => {
  const r = run([], { STUB_PROJECT_ID: "null" });
  assert.equal(r.status, 3);
  assert.deepEqual(r.adds, []);
});

test("a failing gh call is exit 3", () => {
  assert.equal(run([], { STUB_FAIL: "repo list" }).status, 3);
});

test("a failure while adding is exit 3, never read as done", () => {
  assert.equal(run([], { STUB_FAIL: "addProjectV2ItemById" }).status, 3);
});

test("usage errors are exit 2, and never 3", () => {
  assert.equal(run(["--nope"]).status, 2);
  assert.equal(run(["--dry-run", "extra"]).status, 2);
  assert.equal(run([], { PROJECT: "five" }).status, 2);
  assert.equal(run([], { PROJECT: "" }).status, 2);
  assert.equal(run([], { OWNER: "" }).status, 2);
});
