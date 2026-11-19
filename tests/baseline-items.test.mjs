// SPDX-FileCopyrightText: Copyright (c) 2026 Enrico Lionello (enri3l) and Giulia Montevecchi (giulmonte), monte3l
// SPDX-License-Identifier: MIT

// The baseline's item labels: how they are read out of the script, and the check that the README table lists exactly them.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { baselineProblems } from "../bin/doc-parity.mjs";
import { INLINE_ITEMS, parseBaselineScript, printsInline } from "../bin/lib/baseline-items.mjs";

const root = path.join(import.meta.dirname, "..");
const read = (rel) => readFileSync(path.join(root, rel), "utf8");

const SCRIPT = `
report_file "CODEOWNERS" "hint" .github/CODEOWNERS
report_workflow "docs site: gate" "hint" 'docs-kit/build'
report_placeholders() {
  local label="$1"
}
report_placeholders "README: placeholders" README.md "hint" README.md
report_placeholders "security policy: placeholders" SECURITY.md "hint" SECURITY.md
report_placeholders "$name: placeholders" X.md "hint" X.md
skip "docs site" "no docs.config.mjs"
printf 'OK     docs site: parity\\n'
`;

const table = (...rows) =>
  ["## Repository standard", "", "| Item | Reported as | Standard | Starting point |", "| --- | --- | --- | --- |", ...rows.map((label) => `| x | \`${label}\` | y | z |`), ""].join("\n");

test("the parser reads report_placeholders calls, and not the function definition or a label built from a variable", () => {
  const parsed = parseBaselineScript(SCRIPT);
  assert.deepEqual(parsed.reportPlaceholders, ["README: placeholders", "security policy: placeholders"]);
  assert.deepEqual(parsed.reportFile, ["CODEOWNERS"]);
  assert.deepEqual(parsed.reportWorkflow, ["docs site: gate"]);
});

test("a placeholder item that the README table does not list is a problem", () => {
  const items = ["CODEOWNERS", "docs site: gate", "README: placeholders", "security policy: placeholders", ...INLINE_ITEMS];
  assert.deepEqual(baselineProblems(table(...items), SCRIPT).filter((p) => !p.includes("never prints")), []);
  const missing = baselineProblems(table(...items.filter((label) => label !== "README: placeholders")), SCRIPT);
  assert.ok(missing.some((p) => p.includes("README: placeholders")), missing.join("\n"));
});

test("a README row for an item the script no longer reports is a problem", () => {
  const stale = baselineProblems(table("CODEOWNERS", "docs site: gate", "README: placeholders", "security policy: placeholders", "gone: item", ...INLINE_ITEMS), SCRIPT);
  assert.ok(stale.some((p) => p.includes("gone: item")), stale.join("\n"));
});

test("an inline item the script never prints is a problem", () => {
  assert.equal(printsInline(SCRIPT, "docs site: parity"), true);
  assert.equal(printsInline(SCRIPT, "release: workflow pin age"), false);
});

test("every report_placeholders call in the real script names a starter that exists", () => {
  const script = read("bin/apply-repo-baseline.sh");
  const starters = [...script.matchAll(/^report_placeholders "[^"]+" (\S+) /gm)].map((m) => m[1]);
  assert.ok(starters.length >= 2, "the script calls it for SECURITY.md and README.md");
  for (const starter of starters) assert.ok(existsSync(path.join(root, "blueprint", "files", starter)), `blueprint/files/${starter}`);
});

test("the real script, README table and item list agree", () => {
  assert.deepEqual(baselineProblems(read("blueprint/README.md"), read("bin/apply-repo-baseline.sh")), []);
});
