// SPDX-FileCopyrightText: Copyright (c) 2026 Enrico Lionello (enri3l) and Giulia Montevecchi (giulmonte), monte3l
// SPDX-License-Identifier: MIT

// A ratchet for the log of the template-sync `open` job. This repository is public, so that log is readable
// by anyone, and it must not say which file of which repository is behind (CLAUDE.md, "counts only").
// bin/template-sync-pr.sh keeps the detail for a run by hand: every line that prints a file list, a diff stat,
// a title, a branch or a commit author must sit in the `else` of a `GITHUB_ACTIONS` check (`$ci`), where the
// workflow run takes the counts-only line. The behaviour is tested in template-sync-pr.test.mjs; this test
// fails when someone adds a new line that prints one of them without the check.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const root = path.join(import.meta.dirname, "..");
const lines = readFileSync(path.join(root, "bin", "template-sync-pr.sh"), "utf8").split("\n");

/** What a public log must not carry: the files, the diff, the title, the branch, a commit author. */
const DETAIL = [/\$\{files\[\*\]\}/, /git diff --cached --stat/, /"\$title"/, /"\$branch"/, /"\$authors"/];
// `printf -- '- `%s`\n' "$path"` builds the pull request body, which is public in the other repository, not a log.
const IS_BODY = /^\s*for path in "\$\{files\[@\]\}"; do printf/;

test("every line of template-sync-pr.sh that prints a detail is in the else of the $ci check", () => {
  const found = [];
  lines.forEach((line, i) => {
    if (line.trim().startsWith("#") || IS_BODY.test(line)) return;
    if (!DETAIL.some((re) => re.test(line))) return;
    if (!/printf|git diff/.test(line)) return;
    found.push(i);
  });
  assert.ok(found.length >= 4, "the scan found the detail lines: the patterns are stale");
  for (const i of found) {
    const before = lines.slice(Math.max(0, i - 12), i);
    const elseAt = before.map((l) => l.trim()).lastIndexOf("else");
    const ifAt = before.findLastIndex((l) => /if \[\[ "\$ci" == 1 \]\]/.test(l));
    assert.ok(elseAt >= 0 && ifAt >= 0 && ifAt < elseAt, `line ${i + 1} prints a detail outside the else of $ci: ${lines[i].trim()}`);
  }
});

test("the script clears nothing: $ci is set from GITHUB_ACTIONS and from nothing else", () => {
  const text = lines.join("\n");
  assert.match(text, /if \[\[ "\$\{GITHUB_ACTIONS:-\}" == true \]\]; then ci=1; fi/);
  assert.equal((text.match(/\bci=1\b/g) ?? []).length, 1);
});

test("template-sync.mjs decides counts-only from GITHUB_ACTIONS and --write, in one place", () => {
  const text = readFileSync(path.join(root, "bin", "template-sync.mjs"), "utf8");
  assert.match(text, /const countsOnly = publicOutput \|\| \(writeDir !== null && process\.env\.GITHUB_ACTIONS === "true"\);/);
  // A full finding line, the table and the named left-out message are only on the hand path.
  assert.ok(text.includes("`template-sync: left out ${repo} ${unit.name}.yml"), "the hand message is still there");
  assert.equal((text.match(/process\.env\.GITHUB_ACTIONS/g) ?? []).length, 1, "one decision, not several");
});
