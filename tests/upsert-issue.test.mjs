// SPDX-FileCopyrightText: Copyright (c) 2026 Enrico Lionello (enri3l) and Giulia Montevecchi (giulmonte), monte3l
// SPDX-License-Identifier: MIT

// bin/lib/upsert-issue.sh against a stub `gh` that records its calls: the first
// label identifies the issue, every label is applied, and a missing one is created.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

const script = path.join(import.meta.dirname, "..", "bin", "lib", "upsert-issue.sh");
const root = path.join(import.meta.dirname, "..");

/** Runs the script with a stub gh. `issues` is what `gh issue list` returns, `labels` the repo's labels. */
function run(args, { issues = "[]", labels = "" } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "upsert-"));
  const log = path.join(dir, "calls.log");
  const stub = path.join(dir, "gh");
  writeFileSync(log, "");
  writeFileSync(
    stub,
    `#!/usr/bin/env bash
printf '%s\\n' "$*" >>"${log}"
case "$1 $2" in
  "issue list") printf '%s' '${issues}' ;;
  "label list") printf '%s' '${labels}' ;;
esac
`,
  );
  chmodSync(stub, 0o755);
  const body = path.join(dir, "body.md");
  writeFileSync(body, "finding\n");
  const result = spawnSync("bash", [script, ...args.map((a) => (a === "BODY" ? body : a))], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, GITHUB_REPOSITORY: "monte3l/x" },
  });
  const calls = readFileSync(log, "utf8").split("\n").filter(Boolean);
  return { result, calls };
}

test("a comma-separated list finds the issue by its first label and applies all of them", () => {
  const { result, calls } = run(["Stale", "area:ci,freshness", "BODY"], { labels: "area:ci\n" });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(calls.some((c) => c.startsWith("issue list") && c.includes("--label area:ci ")), "lists by the first label");
  assert.ok(calls.some((c) => c.startsWith("label create") && c.includes(" freshness ")), "creates the missing label");
  assert.ok(!calls.some((c) => c.startsWith("label create") && c.includes(" area:ci ")), "does not recreate a label that exists");
  const create = calls.find((c) => c.startsWith("issue create"));
  assert.match(create, /--label area:ci --label freshness/);
});

test("a single label still works", () => {
  const { result, calls } = run(["Stale", "dependencies", "BODY"], { labels: "dependencies\n" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(calls.find((c) => c.startsWith("issue create")), /--label dependencies /);
});

test("an existing issue with the same title is not duplicated, and an unchanged body is not rewritten", () => {
  const fp = createHash("sha256").update("finding\n").digest("hex");
  const { result, calls } = run(["Stale", "area:ci,freshness", "BODY"], {
    issues: JSON.stringify([{ number: 7, title: "Stale", body: `x\n<!-- fp:${fp} -->` }]),
  });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(!calls.some((c) => c.startsWith("issue create")), "no second issue");
  assert.ok(!calls.some((c) => c.startsWith("issue edit")), "same fingerprint, no rewrite");
});

test("a changed body rewrites the existing issue instead of opening another", () => {
  const { result, calls } = run(["Stale", "area:ci,freshness", "BODY"], {
    issues: JSON.stringify([{ number: 7, title: "Stale", body: "x\n<!-- fp:deadbeef -->" }]),
  });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(!calls.some((c) => c.startsWith("issue create")));
  assert.ok(calls.some((c) => c.startsWith("issue edit")));
});

test("--clean closes the open issue", () => {
  const { result, calls } = run(["Stale", "area:ci,freshness", "BODY", "--clean"], {
    issues: JSON.stringify([{ number: 7, title: "Stale", body: "" }]),
  });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(calls.some((c) => c.startsWith("issue close")));
});

test("usage errors exit 2", () => {
  const { result } = run(["only-a-title"]);
  assert.equal(result.status, 2);
});
