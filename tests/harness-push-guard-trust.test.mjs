// Three more findings of the security review of the push guard, each reproduced against the previous code:
//  1. the guard ran git in a directory taken from the command text, and a repository's own config can
//     run programs (gpg.program on a signature check, core.fsmonitor, core.hooksPath);
//  2. a tag refspec source was skipped even when its destination is a branch;
//  3. long options were matched exactly, but git accepts a unique prefix (`--mir`, `--dry`, `--al`).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { parseGitPushes, gitRunner } = await import(path.join(root, "bin/lib/signed-range.mjs"));

const baseEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_") && key !== "CLAUDE_PROJECT_DIR"));
const git = (cwd, ...args) => {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", env: baseEnv });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
};
const commitOf = (cwd, message, parent) => {
  const text = [
    "tree 4b825dc642cb6eb9a060e54bf8d69288fbee4904",
    ...(parent ? [`parent ${parent}`] : []),
    "author t <t@example.com> 1700000000 +0000",
    "committer t <t@example.com> 1700000000 +0000",
    // A signature the repository's own gpg.program would be asked to check.
    "gpgsig -----BEGIN PGP SIGNATURE-----",
    " ",
    " AAAA",
    " -----END PGP SIGNATURE-----",
    "",
    message,
    "",
  ].join("\n");
  const r = spawnSync("git", ["hash-object", "-t", "commit", "-w", "--stdin"], { cwd, input: text, encoding: "utf8", env: baseEnv });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
};

describe("push guard: directories taken from the command text", () => {
  let tmp;
  let trusted;
  let evil;
  let marker;
  let fsmonitorMarker;

  before(() => {
    tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "push-trust-")));
    trusted = path.join(tmp, "project", "trusted");
    evil = path.join(tmp, "elsewhere", "evil");
    marker = path.join(tmp, "program-ran");
    fsmonitorMarker = path.join(tmp, "fsmonitor-ran");
    fs.mkdirSync(trusted, { recursive: true });
    fs.mkdirSync(evil, { recursive: true });
    git(trusted, "init", "-q", "-b", "main");
    git(trusted, "-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", "commit", "-q", "--allow-empty", "-m", "base");

    // A repository whose config names programs, and whose outgoing commit carries a signature header.
    const program = path.join(tmp, "program.sh");
    fs.writeFileSync(program, `#!/bin/sh\necho ran >> '${marker}'\nexit 1\n`, { mode: 0o755 });
    const monitor = path.join(tmp, "monitor.sh");
    fs.writeFileSync(monitor, `#!/bin/sh\necho ran >> '${fsmonitorMarker}'\nexit 1\n`, { mode: 0o755 });
    git(evil, "init", "-q", "-b", "main");
    const base = commitOf(evil, "base");
    git(evil, "update-ref", "refs/heads/main", base);
    git(evil, "update-ref", "refs/remotes/origin/main", base);
    const work = commitOf(evil, "work", base);
    git(evil, "checkout", "-q", "-b", "topic");
    git(evil, "update-ref", "refs/heads/topic", work);
    for (const [key, value] of [["commit.gpgsign", "true"], ["gpg.program", program], ["gpg.ssh.program", program], ["gpg.x509.program", program], ["core.fsmonitor", monitor]]) {
      git(evil, "config", key, value);
    }
  });

  after(() => fs.rmSync(tmp, { recursive: true, force: true }));

  const guard = (command, env = {}) =>
    spawnSync("node", [path.join(root, ".claude/hooks/guard-git-push-signed.mjs")], {
      input: JSON.stringify({ tool_name: "Bash", cwd: trusted, tool_input: { command } }),
      encoding: "utf8",
      env: { ...baseEnv, ...env },
    });
  const ran = () => fs.existsSync(marker) || fs.existsSync(fsmonitorMarker);

  it("does not run a program from a repository outside the project, and says it cannot vet it", () => {
    for (const command of [`git -C ${evil} push origin topic`, `cd ${evil} && git push origin topic`, `(cd ${evil}; git push)`]) {
      fs.rmSync(marker, { force: true });
      const r = guard(command);
      assert.equal(ran(), false, `${command}: a program named by the repository's config ran`);
      assert.equal(r.status, 0, command);
    }
  });

  it("vets a repository inside CLAUDE_PROJECT_DIR, still without running its programs", () => {
    fs.rmSync(marker, { force: true });
    const r = guard(`git -C ${evil} push origin topic`, { CLAUDE_PROJECT_DIR: path.dirname(evil) });
    assert.equal(ran(), false, "a program named by the repository's config ran");
    assert.equal(r.status, 2, r.stderr);
  });

  it("vets the project's own repository and its worktrees", () => {
    const linked = path.join(tmp, "project", "linked");
    git(trusted, "worktree", "add", "-q", linked, "-b", "side");
    const work = commitOf(trusted, "work", git(trusted, "rev-parse", "main"));
    git(linked, "update-ref", "refs/heads/side", work);
    git(linked, "config", "commit.gpgsign", "true");
    git(trusted, "update-ref", "refs/remotes/origin/main", git(trusted, "rev-parse", "main"));
    const r = guard(`git -C ${linked} push origin side`);
    assert.equal(r.status, 2, r.stderr);
  });

  it("runs every git call with the repository's program settings overridden", () => {
    const run = gitRunner(evil);
    const value = (key) => run(["config", "--get", key]).trim();
    assert.equal(value("core.fsmonitor"), "false");
    assert.equal(value("core.hooksPath"), "/dev/null");
    for (const key of ["gpg.program", "gpg.openpgp.program", "gpg.ssh.program", "gpg.x509.program"]) {
      assert.ok(!value(key).includes("program.sh"), `${key} is still the repository's`);
    }
  });
});

