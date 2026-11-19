// SPDX-FileCopyrightText: Copyright (c) 2026 Enrico Lionello (enri3l) and Giulia Montevecchi (giulmonte), monte3l
// SPDX-License-Identifier: MIT

// bin/lib/leftover-placeholders.sh: which prompts from a blueprint starter a repository's copy still has.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const root = path.join(import.meta.dirname, "..");
const script = path.join(root, "bin", "lib", "leftover-placeholders.sh");
const starterPath = (name) => path.join(root, "blueprint", "files", name);

/** Runs the detector for a starter with `input` as the repository's copy. */
function detect(starter, input) {
  const result = spawnSync("bash", [script, starterPath(starter)], { input, encoding: "utf8" });
  return { status: result.status, found: result.stdout.split("\n").filter(Boolean), stderr: result.stderr };
}

test("an untouched starter reports its prompts and exits 1", () => {
  for (const name of ["SECURITY.md", "README.md"]) {
    const { status, found } = detect(name, readFileSync(starterPath(name), "utf8"));
    assert.equal(status, 1, name);
    assert.ok(found.includes("{repo}"), `${name} keeps the {repo} token`);
    assert.ok(found.length >= 3, `${name} reports its prompts, got ${found.length}`);
  }
});

test("a filled copy is clean", () => {
  const filled = "# Security\n\nThis covers `m3l-x`: a CLI that checks things.\n\nReport at https://github.com/monte3l/m3l-x/security/advisories/new\n";
  const { status, found } = detect("SECURITY.md", filled);
  assert.equal(status, 0);
  assert.deepEqual(found, []);
});

test("braces in code samples and prose are not placeholders", () => {
  const readme = [
    "# m3l-x",
    "",
    "```json",
    '{ "name": "m3l-x", "private": true }',
    "```",
    "",
    "Use `${{ secrets.TOKEN }}` and the object `{ a: 1 }`, or a template like {name} in a path.",
    "",
  ].join("\n");
  const { status, found } = detect("README.md", readme);
  assert.equal(status, 0, found.join(", "));
});

test("only the prompt that is still there is reported", () => {
  const starter = readFileSync(starterPath("SECURITY.md"), "utf8");
  const left = /\{One sentence on who maintains it[^{}\n]*/.exec(starter)[0];
  const { status, found } = detect("SECURITY.md", `# Security\n\nWritten by hand.\n\n${left}}\n`);
  assert.equal(status, 1);
  assert.equal(found.length, 1, found.join(", "));
  assert.ok(left.startsWith(found[0]) && found[0].startsWith("{One sentence"), `reported "${found[0]}"`);
});

test("an unreplaced {repo} token is reported on its own", () => {
  const { status, found } = detect("README.md", "# {repo}\n\nA real paragraph.\n");
  assert.equal(status, 1);
  assert.deepEqual(found, ["{repo}"]);
});

test("a leftover starter comment is reported", () => {
  const { status, found } = detect("SECURITY.md", "<!-- Starting point for SECURITY.md. Remove me. -->\n# Security\n");
  assert.equal(status, 1);
  assert.deepEqual(found, ["<!-- Starting point"]);
});

test("a missing starter is a usage error", () => {
  const result = spawnSync("bash", [script, "/nonexistent/starter.md"], { input: "x", encoding: "utf8" });
  assert.equal(result.status, 2);
});
