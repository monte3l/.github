// SPDX-FileCopyrightText: Copyright (c) 2026 Enrico Lionello (enri3l) and Giulia Montevecchi (giulmonte), monte3l
// SPDX-License-Identifier: MIT

// This repository is public: the freshness issues, the job summaries and the logs are readable by anyone, so
// they hold counts only, never which repository is behind. The behaviour of `--public` is tested in
// template-sync-cli.test.mjs; here the workflow is held to using it.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const root = path.join(import.meta.dirname, "..");
const workflow = readFileSync(path.join(root, ".github", "workflows", "freshness.yml"), "utf8");

test("freshness.yml runs the template sync with --public, every time", () => {
  const calls = workflow.split("\n").filter((line) => /^\s*node bin\/template-sync\.mjs\b/.test(line));
  assert.ok(calls.length >= 1, "the copies job runs the template sync");
  for (const line of calls) assert.match(line, /--public\b/, `counts only: ${line.trim()}`);
});

test("freshness.yml never writes the comparison table or the JSON into the job summary", () => {
  assert.doesNotMatch(workflow, /template-sync\.mjs[^\n]*--json/, "--json carries repository names");
  assert.doesNotMatch(workflow, /template-sync\.mjs(?![^\n]*--public)[^\n]*>>?\s*"?\$GITHUB_STEP_SUMMARY/);
});

test("the issue text points to a local run for the detail instead of the public job summary", () => {
  assert.doesNotMatch(workflow, /full comparison is in the job summary/);
  assert.match(workflow, /counts only\. Which repository and which file stay on your machine/);
});
