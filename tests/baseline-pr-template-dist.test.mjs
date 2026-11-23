// SPDX-FileCopyrightText: Copyright (c) 2026 Enrico Lionello (enri3l) and Giulia Montevecchi (giulmonte), monte3l
// SPDX-License-Identifier: MIT

// `pull request template: org checklist` and `build output: dist not committed` of apply-repo-baseline.sh.
// Like baseline-missing-files, this takes the real definitions out of the script and runs them under the
// script's own shell options, with a gh that serves a repository from a folder: a file answers a contents
// request with its base64 text, a folder answers without output, anything else fails like a 404.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

const root = path.join(import.meta.dirname, "..");
const lines = readFileSync(path.join(root, "bin", "apply-repo-baseline.sh"), "utf8").split("\n");

/** The text of `name() { ... }` as it is in the script. */
function definition(name) {
  const start = lines.findIndex((line) => line.startsWith(`${name}() {`));
  assert.ok(start >= 0, `${name}() is not in the script`);
  const end = lines.findIndex((line, i) => i > start && line === "}");
  return lines.slice(start, end + 1).join("\n");
}

/**
 * @param {Record<string, string>} files repository path to text; a path with a trailing slash is a folder
 * @param {string} fn the function to call
 * @param {string} [repo] the repository name
 */
function run(files, fn, repo = "monte3l/x") {
  const dir = mkdtempSync(path.join(tmpdir(), "pr-template-"));
  for (const [rel, text] of Object.entries(files)) {
    if (rel.endsWith("/")) mkdirSync(path.join(dir, rel), { recursive: true });
    else {
      mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
      writeFileSync(path.join(dir, rel), text);
    }
  }
  const program = `set -eEuo pipefail
trap 'exit 3' ERR
repo=${JSON.stringify(repo)} mode=check ok=0 drift=0 skipped=0
gh() {
  local target=${JSON.stringify(dir)}/"\${2#repos/*/contents/}"
  if [[ -d "$target" ]]; then return 0; fi
  [[ -f "$target" ]] || return 1
  base64 <"$target"
}
${definition("file_content")}
${definition("skip")}
${definition(fn)}
${fn}
echo "counts ok=$ok drift=$drift skipped=$skipped"
`;
  const r = spawnSync("bash", ["-c", program], { encoding: "utf8" });
  return { status: r.status, out: r.stdout, err: r.stderr };
}

const ORG = "- [ ] Every commit is signed off (`git commit -s`) and signed\n- [ ] The title is a Conventional Commit\n- [ ] a bug fix has a regression test\n";

test("no template of its own: the org template applies", () => {
  const { status, out, err } = run({}, "check_pr_template");
  assert.equal(status, 0, err);
  assert.match(out, /OK     pull request template: org checklist: the org template applies/);
  assert.match(out, /counts ok=1 drift=0/);
});

test("a local template that keeps the three items is fine, wherever GitHub finds it", () => {
  for (const where of [".github/pull_request_template.md", "pull_request_template.md", "docs/PULL_REQUEST_TEMPLATE.md"]) {
    const { status, out, err } = run({ [where]: `## What\n\n${ORG}- [ ] pnpm test:e2e passes\n` }, "check_pr_template");
    assert.equal(status, 0, err);
    assert.match(out, /OK     pull request template: org checklist: the local template keeps it/, where);
  }
});

test("a local template that drops items is drift, and names what is missing", () => {
  const noSignoff = run({ ".github/pull_request_template.md": "- [ ] The title is a Conventional Commit\n- [ ] regression test\n" }, "check_pr_template");
  assert.match(noSignoff.out, /DRIFT  pull request template: org checklist: the local template lacks the sign-off\n/);
  const none = run({ ".github/pull_request_template.md": "## What\n\nPlease describe.\n" }, "check_pr_template");
  assert.match(none.out, /lacks the sign-off, the Conventional Commit title, the regression test\n/);
  assert.match(none.out, /counts ok=0 drift=1/);
});

test("a folder of templates replaces the org template and is drift", () => {
  const { status, out, err } = run({ ".github/PULL_REQUEST_TEMPLATE/": "" }, "check_pr_template");
  assert.equal(status, 0, err);
  assert.match(out, /DRIFT  pull request template: org checklist: \.github\/PULL_REQUEST_TEMPLATE\/ replaces the org template/);
});

test("the repository that holds the org defaults is skipped", () => {
  const { out } = run({ ".github/PULL_REQUEST_TEMPLATE/": "" }, "check_pr_template", "monte3l/.github");
  assert.match(out, /SKIP   pull request template: org checklist \(this repository holds the org defaults\)/);
  assert.match(out, /drift=0 skipped=1/);
});

test("a committed dist/ is drift and its absence is clean", () => {
  const drift = run({ "dist/": "" }, "check_committed_dist");
  assert.equal(drift.status, 0, drift.err);
  assert.match(drift.out, /DRIFT  build output: dist not committed: dist\/ is in the repository/);
  const clean = run({ "src/index.ts": "export {};\n" }, "check_committed_dist");
  assert.match(clean.out, /OK     build output: dist not committed\n/);
  assert.match(clean.out, /counts ok=1 drift=0/);
});
