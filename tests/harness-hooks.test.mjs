import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const hooks = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.claude/hooks");
const hook = (name) => path.join(hooks, name);

let tmp;
let main;
let linked;
let other;

function sh(cwd, ...args) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
}

function run(script, payload, env = {}) {
  return spawnSync("node", [hook(script)], {
    input: JSON.stringify(payload),
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

before(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "harness-hooks-")));
  main = path.join(tmp, "repo");
  linked = path.join(tmp, "repo.wt", "one");
  other = path.join(tmp, "repo.wt", "two");
  fs.mkdirSync(main);
  sh(main, "init", "-q", "-b", "main");
  fs.writeFileSync(path.join(main, "shared.txt"), "a\n");
  sh(main, "add", ".");
  sh(main, "-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "-q", "-m", "init");
  sh(main, "worktree", "add", "-q", linked, "-b", "one");
  sh(main, "worktree", "add", "-q", other, "-b", "two");
});

after(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe("guard-protected-paths in a worktree session", () => {
  // CLAUDE_PROJECT_DIR stays at the main checkout after a session enters a worktree.
  const env = () => ({ CLAUDE_PROJECT_DIR: main });

  it("blocks design/source edited through a worktree path", () => {
    const file = path.join(linked, "design/source/docs-kit/build.mjs");
    const r = run("guard-protected-paths.mjs", { tool_name: "Edit", cwd: linked, tool_input: { file_path: file } }, env());
    assert.equal(r.status, 2);
    assert.match(r.stderr, /design\/source\/docs-kit\/build\.mjs/);
  });

  it("blocks a relative design path, tokens.css and SHA256SUMS", () => {
    for (const file of ["design/source/x.md", "design/tokens.css", "design/SHA256SUMS", "_site/index.html"]) {
      const r = run("guard-protected-paths.mjs", { tool_name: "Write", cwd: linked, tool_input: { file_path: file } }, env());
      assert.equal(r.status, 2, file);
    }
  });

  it("allows the repo's own design files and ordinary files", () => {
    for (const file of ["design/README.md", "design/local/x.md", "bin/a.sh"]) {
      const r = run("guard-protected-paths.mjs", { tool_name: "Edit", cwd: linked, tool_input: { file_path: path.join(linked, file) } }, env());
      assert.equal(r.status, 0, file);
    }
  });

  it("still blocks in the main checkout", () => {
    const file = path.join(main, "design/source/x.md");
    const r = run("guard-protected-paths.mjs", { tool_name: "Edit", cwd: main, tool_input: { file_path: file } }, env());
    assert.equal(r.status, 2);
  });
});

describe("guard-cross-worktree", () => {
  const edit = (cwd, file) =>
    run("guard-cross-worktree.mjs", { tool_name: "Edit", cwd, tool_input: { file_path: path.join(cwd, file) } });

  it("passes silently when no other worktree touched the file", () => {
    const r = edit(linked, "shared.txt");
    assert.equal(r.status, 0);
    assert.equal(r.stdout, "");
  });

  it("asks when another worktree has uncommitted changes to the same file", () => {
    fs.writeFileSync(path.join(other, "shared.txt"), "changed\n");
    const r = edit(linked, "shared.txt");
    assert.equal(r.status, 0);
    const out = JSON.parse(r.stdout).hookSpecificOutput;
    assert.equal(out.permissionDecision, "ask");
    assert.match(out.permissionDecisionReason, /two/);
    assert.equal(edit(linked, "other-file.txt").stdout, "");
    sh(other, "checkout", "--", "shared.txt");
  });

  it("passes for a file outside any repository", () => {
    const r = run("guard-cross-worktree.mjs", { tool_name: "Write", cwd: tmp, tool_input: { file_path: path.join(tmp, "n.md") } });
    assert.equal(r.status, 0);
    assert.equal(r.stdout, "");
  });
});

describe("session-orientation", () => {
  it("parses worktrees and renders the other ones", async () => {
    const mod = await import(pathToFileURL(hook("session-orientation.mjs")));
    const list = spawnSync("git", ["-C", main, "worktree", "list", "--porcelain"], { encoding: "utf8" }).stdout;
    const worktrees = mod.parseWorktrees(list).map((w) => ({ ...w, dirty: 0 }));
    assert.equal(worktrees.length, 3);
    const text = mod.render({
      cwd: linked,
      branch: "one",
      counts: { ahead: 1, behind: 2 },
      worktrees,
      prs: new Map([["two", 7]]),
    });
    assert.match(text, /on branch one/);
    assert.match(text, /1 ahead, 2 behind/);
    assert.match(text, /\[two\] clean — PR #7/);
    assert.doesNotMatch(text, new RegExp(`- ${linked.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} `));
  });

  it("emits SessionStart additionalContext as JSON", () => {
    const r = run("session-orientation.mjs", { cwd: linked, hook_event_name: "SessionStart" });
    assert.equal(r.status, 0);
    const out = JSON.parse(r.stdout).hookSpecificOutput;
    assert.equal(out.hookEventName, "SessionStart");
    assert.match(out.additionalContext, /branch one/);
  });

  it("prints nothing outside a repository", () => {
    const r = run("session-orientation.mjs", { cwd: tmp });
    assert.equal(r.status, 0);
    assert.equal(r.stdout, "");
  });
});

describe("verify-on-stop planning", () => {
  it("maps changed paths to the parity check and test files", async () => {
    const { plan, testFiles } = await import(pathToFileURL(hook("verify-on-stop.mjs")));
    assert.deepEqual(plan(["README.md"]), { check: false, names: [] });
    const a = plan(["blueprint/bootstrap.json"]);
    assert.equal(a.check, true);
    assert.deepEqual(a.names.sort(), ["bootstrap-parity", "bootstrap-render"]);
    assert.deepEqual(plan(["knowledge/wiki/x.md"]).names.sort(), ["knowledge-parity", "knowledge-report"]);
    assert.ok(plan(["workflow-templates/dco.yml"]).names.includes("template-sync"));
    assert.deepEqual(plan(["bin/new-repo.sh"]).names, ["new-repo"]);
    for (const f of [".github/workflows/freshness.yml", ".github/workflows/template-sync.yml", "bin/template-sync.mjs", "bin/template-sync-pr.sh"]) {
      assert.ok(plan([f]).names.includes("freshness-public"), f);
      assert.ok(plan([f]).names.includes("sync-log-public"), f);
    }
    // The push guard's helper and the guard starters are what the harness tests run.
    assert.ok(plan(["bin/lib/signed-range.mjs"]).names.includes("harness-"));
    const starter = plan(["blueprint/files/guard-secret-writes.mjs"]).names;
    assert.ok(starter.includes("harness-") && starter.includes("bootstrap-parity"));
    assert.equal(plan(["docs/ROADMAP.md"]).check, true);
    const root = path.resolve(hooks, "../..");
    assert.ok(testFiles(root, ["freshness-public"]).some((f) => f.endsWith("freshness-public.test.mjs")));
    assert.ok(testFiles(root, ["sync-log-public"]).some((f) => f.endsWith("sync-log-public.test.mjs")));
    const files = testFiles(root, plan([".claude/hooks/x.mjs"]).names);
    assert.ok(files.every((f) => path.basename(f).startsWith("harness-")));
    assert.ok(files.length >= 2);
  });

  it("does nothing when nothing coupled changed", () => {
    const r = run("verify-on-stop.mjs", { cwd: linked, hook_event_name: "Stop" });
    assert.equal(r.status, 0);
    assert.equal(r.stderr, "");
  });

  it("blocks with exit 2 when a mapped check fails", () => {
    fs.mkdirSync(path.join(linked, "design/source/docs-kit"), { recursive: true });
    fs.writeFileSync(path.join(linked, "design/source/docs-kit/build.mjs"), "process.exit(1);\n");
    fs.mkdirSync(path.join(linked, "blueprint"), { recursive: true });
    fs.writeFileSync(path.join(linked, "blueprint/x.json"), "{}\n");
    const r = run("verify-on-stop.mjs", { cwd: linked, hook_event_name: "Stop" });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /--check failed/);
  });
});