describe("push guard: a tag refspec", () => {
  const tips = (command) => parseGitPushes(command)[0].tips;

  it("is skipped only when it sends a tag", () => {
    for (const command of ["git push origin tag v1", "git push origin refs/tags/v1", "git push origin refs/tags/v1:refs/tags/v2", "git push origin +refs/tags/v1"]) {
      assert.deepEqual(tips(command), [], command);
    }
  });

  it("keeps the source when the destination is a branch or a bare name, which git matches against the remote's refs", () => {
    assert.deepEqual(tips("git push origin refs/tags/v1:refs/heads/y"), ["refs/tags/v1"]);
    assert.deepEqual(tips("git push origin +refs/tags/v1:refs/heads/y"), ["refs/tags/v1"]);
    assert.deepEqual(tips("git push origin refs/tags/v1:main"), ["refs/tags/v1"]);
    assert.deepEqual(tips("git push origin refs/tags/v1:v2"), ["refs/tags/v1"]);
    assert.deepEqual(tips("git push origin v1:refs/heads/y"), ["v1"]);
  });

  it("keeps a tag-looking source that is a revision expression, even for a tag destination", () => {
    assert.deepEqual(tips("git push origin refs/tags/v1~1:refs/tags/x"), ["refs/tags/v1~1"]);
    assert.deepEqual(tips("git push origin refs/tags/v1^{commit}:refs/tags/x"), ["refs/tags/v1^{commit}"]);
    assert.deepEqual(tips("git push origin refs/tags/v1^:refs/tags/x"), ["refs/tags/v1^"]);
    assert.deepEqual(tips("git push origin refs/tags/v1@{0}:refs/tags/x"), ["refs/tags/v1@{0}"]);
  });
});

