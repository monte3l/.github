// SPDX-FileCopyrightText: Copyright (c) 2026 Enrico Lionello (enri3l) and Giulia Montevecchi (giulmonte), monte3l
// SPDX-License-Identifier: MIT

// release-publish.yml is release-finalize.yml without the attestation, so a caller that attests on its
// own grants `contents: write` and nothing more. These tests hold that: the permissions, the shared
// concurrency group, and the shell the two files must keep identical.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const root = path.join(import.meta.dirname, "..");
const read = (rel) => readFileSync(path.join(root, rel), "utf8");
const publish = read(".github/workflows/release-publish.yml");
const finalize = read(".github/workflows/release-finalize.yml");

/** The text of a top-level job: from `  name:` up to the next two-space key. */
function job(text, name) {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => line === `  ${name}:`);
  assert.ok(start >= 0, `no ${name} job`);
  let end = lines.findIndex((line, i) => i > start && /^ {2}\S/.test(line));
  if (end < 0) end = lines.length;
  return lines.slice(start, end).join("\n");
}

/** The permission map a job declares at four spaces of indent (`    permissions:`). */
function permissions(block) {
  const lines = block.split("\n");
  const at = lines.findIndex((line) => /^ {4}permissions:/.test(line));
  assert.ok(at >= 0, "no permissions key");
  if (/\{\}\s*$/.test(lines[at])) return {};
  const map = {};
  for (let i = at + 1; i < lines.length && /^ {6}\S/.test(lines[i]); i += 1) {
    const [key, value] = lines[i].trim().split(/:\s*/);
    map[key] = value;
  }
  return map;
}

/** The step named `name` inside a job block, up to the next step. */
function step(block, name) {
  const lines = block.split("\n");
  const start = lines.findIndex((line) => line === `      - name: ${name}`);
  assert.ok(start >= 0, `no step ${name}`);
  let end = lines.findIndex((line, i) => i > start && /^ {6}- /.test(line));
  if (end < 0) end = lines.length;
  return lines.slice(start, end).join("\n");
}

test("the publish job asks for contents: write and nothing else", () => {
  assert.deepEqual(permissions(job(publish, "publish")), { contents: "write" });
});

test("the file never mentions id-token or attestations", () => {
  const code = publish.split("\n").filter((line) => !line.trim().startsWith("#")).join("\n");
  assert.doesNotMatch(code, /id-token/);
  assert.doesNotMatch(code, /attestations/);
  assert.doesNotMatch(code, /actions\/attest/);
});

test("the workflow starts with no permissions and notify has none", () => {
  assert.match(publish, /^permissions: \{\}$/m);
  assert.deepEqual(permissions(job(publish, "notify")), {});
});

test("there is no attest or checksums input", () => {
  const inputs = publish.slice(publish.indexOf("    inputs:"), publish.indexOf("    secrets:"));
  assert.doesNotMatch(inputs, /^ {6}attest:/m);
  assert.doesNotMatch(inputs, /^ {6}checksums:/m);
  assert.match(inputs, /^ {6}tag:/m);
  assert.match(inputs, /^ {6}notify:/m);
});

test("it shares release-finalize's concurrency group, so the two cannot race", () => {
  const group = (text) => /group: (.+)/.exec(job(text, "publish"))?.[1];
  assert.ok(group(finalize));
  assert.equal(group(publish), group(finalize));
});

test("the draft lookup and tag check are the same shell in both files", () => {
  const name = "Find the draft and check its tag";
  assert.equal(step(job(publish, "publish"), name), step(job(finalize, "publish"), name));
});

test("the publish step and the notify job are the same in both files", () => {
  const name = "Publish the release";
  assert.equal(step(job(publish, "publish"), name), step(job(finalize, "publish"), name));
  assert.equal(job(publish, "notify"), job(finalize, "notify"));
});
