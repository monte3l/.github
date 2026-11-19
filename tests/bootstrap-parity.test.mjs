// SPDX-FileCopyrightText: Copyright (c) 2026 Enrico Lionello (enri3l) and Giulia Montevecchi (giulmonte), monte3l
// SPDX-License-Identifier: MIT

// The parity gate for blueprint/bootstrap.json, including odd input.
// Run with: node --test "tests/*.test.mjs"
import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import parity from "../bin/bootstrap-parity.mjs";
const SRC = path.resolve(import.meta.dirname, "..");
async function run(mutate) {
  const root = mkdtempSync(path.join(tmpdir(), "bp-"));
  for (const p of ["blueprint/files", "workflow-templates", "LICENSE", "LICENSES", ".node-version"]) { mkdirSync(path.dirname(path.join(root, p)), { recursive: true }); cpSync(path.join(SRC, p), path.join(root, p), { recursive: true }); }
  cpSync(path.join(SRC, "blueprint/sync.json"), path.join(root, "blueprint/sync.json"));
  const data = JSON.parse(readFileSync(path.join(SRC, "blueprint/bootstrap.json"), "utf8"));
  const raw = mutate({ data, root }); const text = typeof raw === "string" ? raw : null;
  if (text === "DELETE") rmSync(path.join(root, "blueprint/bootstrap.json"), { force: true }); else writeFileSync(path.join(root, "blueprint/bootstrap.json"), text ?? JSON.stringify(data));
  const out = await parity({ root });
  rmSync(root, { recursive: true });
  return out;
}
const has = (out, text) => assert.ok(out.some((m) => m.includes(text)), `expected "${text}" in ${JSON.stringify(out)}`);
assert.deepEqual(await run(() => {}), [], "real data is clean");
has(await run(({ data }) => data.starters.push({ from: "blueprint/files/nope", to: "x" })), "not a file that exists");
has(await run(({ data }) => { data.starters = data.starters.filter((entry) => entry.from !== "blueprint/files/CODEOWNERS"); }), "blueprint/files/CODEOWNERS is neither a starter, a template nor excluded");
has(await run(({ data }) => data.templates.pop()), "workflow-templates/environments.yml is neither");
has(await run(({ data }) => { data.templates = data.templates.filter((entry) => entry.name !== "claude"); }), "workflow-templates/claude.yml is neither");
has(await run(({ data }) => data.starters.push({ from: "LICENSE", to: "README.md" })), "both write README.md");
has(await run(({ data }) => data.starters.push({ from: "LICENSE", to: "../outside" })), "not a relative path");
has(await run(({ data }) => data.starters.push({ from: "LICENSE", to: "/abs" })), "not a relative path");
has(await run(({ data }) => data.starters.push({ from: "LICENSE", to: ".github/workflows/x.yml" })), "is for \"templates\"");
has(await run(({ data }) => data.starters.push({ from: "LICENSE", to: "L2", requires: "cloud" })), "neither \"kind\", \"public\" nor a declared option");
has(await run(({ data }) => data.starters.push({ from: "LICENSE", to: "L2", substitute: ["{nothing}"] })), "does not contain");
has(await run(({ data }) => data.templates.push({ name: "ghost" })), "not in workflow-templates");
has(await run(({ data }) => data.templates.push({ name: "dco" })), "listed twice");
has(await run(({ data }) => data.kinds.push("tool")), "release-please/tool.json, which is not a file that exists");
has(await run(({ data }) => data.excluded.push({ from: "LICENSE" })), "needs a \"reason\"");
has(await run(({ data }) => data.generated.push({ to: "x" })), "needs \"what\"");
has(await run(({ data }) => { delete data.starters; }), "\"starters\" must be an array");
has(await run(() => "{ not json"), "blueprint/bootstrap.json:");
has(await run(({ root }) => { writeFileSync(path.join(root, "blueprint/files/new-starter.yml"), "x: 1\n"); }), "new-starter.yml is neither");
has(await run(({ root }) => { writeFileSync(path.join(root, "workflow-templates/new.yml"), "x: 1\n"); }), "workflow-templates/new.yml is neither");
const ok = await run(({ data, root }) => { data.excluded.push({ from: "blueprint/files/new-starter.yml", reason: "test" }); writeFileSync(path.join(root, "blueprint/files/new-starter.yml"), "x\n"); });
assert.deepEqual(ok, [], "an excluded file with a reason is fine");

