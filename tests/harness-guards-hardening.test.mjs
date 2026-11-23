// Each case here was found by reading a guard against the way Claude Code calls it, and reproduced
// against the code before the fix: a push wrapped in a subshell or `bash -c`, a `-o -n` push option
// read as a dry run, a refspec or `git -C DIR` the range ignored, a backtick substitution as the git
// subcommand, a quoted secret key, a placeholder word buried in a real value, the other GitHub token
// prefixes, and `NotebookEdit`, which names its file `notebook_path` and carries `new_source`.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { parseGitPushes, simpleCommands, outgoingCommits } = await import(path.join(root, "bin/lib/signed-range.mjs"));

// No inherited GIT_* variable may point a test repository somewhere else.
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_") && key !== "CLAUDE_PROJECT_DIR"));
const hook = (name, payload) =>
  spawnSync("node", [path.join(root, ".claude/hooks", name)], { input: JSON.stringify(payload), encoding: "utf8", env });
const git = (cwd, ...args) => {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", env });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
};

// Secret-shaped text is built here, so this file passes the secret guard it tests.
const NPM = "NPM_" + "TOKEN";
const GH = "GH_" + "TOKEN";
const GITHUB = "GITHUB_" + "TOKEN";
const value = "abcdefghijklmnopqrstuvwxyz123456";
const forty = "a".repeat(36);

describe("push guard: what counts as a push", () => {
  const real = (command) => parseGitPushes(command).filter((p) => !p.dryRun).length;

  it("sees a push in a chain, a pipe, a subshell, a substitution, bash -c, eval and behind a prefix", () => {
    for (const command of [
      "git push",
      "git add a && git push origin x",
      "echo hi | git push",
      "sleep 1 & git push",
      "(git push)",
      "echo $(git push)",
      "bash -c 'git push origin HEAD'",
      "sh -c \"cd x && git push\"",
      "eval 'git push'",
      "env FOO=1 git push",
      "sudo -n git push",
      "/usr/bin/git push",
      "git -c user.name=x -C ../wt push",
    ]) {
      assert.equal(real(command), 1, command);
    }
  });

  it("does not take text that only names a push for one", () => {
    for (const command of ["echo 'git push'", 'grep "git push" notes.md', "git status # git push", "git log"]) {
      assert.equal(real(command), 0, command);
    }
  });

  it("reads a dry run from --dry-run and a short cluster, and not from the value of an option", () => {
    assert.equal(real("git push --dry-run"), 0);
    assert.equal(real("git push -fn origin"), 0);
    assert.equal(real("git push -n"), 0);
    assert.equal(real("git push -o -n origin HEAD"), 1);
    assert.equal(real("git push --push-option -n origin HEAD"), 1);
    assert.equal(real("git push --push-option=-n origin HEAD"), 1);
  });

  it("names the refs a push sends", () => {
    const tips = (command) => parseGitPushes(command)[0].tips;
    assert.deepEqual(tips("git push"), ["HEAD"]);
    assert.deepEqual(tips("git push origin"), ["HEAD"]);
    assert.deepEqual(tips("git push origin HEAD"), ["HEAD"]);
    assert.deepEqual(tips("git push origin HEAD:refs/heads/x"), ["HEAD"]);
    assert.deepEqual(tips("git push origin topic:refs/heads/x"), ["topic"]);
    assert.deepEqual(tips("git push --force origin +topic"), ["topic"]);
    assert.deepEqual(tips("git push --force-with-lease=topic:abc origin topic"), ["topic"]);
    assert.deepEqual(tips("git push origin a b"), ["a", "b"]);
    assert.deepEqual(tips("git push --all"), ["--branches"]);
    assert.deepEqual(tips("git push --mirror origin"), ["--branches"]);
    assert.deepEqual(tips("git push origin refs/heads/*:refs/heads/*"), ["--branches"]);
    assert.deepEqual(tips("git push --repo=origin topic"), ["topic"]);
  });

  it("sends nothing for a deletion or a tag", () => {
    for (const command of ["git push origin :topic", "git push --delete origin topic", "git push -d origin topic", "git push origin tag v1", "git push origin refs/tags/v1"]) {
      assert.deepEqual(parseGitPushes(command)[0].tips, [], command);
    }
  });

  it("follows git -C and a literal cd, and keeps both places for a cd that may have failed", () => {
    assert.deepEqual(parseGitPushes("git -C ../wt push")[0].dirs, ["../wt"]);
    assert.deepEqual(parseGitPushes("git -C a -C b push")[0].dirs, ["a/b"]);
    assert.deepEqual(parseGitPushes("git -C /abs push")[0].dirs, ["/abs"]);
    assert.deepEqual(parseGitPushes("cd ../wt && git push")[0].dirs, ["", "../wt"]);
    assert.deepEqual(parseGitPushes("cd ../wt; git -C sub push")[0].dirs, ["sub", "../wt/sub"]);
    assert.deepEqual(parseGitPushes("cd $X && git push")[0].dirs, [""]);
  });

  it("bounds the recursion on a nested substitution", () => {
    const deep = "$(".repeat(40) + "git push" + ")".repeat(40);
    assert.doesNotThrow(() => simpleCommands(deep));
  });

  it("never lets a refspec become an option of the range query", () => {
    const calls = [];
    const runGit = (args) => {
      calls.push(args);
      if (args[0] === "rev-parse" && args.includes("--verify")) {
        if (args.at(-1).startsWith("-")) throw new Error("an option reached git");
        return "";
      }
      return "";
    };
    outgoingCommits(runGit, ["--output=/tmp/x", "HEAD"]);
    assert.ok(!calls.flat().includes("--output=/tmp/x"));
  });
});

