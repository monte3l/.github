import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// A blocking guard that exits 0 on a payload it cannot read lets the call through, and
// `onFailure: "block"` does not cover that: it covers a crash, not a deliberate exit 0.
// [hook, a payload it must let through, a payload it must block or null]
const GUARDS = [
  [
    "guard-secret-writes.mjs",
    { tool_name: "Write", tool_input: { file_path: "README.md", content: "hello\n" } },
    { tool_name: "Write", tool_input: { file_path: ".env", content: "X=1\n" } },
  ],
  [
    "guard-double-background.mjs",
    { tool_name: "Bash", tool_input: { command: "ls" } },
    { tool_name: "Bash", tool_input: { command: "sleep 1 &", run_in_background: true } },
  ],
  ["guard-git-push-signed.mjs", { tool_name: "Bash", tool_input: { command: "echo hi" } }, null],
];

const run = (hook, stdin) => spawnSync("node", [path.join(root, ".claude/hooks", hook)], { input: stdin, encoding: "utf8" });

describe("blocking guards fail closed on a payload they cannot read", () => {
  for (const [hook, allowed, blocked] of GUARDS) {
    it(`${hook} blocks garbage, an empty payload, null, a bare number, a string and an array`, () => {
      for (const stdin of ["not json", "", "null", "42", '"text"', '"x"', "true", "[]", "[1]", '[{"tool_input":{}}]']) {
        const r = run(hook, stdin);
        assert.equal(r.status, 2, `${JSON.stringify(stdin)} -> ${r.status}: ${r.stderr}`);
        assert.match(r.stderr, /could not read the hook payload/);
      }
    });

    it(`${hook} judges an object by the fields it has, so a changed shape locks nothing`, () => {
      for (const stdin of ["{}", '{"tool_input":{}}', '{"tool_input":{"renamed":"x"}}']) {
        assert.equal(run(hook, stdin).status, 0, stdin);
      }
    });

    it(`${hook} still lets an ordinary call through`, () => {
      assert.equal(run(hook, JSON.stringify(allowed)).status, 0);
    });

    if (blocked !== null) {
      it(`${hook} still blocks what it is for`, () => {
        assert.equal(run(hook, JSON.stringify(blocked)).status, 2);
      });
    }
  }
});
