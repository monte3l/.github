// SPDX-FileCopyrightText: Copyright (c) 2026 Enrico Lionello (enri3l) and Giulia Montevecchi (giulmonte), monte3l
// SPDX-License-Identifier: MIT

// This repository is public: the freshness issues, the job summaries and the run pages are readable by anyone,
// so they hold counts only, never which repository is behind. The behaviour of `--public` is tested in
// template-sync-cli.test.mjs; here the two workflows are held to using it, or to printing counts themselves.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const root = path.join(import.meta.dirname, "..");
const read = (name) => readFileSync(path.join(root, ".github", "workflows", name), "utf8");
const freshness = read("freshness.yml");
const templateSync = read("template-sync.yml");

// Any way of running the sync: `node bin/template-sync.mjs`, with node flags, or the script run directly. A
// message that only names the file (`printf 'template-sync.mjs failed'`) is not one.
const INVOCATION = /(?:\bnode\s+(?:-\S+\s+)*|^\s*(?:\.\/)?)\S*template-sync\.mjs\b/;

/** The workflow's lines without comments and without the prose of an issue body (a `<<'TEXT'` heredoc). */
function commandLines(text) {
  const kept = [];
  let inProse = false;
  for (const line of text.split("\n")) {
    if (inProse) {
      if (line.trim() === "TEXT") inProse = false;
      continue;
    }
    if (/<<'?TEXT'?/.test(line)) inProse = true;
    if (/^\s*#/.test(line)) continue;
    kept.push(line);
  }
  return kept;
}

test("freshness.yml runs the template sync with --public, in every invocation", () => {
  const calls = commandLines(freshness).filter((line) => INVOCATION.test(line));
  assert.ok(calls.length >= 1, "the copies job runs the template sync");
  for (const line of calls) {
    assert.match(line, /--public\b/, `counts only: ${line.trim()}`);
    assert.doesNotMatch(line, /--json|--write/, `names a repository: ${line.trim()}`);
  }
});

test("freshness.yml puts into the job summary only what the --public run wrote", () => {
  const lines = commandLines(freshness);
  // `node bin/template-sync.mjs ... >"$RUNNER_TEMP/copies.txt"`: the file the sync's output goes to.
  const written = new Map();
  for (const line of lines) {
    const target = INVOCATION.test(line) ? /template-sync\.mjs.*>\s*"?([^"\s|]+)"?\s*(?:\|\||$)/.exec(line)?.[1] : null;
    if (target) written.set(target, line);
  }
  assert.ok(written.size >= 1, "the sync's output goes to a file the test can follow");
  const summaries = lines.filter((line) => /GITHUB_STEP_SUMMARY/.test(line) && /\bcat\b/.test(line));
  assert.ok(summaries.some((line) => [...written.keys()].some((file) => line.includes(file))), "the summary is fed from that file");
  for (const [file, call] of written) {
    assert.match(call, /--public\b/, `${file} is copied to the public summary, so ${call.trim()} must be --public`);
  }
});

test("the issue text points to a local run for the detail instead of the public job summary", () => {
  assert.doesNotMatch(freshness, /full comparison is in the job summary/);
  assert.match(freshness, /counts only\. Which repository and which file stay on your machine/);
});

test("template-sync.yml's summary interpolates no repository, file or template, only counts", () => {
  const text = templateSync;
  // The group `{ ... } >>"$GITHUB_STEP_SUMMARY"` of the plan job.
  const end = text.indexOf('>>"$GITHUB_STEP_SUMMARY"');
  assert.ok(end > 0, "the plan job writes a summary");
  const block = text.slice(text.lastIndexOf("{", end), end);
  assert.doesNotMatch(block, /\\\(\s*\.(?:repo|path|template|kind)\b/, "a string interpolation that starts with a field names it");
  assert.doesNotMatch(block, /\.\[\]/, "the summary does not iterate over the copies");
  assert.match(block, /length/, "it prints a count");
});

test("no job or step name in either workflow carries a repository", () => {
  for (const [file, text] of [["freshness.yml", freshness], ["template-sync.yml", templateSync]]) {
    for (const line of text.split("\n").filter((l) => /^\s*(?:-\s+)?name:/.test(l))) {
      assert.doesNotMatch(line, /matrix\.|\.repository\b/, `${file}: ${line.trim()}`);
    }
  }
});
