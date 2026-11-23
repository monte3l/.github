import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Run through bash, the way the starter's settings entry does: the bootstrap and the
// sync write the file without an executable bit.
const hook = path.join(root, "blueprint/files/require-signoff.sh");

function run(command, { path: pathEnv } = {}) {
  const env = pathEnv === undefined ? process.env : { ...process.env, PATH: pathEnv };
  return spawnSync("bash", [hook], { input: JSON.stringify({ tool_name: "Bash", tool_input: { command } }), encoding: "utf8", env });
}

describe("require-signoff.sh", () => {
  it("blocks a commit without -s", () => {
    const r = run('git commit -m "fix: x"');
    assert.equal(r.status, 2);
    assert.match(r.stderr, /DCO sign-off/);
  });

  it("blocks behind git global options and env prefixes", () => {
    for (const cmd of ["git -C ../other commit -m x", "git -c user.name=t commit -m x", "env FOO=1 git commit -m x", "FOO=1 git commit -m x"]) {
      assert.equal(run(cmd).status, 2, cmd);
    }
  });

  it("blocks the commit in a chain, and ignores -s only in another command", () => {
    assert.equal(run("git add -A && git commit -m x").status, 2);
    assert.equal(run("git commit -m x && git log -s").status, 2);
  });

  it("allows -s, --signoff and a short-flag cluster with s", () => {
    for (const cmd of ["git commit -s -m x", "git commit --signoff -m x", "git commit -sm x", "git commit -a -s -m x"]) {
      assert.equal(run(cmd).status, 0, cmd);
    }
  });

  it("does not count words inside a commit message or a heredoc", () => {
    assert.equal(run('git commit -m "write the -s flag"').status, 2);
    assert.equal(run("git commit -s -m \"$(cat <<'EOF'\nfix: x\n\ngit commit -m y\nEOF\n)\"").status, 0);
  });

  it("allows commands that are not a commit", () => {
    for (const cmd of ["git status", "git log --oneline", "echo git commit", "git commit-tree HEAD"]) {
      assert.equal(run(cmd).status, 0, cmd);
    }
  });

  it("still blocks without jq, reading the command with perl", () => {
    // A PATH of one directory that links only the tools the hook calls, so jq is not on it.
    const bin = fs.mkdtempSync(path.join(os.tmpdir(), "signoff-bin-"));
    try {
      for (const tool of ["bash", "perl", "cat", "tr"]) {
        const found = spawnSync("sh", ["-c", `command -v ${tool}`], { encoding: "utf8" }).stdout.trim();
        assert.ok(found.startsWith("/"), `${tool} is needed for this test`);
        fs.symlinkSync(found, path.join(bin, tool));
      }
      const r = run('git commit -m "fix: x"', { path: bin });
      assert.equal(r.status, 2, r.stderr);
      assert.equal(run("git status", { path: bin }).status, 0);
    } finally {
      fs.rmSync(bin, { recursive: true, force: true });
    }
  });
});
