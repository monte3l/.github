// SPDX-FileCopyrightText: Copyright (c) 2026 Enrico Lionello (enri3l) and Giulia Montevecchi (giulmonte), monte3l
// SPDX-License-Identifier: MIT

// A repository without a file the baseline looks for must be reported, not "could not be checked".
//
// apply-repo-baseline.sh runs with `set -eEuo pipefail` and `trap 'exit 3' ERR`, and `file_content` fails
// on a missing file (a 404 from `gh api`). An assignment from it that is not guarded with `|| true` turns
// every repository without that file into exit 3, which org-audit.yml reads as "could not be checked" and
// which `bin/new-repo.sh` reads as a failed check. A stub of the whole script would not have caught it, so
// this takes the real definitions out of the script and runs them under the script's own shell options.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

const root = path.join(import.meta.dirname, "..");
const script = readFileSync(path.join(root, "bin", "apply-repo-baseline.sh"), "utf8");
const lines = script.split("\n");

/** The text of `name() { ... }` as it is in the script. */
function definition(name) {
  const start = lines.findIndex((line) => line.startsWith(`${name}() {`));
  assert.ok(start >= 0, `${name}() is not in the script`);
  const end = lines.findIndex((line, i) => i > start && line === "}");
  return lines.slice(start, end + 1).join("\n");
}
const assignment = (prefix) => {
  const line = lines.find((l) => l.startsWith(prefix));
  assert.ok(line, `no line starts with ${prefix}`);
  return line;
};

/**
 * Runs `body` after the real file_content, skip and report_placeholders, with a gh that answers a contents
 * request from `files` and fails (like a 404) for any other path.
 * @param {Record<string, string>} files repository path to text
 * @param {string} body shell to run
 */
function run(files, body) {
  const dir = mkdtempSync(path.join(tmpdir(), "missing-"));
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    writeFileSync(path.join(dir, rel), text);
  }
  const program = `set -eEuo pipefail
trap 'exit 3' ERR
here=${JSON.stringify(path.join(root, "blueprint"))}
repo=monte3l/x mode=check ok=0 drift=0 skipped=0
gh() {
  local file=${JSON.stringify(dir)}/"\${2#repos/monte3l/x/contents/}"
  [[ -f "$file" ]] || return 1
  base64 <"$file"
}
${definition("file_content")}
${definition("skip")}
${definition("report_placeholders")}
${body}
echo "counts ok=$ok drift=$drift skipped=$skipped"
`;
  const result = spawnSync("bash", ["-c", program], { encoding: "utf8" });
  return { status: result.status, out: result.stdout, err: result.stderr };
}

const hint = '"hint"';
const callSecurity = `report_placeholders "security policy: placeholders" SECURITY.md ${hint} SECURITY.md .github/SECURITY.md docs/SECURITY.md`;
const callReadme = `report_placeholders "README: placeholders" README.md ${hint} README.md`;

test("docs.config.mjs missing: the assignment survives and leaves nothing in docs_config", () => {
  const { status, out, err } = run({}, `${assignment("docs_config=")}\necho "docs_config=[$docs_config]"`);
  assert.equal(status, 0, err);
  assert.match(out, /docs_config=\[\]/);
});

test("no security policy and no README anywhere: both items skip, nothing is drift, the run survives", () => {
  const { status, out, err } = run({}, `${callSecurity}\n${callReadme}`);
  assert.equal(status, 0, err);
  assert.match(out, /SKIP   security policy: placeholders/);
  assert.match(out, /SKIP   README: placeholders/);
  assert.match(out, /counts ok=0 drift=0 skipped=2/);
});

test("a policy at .github/SECURITY.md is found although the root path does not exist", () => {
  const { status, out, err } = run({ ".github/SECURITY.md": "# Security\n\nWritten by hand.\n" }, callSecurity);
  assert.equal(status, 0, err);
  assert.match(out, /OK     security policy: placeholders: \.github\/SECURITY\.md/);
  assert.match(out, /counts ok=1 drift=0 skipped=0/);
});

test("a copy that still has its starter prompts is drift, and still not a failed run", () => {
  const starter = readFileSync(path.join(root, "blueprint", "files", "README.md"), "utf8");
  const { status, out, err } = run({ "README.md": starter }, callReadme);
  assert.equal(status, 0, err);
  assert.match(out, /DRIFT  README: placeholders: README\.md still has \d+ unfilled prompt\(s\)/);
  assert.match(out, /counts ok=0 drift=1 skipped=0/);
});

test("an unguarded assignment from file_content does fail under the script's options (why the guard is needed)", () => {
  const { status } = run({}, 'unguarded="$(file_content docs.config.mjs)"\necho survived');
  assert.equal(status, 3, "exit 3 is what org-audit reads as could not be checked");
});
