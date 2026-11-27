// SPDX-FileCopyrightText: Copyright (c) 2026 Enrico Lionello (enri3l) and Giulia Montevecchi (giulmonte), monte3l
// SPDX-License-Identifier: MIT

// The two helpers behind the baseline's `docs site: parity` and `release: workflow pin age` items.
// The first is pure; the second talks to GitHub, so it runs against a stub `gh`.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

const root = path.join(import.meta.dirname, "..");
const lib = (name) => path.join(root, "bin", "lib", name);

/** @param {string} config the text of a docs.config.mjs */
const hasParity = (config) => spawnSync("bash", [lib("docs-config-parity.sh")], { input: config, encoding: "utf8" }).status;

test("docs-config-parity: a non-empty parity array counts, however it is written", () => {
  assert.equal(hasParity('export default {\n  parity: ["scripts/doc-parity.mjs"],\n};\n'), 0);
  assert.equal(hasParity("export default {\n  parity: ['scripts/doc-parity.mjs'],\n};\n"), 0);
  assert.equal(hasParity('  parity: ["scripts/doc-parity.mjs"], // docs-versus-code checks\n'), 0);
  assert.equal(hasParity('  parity: [\n    "bin/a.mjs",\n    "bin/b.mjs",\n  ],\n'), 0);
  assert.equal(hasParity('  parity:["a.mjs"]\n'), 0);
});

test("docs-config-parity: missing, empty and commented-out do not count", () => {
  assert.equal(hasParity("export default { siteUrl: 'https://x.monte3l.com' };\n"), 1);
  assert.equal(hasParity("  parity: [],\n"), 1);
  assert.equal(hasParity('  parity: [], // e.g. ["scripts/doc-parity.mjs"]\n'), 1);
  assert.equal(hasParity('  // parity: ["scripts/doc-parity.mjs"],\n'), 1);
  assert.equal(hasParity(""), 1);
});

test("docs-config-parity: the starter ships the line commented out, so a copy that never enabled it is reported", () => {
  assert.equal(hasParity(readFileSync(path.join(root, "blueprint", "files", "docs.config.mjs"), "utf8")), 1);
});

test("docs-config-parity: this repository's own config has one", () => {
  assert.equal(hasParity(readFileSync(path.join(root, "docs.config.mjs"), "utf8")), 0);
});

const FILE_A = ".github/workflows/release-prepare.yml";
const FILE_B = ".github/workflows/release-finalize.yml";
const FILE_C = ".github/workflows/release-publish.yml";
const OLD = "1".repeat(40);
const MID = "2".repeat(40);
const NEWEST = "3".repeat(40);
const LATEST = "4".repeat(40);

/**
 * Runs release-pin-age.sh against a stub gh.
 * @param {{ pins: string[], compare?: Record<string, string>, history?: "ok" | "error" | "empty" }} options
 *   `compare` maps a pin to the status GitHub returns, or "error"; `history` is what the commit listing does:
 *   answer, fail like an API error, or answer with nothing.
 */
function pinAge({ pins, compare = {}, history = "ok", files = [FILE_A, FILE_B] }) {
  const dir = mkdtempSync(path.join(tmpdir(), "pin-age-"));
  const stub = path.join(dir, "gh");
  const statuses = Object.entries(compare)
    .map(([pin, status]) => `    *"...${pin}"*) ${status === "error" ? "exit 1" : `printf '%s\\n' '${status}'`} ;;`)
    .join("\n");
  writeFileSync(
    stub,
    `#!/usr/bin/env bash
case "$2" in
  *"/commits?"*)
    ${history === "error" ? "exit 1" : ""}
    case "$2" in
      ${history === "empty" ? "*) ;;" : ""}
      *"path=${FILE_A}"*) printf '%s\n' '2026-11-01T00:00:00Z ${MID}' ;;
      *"path=${FILE_B}"*) printf '%s\n' '2026-11-10T00:00:00Z ${NEWEST}' ;;
      *"path=${FILE_C}"*) printf '%s\n' '2026-11-20T00:00:00Z ${LATEST}' ;;
    esac ;;
  *"/compare/"*)
    case "$2" in
${statuses}
      *) printf '%s\\n' 'ahead' ;;
    esac ;;
esac
`,
  );
  chmodSync(stub, 0o755);
  const result = spawnSync("bash", [lib("release-pin-age.sh"), "monte3l/.github", ...files, ...pins], {
    encoding: "utf8",
    env: { ...process.env, PATH: `${dir}:${process.env.PATH}` },
  });
  return { status: result.status, out: result.stdout.trim() };
}

test("release-pin-age: every pin that has the newest change is current", () => {
  const { status, out } = pinAge({ pins: [OLD, MID], compare: { [OLD]: "identical", [MID]: "ahead" } });
  assert.equal(status, 0);
  assert.equal(out, NEWEST, "prints the newest commit across both files, by date");
});

test("release-pin-age: a pin behind the newest change is reported with that change", () => {
  const { status, out } = pinAge({ pins: [OLD], compare: { [OLD]: "behind" } });
  assert.equal(status, 1);
  assert.equal(out, `${OLD} ${NEWEST}`);
});

test("release-pin-age: the first pin that is behind is the one reported", () => {
  const { status, out } = pinAge({ pins: [MID, OLD], compare: { [MID]: "ahead", [OLD]: "diverged" } });
  assert.equal(status, 1);
  assert.equal(out, `${OLD} ${NEWEST}`);
});

test("release-pin-age: a compare that fails is a failed call (3), never a pin reported as current", () => {
  const { status } = pinAge({ pins: [OLD], compare: { [OLD]: "error" } });
  assert.equal(status, 3);
});

test("release-pin-age: a commit listing that fails is a failed call (3), not a skip", () => {
  assert.equal(pinAge({ pins: [OLD], history: "error" }).status, 3);
});

test("release-pin-age: a history that was read and is empty is exit 4", () => {
  assert.equal(pinAge({ pins: [OLD], history: "empty" }).status, 4);
});

test("release-pin-age: too few arguments is a usage error", () => {
  const result = spawnSync("bash", [lib("release-pin-age.sh"), "monte3l/.github", FILE_A, FILE_B], { encoding: "utf8" });
  assert.equal(result.status, 2);
});

test("release-pin-age: release-publish.yml counts: a change only to it is the newest", () => {
  const { status, out } = pinAge({ files: [FILE_A, FILE_B, FILE_C], pins: [OLD], compare: { [OLD]: "behind" } });
  assert.equal(status, 1);
  assert.equal(out, `${OLD} ${LATEST}`);
});

test("release-pin-age: a pin that has the change to release-publish.yml is current", () => {
  const { status, out } = pinAge({ files: [FILE_A, FILE_B, FILE_C], pins: [MID], compare: { [MID]: "ahead" } });
  assert.equal(status, 0);
  assert.equal(out, LATEST);
});

test("release-pin-age: without release-publish.yml in the list it is not looked at", () => {
  assert.equal(pinAge({ pins: [OLD], compare: { [OLD]: "identical" } }).out, NEWEST);
});

test("release-pin-age: files and pins are told apart by shape, so one file is enough", () => {
  const { status, out } = pinAge({ files: [FILE_C], pins: [OLD], compare: { [OLD]: "identical" } });
  assert.equal(status, 0);
  assert.equal(out, LATEST);
});

test("release-pin-age: no file is a usage error", () => {
  const result = spawnSync("bash", [lib("release-pin-age.sh"), "monte3l/.github", OLD], { encoding: "utf8" });
  assert.equal(result.status, 2);
});