describe("push guard: a tag source with a branch destination is vetted as its commit", () => {
  let tmp;
  let repo;
  let unsigned;

  before(() => {
    tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "push-tag-")));
    repo = path.join(tmp, "repo");
    fs.mkdirSync(repo);
    git(repo, "init", "-q", "-b", "main");
    const commit = (m) => git(repo, "-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", "commit", "-q", "--allow-empty", "-m", m);
    commit("base");
    git(repo, "update-ref", "refs/remotes/origin/main", "HEAD");
    git(repo, "checkout", "-q", "-b", "topic");
    commit("unsigned");
    unsigned = git(repo, "rev-parse", "HEAD");
    git(repo, "-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "tag.gpgsign=false", "tag", "-a", "-m", "release", "v1");
    git(repo, "checkout", "-q", "-b", "idle", "main");
    git(repo, "config", "commit.gpgsign", "true");
  });

  after(() => fs.rmSync(tmp, { recursive: true, force: true }));

  const push = (command) =>
    spawnSync("node", [path.join(root, ".claude/hooks/guard-git-push-signed.mjs")], {
      input: JSON.stringify({ tool_name: "Bash", cwd: repo, tool_input: { command } }),
      encoding: "utf8",
      env: baseEnv,
    });

  it("blocks an annotated tag sent to a branch, and lets the tag itself go", () => {
    const blocked = push("git push origin refs/tags/v1:refs/heads/y");
    assert.equal(blocked.status, 2, blocked.stderr);
    assert.match(blocked.stderr, new RegExp(unsigned.slice(0, 12)));
    assert.equal(push("git push origin refs/tags/v1:main").status, 2);
    assert.equal(push("git push origin refs/tags/v1^{commit}:refs/tags/x").status, 2);
    assert.equal(push("git push origin refs/tags/v1:refs/tags/x").status, 0);
    assert.equal(push("git push origin tag v1").status, 0);
    assert.equal(push("git push origin refs/tags/v1").status, 0);
  });
});

describe("push guard: long options are matched the way git does", () => {
  const one = (command) => parseGitPushes(command)[0];

  it("reads a unique prefix", () => {
    assert.deepEqual(one("git push --mir origin").tips, ["--branches"]);
    assert.deepEqual(one("git push --al").tips, ["--branches"]);
    assert.equal(one("git push --dry origin").dryRun, true);
    assert.equal(one("git push --dry-r").dryRun, true);
    assert.deepEqual(one("git push --dele origin topic").tips, []);
  });

  it("takes the value of a prefix that needs one, and not the next flag for a value-less one", () => {
    assert.deepEqual(one("git push --recu check origin topic").tips, ["topic"]);
    assert.deepEqual(one("git push --push-o -n origin HEAD").tips, ["HEAD"]);
    assert.equal(one("git push --push-o -n origin HEAD").dryRun, false);
  });

  it("reads a negation", () => {
    assert.equal(one("git push --no-dry-run").dryRun, false);
    assert.equal(one("git push --dry-run --no-dry-run").dryRun, false);
    assert.equal(one("git push --no-dry origin").dryRun, false);
    assert.deepEqual(one("git push --no-mirror origin topic").tips, ["topic"]);
  });

  it("vets every branch when an option is unknown or ambiguous, and never calls it a dry run", () => {
    for (const command of ["git push --bogus origin topic", "git push --d origin topic", "git push --rec origin topic", "git push --n origin topic", "git push -Z origin topic"]) {
      const push = one(command);
      assert.ok(push.tips.includes("--branches"), command);
      assert.equal(push.dryRun, false, command);
    }
    assert.deepEqual(one("git push --bogus origin topic").tips, ["topic", "--branches"]);
  });

  it("keeps the exact forms working", () => {
    assert.deepEqual(one("git push --force-with-lease=topic:abc origin topic").tips, ["topic"]);
    assert.deepEqual(one("git push --force-with-lease origin topic").tips, ["topic"]);
    assert.deepEqual(one("git push --signed=if-asked origin topic").tips, ["topic"]);
    assert.deepEqual(one("git push --repo=origin topic").tips, ["topic"]);
    assert.deepEqual(one("git push --repo origin topic").tips, ["topic"]);
    assert.deepEqual(one("git push -u origin topic").tips, ["topic"]);
    assert.deepEqual(one("git push -fu origin topic").tips, ["topic"]);
  });
});
