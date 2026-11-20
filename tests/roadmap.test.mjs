// SPDX-FileCopyrightText: Copyright (c) 2026 Enrico Lionello (enri3l) and Giulia Montevecchi (giulmonte), monte3l
// SPDX-License-Identifier: MIT

// The ROADMAP.md check behind the `roadmap: sections` baseline item.
// Run with: node --test "tests/*.test.mjs"
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { SECTIONS, roadmapProblems } from "../bin/lib/roadmap.mjs";

const CLI = new URL("../bin/lib/roadmap.mjs", import.meta.url).pathname;

/** A ROADMAP that follows the policy, with the headings in the repositories' own wording. */
const good = (reviewed = "2026-11-01") =>
  `---\nreviewed: ${reviewed}\n---\n\n# Roadmap\n\n## Now: the 1.x series\n\nx\n\n## Next 12 months\n\nx\n\n## Known limits\n\nx\n\n## Unverified\n\nx\n\n## What this project will not do\n\nx\n`;

test("a ROADMAP as the policy says has no problems", () => {
  assert.deepEqual(roadmapProblems(good(), { today: "2026-11-20" }), []);
});

test("a heading matches by prefix, so a qualified heading is the same section", () => {
  assert.deepEqual(roadmapProblems(good().replace("## Now: the 1.x series", "## Now"), {}), []);
  assert.deepEqual(roadmapProblems(good().replace("## Now: the 1.x series", "## Now the road to 1.0"), {}), []);
});

test("a prefix must end at a word, so Nowhere is not Now", () => {
  const problems = roadmapProblems(good().replace("## Now: the 1.x series", "## Nowhere"), {});
  assert.deepEqual(problems, ["no `## Now` section"]);
});

test("each missing section is named", () => {
  const text = good().replace("## Known limits\n\nx\n\n", "").replace("## Unverified\n\nx\n\n", "");
  assert.deepEqual(roadmapProblems(text, {}), ["no `## Known limits` section", "no `## Unverified` section"]);
});

test("sections out of order are reported once, not as missing", () => {
  const text = good().replace("## Known limits\n\nx\n\n## Unverified\n\nx\n\n", "## Unverified\n\nx\n\n## Known limits\n\nx\n\n");
  const problems = roadmapProblems(text, {});
  assert.equal(problems.length, 1);
  assert.match(problems[0], /Unverified.*out of order|Known limits.*out of order/);
});

test("a heading in a fenced code block is an example, not a section", () => {
  const text = good().replace("## Known limits\n\nx\n\n", "```md\n## Known limits\n```\n\n");
  assert.deepEqual(roadmapProblems(text, {}), ["no `## Known limits` section"]);
});

test("a deeper heading is not a section", () => {
  const text = good().replace("## Unverified", "### Unverified");
  assert.deepEqual(roadmapProblems(text, {}), ["no `## Unverified` section"]);
});

test("frontmatter is required", () => {
  const text = good().replace(/^---\nreviewed: [^\n]*\n---\n\n/, "");
  assert.match(roadmapProblems(text, {})[0], /^no frontmatter/);
});

test("a frontmatter block without reviewed, or with an impossible date, is reported", () => {
  assert.deepEqual(roadmapProblems(good().replace("reviewed: 2026-11-01", "title: x"), {}), ["frontmatter has no `reviewed:` date"]);
  assert.match(roadmapProblems(good("2026-02-30"), {})[0], /not a real YYYY-MM-DD date/);
  assert.match(roadmapProblems(good("yesterday"), {})[0], /not a real YYYY-MM-DD date/);
});

test("a date that has not happened is reported only when today is known", () => {
  assert.match(roadmapProblems(good("2027-01-01"), { today: "2026-11-20" })[0], /has not happened yet/);
  assert.deepEqual(roadmapProblems(good("2027-01-01"), {}), []);
});

test("age is not judged here: the docs kit owns it", () => {
  assert.deepEqual(roadmapProblems(good("2020-01-01"), { today: "2026-11-20" }), []);
});

test("CRLF line endings read the same as LF", () => {
  assert.deepEqual(roadmapProblems(good().replace(/\n/g, "\r\n"), {}), []);
});

test("the section list is the one the policy documents", () => {
  assert.deepEqual(SECTIONS, ["Now", "Next 12 months", "Known limits", "Unverified", "What this project will not do"]);
});

test("the command exits 0 for a good file and prints nothing", () => {
  const run = spawnSync(process.execPath, [CLI, "--today", "2026-11-20"], { input: good(), encoding: "utf8" });
  assert.equal(run.status, 0);
  assert.equal(run.stdout, "");
});

test("the command exits 1 and prints each problem", () => {
  const run = spawnSync(process.execPath, [CLI], { input: "# Roadmap\n", encoding: "utf8" });
  assert.equal(run.status, 1);
  assert.equal(run.stdout.trim().split("\n").length, 1 + SECTIONS.length);
});

test("the command exits 2 on a bad argument, and never 3", () => {
  for (const args of [["--nope"], ["--today"], ["--today", "not-a-date"]]) {
    const run = spawnSync(process.execPath, [CLI, ...args], { input: good(), encoding: "utf8" });
    assert.equal(run.status, 2, args.join(" "));
  }
});
