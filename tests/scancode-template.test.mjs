// SPDX-FileCopyrightText: Copyright (c) 2026 Enrico Lionello (enri3l) and Giulia Montevecchi (giulmonte), monte3l
// SPDX-License-Identifier: MIT

// The "List the flagged files" step of workflow-templates/scancode.yml. The action's own compliance step
// prints only counts, so this step reads the JSON the action wrote and names the files. The test takes the
// step's script out of the template and runs it against a results file shaped like the real one.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

const root = path.join(import.meta.dirname, "..");
const template = readFileSync(path.join(root, "workflow-templates", "scancode.yml"), "utf8");

/** The `run: |` script of the step with this name, dedented. */
function script(stepName) {
  const lines = template.split("\n");
  const start = lines.findIndex((l) => l.trim() === `- name: ${stepName}`);
  assert.ok(start >= 0, `no step named ${stepName}`);
  const run = lines.findIndex((l, i) => i > start && l.trim() === "run: |");
  assert.ok(run > start, "the step has no run block");
  const indent = lines[run + 1].match(/^ */)[0].length;
  const body = [];
  for (const line of lines.slice(run + 1)) {
    if (line.trim() !== "" && !line.startsWith(" ".repeat(indent))) break;
    body.push(line.slice(indent));
  }
  return body.join("\n");
}

const file = (p, alert, spdx) => ({ path: p, compliance_alert: alert, detected_license_expression_spdx: spdx });

function run(results, { spdx = true } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "scancode-step-"));
  mkdirSync(path.join(dir, "output"));
  if (results !== null) writeFileSync(path.join(dir, "output", "results-2026-11-23.json"), JSON.stringify({ files: results }));
  // The SPDX output has no `files` of ScanCode's shape and must be skipped, not parsed.
  if (spdx) writeFileSync(path.join(dir, "output", "results-2026-11-23.spdx.json"), JSON.stringify({ spdxVersion: "SPDX-2.3" }));
  const summary = path.join(dir, "summary.md");
  const r = spawnSync("bash", ["-eo", "pipefail", "-c", script("List the flagged files")], {
    encoding: "utf8",
    env: { ...process.env, PROJECT_WORK_DIRECTORY: dir, GITHUB_STEP_SUMMARY: summary },
  });
  return { status: r.status, out: r.stdout, err: r.stderr, summary: existsSync(summary) ? readFileSync(summary, "utf8") : "" };
}

test("it names each flagged file, with its alert and license, in the log and the summary", () => {
  const { status, out, err, summary } = run([
    file("LICENSE", "ok", "MIT"),
    file("docs/notes.md", "", null),
    file("vendor/copied.c", "error", "GPL-3.0-only"),
    file("tests/data.txt", "missing", null),
  ]);
  assert.equal(status, 0, err);
  assert.equal(out, "::error::ScanCode flagged vendor/copied.c (error, GPL-3.0-only)\n::error::ScanCode flagged tests/data.txt (missing, unknown)\n");
  assert.match(summary, /### Files ScanCode flagged/);
  assert.match(summary, /\| `vendor\/copied\.c` \| error \| `GPL-3\.0-only` \|/);
  assert.match(summary, /\| `tests\/data\.txt` \| missing \| `unknown` \|/);
  assert.ok(!summary.includes("LICENSE"), "a file with an ok alert is not listed");
});

test("a file name cannot start a workflow command", () => {
  const { out } = run([file("a\n::add-mask::secret", "error", "GPL-3.0-only")]);
  assert.equal(out.split("\n").filter((line) => line.startsWith("::")).length, 1, out);
  assert.match(out, /^::error::ScanCode flagged a\\n::add-mask::secret /);
});

test("with nothing flagged it prints nothing and writes no summary", () => {
  const { status, out, summary } = run([file("LICENSE", "ok", "MIT"), file("README.md", "", null)]);
  assert.equal(status, 0);
  assert.equal(out, "");
  assert.equal(summary, "");
});

test("without a results file the step does nothing and does not fail", () => {
  const { status, out } = run(null);
  assert.equal(status, 0);
  assert.equal(out, "");
});

test("the step runs only after a failure, and only once the action has set its work directory", () => {
  const lines = template.split("\n");
  const start = lines.findIndex((l) => l.trim() === "- name: List the flagged files");
  assert.match(lines[start + 1], /if: failure\(\) && env\.PROJECT_WORK_DIRECTORY != ''/);
});