describe("push guard: the range it vets", () => {
  let tmp;
  let repo;
  let other;
  let unsigned;

  before(() => {
    tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "push-hardening-")));
    repo = path.join(tmp, "repo");
    other = path.join(tmp, "other");
    fs.mkdirSync(repo);
    fs.mkdirSync(other);
    git(repo, "init", "-q", "-b", "main");
    const commit = (message) =>
      git(repo, "-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", "commit", "-q", "--allow-empty", "-m", message);
    commit("base");
    git(repo, "update-ref", "refs/remotes/origin/main", "HEAD");
    git(repo, "checkout", "-q", "-b", "topic");
    commit("unsigned work");
    unsigned = git(repo, "rev-parse", "HEAD");
    git(repo, "checkout", "-q", "-b", "idle", "main");
    git(repo, "config", "commit.gpgsign", "true");
    git(other, "init", "-q", "-b", "main");
  });

  after(() => fs.rmSync(tmp, { recursive: true, force: true }));

  // The repository a command names must be the hook's own, a worktree of it, or inside CLAUDE_PROJECT_DIR.
  const push = (command, cwd, projectDir) =>
    spawnSync("node", [path.join(root, ".claude/hooks/guard-git-push-signed.mjs")], {
      input: JSON.stringify({ tool_name: "Bash", cwd, tool_input: { command } }),
      encoding: "utf8",
      env: projectDir ? { ...env, CLAUDE_PROJECT_DIR: projectDir } : env,
    });
  const blocks = (command, cwd = repo, projectDir) => {
    const r = push(command, cwd, projectDir);
    assert.equal(r.status, 2, `${command}: ${r.stderr}`);
    assert.match(r.stderr, new RegExp(unsigned.slice(0, 12)));
  };
  const allows = (command, cwd = repo, projectDir) => assert.equal(push(command, cwd, projectDir).status, 0, command);

  it("vets the branch a refspec names, not only HEAD", () => {
    // HEAD is `idle`, with nothing new: the unsigned commit is on `topic`.
    allows("git push origin HEAD");
    allows("git push");
    blocks("git push origin topic");
    blocks("git push origin topic:refs/heads/x");
    blocks("git push --force origin +topic");
    blocks("git push --all");
  });

  it("vets the repository git -C and a cd name, not the hook's directory", () => {
    git(repo, "checkout", "-q", "topic");
    blocks(`git -C ${repo} push`, other, tmp);
    blocks(`cd ${repo} && git push`, other, tmp);
    blocks(`(cd ${repo}; git push origin HEAD)`, other, tmp);
    allows("git push", other, tmp);
    // Outside the hook's repository, its worktrees and CLAUDE_PROJECT_DIR, it is not vetted at all.
    allows(`git -C ${repo} push`, other);
    git(repo, "checkout", "-q", "idle");
  });

  it("sees a push that is wrapped", () => {
    git(repo, "checkout", "-q", "topic");
    for (const command of ["bash -c 'git push origin HEAD'", "echo $(git push)", "(git push)", "true | git push", "eval 'git push'", "git push -o -n origin HEAD"]) {
      blocks(command);
    }
    git(repo, "checkout", "-q", "idle");
  });

  it("lets a dry run, a deletion, a tag push and quoted text through", () => {
    git(repo, "checkout", "-q", "topic");
    for (const command of ["git push --dry-run", "git push -n origin HEAD", "git push origin :topic", "git push origin tag v1", "echo 'git push'"]) {
      allows(command);
    }
    git(repo, "checkout", "-q", "idle");
  });

  it("still blocks the plain push of an unsigned HEAD, and fails closed on an unreadable payload", () => {
    git(repo, "checkout", "-q", "topic");
    blocks("git push");
    git(repo, "checkout", "-q", "idle");
    const r = spawnSync("node", [path.join(root, ".claude/hooks/guard-git-push-signed.mjs")], { input: "nope", encoding: "utf8", env });
    assert.equal(r.status, 2);
  });
});

