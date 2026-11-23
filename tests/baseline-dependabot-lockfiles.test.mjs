// SPDX-FileCopyrightText: Copyright (c) 2026 Enrico Lionello (enri3l) and Giulia Montevecchi (giulmonte), monte3l
// SPDX-License-Identifier: MIT

// `Dependabot: lockfile folders` of apply-repo-baseline.sh. Like baseline-pr-template-dist, this takes the
// real definition out of the script and runs it under the script's own shell options. The stub gh serves
// the repository's file list as the `git/trees` answer and applies the script's own `--jq` expression to
// it, so a change to that expression is tested too.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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
 * @param {string[]} paths files in the repository
 * @param {string} dependabot the text of .github/dependabot.yml
 * @param {{ exemptions?: object, truncated?: boolean, fail?: boolean }} [options]
 */
function run(paths, dependabot, { exemptions = {}, truncated = false, fail = false } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "dependabot-lock-"));
  writeFileSync(path.join(dir, "dependabot-exemptions.json"), JSON.stringify(exemptions));
  const tree = { truncated, tree: paths.map((p) => ({ path: p, type: "blob" })).concat([{ path: "src", type: "tree" }]) };
  writeFileSync(path.join(dir, "tree.json"), JSON.stringify(tree));
  writeFileSync(path.join(dir, "dependabot.yml"), dependabot);
  const program = `set -eEuo pipefail
trap 'exit 3' ERR
repo=monte3l/m3l-x mode=check ok=0 drift=0 skipped=0
here=${JSON.stringify(dir)}
dependabot="$(cat ${JSON.stringify(path.join(dir, "dependabot.yml"))})"
gh() {
  ${fail ? "return 1" : ""}
  local expr="" prev=""
  for a in "$@"; do [[ "$prev" == --jq ]] && expr="$a"; prev="$a"; done
  jq -r "$expr" ${JSON.stringify(path.join(dir, "tree.json"))}
}
${definition("skip")}
${definition("check_dependabot_lockfiles")}
check_dependabot_lockfiles
echo "counts ok=$ok drift=$drift skipped=$skipped"
`;
  const r = spawnSync("bash", ["-c", program], { encoding: "utf8" });
  return { status: r.status, out: r.stdout, err: r.stderr };
}

const ACTIONS = 'version: 2\nupdates:\n  - package-ecosystem: "github-actions"\n    directory: "/"\n';
const npm = (directory) => `  - package-ecosystem: npm\n    directory: ${directory}\n`;

test("every lockfile folder with an npm entry is clean, whatever the quoting", () => {
  const { status, out, err } = run(
    ["tools/ci/package-lock.json", "tools/deploy/package-lock.json", "README.md"],
    ACTIONS + npm('"/tools/ci"') + npm("/tools/deploy"),
  );
  assert.equal(status, 0, err);
  assert.match(out, /OK     Dependabot: lockfile folders\n/);
  assert.match(out, /counts ok=1 drift=0/);
});

test("a lockfile folder without an entry is drift and is named", () => {
  const { out } = run(["tools/ci/package-lock.json", "tools/test/package-lock.json"], ACTIONS + npm("/tools/ci"));
  assert.match(out, /DRIFT  Dependabot: lockfile folders: no npm entry for \/tools\/test\n/);
  assert.match(out, /counts ok=0 drift=1/);
});

test("pnpm and yarn lockfiles count, and the root folder is /", () => {
  const { out } = run(["pnpm-lock.yaml", "web/yarn.lock"], ACTIONS);
  assert.match(out, /no npm entry for \/, \/web\n/);
});

test("only an npm entry covers a folder: a github-actions entry for the same directory does not", () => {
  const { out } = run(["package-lock.json"], ACTIONS);
  assert.match(out, /DRIFT  Dependabot: lockfile folders: no npm entry for \/\n/);
});

test("a directories list and a glob cover their folders, and a comment does not", () => {
  const config =
    ACTIONS +
    '  - package-ecosystem: "npm"\n    directories:\n      - "/tools/*"  # the pinned tools\n      - /web\n    schedule:\n      interval: weekly\n' +
    "  # - package-ecosystem: npm\n  #   directory: /old\n";
  const { out } = run(["tools/a/package-lock.json", "tools/b/yarn.lock", "web/pnpm-lock.yaml", "old/package-lock.json"], config);
  assert.match(out, /DRIFT  Dependabot: lockfile folders: no npm entry for \/old\n/);
});

test("an exempt root folder is clean and says so; an exemption for another repository is not used", () => {
  const exempt = run(["pnpm-lock.yaml"], ACTIONS, { exemptions: { "m3l-x": { "/": "off on purpose" } } });
  assert.match(exempt.out, /OK     Dependabot: lockfile folders: \/ exempt/);
  assert.match(exempt.out, /counts ok=1 drift=0/);
  const other = run(["pnpm-lock.yaml"], ACTIONS, { exemptions: { "m3l-y": { "/": "off on purpose" } } });
  assert.match(other.out, /DRIFT  Dependabot: lockfile folders: no npm entry for \/\n/);
});

test("no lockfile is clean", () => {
  const { out } = run(["README.md"], ACTIONS);
  assert.match(out, /OK     Dependabot: lockfile folders: no lockfile/);
});

test("a truncated or unreadable file list is skipped, never read as clean", () => {
  assert.match(run(["package-lock.json"], ACTIONS, { truncated: true }).out, /SKIP   Dependabot: lockfile folders/);
  const failed = run(["package-lock.json"], ACTIONS, { fail: true });
  assert.equal(failed.status, 0, failed.err);
  assert.match(failed.out, /SKIP   Dependabot: lockfile folders/);
  assert.match(failed.out, /skipped=1/);
});

test("the shipped exemptions name a reason for each folder", () => {
  const data = JSON.parse(readFileSync(path.join(root, "blueprint", "dependabot-exemptions.json"), "utf8"));
  for (const [repo, folders] of Object.entries(data)) {
    for (const [folder, reason] of Object.entries(folders)) {
      assert.ok(folder.startsWith("/"), `${repo}: ${folder} is not a folder path`);
      assert.ok(typeof reason === "string" && reason.length > 20, `${repo}: ${folder} needs a reason`);
    }
  }
});
