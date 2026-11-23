// SPDX-FileCopyrightText: Copyright (c) 2026 Enrico Lionello (enri3l) and Giulia Montevecchi (giulmonte), monte3l
// SPDX-License-Identifier: MIT

// The starter blueprint/files/check-plugin-metadata.mjs: the pure comparison, and the script run through
// a symlinked, spaced path (the fail-open case of entry-point.test.mjs) against a stub `gh` on PATH.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

const script = path.join(import.meta.dirname, "..", "blueprint", "files", "check-plugin-metadata.mjs");
const { mismatches } = await import(script);

const repo = { description: "A plugin that does things", topics: ["claude-code", "claude-code-plugin"] };

test("a matching description passes, and keywords are optional", () => {
  assert.deepEqual(mismatches({ description: "A plugin that does things" }, repo), []);
});

test("a different or missing description is reported", () => {
  assert.match(mismatches({ description: "Other" }, repo)[0], /description is "Other", the repository says "A plugin that does things"/);
  assert.match(mismatches({}, repo)[0], /has no description/);
  assert.match(mismatches({ description: "  " }, repo)[0], /has no description/);
});

test("keywords equal the topics in any order, and both directions of a mismatch are named", () => {
  assert.deepEqual(mismatches({ description: repo.description, keywords: ["claude-code-plugin", "claude-code"] }, repo), []);
  const problems = mismatches({ description: repo.description, keywords: ["claude-code", "extra"] }, repo);
  assert.deepEqual(problems, ["plugin.json keywords not in the repository topics: extra", "repository topics not in plugin.json keywords: claude-code-plugin"]);
});

test("keywords that are not a list of strings are reported", () => {
  assert.match(mismatches({ description: repo.description, keywords: "a,b" }, repo)[0], /not a list of strings/);
  assert.match(mismatches({ description: repo.description, keywords: [1] }, repo)[0], /not a list of strings/);
});

test("a repository with no description reports the manifest description as the difference", () => {
  assert.match(mismatches({ description: "x" }, { description: null, topics: [] })[0], /the repository says ""/);
});

/** Runs the script through a symlink in a folder with a space, with a gh that answers `api repos/x`. */
function cli(plugin, apiAnswer, args = ["--repo", "monte3l/x"]) {
  const dir = mkdtempSync(path.join(tmpdir(), "plugin meta-"));
  mkdirSync(path.join(dir, ".claude-plugin"));
  if (plugin !== null) writeFileSync(path.join(dir, ".claude-plugin", "plugin.json"), plugin);
  mkdirSync(path.join(dir, "bin"));
  const real = path.join(dir, "real.mjs");
  copyFileSync(script, real);
  const link = path.join(dir, "bin", "check-plugin-metadata.mjs");
  symlinkSync(real, link);
  mkdirSync(path.join(dir, "stub"));
  const gh = path.join(dir, "stub", "gh");
  writeFileSync(gh, apiAnswer === null ? "#!/bin/sh\nexit 1\n" : `#!/bin/sh\necho '${JSON.stringify(apiAnswer)}'\n`);
  chmodSync(gh, 0o755);
  const r = spawnSync(process.execPath, [link, "--root", dir, ...args], {
    encoding: "utf8",
    env: { ...process.env, PATH: `${path.join(dir, "stub")}:${process.env.PATH}`, GITHUB_REPOSITORY: "" },
  });
  return { status: r.status, out: r.stdout, err: r.stderr };
}

test("through a symlink and a spaced path: a match exits 0, a mismatch exits 1", () => {
  const ok = cli(JSON.stringify({ description: repo.description, keywords: repo.topics }), repo);
  assert.equal(ok.status, 0, ok.err);
  assert.match(ok.out, /matches the repository/);
  const bad = cli(JSON.stringify({ description: "Other" }), repo);
  assert.equal(bad.status, 1);
  assert.match(bad.err, /check-plugin-metadata: plugin.json description is "Other"/);
});

test("an unreadable manifest, an unreachable repository and no repository name exit 2, never 0", () => {
  assert.equal(cli(null, repo).status, 2);
  assert.equal(cli("{not json", repo).status, 2);
  assert.equal(cli(JSON.stringify({ description: "x" }), null).status, 2);
  const none = cli(JSON.stringify({ description: "x" }), repo, []);
  assert.equal(none.status, 2);
  assert.match(none.err, /no repository/);
});