// the reviewer's crash and bypass cases
has(await run(() => "null"), "must be an object");
has(await run(() => "[]"), "must be an object");
has(await run(() => "DELETE"), "missing, and bin/new-repo.sh reads it");
has(await run(({ root }) => { rmSync(path.join(root, "blueprint/sync.json")); }), "blueprint/sync.json: cannot be read");
has(await run(({ data }) => { data.starters[0] = null; }), "starters[0] must be an object");
has(await run(({ data }) => { data.templates[0] = 5; }), "templates[0] must be an object");
has(await run(({ data }) => { data.generated[0] = "x"; }), "generated[0] must be an object");
has(await run(({ data }) => { data.excluded[0] = []; }), "excluded[0] must be an object");
has(await run(({ data }) => data.starters.push({ from: "blueprint/files/release-please", to: "d" })), "not a file that exists");
has(await run(({ data }) => data.starters.push({ from: "LICENSE", to: "L2", substitute: 5 })), "must be an array of non-empty words");
has(await run(({ data }) => data.starters.push({ from: "LICENSE", to: "L2", substitute: "{repo}" })), "must be an array of non-empty words");
has(await run(({ data }) => data.starters.push({ from: "LICENSE", to: ".git/hooks/pre-commit" })), "outside .git");
has(await run(({ data }) => data.starters.push({ from: "LICENSE", to: ".GIT/config" })), "outside .git");
has(await run(({ data }) => data.starters.push({ from: "LICENSE", to: ".GitHub/workflows/x.yml" })), "is for \"templates\"");
has(await run(({ data }) => data.starters.push({ from: "../../etc/hosts", to: "h" })), "not a relative path inside the repository");
has(await run(({ data }) => data.starters.push({ from: "/etc/hosts", to: "h" })), "not a relative path inside the repository");
has(await run(({ data }) => data.excluded.push({ from: "../x", reason: "r" })), "not a relative path inside the repository");
has(await run(({ data }) => data.starters.push({ from: "LICENSE", to: "L2", requries: "docs" })), "\"requries\" , which is not a key".replace(" ,", ","));
has(await run(({ data }) => { data.extra = 1; }), "\"extra\" is not a key");
has(await run(({ data }) => data.templates.push({ name: "constructor" })), "not in workflow-templates");
has(await run(({ data }) => data.templates.push({ name: "sub/x" })), "needs a \"name\"");
has(await run(({ data }) => data.options.push("kind")), "is not an option");
has(await run(({ data }) => data.options.push("claude")), "lists an option twice");
has(await run(({ data }) => data.kinds.push("library")), "lists a kind twice");
has(await run(({ data }) => data.kinds.push("Bad")), "not a lowercase word");
has(await run(({ data }) => { data.kinds = []; }), "perKind but \"kinds\" is empty");
has(await run(({ data }) => { data.starters.push({ from: "LICENSE", to: "L2", perKind: "yes" }); }), "must be true or false");
assert.deepEqual(await run(({ root }) => { writeFileSync(path.join(root, "blueprint/files/.DS_Store"), "x"); }), [], "a .DS_Store is not a starter");
has(await run(({ data }) => data.starters.push({ from: "LICENSE", to: "L2", replace: { "no such text": "x" } })), "which LICENSE does not contain");
has(await run(({ data }) => data.starters.push({ from: "LICENSE", to: "L2", replace: { "MIT": 5 } })), "must map non-empty texts to strings");
has(await run(({ data }) => data.starters.push({ from: "LICENSE", to: "L2", replace: [] })), "must map non-empty texts to strings");
has(await run(({ data }) => { data.templates[0].unlessScaffold = "yes"; }), "must be true or false");
has(await run(({ data }) => data.options.push("public")), "is not an option");
has(await run(({ data }) => { data.orgSecrets = "x"; }), "\"orgSecrets\" must be an array");
has(await run(({ data }) => data.orgSecrets.push("lower")), "is not a secret name or {name, requires}");
has(await run(({ data }) => data.orgSecrets.push("GITLEAKS_LICENSE")), "lists a secret twice");
has(await run(({ data }) => { data.templates[0].todo = ""; }), "\"todo\" must be a non-empty line");
has(await run(({ data }) => data.starters.push({ from: "LICENSE", to: "L2", todo: 5 })), "\"todo\" must be a non-empty line");
assert.deepEqual(await run(({ data }) => { data.templates[0].requires = "public"; }), [], "public is a declared condition");
// negation, opposites, tokens, todos, secrets with conditions
assert.deepEqual(await run(({ data }) => { data.starters.push({ from: "LICENSE", to: "L2", requires: "docs" }, { from: "LICENSE", to: "L2", requires: "!docs" }); }), [], "X and !X may write one path");
has(await run(({ data }) => { data.starters.push({ from: "LICENSE", to: "L2", requires: "docs" }, { from: "LICENSE", to: "L2", requires: "docs" }); }), "both write L2");
has(await run(({ data }) => { data.starters.push({ from: "LICENSE", to: "L2", requires: "docs" }, { from: "LICENSE", to: "L2" }); }), "both write L2");
has(await run(({ data }) => { data.starters.push({ from: "LICENSE", to: "L2", requires: "!cloud" }); }), "neither \"kind\", \"public\" nor a declared option");
has(await run(({ data }) => { data.starters.push({ from: "LICENSE", to: "L2", replace: { "MIT": "{nope}" } }); }), "uses {nope} in a replace value");
assert.deepEqual(await run(({ data }) => { data.starters.push({ from: "LICENSE", to: "L2", replace: { "MIT": "{repo}-{site}-{host}-{subdomain}" } }); }), [], "known tokens are fine");
has(await run(({ data }) => { data.todos.push({ text: "see {nope}" }); }), "uses {nope}");
has(await run(({ data }) => { data.todos.push({ text: "" }); }), "needs \"text\"");
has(await run(({ data }) => { data.todos.push({ text: "x", requires: "cloud" }); }), "neither \"kind\", \"public\" nor a declared option");
has(await run(({ data }) => { data.todos.push({ text: "x", extra: 1 }); }), "\"extra\", which is not a key");
has(await run(({ data }) => { data.todos = "x"; }), "\"todos\" must be an array");
has(await run(({ data }) => data.orgSecrets.push({ name: "OTHER", requires: "cloud" })), "neither \"kind\", \"public\" nor a declared option");
has(await run(({ data }) => data.orgSecrets.push({ name: "bad" })), "is not a secret name or {name, requires}");
has(await run(({ data }) => data.orgSecrets.push({ name: "OTHER", extra: 1 })), "is not a secret name or {name, requires}");
has(await run(({ data }) => data.orgSecrets.push({ name: "GITLEAKS_LICENSE", requires: "docs" })), "lists a secret twice");
assert.deepEqual(await run(({ data }) => data.orgSecrets.push({ name: "OTHER", requires: "docs" })), [], "a conditional secret is fine");
has(await run(({ data }) => { data.starters.push({ from: "LICENSE", to: "L3", requires: "docs" }, { from: "LICENSE", to: "L3", requires: "!docs" }, { from: "LICENSE", to: "L3", requires: "docs" }); }), "both write L3");
has(await run(({ data }) => { data.starters.push({ from: "LICENSE", to: "L3", requires: "docs" }, { from: "LICENSE", to: "L3", requires: "!docs" }, { from: "LICENSE", to: "L3", requires: "!docs" }); }), "both write L3");
console.log("BOOTSTRAP PARITY BEHAVES");
