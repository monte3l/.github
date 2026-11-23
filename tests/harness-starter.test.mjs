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

describe("sign-off guard starter", () => {
  it("is byte-identical to the hook that runs in this repository", () => {
    assert.equal(read("blueprint/files/require-signoff.sh"), read(".claude/hooks/require-signoff.sh"));
  });

  it("is written where bootstrap.json and sync.json say, and the hook is wired in settings.json", () => {
    const bootstrap = JSON.parse(read("blueprint/bootstrap.json"));
    const entry = bootstrap.starters.find((s) => s.from === "blueprint/files/require-signoff.sh");
    assert.equal(entry?.to, ".claude/hooks/require-signoff.sh");
    assert.match(entry.todo, /settings\.json/, "a new repository is told to wire it");

    const sync = JSON.parse(read("blueprint/sync.json"));
    const starter = sync.starters["require-signoff.sh"];
    assert.equal(starter.mode, "managed");
    assert.equal(starter.paths[0], entry.to, "the first sync path is where bootstrap writes it");

    const settings = JSON.parse(read(".claude/settings.json"));
    const wired = settings.hooks.PreToolUse.flatMap((g) => g.hooks.map((h) => ({ matcher: g.matcher, ...h })))
      .filter((h) => h.command.includes("require-signoff.sh"));
    assert.deepEqual(wired.map((h) => h.matcher), ["Bash"]);
    assert.equal(wired[0].onFailure, "block");
  });

  it("documents the settings entry the todo points at, run through bash so it needs no executable bit", () => {
    const readme = read("blueprint/README.md");
    assert.match(readme, /### Sign-off guard/);
    assert.match(readme, /"command": "bash \\"\$CLAUDE_PROJECT_DIR\/\.claude\/hooks\/require-signoff\.sh\\"",\n  "timeout": 30,\n  "onFailure": "block"/);
  });
});
