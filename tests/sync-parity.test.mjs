// SPDX-FileCopyrightText: Copyright (c) 2026 Enrico Lionello (enri3l) and Giulia Montevecchi (giulmonte), monte3l
// SPDX-License-Identifier: MIT

// The parity gate for blueprint/sync.json.
// Run with: node --test "tests/*.test.mjs"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
const parity = (await import(new URL("../bin/sync-parity.mjs", import.meta.url).href)).default;
const base = () => ({
  sync: { flags: { manifest: "x" }, templates: { a: "managed", b: "unmanaged" }, repos: { "m3l-x": { flags: ["manifest"] } } },
  projects: [{ repo: ".github" }, { repo: "m3l-x" }],
  templates: { "a.yml": "name: a\n", "b.yml": "name: b\n" },
});
function tree(mut) {
  const c = base(); mut(c);
  const root = mkdtempSync(path.join(tmpdir(), "sp-"));
  mkdirSync(path.join(root, "blueprint")); mkdirSync(path.join(root, "workflow-templates"));
  writeFileSync(path.join(root, "blueprint/sync.json"), JSON.stringify(c.sync));
  writeFileSync(path.join(root, "blueprint/projects.json"), JSON.stringify(c.projects));
  for (const [n, t] of Object.entries(c.templates)) writeFileSync(path.join(root, "workflow-templates", n), t);
  return root;
}
let failed = 0;
async function expectProblem(name, mut, needle) {
  const root = tree(mut); const problems = await parity({ root }); rmSync(root, { recursive: true });
  const ok = needle === null ? problems.length === 0 : problems.some((p) => p.includes(needle));
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n       wanted: ${needle}\n       got: ${JSON.stringify(problems)}`}`); if (!ok) failed++;
}
await expectProblem("a consistent tree is clean", () => {}, null);
await expectProblem("a template not listed", (c) => { c.templates["c.yml"] = "x\n"; }, 'the template "c" is not listed');
await expectProblem("a listed template that does not exist", (c) => { c.sync.templates.zzz = "managed"; }, '"zzz", which is not a workflow template');
await expectProblem("a mode that does not exist", (c) => { c.sync.templates.a = "manage"; }, 'neither managed nor unmanaged');
await expectProblem("a repository not in projects.json", (c) => { c.sync.repos["m3l-nope"] = { flags: [] }; }, "not in blueprint/projects.json");
await expectProblem(".github is not a consumer", (c) => { c.sync.repos[".github"] = { flags: [] }; }, "whose workflows are its own");
await expectProblem("a repo sets an undeclared flag", (c) => { c.sync.repos["m3l-x"].flags = ["manifst"]; }, 'the flag "manifst", which is not declared');
await expectProblem("a marker names an undeclared flag", (c) => { c.templates["a.yml"] = "# sync:if nope\nx\n# sync:end\n"; }, 'the flag "nope" is not declared');
await expectProblem("a block that is never closed", (c) => { c.templates["a.yml"] = "# sync:if manifest\nx\n"; }, "never closed");
await expectProblem("a block closed twice", (c) => { c.templates["a.yml"] = "# sync:if manifest\nx\n# sync:end\n# sync:end\n"; }, "sync:end with no sync:if");
await expectProblem("a block opened inside a block", (c) => { c.templates["a.yml"] = "# sync:if manifest\n# sync:if manifest\nx\n# sync:end\n"; }, "opens inside");
await expectProblem("a well-formed block is fine", (c) => { c.templates["a.yml"] = "# sync:if manifest\nx\n# sync:end\n"; }, null);
await expectProblem("a marker with a trailing note is rejected, not silently ignored", (c) => { c.templates["a.yml"] = "# sync:if manifest  # note\nx\n# sync:end\n"; }, "looks like a sync marker");
await expectProblem("a misspelled marker is rejected", (c) => { c.templates["a.yml"] = "# sync:fi manifest\nx\n"; }, "looks like a sync marker");
console.log(failed ? `\n${failed} FAILED` : "\nALL SYNC-PARITY CASES BEHAVE"); process.exit(failed ? 1 : 0);