describe("worktree guard: a substitution as the command", () => {
  let tmp;
  let main;
  let linked;

  before(() => {
    tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "guard-subst-")));
    main = path.join(tmp, "repo");
    linked = path.join(tmp, "repo.wt", "feature");
    fs.mkdirSync(main);
    git(main, "init", "-q", "-b", "main");
    git(main, "-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "-q", "--allow-empty", "-m", "init");
    git(main, "worktree", "add", "-q", linked, "-b", "feature");
  });

  after(() => fs.rmSync(tmp, { recursive: true, force: true }));

  const bash = (command, cwd) => hook("guard-shared-checkout.mjs", { tool_name: "Bash", cwd, tool_input: { command } });

  it("judges a backtick or $() subcommand and command word as writing in a main checkout", () => {
    for (const command of [
      "git `echo commit` -m x",
      "`echo git` commit -m x",
      "git $(echo commit) -m x",
      "$(echo git) commit -m x",
      "git -C . `printf commit` -m x",
      'git "`echo commit`" -m x',
    ]) {
      assert.equal(bash(command, main).status, 2, command);
    }
  });

  it("allows them in a linked worktree, and a substitution that is only an argument anywhere", () => {
    assert.equal(bash("git `echo commit` -m x", linked).status, 0);
    assert.equal(bash("$(echo git) commit -m x", linked).status, 0);
    assert.equal(bash("git log `git rev-parse HEAD`", main).status, 0);
    assert.equal(bash("git log $(git rev-parse HEAD)", main).status, 0);
    assert.equal(bash("echo `date` && git status", main).status, 0);
  });

  it("still judges what runs inside the substitution", () => {
    assert.equal(bash("echo `git commit -m x`", main).status, 2);
    assert.equal(bash("echo $(git commit -m x)", main).status, 2);
  });

  it("covers NotebookEdit through notebook_path", () => {
    const edit = (cwd, file) => hook("guard-shared-checkout.mjs", { tool_name: "NotebookEdit", cwd, tool_input: { notebook_path: file, new_source: "1" } });
    assert.equal(edit(main, path.join(main, "a.ipynb")).status, 2);
    assert.equal(edit(linked, path.join(main, "a.ipynb")).status, 2);
    assert.equal(edit(linked, path.join(linked, "a.ipynb")).status, 0);
    assert.equal(edit(main, path.join(tmp, "notes.ipynb")).status, 0);
  });
});

describe("protected paths: NotebookEdit", () => {
  const edit = (file) => hook("guard-protected-paths.mjs", { tool_name: "NotebookEdit", cwd: root, tool_input: { notebook_path: path.join(root, file), new_source: "1" } });

  it("blocks a notebook in the vendored design copy and the build output, and allows the repo's own", () => {
    assert.equal(edit("design/source/a.ipynb").status, 2);
    assert.equal(edit("_site/a.ipynb").status, 2);
    assert.equal(edit("docs/a.ipynb").status, 0);
  });
});

