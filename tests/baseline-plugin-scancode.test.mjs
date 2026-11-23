// SPDX-FileCopyrightText: Copyright (c) 2026 Enrico Lionello (enri3l) and Giulia Montevecchi (giulmonte), monte3l
// SPDX-License-Identifier: MIT

// The plugin rules and `ScanCode: last run` of apply-repo-baseline.sh. Like baseline-missing-files, this
// takes the real definitions out of the script and runs them under the script's own shell options, with a
// gh that serves repository files and `gh run list` answers, so a 404 on a file and a run that never
// happened are the cases the script really meets.
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
 * @param {Record<string, string>} files repository path to text; any other contents request fails like a 404
 * @param {string} body shell to run after the definitions
 * @param {{ runs?: unknown[], workflows?: string, scancodeWf?: string }} [options] what `gh run list` returns (JSON), the workflows' text, the ScanCode workflow file
 */
function run(files, body, { runs = [], workflows = "", scancodeWf = "" } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "plugin-scancode-"));
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    writeFileSync(path.join(dir, rel), text);
  }
  const program = `set -eEuo pipefail
trap 'exit 3' ERR
repo=monte3l/x mode=check ok=0 drift=0 skipped=0
workflows_text=${JSON.stringify(workflows)}
scancode_wf=${JSON.stringify(scancodeWf)}
gh() {
  if [[ "$1" == run ]]; then
    local expr="" prev=""
    for a in "$@"; do [[ "$prev" == --jq ]] && expr="$a"; prev="$a"; done
    printf '%s' ${JSON.stringify(JSON.stringify(runs))} | jq -r "$expr"
    return
  fi
  local file=${JSON.stringify(dir)}/"\${2#repos/monte3l/x/contents/}"
  [[ -f "$file" ]] || return 1
  base64 <"$file"
}
${definition("file_content")}
${definition("skip")}
${definition("report_workflow")}
${definition("check_scancode_last_run")}
${definition("check_plugin_rules")}
${body}
echo "counts ok=$ok drift=$drift skipped=$skipped"
`;
  const r = spawnSync("bash", ["-c", program], { encoding: "utf8" });
  return { status: r.status, out: r.stdout, err: r.stderr };
}

const PLUGIN = { ".claude-plugin/plugin.json": "{}" };
const VALIDATE = "      - run: claude plugin validate --strict .\n";
const METADATA = "      - run: node bin/check-plugin-metadata.mjs\n";

test("a repository that is not a plugin skips the plugin rules and counts no drift", () => {
  const { status, out, err } = run({}, "check_plugin_rules");
  assert.equal(status, 0, err);
  assert.match(out, /SKIP   plugin: rules/);
  assert.match(out, /counts ok=0 drift=0 skipped=1/);
});

test("a plugin that follows the rules is clean", () => {
  const { status, out, err } = run(PLUGIN, "check_plugin_rules", { workflows: VALIDATE + METADATA });
  assert.equal(status, 0, err);
  assert.match(out, /OK     plugin: validate/);
  assert.match(out, /OK     plugin: metadata check/);
  assert.match(out, /OK     plugin: root CLAUDE.md: none/);
  assert.match(out, /OK     plugin: marketplace.json: none/);
  assert.match(out, /counts ok=4 drift=0 skipped=0/);
});

test("a plugin with a root CLAUDE.md, its own marketplace.json and no validate reports all four", () => {
  const files = { ...PLUGIN, "CLAUDE.md": "# x", ".claude-plugin/marketplace.json": "{}" };
  const { status, out, err } = run(files, "check_plugin_rules", { workflows: "      - run: npm test\n" });
  assert.equal(status, 0, err);
  assert.match(out, /DRIFT  plugin: validate/);
  assert.match(out, /DRIFT  plugin: metadata check/);
  assert.match(out, /DRIFT  plugin: root CLAUDE.md/);
  assert.match(out, /DRIFT  plugin: marketplace.json/);
  assert.match(out, /counts ok=0 drift=4 skipped=0/);
});

test("validate without --strict is not enough", () => {
  const { out } = run(PLUGIN, "check_plugin_rules", { workflows: "      - run: claude plugin validate .\n" });
  assert.match(out, /DRIFT  plugin: validate/);
});

test("a CLAUDE.md under .claude/ is not the root one", () => {
  const { out } = run({ ...PLUGIN, ".claude/CLAUDE.md": "# x" }, "check_plugin_rules", { workflows: VALIDATE });
  assert.match(out, /OK     plugin: root CLAUDE.md: none/);
});

test("ScanCode: last run is OK after a green push run", () => {
  const { status, out, err } = run({}, "check_scancode_last_run", { scancodeWf: "scancode.yml", runs: [{ status: "completed", conclusion: "success" }] });
  assert.equal(status, 0, err);
  assert.match(out, /OK     ScanCode: last run: success/);
});

test("ScanCode: last run reports a red run, a cancelled one and a workflow that never ran", () => {
  for (const [runs, shown] of [
    [[{ status: "completed", conclusion: "failure" }], "failure"],
    [[{ status: "completed", conclusion: "cancelled" }], "cancelled"],
    [[], "none"],
  ]) {
    const { status, out, err } = run({}, "check_scancode_last_run", { scancodeWf: "scancode.yml", runs });
    assert.equal(status, 0, err);
    assert.match(out, new RegExp(`DRIFT  ScanCode: last run: ${shown}\\n`));
    assert.match(out, /counts ok=0 drift=1/);
  }
});

test("ScanCode: last run skips while a run is in progress, and where no workflow runs ScanCode", () => {
  const busy = run({}, "check_scancode_last_run", { scancodeWf: "scancode.yml", runs: [{ status: "in_progress", conclusion: null }] });
  assert.match(busy.out, /SKIP   ScanCode: last run \(a run is in progress\)/);
  assert.match(busy.out, /drift=0 skipped=1/);
  const none = run({}, "check_scancode_last_run", { scancodeWf: "" });
  assert.match(none.out, /SKIP   ScanCode: last run \(no workflow runs aboutcode-org\/scancode-action\)/);
});
