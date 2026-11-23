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

  it("blocks a commit behind a reserved word, a wrapper, a shell or a substitution", () => {
    for (const command of [
      "if true; then git commit -m x; fi",
      "{ git commit -m x; }",
      "! git commit -m x",
      "time git commit -m x",
      "sudo git commit -m x",
      "nohup git commit -m x",
      "xargs git commit",
      "bash -c 'git commit -m x'",
      'sh -c "git switch -c topic"',
      "bash -lc 'git checkout -b topic'",
      'eval "git commit -m x"',
      'echo "$(git commit -m x)"',
      'echo "`git commit -m x`"',
      "echo $(git commit -m x)",
    ]) {
      assert.equal(run({ tool_name: "Bash", cwd: main, tool_input: { command } }).status, 2, command);
    }
  });

  it("does not let arithmetic hide a command as a here-document", () => {
    // `<<` in $(( )) is a shift. Read as a here-document it would swallow the commit line.
    const command = "echo $((1<<2))\ngit commit -m x\n2";
    assert.equal(run({ tool_name: "Bash", cwd: main, tool_input: { command } }).status, 2);
  });

  it("follows a cd only where it is certain to have moved the shell", () => {
    const at = (command, cwd = main) => run({ tool_name: "Bash", cwd, tool_input: { command } }).status;
    assert.equal(at(`cd ${linked} && git commit -m x`), 0, "cd into a worktree, then commit, joined by &&");
    assert.equal(at(`cd ${linked} && cd . && git commit -m x`), 0, "a chain of &&");
    assert.equal(at(`cd ${main} && git commit -m x`, linked), 2, "cd into the main checkout, then commit");
    // After ; a newline or a pipe the cd may have failed, so the old directory counts too.
    assert.equal(at(`cd ${linked}; git commit -m x`), 2, "after ; both places are checked");
    assert.equal(at(`cd ${linked}\ngit commit -m x`), 2, "after a newline both places are checked");
    assert.equal(at(`cd ${linked} || git commit -m x`), 2, "after || the commit runs only if the cd failed");
    assert.equal(at(`cd ${linked}/missing && git commit -m x`), 2, "a target that does not exist moves nothing");
    assert.equal(at("cd $WT && git commit -m x"), 2, "a path built from a variable is judged from cwd");
    assert.equal(at(`(cd ${linked} && true); git commit -m x`), 2, "a subshell cd does not move later commands");
    assert.equal(at(`bash -c 'cd ${linked} && git commit -m x'`), 2, "a nested cd is not trusted");
  });

  it("resolves a literal VAR=value assignment of the same command line", () => {
    const at = (command, cwd = main) => run({ tool_name: "Bash", cwd, tool_input: { command } }).status;
    assert.equal(at(`W=${linked}; git -C "$W" commit -m x`), 0, "assignment, then git -C $W into a worktree");
    assert.equal(at(`W=${linked} && git -C \${W} commit -m x`), 0, "the braced form");
    assert.equal(at(`export W=${linked}; git -C $W commit -m x`), 0, "export");
    assert.equal(at(`W=${linked}\ngit -C $W commit -m x`), 0, "assignment on its own line");
    assert.equal(at(`W=${main}; git -C "$W" commit -m x`, linked), 2, "a variable that names the main checkout still blocks");
    assert.equal(at(`W=${linked}; W=${main}; git -C $W commit -m x`, linked), 2, "the last assignment wins");
    assert.equal(at('git -C "$W" commit -m x'), 2, "an unset variable is judged from cwd");
    assert.equal(at(`W=$(pwd); git -C $W commit -m x`), 2, "a value built by substitution is not literal");
    assert.equal(at(`W=${linked} | git -C $W commit -m x`), 2, "an assignment in a pipeline does not carry over");
    assert.equal(at(`(W=${linked}); git -C $W commit -m x`), 2, "a subshell assignment does not carry over");
    assert.equal(at(`W=${linked}; cd "$W" && git commit -m x`), 0, "a cd through a resolved variable");
  });

  it("checks every git word of a command, and reads a shell fed a here-document", () => {
    for (const command of [
      "git status && git log | xargs git commit -m x",
      "echo done; sudo -u me git commit -m x",
      "bash <<'EOF'\ngit commit -m x\nEOF",
      "cat <<'EOF' | sh\ngit switch -c topic\nEOF",
      "bash -s <<EOF\ngit checkout -b topic\nEOF",
    ]) {
      assert.equal(run({ tool_name: "Bash", cwd: main, tool_input: { command } }).status, 2, command);
    }
    // A here-document that only feeds text to cat is not a script.
    assert.equal(run({ tool_name: "Bash", cwd: main, tool_input: { command: "cat <<'EOF'\ngit commit -m x\nEOF" } }).status, 0);
  });

  it("reads $(( as arithmetic only when it closes with )), and matches parentheses past quotes", () => {
    for (const command of [
      "echo $((echo a); git commit -m x)",
      "echo $((1<<2)); git commit -m x",
      `echo "$(echo ')'; git commit -m x)"`,
      `echo "$(echo "(" ; git switch -c topic)"`,
    ]) {
      assert.equal(run({ tool_name: "Bash", cwd: main, tool_input: { command } }).status, 2, command);
    }
    assert.equal(run({ tool_name: "Bash", cwd: main, tool_input: { command: "echo $((1<<2)) done" } }).status, 0);
  });

  it("still runs when started through a symlink or a path with a space (else it fails open)", () => {
    const dir = path.join(tmp, "with space");
    fs.mkdirSync(dir);
    const copy = path.join(dir, "guard.mjs");
    fs.copyFileSync(guard, copy);
    const link = path.join(tmp, "guard-link.mjs");
    fs.symlinkSync(copy, link);
    const payload = JSON.stringify({ tool_name: "Edit", cwd: main, tool_input: { file_path: "a.txt" } });
    for (const script of [copy, link]) {
      const r = spawnSync("node", [script], { input: payload, encoding: "utf8" });
      assert.equal(r.status, 2, `${script}: ${r.stderr}`);
    }
  });

  it("does not crash on a payload of the wrong shape (a crash would block every tool call)", () => {
    for (const payload of [
      "", "not json", "null", "[]", "{}", '"str"', "42", "true",
      '{"tool_input":null}', '{"tool_input":"x"}',
      '{"tool_name":"Bash","tool_input":null}',
      '{"tool_name":"Edit","tool_input":{"file_path":42}}',
      '{"tool_name":"Bash","tool_input":{"command":7}}',
      '{"tool_name":"Write","tool_input":{"file_path":{},"content":{},"new_string":[]}}',
      '{"tool_name":"Bash","cwd":42,"tool_input":{"command":"ls"}}',
      '{"tool_name":42,"tool_input":{"command":"git commit"}}',
    ]) {
      const r = spawnSync("node", [guard], { input: payload, encoding: "utf8" });
      assert.equal(r.status, 0, `${payload}: ${r.stderr}`);
    }
  });

  it("allows tools it does not handle, and fails open on bad input", () => {
    assert.equal(run({ tool_name: "Read", cwd: main, tool_input: { file_path: "a" } }).status, 0);
    const r = spawnSync("node", [guard], { input: "not json", encoding: "utf8" });
    assert.equal(r.status, 0);
  });
});
