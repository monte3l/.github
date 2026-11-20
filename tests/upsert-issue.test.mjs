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

/**
 * Runs the script with a stub gh. `issues` is what `gh issue list` returns, `labels` the repo's labels.
 * `failType` makes `gh issue create --type ...` fail, as it does when the org lacks the type or gh is too old.
 * `afterFail` is what `gh issue list` returns once such a create has failed (the issue was made anyway).
 */
function run(args, { issues = "[]", labels = "", failType = false, afterFail, env = {} } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "upsert-"));
  const log = path.join(dir, "calls.log");
  const stub = path.join(dir, "gh");
  writeFileSync(log, "");
  writeFileSync(
    stub,
    `#!/usr/bin/env bash
printf '%s\\n' "$*" >>"${log}"
case "$1 $2" in
  "issue list")
    if [[ -f "${dir}/failed" && -f "${dir}/after.json" ]]; then cat "${dir}/after.json"; else printf '%s' '${issues}'; fi ;;
  "label list") printf '%s' '${labels}' ;;
  "issue create")
    if [[ "${failType ? "yes" : ""}" == yes && "$*" == *"--type"* ]]; then touch "${dir}/failed"; exit 1; fi ;;
esac
`,
  );
  chmodSync(stub, 0o755);
  if (afterFail !== undefined) writeFileSync(path.join(dir, "after.json"), afterFail);
  const body = path.join(dir, "body.md");
  writeFileSync(body, "finding\n");
  const result = spawnSync("bash", [script, ...args.map((a) => (a === "BODY" ? body : a))], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, GITHUB_REPOSITORY: "monte3l/x", ...env },
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
    issues: JSON.stringify([{ number: 7, title: "Stale", body: `x\n<!-- fp:${fp} -->`, labels: [{ name: "area:ci" }, { name: "freshness" }] }]),
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

test("an issue opened before the label joined the list gains it, changed or not", () => {
  const fp = createHash("sha256").update("finding\n").digest("hex");
  for (const body of [`x\n<!-- fp:${fp} -->`, "x\n<!-- fp:deadbeef -->"]) {
    const { result, calls } = run(["Stale", "area:ci,freshness", "BODY"], {
      issues: JSON.stringify([{ number: 7, title: "Stale", body, labels: [{ name: "area:ci" }] }]),
      labels: "area:ci\n",
    });
    assert.equal(result.status, 0, result.stderr);
    assert.ok(calls.some((c) => c.startsWith("label create") && c.includes(" freshness ")), "creates the label if the repository lacks it");
    assert.ok(calls.some((c) => c === "issue edit -R monte3l/x 7 --add-label freshness"), "adds only the missing label");
  }
});

test("an issue that already has every label is not edited for labels", () => {
  const fp = createHash("sha256").update("finding\n").digest("hex");
  const { calls } = run(["Stale", "area:ci,freshness", "BODY"], {
    issues: JSON.stringify([{ number: 7, title: "Stale", body: `x\n<!-- fp:${fp} -->`, labels: [{ name: "area:ci" }, { name: "freshness" }] }]),
  });
  assert.ok(!calls.some((c) => c.includes("--add-label")));
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

test("a new issue gets the Gap type by default, because a scheduled finding is drift", () => {
  const { result, calls } = run(["Stale", "area:ci,freshness", "BODY"], { labels: "area:ci\nfreshness\n" });
  assert.equal(result.status, 0, result.stderr);
  const creates = calls.filter((c) => c.startsWith("issue create"));
  assert.equal(creates.length, 1);
  assert.match(creates[0], / --type Gap /);
});

test("ISSUE_TYPE overrides the type, and an empty one sets none", () => {
  const other = run(["Stale", "dependencies", "BODY"], { labels: "dependencies\n", env: { ISSUE_TYPE: "Debt" } });
  assert.match(other.calls.find((c) => c.startsWith("issue create")), / --type Debt /);
  const none = run(["Stale", "dependencies", "BODY"], { labels: "dependencies\n", env: { ISSUE_TYPE: "" } });
  assert.ok(!none.calls.find((c) => c.startsWith("issue create")).includes("--type"));
});

test("when the type cannot be set the issue is opened without it, so no finding is lost", () => {
  const { result, calls } = run(["Stale", "dependencies", "BODY"], { labels: "dependencies\n", failType: true });
  assert.equal(result.status, 0, result.stderr);
  const creates = calls.filter((c) => c.startsWith("issue create"));
  assert.equal(creates.length, 2, "tried with the type, then without");
  assert.match(creates[0], / --type Gap /);
  assert.ok(!creates[1].includes("--type"));
  assert.match(result.stderr, /could not open the issue with type Gap/);
});

test("a typed create that failed after the issue existed is not repeated", () => {
  const { result, calls } = run(["Stale", "dependencies", "BODY"], {
    labels: "dependencies\n",
    failType: true,
    afterFail: JSON.stringify([{ title: "Stale" }]),
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(calls.filter((c) => c.startsWith("issue create")).length, 1, "no second issue");
});

test("an update, an unchanged body and --clean never touch the type", () => {
  const fp = createHash("sha256").update("finding\n").digest("hex");
  const open = JSON.stringify([{ number: 7, title: "Stale", body: `x\n<!-- fp:${fp} -->`, labels: [{ name: "dependencies" }] }]);
  const changed = JSON.stringify([{ number: 7, title: "Stale", body: "x\n<!-- fp:deadbeef -->", labels: [{ name: "dependencies" }] }]);
  for (const [args, issues] of [[["Stale", "dependencies", "BODY"], open], [["Stale", "dependencies", "BODY"], changed], [["Stale", "dependencies", "BODY", "--clean"], open]]) {
    const { calls } = run(args, { issues, labels: "dependencies\n" });
    assert.ok(!calls.some((c) => c.includes("--type")), args.join(" "));
  }
});

test("a dry run prints the typed create and runs nothing", () => {
  const { result, calls } = run(["Stale", "dependencies", "BODY"], { labels: "dependencies\n", env: { DRY_RUN: "1" } });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /would run: gh issue create .* --type Gap /);
  assert.ok(!calls.some((c) => c.startsWith("issue create")));
});
