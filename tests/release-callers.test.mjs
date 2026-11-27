// SPDX-FileCopyrightText: Copyright (c) 2026 Enrico Lionello (enri3l) and Giulia Montevecchi (giulmonte), monte3l
// SPDX-License-Identifier: MIT

// The shared release workflows are called from each repository's release.yml. Two rules hold that together:
// a caller job must grant at least what the called file's jobs ask for (GitHub refuses the whole run at
// startup otherwise), and the baseline's pin items must watch every file in `finalize` of release.json.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const root = path.join(import.meta.dirname, "..");
const read = (rel) => readFileSync(path.join(root, rel), "utf8");

/** The text of every top-level job of a workflow, by name. */
function jobs(text) {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => line === "jobs:");
  assert.ok(start >= 0, "no jobs");
  const found = {};
  let name = null;
  for (const line of lines.slice(start + 1)) {
    const key = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (key) {
      name = key[1];
      found[name] = [];
    } else if (name) found[name].push(line);
  }
  return Object.fromEntries(Object.entries(found).map(([k, v]) => [k, v.join("\n")]));
}

/** The permission map of a job at four spaces of indent, or null when it declares none. */
function permissions(block) {
  const lines = block.split("\n");
  const at = lines.findIndex((line) => /^ {4}permissions:/.test(line));
  if (at < 0) return null;
  if (/\{\}\s*$/.test(lines[at])) return {};
  const map = {};
  for (let i = at + 1; i < lines.length && /^ {6}\S/.test(lines[i]); i += 1) {
    const [key, value] = lines[i].trim().split(/:\s*/);
    map[key] = value;
  }
  return map;
}

/** The strongest level of each permission any job of a file declares. */
function union(text) {
  const rank = { none: 0, read: 1, write: 2 };
  const out = {};
  for (const block of Object.values(jobs(text))) {
    for (const [key, value] of Object.entries(permissions(block) ?? {})) {
      if ((rank[value] ?? 0) > (rank[out[key]] ?? -1)) out[key] = value;
    }
  }
  return out;
}

/** The permissions a caller job grants the called file, as the same kind of map. */
function covers(granted, needed) {
  const rank = { none: 0, read: 1, write: 2 };
  return Object.entries(needed).every(([key, value]) => (rank[granted[key]] ?? 0) >= rank[value]);
}

/** Every `uses: ./.github/workflows/release-*.yml` or `monte3l/.github/.github/workflows/release-*.yml@...` call in a caller. */
function calls(text) {
  const result = [];
  for (const [name, block] of Object.entries(jobs(text))) {
    const uses = /^ {4}uses: .*\/workflows\/(release-[a-z]+\.yml)/m.exec(block);
    if (uses) result.push({ job: name, file: uses[1], granted: permissions(block) ?? {} });
  }
  return result;
}

test("covers: a caller that grants less than the called job asks for is caught", () => {
  assert.equal(covers({ contents: "write" }, { contents: "write", "id-token": "write" }), false);
  assert.equal(covers({ contents: "write", "id-token": "write" }, { contents: "write" }), true);
  assert.equal(covers({ contents: "read" }, { contents: "write" }), false);
});

test("workflow-templates/release.yml grants every shared release job at least what the called file asks for", () => {
  const found = calls(read("workflow-templates/release.yml"));
  assert.ok(found.length >= 2, "the template calls prepare and finalize");
  for (const { job, file, granted } of found) {
    const needed = union(read(`.github/workflows/${file}`));
    assert.ok(Object.keys(needed).length > 0, `${file} declares no permissions`);
    assert.ok(covers(granted, needed), `release.yml job ${job} grants ${JSON.stringify(granted)}, ${file} asks for ${JSON.stringify(needed)}`);
  }
});

test("the template calls release-finalize.yml, which it attests with by default", () => {
  assert.ok(calls(read("workflow-templates/release.yml")).some((call) => call.file === "release-finalize.yml"));
});

test("every release-*.yml shared workflow is listed in release.json, so the pin checks watch it", () => {
  const listed = JSON.parse(read("blueprint/release.json"));
  const names = [listed.workflow, ...listed.finalize].map((file) => path.basename(file)).sort();
  const onDisk = readdirSync(path.join(root, ".github", "workflows"))
    .filter((file) => /^release-[a-z]+\.yml$/.test(file))
    .sort();
  // release-publish.yml arrives in its own pull request: listing it before then is fine, leaving a file out is not.
  for (const file of onDisk) assert.ok(names.includes(file), `${file} is not in release.json`);
});

/** Runs the script's own `release_pins=` line over some workflow text. */
function pinsFound(workflowsText) {
  const release = JSON.parse(read("blueprint/release.json"));
  const line = read("bin/apply-repo-baseline.sh")
    .split("\n")
    .find((l) => l.trim().startsWith('release_pins="$(grep'));
  assert.ok(line, "the release_pins line moved");
  const program = `set -eEuo pipefail
release_prepare=${JSON.stringify(release.workflow)}
files=(${release.finalize.map((f) => JSON.stringify(f)).join(" ")})
release_finalize_alt="$(printf '%s\\n' "\${files[@]//./\\\\.}" | paste -sd'|' -)"
workflows_text=${JSON.stringify(workflowsText)}
${line}
printf '%s\\n' "$release_pins"
`;
  const result = spawnSync("bash", ["-c", program], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim().split("\n").filter(Boolean);
}

test("the baseline's pin grep finds a pin on each of the three shared files", () => {
  const sha = (c) => c.repeat(40);
  const base = "monte3l/.github/.github/workflows";
  assert.deepEqual(pinsFound(`uses: ${base}/release-prepare.yml@${sha("a")}`), [sha("a")]);
  assert.deepEqual(pinsFound(`uses: ${base}/release-finalize.yml@${sha("b")}`), [sha("b")]);
  assert.deepEqual(pinsFound(`uses: ${base}/release-publish.yml@${sha("c")}`), [sha("c")]);
});

test("a repository that calls none of them has no pins to check", () => {
  assert.deepEqual(pinsFound(`uses: other/repo/.github/workflows/release-publish.yml@${"d".repeat(40)}`), []);
});
