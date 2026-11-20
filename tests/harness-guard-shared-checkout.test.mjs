import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const guard = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.claude/hooks/guard-shared-checkout.mjs",
);

let tmp;
let main;
let linked;

function sh(cwd, ...args) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
}

function run(payload) {
  return spawnSync("node", [guard], { input: JSON.stringify(payload), encoding: "utf8" });
}

before(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "guard-shared-")));
  main = path.join(tmp, "repo");
  linked = path.join(tmp, "repo.wt", "feature");
  fs.mkdirSync(main);
  sh(main, "init", "-q", "-b", "main");
  sh(main, "-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "-q", "--allow-empty", "-m", "init");
  sh(main, "worktree", "add", "-q", linked, "-b", "feature");
});

after(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe("guard-shared-checkout", () => {
  it("blocks an edit of a file in the main checkout", () => {
    const r = run({ tool_name: "Edit", cwd: main, tool_input: { file_path: path.join(main, "a.txt") } });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /main checkout/);
    assert.match(r.stderr, /worktree/);
  });

  it("blocks a write to a new directory inside the main checkout", () => {
    const r = run({ tool_name: "Write", cwd: main, tool_input: { file_path: path.join(main, "new/dir/a.txt") } });
    assert.equal(r.status, 2);
  });

  it("allows an edit inside a linked worktree", () => {
    const r = run({ tool_name: "Edit", cwd: linked, tool_input: { file_path: path.join(linked, "a.txt") } });
    assert.equal(r.status, 0);
  });

  it("blocks a sibling-repo edit from a session that sits in a worktree", () => {
    const r = run({ tool_name: "Edit", cwd: linked, tool_input: { file_path: path.join(main, "a.txt") } });
    assert.equal(r.status, 2);
  });

  it("allows paths outside any repository", () => {
    const r = run({ tool_name: "Write", cwd: main, tool_input: { file_path: path.join(tmp, "notes.md") } });
    assert.equal(r.status, 0);
  });

  it("blocks git commit, switch -c and checkout -b in the main checkout", () => {
    for (const command of [
      "git commit -s -m x",
      "git add a && git commit -m x",
      "git switch -c topic",
      "git checkout -b topic",
      `git -C ${main} commit -m x`,
      "git -c user.name=x commit -m x",
    ]) {
      const r = run({ tool_name: "Bash", cwd: main, tool_input: { command } });
      assert.equal(r.status, 2, command);
    }
  });

  it("follows git -C from a worktree session into the main checkout", () => {
    const r = run({ tool_name: "Bash", cwd: linked, tool_input: { command: `git -C ${main} commit -m x` } });
    assert.equal(r.status, 2);
  });

  it("allows pull, fetch, status and worktree add in the main checkout", () => {
    for (const command of [
      "git pull --ff-only",
      "git fetch origin",
      "git status",
      "git switch main",
      "git checkout main",
      "git worktree add ../x -b y origin/main",
    ]) {
      const r = run({ tool_name: "Bash", cwd: main, tool_input: { command } });
      assert.equal(r.status, 0, command);
    }
  });

  it("allows git commit inside a linked worktree", () => {
    const r = run({ tool_name: "Bash", cwd: linked, tool_input: { command: "git commit -s -m x" } });
    assert.equal(r.status, 0);
  });

  it("does not mistake prose for a command: a heredoc body, a quoted string or an argument", () => {
    const heredoc = (target) =>
      `git -C ${target} commit -s -q -F - <<'EOF'\nmessage: it blocks a git commit or a new branch,\nand git switch -c too\nEOF`;
    // The body names git commit, but the real command commits in a linked worktree.
    assert.equal(run({ tool_name: "Bash", cwd: main, tool_input: { command: heredoc(linked) } }).status, 0);
    for (const command of [
      'echo "git commit -m x"',
      "echo 'git switch -c topic'",
      'git log --grep="git commit" --oneline',
      "grep -rn 'git checkout -b' docs",
      "cat <<'EOF'\ngit commit -m x\nEOF",
    ]) {
      assert.equal(run({ tool_name: "Bash", cwd: main, tool_input: { command } }).status, 0, command);
    }
  });

  it("still blocks a real commit however it is written", () => {
    for (const command of [
      'git commit -m "feat: x"',
      "git commit -s -F - <<'EOF'\nmessage\nEOF",
      `git -C "${main}" commit -m x`,
      "GIT_AUTHOR_NAME=x git commit -m x",
      "env git commit -m x",
      'git add a && git commit -m "a; b"',
      "(git commit -m x)",
      "true || git switch -c topic",
      "git checkout -b topic\ngit status",
    ]) {
      assert.equal(run({ tool_name: "Bash", cwd: main, tool_input: { command } }).status, 2, command);
    }
  });

  it("allows tools it does not handle, and fails open on bad input", () => {
    assert.equal(run({ tool_name: "Read", cwd: main, tool_input: { file_path: "a" } }).status, 0);
    const r = spawnSync("node", [guard], { input: "not json", encoding: "utf8" });
    assert.equal(r.status, 0);
  });
});
