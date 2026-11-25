// SPDX-FileCopyrightText: Copyright (c) 2026 Enrico Lionello (enri3l) and Giulia Montevecchi (giulmonte), monte3l
// SPDX-License-Identifier: MIT

// The probe job proves the tracking-issue path with the real token. It must run only when asked, use one title,
// and never leave its issue open.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const text = readFileSync(path.join(import.meta.dirname, "..", ".github", "workflows", "freshness.yml"), "utf8");
const probe = text.slice(text.indexOf("\n  probe:\n"));
const calls = probe.split("\n").filter((line) => /bin\/lib\/upsert-issue\.sh/.test(line));

test("the probe job runs only on a manual dispatch with the probe input", () => {
  assert.match(probe, /if: github\.event_name == 'workflow_dispatch' && inputs\.probe/);
  assert.match(text, /inputs:\s+probe:\s+description:.*\n\s+type: boolean\n\s+default: false/);
});

test("every probe call uses the same title, and the last one closes the issue", () => {
  assert.equal(calls.length, 3);
  const titles = new Set(calls.map((line) => /upsert-issue\.sh\s+("[^"]+")/.exec(line)?.[1]));
  assert.equal(titles.size, 1);
  assert.match(calls.at(-1), /--clean/);
});