describe("secret guard", () => {
  const write = (file, content, tool = "Write") =>
    hook("guard-secret-writes.mjs", { tool_name: tool, cwd: root, tool_input: { file_path: path.join(root, file), content } });
  const blocked = (file, content) => assert.equal(write(file, content).status, 2, content);
  const allowed = (file, content) => assert.equal(write(file, content).status, 0, content);

  it("catches a key that is quoted, in any case, or assigned with =>", () => {
    blocked("a.json", `{"${NPM}": "${value}"}`);
    blocked("a.yml", `'${GH}': '${value}'`);
    blocked("a.toml", `"${NPM}" = "${value}"`);
    blocked("a.rb", `"${NPM}" => "${value}"`);
    blocked("a.yml", `${GH.toLowerCase()}: ${value}`);
    blocked("a.sh", `export ${NPM}="${value}"`);
  });

  it("does not let a marker word inside a real value make it a placeholder", () => {
    blocked("a.sh", `${NPM}=s3cr3tfakeABCDEFGHIJKLMNOP1234`);
    blocked("a.sh", `${NPM}=abcdenv.efghijklmnopqrstuvw1234`);
    blocked("a.sh", `${NPM}=ABCDEFexampleGHIJKLMNOP123456`);
    blocked("a.sh", `${NPM}=ABCDEFGHIJKLMNxxxxOPQRSTUV123456`);
  });

  it("still lets references and marked dummies through", () => {
    allowed("a.yml", `${GITHUB}: \${{ secrets.${GITHUB} }}`);
    allowed("a.js", `${NPM}=process.env.${NPM}`);
    allowed("a.sh", `${NPM}="$${NPM}"`);
    allowed("a.sh", `${NPM}=\${${NPM}}`);
    allowed("a.json", `{"${NPM}": "\${${NPM}}"}`);
    allowed("a.md", `${NPM}=your_token_here_please`);
    allowed("a.md", `${NPM}=example-token-for-docs`);
    allowed("a.md", `${NPM}=<your-npm-token-goes-here>`);
    allowed("a.md", `${NPM}=tok_xxxxxxxxxxxxxxxxxxxx`);
    allowed("a.md", `${NPM}=short`);
  });

  it("blocks every GitHub token prefix and still the others", () => {
    for (const prefix of ["ghp", "gho", "ghu", "ghs", "ghr"]) blocked("a.txt", `t = ${prefix}_${forty}`);
    blocked("a.txt", `t = github_pat_${"A".repeat(30)}`);
    blocked("a.txt", `t = AKIA${"A".repeat(16)}`);
    allowed("a.txt", `t = ghx_${forty}`);
  });

  it("reads a notebook edit: the path and new_source", () => {
    const edit = (file, source) => hook("guard-secret-writes.mjs", { tool_name: "NotebookEdit", cwd: root, tool_input: { notebook_path: path.join(root, file), new_source: source, edit_mode: "replace" } });
    assert.equal(edit("a.ipynb", `token = "ghp_${forty}"`).status, 2);
    assert.equal(edit("a.ipynb", `${NPM} = "${value}"`).status, 2);
    assert.equal(edit(".env", "A=1").status, 2);
    assert.equal(edit("a.ipynb", "print(1)").status, 0);
  });

  it("keeps failing closed on a payload it cannot read", () => {
    for (const stdin of ["", "nope", "null"]) {
      const r = spawnSync("node", [path.join(root, ".claude/hooks/guard-secret-writes.mjs")], { input: stdin, encoding: "utf8", env });
      assert.equal(r.status, 2, JSON.stringify(stdin));
    }
  });
});

describe("settings.json wires the file guards for notebooks", () => {
  const settings = JSON.parse(fs.readFileSync(path.join(root, ".claude/settings.json"), "utf8"));
  const group = settings.hooks.PreToolUse.find((g) => g.hooks.some((h) => h.command.includes("guard-secret-writes.mjs")));

  it("matches NotebookEdit beside Write and Edit, and the guards there block on failure", () => {
    assert.equal(group.matcher, "Write|Edit|NotebookEdit");
    for (const name of ["guard-protected-paths.mjs", "guard-secret-writes.mjs", "guard-shared-checkout.mjs"]) {
      const entry = group.hooks.find((h) => h.command.includes(name));
      assert.equal(entry?.onFailure, "block", name);
    }
  });

  it("sets onFailure: block on every entry of the worktree guard, as the starter and README tell adopters", () => {
    const entries = settings.hooks.PreToolUse.flatMap((g) => g.hooks).filter((h) => h.command.includes("guard-shared-checkout.mjs"));
    assert.equal(entries.length, 2);
    assert.ok(entries.every((h) => h.onFailure === "block"));
  });
});
