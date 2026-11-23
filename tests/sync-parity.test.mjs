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
  files: {}, // blueprint/files/
  bootstrap: { starters: [] },
});
function tree(mut) {
  const c = base(); mut(c);
  const root = mkdtempSync(path.join(tmpdir(), "sp-"));
  mkdirSync(path.join(root, "blueprint")); mkdirSync(path.join(root, "workflow-templates"));
  writeFileSync(path.join(root, "blueprint/sync.json"), JSON.stringify(c.sync));
  writeFileSync(path.join(root, "blueprint/projects.json"), JSON.stringify(c.projects));
  for (const [n, t] of Object.entries(c.templates)) writeFileSync(path.join(root, "workflow-templates", n), t);
  mkdirSync(path.join(root, "blueprint/files"));
  for (const [n, t] of Object.entries(c.files)) writeFileSync(path.join(root, "blueprint/files", n), t);
  writeFileSync(path.join(root, "blueprint/bootstrap.json"), JSON.stringify(c.bootstrap));
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

// Starters: verbatim files in blueprint/files/ that the sync keeps current at the paths a repository has them at.
const withStarter = (c, entry = { mode: "managed", paths: [".x.toml"] }, to = ".x.toml") => {
  c.sync.starters = { "x.toml": entry };
  c.files["x.toml"] = "# x\n";
  c.bootstrap.starters = [{ from: "blueprint/files/x.toml", to }];
};
await expectProblem("a consistent starter is clean", (c) => withStarter(c), null);
await expectProblem("a starter with several paths is clean when the first is where bootstrap writes it", (c) => withStarter(c, { mode: "managed", paths: [".x.toml", "conf/x.toml"] }), null);
await expectProblem("a starter that is not in blueprint/files", (c) => { withStarter(c); delete c.files["x.toml"]; }, "is not in blueprint/files/");
await expectProblem("a starter mode that does not exist", (c) => withStarter(c, { mode: "manage", paths: [".x.toml"] }), 'neither managed nor unmanaged');
await expectProblem("a starter without paths", (c) => withStarter(c, { mode: "managed" }), 'needs a non-empty "paths" array');
await expectProblem("a starter with an empty list of paths", (c) => withStarter(c, { mode: "managed", paths: [] }), 'needs a non-empty "paths" array');
await expectProblem("a starter path that leaves the repository", (c) => withStarter(c, { mode: "managed", paths: ["../x.toml"] }, "../x.toml"), "leaves the repository");
await expectProblem("a starter path in the middle that leaves the repository", (c) => withStarter(c, { mode: "managed", paths: ["a/../../x.toml"] }, "a/../../x.toml"), "leaves the repository");
await expectProblem("an absolute starter path", (c) => withStarter(c, { mode: "managed", paths: ["/etc/x.toml"] }, "/etc/x.toml"), "absolute path");
await expectProblem("a starter path inside .git", (c) => withStarter(c, { mode: "managed", paths: [".git/hooks/x"] }, ".git/hooks/x"), "inside .git");
await expectProblem("a starter path with a glob", (c) => withStarter(c, { mode: "managed", paths: ["*.toml"] }, "*.toml"), "glob or backslash");
await expectProblem("a starter path that is not a string", (c) => withStarter(c, { mode: "managed", paths: [7] }, 7), "not a non-empty string");
await expectProblem("a starter path listed twice", (c) => withStarter(c, { mode: "managed", paths: [".x.toml", ".x.toml"] }), "lists a path twice");
await expectProblem("a starter that bootstrap does not write", (c) => { withStarter(c); c.bootstrap.starters = []; }, "would not get it");
await expectProblem("a starter whose first path is not where bootstrap writes it", (c) => withStarter(c, { mode: "managed", paths: ["conf/x.toml", ".x.toml"] }, ".x.toml"), 'has "conf/x.toml" as its first path');
await expectProblem("a starter with the name of a template", (c) => { c.sync.templates.x = "managed"; c.templates["x.yml"] = "name: x\n"; c.sync.starters = { x: { mode: "managed", paths: [".x"] } }; c.files.x = "x"; c.bootstrap.starters = [{ from: "blueprint/files/x", to: ".x" }]; }, "has the name of a workflow template");
await expectProblem("a repository path for a template is clean", (c) => { c.sync.repos["m3l-x"].paths = { a: ".github/workflows/ci.yml" }; }, null);
await expectProblem("a repository path for a starter is clean", (c) => { withStarter(c); c.sync.repos["m3l-x"].paths = { "x.toml": "conf/x.toml" }; }, null);
await expectProblem("a repository path for something that is neither", (c) => { c.sync.repos["m3l-x"].paths = { nope: "x.yml" }; }, "neither a workflow template nor a starter");
await expectProblem("a repository path that leaves the repository", (c) => { c.sync.repos["m3l-x"].paths = { a: "../ci.yml" }; }, "leaves the repository");

// `requires`: a starter that is refreshed only beside another (the push guard and its helper).
const withPair = (c, requires) => {
  c.sync.starters = { "g.mjs": { mode: "managed", paths: [".g.mjs"], ...(requires === undefined ? {} : { requires }) }, "h.mjs": { mode: "managed", paths: [".h.mjs"] } };
  c.files["g.mjs"] = "g\n";
  c.files["h.mjs"] = "h\n";
  c.bootstrap.starters = [{ from: "blueprint/files/g.mjs", to: ".g.mjs" }, { from: "blueprint/files/h.mjs", to: ".h.mjs" }];
};
await expectProblem("a starter that requires another starter is clean", (c) => withPair(c, ["h.mjs"]), null);
await expectProblem("a starter that requires itself", (c) => withPair(c, ["g.mjs"]), "requires itself");
await expectProblem("a starter that requires something that is not a starter", (c) => withPair(c, ["nope.mjs"]), 'requires "nope.mjs", which is not a starter');
await expectProblem("a requires that is not a list", (c) => withPair(c, "h.mjs"), 'a "requires" that is not a list of starter names');
await expectProblem("a requires with a name that is not a string", (c) => withPair(c, [7]), 'a "requires" that is not a list of starter names');
// `skip`: a repository leaves a template or a starter out.
await expectProblem("a repository that skips a template and a starter is clean", (c) => { withPair(c); c.sync.repos["m3l-x"].skip = ["a", "g.mjs"]; }, null);
await expectProblem("a repository that skips a name that is neither", (c) => { c.sync.repos["m3l-x"].skip = ["nope"]; }, 'skips "nope", which is neither a workflow template nor a starter');
await expectProblem("a skip that is not a list", (c) => { c.sync.repos["m3l-x"].skip = "a"; }, 'a "skip" that is not a list');
await expectProblem("a skip that lists a name twice", (c) => { c.sync.repos["m3l-x"].skip = ["a", "a"]; }, 'lists a name twice under "skip"');
console.log(failed ? `\n${failed} FAILED` : "\nALL SYNC-PARITY CASES BEHAVE"); process.exit(failed ? 1 : 0);
