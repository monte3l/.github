import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

describe("worktree guard starter", () => {
  it("is byte-identical to the hook that runs in this repository", () => {
    // The template sync compares a repository's copy with the starter, so a starter that
    // drifted from the live hook would hand out a different guard than the one tested here.
    assert.equal(read("blueprint/files/guard-shared-checkout.mjs"), read(".claude/hooks/guard-shared-checkout.mjs"));
  });

  it("is written where bootstrap.json and sync.json say, and the hook is wired in settings.json", () => {
    const bootstrap = JSON.parse(read("blueprint/bootstrap.json"));
    const entry = bootstrap.starters.find((s) => s.from === "blueprint/files/guard-shared-checkout.mjs");
    assert.equal(entry?.to, ".claude/hooks/guard-shared-checkout.mjs");
    assert.match(entry.todo, /settings\.json/, "a new repository is told to wire it");

    const sync = JSON.parse(read("blueprint/sync.json"));
    const starter = sync.starters["guard-shared-checkout.mjs"];
    assert.equal(starter.mode, "managed");
    assert.equal(starter.paths[0], entry.to, "the first sync path is where bootstrap writes it");

    const settings = JSON.parse(read(".claude/settings.json"));
    const wired = settings.hooks.PreToolUse.flatMap((g) => g.hooks.map((h) => ({ matcher: g.matcher, ...h })))
      .filter((h) => h.command.includes("guard-shared-checkout.mjs"));
    assert.deepEqual(wired.map((h) => h.matcher).sort(), ["Bash", "Write|Edit"]);
    assert.ok(wired.every((h) => h.onFailure === "block"));
  });

  it("documents both settings entries the todo points at", () => {
    const readme = read("blueprint/README.md");
    assert.match(readme, /### Worktree guard/);
    assert.equal((readme.match(/guard-shared-checkout\.mjs\\"",\n  "timeout": 30,\n  "onFailure": "block"/g) ?? []).length, 2);
  });
});
