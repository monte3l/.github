import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const settings = JSON.parse(fs.readFileSync(path.join(root, ".claude/settings.json"), "utf8"));

// Claude Code treats a hook that cannot start, times out or exits with any code but
// 0 or 2 as a non-blocking error (code.claude.com/docs/en/hooks), so a PreToolUse hook
// that can block must say `"onFailure": "block"` or a crash lets the call through.
// A hook that only asks may stay without it, and must be named here with the reason.
const ADVISORY = new Map([
  ["guard-cross-worktree.mjs", "answers ask, a person decides"],
  ["guard-review-dates.mjs", "answers ask, a person decides"],
]);

const hooks = settings.hooks.PreToolUse.flatMap((group) => group.hooks.map((hook) => ({ matcher: group.matcher, ...hook })));
const name = (hook) => /([\w.-]+\.(?:mjs|sh))/.exec(hook.command)?.[1] ?? hook.command;

describe("PreToolUse hooks in settings.json", () => {
  it("every one that can block sets onFailure: block", () => {
    const loose = hooks.filter((h) => h.onFailure !== "block" && !ADVISORY.has(name(h))).map((h) => `${h.matcher}: ${name(h)}`);
    assert.deepEqual(loose, [], 'add "onFailure": "block", or list the hook as advisory with a reason');
  });

  it("every one has a timeout", () => {
    const none = hooks.filter((h) => typeof h.timeout !== "number").map(name);
    assert.deepEqual(none, []);
  });

  it("the advisory list names only hooks that are wired", () => {
    const wired = new Set(hooks.map(name));
    for (const advisory of ADVISORY.keys()) assert.ok(wired.has(advisory), `${advisory} is not a wired PreToolUse hook`);
  });
});
