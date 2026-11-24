// SPDX-FileCopyrightText: Copyright (c) 2026 Enrico Lionello (enri3l) and Giulia Montevecchi (giulmonte), monte3l
// SPDX-License-Identifier: MIT

// Every `environment:` a workflow names must be listed in .github/environments.json. The weekly cleanup
// deletes an unlisted environment, or leaves it alone and reports it when it holds secrets or reviewers, so an
// unlisted one is either lost or a standing finding. blueprint/README.md, "Environment cleanup", says to add
// the name in the same change as the workflow that uses it.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const root = path.join(import.meta.dirname, "..");
const listed = Object.keys(JSON.parse(readFileSync(path.join(root, ".github", "environments.json"), "utf8")).environments);

/** The environment names used by the workflows in a folder: `environment: NAME` or `environment:` then `name: NAME`. */
function used(dir) {
  const names = [];
  for (const file of readdirSync(path.join(root, dir)).filter((f) => f.endsWith(".yml"))) {
    const text = readFileSync(path.join(root, dir, file), "utf8");
    for (const m of text.matchAll(/^\s+environment:\s*([A-Za-z0-9_-]+)\s*(?:#.*)?$/gm)) names.push({ file: `${dir}/${file}`, name: m[1] });
    for (const m of text.matchAll(/^\s+environment:\s*\n\s+name:\s*([A-Za-z0-9_-]+)/gm)) names.push({ file: `${dir}/${file}`, name: m[1] });
  }
  return names;
}

test("every environment this repository's workflows use is listed in environments.json", () => {
  const found = used(".github/workflows");
  assert.ok(found.length > 0, "the scan found no environment: the pattern is stale");
  const missing = found.filter(({ name }) => !listed.includes(name)).map(({ file, name }) => `${file}: ${name}`);
  assert.deepEqual(missing, []);
});

test("every listed environment is used by a workflow", () => {
  const names = new Set(used(".github/workflows").map(({ name }) => name));
  assert.deepEqual(listed.filter((name) => !names.has(name)), []);
});
